import test from "node:test";
import assert from "node:assert/strict";
import { WalletFlow } from "../web/wallet-flow.js";
import { prepareOwnership,WalletFlowError } from "../web/connection.js";
import { routingText } from "../web/wallet-copy.js";
import type { ConnectedProvider,WalletConnection } from "../web/connector-types.js";
import { liveEnvironment } from "../scripts/live/environment.js";
const address="0x"+"2".repeat(40);
const tick=()=>new Promise<void>(r=>setImmediate(r));
function deferred<T>(){let resolve!:(v:T)=>void;const promise=new Promise<T>(r=>resolve=r);return {promise,resolve};}
function fixture(desktop=false){
  const calls:string[]=[],proof=deferred<unknown>();let live=true,epoch=0,now=0;
  const provider:ConnectedProvider={session:{},accounts:[address],chainId:11155111,connect:async()=>assert.fail("No second connection"),disconnect:async()=>{},on:()=>{},request:()=>{calls.push("personal_sign");return proof.promise;}};
  const guard=()=>{if(!live)throw new WalletFlowError("WALLET_REQUIRED");};
  const api=async(path:string)=>{calls.push(path);return path==="challenge"?{id:"fixture",message:"Ownership only"}:{wallet:address};};
  const connection:WalletConnection={choice:"okx",environment:desktop?"desktop":"ios",handoffUri:"https://web3.okx.com/ul/connect",start:async()=>provider,assert:guard,assertActive:guard,cancel:()=>{live=false;}};
  const flow=new WalletFlow({create:()=>{calls.push("create");return connection;},view:()=>{},invalidate:async()=>{},connected:()=>{},pending:()=>{},cancelled:()=>{},error:()=>{},
    prepare:(p,g)=>prepareOwnership(p,api,()=>epoch,g,()=>now),
    verify:async(_p,g,onRequest,prepared)=>{g();assert(prepared);await prepared.verify(onRequest);},
    open:c=>{assert.equal(c,connection);calls.push("open");},
  });
  return {calls,flow,proof,provider,api,guard,advance:()=>{now=90_000;},change:()=>{epoch++;},start:async()=>{await flow.choose();await flow.select("okx");}};
}
test("connection prepares ownership automatically but prompts only on explicit verification",async()=>{
  const f=fixture();await f.start();assert.equal(f.flow.screen.step,"ownership");assert.deepEqual(f.calls,["create","challenge"]);
  const work=f.flow.verify();assert.deepEqual(f.calls,["create","challenge","personal_sign","open"]);assert.equal(f.flow.screen.step,"verifying");
  f.proof.resolve("signature");await work;assert.equal(f.flow.screen.step,"success");assert.equal(f.calls.filter(x=>x==="create").length,1);assert.equal(f.calls.at(-1),"verify");f.flow.cancel();
});
test("prepared ownership requires backend verification; connection alone is not success",async()=>{
  const f=fixture();await f.start();assert.notEqual(f.flow.screen.step,"success");assert(!f.calls.includes("verify"));f.flow.cancel();assert(!f.calls.includes("personal_sign"));
});
test("changed account epoch cannot sign the prepared ownership challenge",async()=>{
  const f=fixture();await f.start();f.change();await f.flow.verify();assert(!f.calls.includes("personal_sign"));assert.equal(f.flow.screen.step,"error");
});
test("cancelled preparation cannot request a late signature or reopen the wallet",async()=>{
  const f=fixture(),delayed=deferred<{id:string;message:string}>();const work=prepareOwnership(f.provider,()=>delayed.promise,()=>0,f.guard);
  f.flow.cancel(); // Fixture connection is not yet selected: explicitly retire its guard below.
  await f.start();f.flow.cancel();delayed.resolve({id:"late",message:"ownership"});await assert.rejects(work,{code:"WALLET_REQUIRED"});assert(!f.calls.includes("personal_sign"));assert(!f.calls.includes("open"));
});
test("expired prefetched challenge fails closed before any wallet prompt",async()=>{
  const f=fixture();await f.start();f.advance();await f.flow.verify();assert(!f.calls.includes("personal_sign"));assert.equal(f.flow.screen.code,"AUTH_STALE");
});
test("prepared ownership is single-use even when the wallet request is pending",async()=>{
  const f=fixture(),p=await prepareOwnership(f.provider,f.api,()=>0);const work=p.verify();await assert.rejects(p.verify(),{code:"AUTH_STALE"});f.proof.resolve("signature");assert.equal(await work,address);assert.equal(f.calls.filter(x=>x==="personal_sign").length,1);
});
test("desktop ownership uses the connected wallet without a mobile app launch",async()=>{
  const f=fixture(true);await f.start();const work=f.flow.verify();assert(!f.calls.includes("open"));f.proof.resolve("signature");await work;assert.equal(f.flow.screen.step,"success");f.flow.cancel();
});
test("pending preparation ignores extra verification taps and cancellation",async()=>{
  const f=fixture(),prep=deferred<ReturnType<typeof prepareOwnership> extends Promise<infer T>?T:never>();let calls=0,live=true;
  const c:WalletConnection={choice:"okx",environment:"ios",start:async()=>f.provider,assert:()=>{if(!live)throw Error("cancelled");},assertActive:()=>{},cancel:()=>{live=false;}};
  const flow=new WalletFlow({create:()=>c,view:()=>{},invalidate:async()=>{},connected:()=>{},prepare:()=>prep.promise,verify:async()=>{calls++;},open:()=>{calls++;},pending:()=>{},error:()=>{},cancelled:()=>{}});
  await flow.choose();const selecting=flow.select("okx");await tick();assert(flow.screen.busy);await flow.verify();assert.equal(calls,0);flow.cancel();prep.resolve({verify:async()=>address});await selecting;assert.equal(flow.screen.step,"closed");assert.equal(calls,0);
});
test("second-step copy names the chosen wallet and live configuration retains both safety gates",()=>{
  assert.equal(routingText.ko.verifyIn("OKX Wallet"),"OKX Wallet에서 확인");assert.equal(routingText.en.verifyIn("OKX Wallet"),"Verify in OKX Wallet");
  const env=liveEnvironment({ENABLE_MAINNET:"true",ENABLE_TESTNET_EXECUTION:"true"},"https://example.trycloudflare.com");assert.equal(env.ENABLE_MAINNET,"false");assert.equal(env.ENABLE_TESTNET_EXECUTION,"false");
});
