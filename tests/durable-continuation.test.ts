import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readdirSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';import{DatabaseSync}from'node:sqlite';
import {SqliteStore} from '../src/database/store.js';import {USDC,XSGD} from '../src/trades/contract.js';
import {TradeContinuation,continuationRoute,quoteRequestButton} from '../web/quote-continuation.js';import{WalletFlowError}from'../web/connection.js';
import{miniAppSession}from'../web/miniapp-session.js';import{NOW}from'./helpers.js';
test('migration 9 preserves the existing database and creates one consistent pre-migration backup',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'fx-continuation-migration-')),path=join(dir,'state.sqlite');let store=new SqliteStore(path,900000,()=>NOW);
  try{
    await store.touch('1');const id=await store.saveIntent('1',USDC,XSGD,'50');store.close();
    const old=new DatabaseSync(path);old.exec('DROP TABLE quote_continuations;DELETE FROM schema_migrations WHERE version=9');old.close();
    store=new SqliteStore(path,900000,()=>NOW);assert.equal((await store.intent(id,'1'))!.amount,'50');
    const files=readdirSync(dir).filter(f=>f.includes('.before-phase7h-'));assert.equal(files.length,1);
    const backup=new DatabaseSync(join(dir,files[0]!),{readOnly:true});try{
      assert.equal(backup.prepare('PRAGMA integrity_check').get()!.integrity_check,'ok');
      assert.equal(backup.prepare('SELECT version FROM schema_migrations WHERE version=9').get(),undefined);
      assert.equal(backup.prepare('SELECT amount FROM quote_intents WHERE id=?').get(id)!.amount,'50');
    }finally{backup.close();}
    store.close();store=new SqliteStore(path,900000,()=>NOW);assert.equal(readdirSync(dir).filter(f=>f.includes('.before-phase7h-')).length,1);
  }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
test('durable 50 context is independent of sessions, ownership epochs, quote expiry and development origin',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'fx-continuation-')),path=join(dir,'state.sqlite');let time=NOW,store=new SqliteStore(path,900000,()=>time);
  try{
    await store.touch('1');await store.touch('2');const id=await store.saveIntent('1',USDC,XSGD,'50');
    const recorded=store.continuations.get(id,'1')!;assert.equal(recorded.amount,'50');assert.equal(recorded.chain_id,11155111);assert.equal(recorded.recipient_mode,'VERIFIED_WALLET');assert.equal(recorded.created_at,NOW);assert.equal(recorded.expires_at,NOW+900000);assert.equal(recorded.state,'PENDING');assert.equal(store.continuations.pending('1'),undefined);
    store.continuations.select(id,'1');const token=store.wallet.newSession('1','tg-first',900000).token,session=store.wallet.session(token)!;
    store.wallet.link(session,'0x'+'a'.repeat(40));assert.equal(store.continuations.pending('1')!.amount,'50');
    store.wallet.disconnect('1');assert.equal(store.continuations.pending('1')!.state,'PENDING');
    const current=store.wallet.session(token)!;store.wallet.link(current,'0x'+'a'.repeat(40));store.continuations.reviewed(id,'1',current.id,store.wallet.session(token)!.epoch);
    time+=35000;assert.equal((await store.intent(id,'1'))!.amount,'50');assert.equal(store.continuations.pending('1')!.state,'REVIEWED');
    const originalExpiry=store.continuations.pending('1')!.expires_at;store.close();store=new SqliteStore(path,900000,()=>time);
    assert.equal(store.continuations.pending('1')!.amount,'50');assert.equal(store.continuations.pending('1')!.expires_at,originalExpiry);
    const newToken=store.wallet.newSession('1','tg-new-origin',900000).token;assert.equal(store.wallet.session(newToken)!.wallet,null);assert.equal(store.continuations.pending('1')!.id,id);
    assert.equal(store.continuations.get(id,'2'),undefined);assert.equal(store.continuations.pending('2'),undefined);assert.throws(()=>store.continuations.select(id,'2'),{code:'TRADE_STATE'});
    store.continuations.cancel(id,'1');assert.equal(store.continuations.get(id,'1'),undefined);assert.equal(store.continuations.pending('1'),undefined);store.continuations.ensure((await store.intent(id,'1'))!);assert.equal(store.continuations.get(id,'1'),undefined);
    assert.equal(store.wallet.list('1').length,0);
  }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
