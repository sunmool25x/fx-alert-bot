import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync,rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fixture,signer,wire } from "./trade-helpers.js";
import { PROBE_OWNER } from "../src/sera/service.js";
import { AppError } from "../src/utils/errors.js";
import { SqliteStore } from "../src/database/store.js";
import { SettlementMonitor } from "../src/trades/settlement.js";
test("fresh wallet-specific quote binds exact owner, recipient, amount, origin and review version",async()=>{
  const f=await fixture();try{const row=await f.prepare(),p=f.service.snapshot(row);
    assert.equal(f.calls(),1);assert.equal(p.quote.route_params.taker,signer.address.toLowerCase());assert.equal(p.quote.route_params.recipient,p.quote.route_params.taker);
    assert.equal(row.state,"REVIEW");assert.equal(row.origin,"alpha");assert.equal(f.submitted(),0);
    const auth=f.service.confirm(f.session,row.id,row.version!);assert.equal(auth.version,row.version);
    assert.throws(()=>f.service.confirm(f.session,row.id,row.version!),{code:"QUOTE_STALE"});
  }finally{f.store.close();}
});
test("disabled flag and empty/nonmatching beta allowlist block backend preparation and submit",async()=>{
  for(const gate of ["enabled","users"] as const){const f=await fixture();try{
    const row=await f.prepare();f.service.confirm(f.session,row.id,row.version!);const sig=await f.signatures(row);
    if(gate==="enabled")f.config.wallet.enabled=false;else f.config.wallet.users=[];
    await assert.rejects(f.prepare());await assert.rejects(f.service.submit(f.session,row.id,row.version!,true));assert.equal(f.submitted(),0);
  }finally{f.store.close();}}
});
test("user A cannot use user B's intent, trade status ownership or confirmation",async()=>{
  const f=await fixture();try{
    const row=await f.prepare();const second=f.store.wallet.newSession("2","otherauth",900000);const s=f.store.wallet.session(second.token)!;
    f.store.wallet.link(s,signer.address.toLowerCase());f.config.wallet.users.push("2");const owned=f.store.wallet.session(second.token)!;
    assert.equal(f.store.wallet.trade(row.id,"2"),undefined);await assert.rejects(f.service.prepare(owned,f.intent,"quote"));
    assert.throws(()=>f.service.confirm(owned,row.id,row.version!));const sig=await f.signatures(row);
    await assert.rejects(f.service.submit(owned,row.id,row.version!,true));assert.equal(f.submitted(),0);
  }finally{f.store.close();}
});
test("a monitoring quote is never promoted to an executable wallet quote",async()=>{
  const f=await fixture();try{f.api.getQuote=async()=>wire(PROBE_OWNER);await assert.rejects(f.prepare(),{code:"QUOTE_BINDING_MISMATCH"});assert.equal(f.submitted(),0);}finally{f.store.close();}
});
test("new quote after cancellation rejects every old version and old Intent signature",async()=>{
  const f=await fixture();try{const old=await f.prepare(),oldSig=await f.signatures(old);f.service.confirm(f.session,old.id,old.version!);f.service.cancel(f.session,old.id);
    const fresh=await f.prepare();assert.notEqual(fresh.version,old.version);assert.throws(()=>f.service.confirm(f.session,fresh.id,old.version!));
    f.service.confirm(f.session,fresh.id,fresh.version!);const freshSig=await f.signatures(fresh);
    await f.service.requestAuthorization(f.session,fresh.id,fresh.version!,'permit',true);await f.service.recordAuthorization(f.session,fresh.id,fresh.version!,'permit',freshSig.permitSignature);
    await f.service.requestAuthorization(f.session,fresh.id,fresh.version!,'intent',true);const invalid=await f.service.recordAuthorization(f.session,fresh.id,fresh.version!,'intent',oldSig.signature);assert.equal(invalid.intent?.valid,0);await assert.rejects(f.service.submit(f.session,fresh.id,fresh.version!,true));assert.equal(f.submitted(),0);
  }finally{f.store.close();}
});
test("stored financial-term changes invalidate the confirmed canonical payload",async()=>{
  const f=await fixture();try{const row=await f.prepare();f.service.confirm(f.session,row.id,row.version!);const sig=await f.signatures(row);
    const p=f.service.snapshot(row);p.quote.route_params.minOutputAmount="1";assert.throws(()=>f.store.wallet.transition(row.id,["SIGNATURES"],"SIGNATURES",{payload:JSON.stringify(p)}));
    assert.notEqual(f.service.snapshot(f.store.wallet.trade(row.id,"1")!).quote.route_params.minOutputAmount,"1");await assert.rejects(f.service.submit(f.session,row.id,row.version!,true));assert.equal(f.submitted(),0);
  }finally{f.store.close();}
});
test("expired review and signatures fail closed; a fresh quote needs fresh confirmation",async()=>{
  const f=await fixture();try{const row=await f.prepare();f.service.confirm(f.session,row.id,row.version!);const sig=await f.signatures(row);f.advance(26000);
    await assert.rejects(f.service.submit(f.session,row.id,row.version!,true));assert.equal(f.store.wallet.trade(row.id,"1")!.state,"EXPIRED");
    assert.equal(f.submitted(),0);
  }finally{f.store.close();}
});
test("changed terms, wrong signatures and a cancelled review never reach submission",async()=>{
  const f=await fixture();try{const row=await f.prepare(),sig=await f.signatures(row);
    assert.throws(()=>f.service.confirm(f.session,row.id,"f".repeat(64)));
    f.service.confirm(f.session,row.id,row.version!);
    await assert.rejects(f.service.submit(f.session,row.id,row.version!,sig.permitSignature,sig.signature));
    f.service.cancel(f.session,row.id);await assert.rejects(f.service.submit(f.session,row.id,row.version!,true));assert.equal(f.submitted(),0);
  }finally{f.store.close();}
});
test("concurrent clicks/tabs create exactly one persisted attempt and one submission call",async()=>{
  const f=await fixture();try{const row=await f.prepare();f.service.confirm(f.session,row.id,row.version!);const sig=await f.authorize(row);
    const results=await Promise.allSettled(Array.from({length:8},()=>f.service.submit(f.session,row.id,row.version!,true)));
    assert.equal(results.filter(r=>r.status==="fulfilled").length,1);assert.equal(f.submitted(),1);assert.equal(f.store.wallet.trade(row.id,"1")!.state,"PENDING");
    await assert.rejects(f.prepare(),{code:"WALLET_BUSY"});
  }finally{f.store.close();}
});
test("disconnect and changed wallet invalidate unsubmitted authorization in every tab",async()=>{
  const f=await fixture();try{const row=await f.prepare();f.service.confirm(f.session,row.id,row.version!);const sig=await f.signatures(row);
    f.store.wallet.disconnect("1");await assert.rejects(f.service.submit(f.session,row.id,row.version!,true),{code:"WALLET_REQUIRED"});
    assert.equal(f.store.wallet.trade(row.id,"1")!.state,"CANCELLED");assert.equal(f.submitted(),0);
  }finally{f.store.close();}
});
test("ambiguous timeout is UNKNOWN, never retried, and notification failure never resubmits",async()=>{
  const f=await fixture();try{let calls=0;f.sender.submit=async()=>{calls++;throw new AppError("UNAVAILABLE");};
    const row=await f.prepare();f.service.confirm(f.session,row.id,row.version!);const sig=await f.authorize(row);
    const result=await f.service.submit(f.session,row.id,row.version!,true);assert.equal(result.state,"UNKNOWN");
    await assert.rejects(f.service.submit(f.session,row.id,row.version!,true));
    const monitor=new SettlementMonitor(f.store.wallet,f.chain,60000,async()=>{throw new Error("delivery failed");},f.now);await monitor.cycle();f.advance(300000);await monitor.cycle();
    assert.equal(calls,1);assert.equal(f.store.wallet.trade(row.id,"1")!.state,"UNKNOWN");await assert.rejects(f.store.forget("1"),{code:"WALLET_BUSY"});
  }finally{f.store.close();}
});
test("unambiguous rejection is failed and pending never counts as confirmed",async()=>{
  const f=await fixture();try{f.sender.submit=async()=>{throw new AppError("NO_LIQUIDITY",400);};const row=await f.prepare();f.service.confirm(f.session,row.id,row.version!);const sig=await f.authorize(row);
    assert.equal((await f.service.submit(f.session,row.id,row.version!,true)).state,"FAILED");
  }finally{f.store.close();}
});
test("restart during submission retains state, plaintext signatures are absent and recovery is reads-only",async()=>{
  const dir=mkdtempSync(join(tmpdir(),"sera-phase4-")),path=join(dir,"db.sqlite");let f=await fixture(path);
  const row=await f.prepare();f.service.confirm(f.session,row.id,row.version!);await f.authorize(row);f.store.wallet.attempt(f.store.wallet.trade(row.id,"1")!,"100");f.store.close();
  const store=new SqliteStore(path);try{store.wallet.recover();const restored=store.wallet.trade(row.id,"1")!;assert.equal(restored.state,"UNKNOWN");assert.equal(restored.start_block,"100");
    assert(!restored.payload!.includes("permit_signature"));assert.equal(store.wallet.address("1"),signer.address.toLowerCase());
  }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
test("confirmed settlement is recorded once, notification retried separately, and canonical block rechecked",async()=>{
  const f=await fixture();try{const row=await f.prepare();f.service.confirm(f.session,row.id,row.version!);const sig=await f.authorize(row);await f.service.submit(f.session,row.id,row.version!,true);
    const evidence={txHash:"0x"+"a".repeat(64),blockNumber:"100",blockHash:"0x"+"b".repeat(64),intentHash:f.service.snapshot(row).intentHash,inputRaw:"50000000",outputRaw:"60000000",finalizedAtBlock:"200",rpcAgreement:true,balances:{inputBefore:"100000000",inputAfter:"50000000",outputBefore:"0",outputAfter:"60000000"}};
    let reads=0,notifications=0;f.chain.settle=async()=>{reads++;return {evidence,next:201n};};
    const monitor=new SettlementMonitor(f.store.wallet,f.chain,60000,async()=>{notifications++;if(notifications===1)throw new Error("Telegram unavailable");},f.now);
    await monitor.cycle();assert.equal(f.store.wallet.trade(row.id,"1")!.state,"CONFIRMED");f.advance(3600001);await monitor.cycle();
    assert.equal(reads,1);assert.equal(notifications,2);assert.equal(f.submitted(),1);
    f.chain.canonical=async()=>false;f.advance(3600001);await monitor.cycle();assert.equal(f.store.wallet.trade(row.id,"1")!.state,"UNKNOWN_REORG");assert.equal(f.store.wallet.quarantined(row.wallet),true);
  }finally{f.store.close();}
});
test("pending notification does not suppress later finalized Telegram result and explorer evidence",async()=>{
  const f=await fixture();try{const row=await f.prepare();f.service.confirm(f.session,row.id,row.version!);const sig=await f.authorize(row);await f.service.submit(f.session,row.id,row.version!,true);
    const sent:string[]=[];const monitor=new SettlementMonitor(f.store.wallet,f.chain,60000,async r=>{sent.push(r.state);if(r.state==="CONFIRMED")assert(r.evidence&&r.tx_hash);},f.now);
    await monitor.cycle();assert.deepEqual(sent,["PENDING"]);
    f.chain.settle=async()=>({next:201n,evidence:{txHash:"0x"+"a".repeat(64),blockNumber:"100",blockHash:"0x"+"b".repeat(64),intentHash:f.service.snapshot(row).intentHash,inputRaw:"50000000",outputRaw:"60000000",finalizedAtBlock:"200",rpcAgreement:true,balances:{inputBefore:"100000000",inputAfter:"50000000",outputBefore:"0",outputAfter:"60000000"}}});
    f.advance(300000);await monitor.cycle();assert.deepEqual(sent,["PENDING","CONFIRMED"]);assert.equal(f.submitted(),1);
  }finally{f.store.close();}
});
