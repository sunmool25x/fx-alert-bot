import test,{type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {continuationId,freshContinuationQuote,quoteRequestButton,quoteFailure} from '../web/quote-continuation.js';
import {claimCopy,claimPanel} from '../web/claim-panel.js';
import {WalletFlowError} from '../web/connection.js';
import {WalletFlow} from '../web/wallet-flow.js';
import type {ConnectedProvider,WalletConnection} from '../web/connector-types.js';
import {BotController} from '../src/bot/controller.js';
import type {View} from '../src/bot/view.js';
import {fixture} from './trade-helpers.js';
import {fakeMarkets,NOW,A,B} from './helpers.js';
import {USDC,XSGD} from '../src/trades/contract.js';
const id='abcdefghijkl'.slice(0,11),wallet='0x'+'a'.repeat(40);
const tick=()=>new Promise<void>(resolve=>setImmediate(resolve));
function quoteFixture(amount='50'){
  let epoch=0,reads=0,owned=true;
  const context={id,amount,fromSymbol:'USDC',toSymbol:'XSGD',chainId:11155111,expiresAt:NOW+900000};
  const paths:string[]=[];
  const options={id,now:()=>NOW,epoch:()=>epoch,guard:()=>{if(!owned)throw new WalletFlowError('WALLET_REQUIRED');},api:async(path:string,body?:unknown):Promise<any>=>{
    paths.push(path);assert.deepEqual(body,{intent:id});
    if(path==='context')return context;
    assert.equal(path,'preview');reads++;return{state:'PREVIEW',version:null,financialAuthorizationAvailable:false,context:{...context,recipient:wallet}};
  }};
  return{options,context,paths,reads:()=>reads,change:()=>epoch++,expire:()=>owned=false,renew:()=>owned=true};
}
for(const amount of ['2','50'])test('Telegram /quote '+amount+' persists the exact amount and owner-bound Mini App continuation',async()=>{
  const f=await fixture();try{
    f.config.wallet.enabled=false;const markets=fakeMarkets();markets.tokens=async()=>[{...A,address:USDC},{...B,address:XSGD,symbol:'XSGD',currency:'SGD'}];
    const bot=new BotController(f.store,markets,f.config,()=>NOW,f.chain),views:View[]=[],out={reply:async(v:View)=>{views.push(v);}};
    await bot.handle({userId:'1',text:'/quote '+amount+' USDC XSGD'},out);
    const trade=views.at(-1)!.buttons!.flat().find(b=>b.data.startsWith('trade:'))!;assert(trade);
    await bot.handle({userId:'1',callback:trade.data},out);
    const url=new URL(views.at(-1)!.buttons!.flat().find(b=>b.webApp)!.webApp!);
    const continuation=continuationId(url.hash,url.search)!;assert(continuation);assert.equal((await f.store.intent(continuation,'1'))!.amount,amount);
    assert.equal(f.store.continuations.pending('1')!.id,continuation);assert.equal(f.store.continuations.pending('1')!.amount,amount);
    assert.equal(await f.store.intent(continuation,'2'),undefined);assert.equal(f.submitted(),0);
  }finally{f.store.close();}
});
for(const amount of ['2','50'])test('fresh continuation quote retains '+amount+' without creating, resizing or authorizing an intent',async()=>{
  const f=quoteFixture(amount);assert.equal((await freshContinuationQuote(f.options)).context.amount,amount);await freshContinuationQuote(f.options);
  assert.equal(f.reads(),2);assert.deepEqual(f.paths,['context','preview','context','preview']);assert.equal(f.context.amount,amount);
});
test('missing and expired context stop before fresh quote; invalid fragment is never a fallback amount',async()=>{
  for(const hash of ['','#intent=2','#intent=wrong!'])assert.equal(continuationId(hash),undefined);
  const f=quoteFixture();await assert.rejects(freshContinuationQuote({...f.options,id:undefined}),{code:'TRADE_STATE'});assert.equal(f.paths.length,0);
  f.context.expiresAt=NOW;await assert.rejects(freshContinuationQuote(f.options),{code:'TRADE_STATE'});assert.equal(f.reads(),0);
});
test('expired ownership stops quote; explicit renewal returns to the exact same 50 context',async()=>{
  const f=quoteFixture();f.expire();await assert.rejects(freshContinuationQuote(f.options),{code:'WALLET_REQUIRED'});assert.equal(f.reads(),0);
  f.renew();assert.equal((await freshContinuationQuote(f.options)).context.amount,'50');assert.equal(f.reads(),1);assert.equal(f.context.id,id);
});
test('binding changes and wallet generation changes suppress a stale review',async()=>{
  for(const field of ['amount','fromSymbol','toSymbol','chainId']){const f=quoteFixture(),api=f.options.api;f.options.api=async(...args)=>{const r=await api(...args);if(args[0]==='preview')r.context[field]='wrong';return r;};await assert.rejects(freshContinuationQuote(f.options),{code:'QUOTE_BINDING_MISMATCH'});}
  const f=quoteFixture(),api=f.options.api;f.options.api=async(...args)=>{const r=await api(...args);if(args[0]==='preview')f.change();return r;};await assert.rejects(freshContinuationQuote(f.options),{code:'WALLET_REQUIRED'});
});
// Minimal DOM fixture exercises the registered handlers and status placement, not source regexes.
class Element {
  children:Element[]=[];textContent='';type='';className='';hidden=false;disabled=false;tabIndex=0;isConnected=true;onclick?:()=>void;focused=false;scrolled=false;attributes=new Map<string,string>();
  append(...children:Element[]){this.children.push(...children);}replaceChildren(...children:Element[]){this.children=children;}
  setAttribute(k:string,v:string){this.attributes.set(k,v);}scrollIntoView(){this.scrolled=true;}focus(){this.focused=true;}
}
function dom(t:TestContext){
  t.mock.method(globalThis,'setInterval',()=>0 as any);
  const original=Object.getOwnPropertyDescriptor(globalThis,'document');Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>new Element(),visibilityState:'visible'}});
  t.after(()=>{if(original)Object.defineProperty(globalThis,'document',original);else Reflect.deleteProperty(globalThis,'document');});
  return new Element();
}
test('registered click renders loading, then success; double tap never dispatches a duplicate',async t=>{
  const root=dom(t);let calls=0,complete!:()=>void;
  const panel=quoteRequestButton({root:root as unknown as HTMLElement,language:'ko',renew:async()=>{},request:async()=>{calls++;await new Promise<void>(r=>complete=r);}});
  (panel.button as unknown as Element).onclick!();assert.match(panel.status.textContent!,/조회 중/);assert.equal(panel.button.disabled,true);assert.equal(calls,1);
  (panel.button as unknown as Element).onclick!();assert.equal(calls,1);complete();await tick();assert.match(panel.status.textContent!,/서명과 제출은 비활성/);assert.equal(panel.button.disabled,false);
});
for(const code of ['NO_LIQUIDITY','AUTH_STALE','WALLET_REQUIRED','TRADE_STATE','UNAVAILABLE','QUOTE_STALE'])test('backend '+code+' is visibly surfaced at the clicked action',async t=>{
  const root=dom(t);let calls=0;
  const panel=quoteRequestButton({root:root as unknown as HTMLElement,language:'ko',renew:async()=>{},request:async()=>{calls++;throw new WalletFlowError(code);}});
  (panel.button as unknown as Element).onclick!();await tick();assert.equal(calls,1);assert.equal(panel.status.textContent,quoteFailure('ko',new WalletFlowError(code)));
  assert((panel.status as unknown as Element).focused);assert((panel.status as unknown as Element).scrolled);assert.equal(panel.button.disabled,false);
});
for(const hasContext of [false,true])test('claim success uses a generic CTA '+(hasContext?'with explicit context':'without a trade context'),async t=>{
  const root=dom(t);let quotes=0;const paths:string[]=[];
  const panel=claimPanel({root:root as unknown as HTMLElement,language:'ko',api:async path=>{paths.push(path);return{claims:[{id:'a'.repeat(64),state:'CLAIM_BALANCES_VERIFIED',wallet,attempted:true,snapshot:null,balances:null,txHash:null}]};},provider:()=>undefined,owner:()=>wallet,epoch:()=>0,swapsEnabled:()=>false,originGuard:()=>{},ready:()=>true,handoff:()=>{},pending:()=>{},preview:()=>{throw Error('Legacy amount must not be used');},...(hasContext?{requestQuote:async()=>{quotes++;}}:{})});
  await panel.refresh();const review=root.children[2]!,cta=review.children.find(c=>c.textContent===claimCopy.ko.preview)!;assert(cta);assert.equal(cta.textContent,'새 Quote 확인');cta.onclick!();await tick();
  assert.deepEqual(paths,['claim/list']);assert.equal(quotes,hasContext?1:0);if(!hasContext)assert.match(root.children[1]!.textContent,/NO_TRADE_CONTEXT/);
});
test('ownership renewal reuses connected provider and requires another explicit proof tap; no reconnect or financial RPC',async()=>{
  let starts=0,prepares=0,verifies=0,invalidates=0;
  const provider:ConnectedProvider={accounts:[wallet],chainId:11155111,session:{},connect:async()=>{throw Error('Reconnect forbidden');},request:async()=>{throw Error('Financial RPC forbidden');},on:()=>{},disconnect:async()=>{}};
  const connection:WalletConnection={choice:'okx',environment:'desktop',start:async()=>{starts++;return provider;},assert:()=>{},assertActive:()=>{},cancel:()=>{}};
  const flow=new WalletFlow({create:()=>connection,view:()=>{},invalidate:async()=>{invalidates++;},connected:()=>{},pending:()=>{},open:()=>{},error:e=>{throw e;},cancelled:()=>{},prepare:async()=>{prepares++;return{verify:async()=>wallet};},verify:async()=>{verifies++;}});
  await flow.choose();await flow.select('okx');await flow.verify();const before=invalidates;await flow.renewOwnership();
  assert.equal(starts,1);assert.equal(prepares,2);assert.equal(verifies,1);assert.equal(invalidates,before);assert.equal(flow.screen.step,'ownership');await flow.verify();assert.equal(verifies,2);
});
test('active app preserves continuation and delegates the shared Quote action to the tested capability router',()=>{
  const app=readFileSync('web/app.ts','utf8'),claim=readFileSync('web/claim-panel.ts','utf8');assert(app.includes("url.searchParams.set('intent',context.id)"));assert(app.includes('return requestContinuationReview({continuation:continuation!,permitOnly:c.permitOnly,fullTrade:allowExecution'));assert(app.includes('preparePermit:permitAcceptance?.prepare'));assert(app.includes("api('prepare',{intent:id})"));assert(!claim.includes('requestTwoUsdcPreview'));
  assert.equal(claimCopy.ko.preview,'새 Quote 확인');assert.equal(claimCopy.en.preview,'Check a new quote');
});
