import { WalletFlowError } from "./connection.js";
import type { TelegramEnvironment,WalletChoice } from "./routing.js";

const fail=():never=>{throw new WalletFlowError("WALLET_ORIGIN_MISMATCH");};
/** Compare complete origins, including subdomains. Never repair a mismatched identity. */
export function assertWalletOrigin(configured:string,actual:string,chainId=11155111):string {
  if(chainId!==11155111)throw new WalletFlowError("NETWORK_MISMATCH");
  for(const value of [configured,actual]){
    let u:URL;try{u=new URL(value);}catch{return fail();}
    if(u.protocol!=="https:"||u.origin!==value||u.username||u.password||
      !u.hostname.includes(".")||u.hostname.endsWith(".localhost")||u.hostname.endsWith(".local")||
      /^[\d.]+$/.test(u.hostname)||u.hostname.includes(":"))return fail();
  }
  if(configured!==actual)return fail();
  return actual;
}
export function walletRedirect(environment:TelegramEnvironment,connector:"okx"|"reown") {
  if(!["desktop","ios","android"].includes(environment))return fail();
  if(environment==="desktop")return connector==="okx"?"none":undefined;
  // Native Telegram callbacks are explicit return routes, not the dApp's identity.
  return connector==="okx"?"tg://resolve":"tg://resolve?domain=world_fx_alert_bot";
}
export function walletMetadata(configured:string,actual:string,environment:TelegramEnvironment) {
  const origin=assertWalletOrigin(configured,actual),native=walletRedirect(environment,"reown");
  return {name:"FX Alert Bot",description:"Sepolia test wallet · Powered by Sera Protocol",url:origin,
    icons:[origin+"/wallet-icon.png"],...(native?{redirect:{native}}:{})};
}
export function assertWalletMetadata(value:unknown,origin:string,environment:TelegramEnvironment) {
  const expected=walletMetadata(origin,origin,environment),m=value as Partial<ReturnType<typeof walletMetadata>>|undefined;
  if(!m||m.name!==expected.name||m.url!==expected.url||!Array.isArray(m.icons)||
    m.icons.length!==1||m.icons[0]!==expected.icons[0])return fail();
  const redirect=m.redirect as {native?:unknown;universal?:unknown}|undefined;
  if(environment==="desktop"){if(redirect!==undefined)return fail();}
  else if(!redirect||redirect.native!==expected.redirect?.native||Object.keys(redirect).some(k=>k!=="native"))return fail();
}
export function okxDappMetadata(configured:string,actual:string) {
  const origin=assertWalletOrigin(configured,actual);
  // OKX Connect 1.9.1 derives origin and hostname itself. Do not override them.
  return {name:"FX Alert Bot",icon:origin+"/wallet-icon.png"};
}
export function walletTrustCopy(language:"ko"|"en",origin:string,choice?:WalletChoice) {
  assertWalletOrigin(origin,origin);const ko=language==="ko";
  return {title:"TESTNET",rows:[
    ...(choice?[[ko?"지갑":"Wallet",choice==="okx"?"OKX Web3 Wallet":"MetaMask"]]:[]),
    [ko?"네트워크":"Network","Sepolia"],
    [ko?"목적":"Purpose",ko?"테스트넷 지갑 연결 · 소유 확인":"Connect / verify wallet for testnet use"],
    [ko?"예상 서비스 / 도메인":"Expected dApp / domain","FX Alert Bot · "+new URL(origin).host],
  ],note:ko?"지갑 연결은 교환을 승인하지 않습니다.":"Connecting does not authorize a swap."};
}
export function renderWalletTrust(parent:HTMLElement,language:"ko"|"en",origin:string,choice?:WalletChoice) {
  const copy=walletTrustCopy(language,origin,choice),panel=document.createElement("section"),list=document.createElement("dl");
  panel.className="wallet-trust";panel.setAttribute("aria-label",copy.title);
  const badge=document.createElement("strong");badge.textContent=copy.title;panel.append(badge);
  for(const [label,value] of copy.rows){const dt=document.createElement("dt"),dd=document.createElement("dd");dt.textContent=label!;dd.textContent=value!;list.append(dt,dd);}
  const note=document.createElement("p");note.textContent=copy.note;panel.append(list,note);parent.append(panel);
}
