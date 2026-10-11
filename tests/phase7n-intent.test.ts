import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';import{createRequire}from'node:module';
import{hashTypedData}from'viem';
import{intentRpcData,verifyIntentSignature,canonicalIntentTypes}from'../src/trades/intent-protocol.js';
import{intentData,intentTypes,hashes}from'../src/trades/contract.js';
import{okxTypedDataRequest}from'../web/okx-typed-data.js';
import{wire,deploymentFixture,signer,other}from'./trade-helpers.js';
const require=createRequire(import.meta.url),{Eip155Provider}=require('@okxconnect/universal-provider/src/provider/providers/eip155.js'),{getDefaultReporter}=require('@okxconnect/core');
const reporter=getDefaultReporter();for(const k of ['sendRecordContent','sendRecord','sendCachedRecords','beginReport'])reporter[k]=async()=>false;
test('Intent explicit canonical domain, official field order and uint48; struct differs from full digest',()=>{
  const q=wire(),d=intentData(deploymentFixture,q),w=intentRpcData(d,signer.address);
  assert.deepEqual(canonicalIntentTypes,intentTypes);assert.equal(w.types.Intent.at(-1).type,'uint48');assert.equal(w.types.EIP712Domain.length,4);
  assert.equal(hashTypedData(w),hashes(deploymentFixture,q).intent);assert.notEqual(hashTypedData(w),hashes(deploymentFixture,q).struct);
});
test('Intent installed OKX SDK serializes object params and preserves canonical wallet digest',async()=>{
  const data=intentRpcData(intentData(deploymentFixture,wire()),signer.address),calls:any[]=[];
  const sdk=new Eip155Provider({namespace:{chains:['eip155:11155111'],accounts:['eip155:11155111:'+signer.address],methods:['eth_signTypedData_v4'],defaultChain:'11155111'}},{needCheckRequestMethod:()=>false,request:async(args:any)=>{calls.push(args);const parsed=JSON.parse(args.params.typedDataJson);return{result:await signer.signTypedData({...parsed,types:Object.assign({EIP712Domain:[]},parsed.types)})};}},new EventEmitter());
  const args=okxTypedDataRequest({method:'eth_signTypedData_v4',params:[signer.address,JSON.stringify(data)]},signer.address);
  assert.equal(typeof args.params[1],'object');const sig=await sdk.request({...args,chainId:'eip155:11155111'});
  assert.equal(calls.length,1);assert.equal(calls[0].chainId,'eip155:11155111');assert.equal(hashTypedData(JSON.parse(calls[0].params.typedDataJson)),hashTypedData(data));assert(await verifyIntentSignature(data,sig,signer.address,hashTypedData(data)));
});
for(const change of ['chain','contract','name','version','domainTypes','fieldOrder','fieldType','wallet','recipient','token','deadline','amount','extra']as const)test('Intent wire rejects '+change,()=>{
  const d=intentRpcData(intentData(deploymentFixture,wire()),signer.address);
  if(change==='chain')d.domain.chainId=1;if(change==='contract')d.domain.verifyingContract=other.address;if(change==='name')d.domain.name='Wrong';if(change==='version')d.domain.version='2';
  if(change==='domainTypes')d.types.EIP712Domain=[];if(change==='fieldOrder')d.types.Intent.reverse();if(change==='fieldType')d.types.Intent[8].type='uint256';
  if(change==='wallet')d.message.taker=other.address;if(change==='recipient')d.message.recipient=other.address;if(change==='token')d.message.outputToken=other.address;if(change==='deadline')d.message.deadline=2**48;if(change==='amount')d.message.maxInputAmount='0';if(change==='extra')d.message.arbitrary='x';
  assert.throws(()=>intentRpcData(d,signer.address));
});
for(const change of ['digest','minimum','recipient','signer','noncanonical']as const)test('Intent cryptographic recovery rejects '+change,async()=>{
  const data=intentRpcData(intentData(deploymentFixture,wire()),signer.address),digest=hashTypedData(data);let sig=await (change==='signer'?other:signer).signTypedData(data);
  if(change==='minimum')data.message.minOutputAmount='1';if(change==='recipient')data.message.recipient=other.address;if(change==='noncanonical')sig=(sig.slice(0,130)+'00')as typeof sig;
  await assert.rejects(verifyIntentSignature(data,sig,signer.address,change==='digest'?'0x'+'0'.repeat(64):digest));
});
