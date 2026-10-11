import {checkWallet,WalletFlowError,type WalletApi} from './connection.js';
import type {ConnectedProvider} from './connector-types.js';
import {intentRpcData} from '../src/trades/intent-protocol.js';
import {permitRpcData} from '../src/permits/protocol.js';
import {hashTypedData} from 'viem';
type Step='permit'|'intent';
/** Client for the existing TradeService. Holds no financial signature between actions. */
export class TradeAuthorizationFlow{
  private busy=false;private attempted=new Set<Step>();private pending?:{step:Step;provider:ConnectedProvider;wallet:string;epoch:number};
  constructor(private o:{id:string;version:string;api:WalletApi;provider:()=>ConnectedProvider|undefined;wallet:()=>string;epoch:()=>number;enabled:()=>boolean;needsConfirm?:boolean;handoff:()=>void;progress:(state:string)=>void;now?:()=>number}){}
  status(){return this.o.api('authorization/status',{id:this.o.id,version:this.o.version});}
  private body(step:Step){return{id:this.o.id,version:this.o.version,step};}
  private observe(step:Step,kind:string){void this.o.api('authorization/observe',{...this.body(step),kind}).catch(()=>undefined);}
  reopen(){const p=this.pending;if(!p)throw new WalletFlowError('PERMIT_LOCKED');checkWallet(this.o.provider(),p.wallet);if(p.provider!==this.o.provider()||p.epoch!==this.o.epoch())throw new WalletFlowError('WALLET_REQUIRED');this.o.handoff();this.observe(p.step,'HANDOFF_REOPENED');}
  async sign(step:Step,consent:boolean){
    if(!this.o.enabled()||consent!==true)throw new WalletFlowError('EXECUTION_DISABLED');
    if(this.busy||this.attempted.has(step))throw new WalletFlowError('PERMIT_LOCKED');
    const provider=this.o.provider(),wallet=this.o.wallet(),epoch=this.o.epoch();if((provider as ConnectedProvider&{choice?:string}|undefined)?.choice!=='okx')throw new WalletFlowError('WALLET_REQUIRED');checkWallet(provider,wallet);this.busy=true;this.attempted.add(step);this.o.progress('PREFLIGHT');
    let reserved=false,captured=false;
    const capture=async(value:unknown)=>{
      if(captured)return;captured=true;this.o.progress('CHECKING_RESULT');
      // Preserve late results even after quote/proof/account changes. Server capture is owner-bound and cannot progress a trade.
      if(typeof value!=='string'||value.length>264){await this.o.api('authorization/failure',{...this.body(step),rejected:false});throw new WalletFlowError('PERMIT_RESULT_UNKNOWN');}
      try{const result=await this.o.api('authorization/record',{...this.body(step),signature:value});this.o.progress(result[step]?.valid===1?'SIGNED':'RESULT_UNKNOWN');return result;}
      catch{this.o.progress('RESULT_UNKNOWN');return this.status();}
    };
    try{
      if(this.o.needsConfirm){await this.o.api('confirm',{id:this.o.id,version:this.o.version});this.o.needsConfirm=false;}
      const r=await this.o.api('authorization/request',{...this.body(step),consent:true});reserved=true;
      if(r.version!==this.o.version||r.step!==step)throw new WalletFlowError('QUOTE_BINDING_MISMATCH');
      const typed=step==='permit'?permitRpcData(r.typedData,wallet):intentRpcData(r.typedData,wallet);
      if(hashTypedData(typed as never)!==r.digest)throw new WalletFlowError('INVALID_SIGNATURE');
      checkWallet(provider,wallet,r.quoteExpiresAt-5000,(this.o.now??Date.now)());
      if(epoch!==this.o.epoch()||provider!==this.o.provider()||!this.o.enabled())throw new WalletFlowError('WALLET_REQUIRED');
      provider!.on('permitLateResult',(value:unknown)=>{if(!captured)void capture(value).catch(()=>this.o.progress('RESULT_UNKNOWN'));});
      this.pending={step,provider:provider!,wallet,epoch};
      provider!.on('permitStage',(stage:unknown)=>{if(this.pending?.step===step&&stage==='SDK_INVOKED')this.observe(step,'SDK_INVOKED');});
      const pending=provider!.request({method:'eth_signTypedData_v4',params:[wallet,JSON.stringify(typed)]});
      void pending.catch(()=>{});this.observe(step,'CLIENT_DISPATCHED');this.o.progress('WAITING_WALLET');
      try{this.o.handoff();this.observe(step,'HANDOFF_REQUESTED');}catch{this.o.progress('OPEN_OKX');}
      const result=await pending;this.observe(step,'CALLBACK_RECEIVED');return await capture(result);
    }catch(e){
      if(reserved&&!captured)await this.o.api('authorization/failure',{...this.body(step),rejected:(e as{code?:unknown})?.code===4001||(e as{code?:unknown})?.code==='USER_REJECTED'}).catch(()=>undefined);
      this.o.progress('RESULT_UNKNOWN');throw e;
    }finally{this.busy=false;this.pending=undefined;}
  }
  async submit(consent:boolean){
    if(!this.o.enabled()||consent!==true||this.busy)throw new WalletFlowError('EXECUTION_DISABLED');
    checkWallet(this.o.provider(),this.o.wallet());this.busy=true;this.o.progress('SUBMITTING');
    try{return await this.o.api('submit',{id:this.o.id,version:this.o.version,consent:true});}
    catch(e){this.o.progress('SUBMISSION_UNKNOWN');throw e;}finally{this.busy=false;}
  }
}
