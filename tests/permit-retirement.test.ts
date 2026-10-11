import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readdirSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {fixture,wire,signer,other,deploymentFixture} from './trade-helpers.js';
import {SqliteStore} from '../src/database/store.js';
import {PermitService} from '../src/permits/service.js';
import {PERMIT_SPENDER,PERMIT_RAW} from '../src/permits/protocol.js';
import {domainHash,USDC,XSGD} from '../src/trades/contract.js';
import {EXPIRY_PROOF,EXPIRY_RUNTIME_HASH,RETIREMENT_CLASS,historicalPermitHash,validateExpiredPermitRetirement,type ExpiredPermitEvidence} from '../src/permits/retirement.js';
import {PermitFlow} from '../web/permit-flow.js';
import {proveExpiredPermitRuntime} from '../src/permits/expiry-proof.js';
import {collectAuthority,readOnlyRpc,type ReadOnlyRpc} from '../src/permits/retirement-chain.js';
import {toFunctionSelector,type Hex} from 'viem';

const runtime=readFileSync(new URL('./fixtures/sepolia-usdc-runtime.hex',import.meta.url),'utf8').trim() as Hex;

test('pinned deployed ERC-2612 runtime rejects expired Permit for symbolic signature words before storage or external calls',()=>{
  const result=proveExpiredPermitRuntime(runtime,signer.address,1000,1001);
  assert.equal(result.proof,EXPIRY_PROOF);assert.equal(result.codeHash,EXPIRY_RUNTIME_HASH);
  assert.equal(result.error,'ERC2612ExpiredSignature(uint256)');assert.equal(result.signatureWords,'SYMBOLIC');
  assert.equal(result.storageWrites,0);assert.equal(result.externalCalls,0);assert(result.steps>0&&result.steps<1000);
});

for(const timestamp of [999,1000])test('bytecode expiry proof does not claim rejection at live/unexpired chain timestamp '+timestamp,()=>{
  assert.throws(()=>proveExpiredPermitRuntime(runtime,signer.address,1000,timestamp),{code:'PERMIT_LOCKED'});
});

test('altered token runtime cannot inherit verified expiry semantics from the expected deployment',()=>{
  assert.throws(()=>proveExpiredPermitRuntime((runtime+'00') as Hex,signer.address,1000,1001),{code:'PERMIT_LOCKED'});
  assert.throws(()=>proveExpiredPermitRuntime('0x',signer.address,1000,1001),{code:'PERMIT_LOCKED'});
});

function rpcFixture(provider:string,mode='normal'){
  const calls:{method:string;params:unknown[]}[]=[],anchors=new Map<string,number>();
  const word=(n:bigint|string)=>'0x'+(typeof n==='bigint'?n.toString(16):n).padStart(64,'0');
  const rpc:ReadOnlyRpc={provider,async call(method,params){
    calls.push({method,params});if(mode==='outage')throw Error('isolated fixture RPC outage');
    if(method==='eth_chainId')return mode==='wrongChain'?'0x1':'0xaa36a7';
    if(method==='eth_getBlockByNumber'){
      const tag=String(params[0]),number=tag==='finalized'?100:tag==='latest'?(mode==='higherHead'?120:110):Number(BigInt(tag));
      const seen=(anchors.get(tag)??0)+1;anchors.set(tag,seen);
      return {number:'0x'+number.toString(16),hash:word(BigInt(number+(mode==='reorg'&&tag==='0x64'&&seen>1?1:0))),timestamp:'0x'+(number===100?1480:1600).toString(16)};
    }
    if(method==='eth_getCode'){assert.equal(params[0],USDC);return mode==='changedCode'?'0x00':runtime;}
    if(method==='eth_getTransactionCount'){assert.equal(params[0],signer.address);return '0x7';}
    if(method==='eth_call'){
      const arg=params[0] as {to:string;data:string};assert.equal(arg.to,USDC);
      if(arg.data.startsWith(toFunctionSelector('nonces(address)')))return mode==='malformedCall'?'0x':word(mode==='disagreement'?1n:0n);
      if(arg.data.startsWith(toFunctionSelector('allowance(address,address)'))){assert(arg.data.toLowerCase().includes(signer.address.slice(2).toLowerCase()));assert(arg.data.toLowerCase().includes(PERMIT_SPENDER.slice(2).toLowerCase()));return word(0n);}
      if(arg.data===toFunctionSelector('DOMAIN_SEPARATOR()'))return domainHash(wire().permit.eip712.domain);
      if(arg.data===toFunctionSelector('decimals()'))return word(6n);
      throw Error('Unexpected financial call');
    }
    throw Error('Forbidden RPC operation');
  }};
  return{rpc,calls};
}

