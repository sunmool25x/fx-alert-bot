import type {Hex} from 'viem';
import type {Store} from '../database/store.js';
import type {Session} from '../database/wallet.js';
import type {ClaimRow} from '../database/claims.js';
import type {Config} from '../config/index.js';
import type {ClaimChain} from './chain.js';
import {claimSimulationLog} from './diagnostics.js';
import {assertClaimTransaction,claimAssert,equalAddress,ClaimError,type ClaimSnapshot,type ClaimView} from './protocol.js';
const unfinished=['DRAFT','REVIEW','SIGNATURES','SUBMITTING','PENDING','UNKNOWN','UNKNOWN_REORG'];
export class ClaimService {
  constructor(private store:Store,private chain:ClaimChain,private config:Config,private now=Date.now){}
  available(user:string){return this.config.network==='sepolia'&&this.config.chainId===11155111&&this.config.wallet.ready&&!this.config.wallet.enabled&&this.config.wallet.users.includes(user);}
  private owner(s:Session){
    claimAssert(this.available(s.user_id),'CLAIM_DISABLED');
    const current=this.store.wallet.current(s);
    claimAssert(current.wallet&&current.epoch===s.epoch&&equalAddress(current.wallet,this.store.wallet.address(s.user_id)??''),'WALLET_REQUIRED');
    claimAssert(!this.store.wallet.quarantined(current.wallet),'CLAIM_BUSY');
    claimAssert(!this.store.wallet.list(s.user_id).some(t=>equalAddress(t.wallet,current.wallet!)&&unfinished.includes(t.state)),'CLAIM_BUSY');
    return current;
  }
  private owned(s:Session,id:string,dispatch=false){
    const current=this.owner(s),r=this.store.claims.row(id,s.user_id);
    claimAssert(r&&equalAddress(r.wallet,current.wallet!),'CLAIM_WALLET_CHANGED');
    if(dispatch)claimAssert(r.session_id===current.id&&r.session_epoch===current.epoch&&r.origin===this.config.wallet.origin&&r.expires_at>this.now(),'CLAIM_STALE');
    return r;
  }
  view(r:ClaimRow):ClaimView {return {id:r.id,version:r.version,state:r.state,wallet:r.wallet,expiresAt:r.expires_at,snapshot:r.payload?JSON.parse(r.payload) as ClaimSnapshot:null,txHash:r.tx_hash,error:r.error,balances:r.balances?JSON.parse(r.balances):null,attempted:!!r.attempted,evidence:r.evidence?JSON.parse(r.evidence):null};}
  list(s:Session){this.owner(s);return this.store.claims.list(s.user_id).filter(r=>equalAddress(r.wallet,s.wallet!)).map(r=>this.view(r));}
  async prepare(s:Session){
    const row=this.store.claims.draft(this.owner(s),this.config.wallet.origin);
    try{
      const snapshot=await this.chain.simulate(row.wallet);
      assertClaimTransaction(snapshot.transaction,row.wallet);this.owned(s,row.id,true);
      claimAssert(this.store.claims.transition(row.id,['CLAIM_PREPARED'],'CLAIM_SIMULATED',{payload:JSON.stringify(snapshot)}),'CLAIM_STALE');
      claimSimulationLog(row.wallet,snapshot);
      return this.view(this.store.claims.row(row.id,s.user_id)!);
    }catch(e){this.store.claims.transition(row.id,['CLAIM_PREPARED'],'CLAIM_FAILED',{active:0,error:e instanceof ClaimError?e.code:'CLAIM_SIMULATION_FAILED'});throw e;}
  }
  async confirm(s:Session,id:string,version:string){
    const r=this.owned(s,id,true);claimAssert(r.state==='CLAIM_SIMULATED'&&r.version===version&&!r.attempted,'CLAIM_STALE');
    // Lock confirmation before asynchronous RPC work; concurrent confirmations cannot win.
    claimAssert(this.store.claims.transition(id,['CLAIM_SIMULATED'],'CLAIM_USER_CONFIRMED'),'CLAIM_BUSY');
    try{
      const reviewed=JSON.parse(r.payload!) as ClaimSnapshot;assertClaimTransaction(reviewed.transaction,r.wallet);
      const fresh=await this.chain.simulate(r.wallet);
      const a=reviewed.transaction,b=fresh.transaction;
      claimAssert(fresh.epoch===reviewed.epoch&&a.nonce===b.nonce&&BigInt(fresh.gasEstimate)<=BigInt(a.gas)&&BigInt(b.maxFeePerGas)/2n<=BigInt(a.maxFeePerGas)&&
        JSON.stringify(fresh.before)===JSON.stringify(reviewed.before)&&JSON.stringify(fresh.receive)===JSON.stringify(reviewed.receive),'CLAIM_STALE');
      const latest=this.owned(s,id,true);claimAssert(latest.state==='CLAIM_USER_CONFIRMED'&&!latest.attempted,'CLAIM_STALE');
      // Persist BEFORE releasing the only transaction handoff. Never retry this transition.
      claimAssert(this.store.claims.transition(id,['CLAIM_USER_CONFIRMED'],'CLAIM_WALLET_REQUESTED',{attempted:1}),'CLAIM_BUSY');
      return {id,version,expiresAt:Math.min(r.expires_at,this.now()+15000),transaction:{...reviewed.transaction}};
    }catch(e){this.store.claims.transition(id,['CLAIM_USER_CONFIRMED'],'CLAIM_FAILED',{active:0,error:e instanceof ClaimError?e.code:'CLAIM_SIMULATION_FAILED'});throw e;}
  }
  cancel(s:Session,id:string){
    const r=this.owned(s,id);claimAssert(!r.attempted,'CLAIM_BUSY');
    claimAssert(this.store.claims.transition(id,['CLAIM_PREPARED','CLAIM_SIMULATED','CLAIM_USER_CONFIRMED'],'CLAIM_FAILED',{active:0,error:'CLAIM_CANCELLED'}),'CLAIM_STALE');
    return this.view(this.store.claims.row(id,s.user_id)!);
  }
  rejected(s:Session,id:string){
    const r=this.owned(s,id);claimAssert(r.attempted,'CLAIM_STALE');
    // Client-reported rejection/timeout cannot prove no broadcast. Keep the durable lock.
    this.store.claims.transition(id,['CLAIM_WALLET_REQUESTED'],'CLAIM_FAILED',{error:'CLAIM_UNRESOLVED'});
    return this.view(this.store.claims.row(id,s.user_id)!);
  }
  async report(s:Session,id:string,hash:Hex){
    hash=hash.toLowerCase() as Hex;
    const r=this.owned(s,id);claimAssert(r.attempted&&(!r.tx_hash||r.tx_hash===hash),'CLAIM_BUSY');
    claimAssert(/^0x[0-9a-fA-F]{64}$/.test(hash),'CLAIM_INVALID');
    this.store.claims.transition(id,['CLAIM_WALLET_REQUESTED','CLAIM_FAILED'],'CLAIM_BROADCAST',{tx_hash:hash,error:null,next_check:0});
    return this.refresh(s,id);
  }
  async refresh(s:Session,id:string){
    this.owned(s,id);await this.reconcile(s.user_id,id);
    return this.view(this.owned(s,id));
  }
  private reconciling=new Map<string,Promise<ClaimView>>();
  // Internal/operator entry point for an ALREADY attempted, persisted hash only.
  // No browser credential, new claim, confirmation, simulation or wallet request.
  // Public HTTP callers still pass fresh ownership/CSRF through refresh() above.
  async reconcile(user:string,id:string):Promise<ClaimView>{
    claimAssert(this.available(user),'CLAIM_DISABLED');
    const existing=this.reconciling.get(id);if(existing){claimAssert(this.store.claims.row(id,user),'CLAIM_WALLET_CHANGED');return existing;}
    const run=this.reconcileExisting(user,id);this.reconciling.set(id,run);
    try{return await run;}finally{this.reconciling.delete(id);}
  }
  private async reconcileExisting(user:string,id:string):Promise<ClaimView>{
    const r=this.store.claims.row(id,user);claimAssert(r,'CLAIM_WALLET_CHANGED');
    if(!r.attempted||!r.tx_hash||!r.payload||r.state==='CLAIM_BALANCES_VERIFIED'||!this.store.claims.reserveCheck(id))return this.view(r);
    const snapshot=JSON.parse(r.payload) as ClaimSnapshot;assertClaimTransaction(snapshot.transaction,r.wallet);
    const result=await this.chain.receipt(r.wallet,r.tx_hash as Hex,snapshot);
    claimAssert(this.available(user),'CLAIM_DISABLED');
    const from=['CLAIM_BROADCAST','CLAIM_MINED','CLAIM_FAILED'] as const;
    if(result.state==='pending'||result.state==='mined')this.store.claims.transition(id,[...from],result.state==='mined'?'CLAIM_MINED':'CLAIM_BROADCAST',{error:result.reason??'CLAIM_VERIFICATION_PENDING'});
    if(result.state==='reverted'||result.state==='invalid')this.store.claims.transition(id,[...from],'CLAIM_FAILED',{error:result.state==='reverted'?'CLAIM_REVERTED':result.reason??'CLAIM_BALANCES_FAILED'});
    if(result.state==='verified'){
      claimAssert(result.balances&&result.evidence?.finalized&&result.evidence.nativeAccountingVerified&&result.evidence.transactionHash===r.tx_hash,'CLAIM_BALANCES_FAILED');
      this.store.claims.transition(id,[...from],'CLAIM_MINED');
      this.store.claims.transition(id,['CLAIM_MINED'],'CLAIM_BALANCES_VERIFIED',{balances:JSON.stringify(result.balances),evidence:JSON.stringify(result.evidence),error:null});
    }
    return this.view(this.store.claims.row(id,user)!);
  }
  async firstSwapIntent(s:Session,id:string){
    const r=this.owned(s,id);claimAssert(r.state==='CLAIM_BALANCES_VERIFIED'&&r.tx_hash&&r.payload&&r.evidence,'CLAIM_BALANCES_FAILED');
    // Check canonical evidence again before allowing the read-only one-USDC preview.
    claimAssert((await this.chain.receipt(r.wallet,r.tx_hash as Hex,JSON.parse(r.payload),JSON.parse(r.evidence))).state==='verified','CLAIM_BALANCES_FAILED');this.owner(s);
    const {USDC,XSGD}=await import('../trades/contract.js');
    return this.store.saveIntent(s.user_id,USDC,XSGD,'1','wallet');
  }
}
