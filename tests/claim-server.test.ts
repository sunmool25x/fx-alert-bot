import test from 'node:test';
import assert from 'node:assert/strict';
import {request} from 'node:http';
import {createHmac} from 'node:crypto';
import {signingServer} from '../src/wallet/server.js';
import {signer,wire} from './trade-helpers.js';
import {claimFixture} from './claim-helpers.js';
import {claimSimulationLog} from '../src/claims/diagnostics.js';
import {claimSnapshot,claimHash,claimEvidence} from './claim-helpers.js';
import {AppError} from '../src/utils/errors.js';
async function setup(){
  const f=await claimFixture();f.config.botToken='claim-test-token';
  const server=signingServer(f.config,f.store,await import('./trade-helpers.js').then(m=>m.mockChain()),f.service,f.now,undefined,f.chain);
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const port=(server.address() as {port:number}).port;let cookie='',csrf='';
  const call=(path:string,data:unknown={},headers:Record<string,string>={})=>new Promise<{status:number;body:any}>(resolve=>{
    const req=request({hostname:'127.0.0.1',port,path:'/api/'+path,method:'POST',headers:{host:'bot.example',origin:'https://bot.example','content-type':'application/json',cookie,'x-csrf-token':csrf,...headers}},res=>{
      let raw='';res.on('data',c=>raw+=String(c));res.on('end',()=>{if(res.headers['set-cookie'])cookie=res.headers['set-cookie'][0]!.split(';')[0]!;resolve({status:res.statusCode!,body:JSON.parse(raw)});});
    });req.end(JSON.stringify(data));
  });
  const login=async()=>{const p=new URLSearchParams({auth_date:String(f.now()/1000),user:JSON.stringify({id:1}),query_id:'claim-http'});const text=[...p].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+'='+v).join('\n');p.set('hash',createHmac('sha256',createHmac('sha256','WebAppData').update(f.config.botToken).digest()).update(text).digest('hex'));const r=await call('auth',{initData:p.toString()});assert.equal(r.status,200);csrf=r.body.csrf;const ch=await call('challenge',{address:signer.address,chainId:11155111});await call('verify',{id:ch.body.id,signature:await signer.signMessage({message:ch.body.message})});};
  return {f,call,login,close:async()=>{await new Promise<void>(r=>server.close(()=>r()));f.store.close();}};
}
test('claim HTTP requires Telegram auth, CSRF, origin and rejects caller-supplied payload',async()=>{
  const s=await setup();try{
    assert.equal((await s.call('claim/prepare')).body.code,'AUTH_STALE');await s.login();
    assert.equal((await s.call('claim/prepare',{}, {'x-csrf-token':'forged'})).status,400);
    assert.equal((await s.call('claim/prepare',{}, {origin:'https://wrong.example'})).status,400);
    for(const payload of [{to:signer.address},{data:'0x00'},{value:1},{chainId:1}])assert.equal((await s.call('claim/prepare',payload)).status,400);
    assert.equal(s.f.simulations(),0);
  }finally{await s.close();}
});
test('HTTP confirmation binds exact review, consumes once, preserves swap execution OFF',async()=>{
  const s=await setup();try{await s.login();const review=(await s.call('claim/prepare')).body;assert.equal(review.state,'CLAIM_SIMULATED');
    assert.equal((await s.call('claim/confirm',{id:review.id,version:'c'.repeat(64)})).status,400);
    const ok=await s.call('claim/confirm',{id:review.id,version:review.version});assert.equal(ok.status,200);assert.equal(ok.body.transaction.value,'0x0');
    assert.equal((await s.call('claim/confirm',{id:review.id,version:review.version})).status,400);
    assert.equal((await s.call('confirm',{id:review.id,version:review.version})).body.code,'EXECUTION_DISABLED');assert.equal(s.f.submitted(),0);
  }finally{await s.close();}
});
test('claim API errors never expose raw RPC/secret data and stale sessions cannot prepare',async()=>{
  const s=await setup();try{await s.login();const secret='seed phrase private rpc api-key';s.f.chain.simulate=async()=>{throw Error(secret);};const r=await s.call('claim/prepare');assert.equal(r.status,400);assert(!JSON.stringify(r).includes(secret));s.f.advance(900001);assert.equal((await s.call('claim/prepare')).body.code,'AUTH_STALE');}
  finally{await s.close();}
});
test('claim diagnostics include only masked sender and allowlisted nonsecret fields',()=>{
  const captured:string[]=[],previous=console.info;console.info=(s:unknown)=>captured.push(String(s));
  try{const wallet='0x'+'d'.repeat(40),s=claimSnapshot(wallet) as any;s.providerError='secret';s.signature='private-signature';claimSimulationLog(wallet,s);const log=captured.join('');assert(!log.includes(wallet));assert(!log.includes('secret'));assert(!log.includes('private-signature'));assert(log.includes('0xdddd…dddd'));assert(log.includes('"chain":11155111'));}
  finally{console.info=previous;}
});

