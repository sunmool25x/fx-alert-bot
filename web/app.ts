import {tradeAuthorizationPanel} from './trade-panel.js';
import { claimPanel } from "./claim-panel.js";
import { reviewClock } from "./review-clock.js";
import { renderTradeReview } from "./trade-review.js";
import type { AuthorizationReview } from "../src/trades/review.js";
import type { ConnectedProvider } from "./connector-types.js";
import { walletText,stateText,walletFailure,walletError,safeWalletCode } from "../src/i18n/wallet.js";
import { fromRawUnits } from "../src/sera/precision.js";
import { connectAndVerify,prepareOwnership,switchSepolia,checkWallet,WalletFlowError } from "./connection.js";
import { walletPicker } from "./wallet-picker.js";
import { bindWalletTheme,type TelegramTheme } from "./wallet-theme.js";
import { renderWalletCard,walletCardText } from "./wallet-card.js";
import { assertWalletOrigin } from "./wallet-trust.js";
import {continuationRoute,TradeContinuation,quoteRequestButton,quoteFailure,isPermitContext,requestContinuationReview,type TradeContext} from './quote-continuation.js';
import {miniAppSession} from './miniapp-session.js';
import{permitPanel}from'./permit-panel.js';
declare global {interface Window {Telegram?:{WebApp:TelegramTheme&{initData:string;platform?:string;ready():void;expand():void;openLink?(url:string):void}}}}
type Review={id:string;version:string;state:string;expiresAt:number;text:string;explorer?:string;details?:AuthorizationReview;financialAuthorizationAvailable?:false;reviewState?:'REVIEW_READY'|'COST_REVIEW_BLOCKED'};
// Keep this route across ownership renewal and reload; no amount is stored locally.
const route=continuationRoute(location.hash,location.search);
let continuation:TradeContinuation|undefined,restoreContext:()=>Promise<void>=async()=>{},quoteAction:ReturnType<typeof quoteRequestButton>|undefined;
let language:"ko"|"en"="ko",csrf="",wallet="",provider:ConnectedProvider|undefined;
let active:Review|undefined,financialPanel:ReturnType<typeof tradeAuthorizationPanel>|undefined;let financialHandoff=()=>{};
let accountEpoch=0,busy=false,allowExecution=false;
let authenticatedUser="",walletPending=false;
let ownershipLock:object|undefined;
let funding:ReturnType<typeof claimPanel>|undefined;
let permitAcceptance:ReturnType<typeof permitPanel>|undefined;
let paintWallet:(address?:string)=>void=()=>{};
const el=(id:string)=>document.getElementById(id)!;
const message=(text:string)=>{el("message").textContent=text;};
const m=()=>walletText[language];
async function api(path:string,body:unknown={}) {
  try {
    const response=await fetch("/api/"+path,{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json","x-csrf-token":csrf},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
    const result=await response.json();if(!response.ok)throw new WalletFlowError(safeWalletCode(result.code));return result;
  }catch(e){throw e instanceof WalletFlowError?e:new WalletFlowError("UNAVAILABLE");}
}
const diagnostic=(code:string)=>{void api("diagnostic",{code,...(code==="WALLET_CONNECT_STARTED"?{eventId:crypto.randomUUID()}: {})}).catch(()=>undefined);};
function failure(e:unknown){const code=e instanceof WalletFlowError?safeWalletCode(e.code):"UNAVAILABLE";console.warn("wallet_ui",code);message(walletError(language,code));}
function clearAuthorization() {financialPanel=undefined;}
function button(parent:string,text:string,action:()=>Promise<void>,primary=false) {
  const b=document.createElement("button");b.textContent=text;if(primary)b.className="primary";
  b.onclick=async()=>{if(busy)return;busy=true;b.disabled=true;try{await action();}catch(e){failure(e);}finally{busy=false;b.disabled=b.dataset.done==="true";}};el(parent).append(b);return b;
}
function showReview(review:Review) {
  active=review;el("review").replaceChildren();const text=document.createElement("pre");
  // Preserve the server's exact terms while reflecting local submitting/expiry transitions.
  const sections=review.text.split("\n\n");sections[1]=review.state==='PREVIEW'&&review.reviewState?review.reviewState+' · '+m().preview:stateText(language,review.state);text.textContent=sections.join("\n\n");
  if(review.details)renderTradeReview(el("review"),review.details,sections[1]!);else el("review").append(text);
  if(review.state==="PREVIEW"){const clock=document.createElement("p");clock.id="quote-clock";clock.setAttribute("role","status");clock.textContent=reviewClock(review.expiresAt,Date.now(),language).text;el("review").prepend(clock);}
  if(review.financialAuthorizationAvailable===false){el('review').tabIndex=-1;el('review').scrollIntoView({block:'start'});el('review').focus({preventScroll:true});return;}
  if(review.state!=="REVIEW"&&review.state!=="SIGNATURES")return;
  if(!allowExecution)return; // No financial consent UI in read-only preparation.
  showSigning();
  button("review",m().cancel,async()=>{await api("cancel",{id:review.id});clearAuthorization();active=undefined;el("review").replaceChildren();await status();});
}
async function walletMatches(checkQuote=true) {
  try {checkWallet(provider,wallet,checkQuote?active?.expiresAt:undefined);}
  catch(e){clearAuthorization();if(e instanceof WalletFlowError&&e.code==="NETWORK_MISMATCH")await invalidate();throw e;}
}
function showSigning(){if(!active||!allowExecution)return;financialPanel=tradeAuthorizationPanel({root:el('review'),review:active,language,api,provider:()=>provider,wallet:()=>wallet,epoch:()=>accountEpoch,enabled:()=>allowExecution,handoff:()=>financialHandoff(),pending:v=>{walletPending=v;},submitted:showReview,error:failure});}
async function invalidate() {
  permitAcceptance?.invalidate();
  funding?.invalidate();accountEpoch++;wallet="";clearAuthorization();active=undefined;el("review").replaceChildren();
  paintWallet();el("balances").replaceChildren();
  await api("disconnect");message(m().disconnected);
}
async function status(reconcile=false) {
  const result=await api(reconcile?"refresh":"state");
  if(result.userId!==authenticatedUser)throw new WalletFlowError("AUTH_INVALID");
  if(wallet&&result.wallet!==wallet){permitAcceptance?.invalidate();accountEpoch++;wallet="";clearAuthorization();active=undefined;el("review").replaceChildren();}
  paintWallet(result.wallet??undefined);
  if(wallet&&funding)await funding.refresh();
  if(wallet&&permitAcceptance)await permitAcceptance.refresh();
  el("history").replaceChildren();for(const trade of result.trades as Review[]) {
    const p=document.createElement("pre");p.textContent=trade.text;el("history").append(p);
    if(trade.explorer&&/^https:\/\/sepolia\.etherscan\.io\/tx\/0x[0-9a-fA-F]{64}$/.test(trade.explorer)){const a=document.createElement("a");a.href=trade.explorer;a.textContent=m().explorer;a.target="_blank";a.rel="noopener noreferrer";el("history").append(a);}
    if(allowExecution&&!active&&['REVIEW','SIGNATURES'].includes(trade.state)){active=trade;showReview(trade);}
    if(active?.id===trade.id&&!["REVIEW","SIGNATURES"].includes(trade.state)){clearAuthorization();showReview(trade);}
  }
}
async function main() {
  const tg=window.Telegram?.WebApp;bindWalletTheme(tg);if(!tg?.initData){message(m().openTelegram);return;}
  tg.ready();tg.expand();const c=await miniAppSession(api,tg.initData,value=>{csrf=value;},{getItem:key=>sessionStorage.getItem(key),setItem:(key,value)=>sessionStorage.setItem(key,value),removeItem:key=>sessionStorage.removeItem(key)});language=c.language;allowExecution=c.enabled;authenticatedUser=c.userId;
  assertWalletOrigin(c.origin,location.origin);
  const copy=walletCardText[language];document.documentElement.lang=language;el("safety").textContent=m().safety;
  el("identity").textContent=copy.authenticated;el("identity-summary").textContent=copy.details;el("identity-id").textContent="Telegram ID: "+authenticatedUser;el("identity-details").hidden=false;
  el("mode").textContent=allowExecution?m().enabled:copy.readOnly;message("");diagnostic("MINI_APP_OPENED");
  if(!c.ready){renderWalletCard(el("account"),language,undefined,{connect:()=>{},balance:()=>{},disconnect:()=>{},ready:false});message(m().setup);return;}
  const walletAction=(action:()=>Promise<void>)=>{if(busy)return;busy=true;void action().catch(failure).finally(()=>{busy=false;});};
  const readBalances=async()=>{const rows=await api("balance");el("balances").textContent=copy.balance+"\n"+rows.map((r:{symbol:string;amountRaw:string;decimals:number})=>r.symbol+": "+fromRawUnits(r.amountRaw,r.decimals)).join("\n");el("balances").scrollIntoView({block:"nearest"});};
  const picker=walletPicker({root:el("connection"),language,telegram:tg,projectId:c.projectId,origin:c.origin,message,error:failure,
    started:()=>diagnostic("WALLET_CONNECT_STARTED"),
    invalidate:async()=>{
      // A cancelled wallet may never answer its ownership request. Release only
      // that UI lock; its late completion cannot unlock a newer operation.
      if(ownershipLock){ownershipLock=undefined;busy=false;}
      provider=undefined;await invalidate();message("");
    },pending:value=>{walletPending=value;},
    connected:p=>{
      provider=p;diagnostic("WALLET_CONNECTED");
      p.on("accountsChanged",()=>{if(provider!==p)return;accountEpoch++;if(wallet){void invalidate().catch(failure);picker.lost();}});
      p.on("chainChanged",()=>{if(provider!==p)return;accountEpoch++;if(wallet){void invalidate().catch(failure);picker.lost();}});
      p.on("disconnect",()=>{if(provider===p){void invalidate().catch(failure);picker.lost();}});
    },
    prepare:(p,guard)=>prepareOwnership(p,api,()=>accountEpoch,guard),
    verify:async(p,guard,onRequest,prepared)=>{
      if(busy)throw new WalletFlowError("WALLET_REQUIRED");const lock={};ownershipLock=lock;busy=true;
      try{guard();wallet=await (prepared?prepared.verify(onRequest):connectAndVerify(p,api,()=>accountEpoch,()=>{},guard,onRequest));message("");await status();await restoreContext();void api('context/diagnostic',{stage:'OWNERSHIP_RETURN',hasRoute:!!continuation?.context}).catch(()=>undefined);}
      finally{if(ownershipLock===lock){ownershipLock=undefined;busy=false;}}
    },balance:()=>walletAction(readBalances),
  });
  paintWallet=address=>renderWalletCard(el("account"),language,address,{connect:()=>walletAction(()=>picker.choose()),balance:()=>walletAction(readBalances),disconnect:()=>walletAction(async()=>{picker.cancel();provider=undefined;await invalidate();await status();})});
  const contextHeading=document.createElement('h2');el('actions').prepend(contextHeading);
  contextHeading.textContent=language==='ko'?'새 Quote · Sepolia 테스트넷':'Fresh quote · Sepolia testnet';
  continuation=new TradeContinuation({api,id:route.id??c.startParam,invalid:route.invalid,changed:(context?:TradeContext)=>{
    quoteAction?.setContext(!!context);contextHeading.textContent=context?context.amount+' test '+context.fromSymbol+' → '+context.toSymbol+' · Sepolia':language==='ko'?'새 Quote · Sepolia 테스트넷':'Fresh quote · Sepolia testnet';
    if(quoteAction)quoteAction.button.textContent=c.permitOnly&&isPermitContext(context)?(language==='ko'?'새 Quote · Permit 전용 검토':'Fresh quote · Permit-only review'):allowExecution?(language==='ko'?'새 Quote · 세 단계 교환 승인':'Fresh quote · three-step swap approval'):(language==='ko'?'내 지갑의 최신 Quote 확인':'Check my fresh wallet quote');
    if(context){const url=new URL(location.href);url.searchParams.set('intent',context.id);history.replaceState(null,'',url.pathname+url.search+url.hash);}
  }});
  quoteAction=quoteRequestButton({root:el('actions'),language,hasContext:()=>continuation?.valid()??false,renew:()=>picker.renewOwnership(),request:async()=>{
    if(allowExecution&&active&&['REVIEW','SIGNATURES','EXPIRED'].includes(active.state))await api('cancel',{id:active.id});
    clearAuthorization();permitAcceptance?.invalidate();active=undefined;el('review').replaceChildren();
    assertWalletOrigin(c.origin,location.origin);
    return requestContinuationReview({continuation:continuation!,permitOnly:c.permitOnly,fullTrade:allowExecution,prepareTrade:async id=>{const epoch=accountEpoch;const review=await api('prepare',{intent:id});checkWallet(provider,wallet);if(epoch!==accountEpoch)throw new WalletFlowError('WALLET_REQUIRED');showReview(review);},preparePermit:permitAcceptance?.prepare,guard:()=>checkWallet(provider,wallet),epoch:()=>accountEpoch,showReadOnly:showReview});
  }});
  quoteAction.setContext(false);
  restoreContext=async()=>{try{await continuation!.restore();quoteAction!.status.textContent='';}catch(e){quoteAction!.status.textContent=quoteFailure(language,e);quoteAction!.setContext(false);}};
  void api('context/diagnostic',{stage:'BOOTSTRAP',hasRoute:!!(route.id??c.startParam)}).catch(()=>undefined);await restoreContext();
  const restart=document.createElement('a');restart.href='https://t.me/world_fx_alert_bot';restart.textContent=language==='ko'?'Telegram으로 돌아가기':'Return to Telegram';restart.target='_blank';restart.rel='noopener noreferrer';el('actions').append(restart);
  button('actions',language==='ko'?'이 거래 요청 취소':'Cancel this request',async()=>{await continuation!.cancel();permitAcceptance?.invalidate();clearAuthorization();active=undefined;el('review').replaceChildren();quoteAction!.status.textContent=quoteFailure(language,new WalletFlowError('TRADE_STATE'));});
  financialHandoff=()=>picker.requestHandoff();
  if(c.permitOnly){
    const section=document.createElement('section');section.id='permit-acceptance';el('actions').after(section);
    permitAcceptance=permitPanel({root:section,language,api,provider:()=>provider,wallet:()=>wallet,epoch:()=>accountEpoch,
      guard:()=>assertWalletOrigin(c.origin,location.origin),handoff:()=>picker.requestHandoff(),pending:v=>{walletPending=v;},freshQuote:()=>quoteAction!.request(),renew:()=>picker.renewOwnership()});
    el('mode').textContent=language==='ko'?'Permit 1회 승인 단계 · Intent와 스왑 실행 OFF':'One Permit authorization · Intent and swap execution OFF';
  }
  if(c.claimEnabled){
    const section=document.createElement("section");section.id="funding";(document.getElementById('permit-acceptance')??el("actions")).after(section);
    funding=claimPanel({root:section,language,api,provider:()=>provider,owner:()=>wallet,epoch:()=>accountEpoch,swapsEnabled:()=>allowExecution,
      originGuard:()=>assertWalletOrigin(c.origin,location.origin),ready:()=>picker.claimReady(),handoff:()=>picker.requestHandoff(),pending:v=>{walletPending=v;},preview:value=>{clearAuthorization();showReview(value);},requestQuote:()=>quoteAction!.request()});
  }
  button("wallet-tools",m().switchChain,async()=>{if(!provider?.session)throw new WalletFlowError("WALLET_REQUIRED");await invalidate();await switchSepolia(provider);message(m().network+" · "+m().connect);});
  button("wallet-tools",m().refresh,()=>status(true));await status();
  document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&walletPending){diagnostic("WALLET_RETURNED");}});
  setInterval(()=>{if(continuation?.context&&!continuation.valid()){quoteAction?.setContext(false);quoteAction!.status.textContent=quoteFailure(language,new WalletFlowError('TRADE_STATE'));}if(active?.state==="PREVIEW"){const clock=document.getElementById("quote-clock");if(clock)clock.textContent=reviewClock(active.expiresAt,Date.now(),language).text;}if(active&&Date.now()>=active.expiresAt&&["PREVIEW","REVIEW"].includes(active.state)&&!allowExecution){clearAuthorization();active.state="EXPIRED";showReview(active);quoteAction?.expired();message(reviewClock(active.expiresAt,Date.now(),language).text);}},1000);
}
void main().catch(failure);