test('two RPC hosts anchor identical finalized/latest authorization reads without financial methods or signature-shaped calldata',async()=>{
  const a=rpcFixture('fixture-a.example'),b=rpcFixture('fixture-b.example','higherHead');
  const observations=await collectAuthority(a.rpc,b.rpc,signer.address,1000);
  assert.equal(observations.length,2);assert.equal(observations[0]!.finalized.number,'100');assert.equal(observations[0]!.latest.number,'110');
  assert.deepEqual(observations[0]!.finalized,observations[1]!.finalized);assert.deepEqual(observations[0]!.latest,observations[1]!.latest);
  assert.equal(observations[0]!.latest.allowance,'0');assert.equal(observations[0]!.latest.nonce,'0');assert.equal(observations[0]!.ownerPendingNonce,'7');
  const allowed=new Set(['eth_chainId','eth_getBlockByNumber','eth_getCode','eth_call','eth_getTransactionCount']);
  for(const c of [...a.calls,...b.calls]){assert(allowed.has(c.method));if(c.method==='eth_call'){const data=(c.params[0] as{data:string}).data;assert(data.length<=138);assert(!data.startsWith('0xd505accf'));}}
});

for(const mode of ['outage','wrongChain','reorg','disagreement','changedCode','malformedCall'])test('authority RPC '+mode+' cannot produce usable retirement observations',async()=>{
  const a=rpcFixture('fixture-a.example'),b=rpcFixture('fixture-b.example',mode);
  await assert.rejects(collectAuthority(a.rpc,b.rpc,signer.address,1000));
  assert(![...a.calls,...b.calls].some(c=>/sign|send|wallet_/.test(c.method)));
});

test('two clients pointing at one RPC hostname do not count as independent evidence',async()=>{
  const a=rpcFixture('same.example'),b=rpcFixture('same.example');await assert.rejects(collectAuthority(a.rpc,b.rpc,signer.address,1000),{code:'PERMIT_LOCKED'});assert.equal(a.calls.length+b.calls.length,0);
});

test('read-only RPC adapter refuses Permit, Intent, transactions and relayer-like methods before network access',async t=>{
  let networkCalls=0;t.mock.method(globalThis,'fetch',async()=>{networkCalls++;throw Error('Unexpected fixture network call');});
  const rpc=readOnlyRpc('https://rpc.fixture.example');
  for(const method of ['eth_signTypedData_v4','personal_sign','eth_sign','eth_sendTransaction','eth_sendRawTransaction','wallet_sendCalls','relayer_submit'])await assert.rejects(rpc.call(method,[]),{code:'PERMIT_LOCKED'});
  assert.equal(networkCalls,0);assert.throws(()=>readOnlyRpc('http://rpc.fixture.example'),{code:'PERMIT_LOCKED'});
});

