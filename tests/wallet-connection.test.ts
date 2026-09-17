import test from "node:test";
import assert from "node:assert/strict";
import { connectAndVerify,switchSepolia,checkWallet,WalletFlowError,type WalletProvider } from "../web/connection.js";
const address="0x"+"1".repeat(40);
function setup(){
  const calls:string[]=[];let challenges=0,epoch=0;
  const provider:WalletProvider={accounts:[address],chainId:11155111,session:undefined,connect:async()=>{provider.session={};},request:async({method})=>{calls.push(method);if(method==="wallet_switchEthereumChain")provider.chainId=11155111;return "fixture-signature";}};
  const api=async(path:string)=>{calls.push(path);return path==="challenge"?{id:String(++challenges),message:"Ownership only"}:{wallet:address};};
  return {provider,api,calls,epoch:()=>epoch,change:()=>{epoch++;}};
}
test("cancelled wallet connection is safe and can be retried with ownership proof only",async()=>{
  const f=setup();f.provider.connect=async()=>{throw new Error("SDK seed/token details must not surface");};
  await assert.rejects(connectAndVerify(f.provider,f.api,f.epoch),{code:"WALLET_CONNECT_CANCELLED"});assert.deepEqual(f.calls,[]);
  f.provider.connect=async()=>{f.provider.session={};};assert.equal(await connectAndVerify(f.provider,f.api,f.epoch),address);
  assert.deepEqual(f.calls,["challenge","personal_sign","verify"]);
});
test("cancelled ownership signature never verifies a wallet and retry gets a new challenge",async()=>{
  const f=setup();f.provider.request=async()=>{throw new Error("private SDK error");};
  await assert.rejects(connectAndVerify(f.provider,f.api,f.epoch),{code:"OWNERSHIP_REJECTED"});assert.deepEqual(f.calls,["challenge"]);
  f.provider.request=async()=>"test-signature";assert.equal(await connectAndVerify(f.provider,f.api,f.epoch),address);assert.deepEqual(f.calls,["challenge","challenge","verify"]);
});
test("wrong chain blocks challenge and explicit Sepolia switch recovers without financial authorization",async()=>{
  const f=setup();f.provider.chainId=1;await assert.rejects(connectAndVerify(f.provider,f.api,f.epoch),{code:"NETWORK_MISMATCH"});assert.deepEqual(f.calls,[]);
  await switchSepolia(f.provider);assert.equal(await connectAndVerify(f.provider,f.api,f.epoch),address);
  assert.deepEqual(f.calls,["wallet_switchEthereumChain","challenge","personal_sign","verify"]);
});
test("wallet change during ownership approval cannot link the old account",async()=>{
  const f=setup();f.provider.request=async()=>{f.change();return "old";};await assert.rejects(connectAndVerify(f.provider,f.api,f.epoch),{code:"WALLET_REQUIRED"});assert.deepEqual(f.calls,["challenge"]);
});
test("wallet change while the ownership challenge loads prevents a stale wallet prompt",async()=>{
  const f=setup();const delayed=async(path:string)=>{const result=await f.api(path);f.change();return result;};
  await assert.rejects(connectAndVerify(f.provider,delayed,f.epoch),{code:"WALLET_REQUIRED"});
  assert.deepEqual(f.calls,["challenge"]);
});
test("disconnected wallet and expired quote fail before wallet requests; fresh review restores validity only",()=>{
  const f=setup();assert.throws(()=>checkWallet(f.provider,"",200,100),{code:"WALLET_REQUIRED"});
  assert.throws(()=>checkWallet(f.provider,address,100,100),{code:"QUOTE_STALE"});checkWallet(f.provider,address,201,100);assert.deepEqual(f.calls,[]);
});
test("unsupported EOA challenge does not request even an ownership signature",async()=>{
  const f=setup();await assert.rejects(connectAndVerify(f.provider,async()=>{throw new WalletFlowError("EOA_REQUIRED");},f.epoch),{code:"EOA_REQUIRED"});assert.deepEqual(f.calls,[]);
});
