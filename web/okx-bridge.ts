import { OkxMemoryStorage,okxConnectParams,okxSnapshot,assertOkxLink,assertOkxRequest,matchesOkxTopic,OKX_CHAIN } from "./okx-protocol.js";
import type { TelegramEnvironment } from "./routing.js";
import { okxDappMetadata,walletRedirect } from "./wallet-trust.js";
// This frame isolates the vendor's global singleton and cached session lifetime.
// It is not a substitute for backend authentication or an untrusted-code sandbox.
Object.defineProperty(window,"localStorage",{value:new OkxMemoryStorage(),configurable:false});
let started=false;
window.addEventListener("message",function initialize(event:MessageEvent){
  if(started||event.source!==parent||event.origin!==location.origin||event.data?.type!=="fx-okx-init"||!event.ports[0])return;
  if(!["desktop","android","ios"].includes(event.data.environment))return;
  started=true;window.removeEventListener("message",initialize);
  const port=event.ports[0],environment=event.data.environment as TelegramEnvironment;
  const send=(type:string,data:Record<string,unknown>={})=>port.postMessage({type,...data});
  let sdk:import("@okxconnect/universal-provider").OKXUniversalProvider|undefined,topic="",uri="",stopped=false;
  let claimRequested=false;
  const fail=(error:unknown,id?:number)=>{const code=(error as {code?:unknown})?.code;send("error",{id,code:["NETWORK_MISMATCH","WALLET_REQUIRED"].includes(String(code))?code:"WALLET_CONNECT_CANCELLED"});};
  port.onmessage=async({data})=>{
    if(stopped||!sdk)return;
    try{
      if(data.type==="disconnect"){stopped=true;await sdk.disconnect().catch(()=>undefined);port.close();return;}
      if(data.type!=="request"||!Number.isSafeInteger(data.id)||!Array.isArray(data.args?.params))return;
      const current=okxSnapshot(sdk.session,topic);assertOkxRequest(data.args,current.accounts[0]);
      if(data.args.method==="eth_sendTransaction"){
        if(claimRequested||!sdk.session?.namespaces?.eip155?.methods?.includes("eth_sendTransaction"))throw new Error("Claim unavailable");
        claimRequested=true;
        data.args.params=[Object.freeze({...data.args.params[0]})];
        assertOkxRequest(data.args,current.accounts[0]);
      }
      const result=await sdk.request({...data.args,redirect:walletRedirect(environment,"okx")},OKX_CHAIN);
      if(stopped)return;okxSnapshot(sdk.session,topic);send("response",{id:data.id,result});
    }catch(e){fail(e,data.id);}
  };
  void (async()=>{
    // Dynamic import happens after installing memory storage, before any SDK singleton.
    const vendor=await import("@okxconnect/universal-provider");
    // The package has no logger/telemetry opt-out. Its public reporter is disabled;
    // the dedicated bundle strips console calls and its CSP permits relay traffic only.
    const reporter=vendor.getDefaultReporter();
    reporter.sendRecordContent=async()=>{};reporter.sendRecord=async()=>false;
    reporter.sendCachedRecords=async()=>{};reporter.beginReport=async()=>{};
    sdk=await vendor.OKXUniversalProvider.init({dappMetaData:okxDappMetadata(event.origin,location.origin),
      openAppLinkType:vendor.OpenAppLinkType.UniversalLink,connector:[new vendor.OKXAppCommonConnector()]});
    if(stopped)return;
    if(sdk.session)throw new Error("Unexpected restored session");
    sdk.on("display_uri",(value:unknown)=>{try{uri=assertOkxLink(value);}catch(e){fail(e);}});
    sdk.on("okx_engine_connect_params",(info:{connectRequest?:{topic?:unknown}})=>{
      try{
        const expected=info?.connectRequest?.topic;
        if(!matchesOkxTopic(uri,expected))throw new Error("Pairing mismatch");
        topic=expected;if(!stopped)send("uri",{uri,topic});
      }catch(e){fail(e);}
    });
    sdk.on("session_delete",()=>{if(!stopped)send("disconnect");});
    const update=(value:unknown)=>{if(stopped)return;try{send("update",{snapshot:okxSnapshot(value,topic),claimSupported:sdk?.session?.namespaces?.eip155?.methods?.includes("eth_sendTransaction")===true});}catch(e){fail(e);}};
    sdk.on("session_update",update);sdk.on("accountChanged",update);
    const session=await sdk.connect(okxConnectParams(environment));
    if(stopped){await sdk.disconnect().catch(()=>undefined);return;}
    const snapshot=okxSnapshot(session,topic);
    const requestUri=assertOkxLink(vendor.getOKXLink(undefined,vendor.ConnectWalletType.OKX_APP_COMMON).universalLink,false);
    send("connected",{snapshot,requestUri,claimSupported:session?.namespaces?.eip155?.methods?.includes("eth_sendTransaction")===true});
  })().catch(e=>fail(e));
});