test('HTTP status refresh repairs the existing hash and repeated presses cannot create another transaction',async()=>{
  const s=await setup();try{await s.login();const review=(await s.call('claim/prepare')).body;await s.call('claim/confirm',{id:review.id,version:review.version});s.f.result({state:'invalid'});await s.call('claim/report',{id:review.id,hash:claimHash});s.f.advance(16000);
    s.f.result({state:'verified',balances:{eth:'93805932029893351',usdc:'1000000000000000',xsgd:'1000000000000000'},evidence:claimEvidence()});
    const first=await s.call('claim/refresh',{id:review.id});assert.equal(first.status,200);assert.equal(first.body.state,'CLAIM_BALANCES_VERIFIED');
    for(let i=0;i<3;i++){const repeated=await s.call('claim/refresh',{id:review.id});assert.equal(repeated.status,200);assert.deepEqual(repeated.body,first.body);}
    assert.equal(s.f.simulations(),2);assert.equal(s.f.submitted(),0);assert.equal(s.f.store.claims.list('1').length,1);assert.equal((await s.call('claim/prepare')).body.code,'CLAIM_BUSY');
  }finally{await s.close();}
});

test('authenticated explicit 2-USDC HTTP preview stays read-only, fails closed on liquidity and requires fresh ownership',async()=>{
  const s=await setup();try{
    await s.login();const r=(await s.call('claim/prepare')).body;await s.call('claim/confirm',{id:r.id,version:r.version});
    s.f.result({state:'verified',balances:{eth:'100000000000000000',usdc:'1000000000000000',xsgd:'1000000000000000'},evidence:claimEvidence()});
    await s.call('claim/report',{id:r.id,hash:claimHash});let reads=0;
    s.f.api.getQuote=async request=>{reads++;assert.equal(request.from_amount,'2000000');assert.equal(request.recipient,request.owner_address);const q=wire(request.owner_address);q.route_params.initialDepositAmount=q.route_params.maxInputAmount=q.permit.value_raw=q.permit.eip712.message.value='2000000';return q;};
    const response=await s.call('claim/preview',{id:r.id,amount:'2'});assert.equal(response.status,200);assert.equal(reads,1);
    assert.equal(response.body.state,'PREVIEW');assert.equal(response.body.financialAuthorizationAvailable,false);assert.equal(response.body.version,null);assert.equal(response.body.economics.status,'FAIL');assert.equal(response.body.economics.reason,'UNVERIFIED_COSTS');
    assert.equal((await s.call('confirm',{id:r.id,version:r.version})).body.code,'EXECUTION_DISABLED');
    assert.equal((await s.call('submit',{id:r.id,version:r.version,signature:'0x'+'a'.repeat(130),permitSignature:'0x'+'b'.repeat(130)})).body.code,'EXECUTION_DISABLED');
    assert.equal((await s.call('claim/preview',{id:r.id,amount:'5'})).status,400);assert.equal(reads,1);
    s.f.api.getQuote=async request=>{reads++;assert.equal(request.from_amount,'2000000');throw new AppError('NO_LIQUIDITY');};
    assert.equal((await s.call('claim/preview',{id:r.id,amount:'2'})).body.code,'NO_LIQUIDITY');assert.equal(reads,2);
    assert.equal(s.f.store.wallet.list('1').length,0);assert.equal(s.f.submitted(),0);
    s.f.advance(900001);assert.equal((await s.call('claim/preview',{id:r.id,amount:'2'})).body.code,'AUTH_STALE');assert.equal(reads,2);
  }finally{await s.close();}
});
