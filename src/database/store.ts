import { ClaimStore,migrateClaims } from "./claims.js";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";
import { migrateAlerts } from "./alert-migration.js";
import { SqliteAlertStore, type AlertStore } from "./alerts.js";
import type { AlertDraft } from "../alerts/types.js";
import { migrateScanner, SqliteScannerStore, type ScannerStore } from "./scanner.js";
import { migrateWallet, WalletStore } from "./wallet.js";
import { InputOrigins } from "./input-origins.js";
import type { ActionOrigin } from "../nlu/parser.js";
import { AnalyticsStore } from "../analytics/store.js";
import { migrateAnalytics } from "./analytics-migration.js";
import type { Entry } from "../analytics/types.js";
import {ContinuationStore,migrateContinuations} from './continuations.js';
import {continuationLog} from '../wallet/continuation-log.js';
import{PermitStore,migratePermits,migratePermitReconciliation,migratePermitEvidence,migratePermitRetirements}from'./permits.js';
import{migrateInvalidPermitRetirement}from'./permit-domain-migration.js';

export type Language = "ko" | "en";
export interface User { id: string; language: Language; source: string | null; created_at: number; last_seen_at: number }
export type Operation = "rate" | "quote" | "swap" | "liquidity" | "forget" | "alert";
export interface Flow {
  analyticsEntry?:Entry;
  analyticsParent?:string;
  inputOrigin?:ActionOrigin;
  operation: Operation; stage: "from" | "to" | "amount" | "type" | "threshold" | "window" | "confirm"; nonce: string;
  from?: string; to?: string; choices: string[];
  alert?: AlertDraft;
}
export interface QuoteIntent { id: string; user_id: string; from_token: string; to_token: string; amount: string; expires_at: number; origin:string }
export interface Store {
  readonly permits:PermitStore;
  readonly continuations:ContinuationStore;
  readonly analytics:AnalyticsStore;
  readonly inputOrigins:InputOrigins;
  readonly wallet: WalletStore;
  readonly claims: ClaimStore;
  readonly alerts: AlertStore;
  readonly scanner: ScannerStore;
  touch(id: string, source?: string): Promise<User>;
  user(id: string): Promise<User | undefined>;
  language(id: string, language: Language): Promise<void>;
  flow(id: string): Promise<Flow | undefined>;
  saveFlow(id: string, flow: Flow): Promise<void>;
  clearFlow(id: string): Promise<void>;
  saveIntent(id: string, from: string, to: string, amount: string, origin?:string,inputOrigin?:ActionOrigin): Promise<string>;
  intent(id: string, user: string): Promise<QuoteIntent | undefined>;
  forget(id: string): Promise<void>;
}
export const shortId = () => randomBytes(8).toString("base64url");
export class SqliteStore implements Store {
  readonly permits:PermitStore;
  readonly continuations:ContinuationStore;
  readonly analytics:AnalyticsStore;
  readonly inputOrigins:InputOrigins;
  readonly wallet: WalletStore;
  readonly claims: ClaimStore;
  private db: DatabaseSync;
  readonly alerts: SqliteAlertStore;
  readonly scanner: SqliteScannerStore;
  constructor(path: string, private ttlMs = 900000, private now = Date.now) {
    const existed = path !== ":memory:" && existsSync(path);
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
    this.db.exec("CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY);");
    if(existed && !this.db.prepare("SELECT 1 FROM schema_migrations WHERE version=6").get()) {
      const backup=path+".before-phase6-"+Date.now()+"-"+shortId()+".sqlite";
      try{this.db.exec("VACUUM INTO '"+backup.replaceAll("'","''")+"'");}catch(e){this.db.close();throw e;}
    }
    if(existed && !this.db.prepare("SELECT 1 FROM schema_migrations WHERE version=4").get()) {
      // Consistent SQLite backup includes committed WAL data; fail closed if backup fails.
      const backup = path + ".before-phase4-" + Date.now() + "-" + shortId() + ".sqlite";
      this.db.exec("VACUUM INTO '" + backup.replaceAll("'", "''") + "'");
    }
    const version = this.db.prepare("SELECT version FROM schema_migrations WHERE version=1").get();
    if (!version) {
      this.db.exec(`BEGIN IMMEDIATE;
        CREATE TABLE users (
          id TEXT PRIMARY KEY, language TEXT NOT NULL DEFAULT 'ko' CHECK(language IN ('ko','en')),
          source TEXT, created_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL
        );
        CREATE TABLE conversations (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          state TEXT NOT NULL, expires_at INTEGER NOT NULL
        );
        CREATE TABLE quote_intents (
          id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          from_token TEXT NOT NULL, to_token TEXT NOT NULL, amount TEXT NOT NULL,
          expires_at INTEGER NOT NULL
        );
        CREATE INDEX quote_intent_expiry ON quote_intents(expires_at);
        INSERT INTO schema_migrations(version) VALUES(1);
        COMMIT;`);
    }
    migrateAlerts(this.db);
    this.alerts = new SqliteAlertStore(this.db, now);
    migrateScanner(this.db);
    this.scanner = new SqliteScannerStore(this.db, now);
    migrateWallet(this.db);
    if(existed && !this.db.prepare("SELECT 1 FROM schema_migrations WHERE version=7").get()){
      const backup=path+".before-phase7b-"+Date.now()+"-"+shortId()+".sqlite";
      this.db.exec("VACUUM INTO '"+backup.replaceAll("'","''")+"'");
    }
    if(existed && this.db.prepare("SELECT 1 FROM schema_migrations WHERE version=7").get() && !this.db.prepare("SELECT 1 FROM schema_migrations WHERE version=8").get()) {
      const backup=path+".before-claim-reconciliation-"+Date.now()+"-"+shortId()+".sqlite";
      try{this.db.exec("VACUUM INTO '"+backup.replaceAll("'","''")+"'");}catch(e){this.db.close();throw e;}
    }
    migrateClaims(this.db);
    this.claims=new ClaimStore(this.db,now);
    this.inputOrigins=new InputOrigins(this.db);
    migrateAnalytics(this.db,now());
    this.analytics=new AnalyticsStore(this.db,now);
    this.wallet = new WalletStore(this.db,now,()=>this.analytics.reconcile());
    if(existed&&!this.db.prepare('SELECT 1 FROM schema_migrations WHERE version=9').get()){
      const backup=path+'.before-phase7h-'+Date.now()+'-'+shortId()+'.sqlite';
      this.db.exec("VACUUM INTO '"+backup.replaceAll("'","''")+"'");
    }
    migrateContinuations(this.db);this.continuations=new ContinuationStore(this.db,now);
    if(existed&&!this.db.prepare('SELECT 1 FROM schema_migrations WHERE version=10').get()){
      const backup=path+'.before-phase7i-'+Date.now()+'-'+shortId()+'.sqlite';this.db.exec("VACUUM INTO '"+backup.replaceAll("'","''")+"'");
    }
    migratePermits(this.db);
    if(existed&&!this.db.prepare('SELECT 1 FROM schema_migrations WHERE version=11').get()){
      const backup=path+'.before-phase7j-'+Date.now()+'-'+shortId()+'.sqlite';this.db.exec("VACUUM INTO '"+backup.replaceAll("'","''")+"'");
    }
    migratePermitReconciliation(this.db);
    if(existed&&!this.db.prepare('SELECT 1 FROM schema_migrations WHERE version=12').get()){
      const backup=path+'.before-permit-evidence-'+Date.now()+'-'+shortId()+'.sqlite';this.db.exec("VACUUM INTO '"+backup.replaceAll("'","''")+"'");
    }
    migratePermitEvidence(this.db);
    if(existed&&!this.db.prepare('SELECT 1 FROM schema_migrations WHERE version=13').get()){
      const backup=path+'.before-phase7k-'+Date.now()+'-'+shortId()+'.sqlite';this.db.exec("VACUUM INTO '"+backup.replaceAll("'","''")+"'");
    }
    migratePermitRetirements(this.db);
    if(existed&&!this.db.prepare('SELECT 1 FROM schema_migrations WHERE version=14').get()){
      const backup=path+'.before-phase7l-'+Date.now()+'-'+shortId()+'.sqlite';this.db.exec("VACUUM INTO '"+backup.replaceAll("'","''")+"'");
    }
    migrateInvalidPermitRetirement(this.db);this.permits=new PermitStore(this.db,now);
  }
  async touch(id: string, source?: string): Promise<User> {
    if (!/^\d{1,20}$/.test(id)) throw new Error("Invalid user reference");
    const s = source && /^source_[A-Za-z0-9_-]{1,40}$/.test(source) ? source : null;
    this.db.prepare(`INSERT INTO users(id,source,created_at,last_seen_at) VALUES(?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET last_seen_at=excluded.last_seen_at`).run(id, s, this.now(), this.now());
    return (await this.user(id))!;
  }
  async user(id: string): Promise<User | undefined> {
    return this.db.prepare("SELECT * FROM users WHERE id=?").get(id) as unknown as User | undefined;
  }
  async language(id: string, language: Language) {
    this.db.prepare("UPDATE users SET language=? WHERE id=?").run(language, id);
  }
  async flow(id: string): Promise<Flow | undefined> {
    const row = this.db.prepare("SELECT state,expires_at FROM conversations WHERE user_id=?").get(id);
    if (!row) return undefined;
    if (Number(row.expires_at) <= this.now()) { await this.clearFlow(id); return undefined; }
    return JSON.parse(String(row.state)) as Flow;
  }
  async saveFlow(id: string, flow: Flow) {
    this.db.prepare(`INSERT INTO conversations(user_id,state,expires_at) VALUES(?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET state=excluded.state,expires_at=excluded.expires_at`)
      .run(id, JSON.stringify(flow), this.now() + this.ttlMs);
  }
  async clearFlow(id: string) { this.db.prepare("DELETE FROM conversations WHERE user_id=?").run(id); }
  async saveIntent(user: string, from: string, to: string, amount: string, origin="quote",inputOrigin?:ActionOrigin): Promise<string> {
    // Bound retention for old quote-button intents; no signatures/private keys/API credentials stored.
    this.db.prepare("DELETE FROM quote_intents WHERE expires_at<=?").run(this.now());
    const id = shortId();
    this.db.prepare("INSERT INTO quote_intents VALUES(?,?,?,?,?,?,?)")
      .run(id, user, from, to, amount, this.now() + this.ttlMs,origin);
    this.continuations.ensure((await this.intent(id,user))!,this.now());continuationLog('RECORDED','OK',user,id);
    if(inputOrigin)this.inputOrigins.set("quote",id,inputOrigin);
    return id;
  }
  async intent(id: string, user: string): Promise<QuoteIntent | undefined> {
    return this.db.prepare("SELECT * FROM quote_intents WHERE id=? AND user_id=? AND expires_at>?")
      .get(id, user, this.now()) as unknown as QuoteIntent | undefined;
  }
  async forget(id: string) { this.permits.forget(id); this.claims.forget(id); this.wallet.forget(id); this.db.prepare("DELETE FROM users WHERE id=?").run(id); }
  close() { this.db.close(); }
}
