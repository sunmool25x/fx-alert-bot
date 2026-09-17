import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {encodeAbiParameters,encodeEventTopics,parseAbi,type Hex} from 'viem';
import {SepoliaClaimChain,claimClient,faucetAbi} from '../src/claims/chain.js';
import {FAUCET,CLAIM_ALLOCATION,CLAIM_ETH,CLAIM_DATA,type ClaimEvidence} from '../src/claims/protocol.js';
import {USDC,XSGD} from '../src/trades/contract.js';
import {NOW} from './helpers.js';
import {claimSnapshot,claimHash} from './claim-helpers.js';
const wallet=('0x'+'a'.repeat(40)) as Hex,blockHash=('0x'+'cd'.repeat(32)) as Hex;
const word=(n:bigint)=>encodeAbiParameters([{type:'uint256'}],[n]);
const erc=parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)']);
const runtime=JSON.parse(readFileSync('tests/fixtures/faucet-runtime.json','utf8')).bytecode;
function logs(){return [USDC,XSGD].map(address=>({address,data:word(CLAIM_ALLOCATION),topics:encodeEventTopics({abi:erc,eventName:'Transfer',args:{from:FAUCET,to:wallet}})})).concat([
  {address:FAUCET,data:word(CLAIM_ETH),topics:encodeEventTopics({abi:faucetAbi,eventName:'EthClaimed',args:{user:wallet}})}]);}