// All chain and wallet data below are isolated fixtures. No network or provider signing occurs.
async function expiredUnknown(path=':memory:'){
  const f=await fixture(path);
  Object.assign(f.config.wallet,{enabled:false,permitOnly:true,permitWallet:signer.address.toLowerCase(),permitKey:'ab'.repeat(32)});
  f.api.liveConfig=async()=>({...deploymentFixture,sor_address:PERMIT_SPENDER});
  let quotes=0;
  f.api.getQuote=async request=>{
    const q=wire(request.owner_address,++quotes);q.expires_at=Math.floor(f.now()/1000)+30;
    Object.assign(q.route_params,{initialDepositAmount:PERMIT_RAW,maxInputAmount:PERMIT_RAW,minOutputAmount:'60000000',deadline:request.expiration});
    Object.assign(q.permit,{spender:PERMIT_SPENDER,value_raw:PERMIT_RAW,nonce:'0',suggested_deadline:request.expiration});
    Object.assign(q.permit.eip712.message,{spender:PERMIT_SPENDER,value:PERMIT_RAW,nonce:'0',deadline:request.expiration});
    q.fee_breakdown={gas_cost_from_token:'2',gas_cost_usd:'2'};
    q.quote_breakdown={gas_mode:'receive_less',input_token:USDC,output_token:XSGD,input_amount_before_gas:PERMIT_RAW,input_amount_after_gas:PERMIT_RAW,output_amount_before_gas:'62500000',output_amount_after_gas:'60000000',gas_cost_input_token:'2000000',gas_cost_output_token:'2500000',gas_cost_usd:'2'};
    return q;
  };
  const id=await f.store.saveIntent('1',USDC,XSGD,'50');f.store.continuations.select(id,'1');
  const permit=new PermitService(f.store,f.service,f.api,f.chain,f.config,f.now);
  const view=await permit.prepare(f.session,id,'en');await permit.request(f.session,view.id,view.version,'en');
  const requested=f.store.permits.row(view.id,'1')!;f.store.permits.event(requested,'CALLBACK_RECEIVED');
  f.store.permits.failed(requested,'PERMIT_INVALID','INVALID_PERMIT');
  const row=f.store.permits.row(view.id,'1')!;f.advance(600000);
  const q=JSON.parse(row.payload).quote,domain=domainHash(q.permit.eip712.domain),timestamp=Math.floor(f.now()/1000);
  const observation={provider:'fixture-a.example',chainId:11155111,token:USDC,owner:row.wallet,spender:PERMIT_SPENDER,decimals:6,
    finalized:{number:'100',hash:'0x'+'a'.repeat(64),timestamp:timestamp-120,runtimeHash:EXPIRY_RUNTIME_HASH,domain,nonce:'0',allowance:'0'},
    latest:{number:'110',hash:'0x'+'b'.repeat(64),timestamp,runtimeHash:EXPIRY_RUNTIME_HASH,domain,nonce:'0',allowance:'0'},ownerLatestNonce:'7',ownerPendingNonce:'7'};
  const evidence:ExpiredPermitEvidence={schema:1,classification:RETIREMENT_CLASS,signatureResult:'UNKNOWN',requestId:row.id,version:row.version,digest:row.digest,historicalHash:historicalPermitHash(row),checkedAt:f.now(),codeVersion:'c'.repeat(64),expiryProof:EXPIRY_PROOF,
    observations:[observation,{...structuredClone(observation),provider:'fixture-b.example'}],history:{status:'COMPLETE_BOUNDED',fromBlock:'50',toBlock:'110',approvalCount:0,note:'Isolated bounded history fixture; off-chain signature result remains unknown.'}};
  const db=(f.store as unknown as {db:DatabaseSync}).db;
  return {...f,id,permit,row,evidence,db,quotes:()=>quotes};
}

test('finalized Sepolia expiry and zero allowance retire only the lock while historical result remains UNKNOWN',async()=>{
  const f=await expiredUnknown();try{
    const before=JSON.stringify(f.row),events=f.store.permits.events(f.row);
    assert.equal(f.permit.status(f.session,'en')!.state,'RESULT_UNKNOWN');
    const retired=f.store.permits.retireExpiredUnknown(f.row,f.evidence);
    assert.equal(retired.classification,RETIREMENT_CLASS);assert.equal(retired.digest,f.row.digest);
    assert.equal(JSON.stringify(f.store.permits.row(f.row.id,'1')),before);
    assert.deepEqual(f.store.permits.events(f.row).slice(0,-1),events);
    assert.equal(f.store.permits.events(f.row).at(-1)!.kind,'RETIRED_EXPIRED_UNKNOWN');
    const status=f.permit.status(f.session,'en')!;
    assert.equal(status.state,'RESULT_UNKNOWN');assert.equal(status.signatureClassification,'D');
    assert.equal(status.error,'PERMIT_RESULT_UNKNOWN');assert.equal(status.closedAt,null);
    assert.equal(status.retirement!.classification,RETIREMENT_CLASS);assert.equal(status.retirement!.retiredAt,f.now());
    assert.equal(status.signatureStored,false);assert.equal(status.intentSigningAvailable,false);assert.equal(status.submissionAvailable,false);
    assert.equal(f.store.permits.result(f.row),undefined);assert.equal(f.config.network,'sepolia');assert.equal(f.config.chainId,11155111);assert.equal(f.config.wallet.enabled,false);assert.equal(f.submitted(),0);
  }finally{f.store.close();}
});

