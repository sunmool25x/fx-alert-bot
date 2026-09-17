import { WalletFlowError } from "./connection.js";
import { assertOkxLink } from "./okx-protocol.js";

// Reown WalletGuide entries inspected 2026-09-17. See WALLET_ROUTING.md.
// These are app links, never RPC endpoints or fallback wallets.
export const walletRoutes = {
  okx: {name:"OKX Wallet",id:"971e689d0a5be527bac79629b4ee9b925e82208e5168b733496a09c0faed0709",
    native:undefined,universal:undefined,hosts:["okx.com","okex.com"]},
  metamask: {name:"MetaMask",id:"c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96",
    native:"metamask://",universal:undefined,hosts:["metamask.io"]},
} as const;
export type WalletChoice=keyof typeof walletRoutes;
export type TelegramEnvironment="ios"|"android"|"desktop";
export function telegramEnvironment(platform?:string):TelegramEnvironment {
  if(platform==="ios")return "ios";
  if(platform==="android"||platform==="android_x")return "android";
  // Unknown/web clients get QR, not an inferred mobile OS or an automatic app launch.
  return "desktop";
}
export const telegramReturn="tg://resolve?domain=world_fx_alert_bot";
export function returnMetadata(environment:TelegramEnvironment) {
  // A phone scanning a desktop QR must not be redirected into a different Telegram session.
  return environment==="desktop"?{}:{redirect:{native:telegramReturn}};
}
export function pairingTopic(uri:string) {
  const match=/^wc:([a-f0-9]{64})@2\?(.+)$/i.exec(uri);
  if(!match)throw new WalletFlowError("WALLET_CONNECT_CANCELLED");
  const params=new URLSearchParams(match[2]);
  if(!/^[a-f0-9]{64}$/i.test(params.get("symKey")??"")||params.get("relay-protocol")!=="irn")throw new WalletFlowError("WALLET_CONNECT_CANCELLED");
  return match[1]!;
}
export function walletLink(choice:WalletChoice,environment:TelegramEnvironment,uri?:string) {
  // OKX URLs must come from its EVM SDK. Never wrap a WC URI in a download URL.
  if(choice==="okx")return assertOkxLink(uri,false);
  const route=walletRoutes[choice],base=route.universal??route.native;
  if(!uri)return base;
  pairingTopic(uri);
  // Same encoding as AppKit 1.8.24 formatNativeUrl; Telegram platform replaces its UA test.
  const encoded=encodeURIComponent(environment==="android"?encodeURIComponent(uri):uri);
  return base+"wc?uri="+encoded;
}
export function openWallet(choice:WalletChoice,environment:TelegramEnvironment,uri:string|undefined,
  opener:{https:(url:string)=>void;native:(url:string)=>void}) {
  if(environment==="desktop")return; // A desktop QR never opens a local/previous wallet app.
  const url=walletLink(choice,environment,uri);
  if(url.startsWith("https://"))opener.https(url);else opener.native(url);
}
export type RoutedSession={topic:string;pairingTopic:string;peer:{metadata:{url:string;name?:string}}};
export class RoutingAttempt {
  private live=true;
  private pairing="";
  private session="";
  constructor(readonly choice:WalletChoice,readonly environment:TelegramEnvironment){}
  get active(){return this.live;}
  cancel(){this.live=false;this.pairing="";this.session="";}
  receiveUri(uri:string){this.assertActive();this.pairing=pairingTopic(uri);}
  assertActive(){if(!this.live)throw new WalletFlowError("WALLET_CONNECT_CANCELLED");}
  assertSession(session:RoutedSession|undefined) {
    this.assertActive();
    if(!session||!this.pairing||session.pairingTopic!==this.pairing||(this.session&&session.topic!==this.session))throw new WalletFlowError("WALLET_REQUIRED");
    let host:string;try{const url=new URL(session.peer.metadata.url);if(url.protocol!=="https:")throw new Error();host=url.hostname.toLowerCase();}catch{throw new WalletFlowError("WALLET_REQUIRED");}
    if(!walletRoutes[this.choice].hosts.some(domain=>host===domain||host.endsWith("."+domain)))throw new WalletFlowError("WALLET_REQUIRED");
    // Peer metadata is a routing consistency check, NOT proof of ownership or wallet authenticity.
    this.session=session.topic;
  }
}

// Each attempt owns a separate, memory-only SignClient/Core store. Nothing is restored
// from a previous MetaMask session, another Mini App, or a cancelled pending approval.
export class ConnectionStorage {
  private readonly values=new Map<string,unknown>();
  async getKeys(){return [...this.values.keys()];}
  async getEntries<T=unknown>():Promise<[string,T][]> {return [...this.values.entries()] as [string,T][];}
  async getItem<T=unknown>(key:string):Promise<T|undefined>{return this.values.get(key) as T|undefined;}
  async setItem<T=unknown>(key:string,value:T){this.values.set(key,value);}
  async removeItem(key:string){this.values.delete(key);}
}
// WalletConnect getDeepLink checks this browser key before its own store. Explicitly
// suppress SDK auto-opening; only a user's selected-wallet button performs a handoff.
export function clearLegacyWalletRouting(storage:Pick<Storage,"removeItem">) {
  for(const key of ["WALLETCONNECT_DEEPLINK_CHOICE","@appkit/recent_wallet","@appkit/recent_wallets","@appkit/wallet_id","@appkit/wallet_name"])storage.removeItem(key);
}
