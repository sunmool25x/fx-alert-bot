import test,{type TestContext} from'node:test';import assert from'node:assert/strict';import{mkdtempSync,rmSync,readdirSync,readFileSync}from'node:fs';import{tmpdir}from'node:os';import{join}from'node:path';import{DatabaseSync}from'node:sqlite';
import{permitPanel}from'../web/permit-panel.js';import{TradeContinuation,requestContinuationReview,quoteRequestButton,type TradeContext}from'../web/quote-continuation.js';
import type{NoSignatureEvidence}from'../src/permits/reconciliation.js';import{migratePermits}from'../src/database/permits.js';
import{fixture,wire,signer,other,deploymentFixture}from'./trade-helpers.js';import{NOW}from'./helpers.js';import{PermitService}from'../src/permits/service.js';import{PERMIT_SPENDER,checkPermit,verifyPermit,permitDigest}from'../src/permits/protocol.js';import{permitData,hashes,USDC,XSGD,type ExecutionQuote}from'../src/trades/contract.js';import{decryptPermit}from'../src/permits/crypto.js';import{PermitFlow,permitWalletError,type PermitView}from'../web/permit-flow.js';import{AppError}from'../src/utils/errors.js';import{WalletFlowError}from'../web/connection.js';import{SqliteStore}from'../src/database/store.js';import{walletConfig}from'../src/wallet/config.js';
const key='ab'.repeat(32);
function removeRetirementMigration(db:DatabaseSync){
  for(const row of db.prepare("SELECT name FROM sqlite_master WHERE type='trigger'").all()){const name=String(row.name);assert(/^[a-z_]+$/.test(name));db.exec('DROP TRIGGER '+name);}
  db.exec('DROP TABLE permit_retirements;DELETE FROM schema_migrations WHERE version IN (13,14);CREATE UNIQUE INDEX IF NOT EXISTS one_open_permit_wallet ON permit_acceptance(wallet) WHERE closed_at IS NULL');
}
test('migration 10 makes one consistent backup and preserves existing funding and continuation schema',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'fx-permit-migration-')),path=join(dir,'state.sqlite');let store=new SqliteStore(path,900000,()=>NOW);
  try{await store.touch('1');const id=await store.saveIntent('1',USDC,XSGD,'50');store.close();const previous=new DatabaseSync(path);removeRetirementMigration(previous);previous.exec('DROP TABLE permit_results;DROP TABLE permit_reviews;DROP TABLE permit_events;DROP TABLE permit_acceptance;DELETE FROM schema_migrations WHERE version IN (10,11,12)');previous.close();
    store=new SqliteStore(path,900000,()=>NOW);assert.equal((await store.intent(id,'1'))!.amount,'50');const backups=readdirSync(dir).filter(f=>f.includes('before-phase7i-'));assert.equal(backups.length,1);
    const backup=new DatabaseSync(join(dir,backups[0]!),{readOnly:true});assert.equal(backup.prepare('PRAGMA integrity_check').get()!.integrity_check,'ok');assert.equal(backup.prepare('SELECT version FROM schema_migrations WHERE version=10').get(),undefined);assert.equal(backup.prepare('SELECT amount FROM quote_intents WHERE id=?').get(id)!.amount,'50');backup.close();
  }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
