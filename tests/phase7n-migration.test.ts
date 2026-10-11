import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,rmSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {fixture} from './trade-helpers.js';import {databaseReady} from '../src/wallet/preflight.js';import {migrateValidPermitRetirement} from '../src/database/valid-permit-migration.js';
test('read-only preflight recognizes optional 15/16 but rejects missing authorization protection',async()=>{
  for(const versions of [[15],[16],[15,16]]){const dir=mkdtempSync(join(tmpdir(),'phase7n-migration-')),path=join(dir,'test.sqlite'),f=await fixture(path);try{
    assert.equal(databaseReady(path),true);const db=(f.store as any).db;
    if(versions.includes(15))migrateValidPermitRetirement(db);if(versions.includes(16))f.store.authorizations.initialize();
    assert.equal(databaseReady(path),true);assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
    if(versions.includes(16)){db.exec('DROP TRIGGER trade_signature_bound');assert.equal(databaseReady(path),false);}
  }finally{f.store.close();rmSync(dir,{recursive:true,force:true});}}
});
