import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./trade-helpers.js";
import { previewView,tradeView } from "../src/trades/view.js";
import { SettlementMonitor } from "../src/trades/settlement.js";
import { AppError } from "../src/utils/errors.js";
import { acceptanceLog } from "../src/wallet/diagnostics.js";
import { walletFailure,stateText } from "../src/i18n/wallet.js";
test("execution OFF permits fresh owned preview but creates no signable trade; enabling requires another quote",async()=>{
  const f=await fixture();try{
    f.config.wallet.enabled=false;const p=await f.service.preview(f.session,f.intent),view=previewView(p,"ko");assert.equal(f.calls(),1);assert.equal(view.state,"PREVIEW");assert.equal(view.version,null);assert.equal(view.id,"");
    assert.match(view.text,/테스트 거래 준비 · 조회 전용/);assert(!JSON.stringify(view).includes("primaryType"));assert.equal(f.store.wallet.list("1").length,0);assert.equal(f.submitted(),0);
    assert.throws(()=>f.service.confirm(f.session,"", ""),{code:"EXECUTION_DISABLED"});
    await assert.rejects(f.prepare(),{code:"EXECUTION_DISABLED"});f.config.wallet.enabled=true;const row=await f.prepare();assert.equal(f.calls(),2);assert.notEqual(row.quote_id,p.quote.uuid);
  }finally{f.store.close();}
});
test("preview rejects another user's intent and a disconnected wallet",async()=>{
  const f=await fixture();try{const other=await f.store.saveIntent("2","x","y","5");await assert.rejects(f.service.preview(f.session,other),{code:"TRADE_STATE"});assert.equal(f.calls(),0);
    f.store.wallet.disconnect("1");await assert.rejects(f.service.preview(f.session,f.intent),{code:"WALLET_REQUIRED"});assert.equal(f.submitted(),0);
  }finally{f.store.close();}
});
test("owner-scoped status refresh respects backoff and never resubmits UNKNOWN trades",async()=>{
  const f=await fixture();try{
    const row=await f.prepare();f.service.confirm(f.session,row.id,row.version!);const sig=await f.signatures(row);let attempts=0,reads=0;
    f.sender.submit=async()=>{attempts++;throw new AppError("UNAVAILABLE");};await f.service.submit(f.session,row.id,row.version!,sig.signature,sig.permitSignature);
    f.chain.settle=async(_d,_q,_h,cursor)=>{reads++;return {next:cursor+1n};};const worker=new SettlementMonitor(f.store.wallet,f.chain,60000,async()=>{},f.now);
    await worker.refresh("2");assert.equal(reads,0);await Promise.all([worker.refresh("1"),worker.refresh("1"),worker.cycle()]);assert.equal(reads,1);
    await worker.refresh("1");assert.equal(reads,1);f.advance(300000);await worker.refresh("1");assert.equal(reads,2);assert.equal(attempts,1);assert.equal(f.store.wallet.trade(row.id,"1")!.state,"UNKNOWN");
  }finally{f.store.close();}
});
test("diagnostics and UI expose stable codes, never supplied secrets, identifiers or stack traces",()=>{
  const lines:string[]=[],original=console.info;console.info=(v:unknown)=>{lines.push(String(v));};
  try {acceptanceLog("submit","SUBMISSION_UNKNOWN","987654321012","0x"+"c".repeat(40));acceptanceLog("secret-url","signature-token-secret","987654321012");}finally{console.info=original;}
  const text=lines.join("\n");for(const privateValue of ["987654321012","0x"+"c".repeat(40),"secret-url","signature-token-secret"])assert(!text.includes(privateValue));
  assert.match(text,/user_ref/);assert.equal(JSON.parse(lines[0]!).user_ref,JSON.parse(lines[1]!).user_ref);
  for(const lang of ["ko","en"] as const){assert.match(walletFailure(lang,"AUTH_INVALID"),/\[AUTH_INVALID\]/);assert(!walletFailure(lang,"signature-token-secret").includes("signature-token-secret"));assert.notEqual(stateText(lang,"SUBMITTING"),stateText(lang,"UNKNOWN"));}
});
test("completion card includes verified amounts and IDs; pending card has no explorer",async()=>{
  const f=await fixture();try{
    const row=await f.prepare();row.trade_id="00000000-0000-4000-8000-000000000001";row.tx_hash="0x"+"a".repeat(64);row.state="PENDING";
    assert.equal(tradeView(row,"ko").explorer,undefined);row.state="CONFIRMED";row.evidence=JSON.stringify({inputRaw:"100000000",outputRaw:"126000000"});
    const view=tradeView(row,"ko");assert.match(view.text,/확인된 수령액: 126 XSGD/);assert.match(view.text,/Sera trade ID:/);assert.match(view.text,/Intent ID:/);assert(view.explorer?.includes(row.tx_hash));
  }finally{f.store.close();}
});
