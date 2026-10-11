import type{DatabaseSync}from'node:sqlite';
/** Broaden only the append-only ledger classification; preserve every historical row and trigger. */
export function migrateInvalidPermitRetirement(db:DatabaseSync){
  if(db.prepare('SELECT 1 FROM schema_migrations WHERE version=14').get())return;
  db.exec('BEGIN IMMEDIATE');try{
    const triggers=db.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' AND sql LIKE '%permit_retirements%'").all();
    for(const t of triggers){if(!/^[a-z_]+$/.test(String(t.name)))throw Error('Migration trigger mismatch');db.exec('DROP TRIGGER '+t.name);}
    db.exec(`CREATE TABLE permit_retirements_v14(
      permit_id TEXT PRIMARY KEY REFERENCES permit_acceptance(id) ON DELETE RESTRICT,
      version TEXT NOT NULL,digest TEXT NOT NULL,
      classification TEXT NOT NULL CHECK(classification IN ('EXPIRED_RESULT_UNKNOWN_NO_ACTIVE_AUTHORITY','EXPIRED_INVALID_SIGNATURE_NO_ACTIVE_AUTHORITY')),
      evidence TEXT NOT NULL,retired_at INTEGER NOT NULL,
      FOREIGN KEY(permit_id,version) REFERENCES permit_reviews(permit_id,version) ON DELETE RESTRICT);
      INSERT INTO permit_retirements_v14 SELECT * FROM permit_retirements;
      DROP TABLE permit_retirements;ALTER TABLE permit_retirements_v14 RENAME TO permit_retirements;`);
    for(const t of triggers)if(t.name!=='permit_retired_event_insert')db.exec(String(t.sql));
    db.exec(`CREATE TRIGGER permit_retired_event_insert BEFORE INSERT ON permit_events
      WHEN (EXISTS(SELECT 1 FROM permit_retirements r WHERE r.permit_id=NEW.permit_id)
        AND NOT EXISTS(SELECT 1 FROM permit_retirements r WHERE r.permit_id=NEW.permit_id AND r.version=NEW.version
          AND ((r.classification='EXPIRED_RESULT_UNKNOWN_NO_ACTIVE_AUTHORITY' AND NEW.kind='RETIRED_EXPIRED_UNKNOWN')
          OR (r.classification='EXPIRED_INVALID_SIGNATURE_NO_ACTIVE_AUTHORITY' AND NEW.kind='RETIRED_EXPIRED_INVALID'))))
      OR (NEW.kind IN ('RETIRED_EXPIRED_UNKNOWN','RETIRED_EXPIRED_INVALID') AND (
        NOT EXISTS(SELECT 1 FROM permit_retirements r WHERE r.permit_id=NEW.permit_id AND r.version=NEW.version)
        OR EXISTS(SELECT 1 FROM permit_events e WHERE e.permit_id=NEW.permit_id AND e.kind IN ('RETIRED_EXPIRED_UNKNOWN','RETIRED_EXPIRED_INVALID'))))
      BEGIN SELECT RAISE(ABORT,'PERMIT_LOCKED'); END;
      INSERT INTO schema_migrations VALUES(14);COMMIT;`);
  }catch(e){db.exec('ROLLBACK');throw e;}
}
