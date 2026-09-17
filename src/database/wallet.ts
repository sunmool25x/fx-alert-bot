import type { DatabaseSync } from "node:sqlite";
import { randomBytes, createHash } from "node:crypto";
import { AppError } from "../utils/errors.js";
export const secret = () => randomBytes(32).toString("hex");
export const digest = (v: string) => createHash("sha256").update(v).digest("hex");
export type TradeState = "DRAFT" | "REVIEW" | "SIGNATURES" | "SUBMITTING" | "PENDING" | "CONFIRMED" | "FAILED" | "EXPIRED" | "CANCELLED" | "UNKNOWN" | "UNKNOWN_REORG";
export interface Session { id: string; user_id: string; csrf: string; expires_at: number; wallet: string | null; epoch:number }
export interface TradeRow {
  id: string; user_id: string; session_id: string; wallet: string; chain_id: number;
  origin: string; intent_id: string; state: TradeState; version: string | null; payload: string | null;
  quote_id: string | null; expires_at: number; created_at: number; confirmed_at: number | null;
  submitted_at: number | null; trade_id: string | null; tx_hash: string | null;
  start_block: string | null; cursor_block: string | null; evidence: string | null;
  next_check: number; checks: number; notified: number; error_code: string | null;
}
export function migrateWallet(db: DatabaseSync) {
  if (db.prepare("SELECT 1 FROM schema_migrations WHERE version=4").get()) return;
  db.exec(`BEGIN IMMEDIATE;
    ALTER TABLE quote_intents ADD COLUMN origin TEXT NOT NULL DEFAULT 'quote';
    CREATE TABLE wallet_links(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,address TEXT NOT NULL,verified_at INTEGER NOT NULL);
    CREATE TABLE wallet_quarantine(address TEXT PRIMARY KEY,reason TEXT NOT NULL,created_at INTEGER NOT NULL);
    CREATE TABLE wallet_sessions(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,csrf TEXT NOT NULL,expires_at INTEGER NOT NULL,wallet TEXT,epoch INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE telegram_auth_replays(hash TEXT PRIMARY KEY,expires_at INTEGER NOT NULL);
    CREATE TABLE wallet_challenges(id TEXT PRIMARY KEY,session_id TEXT NOT NULL REFERENCES wallet_sessions(id) ON DELETE CASCADE,address TEXT NOT NULL,message TEXT NOT NULL,expires_at INTEGER NOT NULL);
    CREATE TABLE trade_sessions(
      id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,session_id TEXT NOT NULL,
      wallet TEXT NOT NULL,chain_id INTEGER NOT NULL CHECK(chain_id=11155111),origin TEXT NOT NULL,intent_id TEXT NOT NULL,
      state TEXT NOT NULL,version TEXT,payload TEXT,quote_id TEXT UNIQUE,expires_at INTEGER NOT NULL,created_at INTEGER NOT NULL,
      confirmed_at INTEGER,submitted_at INTEGER,trade_id TEXT,tx_hash TEXT,start_block TEXT,cursor_block TEXT,evidence TEXT,
      next_check INTEGER NOT NULL DEFAULT 0,checks INTEGER NOT NULL DEFAULT 0,notified INTEGER NOT NULL DEFAULT 0,error_code TEXT);
    CREATE UNIQUE INDEX one_active_wallet_trade ON trade_sessions(wallet) WHERE state IN ('DRAFT','REVIEW','SIGNATURES','SUBMITTING','PENDING','UNKNOWN');
    CREATE TABLE trade_attempts(trade_session_id TEXT PRIMARY KEY REFERENCES trade_sessions(id) ON DELETE CASCADE,attempted_at INTEGER NOT NULL);
    INSERT INTO schema_migrations VALUES(4); COMMIT;`);
}
export class WalletStore {
  constructor(private db: DatabaseSync, private now = Date.now,private observe?:()=>void) {}
  private observed(){try{if(!this.db.isTransaction)this.observe?.();}catch{/* Reporting cannot change financial outcomes. */}}
  session(token: string) { return this.db.prepare("SELECT * FROM wallet_sessions WHERE id=? AND expires_at>?").get(digest(token), this.now()) as unknown as Session | undefined; }
  current(s:Session) {
    const row=this.db.prepare("SELECT * FROM wallet_sessions WHERE id=? AND user_id=? AND expires_at>?").get(s.id,s.user_id,this.now()) as unknown as Session|undefined;
    if(!row)throw new AppError("AUTH_STALE");return row;
  }
  newSession(user: string, authHash: string, ttl: number) {
    const token = secret(), csrf = secret();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare("DELETE FROM telegram_auth_replays WHERE expires_at<=?").run(this.now());
      this.db.prepare("DELETE FROM wallet_sessions WHERE expires_at<=?").run(this.now());
      this.db.prepare("INSERT INTO telegram_auth_replays VALUES(?,?)").run(authHash, this.now()+600000);
      // A new browser session must prove wallet ownership again.
      this.db.prepare("INSERT INTO wallet_sessions(id,user_id,csrf,expires_at,wallet) VALUES(?,?,?,?,NULL)").run(digest(token),user,digest(csrf),this.now()+ttl);
      this.db.exec("COMMIT"); return {token,csrf};
    } catch { this.db.exec("ROLLBACK"); throw new AppError("AUTH_REPLAY"); }
  }
  challenge(session: Session, address: string, message: string) {
    const id = secret();
    this.db.prepare("DELETE FROM wallet_challenges WHERE session_id=? OR expires_at<=?").run(session.id,this.now());
    this.db.prepare("INSERT INTO wallet_challenges VALUES(?,?,?,?,?)").run(id,session.id,address,message,this.now()+120000);
    return id;
  }
  consumeChallenge(session: Session, id: string) {
    return this.db.prepare("DELETE FROM wallet_challenges WHERE id=? AND session_id=? AND expires_at>? RETURNING *")
      .get(id,session.id,this.now()) as {address:string;message:string} | undefined;
  }
  link(session: Session, address: string) {
    if(this.current(session).epoch!==session.epoch)throw new AppError("AUTH_REPLAY");
    this.disconnect(session.user_id);
    this.db.prepare("INSERT INTO wallet_links VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET address=excluded.address,verified_at=excluded.verified_at").run(session.user_id,address,this.now());
    this.db.prepare("UPDATE wallet_sessions SET wallet=? WHERE id=? AND expires_at>?").run(address,session.id,this.now());
  }
  address(user: string) { return this.db.prepare("SELECT address FROM wallet_links WHERE user_id=?").get(user)?.address as string | undefined; }
  disconnect(user: string) {
    this.db.prepare("DELETE FROM wallet_links WHERE user_id=?").run(user);
    this.db.prepare("UPDATE wallet_sessions SET wallet=NULL,epoch=epoch+1 WHERE user_id=?").run(user);
    this.db.prepare("DELETE FROM wallet_challenges WHERE session_id IN (SELECT id FROM wallet_sessions WHERE user_id=?)").run(user);
    this.db.prepare("UPDATE trade_sessions SET state='CANCELLED',version=NULL WHERE user_id=? AND state IN ('DRAFT','REVIEW','SIGNATURES')").run(user);
  }
  expire() { this.db.prepare("UPDATE trade_sessions SET state='EXPIRED',version=NULL WHERE expires_at<=? AND state IN ('DRAFT','REVIEW','SIGNATURES')").run(this.now()); }
  draft(s: Session, intent: string, origin: string) {
    this.expire(); if (!s.wallet) throw new AppError("WALLET_REQUIRED");
    if(this.quarantined(s.wallet))throw new AppError("WALLET_BUSY");
    const id = secret();
    try { this.db.prepare(`INSERT INTO trade_sessions(id,user_id,session_id,wallet,chain_id,origin,intent_id,state,expires_at,created_at)
      VALUES(?,?,?,?,11155111,?,?,'DRAFT',?,?)`).run(id,s.user_id,s.id,s.wallet,origin,intent,this.now()+120000,this.now()); }
    catch { throw new AppError("WALLET_BUSY"); } return this.trade(id,s.user_id)!;
  }
  trade(id: string, user: string) { this.expire(); return this.db.prepare("SELECT * FROM trade_sessions WHERE id=? AND user_id=?").get(id,user) as unknown as TradeRow | undefined; }
  transition(id: string, from: TradeState[], state: TradeState, fields: Partial<TradeRow> = {}) {
    const allowed = new Set(["version","payload","quote_id","expires_at","confirmed_at","submitted_at","trade_id","tx_hash","start_block","cursor_block","evidence","next_check","checks","notified","error_code"]);
    const entries = Object.entries(fields); if(entries.some(([key]) => !allowed.has(key))) throw new Error("Invalid update");
    const changed=this.db.prepare(`UPDATE trade_sessions SET state=?${entries.map(([k])=>`,${k}=?`).join("")} WHERE id=? AND state IN (${from.map(()=>"?").join(",")})`)
      .run(state,...entries.map(([,v])=>v as string|number|null),id,...from).changes === 1;
    if(changed)this.observed();return changed;
  }
  attempt(row: TradeRow, block: string) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      if (!this.transition(row.id,["SIGNATURES"],"SUBMITTING",{submitted_at:this.now(),start_block:block,cursor_block:block})) throw new AppError("TRADE_STATE");
      this.db.prepare("INSERT INTO trade_attempts VALUES(?,?)").run(row.id,this.now()); this.db.exec("COMMIT");
      this.observed();
    } catch(e) {this.db.exec("ROLLBACK");throw e;}
  }
  recover() { this.db.prepare("UPDATE trade_sessions SET state='UNKNOWN',error_code='RESTART_DURING_SUBMIT' WHERE state='SUBMITTING'").run(); }
  quarantined(address:string) {return !!this.db.prepare("SELECT 1 FROM wallet_quarantine WHERE address=?").get(address);}
  reorg(row:TradeRow) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare("INSERT OR IGNORE INTO wallet_quarantine VALUES(?,'FINALIZED_REORG',?)").run(row.wallet,this.now());
      this.db.prepare("UPDATE trade_sessions SET state='CANCELLED',version=NULL WHERE wallet=? AND state IN ('DRAFT','REVIEW','SIGNATURES')").run(row.wallet);
      // Keep any later submitted swap. Quarantine blocks all new actions for this wallet.
      this.db.prepare("UPDATE trade_sessions SET state='UNKNOWN_REORG',cursor_block=start_block,error_code='FINALIZED_REORG',notified=0,next_check=? WHERE id=?").run(this.now(),row.id);
      this.db.exec("COMMIT");
    }catch(e){this.db.exec("ROLLBACK");throw e;}
  }
  pending(user?:string) { return this.db.prepare("SELECT * FROM trade_sessions WHERE (state IN ('PENDING','UNKNOWN','UNKNOWN_REORG','CONFIRMED') OR (state='FAILED' AND submitted_at IS NOT NULL AND notified=0)) AND next_check<=?"+(user?" AND user_id=?":"")+" ORDER BY next_check LIMIT 2").all(this.now(),...(user?[user]:[])) as unknown as TradeRow[]; }
  list(user: string) { this.expire(); return this.db.prepare("SELECT * FROM trade_sessions WHERE user_id=? ORDER BY created_at DESC LIMIT 5").all(user) as unknown as TradeRow[]; }
  forget(user: string) {
    if(this.db.prepare("SELECT 1 FROM trade_sessions WHERE user_id=? AND state IN ('SUBMITTING','PENDING','UNKNOWN','UNKNOWN_REORG')").get(user)) throw new AppError("WALLET_BUSY");
    this.disconnect(user); this.db.prepare("DELETE FROM trade_sessions WHERE user_id=?").run(user);
  }
}
