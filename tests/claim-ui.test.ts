import test from 'node:test';
import assert from 'node:assert/strict';
import {ClaimFlow} from '../web/claim-flow.js';
import {claimCopy} from '../web/claim-panel.js';
import {assertOkxRequest} from '../web/okx-protocol.js';
import type {WalletProvider} from '../web/connection.js';
import type {ClaimView} from '../src/claims/protocol.js';
import {claimSnapshot,claimHash} from './claim-helpers.js';
import {NOW} from './helpers.js';
function setup(){
  const wallet='0x'+'a'.repeat(40);let epoch=0,swaps=false,requests=0,apiCalls:string[]=[];
  const review:ClaimView={id:'a'.repeat(64),version:'b'.repeat(64),state:'CLAIM_SIMULATED',wallet,expiresAt:NOW+60000,snapshot:claimSnapshot(wallet),txHash:null,error:null,balances:null,attempted:false};
  const provider:WalletProvider={accounts:[wallet],chainId:11155111,session:{},connect:async()=>{throw Error('No new pairing');},request:async args=>{requests++;assert.equal(args.method,'eth_sendTransaction');assert.deepEqual(args.params,[review.snapshot!.transaction]);return claimHash;}};
  const response={id:review.id,version:review.version,transaction:structuredClone(review.snapshot!.transaction),expiresAt:NOW+15000};
  let beforeResponse=()=>{};
  const flow=new ClaimFlow(async(path,body)=>{apiCalls.push(path);if(path==='claim/confirm'){beforeResponse();return response;}if(path==='claim/report'){assert.equal((body as any).hash,claimHash);return {...review,state:'CLAIM_BROADCAST'};}return {};},()=>provider,()=>wallet,()=>epoch,()=>swaps,()=>{},()=>NOW);
  return {flow,review,provider,response,requests:()=>requests,apiCalls,change:()=>epoch++,enable:()=>swaps=true,before:(f:()=>void)=>beforeResponse=f};
}
test('explicit review confirmation sends one exact immutable transaction using the existing wallet',async()=>{const f=setup();let handoffs=0;await f.flow.send(f.review,()=>handoffs++);assert.equal(f.requests(),1);assert.equal(handoffs,1);await assert.rejects(f.flow.send(f.review,()=>{}));assert.equal(f.requests(),1);});
test('double tap cannot create concurrent wallet requests',async()=>{const f=setup();const r=await Promise.allSettled([f.flow.send(f.review,()=>{}),f.flow.send(f.review,()=>{})]);assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.equal(f.requests(),1);});
for(const [field,value] of Object.entries({to:'0x'+'b'.repeat(40),data:'0x00000000',value:'0x1',chainId:'0x1',nonce:'0x1'}))test('handoff rejects modified backend '+field,async()=>{const f=setup();(f.response.transaction as any)[field]=value;await assert.rejects(f.flow.send(f.review,()=>{}));assert.equal(f.requests(),0);});
test('switching wallet, chain or execution flag while confirmation is pending blocks wallet opening',async()=>{
  for(const change of [(f:ReturnType<typeof setup>)=>f.change(),(f:ReturnType<typeof setup>)=>f.provider.chainId=1,(f:ReturnType<typeof setup>)=>f.enable()]){const f=setup();f.before(()=>change(f));await assert.rejects(f.flow.send(f.review,()=>{}));assert.equal(f.requests(),0);}
});
test('wallet rejection is reported safely and never retried',async()=>{const f=setup();let requested=0;f.provider.request=async()=>{requested++;throw Error('private provider payload');};await assert.rejects(f.flow.send(f.review,()=>{}),e=>{assert(!String(e).includes('private'));return true;});assert(f.apiCalls.includes('claim/rejected'));assert(!f.apiCalls.includes('claim/report'));await assert.rejects(f.flow.send(f.review,()=>{}));assert.equal(requested,1);});
test('OKX transport permits only the bounded faucet transaction and rejects generic native transfers',()=>{
  const f=setup();assertOkxRequest({method:'eth_sendTransaction',params:[f.review.snapshot!.transaction]},f.review.wallet);
  assert.throws(()=>assertOkxRequest({method:'eth_sendTransaction',params:[{...f.review.snapshot!.transaction,to:f.review.wallet}]},f.review.wallet));
  assert.throws(()=>assertOkxRequest({method:'eth_sendTransaction',params:[f.review.snapshot!.transaction]},'0x'+'b'.repeat(40)));
  for(const method of ['eth_sendRawTransaction','wallet_sendCalls','eth_sign'])assert.throws(()=>assertOkxRequest({method,params:[]},f.review.wallet));
});
test('Korean and English claim copy explains fixed bundle, gas, review and infrastructure',()=>{for(const m of Object.values(claimCopy)){assert(m.review.includes('TESTNET CLAIM'));assert(m.note.includes('0.01'));assert(m.attribution.includes('Sera Protocol'));assert(m.details);assert(m.cancel);assert(m.continue);}});

test('displayed claim balances preserve six-decimal precision while grouping whole tokens',async()=>{
  const {tokenAmount}=await import('../web/claim-panel.js');
  assert.equal(tokenAmount('1000000000000000'),'1,000,000,000');
  assert.equal(tokenAmount('1234567123456'),'1,234,567.123456');
  assert.equal(tokenAmount('1'),'0.000001');
});
