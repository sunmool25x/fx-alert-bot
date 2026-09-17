import test from "node:test";
import assert from "node:assert/strict";
import { authorizationReview } from "../src/trades/review.js";
import { previewView } from "../src/trades/view.js";
import { fixture,wire,deploymentFixture,signer } from "./trade-helpers.js";
import { hashes,USDC,XSGD,validateQuote } from "../src/trades/contract.js";
import { NOW } from "./helpers.js";
function sample(){const q=wire();Object.assign(q.route_params,{maxInputAmount:"2000000",initialDepositAmount:"2000000",minOutputAmount:"411954"});q.permit.value_raw="2000000";q.permit.eip712.message.value="2000000";
  return {deployment:deploymentFixture,quote:q,intentHash:hashes(deploymentFixture,q).struct,amount:"2",fromSymbol:"USDC",toSymbol:"XSGD"};}
for(const lang of ["ko","en"] as const)test(lang+" review separates ownership, bounded Permit, Intent and relayed settlement",()=>{
  const p=sample(),before=JSON.stringify(p),review=authorizationReview(p,lang),data=JSON.stringify(review);assert.equal(JSON.stringify(p),before);
  assert.deepEqual(review.steps.map(s=>s.id),["permit","intent"]);assert(data.includes("2 USDC"));assert(data.includes("0.411954"));assert(data.includes(p.quote.permit.spender));assert(data.includes("11155111"));
  assert.match(data,lang==="ko"?/Permit에는 수령인이 없습니다/:/Permit has no recipient field/);assert.match(data,lang==="ko"?/자동으로 없어지지는 않습니다/:/does not automatically expire/);
  assert.match(data,lang==="ko"?/지갑이 직접 ETH 거래를 보내는 방식이 아닙니다/:/wallet does not directly send an ETH transaction/);
  assert.match(data,lang==="ko"?/예상 체결량은 제공되지/:/expected fill was not provided/);assert(!data.includes("primaryType"));assert(!data.includes("eth_sendTransaction"));
  const preview=previewView(p,lang);assert.equal(preview.version,null);assert.equal(preview.id,"");assert(preview.details);assert(!JSON.stringify(preview).includes("primaryType"));
});
test("selected two-USDC fresh preview keeps execution OFF and cannot promote a discovery quote or a stale session",async()=>{
  const f=await fixture();try{f.config.wallet.enabled=false;f.config.wallet.maxUsdc="2";const id=await f.store.saveIntent("1",USDC,XSGD,"2","wallet");let calls=0;
    f.api.getQuote=async r=>{calls++;assert.equal(r.from_amount,"2000000");assert.equal(r.recipient,r.owner_address);const q=sample().quote;q.route_params.taker=r.owner_address;q.route_params.recipient=r.recipient;return q;};
    const p=await f.service.preview(f.session,id);assert.equal(calls,1);assert.equal(p.amount,"2");assert.equal(f.store.wallet.list("1").length,0);assert.equal(f.submitted(),0);
    assert.throws(()=>f.service.confirm(f.session,"",""),{code:"EXECUTION_DISABLED"});await assert.rejects(f.service.prepare(f.session,id,"wallet"),{code:"EXECUTION_DISABLED"});f.advance(900001);await assert.rejects(f.service.preview(f.session,id),{code:"AUTH_STALE"});assert.equal(calls,1);
  }finally{f.store.close();}
});
for(const change of ["amount","spender","nonce","deadline","chain","recipient","route"] as const)test("selected amount Permit/Intent remains exact: "+change,()=>{
  const p=sample(),q=p.quote;
  if(change==="amount")q.permit.value_raw="2000001";
  if(change==="spender")q.permit.spender=USDC;
  if(change==="nonce")q.permit.eip712.message.nonce=1;
  if(change==="deadline")q.permit.eip712.message.deadline=NOW/1000;
  if(change==="chain")(q.permit.domain as any).chainId=1;
  if(change==="recipient")q.route_params.recipient=USDC;
  if(change==="route")q.route_params.outputToken=USDC;
  assert.throws(()=>validateQuote(q,p.deployment,signer.address,2000000n,NOW/1000+300,NOW/1000,0));
});
