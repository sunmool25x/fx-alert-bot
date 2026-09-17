import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {SqliteStore} from '../src/database/store.js';
import {ClaimService} from '../src/claims/service.js';
import {claimAssert,ClaimError,assertClaimTransaction,CLAIM_DATA,FAUCET} from '../src/claims/protocol.js';
import {claimFixture,claimSnapshot,claimHash,claimEvidence} from './claim-helpers.js';
import {other} from './trade-helpers.js';
test('claim review is simulated before confirmation; hash alone never completes funding',async()=>{
  const f=await claimFixture();try{const review=await f.prepare();assert.equal(review.state,'CLAIM_SIMULATED');assert.equal(review.attempted,false);assert.equal(f.simulations(),1);
    const auth=await f.claims.confirm(f.session,review.id,review.version);assert.equal(auth.transaction.to,FAUCET);assert.equal(auth.transaction.data,CLAIM_DATA);assert.equal(f.simulations(),2);
    const reported=await f.claims.report(f.session,review.id,claimHash);assert.equal(reported.state,'CLAIM_BROADCAST');assert.equal(reported.balances,null);assert.equal(f.submitted(),0);
  }finally{f.store.close();}
});
for(const [label,change] of Object.entries({destination:{to:other.address},calldata:{data:'0xa262f5f8'},value:{value:'0x1'},chain:{chainId:'0x1'},sender:{from:other.address},extra:{authorizationList:[]},gas:{gas:'0xffffff'},cost:{maxFeePerGas:'0xffffffffff'}})){
  test('claim transaction rejects wrong '+label,()=>{const p=claimSnapshot('0x'+'a'.repeat(40));assert.throws(()=>assertClaimTransaction({...p.transaction,...change},p.transaction.from));});
}
test('pending preparation prevents duplicate and concurrent confirmations release exactly one handoff',async()=>{
  const f=await claimFixture();try{const r=await f.prepare();await assert.rejects(f.prepare(),{code:'CLAIM_BUSY'});
    const results=await Promise.allSettled([f.claims.confirm(f.session,r.id,r.version),f.claims.confirm(f.session,r.id,r.version)]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.simulations(),2);
    await assert.rejects(f.claims.confirm(f.session,r.id,r.version));assert.equal(f.submitted(),0);
  }finally{f.store.close();}
});
test('fresh session and wallet ownership bind the entire confirmation operation',async()=>{
  const f=await claimFixture();try{const r=await f.prepare();f.store.wallet.link(f.session,other.address);await assert.rejects(f.claims.confirm(f.session,r.id,r.version));assert.equal(f.store.claims.row(r.id,'1')!.attempted,0);
  }finally{f.store.close();}
});
test('stale review and expired ownership block claim dispatch',async()=>{
  const f=await claimFixture();try{const r=await f.prepare();f.advance(120001);await assert.rejects(f.claims.confirm(f.session,r.id,r.version),{code:'CLAIM_STALE'});f.advance(900000);await assert.rejects(f.prepare(),{code:'AUTH_STALE'});
  }finally{f.store.close();}
});
test('ownership invalidation during simulation cannot release wallet authorization',async()=>{
  const f=await claimFixture();try{const r=await f.prepare();f.chain.simulate=async wallet=>{f.store.wallet.disconnect('1');return claimSnapshot(wallet);};await assert.rejects(f.claims.confirm(f.session,r.id,r.version));assert.equal(f.store.claims.row(r.id,'1')!.attempted,0);
  }finally{f.store.close();}
});
for(const error of [new ClaimError('CLAIM_SIMULATION_FAILED'),new Error('RPC timeout secret-url')])test('failed simulation never marks a wallet attempt: '+error.name,async()=>{
  const f=await claimFixture();try{f.chain.simulate=async()=>{throw error;};await assert.rejects(f.prepare());const row=f.store.claims.list('1')[0]!;assert.equal(row.state,'CLAIM_FAILED');assert.equal(row.attempted,0);assert(!JSON.stringify(row).includes('secret-url'));
  }finally{f.store.close();}
});
test('rejection or lost wallet response retains duplicate lock across reconnect',async()=>{
  const f=await claimFixture();try{const r=await f.prepare();await f.claims.confirm(f.session,r.id,r.version);f.claims.rejected(f.session,r.id);f.advance(130000);await assert.rejects(f.prepare(),{code:'CLAIM_BUSY'});
    const token=f.store.wallet.newSession('1','reconnect',900000).token;let s=f.store.wallet.session(token)!;f.store.wallet.link(s,r.wallet);s=f.store.wallet.session(token)!;
    await assert.rejects(f.claims.prepare(s),{code:'CLAIM_BUSY'});assert.equal(f.claims.list(s)[0]!.state,'CLAIM_FAILED');await assert.rejects(f.store.forget('1'),{code:'CLAIM_BUSY'});
  }finally{f.store.close();}
});
for(const state of ['reverted','invalid'] as const)test('receipt '+state+' cannot become funding PASS',async()=>{
  const f=await claimFixture();try{const r=await f.prepare();await f.claims.confirm(f.session,r.id,r.version);f.result({state});const row=await f.claims.report(f.session,r.id,claimHash);assert.equal(row.state,'CLAIM_FAILED');assert.equal(row.balances,null);await assert.rejects(f.claims.firstSwapIntent(f.session,r.id));
  }finally{f.store.close();}
});
test('only verified receipt and balances permit a one-USDC read-only swap intent',async()=>{
  const f=await claimFixture();try{const r=await f.prepare();await assert.rejects(f.claims.firstSwapIntent(f.session,r.id));await f.claims.confirm(f.session,r.id,r.version);
    f.result({state:'verified',balances:{eth:'93805932029893351',usdc:'1000000000000000',xsgd:'1000000000000000'},evidence:claimEvidence()});
    const result=await f.claims.report(f.session,r.id,claimHash);assert.equal(result.state,'CLAIM_BALANCES_VERIFIED');assert.equal((await f.store.intent(await f.claims.firstSwapIntent(f.session,r.id),'1'))?.amount,'1');assert.equal(f.submitted(),0);assert.equal(f.store.wallet.list('1').length,0);
  }finally{f.store.close();}
});
test('swap enabled, nonallowlisted owner or mainnet closes the funding gate',async()=>{
  const f=await claimFixture();try{for(const change of [()=>f.config.wallet.enabled=true,()=>{f.config.wallet.enabled=false;f.config.wallet.users=[];},()=>{f.config.wallet.users=['1'];f.config.chainId=1;}]){change();await assert.rejects(f.prepare(),{code:'CLAIM_DISABLED'});}}
  finally{f.store.close();}
});
test('cancel during final simulation consumes consent without opening a wallet',async()=>{
  const f=await claimFixture();try{const r=await f.prepare();f.chain.simulate=async wallet=>{f.claims.cancel(f.session,r.id);return claimSnapshot(wallet);};await assert.rejects(f.claims.confirm(f.session,r.id,r.version));assert.equal(f.store.claims.row(r.id,'1')!.attempted,0);}
  finally{f.store.close();}
});
test('claim attempts and state event history persist through restart without touching swaps',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'fx-claims-')),path=join(dir,'state.sqlite');const f=await claimFixture(path);
  try{const r=await f.prepare();await f.claims.confirm(f.session,r.id,r.version);f.store.close();const store=new SqliteStore(path,900000,f.now);
    try{const svc=new ClaimService(store,f.chain,f.config,f.now);await assert.rejects(svc.prepare(store.wallet.session(f.token)!),{code:'CLAIM_BUSY'});const db=new DatabaseSync(path,{readOnly:true});assert.deepEqual(db.prepare('SELECT state FROM funding_claim_events WHERE claim_id=? ORDER BY id').all(r.id).map(x=>x.state),['CLAIM_PREPARED','CLAIM_SIMULATED','CLAIM_USER_CONFIRMED','CLAIM_WALLET_REQUESTED']);assert.equal(db.prepare('SELECT COUNT(*) n FROM trade_attempts').get()!.n,0);db.close();}finally{store.close();}
  }finally{rmSync(dir,{recursive:true,force:true});}
});
