import test from 'node:test';import assert from 'node:assert/strict';
import {collectEmptyApprovalHistory} from '../src/permits/approval-history.js';
import type {ReadOnlyRpc} from '../src/permits/retirement-chain.js';
import {USDC} from '../src/trades/contract.js';import {PERMIT_SPENDER} from '../src/permits/protocol.js';
import {SepoliaReads} from '../src/wallet/chain.js';import {wire,deploymentFixture} from './trade-helpers.js';
const owner='0x'+'1'.repeat(40),hash='0x'+'a'.repeat(64),anchors={startHash:hash,endHash:hash},wait=async(ms:number)=>{assert.equal(ms,400);};
function rpc(provider:string,change?:(method:string,params:unknown[],count:number)=>unknown){
 const calls:{method:string;params:unknown[]}[]=[];const out:ReadOnlyRpc={provider,async call(method,params){calls.push({method,params});const modified=change?.(method,params,calls.length);if(modified!==undefined)return modified;if(method==='eth_getBlockByNumber')return{number:params[0],hash};assert.equal(method,'eth_getLogs');return[];}};return{...out,calls};
}
test('two independent providers scan every bounded block exactly once in paced 50-block ranges',async()=>{
 const a=rpc('a'),b=rpc('b'),r=await collectEmptyApprovalHistory([a,b],owner,123n,224n,anchors,wait);
 assert.equal(r.status,'COMPLETE_BOUNDED');assert.equal(r.approvalCount,0);
 for(const p of[a,b]){const filters=p.calls.filter(c=>c.method==='eth_getLogs').map(c=>c.params[0]as any);assert.deepEqual(filters.map(f=>[BigInt(f.fromBlock),BigInt(f.toBlock)]),[[123n,172n],[173n,222n],[223n,224n]]);for(const f of filters){assert.equal(f.address,USDC);assert.equal(f.topics.length,3);assert.equal(f.topics[1],'0x'+owner.slice(2).padStart(64,'0'));assert.equal(f.topics[2],'0x'+PERMIT_SPENDER.slice(2).toLowerCase().padStart(64,'0'));}assert.equal(p.calls.filter(c=>c.method==='eth_getBlockByNumber').length,4);}
});
test('one-block interval is still checked on both RPCs',async()=>{const a=rpc('a'),b=rpc('b');await collectEmptyApprovalHistory([a,b],owner,0n,0n,anchors,wait);assert.equal(a.calls.filter(c=>c.method==='eth_getLogs').length,1);assert.equal(b.calls.filter(c=>c.method==='eth_getLogs').length,1);});
for(const failure of ['partial','malformed','approval','reorg-start','reorg-end','wrong-block'])test('history fails closed: '+failure,async()=>{
 const a=rpc('a'),b=rpc('b',(method,params,count)=>{if(method==='eth_getLogs'){if(failure==='partial'&&count>3)throw Error('PROVIDER_LIMIT');if(failure==='malformed')return{};if(failure==='approval')return[{}];}if(method==='eth_getBlockByNumber'){if(failure==='wrong-block')return{number:'0xff',hash};if(count>4&&((failure==='reorg-start'&&params[0]==='0x1')||(failure==='reorg-end'&&params[0]==='0x64')))return{number:params[0],hash:'0x'+'b'.repeat(64)};}return undefined;});
 await assert.rejects(collectEmptyApprovalHistory([a,b],owner,1n,100n,anchors,wait));
 assert(b.calls.every(c=>['eth_getLogs','eth_getBlockByNumber'].includes(c.method)));
});
for(const [from,to]of[[-1n,1n],[2n,1n],[0n,10001n]]as const)test('out-of-policy bounds rejected '+from+'/'+to,async()=>{const a=rpc('a'),b=rpc('b');await assert.rejects(collectEmptyApprovalHistory([a,b],owner,from,to,anchors,wait));assert.equal(a.calls.length+b.calls.length,0);});
test('duplicate or missing independent provider blocks before RPC',async()=>{const a=rpc('a');for(const list of[[a],[a,a],[]])await assert.rejects(collectEmptyApprovalHistory(list,owner,1n,2n,anchors,wait));assert.equal(a.calls.length,0);});
test('settlement catch-up respects the same provider range limit without skipping blocks',async()=>{
 const chain=new SepoliaReads('https://a.example','https://b.example'),ranges:bigint[][][]=[[],[]];
 for(const [index,reader]of[chain,(chain as any).peer].entries())(reader as any).client={getChainId:async()=>11155111,getBlock:async()=>({number:210n}),getLogs:async({fromBlock,toBlock}:{fromBlock:bigint;toBlock:bigint})=>{assert(toBlock-fromBlock<50n);ranges[index]!.push([fromBlock,toBlock]);return[];}};
 let cursor=100n;while(cursor<=210n){const r=await chain.settle(deploymentFixture,wire(),hash,cursor);assert.equal(r.evidence,undefined);assert(r.next>cursor);cursor=r.next;}
 assert.deepEqual(ranges[0],[[100n,149n],[150n,199n],[200n,210n]]);assert.deepEqual(ranges[1],ranges[0]);assert.equal(cursor,211n);
});
