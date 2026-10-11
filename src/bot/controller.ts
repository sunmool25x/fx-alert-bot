import type { Config } from "../config/index.js";
import { shortId, type Store, type User, type Flow, type Language } from "../database/store.js";
import { errors, t } from "../i18n/messages.js";
import { glossary, glossaryText } from "../i18n/glossary.js";
import { AppError, errorCode, safeLog } from "../utils/errors.js";
import type { MarketData } from "../sera/service.js";
import type { Token } from "../sera/schemas.js";
import { quoteView, rateView, depthView, type View, type Button } from "./view.js";
import { AlertController } from "./alerts.js";
import { ScannerController } from "./scanner.js";
import { WalletController } from "./wallet.js";
import { walletText,walletFailure } from "../i18n/wallet.js";
import type { ChainReads } from "../wallet/chain.js";
import { NluContext } from "../nlu/context.js";
import { nluText } from "../i18n/nlu.js";
import type { ActionOrigin } from "../nlu/parser.js";
import { normalizedAmount,positiveThreshold } from "../alerts/source.js";
import { track } from "../analytics/actions.js";
import { entryFromOrigin,triggerFromOrigin,type EventContext,type Period,type ParsedIntent } from "../analytics/types.js";
import { statsView,type StatsScreen } from "../analytics/views.js";
import {continuationLog} from '../wallet/continuation-log.js';
import {validateAmount,toRawUnits} from '../sera/precision.js';

