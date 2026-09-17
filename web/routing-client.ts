import { EthereumProvider } from "@walletconnect/ethereum-provider";
import { ConnectionStorage,RoutingAttempt,returnMetadata,clearLegacyWalletRouting,type WalletChoice,type TelegramEnvironment } from "./routing.js";

export type ReownProvider=Awaited<ReturnType<typeof EthereumProvider.init>>;
export async function createRoutedProvider(projectId:string,origin:string,environment:TelegramEnvironment) {
  // AppKit's built-in chooser uses UA-based mobile routing and persistent global
  // linking state. Keep its provider/QR stack, but let Telegram select the handoff.
  clearLegacyWalletRouting(localStorage);
  return EthereumProvider.init({projectId,showQrModal:false,optionalChains:[11155111],
    methods:["personal_sign","eth_signTypedData_v4"],logger:"silent",telemetryEnabled:false,
    optionalMethods:["personal_sign","eth_signTypedData_v4","wallet_switchEthereumChain"],optionalEvents:["accountsChanged","chainChanged"],
    metadata:{name:"FX Alert Bot",description:"Sepolia test wallet · Powered by Sera Protocol",url:origin,icons:[],...returnMetadata(environment)},
    storage:new ConnectionStorage(),customStoragePrefix:"fx-alert-"+crypto.randomUUID(),disableProviderPing:true});
}
export async function retireProvider(provider:ReownProvider) {
  // abortPairingAttempt() in 2.25.0 is explicitly a no-op. Retire the isolated
  // client instead; a late approval remains fenced by RoutingAttempt.
  try{await provider.disconnect();}catch{}
  try{await provider.signer.cleanupPendingPairings({deletePairings:true});}catch{}
  try{await provider.signer.client.core.relayer.transportClose();}catch{}
}
export class RoutedConnection {
  readonly attempt:RoutingAttempt;
  provider?:ReownProvider;
  private expiry?:ReturnType<typeof setTimeout>;
  constructor(choice:WalletChoice,environment:TelegramEnvironment){this.attempt=new RoutingAttempt(choice,environment);}
  async start(factory:()=>Promise<ReownProvider>,onUri:(uri:string)=>void,onExpired:()=>void) {
    const p=await factory();this.provider=p;
    if(!this.attempt.active){await retireProvider(p);this.attempt.assertActive();}
    // Defensive for injected factories / future SDK changes; never reuse any session.
    if(p.session)await p.disconnect();this.attempt.assertActive();
    const display=(uri:string)=>{
      if(!this.attempt.active)return;
      try{this.attempt.receiveUri(uri);onUri(uri);}catch{this.cancel();onExpired();}
    };
    const late=()=>{if(!this.attempt.active)void retireProvider(p);};
    p.on("display_uri",display);p.on("connect",late);
    this.expiry=setTimeout(()=>{this.cancel();onExpired();},240_000);
    try{await p.connect();this.assert();return p;}
    catch(e){this.cancel();throw e;}
    finally{clearTimeout(this.expiry);p.removeListener("display_uri",display);}
  }
  assert(){this.attempt.assertSession(this.provider?.session);}
  cancel(){this.attempt.cancel();clearTimeout(this.expiry);if(this.provider)void retireProvider(this.provider);}
}
