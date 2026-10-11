import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { request } from "node:http";
import { signingServer } from "../src/wallet/server.js";
import { fixture,signer,wire } from "./trade-helpers.js";
import {USDC,XSGD} from '../src/trades/contract.js';
import {AppError} from '../src/utils/errors.js';
import type {DatabaseSync} from 'node:sqlite';
import {BotController} from '../src/bot/controller.js';import type {View} from '../src/bot/view.js';import{fakeMarkets,A,B}from'./helpers.js';
import { NOW } from "./helpers.js";
import{PermitService}from'../src/permits/service.js';import{PERMIT_SPENDER}from'../src/permits/protocol.js';import{deploymentFixture}from'./trade-helpers.js';import{permitData}from'../src/trades/contract.js';
function initData(user=1,nonce='http'){const p=new URLSearchParams({auth_date:String(NOW/1000),user:JSON.stringify({id:user}),query_id:nonce});
  const check=[...p].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+"="+v).join("\n");p.set("hash",createHmac("sha256",createHmac("sha256","WebAppData").update("test-token").digest()).update(check).digest("hex"));return p.toString();}
async function serverFixture(){
  const f=await fixture(),refreshes:string[]=[];f.config.botToken="test-token";const server=signingServer(f.config,f.store,f.chain,f.service,f.now,async user=>{refreshes.push(user);},undefined,new PermitService(f.store,f.service,f.api,f.chain,f.config,f.now));
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));const address=server.address() as {port:number};
  let cookie="",csrf="";
  const call=async(path:string,data:unknown={},headers:Record<string,string>={})=>{
    const response=await new Promise<Response>((resolve,reject)=>{
      const req=request({hostname:"127.0.0.1",port:address.port,path:"/api/"+path,method:"POST",headers:{host:new URL(f.config.wallet.origin).host,origin:f.config.wallet.origin,"content-type":"application/json",cookie,"x-csrf-token":csrf,...headers}},res=>{
        const chunks:Buffer[]=[];res.on("data",c=>chunks.push(c));res.on("end",()=>{const h=new Headers();for(const [key,value]of Object.entries(res.headers))if(value)h.set(key,Array.isArray(value)?value.join(","):value);resolve(new Response(Buffer.concat(chunks),{status:res.statusCode,headers:h}));});
      });req.on("error",reject);req.end(JSON.stringify(data));
    });
    return {response,json:await response.json() as Record<string,unknown>};};
  return {f,call,refreshes,reset(){cookie='';csrf='';},async login(user=1,nonce='http'){const r=await call("auth",{initData:initData(user,nonce)});assert.equal(r.response.status,200,JSON.stringify(r.json));cookie=r.response.headers.get("set-cookie")!.split(";")[0]!;csrf=String(r.json.csrf);return r;},async close(){await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));f.store.close();}};
}

