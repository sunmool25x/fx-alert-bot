import type {DatabaseSync} from 'node:sqlite';
import type {QuoteIntent} from './store.js';
import {AppError} from '../utils/errors.js';
export interface Continuation extends QuoteIntent {
  chain_id:11155111;recipient_mode:'VERIFIED_WALLET';created_at:number;
  state:'PENDING'|'REVIEWED'|'CANCELLED';selected:number;
  reviewed_at:number|null;review_session_id:string|null;review_epoch:number|null;
}
export function migrateContinuations(db:DatabaseSync){
  if(db.prepare('SELECT 1 FROM schema_migrations WHERE version=9').get())return;
  db.exec(`BEGIN IMMEDIATE;
    CREATE TABLE quote_continuations(
      id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      from_token TEXT NOT NULL,to_token TEXT NOT NULL,amount TEXT NOT NULL,origin TEXT NOT NULL,
      chain_id INTEGER NOT NULL CHECK(chain_id=11155111),recipient_mode TEXT NOT NULL CHECK(recipient_mode='VERIFIED_WALLET'),
      created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,state TEXT NOT NULL CHECK(state IN ('PENDING','REVIEWED','CANCELLED')),
      selected INTEGER NOT NULL CHECK(selected IN (0,1)),reviewed_at INTEGER,review_session_id TEXT,review_epoch INTEGER);
    CREATE UNIQUE INDEX one_selected_quote_continuation ON quote_continuations(user_id) WHERE selected=1;
    CREATE INDEX continuation_expiry ON quote_continuations(expires_at);
    INSERT INTO schema_migrations VALUES(9);COMMIT;`);
}
/** Selection comes only from the explicit Telegram Continue callback, never latest-amount inference. */
export class ContinuationStore {
  constructor(private db:DatabaseSync,private now=Date.now){}
  ensure(intent:QuoteIntent,createdAt=this.now()){
    this.db.prepare(`INSERT OR IGNORE INTO quote_continuations(id,user_id,from_token,to_token,amount,origin,chain_id,recipient_mode,created_at,expires_at,state,selected)
      VALUES(?,?,?,?,?,?,11155111,'VERIFIED_WALLET',?,?,'PENDING',0)`).run(intent.id,intent.user_id,intent.from_token,intent.to_token,intent.amount,intent.origin,createdAt,intent.expires_at);
  }
  get(id:string,user:string){return this.db.prepare("SELECT * FROM quote_continuations WHERE id=? AND user_id=? AND expires_at>? AND state!='CANCELLED'").get(id,user,this.now()) as unknown as Continuation|undefined;}
  pending(user:string){return this.db.prepare("SELECT * FROM quote_continuations WHERE user_id=? AND selected=1 AND expires_at>? AND state!='CANCELLED'").get(user,this.now()) as unknown as Continuation|undefined;}
  cancelled(id:string,user:string){return !!this.db.prepare("SELECT 1 FROM quote_continuations WHERE id=? AND user_id=? AND state='CANCELLED'").get(id,user);}
  select(id:string,user:string){
    this.db.exec('BEGIN IMMEDIATE');try{
      if(!this.get(id,user))throw new AppError('TRADE_STATE');
      this.db.prepare('UPDATE quote_continuations SET selected=0 WHERE user_id=? AND selected=1').run(user);
      this.db.prepare('UPDATE quote_continuations SET selected=1 WHERE id=? AND user_id=?').run(id,user);this.db.exec('COMMIT');
    }catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  reviewed(id:string,user:string,session:string,epoch:number){
    const changed=this.db.prepare("UPDATE quote_continuations SET state='REVIEWED',reviewed_at=?,review_session_id=?,review_epoch=? WHERE id=? AND user_id=? AND expires_at>? AND state!='CANCELLED'").run(this.now(),session,epoch,id,user,this.now()).changes;
    if(changed!==1)throw new AppError('TRADE_STATE');
  }
  cancel(id:string,user:string){
    if(!this.get(id,user))throw new AppError('TRADE_STATE');
    this.db.prepare("UPDATE quote_continuations SET state='CANCELLED',selected=0 WHERE id=? AND user_id=?").run(id,user);
  }
}
