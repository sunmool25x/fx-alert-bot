import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { OkxConnection,type OkxBridge } from "../web/okx-connector.js";
import { createWalletConnection } from "../web/connectors.js";
import { okxConnectParams,okxSnapshot,assertOkxLink,assertOkxRequest,matchesOkxTopic,OkxMemoryStorage,OKX_CHAIN,OKX_MIN_VERSION } from "../web/okx-protocol.js";
import { openWallet } from "../web/routing.js";
import { connectAndVerify } from "../web/connection.js";
import { liveEnvironment } from "../scripts/live/environment.js";
const topic="local-fixture-topic",uri="https://web3.okx.com/ul/connect?topic="+topic+"abcdef",address="0x"+"1".repeat(40);
const snapshot={topic,accounts:[address],chainId:11155111};
const session=()=>({topic,namespaces:{eip155:{chains:[OKX_CHAIN],defaultChain:"11155111",accounts:[OKX_CHAIN+":"+address],methods:["personal_sign","eth_signTypedData_v4"]}}});
function fixture(){
  let receive!:(message:any)=>void,closed=0;const sent:any[]=[];
  const bridge:OkxBridge={start:r=>{receive=r;},send:m=>sent.push(m),close:()=>{closed++;}};
  const connector=new OkxConnection("ios",bridge);
  return {connector,sent,closed:()=>closed,receive:(m:any)=>receive(m),connect:async()=>{
    const result=connector.start(()=>{},()=>{});receive({type:"uri",uri,topic});receive({type:"connected",snapshot,requestUri:"https://web3.okx.com/ul/connect"});await result;
  }};
}
test("wallet selection dispatches OKX to its official connector while MetaMask stays on Reown",()=>{
  const currentOrigin=()=>"https://bot.example";
  const okx=createWalletConnection("okx","ios",{projectId:"unused",origin:currentOrigin()},currentOrigin);assert(okx instanceof OkxConnection);
  const mm=createWalletConnection("metamask","ios",{projectId:"unused",origin:currentOrigin()},currentOrigin);assert(!(mm instanceof OkxConnection));assert.equal(mm.choice,"metamask");okx.cancel();mm.cancel();
});
test("SDK Web3 link is passed unchanged to the mobile opener",()=>{
  for(const platform of ["ios","android"] as const){const opened:string[]=[];openWallet("okx",platform,uri,{https:u=>opened.push(u),native:()=>assert.fail()});assert.deepEqual(opened,[uri]);}
});
test("download, exchange, generic app, WC wrappers and forged OKX links are rejected",()=>{
  for(const url of ["https://www.okx.com/download?deeplink=okx://web3/wallet/connect","https://www.okx.com/","okx://main/","https://web3.okx.com/ul/connect?uri=wc:private","https://web3.okx.com.evil.test/ul/connect?topic=abcdefgh","https://user:password@web3.okx.com/ul/connect?topic=abcdefgh","https://web3.okx.com/ul/connect?topic=abc&topic=def","https://web3.okx.com/ul/connect?topic=abcdefgh#auth","https://web3.okx.com/ul/connect?topic="])
    assert.throws(()=>assertOkxLink(url),{code:"WALLET_CONNECT_CANCELLED"});
});
test("SDK request targets only EVM Sepolia and uses EVM-supported Telegram return parameters",()=>{
  for(const platform of ["ios","android","desktop"] as const){const p=okxConnectParams(platform);assert.deepEqual(p.namespaces,{eip155:{chains:["eip155:11155111"],defaultChain:"11155111"}});
    assert.equal(p.sessionConfig.redirect,platform==="desktop"?"none":"tg://resolve");assert.equal(p.sessionConfig.connectWalletType,130);assert.equal(p.sessionConfig.openUniversalUrl,false);
    assert.doesNotMatch(JSON.stringify(p),/signRequest|ton:|csrf|initData|privateKey|botToken/);
  }
});
test("short link topic is bound to the SDK connection topic and six-character SDK suffix",()=>{
  assert(matchesOkxTopic(uri,topic));assert(!matchesOkxTopic(uri,"stale-topic"));assert(!matchesOkxTopic(uri,topic.slice(0,-1)));assert(!matchesOkxTopic(uri+"a",topic));
});
test("OKX success normalizes a Sepolia account without treating it as ownership proof",()=>{
  assert.deepEqual(okxSnapshot(session(),topic),snapshot);
  assert.throws(()=>okxSnapshot(session(),"stale-topic"),{code:"WALLET_REQUIRED"});
  const s=session();s.namespaces.eip155.methods=[];assert.throws(()=>okxSnapshot(s,topic),{code:"WALLET_REQUIRED"});
});
test("mainnet chains, default chains and cross-chain accounts fail normalization",()=>{
  for(const modify of [(s:ReturnType<typeof session>)=>{s.namespaces.eip155.chains=["eip155:1"];},(s:ReturnType<typeof session>)=>{s.namespaces.eip155.defaultChain="1";},(s:ReturnType<typeof session>)=>{s.namespaces.eip155.accounts=["eip155:1:"+address];}]){
    const s=session();modify(s);assert.throws(()=>okxSnapshot(s,topic),{code:"NETWORK_MISMATCH"});
  }
});
test("a fresh frame-local store cannot restore old OKX, MetaMask or Telegram data",()=>{
  const old=new OkxMemoryStorage(),fresh=new OkxMemoryStorage();old.setItem("OKX-session","old");old.setItem("Telegram-session","private");
  assert.equal(fresh.length,0);assert.equal(fresh.getItem("OKX-session"),null);fresh.setItem("temporary","pairing");fresh.removeItem("temporary");assert.equal(fresh.length,0);assert.equal(old.length,2);
});
test("one SDK URI feeds the sole QR renderer; desktop does not launch an app",async()=>{
  const f=fixture(),uris:string[]=[];const pending=f.connector.start(u=>uris.push(u),()=>assert.fail());f.receive({type:"uri",uri,topic});
  assert.deepEqual(uris,[uri]);openWallet("okx","desktop",uri,{https:()=>assert.fail(),native:()=>assert.fail()});
  f.receive({type:"connected",snapshot,requestUri:"https://web3.okx.com/ul/connect"});await pending;f.connector.cancel();
  const picker=readFileSync("web/wallet-picker.ts","utf8");assert.equal((picker.match(/createElement\("wui-qr-code"\)/g)??[]).length,1);assert.match(picker,/if\(environment==="desktop"\)/);
});
test("mobile displays an app handoff instead of the desktop-only QR branch",()=>{
  const picker=readFileSync("web/wallet-picker.ts","utf8");assert.match(picker,/if\(environment==="desktop"\)[\s\S]*?qr\.uri=uri[\s\S]*?else\{[\s\S]*?button\(m\.open\(name\),\(\)=>flow\.handoff\(\)/);
  assert(!readFileSync("web/okx-bridge.ts","utf8").includes("openModal"));
});
test("cancel pending OKX closes its frame and rejects late connection messages",async()=>{
  const f=fixture(),pending=f.connector.start(()=>{},()=>assert.fail()),rejected=assert.rejects(pending,{code:"WALLET_CONNECT_CANCELLED"});
  f.receive({type:"uri",uri,topic});f.connector.cancel();f.receive({type:"connected",snapshot,requestUri:"https://web3.okx.com/ul/connect"});await rejected;
  assert.equal(f.closed(),1);assert.equal(f.connector.session,undefined);assert.deepEqual(f.sent,[]);
});
test("failed OKX handoff allows a new isolated attempt",async()=>{
  const old=fixture(),pending=old.connector.start(()=>{},()=>assert.fail()),rejected=assert.rejects(pending);
  old.receive({type:"error",code:"WALLET_CONNECT_CANCELLED"});await rejected;
  const next=fixture();await next.connect();next.connector.assert();assert.equal(next.closed(),0);next.connector.cancel();
});
test("wrong and duplicate pairing/session messages cannot replace the connected OKX wallet",async()=>{
  const f=fixture(),pending=f.connector.start(()=>{},()=>{}),rejected=assert.rejects(pending);f.receive({type:"uri",uri,topic});
  f.receive({type:"connected",snapshot:{...snapshot,topic:"wrong"},requestUri:"https://web3.okx.com/ul/connect"});await rejected;assert.equal(f.connector.session,undefined);
  const next=fixture();await next.connect();next.receive({type:"connected",snapshot,requestUri:"https://web3.okx.com/ul/connect"});assert.throws(()=>next.connector.assert());
});
test("OKX ownership still requests the exact backend challenge and never invokes auth or trading endpoints",async()=>{
  const f=fixture();await f.connect();assert.equal(f.sent.length,0);const calls:string[]=[],challenge="FX Alert Bot ownership only";
  const result=connectAndVerify(f.connector,async path=>{calls.push(path);return path==="challenge"?{id:"proof",message:challenge}:{wallet:address};},()=>0,()=>{},()=>f.connector.assert());
  await new Promise(r=>setImmediate(r));assert.equal(f.sent.length,1);const request=f.sent.at(0)!;assert.equal(request.args.method,"personal_sign");
  assert.equal(Buffer.from(request.args.params[0].slice(2),"hex").toString(),challenge);assert.equal(request.args.params[1],address);
  f.receive({type:"response",id:request.id,result:"mock-proof"});assert.equal(await result,address);assert.deepEqual(calls,["challenge","verify"]);f.connector.cancel();
});
test("cancel during OKX ownership rejects the request and prevents backend verification",async()=>{
  const f=fixture();await f.connect();const calls:string[]=[];
  const result=connectAndVerify(f.connector,async path=>{calls.push(path);return {id:"proof",message:"ownership"};},()=>0,()=>{},()=>f.connector.assert());
  const rejected=assert.rejects(result);await new Promise(r=>setImmediate(r));f.connector.cancel();f.receive({type:"response",id:1,result:"late"});await rejected;assert.deepEqual(calls,["challenge"]);
});
test("OKX account update emits the existing account-change invalidation event",async()=>{
  const f=fixture();await f.connect();let changes=0;f.connector.on("accountsChanged",()=>changes++);
  f.receive({type:"update",snapshot:{...snapshot,accounts:["0x"+"2".repeat(40)]}});assert.equal(changes,1);assert.notEqual(f.connector.accounts[0],address);f.connector.cancel();
});
test("request adapter refuses transaction submission and mainnet switching",()=>{
  for(const method of ["eth_sendTransaction","eth_sendRawTransaction","wallet_sendCalls","eth_sign"])assert.throws(()=>assertOkxRequest({method,params:[]}));
  assert.throws(()=>assertOkxRequest({method:"wallet_switchEthereumChain",params:[{chainId:"0x1"}]}),{code:"NETWORK_MISMATCH"});
  assertOkxRequest({method:"personal_sign",params:["0x00",address]});assertOkxRequest({method:"wallet_switchEthereumChain",params:[{chainId:"0xaa36a7"}]});
});
test("OKX integration preserves execution and mainnet OFF in the single live launcher",()=>{
  const env=liveEnvironment({ENABLE_MAINNET:"true",ENABLE_TESTNET_EXECUTION:"true",SERA_NETWORK:"mainnet"},"https://okx-check.trycloudflare.com");
  assert.equal(env.ENABLE_TESTNET_EXECUTION,"false");assert.equal(env.ENABLE_MAINNET,"false");assert.equal(env.SERA_NETWORK,"sepolia");
});
test("only the official universal provider is added; published SDK exposes the EVM return and Web3 route used",()=>{
  const pkg=JSON.parse(readFileSync("package.json","utf8"));assert.equal(pkg.dependencies["@okxconnect/universal-provider"],"1.9.1");assert.equal(pkg.dependencies["@okxconnect/ui"],undefined);
  const constants=readFileSync("node_modules/@okxconnect/core/src/protocol/constants.js","utf8"),types=readFileSync("node_modules/@okxconnect/core/src/protocol/connect/session.d.ts","utf8");
  assert.match(constants,/okxCommonUniversalLink = `https:\/\/web3\.okx\.com\/ul\/connect`/);assert.match(types,/openUniversalUrl\?: boolean/);assert.match(types,/redirect\?: string/);assert.equal(OKX_MIN_VERSION,"6.88.0");
});
test("SDK lifetime bridge receives no Telegram credentials and disables raw SDK logging and reporter",()=>{
  const frame=readFileSync("web/okx-bridge.ts","utf8"),transport=readFileSync("web/okx-connector.ts","utf8"),build=readFileSync("scripts/build-web.mjs","utf8");
  assert.doesNotMatch(frame,/initData|csrf|botToken|sessionToken/);assert.match(frame,/Object\.defineProperty\(window,"localStorage"/);assert.match(frame,/reporter\.sendRecordContent=async/);
  assert.match(transport,/new MessageChannel\(\)/);assert.match(frame,/event\.source!==parent\|\|event\.origin!==location\.origin/);assert.match(build,/drop:\['console'\]/);
});
