import test from 'node:test';
import assert from 'node:assert/strict';
import {claimFixture,claimEvidence,claimHash,claimSnapshot} from './claim-helpers.js';
import {receiptCosts,nativeAccounting} from '../src/claims/receipt-evidence.js';
import {ClaimStatusPolling,claimStatus} from '../web/claim-status.js';
import {claimReceived,tokenAmount} from '../web/claim-panel.js';
import {other} from './trade-helpers.js';
import {AppError} from '../src/utils/errors.js';
const balances={eth:'93805932029893351',usdc:'1000000000000000',xsgd:'1000000000000000'};
test('explicit two-USDC claim preview preserves legacy amount, requires ownership and never resizes no-liquidity',async()=>{
 const f=await claimFixture();try{const r=await f.prepare();await f.claims.confirm(f.session,r.id,r.version);f.result({state:'verified',balances,evidence:claimEvidence()});await f.claims.report(f.session,r.id,claimHash);
 const id=await f.claims.firstSwapIntent(f.session,r.id,'2');assert.equal((await f.store.intent(id,'1'))?.amount,'2');let requests=0;f.api.getQuote=async request=>{requests++;assert.equal(request.from_amount,'2000000');throw new AppError('NO_LIQUIDITY');};
 await assert.rejects(f.service.preview(f.session,id),{code:'NO_LIQUIDITY'});assert.equal(requests,1);assert.equal(f.submitted(),0);assert.equal(f.store.wallet.list('1').length,0);
 await assert.rejects(f.claims.firstSwapIntent(f.session,r.id,'5' as '2'));f.advance(900001);await assert.rejects(f.claims.firstSwapIntent(f.session,r.id,'2'),{code:'AUTH_STALE'});
 }finally{f.store.close();}
});
test('legacy failure is repaired from its original persisted hash; every subsequent refresh is idempotent',async()=>{
  const f=await claimFixture();try{const r=await f.prepare();await f.claims.confirm(f.session,r.id,r.version);f.result({state:'invalid'});await f.claims.report(f.session,r.id,claimHash);
    const simulations=f.simulations();let receipts=0;f.chain.receipt=async(_wallet,hash)=>{assert.equal(hash,claimHash);receipts++;return {state:'verified',balances,evidence:claimEvidence()};};f.advance(16000);
    const repaired=await f.claims.refresh(f.session,r.id);assert.equal(repaired.state,'CLAIM_BALANCES_VERIFIED');assert.equal(repaired.error,null);assert.equal(repaired.evidence?.nativeAccountingVerified,true);
    for(let i=0;i<3;i++)assert.deepEqual(await f.claims.refresh(f.session,r.id),repaired);
    assert.equal(receipts,1);assert.equal(f.simulations(),simulations);assert.equal(f.submitted(),0);assert.equal(f.store.claims.list('1').length,1);await assert.rejects(f.prepare(),{code:'CLAIM_BUSY'});
  }finally{f.store.close();}
});
test('internal reconciliation can finish an already signed hash after session expiry, while browser refresh still authenticates',async()=>{
  const f=await claimFixture();try{const r=await f.prepare();await f.claims.confirm(f.session,r.id,r.version);await f.claims.report(f.session,r.id,claimHash);f.advance(900001);
    f.result({state:'verified',balances,evidence:claimEvidence()});await assert.rejects(f.claims.refresh(f.session,r.id),{code:'AUTH_STALE'});
    assert.equal((await f.claims.reconcile('1',r.id)).state,'CLAIM_BALANCES_VERIFIED');assert.equal(f.simulations(),2);assert.equal(f.submitted(),0);
  }finally{f.store.close();}
});
test('reconciliation cannot prepare an unattempted draft or cross user boundaries',async()=>{
  const f=await claimFixture();try{const r=await f.prepare();let reads=0;f.chain.receipt=async()=>{reads++;throw Error('must not read');};assert.equal((await f.claims.reconcile('1',r.id)).state,'CLAIM_SIMULATED');await assert.rejects(f.claims.reconcile('2',r.id));assert.equal(reads,0);assert.equal(f.simulations(),1);}
  finally{f.store.close();}
});
test('concurrent status checks share one receipt read and never request simulation or submission',async()=>{
  const f=await claimFixture();try{const r=await f.prepare();await f.claims.confirm(f.session,r.id,r.version);await f.claims.report(f.session,r.id,claimHash);f.advance(16000);let reads=0;
    f.chain.receipt=async()=>{reads++;await new Promise(resolve=>setTimeout(resolve,5));return {state:'verified',balances,evidence:claimEvidence()};};
    const results=await Promise.all([f.claims.refresh(f.session,r.id),f.claims.refresh(f.session,r.id)]);assert.equal(reads,1);assert(results.every(x=>x.state==='CLAIM_BALANCES_VERIFIED'));assert.equal(f.simulations(),2);assert.equal(f.submitted(),0);
  }finally{f.store.close();}
});
test('same hash in different casing is idempotent and a different hash cannot replace the stored transaction',async()=>{
  const f=await claimFixture();try{const r=await f.prepare();await f.claims.confirm(f.session,r.id,r.version);await f.claims.report(f.session,r.id,claimHash);
    assert.equal((await f.claims.report(f.session,r.id,('0x'+claimHash.slice(2).toUpperCase()) as `0x${string}`)).txHash,claimHash);
    await assert.rejects(f.claims.report(f.session,r.id,('0x'+'ef'.repeat(32)) as `0x${string}`),{code:'CLAIM_BUSY'});assert.equal(f.store.claims.list('1').length,1);
  }finally{f.store.close();}
});
test('a second record cannot store the same transaction hash',async()=>{
  const f=await claimFixture();try{const r=await f.prepare();await f.claims.confirm(f.session,r.id,r.version);await f.claims.report(f.session,r.id,claimHash);
    f.store.wallet.link(f.session,other.address);const session=f.store.wallet.session(f.token)!;const second=await f.claims.prepare(session);await f.claims.confirm(session,second.id,second.version);
    await assert.rejects(f.claims.report(session,second.id,claimHash));assert.equal(f.store.claims.row(second.id,'1')?.tx_hash,null);assert.equal(f.store.claims.row(r.id,'1')?.tx_hash,claimHash);assert.equal(f.submitted(),0);
  }finally{f.store.close();}
});
test('a verified label without receipt/native evidence cannot mark a claim complete',async()=>{
  const f=await claimFixture();try{const r=await f.prepare();await f.claims.confirm(f.session,r.id,r.version);f.result({state:'verified',balances});await assert.rejects(f.claims.report(f.session,r.id,claimHash),{code:'CLAIM_BALANCES_FAILED'});assert.notEqual(f.store.claims.row(r.id,'1')?.state,'CLAIM_BALANCES_VERIFIED');}
  finally{f.store.close();}
});
test('pending balance convergence keeps the original claim locked until a later valid read',async()=>{
  const f=await claimFixture();try{const r=await f.prepare();await f.claims.confirm(f.session,r.id,r.version);f.result({state:'mined',reason:'CLAIM_VERIFICATION_PENDING'});const pending=await f.claims.report(f.session,r.id,claimHash);assert.equal(claimStatus(pending),'pending');assert.equal(pending.balances,null);await assert.rejects(f.prepare(),{code:'CLAIM_BUSY'});
    f.advance(16000);f.result({state:'verified',balances,evidence:claimEvidence()});assert.equal((await f.claims.refresh(f.session,r.id)).state,'CLAIM_BALANCES_VERIFIED');assert.equal(f.simulations(),2);assert.equal(f.submitted(),0);
  }finally{f.store.close();}
});
test('fee repricing cannot exceed either reviewed maximum cost or the existing gas limit',()=>{
  const t=claimSnapshot('0x'+'a'.repeat(40)).transaction;
  const tx={gas:10000000n,maxFeePerGas:2000000000n,maxPriorityFeePerGas:1000000000n},receipt={gasUsed:7751767n,effectiveGasPrice:1500000000n};
  assert(receiptCosts(t,tx,receipt).valid);assert(!receiptCosts(t,{...tx,maxFeePerGas:2000000001n},receipt).valid);assert(!receiptCosts(t,{...tx,gas:10000001n},receipt).valid);assert(!receiptCosts(t,tx,{...receipt,effectiveGasPrice:3000000000n}).valid);
});
test('ETH funding includes actual gas and does not require the balance to increase',()=>{
  assert(nativeAccounting(100000000000000000n,10000000000000000n,16194067970106649n,93805932029893351n));
  assert(!nativeAccounting(100000000000000000n,10000000000000000n,16194067970106649n,110000000000000000n));
});
test('normalization distinguishes one billion raw units from one billion six-decimal tokens',()=>{
  assert.equal(tokenAmount('1000000000'),'1,000');assert.equal(tokenAmount('1000000000000000'),'1,000,000,000');assert.equal(claimReceived('1000000000000000','ko'),'10억');assert.equal(claimReceived('1000000000000000','en'),'1 billion');
});
test('automatic status polling is bounded by time and count and stops on lost authentication',()=>{
  let time=0;const p=new ClaimStatusPolling(()=>time);for(let i=0;i<60;i++)assert(p.take());assert(!p.take());
  const timeout=new ClaimStatusPolling(()=>time);time=20*60*1000;assert(!timeout.take());const stopped=new ClaimStatusPolling(()=>time);stopped.stop();assert(!stopped.take());
});

test('one-USDC preview uses only stored finalized evidence and still requires fresh ownership',async()=>{
  const f=await claimFixture();try{
    const r=await f.prepare();await f.claims.confirm(f.session,r.id,r.version);f.result({state:'verified',balances,evidence:claimEvidence()});await f.claims.report(f.session,r.id,claimHash);
    let reads=0;f.chain.receipt=async(_wallet,hash,_snapshot,prior)=>{reads++;assert.equal(hash,claimHash);assert.deepEqual(prior,claimEvidence());return {state:'verified',balances,evidence:prior};};
    const intent=await f.claims.firstSwapIntent(f.session,r.id);assert.equal((await f.store.intent(intent,'1'))?.amount,'1');assert.equal(reads,1);assert.equal(f.submitted(),0);assert.equal(f.simulations(),2);
    f.advance(900001);await assert.rejects(f.claims.firstSwapIntent(f.session,r.id),{code:'AUTH_STALE'});assert.equal(reads,1);
  }finally{f.store.close();}
});
