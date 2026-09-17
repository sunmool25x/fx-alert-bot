import { WalletFlowError } from "./connection.js";
import { assertOkxLink,assertOkxRequest,matchesOkxTopic,type OkxSnapshot } from "./okx-protocol.js";
import type { TelegramEnvironment } from "./routing.js";
import type { ConnectedProvider,WalletConnection } from "./connector-types.js";

export interface OkxBridge {
  start(receive:(message:any)=>void):void;
  send(message:unknown):void;
  close():void;
}
export function browserOkxBridge(environment:TelegramEnvironment):OkxBridge {
  let frame:HTMLIFrameElement|undefined,port:MessagePort|undefined;
  return {
    start(receive){
      frame=document.createElement("iframe");frame.hidden=true;frame.title="OKX Wallet connection transport";
      frame.src="/okx-bridge.html";
      frame.onload=()=>{const channel=new MessageChannel();port=channel.port1;port.onmessage=e=>receive(e.data);
        frame?.contentWindow?.postMessage({type:"fx-okx-init",environment},location.origin,[channel.port2]);};
      document.body.append(frame);
    },
    send(message){port?.postMessage(message);},
    close(){port?.postMessage({type:"disconnect"});port?.close();frame?.remove();port=undefined;frame=undefined;},
  };
}
export class OkxConnection implements WalletConnection,ConnectedProvider {
  readonly choice="okx";
  accounts:string[]=[];chainId=11155111;session?:OkxSnapshot;handoffUri?:string;
  private live=true;private topic="";private sequence=0;private timer?:ReturnType<typeof setTimeout>;
  private rejection?:(error:Error)=>void;
  private requests=new Map<number,{resolve:(value:unknown)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
  private listeners=new Map<string,Set<(...args:any[])=>void>>();
  constructor(readonly environment:TelegramEnvironment,private bridge:OkxBridge=browserOkxBridge(environment)){}
  on(event:string,listener:(...args:any[])=>void){const set=this.listeners.get(event)??new Set();set.add(listener);this.listeners.set(event,set);}
  private emit(event:string){for(const listener of this.listeners.get(event)??[])listener();}
  assertActive(){if(!this.live)throw new WalletFlowError("WALLET_CONNECT_CANCELLED");}
  assert(){this.assertActive();if(!this.session||!this.topic||this.session.topic!==this.topic||this.session.chainId!==11155111||!this.accounts[0])throw new WalletFlowError("WALLET_REQUIRED");}
  start(onUri:(uri:string)=>void,onExpired:()=>void):Promise<ConnectedProvider> {
    this.assertActive();
    return new Promise((resolve,reject)=>{
      this.rejection=reject;this.timer=setTimeout(()=>{this.cancel();onExpired();},240_000);
      this.bridge.start(message=>{
        if(!this.live)return;
        try{
          if(message.type==="uri"){
            if(this.session||this.topic)throw new WalletFlowError("WALLET_REQUIRED");
            const uri=assertOkxLink(message.uri);
            if(!matchesOkxTopic(uri,message.topic))throw new WalletFlowError("WALLET_REQUIRED");
            this.topic=message.topic;this.handoffUri=uri;onUri(uri);
          }else if(message.type==="connected"||message.type==="update"){
            if(message.type==="connected"&&this.session)throw new WalletFlowError("WALLET_REQUIRED");
            const snapshot=message.snapshot as OkxSnapshot;
            if(!snapshot||snapshot.topic!==this.topic||!this.topic||snapshot.chainId!==11155111||!Array.isArray(snapshot.accounts)||!snapshot.accounts.length||snapshot.accounts.some(a=>typeof a!=="string"||!/^0x[0-9a-fA-F]{40}$/.test(a)))throw new WalletFlowError("WALLET_REQUIRED");
            const changed=this.session&&JSON.stringify(snapshot.accounts)!==JSON.stringify(this.accounts);
            this.session=snapshot;this.accounts=[...snapshot.accounts];this.chainId=snapshot.chainId;
            if(message.type==="connected"){
              this.handoffUri=assertOkxLink(message.requestUri,false);clearTimeout(this.timer);this.rejection=undefined;resolve(this);
            }else if(changed)this.emit("accountsChanged");
          }else if(message.type==="response"){
            const request=this.requests.get(message.id);if(!request)return;this.assert();this.requests.delete(message.id);clearTimeout(request.timer);request.resolve(message.result);
          }else if(message.type==="disconnect"){this.cancel();this.emit("disconnect");}
          else if(message.type==="error"){
            const error=new WalletFlowError(message.code==="NETWORK_MISMATCH"?"NETWORK_MISMATCH":"WALLET_CONNECT_CANCELLED");
            const request=this.requests.get(message.id);if(request){clearTimeout(request.timer);this.requests.delete(message.id);request.reject(error);}else{this.cancel();this.emit("disconnect");}
          }
        }catch(e){this.cancel();this.emit("disconnect");}
      });
    });
  }
  async connect(){this.assert();} // Ownership must never initiate a second connector.
  request(args:{method:string;params:unknown[]}):Promise<unknown> {
    this.assert();assertOkxRequest(args);const id=++this.sequence;
    return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.requests.delete(id);reject(new WalletFlowError("OWNERSHIP_REJECTED"));},120_000);
      this.requests.set(id,{resolve,reject,timer});this.bridge.send({type:"request",id,args});});
  }
  async disconnect(){this.cancel();}
  cancel(){
    if(!this.live)return;this.live=false;clearTimeout(this.timer);this.accounts=[];this.session=undefined;this.handoffUri=undefined;
    const error=new WalletFlowError("WALLET_CONNECT_CANCELLED");this.rejection?.(error);this.rejection=undefined;
    for(const request of this.requests.values()){clearTimeout(request.timer);request.reject(error);}this.requests.clear();this.bridge.close();
  }
}
