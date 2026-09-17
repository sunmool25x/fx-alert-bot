import type { DatabaseSync } from "node:sqlite";
import { secret } from "./wallet.js";
import type { Session } from "./wallet.js";
import { claimAssert,ClaimError,type ClaimState } from "../claims/protocol.js";
export interface ClaimRow {id:string;user_id:string;session_id:string;session_epoch:number;wallet:string;origin:string;state:ClaimState;version:string;expires_at:number;created_at:number;payload:string|null;attempted:number;active:number;tx_hash:string|null;error:string|null;balances:string|null;next_check:number;evidence:string|null}
function migrateClaimBase(db:DatabaseSync){
  if(db.prepare("SELECT 1 FROM schema_migrations WHERE version=7").get())return;
  db.exec(`BEGIN IMMEDIATE;
    CREATE TABLE funding_claims(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      session_id TEXT NOT NULL,session_epoch INTEGER NOT NULL,wallet TEXT NOT NULL,origin TEXT NOT NULL,
      state TEXT NOT NULL CHECK(state IN ('CLAIM_PREPARED','CLAIM_SIMULATED','CLAIM_USER_CONFIRMED','CLAIM_WALLET_REQUESTED','CLAIM_BROADCAST','CLAIM_MINED','CLAIM_BALANCES_VERIFIED','CLAIM_FAILED')),
      version TEXT NOT NULL,expires_at INTEGER NOT NULL,created_at INTEGER NOT NULL,payload TEXT,
      attempted INTEGER NOT NULL DEFAULT 0,active INTEGER NOT NULL DEFAULT 1,tx_hash TEXT UNIQUE,error TEXT,balances TEXT,next_check INTEGER NOT NULL DEFAULT 0);
    CREATE UNIQUE INDEX one_funding_claim_per_wallet ON funding_claims(wallet) WHERE active=1;
    CREATE TABLE funding_claim_events(id INTEGER PRIMARY KEY,claim_id TEXT NOT NULL REFERENCES funding_claims(id) ON DELETE CASCADE,state TEXT NOT NULL,at INTEGER NOT NULL);
    INSERT INTO schema_migrations VALUES(7); COMMIT;`);
}
export function migrateClaims(db:DatabaseSync){
  migrateClaimBase(db);
  if(db.prepare('SELECT 1 FROM schema_migrations WHERE version=8').get())return;
  db.exec('BEGIN IMMEDIATE; ALTER TABLE funding_claims ADD COLUMN evidence TEXT; INSERT INTO schema_migrations VALUES(8); COMMIT;');
}
export class ClaimStore {
  constructor(private db:DatabaseSync,private now=Date.now){}
  row(id:string,user:string){return this.db.prepare('SELECT * FROM funding_claims WHERE id=? AND user_id=?').get(id,user) as unknown as ClaimRow|undefined;}
  list(user:string){return this.db.prepare('SELECT * FROM funding_claims WHERE user_id=? ORDER BY created_at DESC LIMIT 5').all(user) as unknown as ClaimRow[];}
  draft(s:Session,origin:string){
    claimAssert(s.wallet,"WALLET_REQUIRED");
    // Only drafts which never reached a wallet can release their lock.
    this.db.prepare("UPDATE funding_claims SET state='CLAIM_FAILED',active=0,error='CLAIM_STALE' WHERE attempted=0 AND active=1 AND expires_at<=?").run(this.now());
    const id=secret();
    try{this.db.prepare("INSERT INTO funding_claims(id,user_id,session_id,session_epoch,wallet,origin,state,version,expires_at,created_at) VALUES(?,?,?,?,?,?,'CLAIM_PREPARED',?,?,?)")
      .run(id,s.user_id,s.id,s.epoch,s.wallet.toLowerCase(),origin,secret(),Math.min(this.now()+120000,s.expires_at),this.now());}
    catch{throw new ClaimError("CLAIM_BUSY");}
    this.db.prepare('INSERT INTO funding_claim_events(claim_id,state,at) VALUES(?,?,?)').run(id,'CLAIM_PREPARED',this.now());
    return this.row(id,s.user_id)!;
  }
  transition(id:string,from:ClaimState[],state:ClaimState,fields:Partial<ClaimRow>={}){
    const allowed=['payload','attempted','active','tx_hash','error','balances','next_check','evidence'];
    const entries=Object.entries(fields);claimAssert(entries.every(([k])=>allowed.includes(k)));
    this.db.exec('BEGIN IMMEDIATE');
    try{
      const changed=this.db.prepare(`UPDATE funding_claims SET state=?${entries.map(([k])=>`,${k}=?`).join('')} WHERE id=? AND state IN (${from.map(()=>'?').join(',')})`)
        .run(state,...entries.map(([,v])=>v as string|number|null),id,...from).changes===1;
      if(changed)this.db.prepare('INSERT INTO funding_claim_events(claim_id,state,at) VALUES(?,?,?)').run(id,state,this.now());
      this.db.exec('COMMIT');return changed;
    }catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  reserveCheck(id:string){return this.db.prepare("UPDATE funding_claims SET next_check=? WHERE id=? AND attempted=1 AND tx_hash IS NOT NULL AND next_check<=? AND state IN ('CLAIM_BROADCAST','CLAIM_MINED','CLAIM_FAILED')").run(this.now()+15000,id,this.now()).changes===1;}
  due(user:string){return this.list(user).filter(r=>r.attempted&&r.tx_hash&&r.next_check<=this.now()&&['CLAIM_BROADCAST','CLAIM_MINED'].includes(r.state));}
  forget(user:string){
    // Preserve potentially submitted transactions, including ambiguous rejection/timeouts.
    claimAssert(!this.db.prepare('SELECT 1 FROM funding_claims WHERE user_id=? AND attempted=1').get(user),'CLAIM_BUSY');
    this.db.prepare('DELETE FROM funding_claims WHERE user_id=?').run(user);
  }
}
