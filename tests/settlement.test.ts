import test from "node:test";
import assert from "node:assert/strict";
import { encodeEventTopics,encodeAbiParameters,parseAbiItem,type Hex } from "viem";
import { receiptEvidence } from "../src/wallet/chain.js";
import { wire,deploymentFixture } from "./trade-helpers.js";
import { hashes,USDC,XSGD } from "../src/trades/contract.js";
function receipt(){
  const q=wire(),hash=hashes(deploymentFixture,q).struct;
  const transfer=(token:string,from:string,to:string,value:bigint)=>({address:token,data:encodeAbiParameters([{type:"uint256"}],[value]),topics:encodeEventTopics({abi:[parseAbiItem("event Transfer(address indexed from,address indexed to,uint256 value)")],eventName:"Transfer",args:{from:from as Hex,to:to as Hex}}) as Hex[]});
  const data={status:"success",transactionHash:"0x"+"a".repeat(64),blockHash:"0x"+"b".repeat(64),blockNumber:100n,logs:[
    {address:deploymentFixture.sor_address,data:encodeAbiParameters([{type:"uint256"}],[1n]),topics:encodeEventTopics({abi:[parseAbiItem("event IntentMatched(bytes32 indexed intentHash,address indexed taker,uint256 legCount)")],eventName:"IntentMatched",args:{intentHash:hash,taker:q.route_params.taker as Hex}}) as Hex[]},
    transfer(USDC,q.route_params.taker,deploymentFixture.sera_address,100000000n),transfer(XSGD,deploymentFixture.sera_address,q.route_params.recipient,125000000n)]};
  return {q,hash,data};
}
test("exact SOR struct event plus bounded token movements and finalized successful receipt is evidence",()=>{
  const r=receipt(),e=receiptEvidence(deploymentFixture,r.q,r.hash,r.data,r.data.blockHash,100n);
  assert.equal(e?.inputRaw,"100000000");assert.equal(e?.outputRaw,"125000000");assert.equal(e?.txHash,r.data.transactionHash);
});
for(const condition of ["reverted","unfinalized","reorg","wrong event","wrong contract","wrong wallet","approval only","excess debit","insufficient output"])test("settlement rejects "+condition,()=>{
  const r=receipt();let canonical=r.data.blockHash,finalized=101n;
  if(condition==="reverted")r.data.status="reverted";if(condition==="unfinalized")finalized=99n;if(condition==="reorg")canonical="0x"+"f".repeat(64);
  if(condition==="wrong event")r.data.logs[0]!.topics[1]=("0x"+"f".repeat(64)) as Hex;
  if(condition==="wrong contract")r.data.logs[0]!.address=USDC;
  if(condition==="wrong wallet")r.data.logs[0]!.topics[2]=("0x"+"0".repeat(64)) as Hex;
  if(condition==="approval only")r.data.logs=[];
  if(condition==="excess debit")r.data.logs[1]!.data=encodeAbiParameters([{type:"uint256"}],[100000001n]);
  if(condition==="insufficient output")r.data.logs[2]!.data=encodeAbiParameters([{type:"uint256"}],[124999999n]);
  assert.equal(receiptEvidence(deploymentFixture,r.q,r.hash,r.data,canonical,finalized),undefined);
});