async function setup(path=':memory:'){
  const f=await fixture(path);Object.assign(f.config.wallet,{enabled:false,permitOnly:true,permitWallet:signer.address.toLowerCase(),permitKey:key});
  const d={...deploymentFixture,sor_address:PERMIT_SPENDER};f.api.liveConfig=async()=>d;let quotes=0,nonce=0n,permitReads=0;
  f.api.getQuote=async request=>{quotes++;const q=wire(request.owner_address,quotes);q.expires_at=Math.floor(f.now()/1000)+30;
    Object.assign(q.route_params,{initialDepositAmount:'50000000',maxInputAmount:'50000000',minOutputAmount:'60000000',deadline:request.expiration});
    Object.assign(q.permit,{spender:PERMIT_SPENDER,value_raw:'50000000',nonce:nonce.toString(),suggested_deadline:request.expiration});Object.assign(q.permit.eip712.message,{spender:PERMIT_SPENDER,value:'50000000',nonce:nonce.toString(),deadline:request.expiration});
    q.fee_breakdown={gas_cost_from_token:'2',gas_cost_usd:'2'};q.quote_breakdown={gas_mode:'receive_less',input_token:USDC,output_token:XSGD,input_amount_before_gas:'50000000',input_amount_after_gas:'50000000',output_amount_before_gas:'62500000',output_amount_after_gas:'60000000',gas_cost_input_token:'2000000',gas_cost_output_token:'2500000',gas_cost_usd:'2'};return q;
  };
  f.chain.permit=async(_d,q)=>{permitReads++;if(BigInt(q.permit.nonce)!==nonce)throw new AppError('INVALID_PERMIT');};
  const id=await f.store.saveIntent('1',USDC,XSGD,'50');f.store.continuations.select(id,'1');
  const service=new PermitService(f.store,f.service,f.api,f.chain,f.config,f.now);
  return{...f,id,permit:service,quotes:()=>quotes,permitReads:()=>permitReads,setNonce:(v:bigint)=>nonce=v,async prepare(){return service.prepare(f.session,id,'ko');},async request(v:PermitView){return service.request(f.session,v.id,v.version,'ko');}};
}
test('exact fresh 50-USDC Permit is verified, encrypted and stops at PERMIT_SIGNED without any executable trade',async()=>{
  const f=await setup();try{
    const v=await f.prepare();assert.equal(v.context.amount,'50');assert.equal(v.economics.status,'PASS');assert.equal(f.quotes(),1);assert.equal(v.requested,false);assert.match(JSON.stringify(v.details),/금융 승인/);
    const issued=await f.request(v);assert.equal(issued.permit.message.value,'50000000');assert.equal(issued.permit.message.spender,PERMIT_SPENDER);assert.equal(issued.permit.domain.verifyingContract,USDC);assert.equal(issued.permit.domain.chainId,11155111);assert.equal(f.permitReads(),2);assert.equal('intent' in issued,false);
    const row=f.store.permits.row(v.id,'1')!,q=JSON.parse(row.payload).quote as ExecutionQuote,sig=await signer.signTypedData(permitData(q));
    const saved=await f.permit.record(f.session,v.id,v.version,sig,'ko');assert.equal(saved.state,'PERMIT_SIGNED');assert.equal(saved.signatureStored,true);assert(!JSON.stringify(saved).includes(sig));
    const persisted=f.store.permits.row(v.id,'1')!;assert(persisted.encrypted_signature);assert(!persisted.encrypted_signature.includes(sig));assert.equal(decryptPermit(persisted.encrypted_signature,key,persisted.id+':1:'+persisted.version),sig.toLowerCase());
    assert.throws(()=>decryptPermit(persisted.encrypted_signature!,key,'other-row'));assert.equal(saved.intentSigningAvailable,false);assert.equal(saved.submissionAvailable,false);assert.equal(f.store.wallet.list('1').length,0);assert.equal(f.submitted(),0);
    await assert.rejects(f.service.submit(f.session,v.id,v.version,sig,sig),{code:'EXECUTION_DISABLED'});await assert.rejects(f.request(v),{code:'PERMIT_LOCKED'});
  }finally{f.store.close();}
});
test('quote expiry after signing keeps verified Permit evidence separate from quote/Intent validity and prevents reuse',async()=>{
  const f=await setup();try{const v=await f.prepare();await f.request(v);const p=JSON.parse(f.store.permits.row(v.id,'1')!.payload),sig=await signer.signTypedData(permitData(p.quote));f.advance(35000);
    const r=await f.permit.record(f.session,v.id,v.version,sig,'en');assert(r.quoteExpired);assert(!r.intentExpired);assert(!r.permitExpired);assert.equal(r.permitValidity,'MAY_REMAIN_VALID_UNTIL_DEADLINE');assert.equal(r.state,'PERMIT_SIGNED');
    await assert.rejects(f.prepare(),{code:'PERMIT_LOCKED'});f.advance(300000);const stale=f.permit.status(f.session,'en')!;assert(stale.permitExpired);assert(stale.intentExpired);assert.equal(stale.permitValidity,'DEADLINE_EXPIRED');assert.equal(stale.signatureStored,true);
  }finally{f.store.close();}
});
test('expired quote is never dispatched; stale nonce is read on chain again before the single Permit request',async()=>{
  const f=await setup();try{let v=await f.prepare();f.advance(31000);await assert.rejects(f.request(v),{code:'QUOTE_STALE'});assert.equal(f.store.permits.row(v.id,'1')!.requested_at,null);
    v=await f.prepare();f.setNonce(1n);await assert.rejects(f.request(v),{code:'INVALID_PERMIT'});assert.equal(f.store.permits.row(v.id,'1')!.requested_at,null);
    v=await f.prepare();assert.equal(v.permitNonce,'1');const issued=await f.request(v);assert.equal(issued.permit.message.nonce,'1');
  }finally{f.store.close();}
});
for(const field of ['spender','amount','wallet','chain','token','schema','deadline'] as const)test('invalid Permit '+field+' stops before a wallet request',async()=>{
  const f=await setup();try{const original=f.api.getQuote;f.api.getQuote=async r=>{const q=await original(r) as ExecutionQuote;
    if(field==='spender')q.permit.eip712.message.spender=other.address;
    if(field==='amount')q.permit.eip712.message.value=(2n**256n-1n).toString();
    if(field==='wallet')q.permit.eip712.message.owner=other.address;
    if(field==='chain')(q.permit.eip712.domain as any).chainId=1;
    if(field==='token')q.permit.eip712.domain.verifyingContract=XSGD;
    if(field==='schema')q.permit.eip712.types.Permit[0]!.name='wrong';
    if(field==='deadline')q.permit.eip712.message.deadline=NOW/1000-1;return q;
  };await assert.rejects(f.prepare());assert.equal(f.store.permits.forWallet(signer.address),undefined);assert.equal(f.submitted(),0);
  }finally{f.store.close();}
});
test('unexpected official spender and extreme costs stop even when other quote fields are valid',async()=>{
  const f=await setup();try{f.api.liveConfig=async()=>({...deploymentFixture,sor_address:'0x'+'4'.repeat(40)});await assert.rejects(f.prepare());f.api.liveConfig=async()=>({...deploymentFixture,sor_address:PERMIT_SPENDER});const original=f.api.getQuote;
    f.api.getQuote=async r=>{const q=await original(r) as ExecutionQuote;q.fee_breakdown={gas_cost_from_token:'30',gas_cost_usd:'30'};q.quote_breakdown!.gas_cost_usd='30';q.quote_breakdown!.gas_cost_input_token='30000000';return q;};
    await assert.rejects(f.prepare(),{code:'COST_REVIEW_BLOCKED'});assert.equal(f.store.permits.forWallet(signer.address),undefined);
  }finally{f.store.close();}
});
test('server CAS prevents duplicate dispatch across concurrent taps, refresh, and a new context',async()=>{
  const f=await setup();try{const v=await f.prepare(),results=await Promise.allSettled([f.request(v),f.request(v)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    const id=await f.store.saveIntent('1',USDC,XSGD,'50');await assert.rejects(f.permit.prepare(f.session,id,'ko'),{code:'PERMIT_LOCKED'});assert.equal(f.submitted(),0);
  }finally{f.store.close();}
});
test('wrong owner, session epoch and user cannot request or read acceptance',async()=>{
  const f=await setup();try{const v=await f.prepare();await assert.rejects(f.permit.request({...f.session,epoch:99},v.id,v.version,'ko'),{code:'WALLET_REQUIRED'});
    await assert.rejects(f.permit.request({...f.session,user_id:'2'},v.id,v.version,'ko'),{code:'PERMIT_DISABLED'});f.config.wallet.permitWallet=other.address;await assert.rejects(f.request(v),{code:'WALLET_REQUIRED'});
  }finally{f.store.close();}
});
for(const failure of ['wrongSigner','wrongDigest','highS'] as const)test('returned signature '+failure+' is rejected without storing it',async()=>{
  const f=await setup();try{const v=await f.prepare();await f.request(v);const p=JSON.parse(f.store.permits.row(v.id,'1')!.payload);let sig=await (failure==='wrongSigner'?other:signer).signTypedData(permitData(p.quote));
    if(failure==='highS')sig=(sig.slice(0,66)+'f'.repeat(64)+sig.slice(130)) as typeof sig;
    if(failure==='wrongDigest'){p.quote.permit.eip712.message.nonce='99';sig=await signer.signTypedData(permitData(p.quote));}
    await assert.rejects(f.permit.record(f.session,v.id,v.version,sig,'en'),{code:'INVALID_PERMIT'});assert.equal(f.store.permits.row(v.id,'1')!.state,'PERMIT_INVALID');assert.equal(f.store.permits.row(v.id,'1')!.encrypted_signature,null);
  }finally{f.store.close();}
});
test('rejection and transport failures are terminal and preserve only safe numeric provider error codes',async()=>{
  for(const code of ['USER_REJECTED','WALLET_TRANSPORT_ERROR','WALLET_TIMEOUT'] as const){const f=await setup();try{const v=await f.prepare();await f.request(v);const result=f.permit.fail(f.session,v.id,v.version,code,code==='USER_REJECTED'?4001:-32000,'en');assert.equal(result.error,code);assert.equal(result.requested,true);await assert.rejects(f.prepare(),{code:'PERMIT_LOCKED'});assert.equal(f.submitted(),0);}finally{f.store.close();}}
});
test('Permit-only configuration defaults off and refuses simultaneous execution or missing scoped secrets',()=>{
  assert.equal(walletConfig({}).permitOnly,false);
  const env={ENABLE_TESTNET_PERMIT_ONLY:'true',EXECUTION_USER_IDS:'1',SEPOLIA_RPC_URL:'https://rpc.example',SIGNING_ORIGIN:'https://bot.example',WALLETCONNECT_PROJECT_ID:'0'.repeat(32),TESTNET_PERMIT_WALLET:signer.address,PERMIT_STORAGE_KEY:key};assert(walletConfig(env).permitOnly);
  for(const change of [{ENABLE_TESTNET_EXECUTION:'true'},{EXECUTION_USER_IDS:'1,2'},{PERMIT_STORAGE_KEY:''},{TESTNET_PERMIT_WALLET:''}])assert.throws(()=>walletConfig({...env,...change}));
});
test('encrypted Permit and one-request lock survive database restart; forgetting cannot clear a financial lock',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'fx-permit-')),path=join(dir,'state.sqlite');const f=await setup(path);let store:SqliteStore|undefined;try{const v=await f.prepare();await f.request(v);const q=JSON.parse(f.store.permits.row(v.id,'1')!.payload).quote,sig=await signer.signTypedData(permitData(q));await f.permit.record(f.session,v.id,v.version,sig,'ko');await assert.rejects(f.store.forget('1'),{code:'PERMIT_LOCKED'});f.store.close();store=new SqliteStore(path,900000,f.now);assert.equal(store.permits.forWallet(signer.address)!.state,'PERMIT_SIGNED');assert(!JSON.stringify(store.permits.forWallet(signer.address)).includes(sig));const db=new DatabaseSync(path,{readOnly:true});assert.equal(db.prepare('PRAGMA integrity_check').get()!.integrity_check,'ok');assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);db.close();}finally{store?.close();try{f.store.close();}catch{}rmSync(dir,{recursive:true,force:true});}
});
async function browserFlow(error?:unknown,handoffError?:unknown){const f=await setup(),v=await f.prepare(),paths:string[]=[],rpcs:string[]=[];let handoffs=0;
  const api=async(path:string,body:any={})=>{paths.push(path);if(path==='permit/prepare')return f.prepare();if(path==='permit/request')return f.permit.request(f.session,body.id,body.version,'ko');if(path==='permit/observation')return f.permit.observation(f.session,body.id,body.version,body.kind);if(path==='permit/record')return f.permit.record(f.session,body.id,body.version,body.signature,'ko');if(path==='permit/failure')return f.permit.fail(f.session,body.id,body.version,body.code,body.rpc,'ko');if(path==='permit/status')return{review:f.permit.status(f.session,'ko')};throw Error('Forbidden operation '+path);};
  const provider={choice:'okx',accounts:[signer.address],chainId:11155111,session:{},connect:async()=>{},disconnect:async()=>{},on:()=>{},request:async({method,params}:{method:string;params:unknown[]})=>{rpcs.push(method);assert.equal(method,'eth_signTypedData_v4');const data=JSON.parse(params[1] as string);assert.equal(data.primaryType,'Permit');if(error)throw error;const q=JSON.parse(f.store.permits.row(v.id,'1')!.payload).quote;return signer.signTypedData(permitData(q));}};
  const flow=new PermitFlow({api,provider:()=>provider,wallet:()=>signer.address,epoch:()=>f.session.epoch,guard:()=>{},changed:()=>{},handoff:()=>{handoffs++;if(handoffError)throw handoffError;},now:f.now});await flow.prepare(f.id);return{f,flow,paths,rpcs,provider,handoffs:()=>handoffs};
}
test('invalid callback refreshes authoritative SIGNATURE_INVALID view without a second failure or signature request',async()=>{
  const b=await browserFlow();try{
    b.provider.request=async()=>{const q=JSON.parse(b.f.store.permits.forWallet(signer.address)!.payload).quote;return other.signTypedData(permitData(q));};
    await assert.rejects(b.flow.sign(),{code:'INVALID_PERMIT'});assert.equal(b.flow.view!.state,'PERMIT_INVALID');assert.equal(b.flow.view!.stage,'SIGNATURE_INVALID');assert.equal(b.flow.view!.result!.validation_code,'SIGNER_MISMATCH');assert.equal(b.paths.filter(p=>p==='permit/record').length,1);assert.equal(b.paths.filter(p=>p==='permit/failure').length,0);assert(b.paths.includes('permit/status'));await assert.rejects(b.flow.sign(),{code:'PERMIT_LOCKED'});assert.equal(b.f.submitted(),0);
  }finally{b.f.store.close();}
});
test('valid late Permit is retained even after its own deadline; cryptography is separate from temporal usability',async()=>{
  const f=await setup();try{const v=await f.prepare();await f.request(v);const r=f.store.permits.row(v.id,'1')!,q=JSON.parse(r.payload).quote,sig=await signer.signTypedData(permitData(q));f.advance(301000);
    const saved=await f.permit.record(f.session,v.id,v.version,sig,'en');assert.equal(saved.state,'PERMIT_SIGNED');assert(saved.quoteExpired);assert(saved.permitExpired);assert.equal(saved.result!.crypto_valid,1);assert.equal(saved.result!.quote_expired,1);assert.equal(saved.result!.permit_expired,1);assert.equal(saved.permitValidity,'DEADLINE_EXPIRED');assert(saved.signatureStored);assert(!JSON.stringify(saved).includes(sig));await assert.rejects(f.prepare(),{code:'PERMIT_LOCKED'});assert.equal(f.submitted(),0);
  }finally{f.store.close();}
});
test('late quote response is encrypted against ORIGINAL Permit and never reused, even when nonce changed',async()=>{
  const f=await setup();try{const v=await f.prepare();await f.request(v);const r=f.store.permits.row(v.id,'1')!,sig=await signer.signTypedData(permitData(JSON.parse(r.payload).quote));f.advance(31000);f.setNonce(1n);
    const saved=await f.permit.record(f.session,v.id,v.version,sig,'ko');assert.equal(saved.state,'PERMIT_SIGNED');assert.equal(saved.result!.crypto_valid,1);assert.equal(saved.result!.chain_status,'MISMATCH');assert(saved.quoteExpired);assert(!saved.permitExpired);assert.equal(f.store.permits.row(v.id,'1')!.payload,r.payload);assert.equal(decryptPermit(f.store.permits.row(v.id,'1')!.encrypted_signature!,key,r.id+':1:'+r.version),sig.toLowerCase());assert.equal(f.submitted(),0);
  }finally{f.store.close();}
});
test('read-only RPC outage after signature does not discard a cryptographically valid original Permit',async()=>{
  const f=await setup();try{const v=await f.prepare();await f.request(v);const q=JSON.parse(f.store.permits.row(v.id,'1')!.payload).quote;f.chain.permit=async()=>{throw new AppError('RPC_UNAVAILABLE');};const saved=await f.permit.record(f.session,v.id,v.version,await signer.signTypedData(permitData(q)),'en');assert(saved.signatureStored);assert.equal(saved.result!.crypto_valid,1);assert.equal(saved.result!.chain_status,'UNKNOWN');assert.equal(saved.submissionAvailable,false);}finally{f.store.close();}
});
test('historical callback without retained bytes is UNKNOWN and cannot be refreshed or signed again',async()=>{
  const f=await setup();try{const v=await f.prepare();await f.request(v);const r=f.store.permits.row(v.id,'1')!;f.store.permits.event(r,'CALLBACK_RECEIVED');f.store.permits.failed(r,'PERMIT_INVALID','INVALID_PERMIT');const view=f.permit.status(f.session,'en')!;assert.equal(view.state,'RESULT_UNKNOWN');assert.equal(view.signatureClassification,'D');assert.equal(view.error,'PERMIT_RESULT_UNKNOWN');assert.equal(f.store.permits.row(v.id,'1')!.state,'PERMIT_INVALID');await assert.rejects(f.prepare(),{code:'PERMIT_LOCKED'});assert.equal(f.submitted(),0);}finally{f.store.close();}
});
test('unexpected wallet response shape stays UNKNOWN without logging or storing arbitrary provider objects',async()=>{
  const f=await setup();try{const v=await f.prepare();await f.request(v);const result=await f.permit.record(f.session,v.id,v.version,{sensitive:'fixture-private'},'en');assert.equal(result.state,'RESULT_UNKNOWN');assert.equal(result.result!.validation_code,'RESPONSE_SHAPE');assert.equal(result.result!.crypto_valid,null);assert(!JSON.stringify(result).includes('fixture-private'));await assert.rejects(f.prepare(),{code:'PERMIT_LOCKED'});}finally{f.store.close();}
});
test('expiry during server preflight reserves nothing and supports explicit refresh of the same 50-USDC continuation',async()=>{
  const b=await browserFlow();try{const original=b.f.chain.deployment;b.f.chain.deployment=async()=>{b.f.advance(26000);};await assert.rejects(b.flow.sign(),{code:'QUOTE_STALE'});assert.equal(b.rpcs.length,0);assert.equal(b.flow.locked,false);const old=b.f.store.permits.forWallet(signer.address)!;assert.equal(old.requested_at,null);assert(b.f.store.permits.events(old).some(e=>e.kind==='PREFLIGHT_QUOTE_STALE'));b.f.chain.deployment=original;
    const fresh=await b.flow.prepare(b.f.id);assert.notEqual(fresh.version,old.version);assert.equal(fresh.context.amount,'50');assert.equal(b.f.store.permits.forWallet(signer.address)!.intent_id,old.intent_id);assert.equal(b.rpcs.length,0);assert.equal(b.f.submitted(),0);
  }finally{b.f.store.close();}
});
test('expiry after reservation but before dispatch stays locked rather than masquerading as invalid signature',async()=>{
  const f=await setup();try{let rpcs=0;const flow=new PermitFlow({api:async(path,body:any)=>{if(path==='permit/prepare')return f.prepare();if(path==='permit/request'){const v=await f.request(body);f.advance(26000);return v;}if(path==='permit/failure')return f.permit.fail(f.session,body.id,body.version,body.code,body.rpc,'en');throw Error('Unexpected '+path);},provider:()=>({choice:'okx',accounts:[signer.address],chainId:11155111,request:async()=>{rpcs++;},on:()=>{},connect:async()=>{},disconnect:async()=>{}}),wallet:()=>signer.address,epoch:()=>f.session.epoch,guard:()=>{},changed:()=>{},handoff:()=>{},now:f.now});await flow.prepare(f.id);await assert.rejects(flow.sign(),{code:'QUOTE_STALE'});assert.equal(rpcs,0);assert.equal(f.store.permits.forWallet(signer.address)!.state,'RESULT_UNKNOWN');assert.equal(f.store.permits.forWallet(signer.address)!.error_code,'QUOTE_STALE');assert.equal(f.store.permits.result(f.store.permits.forWallet(signer.address)!),undefined);await assert.rejects(flow.prepare(f.id),{code:'PERMIT_LOCKED'});}finally{f.store.close();}
});
test('pending wallet request can be opened repeatedly without resend and a delayed original signature is retained',async()=>{
  const b=await browserFlow();try{let resolve!:(s:string)=>void;const result=new Promise<string>(r=>{resolve=r;});b.provider.request=async()=>{b.rpcs.push('eth_signTypedData_v4');return result as any;};const signing=b.flow.sign();for(let n=0;n<20&&!b.flow.canOpenWallet;n++)await new Promise<void>(r=>setImmediate(r));assert(b.flow.canOpenWallet);assert.equal(b.handoffs(),1);b.flow.reopenWallet();b.flow.reopenWallet();assert.equal(b.handoffs(),3);assert.equal(b.rpcs.length,1);await assert.rejects(b.flow.sign(),{code:'PERMIT_LOCKED'});b.f.advance(31000);const r=b.f.store.permits.forWallet(signer.address)!,sig=await signer.signTypedData(permitData(JSON.parse(r.payload).quote));resolve(sig);await signing;assert.equal(b.flow.view!.state,'PERMIT_SIGNED');assert.equal(b.flow.view!.result!.quote_expired,1);assert.equal(b.flow.view!.result!.crypto_valid,1);assert(!b.flow.canOpenWallet);assert.throws(()=>b.flow.reopenWallet(),{code:'PERMIT_LOCKED'});assert.equal(b.rpcs.length,1);assert.equal(b.f.submitted(),0);}finally{b.f.store.close();}
});
test('late callback after transport timeout reconciles original encrypted evidence without another wallet request',async()=>{
  const b=await browserFlow(new WalletFlowError('WALLET_TIMEOUT'));try{let late:((value:unknown)=>void)|undefined;b.provider.on=(event?:any,fn?:any)=>{if(event==='permitLateResult')late=fn;};await assert.rejects(b.flow.sign(),{code:'WALLET_TIMEOUT'});assert.equal(b.flow.view!.state,'RESULT_UNKNOWN');b.f.advance(121000);const r=b.f.store.permits.forWallet(signer.address)!,sig=await signer.signTypedData(permitData(JSON.parse(r.payload).quote));assert(late);late(sig);for(let n=0;n<30&&String(b.flow.view!.state)!=='PERMIT_SIGNED';n++)await new Promise<void>(resolve=>setImmediate(resolve));assert.equal(b.flow.view!.state,'PERMIT_SIGNED');assert.equal(b.flow.view!.result!.crypto_valid,1);assert.equal(b.flow.view!.result!.quote_expired,1);late(sig);assert.equal(b.paths.filter(p=>p==='permit/record').length,1);assert.equal(b.rpcs.length,1);assert.equal(b.f.submitted(),0);}finally{b.f.store.close();}
});
test('refresh archives every unrequested package rather than overwriting evidence, without extending its TTL',async()=>{const f=await setup();try{const first=await f.prepare(),r=f.store.permits.row(first.id,'1')!;f.advance(31000);const second=await f.prepare(),db=(f.store as unknown as{db:DatabaseSync}).db;const rows=db.prepare('SELECT * FROM permit_reviews WHERE permit_id=? ORDER BY prepared_at').all(first.id);assert.equal(rows.length,2);assert.equal(rows[0]!.payload,r.payload);assert.equal(JSON.parse(String(rows[0]!.payload)).quote.expires_at*1000,first.quoteExpiresAt);assert.notEqual(rows[0]!.version,rows[1]!.version);assert.equal(f.store.permits.forWallet(signer.address)!.intent_id,f.id);assert.equal(second.requested,false);}finally{f.store.close();}});
test('migration 12 backs up exact locked request and archives it without fabricating signature evidence',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'fx-permit-evidence-')),path=join(dir,'state.sqlite'),f=await setup(path);const v=await f.prepare();await f.request(v);const before=f.store.permits.row(v.id,'1')!;f.store.close();const old=new DatabaseSync(path);removeRetirementMigration(old);old.exec('DROP TABLE permit_results;DROP TABLE permit_reviews;DELETE FROM schema_migrations WHERE version=12');old.close();const store=new SqliteStore(path,900000,f.now);try{assert.deepEqual(store.permits.row(v.id,'1'),before);assert.equal(store.permits.result(before),undefined);const db=new DatabaseSync(path,{readOnly:true});assert.equal(db.prepare('SELECT payload FROM permit_reviews').get()!.payload,before.payload);db.close();const name=readdirSync(dir).find(n=>n.includes('.before-permit-evidence-'))!;assert(name);const backup=new DatabaseSync(join(dir,name),{readOnly:true});assert.equal(backup.prepare('PRAGMA integrity_check').get()!.integrity_check,'ok');assert.equal(backup.prepare('SELECT state FROM permit_acceptance').get()!.state,'PERMIT_REQUESTED');backup.close();}finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
test('browser flow dispatches exactly one Permit, verifies against original data, persists and never requests Intent or submission',async()=>{const b=await browserFlow();try{const results=await Promise.allSettled([b.flow.sign(),b.flow.sign()]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.deepEqual(b.rpcs,['eth_signTypedData_v4']);assert.equal(b.handoffs(),1);assert.equal(b.flow.view!.state,'PERMIT_SIGNED');assert.deepEqual(b.paths,['permit/prepare','permit/request','permit/observation','permit/observation','permit/observation','permit/record']);const row=b.f.store.permits.forWallet(signer.address)!;assert.deepEqual(b.f.store.permits.events(row).map(e=>e.kind),['REVIEW_PREPARED','CONSENT_AND_CLICK','PREFLIGHT_STARTED','PREFLIGHT_PASS','REQUEST_RESERVED','RPC_DISPATCHED','HANDOFF_REQUESTED','CALLBACK_RECEIVED','SIGNATURE_RECEIVED','SIGNED']);await assert.rejects(b.flow.sign(),{code:'PERMIT_LOCKED'});assert.equal(b.f.submitted(),0);}finally{b.f.store.close();}});
for(const [error,expected] of [[{code:4001,message:'sensitive-provider-data'},'USER_REJECTED'],[{code:-32000,message:'secret'},'WALLET_TRANSPORT_ERROR'],[new WalletFlowError('WALLET_TIMEOUT'),'WALLET_TIMEOUT']] as const)test('browser stops and never retries '+expected,async()=>{const b=await browserFlow(error);try{await assert.rejects(b.flow.sign(),{code:expected});await assert.rejects(b.flow.sign(),{code:'PERMIT_LOCKED'});assert.equal(b.rpcs.length,1);assert.equal(b.paths.at(-1),'permit/failure');assert(!JSON.stringify(b.flow.view).includes('sensitive-provider-data'));}finally{b.f.store.close();}});
test('uncertain request acknowledgement locks browser without dispatching a financial signature',async()=>{const f=await setup();try{let requests=0;const v=await f.prepare();const flow=new PermitFlow({api:async path=>{if(path==='permit/prepare')return v;throw new WalletFlowError('UNAVAILABLE');},provider:()=>({choice:'okx',accounts:[signer.address],chainId:11155111,request:async()=>{requests++;},connect:async()=>{},disconnect:async()=>{},on:()=>{}}),wallet:()=>signer.address,epoch:()=>0,guard:()=>{},changed:()=>{},handoff:()=>{},now:f.now});await flow.prepare(f.id);await assert.rejects(flow.sign(),{code:'UNAVAILABLE'});flow.invalidate();await assert.rejects(flow.sign(),{code:'PERMIT_LOCKED'});assert.equal(requests,0);}finally{f.store.close();}});
test('handoff navigation failure does not discard a valid callback or issue another request',async()=>{const b=await browserFlow(undefined,new Error('fixture handoff failure'));try{await b.flow.sign();assert.equal(b.flow.view!.state,'PERMIT_SIGNED');assert.equal(b.rpcs.length,1);assert.equal(b.paths.filter(p=>p==='permit/record').length,1);assert(!b.paths.includes('permit/failure'));await assert.rejects(b.flow.sign(),{code:'PERMIT_LOCKED'});assert.equal(b.f.submitted(),0);}finally{b.f.store.close();}});

class PermitElement{
  children:PermitElement[]=[];dataset:Record<string,string>={};textContent='';disabled=false;checked=false;hidden=false;onclick?:()=>void;onchange?:()=>void;focused=false;scrolled=false;
  append(...v:PermitElement[]){this.children.push(...v);}prepend(...v:PermitElement[]){this.children.unshift(...v);}replaceChildren(...v:PermitElement[]){this.children=v;}
  setAttribute(){}focus(){this.focused=true;}scrollIntoView(){this.scrolled=true;}
  all():PermitElement[]{return[this,...this.children.flatMap(c=>c.all())];}
  querySelector(selector:string){const key=selector.slice(6,-1).replace(/-([a-z])/g,(_,c:string)=>c.toUpperCase());return this.all().find(e=>key in e.dataset)??null;}
}
async function navigation(t:TestContext,language:'ko'|'en'='ko'){
  const timers:(()=>void)[]=[];t.mock.method(globalThis,'setInterval',(fn:()=>void)=>{timers.push(fn);return 0 as any;});
  const original=Object.getOwnPropertyDescriptor(globalThis,'document');Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>new PermitElement(),createTextNode:(text:string)=>Object.assign(new PermitElement(),{textContent:text})}});
  const f=await setup();t.after(()=>{f.store.close();if(original)Object.defineProperty(globalThis,'document',original);else Reflect.deleteProperty(globalThis,'document');});
  let epoch=0,owned=true,readOnly=0,rpcs=0;const paths:string[]=[],root=new PermitElement(),actions=new PermitElement();let decorate=(v:PermitView)=>v;
  const context:TradeContext={id:f.id,amount:'50',fromSymbol:'USDC',toSymbol:'XSGD',chainId:11155111,expiresAt:NOW+900000};
  const api=async(path:string,body?:any)=>{paths.push(path);if(path==='context')return {...context};if(path==='permit/prepare'){assert.deepEqual(body,{intent:f.id});try{return decorate(await f.prepare());}catch(e){throw new WalletFlowError((e as AppError).code);}}if(path==='permit/status')return{review:f.permit.status(f.session,language)};if(path==='preview')return{financialAuthorizationAvailable:false,state:'PREVIEW',context};throw Error('Forbidden financial request '+path);};
  const provider={choice:'okx',accounts:[signer.address],chainId:11155111,session:{},connect:async()=>{},disconnect:async()=>{},on:()=>{},request:async()=>{rpcs++;throw Error('Automatic wallet request forbidden');}};
  const guard=()=>{if(!owned)throw new WalletFlowError('WALLET_REQUIRED');};
  const panel=permitPanel({root:root as unknown as HTMLElement,language,api,provider:()=>provider,wallet:()=>signer.address,epoch:()=>epoch,guard,handoff:()=>{},pending:()=>{},now:f.now});
  const continuation=new TradeContinuation({api,id:f.id,changed:()=>{},now:f.now});await continuation.restore();
  const route=(permitOnly=true)=>requestContinuationReview({continuation,permitOnly,preparePermit:panel.prepare,guard,epoch:()=>epoch,showReadOnly:()=>{readOnly++;}});
  const action=quoteRequestButton({root:actions as unknown as HTMLElement,language,hasContext:()=>continuation.valid(),renew:async()=>{owned=true;},request:()=>route()});
  const find=(key:string)=>root.all().find(e=>key in e.dataset)!;
  return{f,root,actions,panel,continuation,context,action,route,paths,provider,find,clock:()=>timers.forEach(fn=>fn()),readOnly:()=>readOnly,rpcs:()=>rpcs,expireOwner:()=>{owned=false;},renew:()=>{owned=true;},decorate:(fn:typeof decorate)=>{decorate=fn;},change:()=>{epoch++;panel.invalidate();}};
}
for(const language of ['ko','en'] as const)test('shared fresh Quote action reaches visible '+language+' Permit-only review without any financial RPC',async t=>{
  const n=await navigation(t,language);await n.action.request();assert.deepEqual(n.paths,['context','context','permit/prepare']);assert.equal(n.f.quotes(),1);assert.equal(n.readOnly(),0);assert.equal(n.root.hidden,false);
  const sign=n.find('permitSign');assert.equal(sign.textContent,language==='ko'?'OKX에서 Permit 1회 서명':'Sign Permit once in OKX');assert(sign.disabled);assert.match(n.action.status.textContent!,language==='ko'?/아직 서명을 요청하지/:/No signature has been requested/);
  assert(n.root.all().some(e=>e.scrolled&&e.focused));assert(n.root.all().some(e=>e.textContent.startsWith('PERMIT_REVIEW')));
  n.find('permitConsent').checked=true;n.find('permitConsent').onchange!();assert.equal(sign.disabled,false);assert.equal(n.rpcs(),0);assert.equal(n.f.store.permits.forWallet(signer.address)!.requested_at,null);assert.equal(n.f.submitted(),0);
  assert(!n.root.all().some(e=>e.onclick&&/Intent|submit|제출/.test(e.textContent)));
});
test('unchecked consent explains the disabled action and makes zero request calls',async t=>{const n=await navigation(t);await n.action.request();assert.match(n.find('permitDisabledReason').textContent,/동의란/);n.find('permitSign').onclick!();assert.equal(n.rpcs(),0);assert(!n.paths.includes('permit/request'));assert(!n.find('permitRefresh').disabled);});
test('reading beyond TTL keeps amount, displays expiry beside the action, and explicit refresh clears consent',async t=>{
  const n=await navigation(t);await n.action.request();const old=n.f.store.permits.forWallet(signer.address)!;n.find('permitConsent').checked=true;n.find('permitConsent').onchange!();n.f.advance(60000);n.clock();assert(n.find('permitSign').disabled);assert.match(n.find('permitDisabledReason').textContent,/QUOTE_STALE/);assert.match(n.find('permitClock').textContent,/0s/);assert.equal(n.find('permitConsent').checked,false);assert.equal(n.context.amount,'50');assert(!n.find('permitRefresh').disabled);n.find('permitRefresh').onclick!();for(let i=0;i<20&&n.f.quotes()<2;i++)await new Promise<void>(r=>setImmediate(r));await new Promise<void>(r=>setImmediate(r));assert.equal(n.f.quotes(),2);assert.notEqual(n.f.store.permits.forWallet(signer.address)!.version,old.version);assert(n.find('permitSign').disabled);assert(!n.find('permitConsent').checked);assert.equal(n.rpcs(),0);
});
test('prepare errors are immediately visible next to the action, not only in a remote status message',async t=>{const n=await navigation(t);n.f.api.getQuote=async()=>{throw new AppError('QUOTE_STALE');};await assert.rejects(n.panel.prepare(n.f.id),{code:'QUOTE_STALE'});assert.match(n.find('permitStatus').textContent,/QUOTE_STALE/);assert.equal(n.rpcs(),0);});
test('read-only historical review requires a NEW quote for Permit, never a promotion or cached reuse',async t=>{
  const n=await navigation(t);await n.route(false);assert.equal(n.readOnly(),1);assert(!n.find('permitSign'));await n.action.request();const first=n.f.store.permits.forWallet(signer.address)!;
  n.f.advance(31000);n.clock();assert(n.find('permitSign').disabled);await n.action.request();const next=n.f.store.permits.forWallet(signer.address)!;assert.notEqual(first.version,next.version);assert.equal(n.f.quotes(),2);assert.equal(n.find('permitConsent').checked,false);assert.equal(n.rpcs(),0);assert.equal(next.requested_at,null);
});
test('ownership renewal preserves exact 50 continuation and needs another explicit Quote action',async t=>{
  const n=await navigation(t);n.expireOwner();await n.action.request();assert.match(n.action.status.textContent!,/OWNERSHIP_EXPIRED/);assert.equal(n.f.quotes(),0);n.renew();assert.equal(n.f.quotes(),0);await n.action.request();assert.equal(n.context.amount,'50');assert.equal(n.f.quotes(),1);assert(n.find('permitSign'));assert.equal(n.rpcs(),0);
});
for(const [field,delay] of [['quoteExpiresAt',30000],['ownershipExpiresAt',10000],['contextExpiresAt',10000],['permitDeadline',10000]] as const)test(field+' expiry disables even a previously consented Permit before a click can request anything',async t=>{
  const n=await navigation(t);n.decorate(v=>({...v,[field]:NOW+delay}));await n.action.request();const sign=n.find('permitSign'),consent=n.find('permitConsent');consent.checked=true;consent.onchange!();assert.equal(sign.disabled,false);n.f.advance(delay);sign.onclick!();assert(sign.disabled);assert.equal(consent.checked,false);assert.equal(n.rpcs(),0);assert(!n.paths.includes('permit/request'));
});
test('cost gate block removes old Permit controls and never dispatches signature or relayer',async t=>{
  const n=await navigation(t);await n.action.request();const original=n.f.api.getQuote;n.f.api.getQuote=async r=>{const q=await original(r) as ExecutionQuote;q.fee_breakdown={gas_cost_from_token:'30',gas_cost_usd:'30'};q.quote_breakdown!.gas_cost_input_token='30000000';q.quote_breakdown!.gas_cost_usd='30';return q;};
  await n.action.request();assert(!n.find('permitSign'));assert.match(n.action.status.textContent!,/COST_REVIEW_BLOCKED/);assert.equal(n.rpcs(),0);assert.equal(n.f.submitted(),0);
});
test('two-USDC and disabled capability retain read-only behavior without amount fallback',async t=>{
  const n=await navigation(t);n.context.amount='2';await n.action.request();assert.equal(n.readOnly(),1);assert.equal(n.f.quotes(),0);assert(!n.find('permitSign'));assert.equal(n.context.amount,'2');
});
test('missing Permit component in an enabled 50-USDC flow fails closed instead of misleading read-only success',async t=>{
  const n=await navigation(t);await assert.rejects(requestContinuationReview({continuation:n.continuation,permitOnly:true,guard:()=>{},epoch:()=>0,showReadOnly:()=>{throw Error('Unexpected fallback');}}),{code:'PERMIT_DISABLED'});assert.equal(n.f.quotes(),0);
});
test('late fresh-quote response cannot restore Permit after wallet invalidation',async t=>{
  const n=await navigation(t);const original=n.f.api.getQuote;let release!:()=>void,started!:()=>void;const start=new Promise<void>(r=>started=r);n.f.api.getQuote=async r=>{started();await new Promise<void>(resolve=>release=resolve);return original(r);};
  const pending=n.action.request();await start;n.change();release();await pending;assert(!n.find('permitSign'));assert.match(n.action.status.textContent!,/OWNERSHIP_EXPIRED/);assert.equal(n.rpcs(),0);
});
test('ownership expiry metadata is session bound and server refuses a stale proof before reservation',async()=>{
  const f=await setup();try{const v=await f.prepare();assert.equal(v.ownershipExpiresAt,f.session.expires_at);assert.equal(v.contextExpiresAt,f.store.continuations.get(f.id,'1')!.expires_at);
    const token=f.store.wallet.newSession('1','new-ownership',10000).token;let s=f.store.wallet.session(token)!;f.store.wallet.link(s,signer.address.toLowerCase());s=f.store.wallet.session(token)!;
    const old=f.permit.status(s,'en')!;assert.equal(old.ownershipExpiresAt,0);await assert.rejects(f.permit.request(s,v.id,v.version,'en'),{code:'WALLET_REQUIRED'});
    const fresh=await f.permit.prepare(s,f.id,'en');assert.equal(fresh.ownershipExpiresAt,NOW+10000);f.advance(10000);await assert.rejects(f.permit.request(s,fresh.id,fresh.version,'en'),{code:'AUTH_STALE'});assert.equal(f.store.permits.forWallet(signer.address)!.requested_at,null);assert.equal(f.submitted(),0);
  }finally{f.store.close();}
});
test('financial signature handling never logs or adds signature fields to analytics',()=>{for(const file of ['src/permits/service.ts','src/permits/protocol.ts','src/permits/crypto.ts','src/database/permits.ts','web/permit-flow.ts','web/permit-panel.ts']){const source=readFileSync(file,'utf8');assert(!/console\.|analytics\.|telemetry/.test(source),file);}const app=readFileSync('web/app.ts','utf8');assert.match(app,/if\(c\.permitOnly\)/);assert.match(app,/if\(!allowExecution\)return/);});

