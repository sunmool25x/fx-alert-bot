import type{DatabaseSync}from'node:sqlite';import{secret}from'./wallet.js';import{AppError}from'../utils/errors.js';
import{validateNoSignatureClosure,type NoSignatureEvidence}from'../permits/reconciliation.js';
import{validateExpiredPermitRetirement,historicalPermitHash,type ExpiredPermitEvidence}from'../permits/retirement.js';
import{inspectEmptyDomainResult,validateInvalidRetirement,capturedResultHash,type CapturedPermitResult,type InvalidPermitEvidence}from'../permits/invalid-reconciliation.js';
import {assertFinancialAvailable} from './financial-locks.js';
import {inspectSignedPermit,validateValidRetirement,type ValidRetirementEvidence} from '../permits/valid-retirement.js';
export type PermitState='REVIEW'|'PERMIT_REQUESTED'|'PERMIT_SIGNED'|'USER_REJECTED'|'WALLET_ERROR'|'PERMIT_INVALID'|'RESULT_UNKNOWN'|'WALLET_ERROR_NO_SIGNATURE';
export interface PermitRow{id:string;user_id:string;wallet:string;session_id:string;epoch:number;intent_id:string;version:string;payload:string;digest:string;created_at:number;requested_at:number|null;signed_at:number|null;state:PermitState;encrypted_signature:string|null;error_code:string|null;rpc_code:number|null;closed_at:number|null;reconciliation:string|null}
export interface PermitRetirementRow{permit_id:string;version:string;digest:string;classification:'EXPIRED_RESULT_UNKNOWN_NO_ACTIVE_AUTHORITY'|'EXPIRED_INVALID_SIGNATURE_NO_ACTIVE_AUTHORITY'|'EXPIRED_VALID_SIGNATURE_NO_ACTIVE_AUTHORITY';evidence:string;retired_at:number}
export function migratePermits(db:DatabaseSync){if(db.prepare('SELECT 1 FROM schema_migrations WHERE version=10').get())return;
  db.exec(`BEGIN IMMEDIATE;CREATE TABLE permit_acceptance(
    id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,wallet TEXT NOT NULL UNIQUE,
    session_id TEXT NOT NULL,epoch INTEGER NOT NULL,intent_id TEXT NOT NULL,version TEXT NOT NULL,payload TEXT NOT NULL,digest TEXT NOT NULL,
    created_at INTEGER NOT NULL,requested_at INTEGER,signed_at INTEGER,state TEXT NOT NULL CHECK(state IN ('REVIEW','PERMIT_REQUESTED','PERMIT_SIGNED','USER_REJECTED','WALLET_ERROR','PERMIT_INVALID')),
    encrypted_signature TEXT,error_code TEXT,rpc_code INTEGER);
    INSERT INTO schema_migrations VALUES(10);COMMIT;`);
}
export function migratePermitReconciliation(db:DatabaseSync){if(db.prepare('SELECT 1 FROM schema_migrations WHERE version=11').get())return;
  db.exec(`BEGIN IMMEDIATE;
    CREATE TABLE permit_acceptance_v11(
      id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,wallet TEXT NOT NULL,
      session_id TEXT NOT NULL,epoch INTEGER NOT NULL,intent_id TEXT NOT NULL,version TEXT NOT NULL,payload TEXT NOT NULL,digest TEXT NOT NULL,
      created_at INTEGER NOT NULL,requested_at INTEGER,signed_at INTEGER,state TEXT NOT NULL CHECK(state IN ('REVIEW','PERMIT_REQUESTED','PERMIT_SIGNED','USER_REJECTED','WALLET_ERROR','PERMIT_INVALID','RESULT_UNKNOWN','WALLET_ERROR_NO_SIGNATURE')),
      encrypted_signature TEXT,error_code TEXT,rpc_code INTEGER,closed_at INTEGER,reconciliation TEXT,
      CHECK(closed_at IS NULL OR (state='WALLET_ERROR_NO_SIGNATURE' AND encrypted_signature IS NULL AND signed_at IS NULL AND reconciliation IS NOT NULL)));
    INSERT INTO permit_acceptance_v11 SELECT *,NULL,NULL FROM permit_acceptance;
    DROP TABLE permit_acceptance;ALTER TABLE permit_acceptance_v11 RENAME TO permit_acceptance;
    CREATE UNIQUE INDEX one_open_permit_wallet ON permit_acceptance(wallet) WHERE closed_at IS NULL;
    CREATE TABLE permit_events(id INTEGER PRIMARY KEY,permit_id TEXT NOT NULL REFERENCES permit_acceptance(id) ON DELETE RESTRICT,version TEXT NOT NULL,kind TEXT NOT NULL,at INTEGER NOT NULL);
    INSERT INTO schema_migrations VALUES(11);COMMIT;`);
}
export class PermitStore{
  constructor(private db:DatabaseSync,private now=Date.now){}
  row(id:string,user:string){return this.db.prepare('SELECT * FROM permit_acceptance WHERE id=? AND user_id=?').get(id,user) as unknown as PermitRow|undefined;}
  retirement(row:Pick<PermitRow,'id'|'version'>){return this.db.prepare('SELECT * FROM permit_retirements WHERE permit_id=? AND version=?').get(row.id,row.version) as unknown as PermitRetirementRow|undefined;}
  private active(row:PermitRow){if(this.retirement(row))throw new AppError('PERMIT_LOCKED');}
  forWallet(wallet:string){return this.db.prepare('SELECT p.* FROM permit_acceptance p LEFT JOIN permit_retirements r ON r.permit_id=p.id AND r.version=p.version WHERE lower(p.wallet)=? ORDER BY (p.closed_at IS NULL AND r.permit_id IS NULL) DESC,p.created_at DESC,p.rowid DESC LIMIT 1').get(wallet.toLowerCase()) as unknown as PermitRow|undefined;}
  /** Read-only, exhaustive inspection. Never use wallet.list(), which expires rows and limits history. */
  financialPending(row:PermitRow){
    try{assertFinancialAvailable(this.db,row.user_id,row.wallet,'',row.id);}catch{return true;}
    if(this.db.prepare('SELECT 1 FROM wallet_quarantine WHERE lower(address)=lower(?)').get(row.wallet))return true;
    if(this.db.prepare(`SELECT 1 FROM permit_acceptance p WHERE (p.user_id=? OR lower(p.wallet)=lower(?)) AND p.id!=? AND p.closed_at IS NULL
      AND NOT EXISTS(SELECT 1 FROM permit_retirements r WHERE r.permit_id=p.id AND r.version=p.version) LIMIT 1`).get(row.user_id,row.wallet,row.id))return true;
    if(this.db.prepare(`SELECT 1 FROM trade_sessions t WHERE (t.user_id=? OR lower(t.wallet)=lower(?)) AND (
      t.state NOT IN ('CONFIRMED','FAILED','EXPIRED','CANCELLED')
      OR (t.state='CONFIRMED' AND (t.evidence IS NULL OR t.tx_hash IS NULL))
      OR (t.state!='CONFIRMED' AND (t.submitted_at IS NOT NULL OR t.tx_hash IS NOT NULL OR t.trade_id IS NOT NULL
        OR EXISTS(SELECT 1 FROM trade_attempts a WHERE a.trade_session_id=t.id)))) LIMIT 1`).get(row.user_id,row.wallet))return true;
    return !!this.db.prepare("SELECT 1 FROM funding_claims WHERE (user_id=? OR lower(wallet)=lower(?)) AND attempted=1 AND state!='CLAIM_BALANCES_VERIFIED' LIMIT 1").get(row.user_id,row.wallet);
  }
  /** Operator-only retirement: no signature result is inferred or modified. */
  retireExpiredUnknown(row:PermitRow,evidence:ExpiredPermitEvidence){this.db.exec('BEGIN IMMEDIATE');try{
    const current=this.row(row.id,row.user_id);if(!current||current.version!==row.version||current.digest!==row.digest)throw new AppError('PERMIT_LOCKED');
    const existing=this.retirement(current),serialized=JSON.stringify(evidence);
    if(existing){if(existing.digest!==current.digest||existing.evidence!==serialized)throw new AppError('PERMIT_LOCKED');this.db.exec('COMMIT');return existing;}
    if(historicalPermitHash(current)!==evidence.historicalHash||this.result(current)||this.financialPending(current))throw new AppError('PERMIT_LOCKED');
    validateExpiredPermitRetirement(current,evidence,this.now());
    this.db.prepare("INSERT INTO permit_retirements(permit_id,version,digest,classification,evidence,retired_at) VALUES(?,?,?,'EXPIRED_RESULT_UNKNOWN_NO_ACTIVE_AUTHORITY',?,?)").run(current.id,current.version,current.digest,serialized,this.now());
    this.event(current,'RETIRED_EXPIRED_UNKNOWN');const retired=this.retirement(current)!;this.db.exec('COMMIT');return retired;
  }catch(e){this.db.exec('ROLLBACK');throw e;}}
  /** Retained invalid response uses a different classification; never turns into UNKNOWN/unsigned. */
  async retireExpiredInvalid(row:PermitRow,e:InvalidPermitEvidence,key:string){
    const result=this.db.prepare('SELECT * FROM permit_results WHERE permit_id=? AND version=?').get(row.id,row.version) as CapturedPermitResult|undefined;
    if(!result)throw new AppError('PERMIT_LOCKED');
    const checked=await inspectEmptyDomainResult(row,result,key);
    for(const k of ['resultHash','reason','canonicalRecovery','emptyDomainDigest']as const)if(checked[k]!==e[k])throw new AppError('PERMIT_LOCKED');
    this.db.exec('BEGIN IMMEDIATE');try{
      const current=this.row(row.id,row.user_id),latest=this.db.prepare('SELECT * FROM permit_results WHERE permit_id=? AND version=?').get(row.id,row.version) as CapturedPermitResult|undefined;
      if(!current||!latest||historicalPermitHash(current)!==e.historicalHash||capturedResultHash(latest)!==e.resultHash)throw new AppError('PERMIT_LOCKED');
      const existing=this.retirement(current);if(existing){if(existing.classification!==e.classification||existing.evidence!==JSON.stringify(e))throw new AppError('PERMIT_LOCKED');this.db.exec('COMMIT');return existing;}
      if(this.financialPending(current))throw new AppError('PERMIT_LOCKED');validateInvalidRetirement(current,e,this.now());
      this.db.prepare('INSERT INTO permit_retirements(permit_id,version,digest,classification,evidence,retired_at) VALUES(?,?,?,?,?,?)').run(current.id,current.version,current.digest,e.classification,JSON.stringify(e),this.now());
      this.event(current,'RETIRED_EXPIRED_INVALID');const retired=this.retirement(current)!;this.db.exec('COMMIT');return retired;
    }catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  /** Separate opt-in operator path. Never invoked by the bot, server, refresh or startup. */
  async retireExpiredValid(row:PermitRow,e:ValidRetirementEvidence,key:string){
    const result=this.db.prepare('SELECT * FROM permit_results WHERE permit_id=? AND version=?').get(row.id,row.version) as CapturedPermitResult|undefined;
    if(!result)throw new AppError('PERMIT_LOCKED');
    const checked=await inspectSignedPermit(row,result,key);if(checked.resultHash!==e.resultHash)throw new AppError('PERMIT_LOCKED');
    this.db.exec('BEGIN IMMEDIATE');try{
      const current=this.row(row.id,row.user_id),latest=this.db.prepare('SELECT * FROM permit_results WHERE permit_id=? AND version=?').get(row.id,row.version) as CapturedPermitResult|undefined;
      if(!current||!latest||historicalPermitHash(current)!==e.historicalHash||capturedResultHash(latest)!==e.resultHash)throw new AppError('PERMIT_LOCKED');
      const existing=this.retirement(current);if(existing){if(existing.classification!==e.classification||existing.evidence!==JSON.stringify(e))throw new AppError('PERMIT_LOCKED');this.db.exec('COMMIT');return existing;}
      if(this.financialPending(current))throw new AppError('PERMIT_LOCKED');
      assertFinancialAvailable(this.db,current.user_id,current.wallet,'',current.id);validateValidRetirement(current,e,this.now());
      this.db.prepare('INSERT INTO permit_retirements VALUES(?,?,?,?,?,?)').run(current.id,current.version,current.digest,e.classification,JSON.stringify(e),this.now());
      this.event(current,'RETIRED_EXPIRED_VALID');const retired=this.retirement(current)!;this.db.exec('COMMIT');return retired;
    }catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  canRetry(row:PermitRow,session:{id:string;epoch:number;user_id:string},intent:string){
    const retired=this.retirement(row),releasedAt=retired?.retired_at??(row.state==='WALLET_ERROR_NO_SIGNATURE'?row.closed_at:null);
    if(releasedAt===null||row.user_id!==session.user_id||intent===row.intent_id||session.id===row.session_id&&session.epoch===row.epoch)return false;
    const proof=this.db.prepare('SELECT 1 FROM wallet_links l JOIN wallet_sessions s ON s.user_id=l.user_id WHERE l.user_id=? AND lower(l.address)=lower(?) AND l.verified_at>? AND s.id=? AND s.epoch=? AND lower(s.wallet)=lower(?) AND s.expires_at>?').get(row.user_id,row.wallet,releasedAt,session.id,session.epoch,row.wallet,this.now());
    const context=this.db.prepare("SELECT 1 FROM quote_continuations WHERE id=? AND user_id=? AND created_at>? AND expires_at>? AND state!='CANCELLED'").get(intent,row.user_id,releasedAt,this.now());return !!proof&&!!context;
  }
  events(row:PermitRow){return this.db.prepare('SELECT kind,at FROM permit_events WHERE permit_id=? AND version=? ORDER BY id').all(row.id,row.version) as{kind:string;at:number}[];}
  event(row:PermitRow,kind:PermitEvent){
    if(!['RETIRED_EXPIRED_UNKNOWN','RETIRED_EXPIRED_INVALID','RETIRED_EXPIRED_VALID'].includes(kind))this.active(row);
    this.db.prepare('INSERT INTO permit_events(permit_id,version,kind,at) VALUES(?,?,?,?)').run(row.id,row.version,kind,this.now());
  }
  closeNoSignature(row:PermitRow,evidence:NoSignatureEvidence){this.db.exec('BEGIN IMMEDIATE');try{
    const current=this.row(row.id,row.user_id);if(!current||current.version!==row.version)throw new AppError('PERMIT_LOCKED');this.active(current);validateNoSignatureClosure(current,evidence,this.now());
    if(this.events(current).some(e=>['CALLBACK_RECEIVED','SIGNATURE_RECEIVED','SIGNED'].includes(e.kind)))throw new AppError('PERMIT_LOCKED');
    this.db.prepare("UPDATE permit_acceptance SET state='WALLET_ERROR_NO_SIGNATURE',closed_at=?,reconciliation=? WHERE id=?").run(this.now(),JSON.stringify(evidence),row.id);this.event(current,'CLOSED_NO_SIGNATURE');this.db.exec('COMMIT');
  }catch(e){this.db.exec('ROLLBACK');throw e;}}
  review(value:Pick<PermitRow,'user_id'|'wallet'|'session_id'|'epoch'|'intent_id'|'version'|'payload'|'digest'>){
    const wallet=value.wallet.toLowerCase();this.db.exec('BEGIN IMMEDIATE');try{
      const latest=this.forWallet(wallet),old=latest?.closed_at===null&&!this.retirement(latest)?latest:undefined;if(old&&(old.user_id!==value.user_id||old.state!=='REVIEW'||old.requested_at!==null))throw new AppError('PERMIT_LOCKED');
      if(latest&&!old&&(!this.canRetry(latest,{id:value.session_id,epoch:value.epoch,user_id:value.user_id},value.intent_id)||value.version===latest.version))throw new AppError('PERMIT_LOCKED');
      assertFinancialAvailable(this.db,value.user_id,wallet,'',old?.id??'');
      const id=old?.id??secret();
      this.db.prepare(`INSERT INTO permit_acceptance(id,user_id,wallet,session_id,epoch,intent_id,version,payload,digest,created_at,state) VALUES(?,?,?,?,?,?,?,?,?,?,'REVIEW')
        ON CONFLICT(id) DO UPDATE SET session_id=excluded.session_id,epoch=excluded.epoch,intent_id=excluded.intent_id,version=excluded.version,payload=excluded.payload,digest=excluded.digest,created_at=excluded.created_at`).run(id,value.user_id,wallet,value.session_id,value.epoch,value.intent_id,value.version,value.payload,value.digest,this.now());
      const row=this.row(id,value.user_id)!;this.archive(row);this.event(row,'REVIEW_PREPARED');this.db.exec('COMMIT');return row;
    }catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  request(row:PermitRow){this.db.exec('BEGIN IMMEDIATE');try{this.active(row);if(this.db.prepare("UPDATE permit_acceptance SET state='PERMIT_REQUESTED',requested_at=? WHERE id=? AND user_id=? AND state='REVIEW' AND version=? AND requested_at IS NULL AND closed_at IS NULL").run(this.now(),row.id,row.user_id,row.version).changes!==1)throw new AppError('PERMIT_LOCKED');this.event(row,'REQUEST_RESERVED');this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}}
  signed(row:PermitRow,cipher:string){this.db.exec('BEGIN IMMEDIATE');try{this.active(row);if(this.db.prepare("UPDATE permit_acceptance SET state='PERMIT_SIGNED',encrypted_signature=?,signed_at=?,error_code=NULL,rpc_code=NULL WHERE id=? AND user_id=? AND state IN ('PERMIT_REQUESTED','RESULT_UNKNOWN') AND version=? AND closed_at IS NULL").run(cipher,this.now(),row.id,row.user_id,row.version).changes!==1)throw new AppError('PERMIT_LOCKED');this.event(row,'SIGNED');this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}}
  failed(row:PermitRow,state:'USER_REJECTED'|'WALLET_ERROR'|'PERMIT_INVALID'|'RESULT_UNKNOWN',code:string,rpc:number|null=null){
    this.db.exec('BEGIN IMMEDIATE');try{this.active(row);if(this.db.prepare("UPDATE permit_acceptance SET state=?,error_code=?,rpc_code=? WHERE id=? AND user_id=? AND state IN ('PERMIT_REQUESTED','RESULT_UNKNOWN') AND version=? AND closed_at IS NULL").run(state,code,rpc,row.id,row.user_id,row.version).changes)this.event(row,'FAILED');this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  forget(user:string){if(this.db.prepare('SELECT 1 FROM permit_acceptance WHERE user_id=? AND requested_at IS NOT NULL').get(user))throw new AppError('PERMIT_LOCKED');this.db.prepare('DELETE FROM permit_events WHERE permit_id IN (SELECT id FROM permit_acceptance WHERE user_id=?)').run(user);this.db.prepare('DELETE FROM permit_acceptance WHERE user_id=?').run(user);}
  archive(r:PermitRow){this.active(r);this.db.prepare('INSERT OR IGNORE INTO permit_reviews(permit_id,version,payload,digest,prepared_at) VALUES(?,?,?,?,?)').run(r.id,r.version,r.payload,r.digest,r.created_at);}
  result(r:PermitRow){return this.db.prepare('SELECT crypto_valid,response_kind,validation_code,quote_expired,permit_expired,chain_status,received_at FROM permit_results WHERE permit_id=? AND version=?').get(r.id,r.version) as unknown as {crypto_valid:number|null;response_kind:string;validation_code:string;quote_expired:number;permit_expired:number;chain_status:string;received_at:number}|undefined;}
  capture(r:PermitRow,cipher:string|null,kind:string){
    this.active(r);
    const current=this.row(r.id,r.user_id);if(!current||current.version!==r.version||current.closed_at!==null||!['PERMIT_REQUESTED','RESULT_UNKNOWN'].includes(current.state))throw new AppError('PERMIT_LOCKED');
    if(this.db.prepare('INSERT OR IGNORE INTO permit_results(permit_id,version,encrypted_response,response_kind,crypto_valid,validation_code,quote_expired,permit_expired,chain_status,received_at) VALUES(?,?,?,?,NULL,\'PENDING\',?,?,\'UNKNOWN\',?)').run(r.id,r.version,cipher,kind,JSON.parse(r.payload).quote.expires_at*1000<=this.now()?1:0,JSON.parse(r.payload).quote.permit.eip712.message.deadline*1000<=this.now()?1:0,this.now()).changes!==1)throw new AppError('PERMIT_LOCKED');
    this.event(r,kind==='SIGNATURE_BYTES'?'SIGNATURE_RECEIVED':'RESPONSE_RECEIVED');
  }
  resultChecked(r:PermitRow,valid:boolean|null,code:string,chain:string){this.active(r);this.db.prepare('UPDATE permit_results SET crypto_valid=?,validation_code=?,chain_status=? WHERE permit_id=? AND version=?').run(valid===null?null:valid?1:0,code,chain,r.id,r.version);}
}
export type PermitEvent='REVIEW_PREPARED'|'CONSENT_AND_CLICK'|'PREFLIGHT_STARTED'|'PREFLIGHT_PASS'|'PREFLIGHT_QUOTE_STALE'|'PREFLIGHT_OWNERSHIP_EXPIRED'|'PREFLIGHT_BLOCKED'|'REQUEST_RESERVED'|'RPC_DISPATCHED'|'SDK_INVOKED'|'SDK_RETURNED'|'HANDOFF_REQUESTED'|'HANDOFF_FAILED'|'HANDOFF_REOPENED'|'CALLBACK_RECEIVED'|'RESPONSE_RECEIVED'|'SIGNATURE_RECEIVED'|'SIGNED'|'FAILED'|'CLOSED_NO_SIGNATURE'|'CLIENT_QUOTE_STALE'|'CLIENT_OWNERSHIP_EXPIRED'|'RETIRED_EXPIRED_UNKNOWN'|'RETIRED_EXPIRED_INVALID'|'RETIRED_EXPIRED_VALID'|'CLIENT_PRE_DISPATCH_REJECTED'|`PRE_DISPATCH_REJECTED:${string}:${string}`|`SIGNATURE_INVALID:${string}`;
export function migratePermitEvidence(db:DatabaseSync){if(db.prepare('SELECT 1 FROM schema_migrations WHERE version=12').get())return;
  db.exec(`BEGIN IMMEDIATE;
    CREATE TABLE permit_reviews(permit_id TEXT NOT NULL REFERENCES permit_acceptance(id) ON DELETE CASCADE,version TEXT NOT NULL,payload TEXT NOT NULL,digest TEXT NOT NULL,prepared_at INTEGER NOT NULL,PRIMARY KEY(permit_id,version));
    INSERT INTO permit_reviews SELECT id,version,payload,digest,created_at FROM permit_acceptance;
    CREATE TABLE permit_results(permit_id TEXT NOT NULL REFERENCES permit_acceptance(id) ON DELETE RESTRICT,version TEXT NOT NULL,encrypted_response TEXT,response_kind TEXT NOT NULL,crypto_valid INTEGER,validation_code TEXT NOT NULL,quote_expired INTEGER NOT NULL,permit_expired INTEGER NOT NULL,chain_status TEXT NOT NULL,received_at INTEGER NOT NULL,PRIMARY KEY(permit_id,version));
    INSERT INTO schema_migrations VALUES(12);COMMIT;`);
}
/** Retirement releases only a lock; original financial rows and signature evidence stay immutable. */
export function migratePermitRetirements(db:DatabaseSync){if(db.prepare('SELECT 1 FROM schema_migrations WHERE version=13').get())return;
  db.exec('BEGIN IMMEDIATE');try{
    db.exec(`CREATE TABLE permit_retirements(
      permit_id TEXT PRIMARY KEY REFERENCES permit_acceptance(id) ON DELETE RESTRICT,
      version TEXT NOT NULL,digest TEXT NOT NULL,
      classification TEXT NOT NULL CHECK(classification='EXPIRED_RESULT_UNKNOWN_NO_ACTIVE_AUTHORITY'),
      evidence TEXT NOT NULL,retired_at INTEGER NOT NULL,
      FOREIGN KEY(permit_id,version) REFERENCES permit_reviews(permit_id,version) ON DELETE RESTRICT);
    CREATE TRIGGER permit_retirement_binding BEFORE INSERT ON permit_retirements
      WHEN EXISTS(SELECT 1 FROM permit_retirements r WHERE r.permit_id=NEW.permit_id)
        OR NOT EXISTS(SELECT 1 FROM permit_acceptance p WHERE p.id=NEW.permit_id AND p.version=NEW.version AND p.digest=NEW.digest AND p.closed_at IS NULL AND p.requested_at IS NOT NULL)
      BEGIN SELECT RAISE(ABORT,'PERMIT_LOCKED'); END;
    CREATE TRIGGER permit_active_insert BEFORE INSERT ON permit_acceptance
      WHEN NEW.closed_at IS NULL AND EXISTS(SELECT 1 FROM permit_acceptance p WHERE p.id!=NEW.id AND lower(p.wallet)=lower(NEW.wallet) AND p.closed_at IS NULL
        AND NOT EXISTS(SELECT 1 FROM permit_retirements r WHERE r.permit_id=p.id AND r.version=p.version))
      BEGIN SELECT RAISE(ABORT,'PERMIT_LOCKED'); END;
    CREATE TRIGGER permit_active_update BEFORE UPDATE ON permit_acceptance
      WHEN NEW.closed_at IS NULL AND EXISTS(SELECT 1 FROM permit_acceptance p WHERE p.id!=OLD.id AND lower(p.wallet)=lower(NEW.wallet) AND p.closed_at IS NULL
        AND NOT EXISTS(SELECT 1 FROM permit_retirements r WHERE r.permit_id=p.id AND r.version=p.version))
      BEGIN SELECT RAISE(ABORT,'PERMIT_LOCKED'); END;
    CREATE TRIGGER permit_retirement_no_update BEFORE UPDATE ON permit_retirements BEGIN SELECT RAISE(ABORT,'PERMIT_LOCKED'); END;
    CREATE TRIGGER permit_retirement_no_delete BEFORE DELETE ON permit_retirements BEGIN SELECT RAISE(ABORT,'PERMIT_LOCKED'); END;
    CREATE TRIGGER permit_retired_update BEFORE UPDATE ON permit_acceptance
      WHEN EXISTS(SELECT 1 FROM permit_retirements r WHERE r.permit_id=OLD.id)
      BEGIN SELECT RAISE(ABORT,'PERMIT_LOCKED'); END;
    CREATE TRIGGER permit_retired_insert BEFORE INSERT ON permit_acceptance
      WHEN EXISTS(SELECT 1 FROM permit_retirements r WHERE r.permit_id=NEW.id)
      BEGIN SELECT RAISE(ABORT,'PERMIT_LOCKED'); END;
    CREATE TRIGGER permit_retired_delete BEFORE DELETE ON permit_acceptance
      WHEN EXISTS(SELECT 1 FROM permit_retirements r WHERE r.permit_id=OLD.id)
      BEGIN SELECT RAISE(ABORT,'PERMIT_LOCKED'); END;
    CREATE TRIGGER permit_retired_event_insert BEFORE INSERT ON permit_events
      WHEN (EXISTS(SELECT 1 FROM permit_retirements r WHERE r.permit_id=NEW.permit_id)
        AND (NEW.kind!='RETIRED_EXPIRED_UNKNOWN' OR NOT EXISTS(SELECT 1 FROM permit_retirements r WHERE r.permit_id=NEW.permit_id AND r.version=NEW.version)))
        OR (NEW.kind='RETIRED_EXPIRED_UNKNOWN' AND (NOT EXISTS(SELECT 1 FROM permit_retirements r WHERE r.permit_id=NEW.permit_id AND r.version=NEW.version)
          OR EXISTS(SELECT 1 FROM permit_events e WHERE e.permit_id=NEW.permit_id AND e.kind='RETIRED_EXPIRED_UNKNOWN')))
      BEGIN SELECT RAISE(ABORT,'PERMIT_LOCKED'); END;
    DROP INDEX one_open_permit_wallet;`);
    for(const table of ['permit_events','permit_reviews','permit_results']){
      for(const operation of ['UPDATE','DELETE'])db.exec(`CREATE TRIGGER ${table}_retired_${operation.toLowerCase()} BEFORE ${operation} ON ${table}
        WHEN EXISTS(SELECT 1 FROM permit_retirements r WHERE r.permit_id=OLD.permit_id)
        BEGIN SELECT RAISE(ABORT,'PERMIT_LOCKED'); END;`);
      if(table!=='permit_events')db.exec(`CREATE TRIGGER ${table}_retired_insert BEFORE INSERT ON ${table}
        WHEN EXISTS(SELECT 1 FROM permit_retirements r WHERE r.permit_id=NEW.permit_id)
        BEGIN SELECT RAISE(ABORT,'PERMIT_LOCKED'); END;`);
    }
    db.exec('INSERT INTO schema_migrations VALUES(13);COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
}
