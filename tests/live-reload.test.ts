import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync,mkdirSync,writeFileSync,rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join,resolve } from "node:path";
import { sourceFingerprint,StableSourceChange } from "../scripts/live/reload.js";
test("live rebuild watches source additions/changes but ignores generated files and secrets",()=>{
  const root=mkdtempSync(join(tmpdir(),"fx-reload-"));try{
    mkdirSync(join(root,"web"));mkdirSync(join(root,"dist"));writeFileSync(join(root,"web","app.ts"),"one");const first=sourceFingerprint(root);
    writeFileSync(join(root,".env"),"PRIVATE=never-hashed");writeFileSync(join(root,"dist","app.js"),"generated");assert.equal(sourceFingerprint(root),first);
    writeFileSync(join(root,"web","app.ts"),"two");const second=sourceFingerprint(root);assert.notEqual(second,first);
    writeFileSync(join(root,"web","routing.ts"),"new");assert.notEqual(sourceFingerprint(root),second);
  }finally{assert(resolve(root).startsWith(resolve(tmpdir())+"\\")||resolve(root).startsWith(resolve(tmpdir())+"/"));rmSync(root,{recursive:true,force:true});}
});
test("live source watcher debounces partial saves and does not restart repeatedly",()=>{
  const w=new StableSourceChange("original");assert.equal(w.poll("original"),false);assert.equal(w.poll("partial"),false);assert.equal(w.poll("complete"),false);assert.equal(w.poll("complete"),true);assert.equal(w.poll("complete"),false);
  assert.equal(w.poll("another"),false);assert.equal(w.poll("complete"),false);assert.equal(w.poll("another"),false);
});
