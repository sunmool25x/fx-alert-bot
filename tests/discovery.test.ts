import test from "node:test";
import assert from "node:assert/strict";
import { probeMatrix, selectIntended, selectFallback, discoveryFailure, discoveryBinding, DISCOVERY_AMOUNTS, type DiscoveryPair, type ProbeResult } from "../src/trades/discovery.js";
import { USDC,XSGD } from "../src/trades/contract.js";
import { wire,signer } from "./trade-helpers.js";
import { NOW } from "./helpers.js";
import { AppError } from "../src/utils/errors.js";
import type { QuoteRequest } from "../src/sera/client.js";
const usdc={address:USDC,symbol:"USDC",currency:"USD",decimals:6},xsgd={address:XSGD,symbol:"XSGD",currency:"SGD",decimals:6};
const pairs:DiscoveryPair[]=[{from:usdc,to:xsgd},{from:xsgd,to:usdc}],wallet=signer.address;
function setup(){let now=NOW,calls=0,active=0,maxActive=0;const starts:number[]=[];
  const api={liveTime:async()=>({timestamp:Math.floor(now/1000)}),getQuote:async(r:QuoteRequest)=>{calls++;active++;maxActive=Math.max(maxActive,active);starts.push(now);await Promise.resolve();active--;
    if(BigInt(r.from_amount)<2000000n)throw new AppError("NO_LIQUIDITY");const q=wire(r.owner_address,calls);
    Object.assign(q.route_params,{inputToken:r.from_token,outputToken:r.to_token,maxInputAmount:r.from_amount,initialDepositAmount:r.from_amount,deadline:r.expiration});q.expires_at=Math.floor(now/1000)+30;return q;}};
  return {api,now:()=>now,wait:async(ms:number)=>{now+=ms;},calls:()=>calls,maxActive:()=>maxActive,starts};
}
test("discovery uses paced fresh sequential quotes in both directions, chooses smallest successful forward size",async()=>{
  const f=setup(),rows=await probeMatrix({...f,pairs,wallet});assert.equal(rows.length,20);assert.equal(f.calls(),20);assert.equal(f.maxActive(),1);
  assert(f.starts.slice(1).every((n,i)=>n-f.starts[i]!>=1500));const result=selectIntended(rows);assert.equal(result.classification,"B");assert.equal(result.selected?.amount,"2");assert.equal(result.fallbackAllowed,false);
  assert(rows.filter(r=>r.state==="EXECUTABLE_QUOTE").every(r=>r.route?.recipientSameWallet&&r.minimumOutputRaw));
});
test("successful smaller amount is distinguished from pair-wide absence",async()=>{
  const f=setup();f.api.getQuote=async r=>{const q=wire(r.owner_address);Object.assign(q.route_params,{inputToken:r.from_token,outputToken:r.to_token,maxInputAmount:r.from_amount,initialDepositAmount:r.from_amount,deadline:r.expiration});q.expires_at=Math.floor(f.now()/1000)+30;return q;};
  const result=selectIntended(await probeMatrix({...f,pairs,wallet}));assert.equal(result.classification,"A");assert.equal(result.selected?.amount,"0.01");assert.equal(result.referenceExecutable,true);
});
test("both directions must genuinely lack liquidity before a fallback is allowed",async()=>{
  const f=setup();f.api.getQuote=async()=>{throw new AppError("NO_LIQUIDITY");};const rows=await probeMatrix({...f,pairs,wallet});
  assert.equal(selectIntended(rows).classification,"D");assert.equal(selectIntended(rows).fallbackAllowed,true);
  assert.equal(selectIntended(rows.slice(1)).classification,"E");rows[4]!.state="RPC_ERROR";assert.equal(selectIntended(rows).fallbackAllowed,false);
});
test("reverse-only executable liquidity is C, without authorizing reverse product execution",async()=>{
  const f=setup(),quote=f.api.getQuote;f.api.getQuote=async r=>{if(r.from_token===USDC)throw new AppError("NO_LIQUIDITY");return quote(r);};
  const result=selectIntended(await probeMatrix({...f,pairs,wallet}));assert.equal(result.classification,"C");assert.equal(result.selected?.pair.from.address,XSGD);assert.equal(result.fallbackAllowed,false);
});
test("registry minimums are skipped before API calls and a rate limit ends the bounded matrix",async()=>{
  const f=setup();f.api.getQuote=async()=>{throw new AppError("RATE_LIMITED");};const rows=await probeMatrix({...f,pairs:[{from:{...usdc,min_trade_amount_raw:"1000000"},to:xsgd}],wallet});
  assert.equal(rows.filter(r=>r.state==="BELOW_MINIMUM").length,3);assert.equal(rows.at(-1)?.state,"RATE_LIMITED");assert.equal(rows.length,4);assert.equal(selectIntended(rows).classification,"E");
});
test("amount cap, duplicate matrix entries and excessive pacing reject before requests",async()=>{
  const f=setup();for(const extra of [{amounts:["100.000001"]},{amounts:["1","1.0"]},{intervalMs:1}])await assert.rejects(probeMatrix({...f,pairs,wallet,...extra}));assert.equal(f.calls(),0);
});
test("fallback selects at most one verified held-USDC candidate within cap and never changes product support",()=>{
  const row:ProbeResult={pair:{from:usdc,to:{...xsgd,address:"0x"+"8".repeat(40)}},amount:"2",inputRaw:"2000000",state:"EXECUTABLE_QUOTE",at:NOW,latencyMs:1};
  const candidates=[{row,contractsVerified:false,heldInputRaw:"999999999"},{row:{...row,inputRaw:"100000001"},contractsVerified:true,heldInputRaw:"999999999"},{row,contractsVerified:true,heldInputRaw:"2000000"}];
  const allowed={classification:"D" as const,fallbackAllowed:true,referenceExecutable:false};const fallback=selectFallback(allowed,candidates);assert.equal(fallback?.row,row);assert.equal(fallback?.label,"E2E_TEST_FALLBACK_PAIR");assert.equal(fallback?.executionSupported,false);
  assert.equal(selectFallback({...allowed,classification:"E",fallbackAllowed:false},candidates),undefined);assert.equal(selectFallback(allowed,[{row,contractsVerified:true,heldInputRaw:"1"}]),undefined);
});
for(const field of ["taker","recipient","inputToken","outputToken","maxInputAmount","initialDepositAmount","deadline","expires_at"] as const)test("discovery rejects changed fresh quote binding: "+field,()=>{
  const q=wire(wallet);if(field==="expires_at")q.expires_at=NOW/1000;else if(field==="deadline")q.route_params.deadline++;
  else if(field.endsWith("Amount"))q.route_params[field as "maxInputAmount"]="1";else q.route_params[field as "taker"]="0x"+"9".repeat(40);
  assert.throws(()=>discoveryBinding(q,pairs[0]!,wallet,100000000n,NOW/1000+300,NOW));
});
test("no-liquidity, expired quote, RPC, authorization and validation have separate safe classifications",async()=>{
  for(const [code,state]of [["NO_LIQUIDITY","NO_LIQUIDITY"],["QUOTE_STALE","QUOTE_EXPIRED"],["RPC_UNAVAILABLE","RPC_ERROR"],["AUTH_STALE","AUTH_ERROR"],["INVALID_PERMIT","VALIDATION_ERROR"]])assert.equal(discoveryFailure(new AppError(code!)).state,state);
  assert.deepEqual(discoveryFailure(new Error("secret rpc url")),{state:"API_ERROR",errorCode:"UNAVAILABLE"});
  const f=setup(),rows=await probeMatrix({...f,pairs:[pairs[0]!],amounts:["2"],wallet,verify:async()=>{throw Error("private rpc endpoint");}});assert.equal(rows[0]?.state,"RPC_ERROR");assert(!JSON.stringify(rows).includes("private rpc"));
});