for(const boundary of ['before','equal'] as const)test('local deadline display cannot retire before finalized chain time is strictly past deadline: '+boundary,async()=>{
  const f=await expiredUnknown();try{
    const deadline=JSON.parse(f.row.payload).quote.permit.eip712.message.deadline;
    for(const o of f.evidence.observations)o.finalized.timestamp=deadline-(boundary==='before'?1:0);
    assert(f.now()>deadline*1000);assert.throws(()=>f.store.permits.retireExpiredUnknown(f.row,f.evidence));
    assert.equal(f.store.permits.retirement(f.row),undefined);await assert.rejects(f.permit.prepare(f.session,f.id,'en'),{code:'PERMIT_LOCKED'});
  }finally{f.store.close();}
});

test('a local clock in the future cannot turn stale chain observations into expiry evidence',async()=>{
  const f=await expiredUnknown();try{f.advance(3600000);f.evidence.checkedAt=f.now();assert.throws(()=>validateExpiredPermitRetirement(f.row,f.evidence,f.now()));assert.equal(f.store.permits.retirement(f.row),undefined);}finally{f.store.close();}
});

for(const field of ['chain','token','owner','spender','domain','runtime','amount','digest','historicalHash','proof','duplicateProvider','missingProvider','providerDisagreement','pendingOwnerTransaction','staleEvidence','futureEvidence'] as const)test('retirement fails closed on '+field+' mismatch and preserves original lock',async()=>{
  const f=await expiredUnknown();try{
    const e=structuredClone(f.evidence);
    if(field==='chain')e.observations[0]!.chainId=1;
    if(field==='token')e.observations[0]!.token=XSGD;
    if(field==='owner')e.observations[0]!.owner=other.address;
    if(field==='spender')e.observations[0]!.spender=other.address;
    if(field==='domain')e.observations[0]!.latest.domain='0x'+'1'.repeat(64);
    if(field==='runtime')e.observations[0]!.finalized.runtimeHash='0x'+'0'.repeat(64);
    if(field==='amount'){const p=JSON.parse(f.row.payload);p.quote.permit.eip712.message.value=(2n**256n-1n).toString();f.db.prepare('UPDATE permit_acceptance SET payload=? WHERE id=?').run(JSON.stringify(p),f.row.id);e.historicalHash=historicalPermitHash(f.store.permits.row(f.row.id,'1')!);}
    if(field==='digest')e.digest='0x'+'f'.repeat(64);
    if(field==='historicalHash')e.historicalHash='0'.repeat(64);
    if(field==='proof')e.expiryProof='UNVERIFIED' as typeof EXPIRY_PROOF;
    if(field==='duplicateProvider')e.observations[1]!.provider=e.observations[0]!.provider;
    if(field==='missingProvider')e.observations.pop();
    if(field==='providerDisagreement')e.observations[1]!.latest.hash='0x'+'c'.repeat(64);
    if(field==='pendingOwnerTransaction')e.observations[0]!.ownerPendingNonce='8';
    if(field==='staleEvidence')e.checkedAt=f.now()-60001;
    if(field==='futureEvidence')e.checkedAt=f.now()+1;
    assert.throws(()=>f.store.permits.retireExpiredUnknown(f.row,e));assert.equal(f.store.permits.retirement(f.row),undefined);
    assert.equal(f.store.permits.row(f.row.id,'1')!.state,'PERMIT_INVALID');assert.equal(f.store.permits.row(f.row.id,'1')!.closed_at,null);
    await assert.rejects(f.permit.prepare(f.session,f.id,'en'),{code:'PERMIT_LOCKED'});assert.equal(f.quotes(),1);assert.equal(f.submitted(),0);
  }finally{f.store.close();}
});

for(const block of ['finalized','latest'] as const)test('nonzero '+block+' allowance blocks retirement even though Permit deadline has passed',async()=>{
  const f=await expiredUnknown();try{for(const o of f.evidence.observations)o[block].allowance=PERMIT_RAW;assert.throws(()=>f.store.permits.retireExpiredUnknown(f.row,f.evidence));assert.equal(f.store.permits.retirement(f.row),undefined);}finally{f.store.close();}
});

test('advanced Permit nonce and historical approvals do not prove whether off-chain signature returned',async()=>{
  const f=await expiredUnknown();try{for(const o of f.evidence.observations){o.finalized.nonce='2';o.latest.nonce='3';}f.evidence.history.approvalCount=2;
    f.store.permits.retireExpiredUnknown(f.row,f.evidence);const saved=JSON.parse(f.store.permits.retirement(f.row)!.evidence) as ExpiredPermitEvidence;
    assert.equal(saved.signatureResult,'UNKNOWN');assert.equal(saved.history.approvalCount,2);assert.equal(saved.observations[0]!.latest.nonce,'3');assert.equal(f.permit.status(f.session,'en')!.signatureClassification,'D');
  }finally{f.store.close();}
});