test('HTTP Permit acceptance remains owner/CSRF bound, signs once, with Intent and relayer gates OFF',async()=>{
  const s=await serverFixture();try{
    Object.assign(s.f.config.wallet,{enabled:false,permitOnly:true,permitWallet:signer.address.toLowerCase(),permitKey:'ab'.repeat(32)});
    const id=await s.f.store.saveIntent('1',USDC,XSGD,'50');s.f.store.continuations.select(id,'1');
    s.f.api.liveConfig=async()=>({...deploymentFixture,sor_address:PERMIT_SPENDER});
    s.f.api.getQuote=async r=>{const q=wire(r.owner_address);q.route_params.initialDepositAmount=q.route_params.maxInputAmount=q.permit.value_raw=q.permit.eip712.message.value='50000000';q.route_params.minOutputAmount='60000000';q.permit.spender=q.permit.eip712.message.spender=PERMIT_SPENDER;
      q.fee_breakdown={gas_cost_from_token:'2',gas_cost_usd:'2'};q.quote_breakdown={gas_mode:'receive_less',input_token:USDC,output_token:XSGD,input_amount_before_gas:'50000000',input_amount_after_gas:'50000000',output_amount_before_gas:'62500000',output_amount_after_gas:'60000000',gas_cost_input_token:'2000000',gas_cost_output_token:'2500000',gas_cost_usd:'2'};return q;};
    assert.equal((await s.call('permit/prepare',{intent:id})).json.code,'AUTH_STALE');
    await s.login();assert.equal((await s.call('permit/prepare',{intent:id})).json.code,'WALLET_REQUIRED');
    const c=await s.call('challenge',{address:signer.address,chainId:11155111});await s.call('verify',{id:c.json.id,signature:await signer.signMessage({message:String(c.json.message)})});
    assert.equal((await s.call('permit/prepare',{intent:id},{'x-csrf-token':'wrong'})).json.code,'AUTH_INVALID');
    const review=await s.call('permit/prepare',{intent:id});assert.equal(review.response.status,200);assert.equal(review.json.permitAmount,'50000000');assert.equal(review.json.intentSigningAvailable,false);
    const identity={id:review.json.id,version:review.json.version};const requested=await s.call('permit/request',{...identity,consent:true});assert.equal(requested.response.status,200);assert.equal((requested.json.permit as any).primaryType,'Permit');assert.equal('intent' in requested.json,false);
    assert.equal((await s.call('permit/request',{...identity,consent:true})).json.code,'PERMIT_LOCKED');
    for(let n=0;n<12;n++)assert.equal((await s.call('permit/observation',{...identity,kind:'RPC_DISPATCHED'})).response.status,200);
    assert.equal((await s.call('permit/observation',{...identity,kind:'RPC_DISPATCHED'})).json.code,'RATE_LIMITED');
    const row=s.f.store.permits.row(String(identity.id),'1')!,q=JSON.parse(row.payload).quote,sig=await signer.signTypedData(permitData(q));assert.equal(s.f.store.permits.events(row).filter(e=>e.kind==='RPC_DISPATCHED').length,1);
    const saved=await s.call('permit/record',{...identity,signature:sig});assert.equal(saved.json.state,'PERMIT_SIGNED');assert(!JSON.stringify(saved.json).includes(sig));
    assert.equal((await s.call('confirm',identity)).json.code,'EXECUTION_DISABLED');assert.equal((await s.call('submit',{...identity,signature:sig,permitSignature:sig})).json.code,'EXECUTION_DISABLED');assert.equal((await s.call('permit/intent',identity)).json.code,'PERMIT_DISABLED');
    assert.equal((await s.call('permit/reconcile',{...identity,reason:'NO_SIGNATURE_RETURNED'})).json.code,'PERMIT_DISABLED');
    await s.login(2);assert.equal((await s.call('permit/record',{...identity,signature:sig})).json.code,'PERMIT_DISABLED');assert.equal(s.f.store.wallet.list('1').length,0);assert.equal(s.f.submitted(),0);
  }finally{await s.close();}
});
test('exact Telegram 50-USDC flow survives route loss, ownership completion, reload and expired quote with a new read-only quote',async()=>{
  const s=await serverFixture();try{
    s.f.config.wallet.enabled=false;const markets=fakeMarkets();markets.tokens=async()=>[{...A,address:USDC},{...B,address:XSGD,symbol:'XSGD',currency:'SGD'}];
    const views:View[]=[],bot=new BotController(s.f.store,markets,s.f.config,s.f.now,s.f.chain),out={reply:async(v:View)=>{views.push(v);}};
    await bot.handle({userId:'1',text:'/quote 50 USDC XSGD'},out);const entry=views.at(-1)!.buttons!.flat().find(b=>b.data.startsWith('trade:'))!;
    await bot.handle({userId:'1',callback:entry.data},out);const id=new URL(views.at(-1)!.buttons!.flat().find(b=>b.webApp)!.webApp!).searchParams.get('intent')!;
    assert.equal(s.f.store.continuations.pending('1')!.amount,'50');await s.login();
    assert.equal((await s.call('context')).json.id,id);assert.equal((await s.call('preview',{intent:id})).json.code,'WALLET_REQUIRED');assert.equal(s.f.store.continuations.pending('1')!.state,'PENDING');
    const c=await s.call('challenge',{address:signer.address,chainId:11155111}),signature=await signer.signMessage({message:String(c.json.message)});await s.call('verify',{id:c.json.id,signature});
    const current=(s.f.store as unknown as{db:DatabaseSync}).db.prepare('SELECT id,epoch,wallet FROM wallet_sessions WHERE wallet IS NOT NULL').all();
    assert.equal((await s.call('context')).json.amount,'50');assert.equal((await s.call('bootstrap',{initData:initData()})).response.status,200);
    assert.deepEqual((s.f.store as unknown as{db:DatabaseSync}).db.prepare('SELECT id,epoch,wallet FROM wallet_sessions WHERE wallet IS NOT NULL').all(),current);
    let quotes=0;s.f.api.getQuote=async request=>{quotes++;assert.equal(request.from_amount,'50000000');assert.equal(request.owner_address,request.recipient);
      const q=wire(request.owner_address,quotes);q.route_params.initialDepositAmount=q.route_params.maxInputAmount=q.permit.value_raw=q.permit.eip712.message.value='50000000';
      q.expires_at=Math.floor(s.f.now()/1000)+30;q.route_params.deadline=q.permit.suggested_deadline=q.permit.eip712.message.deadline=request.expiration;return q;};
    const first=await s.call('preview',{intent:id});assert.equal(first.response.status,200);assert.equal((first.json.context as any).amount,'50');assert.equal(first.json.financialAuthorizationAvailable,false);
    s.f.advance(31000);assert.equal((await s.call('context')).json.amount,'50');const second=await s.call('preview',{intent:id});assert.equal(second.response.status,200);assert.notEqual(second.json.expiresAt,first.json.expiresAt);assert.equal(quotes,2);
    assert.equal(s.f.store.continuations.pending('1')!.state,'REVIEWED');assert.equal((await s.f.store.intent(id,'1'))!.amount,'50');assert.equal(s.f.store.wallet.list('1').length,0);assert.equal(s.f.submitted(),0);
  }finally{await s.close();}
});
test('server recovery never infers latest/default amount, never falls back for an explicit invalid/foreign ID and enforces cancellation',async()=>{
  const s=await serverFixture();try{
    s.f.config.wallet.enabled=false;await s.login();const id=await s.f.store.saveIntent('1',USDC,XSGD,'50');assert.equal((await s.call('context')).json.code,'TRADE_STATE');
    s.f.store.continuations.select(id,'1');assert.equal((await s.call('context')).json.amount,'50');await s.f.store.saveIntent('1',USDC,XSGD,'2');assert.equal((await s.call('context')).json.amount,'50');
    assert.equal((await s.call('context',{intent:'abcdefghijk'})).json.code,'TRADE_STATE');await s.login(2);assert.equal((await s.call('context')).json.code,'TRADE_STATE');assert.equal((await s.call('context',{intent:id})).json.code,'TRADE_STATE');assert.equal((await s.call('context/cancel',{intent:id})).json.code,'TRADE_STATE');
    await s.login(1,'second-login');assert.equal((await s.call('context/cancel',{intent:id})).response.status,200);assert.equal((await s.call('context')).json.code,'TRADE_STATE');assert.equal((await s.call('context',{intent:id})).json.code,'TRADE_STATE');assert.equal((await s.call('preview',{intent:id})).json.code,'TRADE_STATE');assert.equal(s.f.calls(),0);assert.equal(s.f.submitted(),0);
  }finally{await s.close();}
});
test('new development origin retains selected 50 context but requires its own fresh authenticated session and ownership',async()=>{
  const s=await serverFixture();try{
    s.f.config.wallet.enabled=false;await s.login();const id=await s.f.store.saveIntent('1',USDC,XSGD,'50');s.f.store.continuations.select(id,'1');
    s.f.config.wallet.origin='https://new-bot.example';s.reset();assert.equal((await s.call('context')).json.code,'AUTH_STALE');await s.login(1,'new-origin');
    assert.equal((await s.call('context')).json.amount,'50');assert.equal((await s.call('state')).json.wallet,null);assert.equal((await s.call('preview',{intent:id})).json.code,'WALLET_REQUIRED');assert.equal(s.f.calls(),0);
    assert.equal((await s.call('context',{}, {origin:'https://bot.example'})).json.code,'AUTH_INVALID');
  }finally{await s.close();}
});
test('bootstrap retains existing anti-replay/origin/CSRF/identity and initData age checks',async()=>{
  const s=await serverFixture();try{await s.login();assert.equal((await s.call('bootstrap',{initData:initData()})).response.status,200);
    assert.equal((await s.call('auth',{initData:initData()})).json.code,'AUTH_REPLAY');assert.equal((await s.call('bootstrap',{initData:initData(2)})).json.code,'AUTH_INVALID');
    assert.equal((await s.call('bootstrap',{initData:initData()}, {'x-csrf-token':'forged'})).json.code,'AUTH_INVALID');assert.equal((await s.call('bootstrap',{initData:initData()}, {origin:'https://other.example'})).json.code,'AUTH_INVALID');
    s.f.advance(300001);assert.equal((await s.call('bootstrap',{initData:initData()})).json.code,'AUTH_STALE');assert.equal(s.f.submitted(),0);
  }finally{await s.close();}
});
test('Telegram request persists exact 50 and offers explicit continuation even when the initial public market quote has no liquidity',async()=>{
  const s=await serverFixture();try{
    s.f.config.wallet.enabled=false;const market=fakeMarkets();market.tokens=async()=>[{...A,address:USDC},{...B,address:XSGD,symbol:'XSGD'}];market.quote=async()=>{throw new AppError('NO_LIQUIDITY');};
    const views:View[]=[],bot=new BotController(s.f.store,market,s.f.config,s.f.now,s.f.chain),out={reply:async(v:View)=>{views.push(v);}};
    await bot.handle({userId:'1',text:'/quote 50 USDC XSGD'},out);assert.match(views.at(-1)!.text,/50 USDC → XSGD/);assert.match(views.at(-1)!.text,/금융 승인이나 거래는 진행되지/);
    const entry=views.at(-1)!.buttons!.flat().find(b=>b.data.startsWith('trade:'))!;assert(entry);assert.equal(s.f.store.continuations.pending('1'),undefined);
    await bot.handle({userId:'1',callback:entry.data},out);await s.login();assert.equal((await s.call('context')).json.amount,'50');assert.equal(s.f.calls(),0);assert.equal(s.f.submitted(),0);
  }finally{await s.close();}
});

