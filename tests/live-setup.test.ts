import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync,readFileSync,writeFileSync,rmSync,existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join,resolve } from "node:path";
import { loadConfig } from "../src/config/index.js";
import { preflight,formatPreflight,setupAction } from "../src/wallet/preflight.js";
import { parseTunnelOrigin,tunnelEnvironment,tunnelArgs } from "../scripts/live/tunnel.js";
import { liveEnvironment,readEnvironment,writeState,readState,clearState,preflightEnvironment } from "../scripts/live/environment.js";
import { ownedChild,finished,stopChild,safeChildLine,lines } from "../scripts/live/processes.js";
import { syncDevelopmentMenu } from "../scripts/live/telegram.js";
import { liveSummary } from "../scripts/live/report.js";
const origin="https://one-small-test.trycloudflare.com";
function directory(){const root=mkdtempSync(join(tmpdir(),"sera-live-"));return {root,close:()=>{assert(root.startsWith(resolve(tmpdir())+"\\")||root.startsWith(resolve(tmpdir())+"/"));rmSync(root,{recursive:true,force:true});}};}

test("Cloudflare origin extraction accepts its banner and rejects spoofed origins, ports and paths",()=>{
  assert.equal(parseTunnelOrigin("INF | "+origin+" |"),origin);
  for(const invalid of ["http://one.trycloudflare.com","https://trycloudflare.com","https://one.trycloudflare.com.evil.test","https://user@one.trycloudflare.com","https://one.trycloudflare.com:443","https://one.trycloudflare.com/api","https://one.trycloudflare.com?secret=token","https://one.two.trycloudflare.com"])
    assert.equal(parseTunnelOrigin("INF "+invalid),undefined);
});
test("runtime origin and safety overrides never mutate .env, input environment or unrelated settings",()=>{
  const d=directory();try{
    const file=join(d.root,".env"),original="TELEGRAM_BOT_TOKEN=private-token\nSIGNING_ORIGIN=https://expired.trycloudflare.com\nCUSTOM_SETTING=keep\nENABLE_TESTNET_EXECUTION=true\nENABLE_MAINNET=true\nSERA_NETWORK=mainnet\n";writeFileSync(file,original);
    const base=readEnvironment(d.root,{}),copy={...base},env=liveEnvironment(base,origin);
    assert.equal(env.SIGNING_ORIGIN,origin);assert.equal(env.TELEGRAM_BOT_TOKEN,"private-token");assert.equal(env.CUSTOM_SETTING,"keep");assert.deepEqual(base,copy);
    assert.equal(env.ENABLE_TESTNET_EXECUTION,"false");assert.equal(env.ENABLE_MAINNET,"false");assert.equal(env.SERA_NETWORK,"sepolia");assert.equal(readFileSync(file,"utf8"),original);
    assert.throws(()=>liveEnvironment(base,"https://not-cloudflare.example"));
  }finally{d.close();}
});
test("runtime state contains no secret and preflight uses only a live launcher's temporary origin",()=>{
  const d=directory();try{
    writeFileSync(join(d.root,".env"),"TELEGRAM_BOT_TOKEN=secret\nSIGNING_ORIGIN=https://old.trycloudflare.com\n");
    const state={pid:process.pid,origin,port:8787,runId:"a".repeat(32),startedAt:new Date().toISOString()};writeState(d.root,state);
    assert.deepEqual(readState(d.root),state);assert.equal(preflightEnvironment(d.root,{}).SIGNING_ORIGIN,origin);
    assert(!readFileSync(join(d.root,".dev-live/session.json"),"utf8").includes("secret"));assert.equal(readState(d.root,()=>false),undefined);
    clearState(d.root,"b".repeat(32));assert(existsSync(join(d.root,".dev-live/session.json")));clearState(d.root,state.runId);
    assert.equal(preflightEnvironment(d.root,{}).SIGNING_ORIGIN,"https://old.trycloudflare.com");
  }finally{d.close();}
});
test("missing or malformed Reown gives a human action while read-only server configuration remains available",async()=>{
  const env={SIGNING_ORIGIN:origin,SEPOLIA_RPC_URL:"https://rpc.example"};
  const c=loadConfig(env);assert.equal(c.wallet.uiReady,true);assert.equal(c.wallet.ready,false);assert.equal(c.wallet.enabled,false);
  const mock=loadConfig({...env,WALLETCONNECT_PROJECT_ID:"a".repeat(32)});assert.equal(mock.wallet.ready,true);assert.equal(mock.wallet.uiReady,true);assert.equal(mock.wallet.enabled,false);
  const r=await preflight({...env,WALLETCONNECT_PROJECT_ID:"do-not-print-this-invalid-id"},{offline:true});
  assert.equal(r.checks.find(c=>c.code==="REOWN_PROJECT")?.status,"FAIL");const output=formatPreflight(r.checks);
  assert.match(output,/HUMAN ACTION REQUIRED/);assert.match(output,/dashboard\.reown\.com/);assert.match(output,/WALLETCONNECT_PROJECT_ID/);assert(!output.includes("do-not-print-this-invalid-id"));
  assert.match(setupAction("HTTPS_ORIGIN"),/AUTO-FIXABLE.*dev:live/);
});
test("owner summary distinguishes missing Reown from passed checks and never says relay verified",()=>{
  const summary=liveSummary([{code:"REOWN_PROJECT",status:"FAIL",message:"missing"},{code:"DATABASE",status:"PASS",message:"ready"}]);
  assert.match(summary,/✗ Reown Project ID \(format only\)/);assert.match(summary,/✓ Database/);assert.match(summary,/HUMAN ACTION REQUIRED/);assert(!summary.includes("READY FOR TELEGRAM WALLET TEST"));
});
test("Cloudflare receives only minimal network/system environment and uses isolated non-debug config",()=>{
  const d=directory();try{
    const env=tunnelEnvironment({PATH:"tools",SYSTEMROOT:"system",TELEGRAM_BOT_TOKEN:"secret",WALLETCONNECT_PROJECT_ID:"secret",TUNNEL_TOKEN:"secret",TUNNEL_LOGLEVEL:"debug"});
    assert.deepEqual(env,{PATH:"tools",SYSTEMROOT:"system"});
    const args=tunnelArgs(d.root,9876);assert(args.includes("http://127.0.0.1:9876"));assert(args.includes("info"));assert(!args.includes("debug"));assert(!args.includes("--no-tls-verify"));assert(!args.includes("--http-host-header"));
  }finally{d.close();}
});
test("launcher child output only forwards allowlisted diagnostics, never raw provider errors or secrets",()=>{
  const secret="token-signature-session-secret";
  for(const line of [secret,JSON.stringify({event:secret,code:secret}),"Error: "+secret])assert.equal(safeChildLine(line),undefined);
  const output=safeChildLine(JSON.stringify({event:"wallet_acceptance",operation:secret,code:secret,user_ref:secret,wallet_ref:secret,token:secret}));
  assert(output);assert(!output.includes(secret));assert.match(output,/UNAVAILABLE/);
});
test("fragmented child output can be parsed without forwarding raw logs",async()=>{
  const child=ownedChild(process.execPath,["-e",`process.stderr.write('INF | https://one-');setTimeout(()=>process.stderr.end('small-test.trycloudflare.com |\\n'),10)`],process.cwd(),{});
  let found:string|undefined;lines(child,line=>{found=parseTunnelOrigin(line);});assert.equal(await finished(child),0);
  // exit can precede stream close, so wait for the drained pipe.
  if(!child.stderr?.destroyed)await new Promise<void>(resolve=>child.once("close",()=>resolve()));assert.equal(found,origin);
});
test("owned Windows/Node child drains and releases its port through private IPC, including repeated stop",async()=>{
  const child=ownedChild(process.execPath,[resolve("tests/fixtures/live-child.mjs")],process.cwd(),{},true);let drained=false;
  const ready=new Promise<number>((resolve,reject)=>{child.once("error",reject);child.on("message",m=>{if(m&&typeof m==="object"&&"type" in m){if(m.type==="drained")drained=true;if(m.type==="ready"&&"port" in m)resolve(Number(m.port));}});});
  try{const port=await ready;assert((await fetch(`http://127.0.0.1:${port}`)).ok);await stopChild(child);assert(drained);assert.equal(await finished(child),0);await stopChild(child);
    await assert.rejects(fetch(`http://127.0.0.1:${port}`,{signal:AbortSignal.timeout(1000)}));
  }finally{await stopChild(child);}
});
test("a failed child spawn is cleaned up without hanging or exposing the OS error",async()=>{
  const child=ownedChild(resolve("nonexistent-live-test-program.exe"),[],process.cwd(),{});assert.notEqual(await finished(child),0);await stopChild(child);await stopChild(child);
});
test("optional Telegram menu follows an old Quick Tunnel but unrelated menus are preserved",async()=>{
  const requests:{url:string;body?:unknown}[]=[];
  let menu:unknown={type:"web_app",text:"Test wallet",web_app:{url:"https://old-test.trycloudflare.com/"}};
  const fetcher:typeof fetch=async(input,init)=>{requests.push({url:String(input),body:init?.body?JSON.parse(String(init.body)):undefined});return Response.json({ok:true,result:menu});};
  assert.equal(await syncDevelopmentMenu("local-fixture-token",origin,new AbortController().signal,fetcher),true);
  assert.deepEqual(requests[1]!.body,{menu_button:{type:"web_app",text:"Test wallet",web_app:{url:origin+"/"}}});
  for(const next of [{type:"commands"},{type:"web_app",text:"Other",web_app:{url:"https://another.example/"}}]){menu=next;requests.length=0;assert.equal(await syncDevelopmentMenu("local-fixture-token",origin,new AbortController().signal,fetcher),false);assert.equal(requests.length,1);}
});
