import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync,mkdirSync,writeFileSync,rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join,resolve } from "node:path";
import { signingServer } from "../src/wallet/server.js";
import { fixture } from "./trade-helpers.js";
test("OKX bridge assets have a relay-only policy; parent permits its own frame and API auth stays required",async()=>{
  const previous=process.cwd(),root=mkdtempSync(join(tmpdir(),"fx-okx-assets-")),f=await fixture();
  mkdirSync(join(root,"dist","web"),{recursive:true});
  for(const name of ["index.html","okx-bridge.html","okx-bridge.js","wallet-icon.png"])writeFileSync(join(root,"dist","web",name),name);
  const server=signingServer(f.config,f.store,f.chain,f.service);process.chdir(root);
  try{
    await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));const url="http://127.0.0.1:"+(server.address() as {port:number}).port;
    const page=await fetch(url+"/okx-bridge.html");assert.equal(page.status,200);assert.match(page.headers.get("content-type")!,/text\/html/);
    const csp=page.headers.get("content-security-policy")!;assert.match(csp,/frame-ancestors 'self'/);assert.match(csp,/wss:\/\/wsdexpri\.okx\.com\/ws\/v1\/wallet-connect-relay/);
    assert.doesNotMatch(csp,/dappstat|connect-src \*|https:\/\/\*|unsafe-eval|unsafe-inline/);
    assert.match((await fetch(url+"/")).headers.get("content-security-policy")!,/frame-src 'self' https:\/\/verify\.walletconnect/);
    assert.match((await fetch(url+"/wallet-icon.png")).headers.get("content-type")!,/image\/png/);
    assert.equal((await fetch(url+"/api/state",{method:"POST",headers:{"content-type":"application/json"},body:"{}"})).status,400);
    assert.equal((await fetch(url+"/.env")).status,400);assert.equal(f.submitted(),0);
  }finally{await new Promise<void>(r=>server.close(()=>r()));f.store.close();process.chdir(previous);assert(resolve(root).startsWith(resolve(tmpdir())+"\\")||resolve(root).startsWith(resolve(tmpdir())+"/"));rmSync(root,{recursive:true,force:true});}
});
