import{checkWallet,WalletFlowError,type WalletApi}from'./connection.js';import type{ConnectedProvider}from'./connector-types.js';
import{checkPermit,permitDigest,type PermitTypedData}from'../src/permits/protocol.js';import type{AuthorizationReview}from'../src/trades/review.js';
export interface PermitView{id:string;version:string;state:string;stage?:string;closedAt?:number|null;retirement?:{classification:'EXPIRED_RESULT_UNKNOWN_NO_ACTIVE_AUTHORITY'|'EXPIRED_INVALID_SIGNATURE_NO_ACTIVE_AUTHORITY';retiredAt:number};retryEligible?:boolean;summary?:{minimum:string;cost:string;before:string;deducted:string;costShare:string};result?:{crypto_valid:number|null;validation_code:string;chain_status:string;quote_expired:number;permit_expired:number};details:AuthorizationReview;context:{amount:string;fromSymbol:string;toSymbol:string;recipient:string;chainId:number};ownershipExpiresAt:number;contextExpiresAt:number;quoteExpiresAt:number;permitDeadline:number;permitDigest:string;permitNonce:string;permitSpender:string;requested:boolean;signatureStored:boolean;error:string|null;rpcCode:number|null;permitExpired:boolean;quoteExpired:boolean;intentExpired:boolean;permit?:PermitTypedData}
export type PermitProgress='PREPARING'|'PREFLIGHT'|'WAITING_WALLET'|'CHECKING_RESULT'|'SIGNED'|'ERROR';
/** Fail closed on missing expiry metadata from an older server as well as elapsed deadlines. */
export function assertPermitReviewCurrent(v:PermitView,now=Date.now()){
  if(!Number.isFinite(v.ownershipExpiresAt)||now>=v.ownershipExpiresAt)throw new WalletFlowError('WALLET_REQUIRED');
  if(!Number.isFinite(v.contextExpiresAt)||now>=v.contextExpiresAt)throw new WalletFlowError('TRADE_STATE');
  if(!Number.isFinite(v.quoteExpiresAt)||!Number.isFinite(v.permitDeadline)||now>=Math.min(v.quoteExpiresAt-5000,v.permitDeadline))throw new WalletFlowError('QUOTE_STALE');
}
export function permitWalletError(error:unknown){const e=error as{code?:unknown;rpcCode?:unknown},rpc=typeof e?.rpcCode==='number'?e.rpcCode:typeof e?.code==='number'?e.code:null;
  return{code:rpc===4001||e?.code==='USER_REJECTED'?'USER_REJECTED' as const:e?.code==='WALLET_TIMEOUT'?'WALLET_TIMEOUT' as const:e?.code==='WALLET_REQUIRED'?'WALLET_REQUIRED' as const:'WALLET_TRANSPORT_ERROR' as const,rpc:Number.isSafeInteger(rpc)&&Math.abs(rpc!)<=2147483647?rpc:null};
}
/** One explicit Permit RPC; no Intent payload, retry, transaction or relayer operation. */
export class PermitFlow{
  view?:PermitView;private attempted=false;private busy=false;private generation=0;private retryFrom?:{id:string;version:string};private rejectedReview?:{id:string;version:string};private waiting=false;private pendingOwner?:{wallet:string;epoch:number;provider:ConnectedProvider;view:PermitView};
  constructor(private o:{api:WalletApi;provider:()=>ConnectedProvider|undefined;wallet:()=>string;epoch:()=>number;guard:()=>void;changed:(v:PermitView)=>void;handoff:()=>void;now?:()=>number;progress?:(phase:PermitProgress,code?:string)=>void}){}
  get locked(){return this.attempted||this.busy;}
  get canOpenWallet(){return this.waiting;}
  private observe(v:PermitView,kind:string){void this.o.api('permit/observation',{id:v.id,version:v.version,kind}).catch(()=>undefined);}
  reopenWallet(){const p=this.pendingOwner;if(!this.waiting||!p)throw new WalletFlowError('PERMIT_LOCKED');this.o.guard();checkWallet(this.o.provider(),p.wallet);if(p.epoch!==this.o.epoch()||p.provider!==this.o.provider())throw new WalletFlowError('WALLET_REQUIRED');try{this.o.handoff();this.observe(p.view,'HANDOFF_REOPENED');}catch(e){this.observe(p.view,'HANDOFF_FAILED');throw e;}}
  private update(v:PermitView){if(this.rejectedReview?.id===v.id&&this.rejectedReview.version===v.version&&v.state==='REVIEW'&&!v.requested){this.attempted=false;this.rejectedReview=undefined;}this.view=v;this.attempted ||=v.requested;if((v.closedAt&&v.state==='WALLET_ERROR_NO_SIGNATURE'||v.retirement!==undefined)&&v.retryEligible)this.retryFrom={id:v.id,version:v.version};this.o.changed(v);return v;}
  private okx(){if((this.o.provider() as ConnectedProvider&{choice?:string}|undefined)?.choice!=='okx')throw new WalletFlowError('WALLET_REQUIRED');}
  invalidate(){this.generation++;this.view=undefined;} // Never clear the one-request lock.
  async status(){if(this.busy)return;const generation=this.generation,epoch=this.o.epoch();const r=await this.o.api('permit/status');if(generation===this.generation&&epoch===this.o.epoch()&&r.review)this.update(r.review);}
  async prepare(intent:string){
    if(this.busy||this.attempted&&!this.retryFrom)throw new WalletFlowError('PERMIT_LOCKED');this.invalidate();this.o.guard();this.okx();checkWallet(this.o.provider(),this.o.wallet());
    const generation=this.generation,epoch=this.o.epoch(),wallet=this.o.wallet();this.busy=true;
    this.o.progress?.('PREPARING');
    try{const v:PermitView=await this.o.api('permit/prepare',{intent});this.o.guard();checkWallet(this.o.provider(),wallet);
      if(generation!==this.generation||epoch!==this.o.epoch()||wallet!==this.o.wallet())throw new WalletFlowError('WALLET_REQUIRED');
      if(v.context.amount!=='50'||v.context.fromSymbol!=='USDC'||v.context.toSymbol!=='XSGD'||v.context.chainId!==11155111||v.context.recipient.toLowerCase()!==wallet.toLowerCase())throw new WalletFlowError('QUOTE_BINDING_MISMATCH');
      assertPermitReviewCurrent(v,(this.o.now??Date.now)());
      if(this.retryFrom){if(v.id===this.retryFrom.id||v.version===this.retryFrom.version||v.state!=='REVIEW'||v.requested)throw new WalletFlowError('PERMIT_LOCKED');this.retryFrom=undefined;this.attempted=false;}
      return this.update(v);
    }finally{this.busy=false;}
  }
  async sign(){
    if(this.busy||this.attempted||!this.view||this.view.state!=='REVIEW')throw new WalletFlowError('PERMIT_LOCKED');
    const before=this.view,now=()=> (this.o.now??Date.now)();assertPermitReviewCurrent(before,now());this.o.guard();this.okx();checkWallet(this.o.provider(),this.o.wallet(),before.quoteExpiresAt-5000,now());
    const wallet=this.o.wallet(),epoch=this.o.epoch();this.busy=true;this.attempted=true;let requested=false,dispatchStarted=false;this.o.progress?.('PREFLIGHT');
    try{
      // Reserve durably before dispatch. An uncertain HTTP outcome must never cause another prompt.
      const r:PermitView=await this.o.api('permit/request',{id:before.id,version:before.version,consent:true});requested=true;this.update(r);
      if(r.id!==before.id||r.version!==before.version||r.permitDigest!==before.permitDigest||!r.permit)throw new WalletFlowError('INVALID_PERMIT');
      checkPermit(r.permit,wallet,now());if(permitDigest(r.permit)!==before.permitDigest)throw new WalletFlowError('INVALID_PERMIT');
      assertPermitReviewCurrent(r,now());this.o.guard();checkWallet(this.o.provider(),wallet,before.quoteExpiresAt-5000,now());if(epoch!==this.o.epoch())throw new WalletFlowError('WALLET_REQUIRED');
      let signature:unknown;
      const observe=(kind:string)=>this.observe(r,kind),provider=this.o.provider()!;
      let captured=false;
      const capture=async(value:unknown)=>{
        if(captured)throw new WalletFlowError('PERMIT_LOCKED');captured=true;this.o.guard();this.o.progress?.('CHECKING_RESULT');
        const result=typeof value==='string'&&value.length<=264?{signature:value}:{responseKind:value==null?'EMPTY':typeof value==='object'?'OBJECT':'OTHER'};
        try{const saved=this.update(await this.o.api('permit/record',{id:r.id,version:r.version,...result}));this.o.progress?.(saved.signatureStored?'SIGNED':'ERROR',saved.error??undefined);return saved;}
        catch(e){try{const status=await this.o.api('permit/status');if(status.review?.id===r.id&&status.review?.version===r.version)this.update(status.review);}catch{/* Keep the financial lock if status is unavailable. */}throw e;}
      };
      provider.on('permitLateResult',(value:unknown)=>{if(!captured)void capture(value).catch(e=>this.o.progress?.('ERROR',e.code??'PERMIT_RESULT_UNKNOWN'));});
      this.waiting=true;this.pendingOwner={wallet,epoch,provider,view:r};
      provider.on('permitStage',(stage:unknown)=>{if(this.waiting&&this.pendingOwner?.view===r&&['SDK_INVOKED','SDK_RETURNED'].includes(String(stage)))observe(String(stage));});
      try{dispatchStarted=true;const pending=provider.request({method:'eth_signTypedData_v4',params:[wallet,JSON.stringify(r.permit)]});observe('RPC_DISPATCHED');this.o.progress?.('WAITING_WALLET');
        // Handoff failure must not discard a pending signature result.
        try{this.o.handoff();observe('HANDOFF_REQUESTED');}catch{observe('HANDOFF_FAILED');/* The visible Open OKX action reopens this SAME pending request. */}
        signature=await pending;observe('CALLBACK_RECEIVED');}
      catch(e){const failure=permitWalletError(e);await this.o.api('permit/failure',{id:r.id,version:r.version,...failure}).then(v=>this.update(v)).catch(()=>undefined);throw new WalletFlowError(failure.code,failure.rpc??undefined);}
      this.waiting=false;
      // Exactly one persistence POST. Lost acknowledgement is checked through status, never signing again.
      const saved=await capture(signature);signature=undefined;return saved;
    }catch(e){
      const code=e instanceof WalletFlowError?e.code:(e as{code?:string})?.code;
      if(requested&&!dispatchStarted&&['INVALID_PERMIT','WALLET_REQUIRED','QUOTE_STALE'].includes(String(code))){this.observe(before,'CLIENT_PRE_DISPATCH_REJECTED');await this.o.api('permit/failure',{id:before.id,version:before.version,code,rpc:null}).then(v=>this.update(v)).catch(()=>undefined);}
      // Only a definite preflight rejection AND authoritative unreserved row can release the local tap lock.
      if(!requested&&['QUOTE_STALE','WALLET_REQUIRED'].includes(String(code))){this.rejectedReview={id:before.id,version:before.version};try{const status=await this.o.api('permit/status');if(status.review)this.update(status.review);}catch{/* Ownership renewal can later read the authoritative unreserved row; no blind unlock. */}}
      this.o.progress?.('ERROR',String(code??'UNAVAILABLE'));
      throw e;
    }finally{this.busy=false;this.waiting=false;this.pendingOwner=undefined;}
  }
}