for(const history of ['PARTIAL','UNAVAILABLE'] as const)test(history+' bounded historical reconstruction stays explicit and does not fabricate a no-signature result',async()=>{
  const f=await expiredUnknown();try{f.evidence.history.status=history;f.evidence.history.note='Historical reconstruction unavailable; current finalized and latest authorization reads agree.';f.store.permits.retireExpiredUnknown(f.row,f.evidence);assert.equal(JSON.parse(f.store.permits.retirement(f.row)!.evidence).history.status,history);assert.equal(f.store.permits.row(f.row.id,'1')!.state,'PERMIT_INVALID');assert.equal(f.permit.status(f.session,'en')!.signatureClassification,'D');}finally{f.store.close();}
});

test('nonce below historical nonce or regression between finalized and latest blocks retirement',async()=>{
  const f=await expiredUnknown();try{for(const o of f.evidence.observations){o.finalized.nonce='1';o.latest.nonce='0';}assert.throws(()=>f.store.permits.retireExpiredUnknown(f.row,f.evidence));assert.equal(f.store.permits.retirement(f.row),undefined);}finally{f.store.close();}
});

for(const state of ['SUBMITTING','PENDING','UNKNOWN','UNKNOWN_REORG','CONFIRMED','EXPIRED_WITH_ATTEMPT','FAILED_WITH_SUBMISSION'] as const)test('unresolved persisted '+state+' submission blocks retirement without expiring or mutating that row',async()=>{
  const f=await expiredUnknown();try{
    const storedState=state==='EXPIRED_WITH_ATTEMPT'?'EXPIRED':state==='FAILED_WITH_SUBMISSION'?'FAILED':state;
    f.db.prepare(`INSERT INTO trade_sessions(id,user_id,session_id,wallet,chain_id,origin,intent_id,state,expires_at,created_at,submitted_at)
      VALUES('pending','1',?,?,11155111,'quote',?,?,?, ?,?)`).run(f.session.id,f.row.wallet,f.id,storedState,f.now()-1,f.now()-1000,state==='FAILED_WITH_SUBMISSION'?f.now()-500:null);
    if(state==='EXPIRED_WITH_ATTEMPT')f.db.prepare('INSERT INTO trade_attempts VALUES(?,?)').run('pending',f.now()-500);
    const before=f.db.prepare('SELECT * FROM trade_sessions').all();assert(f.store.permits.financialPending(f.row));
    assert.throws(()=>f.store.permits.retireExpiredUnknown(f.row,f.evidence),{code:'PERMIT_LOCKED'});assert.deepEqual(f.db.prepare('SELECT * FROM trade_sessions').all(),before);assert.equal(f.store.permits.retirement(f.row),undefined);
  }finally{f.store.close();}
});

test('financial pending scan is exhaustive across owner history and does not rely on the five recent UI trades',async()=>{
  const f=await expiredUnknown();try{
    const insert=f.db.prepare(`INSERT INTO trade_sessions(id,user_id,session_id,wallet,chain_id,origin,intent_id,state,expires_at,created_at) VALUES(?,'1',?,?,11155111,'quote',?,?,?,?)`);
    insert.run('old-unresolved',f.session.id,other.address,f.id,'UNKNOWN',f.now()-1,f.now()-100000);
    for(let i=0;i<8;i++)insert.run('recent-'+i,f.session.id,f.row.wallet,f.id,'EXPIRED',f.now()-1,f.now()-i);
    assert(f.store.permits.financialPending(f.row));assert.throws(()=>f.store.permits.retireExpiredUnknown(f.row,f.evidence));
  }finally{f.store.close();}
});

