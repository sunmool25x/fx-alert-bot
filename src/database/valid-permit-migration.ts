import type {DatabaseSync} from 'node:sqlite';
/** Operator opt-in migration. Not run by normal startup; validated on disposable copies. */
export function migrateValidPermitRetirement(db:DatabaseSync){
  if(db.prepare('SELECT 1 FROM schema_migrations WHERE version=15').get())return;
  db.exec('BEGIN IMMEDIATE');try{
    const triggers=db.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' AND sql LIKE '%permit_retirements%'").all();
    for(const t of triggers){if(!/^[a-z_]+$/.test(String(t.name)))throw Error('Migration trigger mismatch');db.exec('DROP TRIGGER '+t.name);}
    db.exec(`CREATE TABLE permit_retirements_v15(permit_id TEXT PRIMARY KEY REFERENCES permit_acceptance(id) ON DELETE RESTRICT,version TEXT NOT NULL,digest TEXT NOT NULL,
      classification TEXT NOT NULL CHECK(classification IN ('EXPIRED_RESULT_UNKNOWN_NO_ACTIVE_AUTHORITY','EXPIRED_INVALID_SIGNATURE_NO_ACTIVE_AUTHORITY','EXPIRED_VALID_SIGNATURE_NO_ACTIVE_AUTHORITY')),
      evidence TEXT NOT NULL,retired_at INTEGER NOT NULL,FOREIGN KEY(permit_id,version) REFERENCES permit_reviews(permit_id,version) ON DELETE RESTRICT);
      INSERT INTO permit_retirements_v15 SELECT * FROM permit_retirements;DROP TABLE permit_retirements;ALTER TABLE permit_retirements_v15 RENAME TO permit_retirements;`);
    for(const t of triggers){let sql=String(t.sql);if(t.name==='permit_retired_event_insert'){
      sql=sql.replace("(r.classification='EXPIRED_INVALID_SIGNATURE_NO_ACTIVE_AUTHORITY' AND NEW.kind='RETIRED_EXPIRED_INVALID')","(r.classification='EXPIRED_INVALID_SIGNATURE_NO_ACTIVE_AUTHORITY' AND NEW.kind='RETIRED_EXPIRED_INVALID') OR (r.classification='EXPIRED_VALID_SIGNATURE_NO_ACTIVE_AUTHORITY' AND NEW.kind='RETIRED_EXPIRED_VALID')");
      sql=sql.replaceAll("'RETIRED_EXPIRED_UNKNOWN','RETIRED_EXPIRED_INVALID'","'RETIRED_EXPIRED_UNKNOWN','RETIRED_EXPIRED_INVALID','RETIRED_EXPIRED_VALID'");
    }db.exec(sql);}
    db.exec('INSERT INTO schema_migrations VALUES(15);COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
}
