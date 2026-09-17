import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { request } from "node:http";
import { signingServer } from "../src/wallet/server.js";
import { fixture,signer } from "./trade-helpers.js";
import { NOW } from "./helpers.js";
function initData(user=1){const p=new URLSearchParams({auth_date:String(NOW/1000),user:JSON.stringify({id:user}),query_id:"http"});
  const check=[...p].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+"="+v).join("\n");p.set("hash",createHmac("sha256",createHmac("sha256","WebAppData").update("test-token").digest()).update(check).digest("hex"));return p.toString();}
async function serverFixture(){
  const f=await fixture(),refreshes:string[]=[];f.config.botToken="test-token";const server=signingServer(f.config,f.store,f.chain,f.service,f.now,async user=>{refreshes.push(user);});
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));const address=server.address() as {port:number};
  let cookie="",csrf="";
  const call=async(path:string,data:unknown={},headers:Record<string,string>={})=>{
    const response=await new Promise<Response>((resolve,reject)=>{
      const req=request({hostname:"127.0.0.1",port:address.port,path:"/api/"+path,method:"POST",headers:{host:"bot.example",origin:"https://bot.example","content-type":"application/json",cookie,"x-csrf-token":csrf,...headers}},res=>{
        const chunks:Buffer[]=[];res.on("data",c=>chunks.push(c));res.on("end",()=>{const h=new Headers();for(const [key,value]of Object.entries(res.headers))if(value)h.set(key,Array.isArray(value)?value.join(","):value);resolve(new Response(Buffer.concat(chunks),{status:res.statusCode,headers:h}));});
      });req.on("error",reject);req.end(JSON.stringify(data));
    });
    return {response,json:await response.json() as Record<string,unknown>};};
  return {f,call,refreshes,async login(user=1){const r=await call("auth",{initData:initData(user)});assert.equal(r.response.status,200,JSON.stringify(r.json));cookie=r.response.headers.get("set-cookie")!.split(";")[0]!;csrf=String(r.json.csrf);return r;},async close(){await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));f.store.close();}};
}
test("web API rejects origin/CSRF failures, forged identity and replayed Telegram initialization",async()=>{
  const s=await serverFixture();try{
    assert.equal((await s.call("auth",{initData:initData(),userId:"2"})).response.status,400);
    assert.equal((await s.call("auth",{initData:initData()},{origin:"https://evil.example"})).response.status,400);
    const login=await s.login();assert.equal(login.response.status,200);assert.match(login.response.headers.get("set-cookie")!,/Secure; HttpOnly; SameSite=Strict/);
    assert.equal((await s.call("state",{}, {"x-csrf-token":"forged"})).response.status,400);
    assert.equal((await s.call("state")).response.status,200);
    assert.equal((await s.call("auth",{initData:initData()})).json.code,"AUTH_REPLAY");
    assert(!JSON.stringify(login.json).includes("test-token"));assert(!JSON.stringify(login.json).includes("rpc.example"));
  }finally{await s.close();}
});
test("missing Reown still serves authenticated setup status without enabling wallet or financial authorization",async()=>{
  const s=await serverFixture();try{
    s.f.config.wallet.enabled=false;s.f.config.wallet.projectId="";s.f.config.wallet.ready=false;
    const login=await s.login();assert.equal(login.json.ready,false);assert.equal(login.json.enabled,false);assert.equal(login.json.projectId,"");assert.equal(login.json.userId,"1");
    assert.equal((await s.call("state")).response.status,200);
    assert.equal((await s.call("confirm",{id:"0".repeat(64),version:"0".repeat(64)})).json.code,"EXECUTION_DISABLED");
    assert.equal(s.f.submitted(),0);
  }finally{await s.close();}
});
test("HTTP read-only acceptance supports ownership/preview, keeps confirmation blocked and refreshes only its owner",async()=>{
  const s=await serverFixture();try{
    s.f.config.wallet.enabled=false;const login=await s.login();assert.equal(login.json.userId,"1");assert.equal(login.json.enabled,false);
    assert.equal((await s.call("challenge",{address:signer.address,chainId:1})).json.code,"NETWORK_MISMATCH");
    const c=await s.call("challenge",{address:signer.address,chainId:11155111});assert.equal(c.response.status,200);
    const sig=await signer.signMessage({message:String(c.json.message)});await s.call("verify",{id:c.json.id,signature:sig});
    const preview=await s.call("preview",{intent:s.f.intent});assert.equal(preview.json.state,"PREVIEW");assert.equal(preview.json.version,null);assert.equal(s.f.store.wallet.list("1").length,0);
    assert.equal((await s.call("confirm",{id:"0".repeat(64),version:"0".repeat(64)})).json.code,"EXECUTION_DISABLED");
    await s.call("refresh");assert.deepEqual(s.refreshes,["1"]);assert.equal(s.f.submitted(),0);
    await s.call("disconnect");assert.equal((await s.call("preview",{intent:s.f.intent})).json.code,"WALLET_REQUIRED");
  }finally{await s.close();}
});
test("HTTP auth, RPC failures and diagnostic input expose only safe actionable errors",async()=>{
  const s=await serverFixture();try{
    const secret="seed phrase; bot token; raw initData; signature secret";
    const bad=await s.call("auth",{initData:secret});assert.equal(bad.json.code,"AUTH_INVALID");assert.match(String(bad.json.message),/\[AUTH_INVALID\]/);assert(!JSON.stringify(bad.json).includes(secret));
    await s.login();assert.equal((await s.call("diagnostic",{code:"WALLET_RETURNED",details:secret})).response.status,400);
    const c=await s.call("challenge",{address:signer.address,chainId:11155111}),sig=await signer.signMessage({message:String(c.json.message)});await s.call("verify",{id:c.json.id,signature:sig});
    s.f.chain.balances=async()=>{throw new Error(secret);};const result=await s.call("balance");assert.equal(result.json.code,"RPC_UNAVAILABLE");assert(!JSON.stringify(result.json).includes(secret));
  }finally{await s.close();}
});
test("HTTP wallet ownership, balances, private status and foreign trade authorization",async()=>{
  const s=await serverFixture();try{
    await s.login();const c=await s.call("challenge",{address:signer.address,chainId:11155111});assert.equal(c.response.status,200);
    const sig=await signer.signMessage({message:String(c.json.message)});
    assert.equal((await s.call("verify",{id:c.json.id,signature:sig})).response.status,200);
    const balances=await s.call("balance");assert.equal(balances.response.status,200);
    const review=await s.call("prepare",{intent:s.f.intent});assert.equal(review.json.state,"REVIEW");assert.match(String(review.json.text),/최소 수령액/);assert(!String(review.json.text).includes("예상 최소"));
    await s.login(2);const state=await s.call("state");assert.deepEqual(state.json.trades,[]);
    assert.equal((await s.call("confirm",{id:review.json.id,version:review.json.version})).response.status,400);
    assert.equal((await s.call("cancel",{id:review.json.id})).response.status,400);
    assert.equal((await s.call("prepare",{intent:s.f.intent})).response.status,400);assert.equal(s.f.submitted(),0);
  }finally{await s.close();}
});
