import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assertWalletOrigin,assertWalletMetadata,walletMetadata,walletRedirect,okxDappMetadata,walletTrustCopy } from "../web/wallet-trust.js";
import { createWalletConnection } from "../web/connectors.js";
import { OkxConnection } from "../web/okx-connector.js";
import { RoutedConnection,type ReownProvider } from "../web/routing-client.js";
import { WalletFlow } from "../web/wallet-flow.js";
import { WalletFlowError } from "../web/connection.js";
import { safeWalletCode,walletError } from "../src/i18n/wallet.js";
import { connectionError } from "../web/wallet-copy.js";
const origin="https://current-origin.trycloudflare.com",old="https://old-origin.trycloudflare.com";
const mismatch={code:"WALLET_ORIGIN_MISMATCH"};

test("wallet metadata and icon use the exact active HTTPS origin and truthful product name",()=>{
  const meta=walletMetadata(origin,origin,"desktop");assert.equal(meta.name,"FX Alert Bot");assert.equal(meta.url,origin);assert.deepEqual(meta.icons,[origin+"/wallet-icon.png"]);assert.equal(meta.redirect,undefined);
  assertWalletMetadata(meta,origin,"desktop");assert.deepEqual(okxDappMetadata(origin,origin),{name:"FX Alert Bot",icon:origin+"/wallet-icon.png"});
});
test("different subdomains fail, reproducing the Sepolia Etherscan metadata defect",()=>{
  assert.throws(()=>assertWalletOrigin("https://etherscan.io","https://sepolia.etherscan.io"),mismatch);
  assert.throws(()=>assertWalletOrigin(old,origin),mismatch);
  assert.throws(()=>assertWalletOrigin("https://fx.example","https://fx.example.evil.test"),mismatch);
});
test("local, insecure, credentialed, path, query, fragment and opaque origins are rejected",()=>{
  for(const value of ["http://bot.example","https://localhost","https://app.localhost","https://127.0.0.1","https://[::1]","https://bot.local","https://user:pass@bot.example",origin+"/",origin+"/wallet",origin+"?auth=x",origin+"#x","null","file:///wallet","javascript:alert(1)"])
    assert.throws(()=>assertWalletOrigin(value,value),mismatch);
});
test("mainnet and wrong chain fail even when origins agree",()=>{
  for(const chain of [1,137,0,NaN])assert.throws(()=>assertWalletOrigin(origin,origin,chain),{code:"NETWORK_MISMATCH"});
});
test("metadata cannot impersonate third parties or retain a previous tunnel domain",()=>{
  const meta=walletMetadata(origin,origin,"desktop");
  for(const invalid of [{...meta,url:old},{...meta,name:"Etherscan"},{...meta,url:"https://sepolia.etherscan.io"},{...meta,icons:[old+"/wallet-icon.png"]},undefined])
    assert.throws(()=>assertWalletMetadata(invalid,origin,"desktop"),mismatch);
});
test("native Telegram return is validated separately; desktop QR never redirects the phone",()=>{
  assert.equal(walletRedirect("desktop","okx"),"none");assert.equal(walletRedirect("desktop","reown"),undefined);
  for(const env of ["ios","android"] as const){
    assert.equal(walletRedirect(env,"okx"),"tg://resolve");
    const meta=walletMetadata(origin,origin,env);assert.equal(meta.redirect?.native,"tg://resolve?domain=world_fx_alert_bot");assertWalletMetadata(meta,origin,env);
    for(const redirect of [undefined,{native:"tg://resolve?domain=someone_else"},{native:old},{native:meta.redirect!.native,universal:old},{native:meta.redirect!.native,extra:"x"}])
      assert.throws(()=>assertWalletMetadata({...meta,redirect},origin,env),mismatch);
  }
  assert.throws(()=>assertWalletMetadata({...walletMetadata(origin,origin,"desktop"),redirect:{native:"tg://resolve"}},origin,"desktop"),mismatch);
});
test("both production connector factories reject stale configuration before a pairing exists",()=>{
  for(const choice of ["okx","metamask"] as const)assert.throws(()=>createWalletConnection(choice,"desktop",{projectId:"unused",origin:old},()=>origin),mismatch);
});
test("an origin change retires only the affected OKX attempt before any request",()=>{
  let current=origin,closed=0,started=0;const sent:unknown[]=[];
  const c=new OkxConnection("desktop",{start:()=>{started++;},send:m=>sent.push(m),close:()=>{closed++;}},()=>{assertWalletOrigin(origin,current);});
  current=old;assert.throws(()=>c.start(()=>assert.fail(),()=>assert.fail()),mismatch);
  assert.equal(closed,1);assert.equal(started,0);assert.deepEqual(sent,[]);assert.equal(c.session,undefined);
});
test("Reown refuses a stale origin before factory, relay, ownership or signing",async()=>{
  const c=new RoutedConnection("metamask","desktop",()=>{assertWalletOrigin(origin,old);});
  await assert.rejects(c.start(async()=>assert.fail("No SDK initialization"),()=>assert.fail(),()=>assert.fail()),mismatch);assert.equal(c.attempt.active,false);
});
test("Reown rejects previous-domain self metadata even with a matching live pairing",async()=>{
  const topic="a".repeat(64),uri=`wc:${topic}@2?relay-protocol=irn&symKey=${"b".repeat(64)}`;let disconnected=0;
  const c=new RoutedConnection("metamask","desktop",()=>{assertWalletOrigin(origin,origin);},s=>assertWalletMetadata(s?.self.metadata,origin,"desktop"));
  c.attempt.receiveUri(uri);c.provider={session:{topic:"current",pairingTopic:topic,self:{metadata:walletMetadata(old,old,"desktop")},peer:{metadata:{url:"https://metamask.io"}}},disconnect:async()=>{disconnected++;}} as unknown as ReownProvider;
  assert.throws(()=>c.assert(),mismatch);assert.equal(c.attempt.active,false);assert.equal(disconnected,1);
});
test("factory origin failures become a stopped UI flow with no unhandled request",async()=>{
  const screens:string[]=[],calls:string[]=[];
  const flow=new WalletFlow({create:()=>{throw new WalletFlowError("WALLET_ORIGIN_MISMATCH");},view:s=>screens.push(s.step),invalidate:async()=>{calls.push("invalidate");},connected:()=>assert.fail(),verify:async()=>assert.fail(),open:()=>assert.fail(),pending:()=>{},cancelled:()=>{},error:e=>{assert.equal((e as WalletFlowError).code,"WALLET_ORIGIN_MISMATCH");}});
  await flow.choose();await flow.select("okx");assert.equal(flow.screen.step,"error");assert.equal(flow.screen.code,"WALLET_ORIGIN_MISMATCH");assert(!screens.includes("opening"));assert.equal(calls.length,2);
});
for(const language of ["ko","en"] as const)test(language+" trust instructions show selected wallet, Sepolia, purpose, live domain and no swap consent",()=>{
  const copy=walletTrustCopy(language,origin,"okx"),values=copy.rows.map(r=>r[1]);assert.equal(copy.title,"TESTNET");assert(values.includes("OKX Web3 Wallet"));assert(values.includes("Sepolia"));assert(values.includes("FX Alert Bot · current-origin.trycloudflare.com"));assert(copy.note.includes(language==="ko"?"교환을 승인하지":"does not authorize a swap"));
  assert.equal(safeWalletCode("WALLET_ORIGIN_MISMATCH"),"WALLET_ORIGIN_MISMATCH");assert(connectionError(language,"WALLET_ORIGIN_MISMATCH").includes("/wallet"));assert(walletError(language,"WALLET_ORIGIN_MISMATCH").includes("/wallet"));
});
test("pinned OKX SDK derives its identity from the current frame origin; no advertised override",()=>{
  const sdk=readFileSync("node_modules/@okxconnect/universal-provider/src/OKXUniversalProvider.js","utf8");
  const start=sdk.indexOf("    setNamespaces(params) {");assert(start>=0);
  const section=sdk.slice(start,sdk.indexOf("    validateChain(chain)",start));
  assert.match(section,/origin: window.location.origin/);assert.match(section,/url: window.location.hostname/);
  const meta=okxDappMetadata(origin,origin);assert.deepEqual(Object.keys(meta).sort(),["icon","name"]);
});