export interface Input { userId: string; text?: string; callback?: string; updateId?:number }
export interface Output { origin?:ActionOrigin;analytics?:EventContext;reply(view: View): Promise<void> }
type MarketOperation = "rate" | "quote" | "swap" | "liquidity";
const preferred = ["USDC", "EURC", "XSGD", "JPYC", "USDT", "XIDR"];
export class BotController {
  private running = new Set<string>();
  private alertUi: AlertController;
  private scannerUi: ScannerController;
  private walletUi:WalletController;
  private nlu:NluContext;
  constructor(private store: Store, private market: MarketData,
    private config: Config, private now = Date.now, chain?:ChainReads,reconcile?:(user:string)=>Promise<void>) {
    this.walletUi=new WalletController(store,config,chain,reconcile);
    this.alertUi = new AlertController(store, market, config, now);
    this.scannerUi = new ScannerController(store, market, config, this.alertUi, now);
    this.nlu=new NluContext(now);
  }
  async handle(input: Input, out: Output): Promise<void> {
    const start=input.text?.match(/^\/start(?:@\w+)?(?:\s+(.*))?$/i);
    const source = start?.[1]?.trim();
    const user = await this.store.touch(input.userId, source);
    const original=out;
    out={analytics:{key:input.updateId===undefined?undefined:"update:"+input.updateId},origin:input.callback?"button":input.text?.startsWith("/")?"command":"natural_language",reply:async view=>{
      const refresh=view.buttons?.flat().find(b=>b.data.startsWith("refresh:"));
      if(refresh&&this.config.wallet.ready)view.buttons!.push([{text:walletText[user.language].continue,data:"trade:"+refresh.data.slice(8)}]);
      await original.reply(view);
    }};
    if (this.running.has(user.id)) { await out.reply({ text: t(user.language).busy }); return; }
    this.running.add(user.id);
    try {
      if(/^\/stats(?:@\w+)?(?:\s|$)/i.test(input.text??"")||input.callback?.startsWith("stats:")){
        await this.stats(user,input,out);return;
      }
      this.store.analytics.attribution(user.id,source,!!start);
      this.store.analytics.activity(user.id,{...out.analytics,origin:out.origin});
      if (input.callback) {this.nlu.clear(user.id);await this.callback(user, input.callback, out);}
      else await this.text(user, input.text ?? "", out);
    } catch (e) {
      if(out.origin==="natural_language"&&!["INVALID_AMOUNT","AMOUNT_BELOW_MIN","INVALID_THRESHOLD"].includes(errorCode(e)))this.nlu.clear(user.id);
      safeLog("bot_request_failed", e);
      await out.reply({ text: errors[user.language][errorCode(e)] ?? walletFailure(user.language,errorCode(e)) });
    } finally { this.store.analytics.reconcile();this.running.delete(user.id); }
  }
  private async stats(user:User,input:Input,out:Output){
    if(!this.config.analytics.admins.includes(user.id)){await out.reply({text:user.language==="ko"?"이 명령을 사용할 수 없어요.":"This command is unavailable."});return;}
    const match=input.callback?.match(/^stats:(1|7|30):(summary|sources|funnel)$/);
    if(input.callback&&!match){await out.reply({text:t(user.language).expired});return;}
    try{await out.reply(statsView(this.store.analytics.report(Number(match?.[1]??7) as Period,this.config.analytics.excluded),user.language,(match?.[2]??"summary") as StatsScreen));}
    catch{await out.reply({text:user.language==="ko"?"지금은 통계를 불러올 수 없어요. 잠시 후 다시 확인해 주세요.":"Stats are temporarily unavailable. Please try again later."});}
  }
  private async tokenByAddress(address: string): Promise<Token> {
    const token = (await this.market.tokens()).find(t => t.address.toLowerCase() === address.toLowerCase());
    if (!token) throw new AppError("UNKNOWN_TOKEN"); return token;
  }
  private async symbol(symbol: string): Promise<Token> {
    const tokens = (await this.market.tokens()).filter(t => t.symbol.toUpperCase() === symbol.toUpperCase());
    if (tokens.length !== 1) throw new AppError("UNKNOWN_TOKEN");
    return tokens[0]!;
  }
  private async begin(user: User, operation: MarketOperation, out: Output): Promise<void> {
    const tokens = await this.market.tokens();
    tokens.sort((a, b) => {
      const ai = preferred.indexOf(a.symbol), bi = preferred.indexOf(b.symbol);
      return (ai < 0 ? 100 : ai) - (bi < 0 ? 100 : bi) || a.symbol.localeCompare(b.symbol);
    });
    const flow: Flow = { operation, stage: "from", nonce: shortId(), choices: tokens.map(t => t.address),inputOrigin:out.origin };
    await this.store.saveFlow(user.id, flow);
    await this.picker(user, flow, 0, out);
  }
  private async picker(user: User, flow: Flow, page: number, out: Output): Promise<void> {
    const tokens = await this.market.tokens();
    const pageCount = Math.ceil(flow.choices.length / 8);
    if (!Number.isInteger(page) || page < 0 || page >= pageCount) throw new AppError("INVALID_PAIR");
    const buttons: Button[][] = [];
    for (let i = page * 8; i < Math.min((page + 1) * 8, flow.choices.length); i++) {
      const token = tokens.find(t => t.address === flow.choices[i]);
      if (token) buttons.push([{ text: token.symbol + " (" + token.currency + ")", data: "pick:" + flow.nonce + ":" + i }]);
    }
    const m = t(user.language); const navigation: Button[] = [];
    if (page > 0) navigation.push({ text: m.previous, data: "page:" + flow.nonce + ":" + (page - 1) });
    if (page + 1 < pageCount) navigation.push({ text: m.next, data: "page:" + flow.nonce + ":" + (page + 1) });
    if (navigation.length) buttons.push(navigation);
    await out.reply({ text: (flow.stage === "from" ? m.from : m.to) + "\n" + (page + 1) + "/" + pageCount, buttons });
  }
  private async finish(user: User, operation: MarketOperation, from: Token, to: Token, amount: string | undefined, out: Output,origin?:string): Promise<void> {
    if (from.address === to.address) throw new AppError("INVALID_PAIR");
    const m = t(user.language);
    if (operation === "rate") {
      track(this.store,user,out,"rate_requested");
      const rate = await this.market.reference(from, to);
      const view = rateView(from, to, rate, user.language, this.config.referenceMaxAgeSeconds, this.now());
      view.text += "\n\n" + (this.config.network === "sepolia" ? m.testnet : m.mainnet);
      await out.reply(view);
    } else if (operation === "liquidity") {
      const view = depthView(from, to, await this.market.depth(from, to), user.language);
      view.text += "\n\n" + (this.config.network === "sepolia" ? m.testnet : m.mainnet);
      await out.reply(view);
    } else {
      if (!amount || !/^\d+(\.\d+)?$/.test(amount) || amount.length > 100) throw new AppError("INVALID_AMOUNT");
      const entry=entryFromOrigin(origin??(operation==="swap"?"swap":"quote"));
      const context={entry,parentId:triggerFromOrigin(origin??"")??out.analytics?.parentId};
      track(this.store,user,out,"quote_requested",context);
      continuationLog('QUOTE_PARSED','OK',user.id);
      // Save the validated request separately from its short-lived external quote.
      // Same amount/minimum/precision limits already enforced by MarketService.
      if(!validateAmount(amount,from.decimals).ok)throw new AppError('INVALID_AMOUNT');
      const input=toRawUnits(amount,from.decimals);if(input<=0n||input>=2n**256n)throw new AppError('INVALID_AMOUNT');
      if(from.min_trade_amount_raw&&input<BigInt(from.min_trade_amount_raw))throw new AppError('AMOUNT_BELOW_MIN');
      const id = await this.store.saveIntent(user.id, from.address, to.address, amount,origin??(operation==="swap"?"swap":"quote"),out.origin);
      if(context.parentId)this.store.analytics.bestEffort(()=>this.store.inputOrigins.quoteParent(id,context.parentId!));
      let card;
      try{card=await this.market.quote(from,to,amount);}
      catch(e){
        if(errorCode(e)!=='NO_LIQUIDITY'||!this.config.wallet.ready)throw e;
          await out.reply({text:(user.language==='ko'?'현재 시장 Quote를 받을 수 없어요. 요청 금액은 그대로 저장했습니다. 지갑 연결 후 같은 조건으로 새 Quote를 조회할 수 있습니다. 금융 승인이나 거래는 진행되지 않았습니다.':'The market quote is unavailable. Your exact request is saved; after wallet verification, check a fresh quote for the same terms. No financial authorization or trade occurred.')+'\n\n'+amount+' '+from.symbol+' → '+to.symbol,buttons:[[{text:walletText[user.language].continue,data:'trade:'+id}]]});
          await this.store.clearFlow(user.id);
          return;
      }
      await out.reply(quoteView(card, user.language, id, this.config.network));
      track(this.store,user,out,"fresh_quote_viewed",{...context,entityId:id});
    }
    await this.store.clearFlow(user.id);
    this.nlu.remember(user.id,{base:from.symbol.toUpperCase(),quote:to.symbol.toUpperCase()});
  }
  private async markets(user: User, page: number, filter: string, out: Output): Promise<void> {
    if (!/^[A-Za-z0-9_-]{0,20}$/.test(filter)) throw new AppError("INVALID_PAIR");
    let markets = await this.market.markets();
    if (filter) markets = markets.filter(m => m.base_symbol.toUpperCase() === filter.toUpperCase() || m.quote_symbol.toUpperCase() === filter.toUpperCase());
    const pages = Math.max(1, Math.ceil(markets.length / 10));
    if (!Number.isInteger(page) || page < 0 || page >= pages) throw new AppError("INVALID_PAIR");
    const m = t(user.language);
    const buttons: Button[] = [];
    if (page > 0) buttons.push({ text: m.previous, data: "markets:" + (page - 1) + ":" + filter });
    if (page + 1 < pages) buttons.push({ text: m.next, data: "markets:" + (page + 1) + ":" + filter });
    await out.reply({ text: [
      m.marketTitle + " (" + markets.length + ")", (page + 1) + "/" + pages,
      ...markets.slice(page * 10, page * 10 + 10).map(m => m.base_symbol + " / " + m.quote_symbol),
      ...(!markets.length ? [m.marketEmpty] : []),
      "", glossary[user.language].pair,
      "", m.marketNote, this.config.network === "sepolia" ? m.testnet : m.mainnet,
      "/markets USDC · /quote 100 USDC XSGD",
    ].join("\n"), buttons: buttons.length ? [buttons] : undefined });
    track(this.store,user,out,"markets_viewed");
  }
  private async text(user: User, text: string, out: Output): Promise<void> {
    const m = t(user.language);
    if (text.length > 512) { await out.reply({ text: m.unknown }); return; }
    const command = text.match(/^\/([a-z]+)(?:@\w+)?(?:\s+(.*))?$/i);
    if (command) {
      this.nlu.clear(user.id);
      const name = command[1]!.toLowerCase();
      const args = (command[2] ?? "").trim().split(/[\s/]+/).filter(Boolean);
      if (["start", "cancel"].includes(name)) {
        await this.store.clearFlow(user.id);
        let welcome: string = m.welcome;
        if (this.config.network === "mainnet") welcome = welcome.replace(m.testnet, m.mainnet);
        await out.reply({ text: name === "start" ? welcome : m.cancelled,
          buttons: name === "start" ? [
            [{ text: m.conditionsButton, data: "nav:alpha" }, { text: m.alertButton, data: "nav:alert" }],
            [{ text: m.rateButton, data: "nav:rate" }, { text: m.marketsButton, data: "nav:markets" }],
            [{ text: m.walletButton, data: "nav:wallet" }, { text: m.helpButton, data: "nav:help" }],
          ] : undefined }); if(name==="start")track(this.store,user,out,"bot_started");return;
      }
      if (name === "help") { await out.reply({ text: m.help, buttons: [[
        { text: m.termsButton, data: "nav:terms" }, { text: m.privacyButton, data: "nav:privacy" },
      ]] }); return; }
      if (name === "language") {
        await out.reply({ text: m.languages, buttons: [[{ text: "한국어", data: "language:ko" }, { text: "English", data: "language:en" }]] }); return;
      }
      if (name === "forget") {
        const nonce = shortId();
        await this.store.saveFlow(user.id, { operation: "forget", stage: "from", nonce, choices: [] });
        await out.reply({ text: m.forget, buttons: [[{ text: m.forgetConfirm, data: "forget:" + nonce }]] }); return;
      }
      if (name === "markets") {
        await this.store.clearFlow(user.id);
        if (args.length > 1) throw new AppError("INVALID_PAIR");
        await this.markets(user, 0, args[0] ?? "", out); return;
      }
      if(name==="wallet"){await this.walletUi.show(user,out);return;}
      if(name==="balance"){await this.walletUi.balance(user,out);return;}
      if(name==="swap"&&!this.config.wallet.enabled){const w=walletText[user.language];await out.reply({text:w.disabled,buttons:this.config.wallet.ready?[[{text:w.prepare,data:"wallet:quote"}]]:undefined});return;}
      if (["order", "orders"].includes(name)) { await out.reply({ text: m.readOnly }); return; }
      if (["alert", "alerts", "deletealert"].includes(name)) { await this.alertUi.command(user, name, out); return; }
      if (name === "alpha") { await this.store.clearFlow(user.id); await this.scannerUi.show(user, 0, out); return; }
      if (["rate", "quote", "swap", "liquidity"].includes(name)) {
        const operation = name as MarketOperation;
        await this.store.clearFlow(user.id);
        if (!args.length) { await this.begin(user, operation, out); return; }
        const amountOperation=operation==="quote"||operation==="swap";
        if ((amountOperation && args.length !== 3) || (!amountOperation && args.length !== 2)) throw new AppError("INVALID_PAIR");
        const offset = amountOperation ? 1 : 0;
        const from = await this.symbol(args[offset]!); const to = await this.symbol(args[offset + 1]!);
        await this.finish(user, operation, from, to, amountOperation ? args[0] : undefined, out); return;
      }
      await out.reply({ text: m.unknown }); return;
    }
    const flow = await this.store.flow(user.id);
    if (!flow) { await this.natural(user,text,out); return; }
    if (flow.operation === "alert") { await this.alertUi.text(user, flow, text, out); return; }
    if (flow.stage !== "amount" || (flow.operation !== "quote"&&flow.operation!=="swap")) { await out.reply({ text: m.expired }); return; }
    await this.finish(user, flow.operation, await this.tokenByAddress(flow.from!), await this.tokenByAddress(flow.to!), text.trim(), {...out,origin:flow.inputOrigin??"command"});
  }
  private async natural(user:User,text:string,out:Output):Promise<void> {
    const registry={tokens:await this.market.tokens(),markets:await this.market.markets()};
    const intent=this.nlu.resolve(user.id,text,registry),m=nluText[user.language];
    const intentNames:Record<string,ParsedIntent>={RATE_QUERY:"rate_query",QUOTE_QUERY:"quote_query",CREATE_RATE_ALERT:"rate_alert",CREATE_MOVEMENT_ALERT:"movement_alert",SHOW_ALPHA:"alpha",SHOW_ALERTS:"show_alerts",PREPARE_SWAP:"swap_prepare"};
    track(this.store,user,out,"natural_language_used",{intent:intentNames[intent.type]??"unknown",parsed:intent.type!=="HELP_OR_UNKNOWN"});
    if(intent.type==="HELP_OR_UNKNOWN"){
      const message=intent.issue==="unsupported_token"||intent.issue==="unsupported_pair"?m.unsupported:
        intent.issue==="invalid_number"?m.number:intent.issue==="invalid_window"?m.window:m.unknown;
      await out.reply({text:message});return;
    }
    if(intent.type==="SHOW_ALPHA"||intent.type==="SHOW_ALERTS"){
      this.nlu.clear(user.id);
      if(intent.type==="SHOW_ALPHA")await this.scannerUi.show(user,0,out);
      else await this.alertUi.command(user,"alerts",out);
      return;
    }
    const alert=intent.type==="CREATE_RATE_ALERT"||intent.type==="CREATE_MOVEMENT_ALERT";
    if(intent.threshold)positiveThreshold(intent.threshold);
    if(!intent.pair){this.nlu.wait(user.id,intent);await out.reply({text:alert?m.alertPair:m.pair});return;}
    const from=await this.symbol(intent.pair.base),to=await this.symbol(intent.pair.quote);
    if(intent.type!=="RATE_QUERY"&&!intent.amount){
      this.nlu.wait(user.id,intent);await out.reply({text:from.symbol+" → "+to.symbol+"\n"+(alert?m.alertAmount:m.amount)});return;
    }
    // Reuse decimal/minimum validation even with a mocked or alternative MarketData adapter.
    if(intent.amount)normalizedAmount(intent.amount,from);
    if(alert){
      await this.alertUi.naturalDraft(user,from,to,intent,out);
      this.nlu.remember(user.id,intent.pair);return;
    }
    await this.finish(user,intent.type==="RATE_QUERY"?"rate":intent.type==="PREPARE_SWAP"?"swap":"quote",from,to,intent.amount,out);
  }
  private async callback(user: User, data: string, out: Output): Promise<void> {
    const m = t(user.language);
    if (data.length > 64) { await out.reply({ text: m.expired }); return; }
    // Presentation shortcuts call existing command handlers; no financial actions are added.
    if (["nav:alpha", "nav:alert", "nav:rate", "nav:markets", "nav:wallet", "nav:help"].includes(data)) {
      await this.text(user, "/" + data.slice(4), out); return;
    }
    if (data === "nav:terms" || data === "nav:privacy") {
      await out.reply({ text: data === "nav:terms" ? glossaryText(user.language) : m.privacy,
        buttons: [[{ text: m.helpButton, data: "nav:help" }]] }); return;
    }
    if(data==="wallet:disconnect"){await this.walletUi.disconnect(user,out);return;}
    if(data==="wallet:balance"){await this.walletUi.balance(user,out);return;}
    if(data==="wallet:status"){await this.walletUi.status(user,out);return;}
    if(data==="wallet:quote"){await this.begin(user,"swap",out);return;}
    if(data.startsWith("trade:")){await this.walletUi.open(user,data.slice(6),out);return;}
    if (data.startsWith("a:")) { await this.alertUi.callback(user, data, out); return; }
    if (data.startsWith("s:")) { await this.scannerUi.callback(user, data, out); return; }
    const parts = data.split(":");
    if (parts[0] === "language" && parts.length === 2 && ["ko", "en"].includes(parts[1]!)) {
      const language = parts[1] as Language; await this.store.language(user.id, language);
      await out.reply({ text: t(language).selected }); return;
    }
    if (parts[0] === "markets" && parts.length === 3 && /^\d+$/.test(parts[1]!)) {
      await this.markets(user, Number(parts[1]), parts[2]!, out); return;
    }
    if (parts[0] === "refresh" && parts.length === 2) {
      const intent = await this.store.intent(parts[1]!, user.id);
      if (!intent) { await out.reply({ text: m.expired }); return; }
      let parentId=triggerFromOrigin(intent.origin)??intent.id;
      this.store.analytics.bestEffort(()=>{parentId=this.store.inputOrigins.parent(intent.id)??parentId;});
      const context={...out.analytics,entry:entryFromOrigin(intent.origin),parentId};
      track(this.store,user,out,"fresh_quote_clicked",context);
      await this.finish(user, "quote", await this.tokenByAddress(intent.from_token), await this.tokenByAddress(intent.to_token), intent.amount, {...out,analytics:context},intent.origin); return;
    }
    const flow = await this.store.flow(user.id);
    if (!flow || parts[1] !== flow.nonce) { await out.reply({ text: m.expired }); return; }
    if (parts[0] === "forget" && parts.length === 2 && flow.operation === "forget") {
      await this.store.forget(user.id); await out.reply({ text: m.forgotten }); return;
    }
    if (flow.operation === "forget" || flow.operation === "alert") { await out.reply({ text: m.expired }); return; }
    if (parts[0] === "page" && parts.length === 3 && /^\d+$/.test(parts[2]!) && flow.stage !== "amount") {
      await this.picker(user, flow, Number(parts[2]), out); return;
    }
    if (parts[0] !== "pick" || parts.length !== 3 || !/^\d+$/.test(parts[2]!) || flow.stage === "amount") {
      await out.reply({ text: m.expired }); return;
    }
    const address = flow.choices[Number(parts[2])];
    if (!address) { await out.reply({ text: m.expired }); return; }
    const token = await this.tokenByAddress(address);
    if (flow.stage === "from") {
      flow.from = token.address; flow.stage = "to"; flow.nonce = shortId();
      flow.choices = flow.choices.filter(a => a !== token.address);
      await this.store.saveFlow(user.id, flow); await this.picker(user, flow, 0, out); return;
    }
    flow.to = token.address;
    if (flow.operation === "quote"||flow.operation==="swap") {
      flow.stage = "amount"; flow.nonce = shortId(); await this.store.saveFlow(user.id, flow);
      const from = await this.tokenByAddress(flow.from!);
      await out.reply({ text: from.symbol + " → " + token.symbol + "\n" + m.amount +
        (from.min_trade_amount ? "\n" + (user.language === "ko" ? "최소 금액: " : "Minimum: ") + from.min_trade_amount + " " + from.symbol : "") }); return;
    }
    await this.finish(user, flow.operation, await this.tokenByAddress(flow.from!), token, undefined, out);
  }
}
