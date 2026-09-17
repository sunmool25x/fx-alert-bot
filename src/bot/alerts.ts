import type { Config } from "../config/index.js";
import { shortId, type Store, type User, type Flow, type QuoteIntent } from "../database/store.js";
import type { MarketData } from "../sera/service.js";
import type { Token } from "../sera/schemas.js";
import { at } from "../i18n/alerts.js";
import { t } from "../i18n/messages.js";
import { AppError, errorCode } from "../utils/errors.js";
import { normalizedAmount, positiveThreshold, QuoteObservationSource } from "../alerts/source.js";
import { evaluate, baselineTolerance } from "../alerts/evaluate.js";
import { summary, snapshotText, stateText } from "../alerts/views.js";
import type { AlertSpec, AlertType, Observation } from "../alerts/types.js";
import { quoteView, utc, type Button } from "./view.js";
import type { Output } from "./controller.js";
import type { Intent } from "../nlu/parser.js";
import { track } from "../analytics/actions.js";

const types: AlertType[] = ["RATE_ABOVE", "RATE_BELOW", "QUOTE_AVAILABLE", "RATE_MOVEMENT", "MARKET_RECOVERY"];
const preferred = ["USDC", "EURC", "XSGD", "JPYC", "USDT", "XIDR"];
export class AlertController {
  private source: QuoteObservationSource;
  constructor(private store: Store, private market: MarketData, private config: Config, private now = Date.now) {
    this.source = new QuoteObservationSource(market, now);
  }
  private async token(address: string): Promise<Token> {
    const token = (await this.market.tokens()).find(t => t.address.toLowerCase() === address.toLowerCase());
    if (!token) throw new AppError("UNKNOWN_TOKEN");
    return token;
  }
  private async choices(from?: string): Promise<string[]> {
    const tokens = await this.market.tokens(), markets = await this.market.markets();
    const allowed = new Set<string>();
    for (const pair of markets) {
      const a = pair.base_address.toLowerCase(), b = pair.quote_address.toLowerCase();
      if (!from || from.toLowerCase() === b) allowed.add(a);
      if (!from || from.toLowerCase() === a) allowed.add(b);
    }
    return tokens.filter(t => allowed.has(t.address.toLowerCase()) && t.address !== from)
      .sort((a, b) => (preferred.indexOf(a.symbol) < 0 ? 100 : preferred.indexOf(a.symbol)) -
        (preferred.indexOf(b.symbol) < 0 ? 100 : preferred.indexOf(b.symbol)) || a.symbol.localeCompare(b.symbol))
      .map(t => t.address);
  }
  async command(user: User, name: string, out: Output): Promise<void> {
    if (this.config.network !== "sepolia") { await out.reply({ text: at(user.language).disabled }); return; }
    await this.store.clearFlow(user.id);
    if (name !== "alert") { await this.list(user, 0, out); return; }
    const flow: Flow = { operation: "alert", stage: "from", nonce: shortId(), choices: await this.choices(), alert: {}, inputOrigin:out.origin,analyticsEntry:out.analytics?.entry,analyticsParent:out.analytics?.parentId };
    await this.store.saveFlow(user.id, flow);
    await this.picker(user, flow, 0, out);
    track(this.store,user,out,"alert_setup_started");
  }
  /** NLU supplies a draft only; existing spec/preview/save own validation and creation. */
  async naturalDraft(user:User,from:Token,to:Token,intent:Intent,out:Output):Promise<void> {
    if(this.config.network!=="sepolia")throw new AppError("NETWORK_MISMATCH");
    if(!(await this.choices(from.address)).includes(to.address))throw new AppError("UNSUPPORTED_PAIR");
    if(intent.type!=="CREATE_RATE_ALERT"&&intent.type!=="CREATE_MOVEMENT_ALERT")throw new AppError("INVALID_PAIR");
    const flow:Flow={operation:"alert",stage:"confirm",nonce:shortId(),choices:[],from:from.address,to:to.address,inputOrigin:"natural_language",
      alert:{type:intent.type==="CREATE_MOVEMENT_ALERT"?"RATE_MOVEMENT":intent.direction,
        amount:intent.amount,threshold:intent.threshold,window_seconds:intent.windowSeconds}};
    await this.confirmation(user,flow,out);
    track(this.store,user,out,"alert_setup_started");
  }
  async prefill(user: User, intent: QuoteIntent, type: "RATE_MOVEMENT" | "MARKET_RECOVERY" | "QUOTE_AVAILABLE", out: Output): Promise<void> {
    if (this.config.network !== "sepolia" || intent.user_id !== user.id || intent.expires_at <= this.now()) throw new AppError("INVALID_PAIR");
    const choices = await this.choices(intent.from_token);
    if (!choices.includes(intent.to_token)) throw new AppError("UNSUPPORTED_PAIR");
    const flow: Flow = { operation: "alert", stage: "amount", nonce: shortId(), choices: [],
      from: intent.from_token, to: intent.to_token, alert: { type },inputOrigin:out.origin??"button",analyticsEntry:out.analytics?.entry,analyticsParent:out.analytics?.parentId };
    await this.store.saveFlow(user.id, flow);
    track(this.store,user,out,"alert_setup_started");
    // Same amount validation, threshold/window prompts, preview and explicit save as /alert.
    await this.text(user, flow, intent.amount, out);
  }
  private async picker(user: User, flow: Flow, page: number, out: Output): Promise<void> {
    const m = at(user.language), common = t(user.language);
    if (!flow.choices.length) { await out.reply({ text: m.noPairs }); return; }
    const pages = Math.ceil(flow.choices.length / 8);
    if (!Number.isInteger(page) || page < 0 || page >= pages) throw new AppError("INVALID_PAIR");
    const tokens = await this.market.tokens(); const buttons: Button[][] = [];
    for (let i = page * 8; i < Math.min((page + 1) * 8, flow.choices.length); i++) {
      const token = tokens.find(t => t.address === flow.choices[i]);
      if (token) buttons.push([{ text: token.symbol + " (" + token.currency + ")", data: `a:pick:${flow.nonce}:${i}` }]);
    }
    const nav: Button[] = [];
    if (page > 0) nav.push({ text: common.previous, data: `a:page:${flow.nonce}:${page - 1}` });
    if (page + 1 < pages) nav.push({ text: common.next, data: `a:page:${flow.nonce}:${page + 1}` });
    if (nav.length) buttons.push(nav);
    await out.reply({ text: (flow.stage === "from" ? m.pair : m.destination) + `\n${page + 1}/${pages}`, buttons });
  }
  private async spec(flow: Flow): Promise<AlertSpec> {
    const draft = flow.alert!;
    if (!draft?.type || !types.includes(draft.type) || !flow.from || !flow.to || !draft.amount) throw new AppError("INVALID_PAIR");
    const from = await this.token(flow.from), to = await this.token(flow.to);
    if (from.address === to.address) throw new AppError("INVALID_PAIR");
    const threshold = ["RATE_ABOVE", "RATE_BELOW", "RATE_MOVEMENT"].includes(draft.type)
      ? positiveThreshold(draft.threshold ?? "") : null;
    if (draft.type === "RATE_MOVEMENT" && ![3600, 21600, 86400].includes(draft.window_seconds ?? 0)) throw new AppError("INVALID_AMOUNT");
    return { network: "sepolia", from_token: from.address, to_token: to.address, base: from.symbol, quote: to.symbol,
      amount: normalizedAmount(draft.amount, from), type: draft.type, threshold,
      window_seconds: draft.type === "RATE_MOVEMENT" ? draft.window_seconds! : null };
  }
  private async preview(spec: AlertSpec): Promise<Observation | undefined> {
    try {
      const observation = await this.source.sample(spec);
      await this.store.alerts.record(observation);
      return observation;
    } catch (e) {
      if (["INVALID_PAIR", "UNKNOWN_TOKEN", "UNSUPPORTED_PAIR", "INVALID_AMOUNT", "AMOUNT_BELOW_MIN"].includes(errorCode(e))) throw e;
      return undefined;
    }
  }
  private async confirmation(user: User, flow: Flow, out: Output): Promise<void> {
    const spec = await this.spec(flow), m = at(user.language);
    flow.alert!.snapshot = await this.preview(spec);
    let needsHistory = false;
    if (spec.type === "RATE_MOVEMENT") {
      const snapshot = flow.alert!.snapshot;
      const baseline = snapshot ? await this.store.alerts.nearest(snapshot.market_key,
        snapshot.observed_at - spec.window_seconds! * 1000,
        baselineTolerance(spec.window_seconds!, this.config.baselineToleranceMs), snapshot.observed_at) : undefined;
      needsHistory = !baseline;
    }
    flow.stage = "confirm"; flow.nonce = shortId();
    await this.store.saveFlow(user.id, flow);
    await out.reply({ text: [m.preview, summary(spec, user.language), "", snapshotText(flow.alert!.snapshot, user.language),
      "", m.basis, m.edge, `${m.cooldown}: ${this.config.cooldownMs / 1000} ${m.seconds}`,
      ...(needsHistory ? [m.history] : []), m.probe, t(user.language).testnet].join("\n"),
      buttons: [[{ text: m.create, data: `a:save:${flow.nonce}` }, { text: m.cancel, data: `a:cancel:${flow.nonce}` }]] });
  }
  async text(user: User, flow: Flow, input: string, out: Output): Promise<void> {
    const m = at(user.language), draft = flow.alert!;
    if (flow.stage === "amount") {
      const from = await this.token(flow.from!), to = await this.token(flow.to!);
      draft.amount = normalizedAmount(input.trim(), from);
      if (draft.type === "QUOTE_AVAILABLE" || draft.type === "MARKET_RECOVERY") { await this.confirmation(user, flow, out); return; }
      flow.stage = "threshold"; flow.nonce = shortId();
      // Show a current, size-specific rate before asking for a target.
      const snapshot = await this.preview({ network: "sepolia", from_token: from.address, to_token: to.address,
        base: from.symbol, quote: to.symbol, amount: draft.amount, type: draft.type!, threshold: null, window_seconds: null });
      await this.store.saveFlow(user.id, flow);
      await out.reply({ text: [from.symbol + " → " + to.symbol, snapshotText(snapshot, user.language), "", m.basis,
        draft.type === "RATE_MOVEMENT" ? m.movement : m.threshold].join("\n") }); return;
    }
    if (flow.stage === "threshold") {
      draft.threshold = positiveThreshold(input.trim());
      if (draft.type !== "RATE_MOVEMENT") { await this.confirmation(user, flow, out); return; }
      flow.stage = "window"; flow.nonce = shortId(); await this.store.saveFlow(user.id, flow);
      await out.reply({ text: m.window, buttons: [[1, 6, 24].map(h => ({ text: `${h} ${m.hour}`, data: `a:window:${flow.nonce}:${h}` }))] }); return;
    }
    await out.reply({ text: t(user.language).expired });
  }
  async callback(user: User, data: string, out: Output): Promise<void> {
    const m = at(user.language), parts = data.split(":");
    if (this.config.network !== "sepolia") { await out.reply({ text: m.disabled }); return; }
    const action = parts[1], key = parts[2];
    if (action === "list" && parts.length === 3 && /^\d+$/.test(key ?? "")) { await this.list(user, Number(key), out); return; }
    if (["q", "status", "del", "remove"].includes(action ?? "") && (parts.length === 3||(parts.length===4&&action==="q")) && key) {
      const alert = await this.store.alerts.get(key, user.id);
      if (!alert) { await out.reply({ text: m.missing }); return; }
      if (action === "q") {
        if(parts[3]&&!await this.store.alerts.triggerOwned(parts[3],alert.id,user.id))throw new AppError("TRADE_STATE");
        const context={entry:"alert" as const,parentId:parts[3]??alert.id};
        track(this.store,user,out,"fresh_quote_clicked",context);
        track(this.store,user,out,"quote_requested",context);
        // Deliberately bypass the saved observation and trigger payload. Every tap requests a NEW quote.
        const card = await this.market.quote(await this.token(alert.from_token), await this.token(alert.to_token), alert.amount);
        const intent = await this.store.saveIntent(user.id, alert.from_token, alert.to_token, alert.amount,parts[3]?"alert-trigger:"+parts[3]:"alert:"+alert.id,out.origin??"button");
        const view = quoteView(card, user.language, intent, "sepolia");
        view.text += `\n\n${m.refreshed}\n${m.refreshedAt}: ${utc(this.now())}`;
        await out.reply(view);track(this.store,user,out,"fresh_quote_viewed",{...context,entityId:intent}); return;
      }
      if (action === "status") {
        const snapshot = await this.preview(alert);
        await out.reply({ text: [summary(alert, user.language), `${m.status}: ${stateText(alert, user.language)}`,
          snapshotText(snapshot, user.language), m.basis, m.probe].join("\n\n"),
          buttons: [[{ text: m.refresh, data: `a:q:${alert.id}` }, { text: m.remove, data: `a:del:${alert.id}` }]] }); return;
      }
      if (action === "del") {
        await out.reply({ text: summary(alert, user.language) + "\n\n" + m.confirmDelete,
          buttons: [[{ text: m.remove, data: `a:remove:${alert.id}` }, { text: m.cancel, data: "a:list:0" }]] }); return;
      }
      await this.store.alerts.delete(alert.id, user.id);track(this.store,user,out,"alert_deleted",{entityId:alert.id,key:alert.id}); await out.reply({ text: m.deleted }); return;
    }
    const flow = await this.store.flow(user.id);
    if (!flow || flow.operation !== "alert" || flow.nonce !== key) { await out.reply({ text: m.missing }); return; }
    if (action === "cancel" && parts.length === 3) { await this.store.clearFlow(user.id); await out.reply({ text: t(user.language).cancelled }); return; }
    if (action === "page" && parts.length === 4 && ["from", "to"].includes(flow.stage) && /^\d+$/.test(parts[3]!)) {
      await this.picker(user, flow, Number(parts[3]), out); return;
    }
    if (action === "pick" && parts.length === 4 && ["from", "to"].includes(flow.stage) && /^\d+$/.test(parts[3]!)) {
      const address = flow.choices[Number(parts[3])];
      if (!address) { await out.reply({ text: m.missing }); return; }
      if (flow.stage === "from") {
        flow.from = address; flow.stage = "to"; flow.nonce = shortId(); flow.choices = await this.choices(address);
        await this.store.saveFlow(user.id, flow); await this.picker(user, flow, 0, out); return;
      }
      flow.to = address; flow.stage = "type"; flow.nonce = shortId(); await this.store.saveFlow(user.id, flow);
      await out.reply({ text: (await this.token(flow.from!)).symbol + " → " + (await this.token(address)).symbol + "\n" + m.type,
        buttons: types.map((type, index) => [{ text: m[type], data: `a:type:${flow.nonce}:${index}` }]) }); return;
    }
    if (action === "type" && parts.length === 4 && flow.stage === "type" && /^[0-4]$/.test(parts[3]!)) {
      flow.alert!.type = types[Number(parts[3])]!; flow.stage = "amount"; flow.nonce = shortId(); await this.store.saveFlow(user.id, flow);
      const from = await this.token(flow.from!);
      await out.reply({ text: from.symbol + "\n" + m.amount + "\n/cancel" }); return;
    }
    if (action === "window" && parts.length === 4 && flow.stage === "window" && ["1", "6", "24"].includes(parts[3]!)) {
      flow.alert!.window_seconds = Number(parts[3]) * 3600; await this.confirmation(user, flow, out); return;
    }
    if (action === "save" && parts.length === 3 && flow.stage === "confirm") {
      const spec = await this.spec(flow), snapshot = flow.alert!.snapshot;
      let initial;
      if (snapshot && this.now() - snapshot.observed_at <= 30000 && snapshot.observed_at <= this.now() &&
        (!snapshot.expires_at || snapshot.expires_at > this.now())) {
        const baseline = spec.type === "RATE_MOVEMENT" ? await this.store.alerts.nearest(snapshot.market_key,
          snapshot.observed_at - spec.window_seconds! * 1000, baselineTolerance(spec.window_seconds!, this.config.baselineToleranceMs), snapshot.observed_at) : undefined;
        const result = evaluate(spec, snapshot, baseline);
        initial = { condition: result.condition, at: snapshot.observed_at, status: result.status };
      }
      const created=await this.store.alerts.create(user.id, spec, flow.nonce, initial, this.config.alertMaxPerUser, this.config.alertMaxTotal);
      this.store.inputOrigins.set("alert",created.id,flow.inputOrigin??"button");
      this.store.analytics.bestEffort(()=>this.store.inputOrigins.alertEntry(created.id,flow.analyticsEntry??"none",flow.analyticsParent));
      this.store.analytics.alertCreated(user.id,created.id,{origin:flow.inputOrigin??"button",entry:flow.analyticsEntry??"none",parentId:flow.analyticsParent,at:created.created_at});
      await this.store.clearFlow(user.id);
      await out.reply({ text: m.saved + "\n" + m.edge, buttons: [[{ text: m.manage, data: "a:list:0" }]] }); return;
    }
    await out.reply({ text: m.missing });
  }
  private async list(user: User, page: number, out: Output): Promise<void> {
    const m = at(user.language), all = await this.store.alerts.list(user.id), pages = Math.max(1, Math.ceil(all.length / 5));
    if (!Number.isInteger(page) || page < 0 || page >= pages) { await out.reply({ text: m.missing }); return; }
    if (!all.length) { await out.reply({ text: m.empty,
      buttons: [[{ text: m.firstAlert, data: "nav:alert" }]] }); return; }
    const lines = [m.list + ` (${all.length}) · ${page + 1}/${pages}`], buttons: Button[][] = [];
    for (const [index, alert] of all.slice(page * 5, page * 5 + 5).entries()) {
      const number = page * 5 + index + 1;
      const delivery = await this.store.alerts.lastDelivery(alert.id, user.id);
      lines.push(`${number}. ${summary(alert, user.language)}\n${m.status}: ${stateText(alert, user.language)}` +
        (alert.last_evaluated_at ? `\n${m.checked}: ${utc(alert.last_evaluated_at)}` : "") +
        (delivery ? `\n${m.delivery}: ${m.deliveryStates[delivery as keyof typeof m.deliveryStates] ?? delivery}` : ""));
      buttons.push([{ text: `${number}. ${m.latest}`, data: `a:status:${alert.id}` }, { text: `${number}. ${m.remove}`, data: `a:del:${alert.id}` }]);
    }
    const nav: Button[] = [];
    if (page > 0) nav.push({ text: t(user.language).previous, data: `a:list:${page - 1}` });
    if (page + 1 < pages) nav.push({ text: t(user.language).next, data: `a:list:${page + 1}` });
    if (nav.length) buttons.push(nav);
    await out.reply({ text: lines.join("\n\n"), buttons });
  }
}