async function failedAttempt(path=':memory:'){
  const f=await setup(path),view=await f.prepare();await f.request(view);f.permit.fail(f.session,view.id,view.version,'WALLET_TRANSPORT_ERROR',0,'en');
  const row=f.store.permits.forWallet(signer.address)!;f.advance(301000);
  const evidence:NoSignatureEvidence={reason:'OKX_1_9_1_STRING_REJECTED_BEFORE_DISPATCH',requestId:row.id,version:row.version,digest:row.digest,wallet:row.wallet,reproducedCode:0,walletTransportCalls:0,servedBuildMatched:true,sdkHash:'a'.repeat(64),sourceEvidenceHash:'b'.repeat(64),chainId:11155111,domainVerified:true,independentDigestVerified:true,nonce:'0',allowance:'0',blockTimestamp:Math.floor(f.now()/1000),checkedAt:f.now()};
  return{f,view,row,evidence};
}
test('unknown transport outcome stays locked; verified no-dispatch evidence closes only the expired old attempt',async()=>{
  const {f,row,evidence}=await failedAttempt();try{assert.equal(row.state,'RESULT_UNKNOWN');await assert.rejects(f.prepare(),{code:'PERMIT_LOCKED'});
    f.store.permits.closeNoSignature(row,evidence);const closed=f.store.permits.row(row.id,'1')!;assert.equal(closed.state,'WALLET_ERROR_NO_SIGNATURE');assert.equal(closed.payload,row.payload);assert.equal(closed.requested_at,row.requested_at);assert.equal(closed.encrypted_signature,null);assert(closed.closed_at);assert.equal(f.store.permits.events(closed).at(-1)!.kind,'CLOSED_NO_SIGNATURE');
    await assert.rejects(f.prepare(),{code:'PERMIT_LOCKED'});await assert.rejects(f.request(viewFrom(row)),{code:'PERMIT_LOCKED'});assert.throws(()=>f.store.permits.closeNoSignature(row,evidence),{code:'PERMIT_LOCKED'});assert.equal(f.submitted(),0);
  }finally{f.store.close();}
});
const viewFrom=(r:{id:string;version:string})=>r as PermitView;
for(const field of ['digest','nonce','chainId','walletTransportCalls','servedBuildMatched','blockTimestamp','allowance','checkedAt'] as const)test('no-signature reconciliation rejects bad '+field+' evidence',async()=>{
  const {f,row,evidence}=await failedAttempt();try{const wrong={...evidence,[field]:field==='digest'?'0'.repeat(64):field==='nonce'?'1':field==='allowance'?'50':field==='servedBuildMatched'?false:field==='checkedAt'?f.now()-61000:field==='blockTimestamp'?Math.floor(NOW/1000):1};assert.throws(()=>f.store.permits.closeNoSignature(row,wrong as any));assert.equal(f.store.permits.row(row.id,'1')!.closed_at,null);}finally{f.store.close();}
});
test('any callback-receipt evidence prevents no-signature closure even without an encrypted signature',async()=>{
  const {f,row,evidence}=await failedAttempt();try{f.store.permits.event(row,'CALLBACK_RECEIVED');assert.throws(()=>f.store.permits.closeNoSignature(row,evidence),{code:'PERMIT_LOCKED'});assert.equal(f.store.permits.row(row.id,'1')!.state,'RESULT_UNKNOWN');}finally{f.store.close();}
});
test('a closed no-signature attempt requires new ownership, continuation, quote, id and consent; history remains',async()=>{
  const {f,row,evidence}=await failedAttempt();try{f.store.permits.closeNoSignature(row,evidence);f.advance(1);const nextId=await f.store.saveIntent('1',USDC,XSGD,'50');f.store.continuations.select(nextId,'1');await assert.rejects(f.permit.prepare(f.session,nextId,'en'),{code:'PERMIT_LOCKED'});
    // Reverify the same connected wallet through the ordinary proof/session epoch mechanics.
    f.store.wallet.link(f.session,signer.address.toLowerCase());const renewed=f.store.wallet.session(f.token)!;
    await assert.rejects(f.permit.prepare(renewed,f.id,'en'),{code:'PERMIT_LOCKED'});
    const status=f.permit.status(renewed,'en')!;assert(status.retryEligible);let rpcs=0;
    const flow=new PermitFlow({api:async(path,body:any)=>{if(path==='permit/status')return{review:f.permit.status(renewed,'en')};assert.equal(path,'permit/prepare');return f.permit.prepare(renewed,body.intent,'en');},provider:()=>({choice:'okx',accounts:[signer.address],chainId:11155111,connect:async()=>{},disconnect:async()=>{},on:()=>{},request:async()=>{rpcs++;throw Error('Automatic signing forbidden');}}),wallet:()=>signer.address,epoch:()=>renewed.epoch,guard:()=>{},changed:()=>{},handoff:()=>{},now:f.now});
    await flow.status();flow.invalidate();const fresh=await flow.prepare(nextId);assert.equal(fresh.context.amount,'50');assert.notEqual(fresh.id,row.id);assert.notEqual(fresh.version,row.version);assert.equal(fresh.requested,false);assert.equal(fresh.state,'REVIEW');assert.equal(f.store.permits.row(row.id,'1')!.state,'WALLET_ERROR_NO_SIGNATURE');assert.equal(rpcs,0);assert.equal(f.submitted(),0);
    await assert.rejects(f.permit.request(renewed,row.id,row.version,'en'),{code:'PERMIT_LOCKED'});
  }finally{f.store.close();}
});
test('signed Permit can never be closed as no-signature or replaced by a new request',async()=>{
  const {f,row,evidence}=await failedAttempt();try{assert.throws(()=>f.store.permits.closeNoSignature({...row,id:'unknown'},evidence));f.store.close();}finally{try{f.store.close();}catch{}}
  const b=await browserFlow();try{await b.flow.sign();const signed=b.f.store.permits.forWallet(signer.address)!;b.f.advance(301000);assert.throws(()=>b.f.store.permits.closeNoSignature(signed,{...evidence,requestId:signed.id,version:signed.version,digest:signed.digest,checkedAt:b.f.now(),blockTimestamp:Math.floor(b.f.now()/1000)}),{code:'PERMIT_LOCKED'});await assert.rejects(b.f.prepare(),{code:'PERMIT_LOCKED'});assert.equal(b.f.submitted(),0);}finally{b.f.store.close();}
});
test('migration 11 backs up and preserves the exact failed v10 row without fabricating old callback events',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'fx-permit-v11-')),path=join(dir,'state.sqlite'),{f,row}=await failedAttempt(path);f.store.close();let store:SqliteStore|undefined;
  try{const old=new DatabaseSync(path);removeRetirementMigration(old);old.exec("DROP TABLE permit_results;DROP TABLE permit_reviews;DROP TABLE permit_events;UPDATE permit_acceptance SET state='WALLET_ERROR';ALTER TABLE permit_acceptance RENAME TO temp_v11;DELETE FROM schema_migrations WHERE version IN (10,11,12)");migratePermits(old);const columns=old.prepare('PRAGMA table_info(permit_acceptance)').all().map(c=>c.name).join(',');old.exec('INSERT INTO permit_acceptance SELECT '+columns+' FROM temp_v11;DROP TABLE temp_v11');const before=old.prepare('SELECT * FROM permit_acceptance').get()!;old.close();
    store=new SqliteStore(path,900000,f.now);const migrated=store.permits.row(row.id,'1')!;for(const k of Object.keys(before))assert.equal((migrated as any)[k],before[k]);assert.equal(migrated.closed_at,null);assert.deepEqual(store.permits.events(migrated),[]);
    const backupName=readdirSync(dir).find(n=>n.includes('.before-phase7j-'))!;assert(backupName);const backup=new DatabaseSync(join(dir,backupName),{readOnly:true});assert.equal(backup.prepare('PRAGMA integrity_check').get()!.integrity_check,'ok');assert.equal(backup.prepare('SELECT id FROM permit_acceptance').get()!.id,row.id);assert.equal(backup.prepare('SELECT version FROM schema_migrations WHERE version=11').get(),undefined);backup.close();
  }finally{store?.close();rmSync(dir,{recursive:true,force:true});}
});
