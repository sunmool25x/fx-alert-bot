import {type Hex} from 'viem';
import {encryptPermit,decryptPermit} from '../permits/crypto.js';
import {permitDigest,permitRpcData,verifyPermitSignature,PERMIT_RAW,PERMIT_SPENDER} from '../permits/protocol.js';
import {intentRpcData,verifyIntentSignature} from './intent-protocol.js';
import {quoteEconomics} from './economics.js';
import {admit,type FinancialStep} from './timing.js';
import type {SignatureStep,AuthorizationRow} from '../database/authorizations.js';
import type { Config } from "../config/index.js";
import type { Store } from "../database/store.js";
import type { Session,TradeRow } from "../database/wallet.js";
import type { SeraClient } from "../sera/client.js";
import type { ChainReads } from "../wallet/chain.js";
import { AppError,errorCode } from "../utils/errors.js";
import { deployment,executionQuoteSchema,supportedAmount,validateQuote,intentData,permitData,hashes,json,same,requireThat,type Deployment,type ExecutionQuote } from "./contract.js";
export interface Snapshot {deployment:Deployment;quote:ExecutionQuote;intentHash:string;amount:string;fromSymbol:string;toSymbol:string}
export type TradeApi=Pick<SeraClient,"getTokens"|"getQuote"|"liveConfig"|"liveTime"|"health">;
export interface SwapSubmission {submit(user:string,body:{uuid:string;signature:string;permit_signature:string;permit_deadline:number}):Promise<{success:true;trade_id:string;status:string}>}
export class TradeService {
  constructor(private store:Store,private api:TradeApi,private chain:ChainReads,private config:Config,private sender:SwapSubmission,private now=Date.now) {}
  gate(user:string) {
    requireThat(this.config.network==="sepolia"&&this.config.chainId===11155111,"NETWORK_MISMATCH");
    requireThat(this.config.wallet.enabled&&this.config.wallet.ready,"EXECUTION_DISABLED");
    requireThat(this.config.wallet.users.includes(user),"NOT_ALLOWLISTED");
    requireThat(/^[a-f0-9]{64}$/i.test(this.config.wallet.permitKey),"EXECUTION_UNAVAILABLE");
  }
  private wallet(s:Session) {const current=this.store.wallet.current(s);requireThat(current.wallet&&same(current.wallet,this.store.wallet.address(s.user_id)??""),"WALLET_REQUIRED");requireThat(!this.store.wallet.quarantined(current.wallet),"WALLET_BUSY");return current;}
  private owned(s:Session,id:string) {
    const current=this.wallet(s),row=this.store.wallet.trade(id,s.user_id);
    requireThat(row&&row.session_id===s.id&&same(row.wallet,current.wallet!)&&row.origin!==''&&same(row.wallet,this.config.wallet.permitWallet),'TRADE_STATE');
    const p=this.store.authorizations.package(id);requireThat(!p||p.epoch===current.epoch,'WALLET_REQUIRED');return row;
  }
  snapshot(row:TradeRow) {
    requireThat(row.payload&&row.version,"TRADE_STATE");
    const payload=JSON.parse(row.payload) as Snapshot;
    const q=executionQuoteSchema.parse(payload.quote),d=deployment(payload.deployment);
    requireThat(hashes(d,q).version===row.version&&same(q.route_params.taker,row.wallet)&&row.chain_id===11155111,"QUOTE_BINDING_MISMATCH");
    return {...payload,quote:q,deployment:d};
  }
  private async walletQuote(s:Session,intentId:string):Promise<Snapshot> {
    requireThat(this.config.network==="sepolia"&&this.config.chainId===11155111,"NETWORK_MISMATCH");
    requireThat(this.config.wallet.ready,"EXECUTION_UNAVAILABLE");
    const current=this.wallet(s),wallet=current.wallet!;
    const intent=await this.store.intent(intentId,s.user_id);requireThat(intent,"TRADE_STATE");
    const tokens=(await this.api.getTokens()).tokens;
    const from=tokens.find(t=>same(t.address,intent.from_token)),to=tokens.find(t=>same(t.address,intent.to_token));
    requireThat(from&&to,"UNKNOWN_TOKEN");
    const input=supportedAmount(from,to,intent.amount,this.config.wallet.maxUsdc);
    const d=deployment(await this.api.liveConfig());await this.chain.deployment(d);await this.chain.eoa(wallet);
    const balances=await this.chain.balances(wallet);
    requireThat(BigInt(balances.find(b=>b.symbol==="USDC")?.amountRaw??"0")>=input,"INSUFFICIENT_BALANCE");
    const health=await this.api.health();requireThat(health.signature_ready,"EXECUTION_UNAVAILABLE");
    const time=(await this.api.liveTime()).timestamp;requireThat(Math.abs(time*1000-this.now())<5000,"CLOCK_SKEW");
    const deadline=time+300;
    const wire=await this.api.getQuote({from_token:from.address,to_token:to.address,from_amount:input.toString(),owner_address:wallet,recipient:wallet,expiration:deadline,gas_mode:"receive_less"});
    const q=validateQuote(wire,d,wallet,input,deadline,Math.max(time,Math.ceil(this.now()/1000)),health.executor_id);
    await this.chain.permit(d,q);
    const latest=this.wallet(s);requireThat(latest.epoch===current.epoch&&same(latest.wallet!,wallet),"WALLET_REQUIRED");
    requireThat(q.expires_at*1000>this.now()+5000,"QUOTE_STALE");
    return {deployment:d,quote:q,intentHash:hashes(d,q).struct,amount:intent.amount,fromSymbol:from.symbol,toSymbol:to.symbol};
  }
  async preview(s:Session,intentId:string) {
    // Read-only acceptance: no trade row, confirmation version, signing payload response or attempt.
    return this.walletQuote(s,intentId);
  }
  async prepare(s:Session,intentId:string,origin:string) {
    this.gate(s.user_id);const current=this.wallet(s);requireThat(same(current.wallet!,this.config.wallet.permitWallet),"NOT_ALLOWLISTED");this.store.authorizations.initialize();
    const intent=await this.store.intent(intentId,s.user_id);requireThat(intent,"TRADE_STATE");
    requireThat(intent.amount==="50", "TRADE_LIMIT");
    const historical=this.store.permits.forWallet(current.wallet!);
    if(historical&&(historical.closed_at!==null||this.store.permits.retirement(historical)))requireThat(this.store.permits.canRetry(historical,current,intentId),'PERMIT_LOCKED');
    const row=this.store.wallet.draft(current,intentId,origin);
    try {
      const payload=await this.walletQuote(s,intentId),q=payload.quote,h=hashes(payload.deployment,q);
      this.gate(s.user_id);this.owned(s,row.id);this.packagePolicy(payload);
      requireThat(q.expires_at*1000>this.now()+5000,"QUOTE_STALE");
      requireThat(this.store.wallet.transition(row.id,["DRAFT"],"REVIEW",{payload:json(payload),version:h.version,quote_id:q.uuid,expires_at:Math.min(q.expires_at*1000-5000,s.expires_at)}),"TRADE_STATE");
      const prepared=this.store.wallet.trade(row.id,s.user_id)!;
      this.store.authorizations.bind(prepared,current.epoch,permitDigest(q.permit.eip712),h.intent);
      return prepared;
    } catch(e) {this.store.wallet.transition(row.id,["DRAFT"],"FAILED",{error_code:errorCode(e)});throw e;}
  }
  private packagePolicy(p:Snapshot){
    requireThat(p.amount==='50'&&p.quote.route_params.maxInputAmount===PERMIT_RAW&&p.quote.route_params.initialDepositAmount===PERMIT_RAW&&same(p.deployment.sor_address,PERMIT_SPENDER),'TRADE_LIMIT');
    permitRpcData(p.quote.permit.eip712,p.quote.route_params.taker);intentRpcData(intentData(p.deployment,p.quote),p.quote.route_params.taker);
    requireThat(quoteEconomics(p.quote).status==='PASS','COST_REVIEW_BLOCKED');
  }
  private admission(s:Session,row:TradeRow,step:FinancialStep){
    const p=this.snapshot(row);this.packagePolicy(p);this.store.authorizations.assertAvailable(row);
    return admit(step,this.now(),p.quote.expires_at*1000,p.quote.permit.eip712.message.deadline*1000,p.quote.route_params.deadline*1000,this.wallet(s).expires_at);
  }
  confirm(s:Session,id:string,version:string){
    this.gate(s.user_id);const row=this.owned(s,id);requireThat(row.state==='REVIEW'&&row.version===version&&row.expires_at>this.now(),'QUOTE_STALE');
    this.admission(s,row,'permit');requireThat(this.store.wallet.transition(id,['REVIEW'],'SIGNATURES',{confirmed_at:this.now()}),'TRADE_STATE');
    this.store.authorizations.event(row,'QUOTE_REVIEWED');return{version};
  }
  cancel(s:Session,id:string){
    const row=this.store.wallet.trade(id,s.user_id);requireThat(row,'TRADE_STATE');
    if(this.store.authorizations.row(id,'permit')){this.store.authorizations.event(row,'OWNER_CANCELLED_WITH_AUTHORITY');throw new AppError('PERMIT_LOCKED');}
    requireThat(this.store.wallet.transition(id,['DRAFT','REVIEW','SIGNATURES','EXPIRED'],'CANCELLED'),'TRADE_STATE');
    if(this.store.authorizations.package(id))this.store.authorizations.event(row,'OWNER_CANCELLED');
  }
  private historical(s:Session,id:string,version:string){const row=this.store.wallet.trade(id,s.user_id);requireThat(row&&row.version===version&&this.store.authorizations.package(id)?.user_id===s.user_id,'TRADE_STATE');return row;}
  private aad(row:TradeRow,step:SignatureStep){return[row.id,row.user_id,row.wallet,row.version,step,this.store.authorizations.row(row.id,step)!.digest].join(':');}
  private async checkedSignature(row:TradeRow,step:SignatureStep){
    const a=this.store.authorizations.row(row.id,step);requireThat(a?.state==='SIGNED'&&a.crypto_valid===1&&a.encrypted_response,'INVALID_SIGNATURE');
    const p=this.snapshot(row),raw=decryptPermit(a.encrypted_response,this.config.wallet.permitKey,this.aad(row,step));
    return step==='permit'?verifyPermitSignature(p.quote.permit.eip712,raw,row.wallet,permitDigest(p.quote.permit.eip712)):verifyIntentSignature(intentData(p.deployment,p.quote),raw,row.wallet,hashes(p.deployment,p.quote).intent);
  }
  async requestAuthorization(s:Session,id:string,version:string,step:SignatureStep,consent:boolean){
    this.gate(s.user_id);requireThat(consent===true,'TRADE_STATE');const row=this.owned(s,id);
    requireThat(row.version===version&&row.state==='SIGNATURES','TRADE_STATE');this.admission(s,row,step);
    if(step==='intent')await this.checkedSignature(row,'permit');
    const p=this.snapshot(row),live=deployment(await this.api.liveConfig());
    requireThat(json(live)===json(p.deployment),'UNEXPECTED_CONTRACT');
    await Promise.all([this.chain.eoa(row.wallet),this.chain.permit(live,p.quote)]);
    const time=(await this.api.liveTime()).timestamp;requireThat(Math.abs(time*1000-this.now())<5000,'CLOCK_SKEW');
    this.gate(s.user_id);this.owned(s,id);this.admission(s,row,step);
    const digest=step==='permit'?permitDigest(p.quote.permit.eip712):hashes(p.deployment,p.quote).intent;
    this.store.authorizations.reserve(row,step,digest);
    return{step,version,digest,quoteExpiresAt:p.quote.expires_at*1000,typedData:step==='permit'?permitRpcData(p.quote.permit.eip712,row.wallet):intentRpcData(intentData(p.deployment,p.quote),row.wallet)};
  }
  /** Capture requires authenticated Telegram ownership, not an unexpired financial proof.
   * It can preserve a late result after account/proof changes, but cannot authorize the next step. */
  async recordAuthorization(s:Session,id:string,version:string,step:SignatureStep,value:unknown){
    const row=this.historical(s,id,version),a=this.store.authorizations.row(id,step);requireThat(a&&a.version===version,'TRADE_STATE');
    requireThat(typeof value==='string'&&value.length<=264,'INVALID_SIGNATURE');
    const p=this.snapshot(row),aad=this.aad(row,step);
    if(a.encrypted_response){requireThat(decryptPermit(a.encrypted_response,this.config.wallet.permitKey,aad).toLowerCase()===value.toLowerCase(),'PERMIT_LOCKED');if(a.state!=='CAPTURED')return this.authorizationStatus(s,id,version);}
    else this.store.authorizations.capture(row,step,encryptPermit(value,this.config.wallet.permitKey,aad),this.now()>=p.quote.expires_at*1000,this.now()>=(step==='permit'?p.quote.permit.eip712.message.deadline:p.quote.route_params.deadline)*1000);
    // Durable capture has committed before any signature recovery or chain read.
    let valid=false;try{
      if(step==='permit')await verifyPermitSignature(p.quote.permit.eip712,value,row.wallet,a.digest);else await verifyIntentSignature(intentData(p.deployment,p.quote),value,row.wallet,a.digest);
      valid=true;
    }catch{/* Original invalid bytes remain encrypted, locked and owner-scoped. */}
    let chain='UNKNOWN';if(valid){try{await this.chain.permit(p.deployment,p.quote);chain='MATCH';}catch(e){chain=errorCode(e)==='INVALID_PERMIT'?'NONCE_OR_DOMAIN_STALE':'UNKNOWN';}}
    this.store.authorizations.checked(row,step,valid,valid?'VALID':'INVALID_SIGNATURE',chain);
    return this.authorizationStatus(s,id,version);
  }
  async reconcileCaptured(s:Session,id:string,version:string){
    const row=this.historical(s,id,version);
    for(const step of ['permit','intent']as const){const a=this.store.authorizations.row(id,step);if(a?.state==='CAPTURED'&&a.encrypted_response)await this.recordAuthorization(s,id,version,step,decryptPermit(a.encrypted_response,this.config.wallet.permitKey,this.aad(row,step)));}
    return this.authorizationStatus(s,id,version);
  }
  authorizationFailure(s:Session,id:string,version:string,step:SignatureStep,rejected:boolean){const row=this.historical(s,id,version);requireThat(this.store.authorizations.row(id,step),'TRADE_STATE');this.store.authorizations.failed(row,step,rejected);return this.authorizationStatus(s,id,version);}
  authorizationObservation(s:Session,id:string,version:string,step:SignatureStep,kind:string){const row=this.historical(s,id,version);requireThat(this.store.authorizations.row(id,step)&&['CLIENT_DISPATCHED','SDK_INVOKED','HANDOFF_REQUESTED','HANDOFF_REOPENED','CALLBACK_RECEIVED'].includes(kind),'TRADE_STATE');this.store.authorizations.event(row,step.toUpperCase()+'_'+kind);}
  authorizationStatus(s:Session,id:string,version:string){
    const row=this.historical(s,id,version),p=this.snapshot(row);
    const safe=(a:AuthorizationRow|undefined)=>a?{state:a.state,requestedAt:a.requested_at,receivedAt:a.received_at,valid:a.crypto_valid,code:a.code,chain:a.chain_status,quoteExpired:this.now()>=p.quote.expires_at*1000,deadlineExpired:this.now()>=(a.step==='permit'?p.quote.permit.eip712.message.deadline:p.quote.route_params.deadline)*1000}:null;
    const available=(step:FinancialStep)=>{try{this.gate(s.user_id);this.owned(s,id);requireThat(row.state==='SIGNATURES'||(step==='permit'&&row.state==='REVIEW'),'TRADE_STATE');this.admission(s,row,step);if(step==='permit')return!this.store.authorizations.row(id,'permit');if(this.store.authorizations.row(id,'permit')?.state!=='SIGNED')return false;return step==='intent'?!this.store.authorizations.row(id,'intent'):this.store.authorizations.row(id,'intent')?.state==='SIGNED';}catch{return false;}};
    return{id,version,state:row.state,permit:safe(this.store.authorizations.row(id,'permit')),intent:safe(this.store.authorizations.row(id,'intent')),quoteExpiresAt:p.quote.expires_at*1000,available:{permit:available('permit'),intent:available('intent'),submit:available('submit')},events:this.store.authorizations.events(id)};
  }
  /** Sole relayer entry point: two retained, verified results plus a separate explicit submission action. */
  async submit(s:Session,id:string,version:string,consent:boolean|string=false,_legacySignature?:Hex){
    this.gate(s.user_id);requireThat(consent===true,'TRADE_STATE');const row=this.owned(s,id);
    requireThat(row.state==='SIGNATURES'&&row.version===version,'TRADE_STATE');this.admission(s,row,'submit');
    const p=this.snapshot(row),signature=await this.checkedSignature(row,'intent'),permitSignature=await this.checkedSignature(row,'permit');
    const live=deployment(await this.api.liveConfig());requireThat(json(live)===json(p.deployment),'UNEXPECTED_CONTRACT');
    await Promise.all([this.chain.eoa(row.wallet),this.chain.permit(live,p.quote)]);
    const [block,clock]=await Promise.all([this.chain.block(),this.api.liveTime()]);requireThat(Math.abs(clock.timestamp*1000-this.now())<5000,'CLOCK_SKEW');
    this.gate(s.user_id);const latest=this.owned(s,id);this.admission(s,latest,'submit');requireThat(latest.state==='SIGNATURES'&&latest.version===version,'TRADE_STATE');
    this.store.wallet.attempt(latest,block.toString());this.store.authorizations.event(row,'SUBMISSION_IN_PROGRESS');
    try{
      const r=await this.sender.submit(s.user_id,{uuid:p.quote.uuid,signature,permit_signature:permitSignature,permit_deadline:p.quote.permit.eip712.message.deadline});
      requireThat(r.success===true&&r.status==='pending'&&typeof r.trade_id==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(r.trade_id),'UNAVAILABLE');
      this.store.wallet.transition(id,['SUBMITTING'],'PENDING',{trade_id:r.trade_id,next_check:this.now()});this.store.authorizations.event(row,'SUBMITTED');
    }catch(e){
      const rejected=e instanceof AppError&&[400,401,403,422].includes(e.status??0);
      this.store.wallet.transition(id,['SUBMITTING'],rejected?'FAILED':'UNKNOWN',{error_code:errorCode(e),next_check:this.now()});this.store.authorizations.event(row,rejected?'SUBMISSION_REJECTED':'SUBMISSION_UNKNOWN');
    }
    return this.store.wallet.trade(id,s.user_id)!;
  }
}
