import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { SqliteStore } from "../src/database/store.js";
import { preflight,formatPreflight,databaseReady,type Probes } from "../src/wallet/preflight.js";
import { deploymentFixture } from "./trade-helpers.js";
function setup(){
  const root=mkdtempSync(join(tmpdir(),"sera-preflight-")),db=join(root,"bot.sqlite");
  new SqliteStore(db).close();mkdirSync(join(root,"dist/web"),{recursive:true});
  for(const file of ["index.html","app.js","app.css","THIRD_PARTY_LICENSES.txt"])writeFileSync(join(root,"dist/web",file),"fixture");
  const env={TELEGRAM_BOT_TOKEN:"123456789:"+"secret".repeat(6),SIGNING_ORIGIN:"https://bot.example",WALLETCONNECT_PROJECT_ID:"a".repeat(32),SEPOLIA_RPC_URL:"https://rpc.example/private-secret?key=rpc-secret",EXECUTION_USER_IDS:"12345",DATABASE_PATH:db};
  const calls:string[]=[];
  const probes:Probes={telegram:async()=>{calls.push("telegram");},sera:async()=>{calls.push("sera");return deploymentFixture;},rpc:async()=>{calls.push("rpc");},origin:async()=>{calls.push("origin");}};
  return {root,db,env,calls,probes,close:()=>rmSync(root,{recursive:true,force:true})};
}
test("preflight checks complete read-only setup and leaves execution OFF without treating it as failure",async()=>{
  const f=setup();try{const r=await preflight(f.env,{root:f.root},f.probes);assert.equal(r.exitCode,0);assert.deepEqual(f.calls,["telegram","sera","rpc","origin"]);
    assert.equal(r.checks.find(c=>c.code==="EXECUTION")?.status,"WARN");assert.match(formatPreflight(r.checks),/Execution disabled/);
    assert(!("ENABLE_TESTNET_EXECUTION" in f.env));assert(databaseReady(f.db));
  }finally{f.close();}
});
test("missing prerequisites fail preflight even when execution is OFF",async()=>{
  const f=setup();try{const r=await preflight({DATABASE_PATH:f.db},{root:f.root},f.probes);assert.equal(r.exitCode,1);
    for(const code of ["TG_CONFIG","HTTPS_ORIGIN","REOWN_PROJECT","RPC_CONFIG","BETA_ALLOWLIST"])assert.equal(r.checks.find(c=>c.code===code)?.status,"FAIL");
    assert.deepEqual(f.calls,["sera"]);
  }finally{f.close();}
});
test("preflight never exposes tokens, project IDs or credential URLs even when upstream errors contain them",async()=>{
  const f=setup();try{const secret=Object.values(f.env).join(" ");const fail=async()=>{throw new Error(secret);};
    const r=await preflight(f.env,{root:f.root},{telegram:fail,sera:async()=>deploymentFixture,rpc:fail,origin:fail}),text=formatPreflight(r.checks);
    assert.equal(r.exitCode,1);for(const value of [f.env.TELEGRAM_BOT_TOKEN,f.env.WALLETCONNECT_PROJECT_ID,f.env.SEPOLIA_RPC_URL,"private-secret","rpc-secret"])assert(!text.includes(value));
    const malformed=await preflight({...f.env,WALLETCONNECT_PROJECT_ID:secret},{root:f.root},f.probes);assert.equal(malformed.exitCode,1);assert(!formatPreflight(malformed.checks).includes(secret));
  }finally{f.close();}
});
test("preflight rejects mainnet, malformed flags, incomplete build and more than one acceptance tester",async()=>{
  const f=setup();try{
    for(const e of [{SERA_NETWORK:"mainnet"},{ENABLE_MAINNET:"true"},{ENABLE_TESTNET_EXECUTION:"yes"},{EXECUTION_USER_IDS:"1,2"}])assert.equal((await preflight({...f.env,...e},{root:f.root,offline:true},f.probes)).exitCode,1);
    rmSync(join(f.root,"dist/web/app.js"));assert.equal((await preflight(f.env,{root:f.root,offline:true},f.probes)).exitCode,1);assert.equal(f.calls.length,0);
  }finally{f.close();}
});
test("preflight diagnoses old migrations read-only without creating or changing a database",()=>{
  const f=setup();try{
    const old=join(f.root,"old.sqlite"),db=new DatabaseSync(old);db.exec("CREATE TABLE schema_migrations(version INTEGER); INSERT INTO schema_migrations VALUES(3)");db.close();
    const bytes=readFileSync(old);assert.equal(databaseReady(old),false);assert.deepEqual(readFileSync(old),bytes);assert.equal(databaseReady(join(f.root,"missing.sqlite")),false);
  }finally{f.close();}
});
