import type { ConnectedProvider } from "./connector-types.js";
import { walletText,stateText,walletFailure,walletError,safeWalletCode } from "../src/i18n/wallet.js";
import { fromRawUnits } from "../src/sera/precision.js";
import { connectAndVerify,prepareOwnership,switchSepolia,checkWallet,WalletFlowError } from "./connection.js";
import { walletPicker } from "./wallet-picker.js";
import { bindWalletTheme,type TelegramTheme } from "./wallet-theme.js";
import { renderWalletCard,walletCardText } from "./wallet-card.js";
declare global {interface Window {Telegram?:{WebApp:TelegramTheme&{initData:string;platform?:string;ready():void;expand():void;openLink?(url:string):void}}}}
type Review={id:string;version:string;state:string;expiresAt:number;text:string;explorer?:string};
let language:"ko"|"en"="ko",csrf="",wallet="",provider:ConnectedProvider|undefined;
let active:Review|undefined,authorized:{intent:unknown;permit:unknown;version:string}|undefined,permitSignature="",intentSignature="";
let accountEpoch=0,busy=false,allowExecution=false;
let authenticatedUser="",walletPending=false;
let ownershipLock:object|undefined;
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
function clearAuthorization() {authorized=undefined;permitSignature="";intentSignature="";}
function button(parent:string,text:string,action:()=>Promise<void>,primary=false) {
  const b=document.createElement("button");b.textContent=text;if(primary)b.className="primary";
  b.onclick=async()=>{if(busy)return;busy=true;b.disabled=true;try{await action();}catch(e){failure(e);}finally{busy=false;b.disabled=b.dataset.done==="true";}};el(parent).append(b);return b;
}
function showReview(review:Review) {
  active=review;el("review").replaceChildren();const text=document.createElement("pre");
  // Preserve the server's exact terms while reflecting local submitting/expiry transitions.
  const sections=review.text.split("\n\n");sections[1]=stateText(language,review.state);text.textContent=sections.join("\n\n");el("review").append(text);
  if(review.state!=="REVIEW"&&review.state!=="SIGNATURES")return;
  if(!allowExecution)return; // No financial consent UI in read-only preparation.
  if(review.state==="REVIEW") {
    const label=document.createElement("label"),check=document.createElement("input");check.type="checkbox";label.append(check,document.createTextNode(m().consent));el("review").append(label);
    const confirm=button("review",m().confirm,async()=>{
      if(!check.checked)return;await walletMatches();
      authorized=await api("confirm",{id:review.id,version:review.version});review.state="SIGNATURES";showReview(review);showSigning();
    },true);confirm.disabled=true;check.onchange=()=>{confirm.disabled=!check.checked;};
  }
  button("review",m().cancel,async()=>{await api("cancel",{id:review.id});clearAuthorization();active=undefined;el("review").replaceChildren();await status();});
}
async function walletMatches(checkQuote=true) {
  try {checkWallet(provider,wallet,checkQuote?active?.expiresAt:undefined);}
  catch(e){clearAuthorization();if(e instanceof WalletFlowError&&e.code==="NETWORK_MISMATCH")await invalidate();throw e;}
}
async function sign(data:unknown,kind:"PERMIT_REJECTED"|"INTENT_REJECTED") {
  await walletMatches();const epoch=accountEpoch;
  walletPending=true;
  try {const value=await provider!.request({method:"eth_signTypedData_v4",params:[wallet,JSON.stringify(data)]});
    if(epoch!==accountEpoch)throw new WalletFlowError("WALLET_REQUIRED");await walletMatches();return String(value);
  } catch(e) {clearAuthorization();if(active){await api("cancel",{id:active.id}).catch(()=>undefined);active.state="CANCELLED";showReview(active);}await status().catch(()=>undefined);diagnostic(kind);throw e instanceof WalletFlowError?e:new WalletFlowError(kind);}
  finally{walletPending=false;}
}
function showSigning() {
  if(!authorized||!active)return;
  const review=active,auth=authorized;
  const permit=button("review",m().permit,async()=>{permitSignature=await sign(auth.permit,"PERMIT_REJECTED");permit.dataset.done="true";intent.disabled=false;});
  const intent=button("review",m().intent,async()=>{intentSignature=await sign(auth.intent,"INTENT_REJECTED");intent.dataset.done="true";submit.disabled=false;});intent.disabled=true;
  const submit=button("review",m().submit,async()=>{
    await walletMatches();const ps=permitSignature,is=intentSignature;clearAuthorization();submit.dataset.done="true";
    review.state="SUBMITTING";showReview(review);message(m().submitting);
    // This POST is deliberately never retried, even if the HTTP response is lost.
    try{showReview(await api("submit",{id:review.id,version:auth.version,signature:is,permitSignature:ps}));}
    catch {review.state="UNKNOWN";showReview(review);message(m().unknown+" [SUBMISSION_UNKNOWN]");await status();}
  },true);submit.disabled=true;
}
async function invalidate() {
  accountEpoch++;wallet="";clearAuthorization();active=undefined;el("review").replaceChildren();
  paintWallet();el("balances").replaceChildren();
  await api("disconnect");message(m().disconnected);
}
async function status(reconcile=false) {
  const result=await api(reconcile?"refresh":"state");
  if(result.userId!==authenticatedUser)throw new WalletFlowError("AUTH_INVALID");
  if(wallet&&result.wallet!==wallet){accountEpoch++;wallet="";clearAuthorization();active=undefined;el("review").replaceChildren();}
  paintWallet(result.wallet??undefined);
  el("history").replaceChildren();for(const trade of result.trades as Review[]) {
    const p=document.createElement("pre");p.textContent=trade.text;el("history").append(p);
    if(trade.explorer&&/^https:\/\/sepolia\.etherscan\.io\/tx\/0x[0-9a-fA-F]{64}$/.test(trade.explorer)){const a=document.createElement("a");a.href=trade.explorer;a.textContent=m().explorer;a.target="_blank";a.rel="noopener noreferrer";el("history").append(a);}
    if(active?.id===trade.id&&!["REVIEW","SIGNATURES"].includes(trade.state)){clearAuthorization();showReview(trade);}
  }
}
async function main() {
  const tg=window.Telegram?.WebApp;bindWalletTheme(tg);if(!tg?.initData){message(m().openTelegram);return;}
  tg.ready();tg.expand();const c=await api("auth",{initData:tg.initData});csrf=c.csrf;language=c.language;allowExecution=c.enabled;authenticatedUser=c.userId;
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
      try{guard();wallet=await (prepared?prepared.verify(onRequest):connectAndVerify(p,api,()=>accountEpoch,()=>{},guard,onRequest));message("");await status();}
      finally{if(ownershipLock===lock){ownershipLock=undefined;busy=false;}}
    },balance:()=>walletAction(readBalances),
  });
  paintWallet=address=>renderWalletCard(el("account"),language,address,{connect:()=>walletAction(()=>picker.choose()),balance:()=>walletAction(readBalances),disconnect:()=>walletAction(async()=>{picker.cancel();provider=undefined;await invalidate();await status();})});
  button("wallet-tools",m().switchChain,async()=>{if(!provider?.session)throw new WalletFlowError("WALLET_REQUIRED");await invalidate();await switchSepolia(provider);message(m().network+" · "+m().connect);});
  const params=new URLSearchParams(location.hash.slice(1)),intent=params.get("intent");history.replaceState(null,"",location.pathname);
  if(intent)button("actions",m().prepare,async()=>{
    await walletMatches(false);
    if(active&&["REVIEW","SIGNATURES"].includes(active.state))await api("cancel",{id:active.id}).catch(()=>undefined);
    clearAuthorization();showReview(await api(allowExecution?"prepare":"preview",{intent}));
  },true);
  button("wallet-tools",m().refresh,()=>status(true));await status();
  document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&walletPending){diagnostic("WALLET_RETURNED");}});
  setInterval(()=>{if(active&&Date.now()>=active.expiresAt&&["PREVIEW","REVIEW","SIGNATURES"].includes(active.state)){clearAuthorization();active.state="EXPIRED";showReview(active);message(walletFailure(language,"QUOTE_STALE"));}},1000);
}
void main().catch(failure);
