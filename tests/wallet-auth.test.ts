import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { validateTelegram,WalletAuth } from "../src/wallet/auth.js";
import { fixture,signer,other,tradeConfig } from "./trade-helpers.js";
import { NOW } from "./helpers.js";
export const botToken="fixture-bot-token";
export function initData(user=1,time=NOW,extra:Record<string,string>={}) {
  const p=new URLSearchParams({auth_date:String(Math.floor(time/1000)),query_id:"test",user:JSON.stringify({id:user,first_name:"Not persisted"}),...extra});
  const check=[...p].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+"="+v).join("\n");
  const key=createHmac("sha256","WebAppData").update(botToken).digest();p.set("hash",createHmac("sha256",key).update(check).digest("hex"));return p.toString();
}
test("Telegram HMAC accepts signed ID; rejects forgery, stale/future data, duplicate keys and groups",()=>{
  assert.equal(validateTelegram(initData(),botToken,NOW).user,"1");
  for(const data of [initData().replace('%22id%22%3A1','%22id%22%3A2'),initData(1,NOW-301000),initData(1,NOW+60000),initData()+"&user={}",initData(1,NOW,{chat_type:"supergroup"})])assert.throws(()=>validateTelegram(data,botToken,NOW));
  assert.throws(()=>validateTelegram(initData(),"wrong-token",NOW));
});
test("auth data replay protection and session/CSRF expiry are persisted",async()=>{
  const f=await fixture();try{
    const a=new WalletAuth(f.store.wallet,tradeConfig.wallet,async()=>{},f.now);
    const fresh=f.store.wallet.newSession("1","same-hash",300000),s=f.store.wallet.session(fresh.token)!;
    assert.throws(()=>f.store.wallet.newSession("1","same-hash",300000),{code:"AUTH_REPLAY"});
    a.csrf(s,fresh.csrf);assert.throws(()=>a.csrf(s,"forged"),{code:"AUTH_INVALID"});f.advance(300001);assert.equal(f.store.wallet.session(fresh.token),undefined);
  }finally{f.store.close();}
});
test("SIWE binds domain, purpose, chain, session and single-use nonce; wrong signatures cannot link",async()=>{
  const f=await fixture();try{
    const auth=new WalletAuth(f.store.wallet,tradeConfig.wallet,async()=>{},f.now);
    const c=await auth.challenge(f.session,signer.address,11155111);
    assert.match(c.message,/bot.example/);assert.match(c.message,/does not authorize a trade/);assert.match(c.message,new RegExp(f.session.id));
    await assert.rejects(auth.verify(f.session,c.id,await other.signMessage({message:c.message})),{code:"AUTH_INVALID"});
    await assert.rejects(auth.verify(f.session,c.id,await signer.signMessage({message:c.message})),{code:"AUTH_REPLAY"});
    const good=await auth.challenge(f.session,signer.address,11155111);await auth.verify(f.session,good.id,await signer.signMessage({message:good.message}));
    assert.equal(f.store.wallet.address("1"),signer.address.toLowerCase());
    const refreshed=f.store.wallet.session(f.token)!;const stale=await auth.challenge(refreshed,signer.address,11155111);f.advance(120001);await assert.rejects(auth.verify(refreshed,stale.id,await signer.signMessage({message:stale.message})),{code:"AUTH_REPLAY"});
  }finally{f.store.close();}
});
test("wrong chain invalidates ownership and smart-wallet verification is blocked",async()=>{
  const f=await fixture();try{
    const auth=new WalletAuth(f.store.wallet,tradeConfig.wallet,async()=>{},f.now);
    await assert.rejects(auth.challenge(f.session,signer.address,1),{code:"NETWORK_MISMATCH"});assert.equal(f.store.wallet.address("1"),undefined);
    const blocked=new WalletAuth(f.store.wallet,tradeConfig.wallet,async()=>{throw new Error("EOA only");},f.now);
    await assert.rejects(blocked.challenge(f.session,signer.address,11155111));
  }finally{f.store.close();}
});
test("disconnect during asynchronous ownership verification cannot relink the wallet",async()=>{
  const f=await fixture();try{let release:()=>void=()=>{},calls=0;const barrier=new Promise<void>(resolve=>{release=resolve;});
    const auth=new WalletAuth(f.store.wallet,tradeConfig.wallet,async()=>{if(++calls===2)await barrier;},f.now);
    const challenge=await auth.challenge(f.session,signer.address,11155111),signature=await signer.signMessage({message:challenge.message});
    const verification=auth.verify(f.session,challenge.id,signature);await new Promise(resolve=>setImmediate(resolve));f.store.wallet.disconnect("1");release();
    await assert.rejects(verification,{code:"AUTH_REPLAY"});assert.equal(f.store.wallet.address("1"),undefined);
  }finally{f.store.close();}
});