function setup(){
  let balanceReads=0;
  const tx:any={hash:claimHash,chainId:11155111,from:wallet,to:FAUCET,input:CLAIM_DATA,value:0n,nonce:0,blockHash,gas:10000000n,maxFeePerGas:2000000000n,maxPriorityFeePerGas:1000000n};
  const receipt:any={transactionHash:claimHash,from:wallet,to:FAUCET,blockNumber:101n,blockHash,status:'success',logs:logs(),gasUsed:7751767n,effectiveGasPrice:1000000n};
  const rpc:any={
    getChainId:async()=>11155111,
    getBlockNumber:async()=>110n,
    getBlock:async({blockTag,blockNumber}:any)=>({number:blockNumber??(blockTag==='finalized'?110n:100n),hash:blockHash,timestamp:BigInt(NOW/1000)}),
    getCode:async({address}:any)=>address===FAUCET?runtime:'0x',
    getBalance:async({blockNumber}:any)=>blockNumber===101n?100000000000000000n+CLAIM_ETH-BigInt(receipt.gasUsed)*BigInt(receipt.effectiveGasPrice):100000000000000000n,
    getTransactionCount:async()=>0,
    readContract:async({address,functionName,args,blockNumber}:any)=>{
      if(functionName==='claimAmount')return CLAIM_ALLOCATION;if(functionName==='ethPerUser')return CLAIM_ETH;if(functionName==='claimEpoch')return 2n;
      if(functionName==='getTokens')return [USDC,XSGD];if(functionName==='decimals')return 6;
      if(functionName==='balanceOf'){balanceReads++;return args[0]===FAUCET||blockNumber===101n?CLAIM_ALLOCATION:0n;}
      if(functionName==='hasClaimed')return blockNumber===101n;return false;
    },
    request:async({method,params}:any)=>{assert.equal(method,'eth_simulateV1');assert.equal(params[0].blockStateCalls[0].calls[0].data,CLAIM_DATA);return [{calls:[{status:'0x1',returnData:'0x',logs:logs()},{status:'0x1',returnData:word(CLAIM_ALLOCATION),logs:[]},{status:'0x1',returnData:word(CLAIM_ALLOCATION),logs:[]}]}];},
    estimateGas:async()=>8000000n,estimateFeesPerGas:async()=>({maxFeePerGas:1000000000n,maxPriorityFeePerGas:1000000n}),
    getTransaction:async()=>tx,getTransactionReceipt:async()=>receipt,
  };
  return {rpc,tx,receipt,chain:new SepoliaClaimChain(rpc as ReturnType<typeof claimClient>,()=>NOW),balanceReads:()=>balanceReads};
}
test('verified runtime, fixed allocation, exact token deltas and native transfer are required by simulation',async()=>{
  const f=setup(),s=await f.chain.simulate(wallet);assert.equal(s.receive.usdc,'1000000000000000');assert.equal(s.receive.xsgd,s.receive.usdc);assert.equal(s.receive.eth,'10000000000000000');assert.equal(s.transaction.value,'0x0');assert.equal(s.transaction.chainId,'0xaa36a7');assert(f.balanceReads()>=4);
});
for(const [name,mutate] of Object.entries({
  'wrong deployed bytecode':(f:ReturnType<typeof setup>)=>{f.rpc.getCode=async()=> '0x6000';},
  'wrong RPC chain':(f:ReturnType<typeof setup>)=>{f.rpc.getChainId=async()=>1;},
  'simulation timeout':(f:ReturnType<typeof setup>)=>{f.rpc.request=async()=>{throw Error('secret rpc url');};},
  'simulation revert':(f:ReturnType<typeof setup>)=>{f.rpc.request=async()=>[{calls:[{status:'0x0'}]}];},
  'missing token deltas':(f:ReturnType<typeof setup>)=>{f.rpc.request=async()=>[{calls:[{status:'0x1',logs:logs()},{status:'0x1',returnData:word(0n)},{status:'0x1',returnData:word(0n)}]}];},
  'missing ETH transfer':(f:ReturnType<typeof setup>)=>{f.rpc.request=async()=>[{calls:[{status:'0x1',logs:logs().slice(0,2)},{status:'0x1',returnData:word(CLAIM_ALLOCATION)},{status:'0x1',returnData:word(CLAIM_ALLOCATION)}]}];},
  'pending outgoing transaction':(f:ReturnType<typeof setup>)=>{f.rpc.getTransactionCount=async({blockTag}:any)=>blockTag==='pending'?1:0;},
}))test('simulation fails closed: '+name,async()=>{const f=setup();mutate(f);await assert.rejects(f.chain.simulate(wallet),e=>{assert(!String(e).includes('secret rpc'));return true;});});
test('canonical finalized receipt, transfer logs and resulting exact-token balances produce verified state',async()=>{
  const f=setup(),r=await f.chain.receipt(wallet,claimHash,claimSnapshot(wallet));assert.equal(r.state,'verified');assert.equal(r.balances?.usdc,String(CLAIM_ALLOCATION));
});
for(const [field,value] of Object.entries({hash:'0x'+'ef'.repeat(32),chainId:1,from:'0x'+'b'.repeat(40),to:USDC,input:'0xa262f5f8',value:1n,nonce:1,gas:12000001n,maxFeePerGas:3000000000n,maxPriorityFeePerGas:3000000000n}))test('post-approval verification rejects wrong transaction '+field,async()=>{const f=setup();f.tx[field]=value;assert.equal((await f.chain.receipt(wallet,claimHash,claimSnapshot(wallet))).state,'invalid');});
test('receipt revert, missing transfers and unrelated balance increases never count as a claim',async()=>{
  const f=setup();f.receipt.status='reverted';assert.equal((await f.chain.receipt(wallet,claimHash,claimSnapshot(wallet))).state,'reverted');
  f.receipt.status='success';f.receipt.logs=[];assert.equal((await f.chain.receipt(wallet,claimHash,claimSnapshot(wallet))).state,'invalid');
});
test('receipt success with lagging historical balance stays pending and verifies only after convergence',async()=>{
  const f=setup(),read=f.rpc.readContract;f.rpc.readContract=async(a:any)=>a.functionName==='balanceOf'?0n:read(a);const pending=await f.chain.receipt(wallet,claimHash,claimSnapshot(wallet));assert.equal(pending.state,'mined');assert.equal(pending.reason,'CLAIM_VERIFICATION_PENDING');assert(!pending.balances);
  f.rpc.readContract=read;assert.equal((await f.chain.receipt(wallet,claimHash,claimSnapshot(wallet))).state,'verified');
});
test('receipt before finality stays mined, and reorg or unavailable receipt stays unresolved',async()=>{
  const f=setup(),getBlock=f.rpc.getBlock;f.rpc.getBlock=async(a:any)=>a.blockTag==='finalized'?{number:100n}:getBlock(a);assert.equal((await f.chain.receipt(wallet,claimHash,claimSnapshot(wallet))).state,'mined');
  f.rpc.getBlock=async(a:any)=>({...await getBlock(a),hash:'0x'+'ef'.repeat(32)});assert.equal((await f.chain.receipt(wallet,claimHash,claimSnapshot(wallet))).state,'pending');
  f.rpc.getTransactionReceipt=async()=>{throw Error('timeout');};assert.equal((await f.chain.receipt(wallet,claimHash,claimSnapshot(wallet))).state,'pending');
});