test('quarantine and attempted unresolved faucet claim both block authorization retirement',async()=>{
  const f=await expiredUnknown();try{
    f.db.prepare("INSERT INTO wallet_quarantine VALUES(?,'fixture',?)").run(f.row.wallet,f.now());assert(f.store.permits.financialPending(f.row));assert.throws(()=>f.store.permits.retireExpiredUnknown(f.row,f.evidence));f.db.exec('DELETE FROM wallet_quarantine');
    f.db.prepare(`INSERT INTO funding_claims(id,user_id,session_id,session_epoch,wallet,origin,state,version,expires_at,created_at,attempted) VALUES('claim','1',?,?,?,'https://fixture.example','CLAIM_FAILED','v',?,?,1)`).run(f.session.id,f.session.epoch,f.row.wallet,f.now()-1,f.now()-1000);
    const before=f.db.prepare('SELECT * FROM funding_claims').all();assert(f.store.permits.financialPending(f.row));assert.throws(()=>f.store.permits.retireExpiredUnknown(f.row,f.evidence));assert.deepEqual(f.db.prepare('SELECT * FROM funding_claims').all(),before);
  }finally{f.store.close();}
});

test('retirement accepts a reconciled successful claim without modifying its balances or evidence',async()=>{
  const f=await expiredUnknown();try{
    f.db.prepare(`INSERT INTO funding_claims(id,user_id,session_id,session_epoch,wallet,origin,state,version,expires_at,created_at,attempted,balances,evidence) VALUES('claim','1',?,?,?,'https://fixture.example','CLAIM_BALANCES_VERIFIED','v',?,?,1,'balances-fixture','receipt-fixture')`).run(f.session.id,f.session.epoch,f.row.wallet,f.now()-1,f.now()-1000);
    const before=f.db.prepare('SELECT * FROM funding_claims').all();assert(!f.store.permits.financialPending(f.row));f.store.permits.retireExpiredUnknown(f.row,f.evidence);assert.deepEqual(f.db.prepare('SELECT * FROM funding_claims').all(),before);
  }finally{f.store.close();}
});

test('any retained callback payload or cryptographic result requires its own reconciliation rather than historical-loss retirement',async()=>{
  const f=await expiredUnknown();try{f.db.prepare(`INSERT INTO permit_results VALUES(?,?,?,'SIGNATURE_BYTES',NULL,'PENDING',1,1,'UNKNOWN',?)`).run(f.row.id,f.row.version,'fixture-encrypted-response',f.now());assert.throws(()=>f.store.permits.retireExpiredUnknown(f.row,f.evidence));assert.equal(f.store.permits.retirement(f.row),undefined);assert.equal(f.db.prepare('SELECT encrypted_response FROM permit_results').get()!.encrypted_response,'fixture-encrypted-response');}finally{f.store.close();}
});

test('retirement is atomic and idempotent while historical request, review, callbacks and outcome remain immutable',async()=>{
  const f=await expiredUnknown();try{
    const original=f.store.permits.row(f.row.id,'1')!,review=f.db.prepare('SELECT * FROM permit_reviews').all();
    const first=f.store.permits.retireExpiredUnknown(f.row,f.evidence);f.advance(100000);assert.deepEqual(f.store.permits.retireExpiredUnknown(f.row,f.evidence),first);
    assert.equal(f.store.permits.events(f.row).filter(e=>e.kind==='RETIRED_EXPIRED_UNKNOWN').length,1);
    assert.throws(()=>f.store.permits.retireExpiredUnknown(f.row,{...f.evidence,codeVersion:'d'.repeat(64)}),{code:'PERMIT_LOCKED'});
    for(const [table,value] of [['permit_acceptance',original],['permit_retirements',first]] as const){const keys=Object.keys(value),replace=f.db.prepare('INSERT OR REPLACE INTO '+table+'('+keys.join(',')+') VALUES('+keys.map(()=>'?').join(',')+')');assert.throws(()=>replace.run(...Object.values(value)));}
    for(const sql of ["UPDATE permit_acceptance SET state='REVIEW'",'DELETE FROM permit_acceptance',"UPDATE permit_reviews SET payload='{}'",'DELETE FROM permit_reviews',"UPDATE permit_events SET kind='USER_REJECTED'",'DELETE FROM permit_events',"UPDATE permit_retirements SET classification='EXPIRED_RESULT_UNKNOWN_NO_ACTIVE_AUTHORITY'",'DELETE FROM permit_retirements'])assert.throws(()=>f.db.exec(sql));
    assert.throws(()=>f.store.permits.event(f.row,'CALLBACK_RECEIVED'),{code:'PERMIT_LOCKED'});
    assert.throws(()=>f.store.permits.event(f.row,'RETIRED_EXPIRED_UNKNOWN'));
    assert.throws(()=>f.store.permits.request(f.row),{code:'PERMIT_LOCKED'});
    assert.throws(()=>f.store.permits.signed(f.row,'fixture-encrypted'),{code:'PERMIT_LOCKED'});
    assert.throws(()=>f.store.permits.capture(f.row,'fixture-encrypted','SIGNATURE_BYTES'),{code:'PERMIT_LOCKED'});
    assert.deepEqual(f.store.permits.row(f.row.id,'1'),original);assert.deepEqual(f.db.prepare('SELECT * FROM permit_reviews').all(),review);
    assert.equal(f.db.prepare('PRAGMA integrity_check').get()!.integrity_check,'ok');assert.equal(f.db.prepare('PRAGMA foreign_key_check').all().length,0);
  }finally{f.store.close();}
});

