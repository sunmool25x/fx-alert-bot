import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {EventEmitter} from 'node:events';
import {OkxConnection,type OkxBridge} from '../web/okx-connector.js';
import {claimSnapshot,claimHash} from './claim-helpers.js';
const wallet='0x'+'a'.repeat(40),topic='claim-fixture-topic';
test('OKX private channel forwards the exact claim once and fences account changes',async()=>{
  let receive!:(m:any)=>void;const sent:any[]=[];
  const bridge:OkxBridge={start:r=>receive=r,send:m=>sent.push(m),close:()=>{}};const c=new OkxConnection('ios',bridge);
  const start=c.start(()=>{},()=>{});receive({type:'uri',uri:'https://web3.okx.com/ul/connect?topic='+topic+'abcdef',topic});receive({type:'connected',snapshot:{topic,chainId:11155111,accounts:[wallet]},requestUri:'https://web3.okx.com/ul/connect',claimSupported:true});await start;
  try{const tx=claimSnapshot(wallet).transaction,promise=c.request({method:'eth_sendTransaction',params:[tx]});assert.deepEqual(sent[0].args.params,[tx]);assert(Object.isFrozen(sent[0].args.params[0]));
    assert.throws(()=>c.request({method:'eth_sendTransaction',params:[tx]}),{code:'CLAIM_BUSY'});receive({type:'response',id:sent[0].id,result:claimHash});assert.equal(await promise,claimHash);assert.equal(sent.length,1);
  }finally{c.cancel();}
});
test('installed OKX SDK preserves all claim fields at its client request boundary',async()=>{
  // Exercise the pinned vendor adapter without a relay, wallet, network or real account.
  const require=createRequire(import.meta.url),{Eip155Provider}=require(resolve('node_modules/@okxconnect/universal-provider/src/provider/providers/eip155.js'));
  const forwarded:any[]=[];const tx=Object.freeze(claimSnapshot(wallet).transaction);
  const sdk=new Eip155Provider({namespace:{chains:['eip155:11155111'],defaultChain:'11155111',accounts:['eip155:11155111:'+wallet],methods:['eth_sendTransaction'],rpcMap:{}}},
    {needCheckRequestMethod:()=>true,request:async(args:any)=>{forwarded.push(structuredClone(args));return {result:claimHash};}},new EventEmitter());
  const result=await sdk.request({chainId:'eip155:11155111',method:'eth_sendTransaction',params:[tx]});assert.equal(result,claimHash);assert.equal(forwarded.length,1);assert.equal(forwarded[0].chainId,'eip155:11155111');assert.deepEqual(forwarded[0].params,tx);
});