test('actual OKX repricing is accepted only within reviewed total cost; gas-adjusted ETH is proven',async()=>{
  const f=setup(),s=claimSnapshot(wallet);s.transaction.gas='0x8f1644';s.transaction.maxFeePerGas='0x8de39bbe';
  f.tx.gas=7814456n;f.tx.maxFeePerGas=2406770487n;f.tx.maxPriorityFeePerGas=1000000000n;f.receipt.effectiveGasPrice=2089080847n;
  const r=await f.chain.receipt(wallet,claimHash,s);assert.equal(r.state,'verified');assert.equal(r.evidence?.feeAdjusted,true);
  assert.equal(r.evidence?.reviewedMaximumCostRaw,'22322814404637304');assert.equal(r.evidence?.actualMaximumCostRaw,'18807602072760072');assert.equal(r.evidence?.gasPaidRaw,'16194067970106649');assert.equal(r.balances?.eth,'93805932029893351');
});
test('token contracts are validated by address even when a fake token could reuse the symbol',async()=>{
  const f=setup();f.receipt.logs[0].address='0x'+'9'.repeat(40);const r=await f.chain.receipt(wallet,claimHash,claimSnapshot(wallet));assert.equal(r.state,'invalid');assert.equal(r.reason,'CLAIM_TRANSFER_MISMATCH');
});
test('wrong raw amount and recipient fail exact transfer decoding independently of balance',async()=>{
  const f=setup();f.receipt.logs[0].data=word(1000000000n);assert.equal((await f.chain.receipt(wallet,claimHash,claimSnapshot(wallet))).reason,'CLAIM_TRANSFER_MISMATCH');
  f.receipt.logs=logs();f.receipt.logs[0].topics=encodeEventTopics({abi:erc,eventName:'Transfer',args:{from:FAUCET,to:('0x'+'b'.repeat(40)) as Hex}});assert.equal((await f.chain.receipt(wallet,claimHash,claimSnapshot(wallet))).reason,'CLAIM_TRANSFER_MISMATCH');
});
test('event order does not affect exact token/native receipt verification',async()=>{
  const f=setup();f.receipt.logs.reverse();assert.equal((await f.chain.receipt(wallet,claimHash,claimSnapshot(wallet))).state,'verified');
});
test('receipt verification reads actual decimals and rejects unsupported normalization',async()=>{
  const f=setup(),read=f.rpc.readContract;f.rpc.readContract=async(a:any)=>a.functionName==='decimals'?18:read(a);assert.equal((await f.chain.receipt(wallet,claimHash,claimSnapshot(wallet))).reason,'CLAIM_DECIMALS_MISMATCH');
});
test('native balance inconsistency cannot pass and is recoverable without another claim',async()=>{
  const f=setup(),balance=f.rpc.getBalance;f.rpc.getBalance=async()=>100000000000000000n;
  assert.equal((await f.chain.receipt(wallet,claimHash,claimSnapshot(wallet))).reason,'CLAIM_NATIVE_PENDING');f.rpc.getBalance=balance;assert.equal((await f.chain.receipt(wallet,claimHash,claimSnapshot(wallet))).state,'verified');
});
test('RPC timeout during balance reads becomes safe pending, not a terminal mismatch',async()=>{
  const f=setup(),read=f.rpc.readContract;f.rpc.readContract=async(a:any)=>{if(a.functionName==='balanceOf')throw Error('private-rpc-token');return read(a);};
  const r=await f.chain.receipt(wallet,claimHash,claimSnapshot(wallet));assert.deepEqual(r,{state:'pending',reason:'CLAIM_RPC'});assert(!JSON.stringify(r).includes('private'));
});
test('fresh noncached head and canonical block are rechecked after balances',async()=>{
  const f=setup(),get=f.rpc.getBlock;let reads=0;f.rpc.getBlockNumber=async(a:any)=>{assert.equal(a.cacheTime,0);return 110n;};f.rpc.getBlock=async(a:any)=>{const b=await get(a);if(a.blockNumber===101n&&++reads>1)return {...b,hash:'0x'+'de'.repeat(32)};return b;};assert.equal((await f.chain.receipt(wallet,claimHash,claimSnapshot(wallet))).state,'pending');
});

