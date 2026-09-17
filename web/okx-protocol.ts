import { WalletFlowError } from "./connection.js";
import type { TelegramEnvironment } from "./routing.js";
import { walletRedirect } from "./wallet-trust.js";
import { assertClaimTransaction } from "../src/claims/protocol.js";
export const OKX_CHAIN="eip155:11155111";
export const OKX_MIN_VERSION="6.88.0";
// OKX Connect 1.9.1 public ConnectWalletType.OKX_APP_COMMON. This selects
// the SDK's Web3 app connector, not the exchange download URL or a TON connector.
export function okxConnectParams(environment:TelegramEnvironment) {
  return {namespaces:{eip155:{chains:[OKX_CHAIN],defaultChain:"11155111"}},
    sessionConfig:{connectWalletType:130,openUniversalUrl:false,redirect:walletRedirect(environment,"okx")}};
}
export function assertOkxLink(value:unknown,requireTopic=true):string {
  if(typeof value!=="string"||value.length>2048)throw new WalletFlowError("WALLET_CONNECT_CANCELLED");
  let url:URL;try{url=new URL(value);}catch{throw new WalletFlowError("WALLET_CONNECT_CANCELLED");}
  if(url.origin!=="https://web3.okx.com"||url.pathname!=="/ul/connect"||url.username||url.password||url.hash||
    [...url.searchParams.keys()].some(k=>k!=="topic")||url.searchParams.getAll("topic").length>1||
    (requireTopic&&!url.searchParams.has("topic"))||(url.searchParams.has("topic")&&!/^[A-Za-z0-9_-]{8,256}$/.test(url.searchParams.get("topic")??"")))throw new WalletFlowError("WALLET_CONNECT_CANCELLED");
  return value; // Never reconstruct or re-encode the SDK's URL.
}
export function matchesOkxTopic(uri:string,topic:unknown):topic is string {
  if(typeof topic!=="string"||!/^[A-Za-z0-9_-]{8,250}$/.test(topic))return false;
  const value=new URL(assertOkxLink(uri)).searchParams.get("topic")!;
  return value.startsWith(topic)&&/^[a-f0-9]{6}$/i.test(value.slice(topic.length));
}
export type OkxSnapshot={topic:string;accounts:string[];chainId:number};
export function okxSnapshot(value:unknown,expectedTopic:string):OkxSnapshot {
  const s=value as {topic?:unknown;namespaces?:{eip155?:{chains?:unknown;accounts?:unknown;defaultChain?:unknown;methods?:unknown}}};
  if(!s||typeof s.topic!=="string"||s.topic!==expectedTopic||!expectedTopic)throw new WalletFlowError("WALLET_REQUIRED");
  const ns=s.namespaces?.eip155;
  if(!ns||!Array.isArray(ns.chains)||!ns.chains.length||ns.chains.some(c=>c!==OKX_CHAIN)||
    (ns.defaultChain!==undefined&&ns.defaultChain!=="11155111"&&ns.defaultChain!==OKX_CHAIN))throw new WalletFlowError("NETWORK_MISMATCH");
  if(!Array.isArray(ns.methods)||!ns.methods.includes("personal_sign")||!Array.isArray(ns.accounts)||!ns.accounts.length)throw new WalletFlowError("WALLET_REQUIRED");
  const accounts=ns.accounts.map((account:unknown)=>{
    if(typeof account!=="string"||!/^eip155:11155111:0x[0-9a-fA-F]{40}$/.test(account))throw new WalletFlowError("NETWORK_MISMATCH");
    return account.split(":")[2]!;
  });
  return {topic:s.topic,accounts,chainId:11155111};
}
export function assertOkxRequest(args:{method:string;params:unknown[]},owner?:string) {
  if(args.method==="eth_sendTransaction"){
    if(!owner||args.params.length!==1)throw new WalletFlowError("WALLET_REQUIRED");
    assertClaimTransaction(args.params[0],owner);return;
  }
  // Transport only. The parent/backend still own consent, challenge and trading gates.
  if(!["personal_sign","eth_signTypedData_v4","wallet_switchEthereumChain"].includes(args.method))throw new WalletFlowError("WALLET_REQUIRED");
  if(args.method==="wallet_switchEthereumChain"&&(args.params[0] as {chainId?:unknown})?.chainId!=="0xaa36a7")throw new WalletFlowError("NETWORK_MISMATCH");
}
/** Separate frame-local storage per attempt; never reads/deletes Telegram or Reown storage. */
export class OkxMemoryStorage implements Storage {
  private data=new Map<string,string>();
  get length(){return this.data.size;}
  clear(){this.data.clear();}
  key(index:number){return [...this.data.keys()][index]??null;}
  getItem(key:string){return this.data.get(key)??null;}
  setItem(key:string,value:string){this.data.set(String(key),String(value));}
  removeItem(key:string){this.data.delete(key);}
}
