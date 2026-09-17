import { verifyTypedData,type Address,type Hex } from "viem";
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
  }
  private wallet(s:Session) {const current=this.store.wallet.current(s);requireThat(current.wallet&&same(current.wallet,this.store.wallet.address(s.user_id)??""),"WALLET_REQUIRED");requireThat(!this.store.wallet.quarantined(current.wallet),"WALLET_BUSY");return current;}
  private owned(s:Session,id:string) {
    const current=this.wallet(s),row=this.store.wallet.trade(id,s.user_id);
    requireThat(row&&row.session_id===s.id&&same(row.wallet,current.wallet!),"TRADE_STATE");return row;
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
    this.gate(s.user_id);const current=this.wallet(s);
    const intent=await this.store.intent(intentId,s.user_id);requireThat(intent,"TRADE_STATE");
    const row=this.store.wallet.draft(current,intentId,origin);
    try {
      const payload=await this.walletQuote(s,intentId),q=payload.quote,h=hashes(payload.deployment,q);
      this.gate(s.user_id);this.owned(s,row.id);
      requireThat(q.expires_at*1000>this.now()+5000,"QUOTE_STALE");
      requireThat(this.store.wallet.transition(row.id,["DRAFT"],"REVIEW",{payload:json(payload),version:h.version,quote_id:q.uuid,expires_at:Math.min(q.expires_at*1000-5000,s.expires_at)}),"TRADE_STATE");
      return this.store.wallet.trade(row.id,s.user_id)!;
    } catch(e) {this.store.wallet.transition(row.id,["DRAFT"],"FAILED",{error_code:errorCode(e)});throw e;}
  }
  confirm(s:Session,id:string,version:string) {
    this.gate(s.user_id);const row=this.owned(s,id);requireThat(row.state==="REVIEW"&&row.version===version&&row.expires_at>this.now(),"QUOTE_STALE");
    const p=this.snapshot(row);
    requireThat(this.store.wallet.transition(id,["REVIEW"],"SIGNATURES",{confirmed_at:this.now()}),"TRADE_STATE");
    return {intent:JSON.parse(json(intentData(p.deployment,p.quote))),permit:p.quote.permit.eip712,version};
  }
  cancel(s:Session,id:string) {
    const row=this.store.wallet.trade(id,s.user_id);requireThat(row,"TRADE_STATE");
    requireThat(this.store.wallet.transition(id,["DRAFT","REVIEW","SIGNATURES"],"CANCELLED",{version:null}),"TRADE_STATE");
  }
  async submit(s:Session,id:string,version:string,signature:Hex,permitSignature:Hex) {
    this.gate(s.user_id);const row=this.owned(s,id);
    requireThat(row.state==="SIGNATURES"&&row.version===version&&row.expires_at>this.now(),"QUOTE_STALE");
    const p=this.snapshot(row),wallet=row.wallet as Address;
    requireThat(await verifyTypedData({...intentData(p.deployment,p.quote),address:wallet,signature}),"INVALID_SIGNATURE");
    requireThat(await verifyTypedData({...permitData(p.quote),address:wallet,signature:permitSignature}),"INVALID_PERMIT");
    const live=deployment(await this.api.liveConfig());
    requireThat(same(live.domain_separator,p.deployment.domain_separator)&&same(live.sor_address,p.deployment.sor_address)&&same(live.vault_address,p.deployment.vault_address),"UNEXPECTED_CONTRACT");
    await this.chain.eoa(row.wallet);await this.chain.permit(live,p.quote);
    const block=await this.chain.block(),time=(await this.api.liveTime()).timestamp;
    this.gate(s.user_id);const latest=this.owned(s,id);
    requireThat(latest.state==="SIGNATURES"&&latest.version===version&&latest.expires_at>this.now()&&p.quote.expires_at>time+3,"QUOTE_STALE");
    this.store.wallet.attempt(latest,block.toString()); // Committed before the only external financial side effect.
    try {
      const result=await this.sender.submit(s.user_id,{uuid:p.quote.uuid,signature,permit_signature:permitSignature,permit_deadline:p.quote.permit.eip712.message.deadline});
      this.store.wallet.transition(id,["SUBMITTING"],"PENDING",{trade_id:result.trade_id,next_check:this.now()});
    } catch(e) {
      // An unknown/timeout/5xx/consumed quote may have reached Sera. No blind retries.
      const rejected=e instanceof AppError && [400,401,403,422].includes(e.status??0);
      this.store.wallet.transition(id,["SUBMITTING"],rejected?"FAILED":"UNKNOWN",{error_code:errorCode(e),next_check:this.now()});
    }
    return this.store.wallet.trade(id,s.user_id)!;
  }
}