test('new review needs post-retirement ownership and new continuation; old authorization can never be requested again',async()=>{
  const f=await expiredUnknown();try{
    f.store.permits.retireExpiredUnknown(f.row,f.evidence);assert.equal(f.quotes(),1);assert.equal(f.submitted(),0);
    await assert.rejects(f.permit.prepare(f.session,f.id,'en'),{code:'PERMIT_LOCKED'});
    f.advance(1);const nextId=await f.store.saveIntent('1',USDC,XSGD,'50');f.store.continuations.select(nextId,'1');
    await assert.rejects(f.permit.prepare(f.session,nextId,'en'),{code:'PERMIT_LOCKED'});
    f.store.wallet.link(f.session,signer.address.toLowerCase());const renewed=f.store.wallet.session(f.token)!;
    await assert.rejects(f.permit.prepare(renewed,f.id,'en'),{code:'PERMIT_LOCKED'});
    const historical=f.permit.status(renewed,'en')!;assert(historical.retryEligible);assert.equal(historical.signatureClassification,'D');
    let signatures=0;const paths:string[]=[];
    const flow=new PermitFlow({api:async(path,body:any)=>{paths.push(path);if(path==='permit/status')return{review:f.permit.status(renewed,'en')};assert.equal(path,'permit/prepare');return f.permit.prepare(renewed,body.intent,'en');},provider:()=>({choice:'okx',accounts:[signer.address],chainId:11155111,connect:async()=>{},disconnect:async()=>{},on:()=>{},request:async()=>{signatures++;throw Error('Automatic financial signing forbidden');}}),wallet:()=>signer.address,epoch:()=>renewed.epoch,guard:()=>{},changed:()=>{},handoff:()=>{},now:f.now});
    await flow.status();assert.equal(signatures,0);const fresh=await flow.prepare(nextId);
    assert.notEqual(fresh.id,f.row.id);assert.notEqual(fresh.version,f.row.version);assert.equal(fresh.context.amount,'50');assert.equal(fresh.state,'REVIEW');assert.equal(fresh.requested,false);assert.equal(fresh.permitSpender,PERMIT_SPENDER);assert.equal(signatures,0);
    assert.deepEqual(paths,['permit/status','permit/prepare']);assert.equal(f.quotes(),2);assert.equal(f.submitted(),0);assert.equal(f.config.wallet.enabled,false);
    assert.deepEqual(f.store.permits.row(f.row.id,'1'),f.row);assert.equal(f.store.permits.forWallet(f.row.wallet)!.id,fresh.id);
    await assert.rejects(f.permit.request(renewed,f.row.id,f.row.version,'en'),{code:'PERMIT_LOCKED'});
    await assert.rejects(f.service.submit(renewed,fresh.id,fresh.version,'0x','0x'),{code:'EXECUTION_DISABLED'});
  }finally{f.store.close();}
});

test('retirement and immutable historical evidence persist across database restart',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'fx-permit-retirement-')),path=join(dir,'state.sqlite');const f=await expiredUnknown(path);let reopened:SqliteStore|undefined;
  try{const retired=f.store.permits.retireExpiredUnknown(f.row,f.evidence);f.store.close();reopened=new SqliteStore(path,900000,f.now);assert.deepEqual(reopened.permits.row(f.row.id,'1'),f.row);assert.deepEqual(reopened.permits.retirement(f.row),retired);assert.equal(reopened.permits.events(f.row).filter(e=>e.kind==='RETIRED_EXPIRED_UNKNOWN').length,1);assert.throws(()=>reopened!.permits.request(f.row),{code:'PERMIT_LOCKED'});}finally{reopened?.close();try{f.store.close();}catch{}rmSync(dir,{recursive:true,force:true});}
});