test('expired and cancelled continuations reject selection/review without changing TTL or falling back to a latest request',async()=>{
  let time=NOW;const store=new SqliteStore(':memory:',900000,()=>time);try{
    await store.touch('1');const fifty=await store.saveIntent('1',USDC,XSGD,'50');store.continuations.select(fifty,'1');
    const two=await store.saveIntent('1',USDC,XSGD,'2');assert.equal(store.continuations.pending('1')!.amount,'50');
    store.continuations.select(two,'1');assert.equal(store.continuations.pending('1')!.amount,'2');store.continuations.cancel(two,'1');assert.equal(store.continuations.pending('1'),undefined);
    time=NOW+900000;assert.equal(store.continuations.get(fifty,'1'),undefined);assert.throws(()=>store.continuations.select(fifty,'1'),{code:'TRADE_STATE'});assert.throws(()=>store.continuations.reviewed(fifty,'1','session',1),{code:'TRADE_STATE'});
  }finally{store.close();}
});
test('context controller recovers only server selection, pins the ID through ownership return/reload and refetches exact 50',async()=>{
  let time=NOW,owned=false,epoch=1,quotes=0;const context={id:'abcdefghijkl'.slice(0,11),amount:'50',fromSymbol:'USDC',toSymbol:'XSGD',chainId:11155111,expiresAt:NOW+900000};
  const bodies:unknown[]=[],changed:string[]=[],api=async(path:string,body?:unknown)=>{
    bodies.push(body);if(path==='context'){if(body&&Object.keys(body as object).length)assert.deepEqual(body,{intent:context.id});return {...context};}
    assert.equal(path,'preview');assert.deepEqual(body,{intent:context.id});quotes++;return{state:'PREVIEW',financialAuthorizationAvailable:false,context:{...context},expiresAt:time+25000};
  };
  const flow=new TradeContinuation({api,changed:c=>{if(c)changed.push(c.id);},now:()=>time});await flow.restore();assert.equal(flow.context!.amount,'50');
  const guard=()=>{if(!owned)throw new WalletFlowError('WALLET_REQUIRED');};await assert.rejects(flow.quote(guard,()=>epoch),{code:'WALLET_REQUIRED'});assert.equal(quotes,0);assert.equal(flow.context!.amount,'50');
  owned=true;epoch++;await flow.restore();assert.equal((await flow.quote(guard,()=>epoch)).context.amount,'50');assert.equal(quotes,1);
  time+=30000;assert(flow.valid());assert.equal((await flow.quote(guard,()=>epoch)).context.amount,'50');assert.equal(quotes,2);
  const reloaded=new TradeContinuation({api,id:changed.at(-1),changed:()=>{},now:()=>time});await reloaded.restore();assert.equal(reloaded.context!.amount,'50');assert.deepEqual(bodies[0],{});
});
test('invalid/conflicting route IDs reject instead of recovering a different selected trade',async()=>{
  for(const [hash,search]of [['#intent=wrong!',''],['#intent=abcdefghijk','?intent=zyxwvutsrqp']] as const){
    const route=continuationRoute(hash,search);assert.equal(route.invalid,true);let calls=0;const flow=new TradeContinuation({api:async()=>{calls++;return{};},...route,changed:()=>{}});await assert.rejects(flow.restore(),{code:'TRADE_STATE'});assert.equal(calls,0);
  }
  assert.equal(continuationRoute('','?intent=abcdefghijk').id,'abcdefghijk');assert.equal(continuationRoute('#intent=abcdefghijk').id,'abcdefghijk');
});
test('no-context action is disabled and cannot call quote even through registered/programmatic handler',async t=>{
  const original=Object.getOwnPropertyDescriptor(globalThis,'document');t.after(()=>{if(original)Object.defineProperty(globalThis,'document',original);else Reflect.deleteProperty(globalThis,'document');});
  Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>({textContent:'',disabled:false,setAttribute:()=>{},scrollIntoView:()=>{},focus:()=>{}})}});
  let calls=0;const panel=quoteRequestButton({root:{append:()=>{}} as unknown as HTMLElement,language:'ko',hasContext:()=>false,request:async()=>{calls++;},renew:async()=>{}});
  panel.setContext(false);assert.equal(panel.button.disabled,true);await panel.request();assert.equal(calls,0);assert.match(panel.status.textContent!,/NO_TRADE_CONTEXT/);assert.match(panel.status.textContent!,/금융 승인이나 거래는 진행되지/);
});
test('reload resumes existing authenticated session using CSRF only; no context, wallet secret or signature is stored',async()=>{
  const values=new Map<string,string>(),paths:string[]=[];let csrf='';const storage={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);},removeItem:(k:string)=>{values.delete(k);}};
  const api=async(path:string,body?:unknown)=>{paths.push(path);assert.deepEqual(body,{initData:'signed-fixture'});if(path==='auth')return{csrf:'fixture-csrf',userId:'1'};assert.equal(path,'bootstrap');assert.equal(csrf,'fixture-csrf');return{userId:'1'};};
  await miniAppSession(api,'signed-fixture',v=>{csrf=v;},storage);await miniAppSession(api,'signed-fixture',v=>{csrf=v;},storage);assert.deepEqual(paths,['auth','bootstrap']);assert.deepEqual([...values],[['fx-alert:csrf','fixture-csrf']]);
});
test('expired authentication clears cached nonce and uses ordinary Telegram auth; network failure never retries',async()=>{
  let cache:string|null='fixture-csrf',auths=0;const storage={getItem:()=>cache,setItem:(_k:string,v:string)=>{cache=v;},removeItem:()=>{cache=null;}};
  await miniAppSession(async path=>{if(path==='bootstrap')throw new WalletFlowError('AUTH_STALE');auths++;return{csrf:'new-fixture-csrf'};},'signed-fixture',()=>{},storage);assert.equal(auths,1);assert.equal(cache,'new-fixture-csrf');
  await assert.rejects(miniAppSession(async()=>{throw new WalletFlowError('UNAVAILABLE');},'signed-fixture',()=>{},storage),{code:'UNAVAILABLE'});assert.equal(auths,1);
});
