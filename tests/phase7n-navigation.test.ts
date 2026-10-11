import test from 'node:test';import assert from 'node:assert/strict';
import {TradeContinuation,requestContinuationReview} from '../web/quote-continuation.js';
import {fixture} from './trade-helpers.js';
import {tradeAuthorizationPanel} from '../web/trade-panel.js';
import {authorizationReview} from '../src/trades/review.js';
test('full capability creates a NEW package from the exact continuation; default stays read-only',async()=>{
  const f=await fixture();try{const id=await f.store.saveIntent('1','0x965d4b4546716e416e950bc30467d128455d2d0e','0x058e06ca2628165a6cd1e80e4dc82203dc0020aa','50');
    const context={id,amount:'50',fromSymbol:'USDC',toSymbol:'XSGD',chainId:11155111,expiresAt:f.now()+900000};let prepares=0,previews=0;
    const continuation=new TradeContinuation({id,changed:()=>{},now:f.now,api:async path=>path==='context'?context:{state:'PREVIEW',financialAuthorizationAvailable:false,context}});
    const options={continuation,permitOnly:false,guard:()=>{},epoch:()=>0,showReadOnly:()=>{previews++;},prepareTrade:async(value:string)=>{assert.equal(value,id);prepares++;const row=await f.service.prepare(f.session,id,'quote');assert.deepEqual(f.service.authorizationStatus(f.session,row.id,row.version!).available,{permit:true,intent:false,submit:false});}};
    assert.equal(await requestContinuationReview(options),'read-only');assert.equal(prepares,0);assert.equal(previews,1);
    assert.equal(await requestContinuationReview({...options,fullTrade:true}),'trade');assert.equal(prepares,1);
    assert.equal(f.store.wallet.list('1').length,1);assert.equal(f.submitted(),0);
  }finally{f.store.close();}
});
test('compact panel has three separate consent-controlled actions; status/expiry never signs',async t=>{
  const f=await fixture();let now=f.now();t.mock.method(Date,'now',()=>now);t.mock.method(globalThis,'setTimeout',(()=>0)as any);
  class E{children:E[]=[];textContent='';checked=false;disabled=false;isConnected=true;type='';onclick?:()=>unknown;onchange?:()=>unknown;append(...xs:E[]){this.children.push(...xs);}prepend(...xs:E[]){this.children.unshift(...xs);}setAttribute(){} }
  const prior=Object.getOwnPropertyDescriptor(globalThis,'document');Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>new E(),createTextNode:(v:string)=>Object.assign(new E(),{textContent:v})}});
  t.after(()=>{if(prior)Object.defineProperty(globalThis,'document',prior);else Reflect.deleteProperty(globalThis,'document');f.store.close();});
  const row=await f.prepare(),root=new E(),calls:string[]=[];
  const panel=tradeAuthorizationPanel({root:root as any,review:{id:row.id,version:row.version!,state:'REVIEW',expiresAt:row.expires_at,text:'TESTNET',details:authorizationReview(f.service.snapshot(row),'ko')},language:'ko',api:async path=>{calls.push(path);assert.equal(path,'authorization/status');return f.service.authorizationStatus(f.session,row.id,row.version!);},provider:()=>undefined,wallet:()=>row.wallet,epoch:()=>0,enabled:()=>true,handoff:()=>assert.fail('No wallet opening'),pending:()=>{},submitted:()=>assert.fail('No submit'),error:()=>assert.fail('Unexpected failure')});
  await panel.refresh();const section=root.children[0]!,buttons=section.children.filter(x=>x.textContent.startsWith('1.')||x.textContent.startsWith('2.')||x.textContent.startsWith('3.')),label=section.children.find(x=>x.children.some(c=>c.type==='checkbox'))!,consent=label.children[0]!;
  assert.equal(buttons.length,3);assert(buttons.every(b=>b.disabled));consent.checked=true;consent.onchange!();assert.equal(buttons[0]!.disabled,false);assert.equal(buttons[1]!.disabled,true);assert.equal(buttons[2]!.disabled,true);
  now+=30000;await panel.refresh();assert(buttons.every(b=>b.disabled));await buttons[0]!.onclick!();assert(calls.every(p=>p==='authorization/status'));assert.equal(f.submitted(),0);
});