test('retained finalized evidence permits read-only revalidation after RPC historical state pruning; initial verification still requires history',async()=>{
  const f=setup(),snapshot=claimSnapshot(wallet),original=await f.chain.receipt(wallet,claimHash,snapshot);
  assert.equal(original.state,'verified');assert(original.evidence);
  const code=f.rpc.getCode,read=f.rpc.readContract;
  f.rpc.getCode=async(a:any)=>{if(a.blockNumber===101n)throw Error('historical state pruned');return code(a);};
  f.rpc.readContract=async(a:any)=>{assert.equal(a.blockNumber,110n);return a.functionName==='balanceOf'?1000000n:read(a);};
  f.rpc.getBalance=async(a:any)=>{assert.equal(a.blockNumber,110n);return 90000000000000000n;};
  f.rpc.request=async()=>{throw Error('simulation or submission forbidden');};
  assert.deepEqual(await f.chain.receipt(wallet,claimHash,snapshot),{state:'pending',reason:'CLAIM_RPC'});
  const rechecked=await f.chain.receipt(wallet,claimHash,snapshot,original.evidence);
  assert.equal(rechecked.state,'verified');assert.equal(rechecked.balances?.usdc,'1000000');assert.equal(rechecked.balances?.eth,'90000000000000000');
  assert.deepEqual(rechecked.evidence,original.evidence); // Historical proof is not replaced by current balances.
});

for(const [name,mutate] of Object.entries({
  hash:(e:ClaimEvidence):void=>{e.transactionHash='0x'+'ee'.repeat(32);},
  block:(e:ClaimEvidence):void=>{e.blockNumber='102';},
  blockHash:(e:ClaimEvidence):void=>{e.blockHash='0x'+'ef'.repeat(32);},
  finality:(e:ClaimEvidence):void=>{e.finalized=false;},
  confirmations:(e:ClaimEvidence):void=>{e.confirmations='999';},
  token:(e:ClaimEvidence):void=>{e.usdc.contract=XSGD;},
  decimals:(e:ClaimEvidence):void=>{e.xsgd.decimals=18;},
  amount:(e:ClaimEvidence):void=>{e.usdc.receivedRaw='1000000000';},
  native:(e:ClaimEvidence):void=>{e.nativeAfterRaw='110000000000000000';},
  gas:(e:ClaimEvidence):void=>{e.gasPaidRaw='0';},
  reviewedMaximum:(e:ClaimEvidence):void=>{e.reviewedMaximumCostRaw='1';},
  actualMaximum:(e:ClaimEvidence):void=>{e.actualMaximumCostRaw='1';},
}))test('retained proof cannot override canonical receipt facts: '+name,async()=>{
  const f=setup(),snapshot=claimSnapshot(wallet),original=await f.chain.receipt(wallet,claimHash,snapshot);assert(original.evidence);
  mutate(original.evidence);assert.equal((await f.chain.receipt(wallet,claimHash,snapshot,original.evidence)).state,'invalid');
});

test('retained finalized proof cannot bypass fresh transaction, logs, canonical finality or runtime checks',async()=>{
  for(const change of [
    (f:ReturnType<typeof setup>)=>{f.tx.to=USDC;},
    (f:ReturnType<typeof setup>)=>{f.receipt.logs=[];},
    (f:ReturnType<typeof setup>)=>{f.receipt.status='reverted';},
    (f:ReturnType<typeof setup>)=>{f.rpc.getBlock=async()=>({number:100n,hash:blockHash});},
    (f:ReturnType<typeof setup>)=>{f.rpc.getCode=async()=> '0x6000';},
  ]){const f=setup(),snapshot=claimSnapshot(wallet),original=await f.chain.receipt(wallet,claimHash,snapshot);assert(original.evidence);change(f);
    try{assert.notEqual((await f.chain.receipt(wallet,claimHash,snapshot,original.evidence)).state,'verified');}catch(e){assert.equal((e as any).code,'CLAIM_CONTRACT_MISMATCH');}
  }
});
