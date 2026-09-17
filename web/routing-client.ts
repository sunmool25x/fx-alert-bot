import { EthereumProvider } from "@walletconnect/ethereum-provider";
import { ConnectionStorage,RoutingAttempt,clearLegacyWalletRouting,type WalletChoice,type TelegramEnvironment } from "./routing.js";
import { walletMetadata } from "./wallet-trust.js";

export type ReownProvider=Awaited<ReturnType<typeof EthereumProvider.init>>;
export async function createRoutedProvider(projectId:string,origin:string,environment:TelegramEnvironment) {
  const metadata=walletMetadata(origin,location.origin,environment);
  // AppKit's built-in chooser uses UA-based mobile routing and persistent global
  // linking state. Keep its provider/QR stack, but let Telegram select the handoff.
  clearLegacyWalletRouting(localStorage);
  return EthereumProvider.init({projectId,showQrModal:false,optionalChains:[11155111],
    methods:["personal_sign","eth_signTypedData_v4"],logger:"silent",telemetryEnabled:false,
    optionalMethods:["personal_sign","eth_signTypedData_v4","wallet_switchEthereumChain"],optionalEvents:["accountsChanged","chainChanged"],
    metadata,
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
  constructor(choice:WalletChoice,environment:TelegramEnvironment,private originGuard=()=>{},private metadataGuard:(session:ReownProvider["session"])=>void=()=>{}){this.attempt=new RoutingAttempt(choice,environment);}
  assertActive(){try{this.originGuard();this.attempt.assertActive();}catch(e){this.cancel();throw e;}}
  async start(factory:()=>Promise<ReownProvider>,onUri:(uri:string)=>void,onExpired:()=>void) {
    this.assertActive();
    const p=await factory();this.provider=p;
    if(!this.attempt.active){await retireProvider(p);this.attempt.assertActive();}
    // Defensive for injected factories / future SDK changes; never reuse any session.
    if(p.session)await p.disconnect();this.assertActive();
    const display=(uri:string)=>{
      if(!this.attempt.active)return;
      try{this.assertActive();this.attempt.receiveUri(uri);onUri(uri);}catch{this.cancel();onExpired();}
    };
    const late=()=>{if(!this.attempt.active)void retireProvider(p);};
    p.on("display_uri",display);p.on("connect",late);
    this.expiry=setTimeout(()=>{this.cancel();onExpired();},240_000);
    try{await p.connect();this.assert();return p;}
    catch(e){this.cancel();throw e;}
    finally{clearTimeout(this.expiry);p.removeListener("display_uri",display);}
  }
  assert(){try{this.assertActive();this.metadataGuard(this.provider?.session);this.attempt.assertSession(this.provider?.session);}catch(e){this.cancel();throw e;}}
  cancel(){this.attempt.cancel();clearTimeout(this.expiry);if(this.provider)void retireProvider(this.provider);}
}
