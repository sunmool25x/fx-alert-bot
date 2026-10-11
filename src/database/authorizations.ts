import type {DatabaseSync} from 'node:sqlite';
import type {TradeRow} from './wallet.js';
import {AppError} from '../utils/errors.js';
import {assertFinancialAvailable,authorizationSchemaReady} from './financial-locks.js';
export type SignatureStep='permit'|'intent';
export interface AuthorizationRow{trade_id:string;version:string;step:SignatureStep;digest:string;state:'REQUESTING'|'RESULT_UNKNOWN'|'REJECTED'|'CAPTURED'|'SIGNED'|'INVALID';requested_at:number;received_at:number|null;encrypted_response:string|null;crypto_valid:number|null;code:string;quote_expired:number;signature_expired:number;chain_status:string}
export interface PackageRow{trade_id:string;version:string;user_id:string;wallet:string;session_id:string;epoch:number;permit_digest:string;intent_digest:string;created_at:number}
/** Additive, explicitly initialized only for the full-trade capability or disposable migration tests. */
export function migrateAuthorizations(db:DatabaseSync){
  if(authorizationSchemaReady(db))return;
  db.exec(`BEGIN IMMEDIATE;
    CREATE TABLE trade_packages(trade_id TEXT PRIMARY KEY REFERENCES trade_sessions(id) ON DELETE RESTRICT,version TEXT NOT NULL,user_id TEXT NOT NULL,wallet TEXT NOT NULL,session_id TEXT NOT NULL,epoch INTEGER NOT NULL,permit_digest TEXT NOT NULL,intent_digest TEXT NOT NULL,created_at INTEGER NOT NULL);
    CREATE TABLE trade_authorizations(trade_id TEXT NOT NULL REFERENCES trade_packages(trade_id) ON DELETE RESTRICT,version TEXT NOT NULL,step TEXT NOT NULL CHECK(step IN ('permit','intent')),digest TEXT NOT NULL,state TEXT NOT NULL,requested_at INTEGER NOT NULL,received_at INTEGER,encrypted_response TEXT,crypto_valid INTEGER,code TEXT NOT NULL,quote_expired INTEGER NOT NULL DEFAULT 0,signature_expired INTEGER NOT NULL DEFAULT 0,chain_status TEXT NOT NULL DEFAULT 'UNKNOWN',PRIMARY KEY(trade_id,step));
    CREATE TABLE trade_authorization_events(id INTEGER PRIMARY KEY,trade_id TEXT NOT NULL REFERENCES trade_packages(trade_id) ON DELETE RESTRICT,version TEXT NOT NULL,kind TEXT NOT NULL,at INTEGER NOT NULL);
    CREATE TRIGGER trade_package_immutable_update BEFORE UPDATE ON trade_packages BEGIN SELECT RAISE(ABORT,'TRADE_STATE'); END;
    CREATE TRIGGER trade_package_immutable_delete BEFORE DELETE ON trade_packages BEGIN SELECT RAISE(ABORT,'TRADE_STATE'); END;
    CREATE TRIGGER trade_signature_retained BEFORE DELETE ON trade_authorizations BEGIN SELECT RAISE(ABORT,'TRADE_STATE'); END;
    CREATE TRIGGER trade_signature_bound BEFORE UPDATE ON trade_authorizations WHEN NEW.trade_id!=OLD.trade_id OR NEW.version!=OLD.version OR NEW.step!=OLD.step OR NEW.digest!=OLD.digest OR NEW.requested_at!=OLD.requested_at OR (OLD.encrypted_response IS NOT NULL AND NEW.encrypted_response IS NOT OLD.encrypted_response) BEGIN SELECT RAISE(ABORT,'TRADE_STATE'); END;
    CREATE TRIGGER trade_terms_bound BEFORE UPDATE ON trade_sessions WHEN EXISTS(SELECT 1 FROM trade_packages p WHERE p.trade_id=OLD.id) AND (NEW.payload IS NOT OLD.payload OR NEW.version IS NOT OLD.version OR NEW.user_id!=OLD.user_id OR NEW.wallet!=OLD.wallet OR NEW.session_id!=OLD.session_id OR NEW.quote_id IS NOT OLD.quote_id OR NEW.chain_id!=OLD.chain_id OR NEW.intent_id!=OLD.intent_id OR NEW.origin!=OLD.origin OR NEW.expires_at!=OLD.expires_at) BEGIN SELECT RAISE(ABORT,'QUOTE_BINDING_MISMATCH'); END;
    CREATE TRIGGER trade_events_retained_update BEFORE UPDATE ON trade_authorization_events BEGIN SELECT RAISE(ABORT,'TRADE_STATE'); END;
    CREATE TRIGGER trade_events_retained_delete BEFORE DELETE ON trade_authorization_events BEGIN SELECT RAISE(ABORT,'TRADE_STATE'); END;
    INSERT INTO schema_migrations VALUES(16);COMMIT;`);
}
export class AuthorizationStore{
  constructor(private db:DatabaseSync,private now=Date.now){}
  initialize(){migrateAuthorizations(this.db);}
  ready(){return authorizationSchemaReady(this.db);}
  package(id:string){return this.ready()?this.db.prepare('SELECT * FROM trade_packages WHERE trade_id=?').get(id) as unknown as PackageRow|undefined:undefined;}
  row(id:string,step:SignatureStep){return this.ready()?this.db.prepare('SELECT * FROM trade_authorizations WHERE trade_id=? AND step=?').get(id,step) as unknown as AuthorizationRow|undefined:undefined;}
  bind(row:TradeRow,epoch:number,permitDigest:string,intentDigest:string){
    this.db.prepare('INSERT INTO trade_packages VALUES(?,?,?,?,?,?,?,?,?)').run(row.id,row.version!,row.user_id,row.wallet,row.session_id,epoch,permitDigest,intentDigest,this.now());this.event(row,'QUOTE_PREPARED');
  }
  event(row:Pick<TradeRow,'id'|'version'>,kind:string){if(!/^[A-Z_]{1,64}$/.test(kind))throw new AppError('TRADE_STATE');this.db.prepare('INSERT INTO trade_authorization_events(trade_id,version,kind,at) VALUES(?,?,?,?)').run(row.id,row.version!,kind,this.now());}
  events(id:string){return this.ready()?this.db.prepare('SELECT kind,at FROM trade_authorization_events WHERE trade_id=? ORDER BY id').all(id):[];}
  reserve(row:TradeRow,step:SignatureStep,digest:string){this.db.exec('BEGIN IMMEDIATE');try{
    const current=this.db.prepare('SELECT * FROM trade_sessions WHERE id=?').get(row.id) as unknown as TradeRow;
    if(current.state!=='SIGNATURES'||current.version!==row.version||current.expires_at<=this.now()||this.row(row.id,step))throw new AppError('PERMIT_LOCKED');
    assertFinancialAvailable(this.db,row.user_id,row.wallet,row.id);
    if(step==='intent'&&this.row(row.id,'permit')?.state!=='SIGNED')throw new AppError('INVALID_PERMIT');
    const p=this.package(row.id);if(!p||p.version!==row.version||digest!==(step==='permit'?p.permit_digest:p.intent_digest))throw new AppError('QUOTE_BINDING_MISMATCH');
    this.db.prepare("INSERT INTO trade_authorizations(trade_id,version,step,digest,state,requested_at,code) VALUES(?,?,?,?,'REQUESTING',?,'PENDING')").run(row.id,row.version!,step,digest,this.now());
    this.event(row,step.toUpperCase()+'_REQUEST_RESERVED');this.db.exec('COMMIT');
  }catch(e){this.db.exec('ROLLBACK');throw e;}}
  capture(row:TradeRow,step:SignatureStep,cipher:string,quoteExpired:boolean,signatureExpired:boolean){this.db.exec('BEGIN IMMEDIATE');try{
    const result=this.db.prepare("UPDATE trade_authorizations SET encrypted_response=?,received_at=?,state='CAPTURED',code='PENDING',quote_expired=?,signature_expired=? WHERE trade_id=? AND version=? AND step=? AND encrypted_response IS NULL AND state IN ('REQUESTING','RESULT_UNKNOWN','REJECTED')").run(cipher,this.now(),Number(quoteExpired),Number(signatureExpired),row.id,row.version!,step);
    if(result.changes!==1)throw new AppError('PERMIT_LOCKED');this.event(row,step.toUpperCase()+'_CALLBACK_CAPTURED');this.db.exec('COMMIT');
  }catch(e){this.db.exec('ROLLBACK');throw e;}}
  checked(row:TradeRow,step:SignatureStep,valid:boolean,code:string,chain:string){this.db.exec('BEGIN IMMEDIATE');try{
    if(this.db.prepare("UPDATE trade_authorizations SET crypto_valid=?,state=?,code=?,chain_status=? WHERE trade_id=? AND version=? AND step=? AND state='CAPTURED'").run(Number(valid),valid?'SIGNED':'INVALID',code,chain,row.id,row.version!,step).changes===1)this.event(row,step.toUpperCase()+(valid?'_SIGNED':'_INVALID'));
    this.db.exec('COMMIT');
  }catch(e){this.db.exec('ROLLBACK');throw e;}}
  failed(row:TradeRow,step:SignatureStep,rejected:boolean){this.db.exec('BEGIN IMMEDIATE');try{
    if(this.db.prepare("UPDATE trade_authorizations SET state=?,code=? WHERE trade_id=? AND version=? AND step=? AND state='REQUESTING' AND encrypted_response IS NULL").run(rejected?'REJECTED':'RESULT_UNKNOWN',rejected?'USER_REJECTED':'RESULT_UNKNOWN',row.id,row.version!,step).changes===1)this.event(row,step.toUpperCase()+(rejected?'_REJECTED':'_RESULT_UNKNOWN'));
    this.db.exec('COMMIT');
  }catch(e){this.db.exec('ROLLBACK');throw e;}}
  assertAvailable(row:TradeRow){assertFinancialAvailable(this.db,row.user_id,row.wallet,row.id);}
}
