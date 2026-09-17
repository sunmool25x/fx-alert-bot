import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync,readdirSync,rmSync,realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join,relative,isAbsolute } from "node:path";
import { SqliteStore } from "../src/database/store.js";
import { migrateAlerts } from "../src/database/alert-migration.js";
import { migrateScanner } from "../src/database/scanner.js";
import { safeLog } from "../src/utils/errors.js";
test("migration 4 makes consistent backup first and preserves Phase 3 user and quote intent",async()=>{
  const root=realpathSync(tmpdir()),dir=mkdtempSync(join(root,"sera-wallet-migration-")),path=join(dir,"bot.sqlite");let store:SqliteStore|undefined;
  try{const db=new DatabaseSync(path);db.exec(`PRAGMA journal_mode=WAL;CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY);INSERT INTO schema_migrations VALUES(1);
    CREATE TABLE users(id TEXT PRIMARY KEY,language TEXT,source TEXT,created_at INTEGER,last_seen_at INTEGER);
    CREATE TABLE conversations(user_id TEXT PRIMARY KEY,state TEXT,expires_at INTEGER);
    CREATE TABLE quote_intents(id TEXT PRIMARY KEY,user_id TEXT,from_token TEXT,to_token TEXT,amount TEXT,expires_at INTEGER);
    INSERT INTO users VALUES('1','en','source_preserved',1,2);
    INSERT INTO quote_intents VALUES('existing','1','a','b','10',9999999999999);`);migrateAlerts(db);migrateScanner(db);db.close();
    store=new SqliteStore(path);assert.equal((await store.user("1"))!.source,"source_preserved");assert.equal((await store.intent("existing","1"))!.origin,"quote");
    const backup=readdirSync(dir).find(p=>p.includes("before-phase4"));assert(backup);
    const copy=new DatabaseSync(join(dir,backup),{readOnly:true});assert.equal(copy.prepare("SELECT max(version) AS v FROM schema_migrations").get()!.v,3);assert.equal(copy.prepare("SELECT amount FROM quote_intents").get()!.amount,"10");copy.close();
  }finally{store?.close();const rel=relative(root,realpathSync(dir));assert(!isAbsolute(rel)&&!rel.startsWith(".."));rmSync(dir,{recursive:true});}
});
test("log utility drops signatures, private values, wallet errors and URL credentials",()=>{
  const previous=console.error,captured:string[]=[];console.error=(value:unknown)=>{captured.push(String(value));};
  try{safeLog("wallet_failed",new Error("private-key secret signature 0xabc https://rpc.example/key"));assert(!captured.join("").includes("0xabc"));assert(!captured.join("").includes("rpc.example"));assert(!captured.join("").includes("private-key"));}finally{console.error=previous;}
});
