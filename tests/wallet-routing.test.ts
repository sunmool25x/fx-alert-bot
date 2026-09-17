import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { RoutingAttempt,ConnectionStorage,walletRoutes,walletLink,openWallet,telegramEnvironment,returnMetadata,clearLegacyWalletRouting } from "../web/routing.js";
import { RoutedConnection,type ReownProvider } from "../web/routing-client.js";
import { routingText } from "../web/routing-copy.js";
import { connectAndVerify,type WalletProvider } from "../web/connection.js";
import { liveEnvironment } from "../scripts/live/environment.js";
const topic="a".repeat(64),uri=`wc:${topic}@2?relay-protocol=irn&symKey=${"b".repeat(64)}`;
const session=(url="https://www.okx.com")=>({topic:"new-session",pairingTopic:topic,peer:{metadata:{url,name:"OKX Wallet"}}});
const address="0x"+"1".repeat(40);
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>resolve=r);return {resolve,promise};}
function fakeProvider() {
  const events=new EventEmitter(),calls:string[]=[];const approval=deferred<void>();
  const p={accounts:[address],chainId:11155111,session:undefined as ReturnType<typeof session>|undefined,
    connect:async()=>{calls.push("connect");events.emit("display_uri",uri);await approval.promise;p.session=session();events.emit("connect");},
    disconnect:async()=>{calls.push("disconnect");p.session=undefined;},
    request:async({method}:{method:string})=>{calls.push(method);return "mock-ownership-signature";},
    on:(name:string,fn:(...args:any[])=>void)=>{events.on(name,fn);},removeListener:(name:string,fn:(...args:any[])=>void)=>{events.removeListener(name,fn);},
    signer:{cleanupPendingPairings:async(o:{deletePairings:boolean})=>{assert(o.deletePairings);calls.push("expire-pairings");},client:{core:{relayer:{transportClose:async()=>{calls.push("close-transport");}}}}},
  };
  return {p,provider:p as unknown as ReownProvider,calls,approval,events};
}
test("explicit OKX uses the inspected OKX universal route, never MetaMask",()=>{
  const generated="https://web3.okx.com/ul/connect?topic="+topic+"abcdef";
  const calls:string[]=[];openWallet("okx","ios",generated,{https:u=>calls.push(u),native:()=>assert.fail("OKX should prefer its universal link")});
  assert.equal(calls.length,1);assert.equal(calls[0],generated);
  assert.doesNotMatch(calls[0]!,/download|metamask/i);
  assert.equal(walletRoutes.okx.id.length,64);
});
test("explicit MetaMask retains its own native link with no OKX fallback",()=>{
  const calls:string[]=[];openWallet("metamask","ios",uri,{https:()=>assert.fail(),native:u=>calls.push(u)});
  assert.equal(calls[0],"metamask://wc?uri="+encodeURIComponent(uri));assert.doesNotMatch(calls[0]!,/okx|okex/);
});
test("Telegram platform controls mobile routing; desktop/unknown never launch a wallet",()=>{
  for(const mobile of ["ios","android","android_x"])assert.notEqual(telegramEnvironment(mobile),"desktop");
  for(const desktop of ["tdesktop","macos","web","weba","webk","unknown",undefined]){
    const env=telegramEnvironment(desktop);assert.equal(env,"desktop");openWallet("okx",env,uri,{https:()=>assert.fail(),native:()=>assert.fail()});
  }
});
test("Telegram Android retains Reown encoding for MetaMask and preserves the OKX SDK URL untouched",()=>{
  const encoded=walletLink("metamask","android",uri).split("wc?uri=")[1]!;
  assert.equal(decodeURIComponent(decodeURIComponent(encoded)),uri);
  const generated="https://web3.okx.com/ul/connect?topic="+topic+"abcdef";assert.equal(walletLink("okx","android",generated),generated);
});
test("return metadata contains only the public Telegram bot link and is omitted from desktop QR",()=>{
  assert.deepEqual(returnMetadata("desktop"),{});
  assert.deepEqual(returnMetadata("ios"),{redirect:{native:"tg://resolve?domain=world_fx_alert_bot"}});
  assert.doesNotMatch(JSON.stringify(returnMetadata("android")),/token|csrf|initData|session|startapp/);
});
test("old MetaMask app-link preference is removed without clearing authenticated application storage",()=>{
  const items=new Map([["WALLETCONNECT_DEEPLINK_CHOICE",JSON.stringify({href:"metamask://",name:"MetaMask"})],["@appkit/recent_wallet","MetaMask"],["application-value","preserved"]]);
  clearLegacyWalletRouting({removeItem:k=>{items.delete(k);}});
  assert.equal(items.size,1);assert.equal(items.get("application-value"),"preserved");
});
test("attempt storage never restores another attempt's session or deeplink",async()=>{
  const previous=new ConnectionStorage(),next=new ConnectionStorage();await previous.setItem("session",session("https://metamask.io"));
  assert.equal(await next.getItem("session"),undefined);assert.deepEqual(await next.getKeys(),[]);
  await next.setItem("session",session());await next.removeItem("session");assert.deepEqual(await next.getEntries(),[]);
});
test("wrong wallet, old pairing, replaced session and spoofed wallet host fail before ownership",()=>{
  const a=new RoutingAttempt("okx","desktop");a.receiveUri(uri);
  for(const s of [session("https://metamask.io"),session("https://okx.com.evil.test"),session("http://www.okx.com"),{...session(),pairingTopic:"old"}])assert.throws(()=>a.assertSession(s),{code:"WALLET_REQUIRED"});
  a.assertSession(session());assert.throws(()=>a.assertSession({...session(),topic:"replaced"}),{code:"WALLET_REQUIRED"});
});
test("invalid URI cannot become a link and cancelled URI cannot be restored",()=>{
  for(const bad of ["metamask://",uri.replace("@2","@1"),uri.replace("symKey=","other=")])assert.throws(()=>walletLink("okx","ios",bad));
  const a=new RoutingAttempt("okx","ios");a.receiveUri(uri);a.cancel();assert.throws(()=>a.receiveUri(uri));assert.throws(()=>a.assertSession(session()));
});
test("a restored MetaMask session is disconnected before starting explicit OKX pairing",async()=>{
  const f=fakeProvider();f.p.session=session("https://metamask.io");const c=new RoutedConnection("okx","desktop");
  const ready=deferred<void>();const result=c.start(async()=>f.provider,()=>ready.resolve(),()=>assert.fail());
  await ready.promise;assert.deepEqual(f.calls.slice(0,2),["disconnect","connect"]);assert.equal(f.p.session,undefined);
  f.approval.resolve();await result;c.assert();c.cancel();
});
test("cancelled pending approval cannot bind, while a different wallet attempt succeeds",async()=>{
  const old=fakeProvider(),c1=new RoutedConnection("metamask","ios"),ready=deferred<void>();
  const pending=c1.start(async()=>old.provider,()=>ready.resolve(),()=>assert.fail());const rejection=assert.rejects(pending,{code:"WALLET_CONNECT_CANCELLED"});
  await ready.promise;c1.cancel();
  const fresh=fakeProvider(),c2=new RoutedConnection("okx","ios"),ready2=deferred<void>();
  const current=c2.start(async()=>fresh.provider,()=>ready2.resolve(),()=>assert.fail());await ready2.promise;fresh.approval.resolve();await current;
  old.approval.resolve();await rejection;c2.assert();assert(!old.calls.includes("personal_sign"));assert(!old.calls.includes("verify"));c2.cancel();
});
test("cancel while provider initialization awaits never starts pairing",async()=>{
  const f=fakeProvider(),factory=deferred<ReownProvider>(),c=new RoutedConnection("okx","ios");
  const result=c.start(()=>factory.promise,()=>assert.fail(),()=>assert.fail());c.cancel();factory.resolve(f.provider);
  await assert.rejects(result,{code:"WALLET_CONNECT_CANCELLED"});assert(!f.calls.includes("connect"));assert(f.calls.includes("close-transport"));
});
test("ownership still uses the original authenticated API after wallet return and requests no financial action",async()=>{
  const a=new RoutingAttempt("okx","ios");a.receiveUri(uri);a.assertSession(session());
  const calls:string[]=[],p:WalletProvider={accounts:[address],chainId:11155111,session:session(),connect:async()=>assert.fail("Do not reconnect on return"),request:async({method})=>{calls.push(method);return "proof";}};
  const api=async(path:string)=>{calls.push(path);return path==="challenge"?{id:"challenge",message:"Original session's ownership challenge"}:{wallet:address};};
  assert.equal(await connectAndVerify(p,api,()=>1,()=>{},()=>a.assertSession(p.session as ReturnType<typeof session>)),address);
  assert.deepEqual(calls,["challenge","personal_sign","verify"]);assert(!calls.includes("auth"));
});
test("cancelling while challenge loads cannot prompt a stale wallet or bind it",async()=>{
  const a=new RoutingAttempt("okx","ios");a.receiveUri(uri);const calls:string[]=[];
  const p:WalletProvider={session:session(),accounts:[address],chainId:11155111,connect:async()=>{},request:async()=>{calls.push("sign");}};
  await assert.rejects(connectAndVerify(p,async path=>{calls.push(path);a.cancel();return {message:"ownership"};},()=>1,()=>{},()=>a.assertSession(p.session as ReturnType<typeof session>)));
  assert.deepEqual(calls,["challenge"]);
});
test("wrong pairing cannot start an ownership API call",async()=>{
  const a=new RoutingAttempt("okx","desktop");a.receiveUri(uri);
  const p:WalletProvider={session:{...session(),pairingTopic:"stale"},accounts:[address],chainId:11155111,connect:async()=>assert.fail(),request:async()=>assert.fail()};
  await assert.rejects(connectAndVerify(p,async()=>assert.fail(),()=>1,()=>{},()=>a.assertSession(p.session as ReturnType<typeof session>)),{code:"WALLET_REQUIRED"});
});
test("live routing keeps Sepolia/execution OFF even with conflicting owner environment",()=>{
  const env=liveEnvironment({ENABLE_TESTNET_EXECUTION:"true",ENABLE_MAINNET:"true",SERA_NETWORK:"mainnet"},"https://routing-test.trycloudflare.com");
  assert.equal(env.ENABLE_TESTNET_EXECUTION,"false");assert.equal(env.ENABLE_MAINNET,"false");assert.equal(env.SERA_NETWORK,"sepolia");
});
test("Korean and English selected-wallet instructions never send OKX users to MetaMask",()=>{
  for(const m of Object.values(routingText)){assert(m.mobile("OKX Wallet").includes("OKX Wallet"));assert(m.desktop("OKX Wallet").includes("OKX Wallet"));assert.doesNotMatch(m.mobile("OKX Wallet")+m.open("OKX Wallet"),/MetaMask/);assert(m.change);assert(m.verify);}
});
test("routing UI sends no automatic sign request on connection or visibility return",()=>{
  const picker=readFileSync("web/wallet-picker.ts","utf8"),app=readFileSync("web/app.ts","utf8");
  assert.match(picker,/button\(m\.verify/);assert.match(picker,/qr\.uri=uri/);assert.match(picker,/environment===\"desktop\"/);
  assert.doesNotMatch(picker,/eth_sendTransaction|eth_signTypedData|api\(\"auth|location\.(href|assign|replace)/);
  const visibility=app.slice(app.indexOf('document.addEventListener("visibilitychange"'),app.indexOf("setInterval"));assert.doesNotMatch(visibility,/connectAndVerify|api\("auth|request\(/);
});