test('migration 13 consistently backs up untouched historical financial evidence before adding an empty retirement ledger',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'fx-permit-v13-')),path=join(dir,'state.sqlite'),f=await expiredUnknown(path);let reopened:SqliteStore|undefined;
  try{
    for(const r of f.db.prepare("SELECT name FROM sqlite_master WHERE type='trigger'").all()){const name=String(r.name);assert(/^[a-z_]+$/.test(name));f.db.exec('DROP TRIGGER '+name);}
    f.db.exec('DROP TABLE permit_retirements;DELETE FROM schema_migrations WHERE version IN (13,14);CREATE UNIQUE INDEX one_open_permit_wallet ON permit_acceptance(wallet) WHERE closed_at IS NULL');
    const events=f.store.permits.events(f.row);f.store.close();reopened=new SqliteStore(path,900000,f.now);
    assert.deepEqual(reopened.permits.row(f.row.id,'1'),f.row);assert.deepEqual(reopened.permits.events(f.row),events);assert.equal(reopened.permits.retirement(f.row),undefined);
    const name=readdirSync(dir).find(n=>n.includes('before-phase7k-'));assert(name);const backup=new DatabaseSync(join(dir,name),{readOnly:true});try{assert.equal(backup.prepare('PRAGMA integrity_check').get()!.integrity_check,'ok');assert.equal(backup.prepare('SELECT version FROM schema_migrations WHERE version=13').get(),undefined);assert.equal(backup.prepare('SELECT payload FROM permit_acceptance').get()!.payload,f.row.payload);}finally{backup.close();}
  }finally{reopened?.close();try{f.store.close();}catch{}rmSync(dir,{recursive:true,force:true});}
});

test('multiple historical attempts are preserved and only the specifically evidenced request is retired',async()=>{
  const f=await expiredUnknown();try{
    const earlier={...f.row,id:'earlier-closed',created_at:f.row.created_at-1000,state:'WALLET_ERROR_NO_SIGNATURE',closed_at:f.row.created_at-500,reconciliation:'historical-no-dispatch-proof'};
    const keys=Object.keys(earlier);f.db.prepare('INSERT INTO permit_acceptance('+keys.join(',')+') VALUES('+keys.map(()=>'?').join(',')+')').run(...Object.values(earlier));
    const before=f.db.prepare('SELECT * FROM permit_acceptance WHERE id=?').get(earlier.id);assert.equal(f.store.permits.forWallet(f.row.wallet)!.id,f.row.id);
    f.store.permits.retireExpiredUnknown(f.row,f.evidence);
    assert.deepEqual(f.db.prepare('SELECT * FROM permit_acceptance WHERE id=?').get(earlier.id),before);assert.equal(f.store.permits.retirement(earlier),undefined);assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM permit_retirements').get()!.n,1);
  }finally{f.store.close();}
});

test('a different unresolved owner Permit blocks retirement and cannot be erased by retiring this request',async()=>{
  const f=await expiredUnknown();try{
    const sibling={...f.row,id:'other-unknown',wallet:other.address.toLowerCase(),state:'RESULT_UNKNOWN'};const keys=Object.keys(sibling);
    f.db.prepare('INSERT INTO permit_acceptance('+keys.join(',')+') VALUES('+keys.map(()=>'?').join(',')+')').run(...Object.values(sibling));
    assert(f.store.permits.financialPending(f.row));assert.throws(()=>f.store.permits.retireExpiredUnknown(f.row,f.evidence));assert.equal(f.store.permits.retirement(f.row),undefined);assert.equal(f.store.permits.row(sibling.id,'1')!.state,'RESULT_UNKNOWN');
  }finally{f.store.close();}
});

test('failure while appending retirement evidence rolls back both the ledger and event atomically',async()=>{
  const f=await expiredUnknown();try{
    const before=f.store.permits.events(f.row);f.db.exec("CREATE TRIGGER test_fail_retirement_event BEFORE INSERT ON permit_events WHEN NEW.kind='RETIRED_EXPIRED_UNKNOWN' BEGIN SELECT RAISE(ABORT,'fixture event failure'); END");
    assert.throws(()=>f.store.permits.retireExpiredUnknown(f.row,f.evidence));assert.equal(f.store.permits.retirement(f.row),undefined);assert.deepEqual(f.store.permits.events(f.row),before);assert.deepEqual(f.store.permits.row(f.row.id,'1'),f.row);
  }finally{f.store.close();}
});