for(const amount of ['2','50'])test('HTTP context and fresh read-only review retain exact '+amount+' USDC with financial authorization disabled',async()=>{
  const s=await serverFixture();try{
    s.f.config.wallet.enabled=false;await s.login();const id=await s.f.store.saveIntent('1',USDC,XSGD,amount,'quote');
    const raw=String(BigInt(amount)*1000000n),q=wire();q.route_params.initialDepositAmount=q.route_params.maxInputAmount=raw;q.permit.value_raw=q.permit.eip712.message.value=raw;
    let reads=0;s.f.api.getQuote=async request=>{reads++;assert.equal(request.from_amount,raw);assert.equal(request.recipient.toLowerCase(),signer.address.toLowerCase());return q;};
    const context=await s.call('context',{intent:id});assert.equal(context.json.amount,amount);assert.equal(context.json.chainId,11155111);assert.equal(reads,0);
    const c=await s.call('challenge',{address:signer.address,chainId:11155111}),signature=await signer.signMessage({message:String(c.json.message)});await s.call('verify',{id:c.json.id,signature});
    for(let n=0;n<2;n++){const r=await s.call('preview',{intent:id});assert.equal(r.response.status,200,JSON.stringify(r.json));assert.equal(r.json.state,'PREVIEW');assert.equal((r.json.context as any).amount,amount);assert.equal(r.json.financialAuthorizationAvailable,false);assert.equal(r.json.reviewState,'COST_REVIEW_BLOCKED');assert.match(JSON.stringify(r.json.details),/Permit digest/);assert.equal(r.json.version,null);assert.equal(r.json.id,'');}
    assert.equal(reads,2);assert.equal(s.f.store.wallet.list('1').length,0);assert.equal(s.f.submitted(),0);
    assert.equal((await s.call('confirm',{id:'0'.repeat(64),version:'0'.repeat(64)})).json.code,'EXECUTION_DISABLED');
    assert.equal((await s.call('submit',{id:'0'.repeat(64),version:'0'.repeat(64),signature:'0x'+'0'.repeat(130),permitSignature:'0x'+'0'.repeat(130)})).json.code,'EXECUTION_DISABLED');
    await s.login(2);assert.equal((await s.call('context',{intent:id})).json.code,'TRADE_STATE');assert.equal(reads,2);
  }finally{await s.close();}
});
test('HTTP context rejects expired continuation without fetching or resizing a quote',async()=>{
  const s=await serverFixture();try{await s.login();(s.f.store as unknown as {db:DatabaseSync}).db.prepare('UPDATE quote_intents SET expires_at=? WHERE id=?').run(NOW,s.f.intent);assert.equal((await s.call('context',{intent:s.f.intent})).json.code,'TRADE_STATE');assert.equal(s.f.calls(),0);s.f.advance(900001);assert.equal((await s.call('context',{intent:s.f.intent})).json.code,'AUTH_STALE');}finally{await s.close();}
});
test("web API rejects origin/CSRF failures, forged identity and replayed Telegram initialization",async()=>{
  const s=await serverFixture();try{
    assert.equal((await s.call("auth",{initData:initData(),userId:"2"})).response.status,400);
    assert.equal((await s.call("auth",{initData:initData()},{origin:"https://evil.example"})).response.status,400);
    const login=await s.login();assert.equal(login.response.status,200);assert.match(login.response.headers.get("set-cookie")!,/Secure; HttpOnly; SameSite=Strict/);
    assert.equal((await s.call("state",{}, {"x-csrf-token":"forged"})).response.status,400);
    assert.equal((await s.call("state")).response.status,200);
    assert.equal((await s.call("auth",{initData:initData()})).json.code,"AUTH_REPLAY");
    assert(!JSON.stringify(login.json).includes("test-token"));assert(!JSON.stringify(login.json).includes("rpc.example"));
  }finally{await s.close();}
});
test("missing Reown still serves authenticated setup status without enabling wallet or financial authorization",async()=>{
  const s=await serverFixture();try{
    s.f.config.wallet.enabled=false;s.f.config.wallet.projectId="";s.f.config.wallet.ready=false;
    const login=await s.login();assert.equal(login.json.ready,false);assert.equal(login.json.enabled,false);assert.equal(login.json.projectId,"");assert.equal(login.json.userId,"1");
    assert.equal((await s.call("state")).response.status,200);
    assert.equal((await s.call("confirm",{id:"0".repeat(64),version:"0".repeat(64)})).json.code,"EXECUTION_DISABLED");
    assert.equal(s.f.submitted(),0);
  }finally{await s.close();}
});
test("HTTP read-only acceptance supports ownership/preview, keeps confirmation blocked and refreshes only its owner",async()=>{
  const s=await serverFixture();try{
    s.f.config.wallet.enabled=false;const login=await s.login();assert.equal(login.json.userId,"1");assert.equal(login.json.enabled,false);
    assert.equal((await s.call("challenge",{address:signer.address,chainId:1})).json.code,"NETWORK_MISMATCH");
    const c=await s.call("challenge",{address:signer.address,chainId:11155111});assert.equal(c.response.status,200);
    const sig=await signer.signMessage({message:String(c.json.message)});await s.call("verify",{id:c.json.id,signature:sig});
    const preview=await s.call("preview",{intent:s.f.intent});assert.equal(preview.json.state,"PREVIEW");assert.equal(preview.json.version,null);assert.equal(s.f.store.wallet.list("1").length,0);
    assert.equal((await s.call("confirm",{id:"0".repeat(64),version:"0".repeat(64)})).json.code,"EXECUTION_DISABLED");
    await s.call("refresh");assert.deepEqual(s.refreshes,["1"]);assert.equal(s.f.submitted(),0);
    await s.call("disconnect");assert.equal((await s.call("preview",{intent:s.f.intent})).json.code,"WALLET_REQUIRED");
  }finally{await s.close();}
});
test("HTTP auth, RPC failures and diagnostic input expose only safe actionable errors",async()=>{
  const s=await serverFixture();try{
    const secret="seed phrase; bot token; raw initData; signature secret";
    const bad=await s.call("auth",{initData:secret});assert.equal(bad.json.code,"AUTH_INVALID");assert.match(String(bad.json.message),/\[AUTH_INVALID\]/);assert(!JSON.stringify(bad.json).includes(secret));
    await s.login();assert.equal((await s.call("diagnostic",{code:"WALLET_RETURNED",details:secret})).response.status,400);
    const c=await s.call("challenge",{address:signer.address,chainId:11155111}),sig=await signer.signMessage({message:String(c.json.message)});await s.call("verify",{id:c.json.id,signature:sig});
    s.f.chain.balances=async()=>{throw new Error(secret);};const result=await s.call("balance");assert.equal(result.json.code,"RPC_UNAVAILABLE");assert(!JSON.stringify(result.json).includes(secret));
  }finally{await s.close();}
});
test("HTTP wallet ownership, balances, private status and foreign trade authorization",async()=>{
  const s=await serverFixture();try{
    await s.login();const c=await s.call("challenge",{address:signer.address,chainId:11155111});assert.equal(c.response.status,200);
    const sig=await signer.signMessage({message:String(c.json.message)});
    assert.equal((await s.call("verify",{id:c.json.id,signature:sig})).response.status,200);
    const balances=await s.call("balance");assert.equal(balances.response.status,200);
    const review=await s.call("prepare",{intent:s.f.intent});assert.equal(review.json.state,"REVIEW");assert.match(String(review.json.text),/최소 수령액/);assert(!String(review.json.text).includes("예상 최소"));
    await s.login(2);const state=await s.call("state");assert.deepEqual(state.json.trades,[]);
    assert.equal((await s.call("confirm",{id:review.json.id,version:review.json.version})).response.status,400);
    assert.equal((await s.call("cancel",{id:review.json.id})).response.status,400);
    assert.equal((await s.call("prepare",{intent:s.f.intent})).response.status,400);assert.equal(s.f.submitted(),0);
  }finally{await s.close();}
});
