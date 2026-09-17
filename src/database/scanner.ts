import type { DatabaseSync } from "node:sqlite";
import { marketKey, type AlertSpec, type Observation } from "../alerts/types.js";
import type { ScannerProbe } from "../scanner/types.js";

export function migrateScanner(db: DatabaseSync) {
  if (db.prepare("SELECT version FROM schema_migrations WHERE version=3").get()) return;
  db.exec("BEGIN IMMEDIATE");
  try {
    // Bounded public probe summaries; all historical samples remain in market_observations.
    db.exec(`CREATE TABLE scanner_probes (
      id TEXT PRIMARY KEY, spec TEXT, market_key TEXT,
      last_attempt_at INTEGER, last_error TEXT, observed_at INTEGER,
      last_available INTEGER CHECK(last_available IN (0,1)), recovery_at INTEGER
    ); INSERT INTO schema_migrations(version) VALUES(3);`);
    db.exec("COMMIT");
  } catch (e) { db.exec("ROLLBACK"); throw e; }
}
export interface ScannerStore {
  sync(ids: string[]): Promise<void>;
  configure(id: string, spec: AlertSpec): Promise<void>;
  list(): Promise<ScannerProbe[]>;
  failed(id: string, code: string): Promise<void>;
  observed(id: string, observation: Observation, maxGapMs: number): Promise<void>;
}
export class SqliteScannerStore implements ScannerStore {
  constructor(private db: DatabaseSync, private now = Date.now) {}
  async sync(ids: string[]) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const configured = new Set(ids);
      for (const row of this.db.prepare("SELECT id FROM scanner_probes").all())
        if (!configured.has(String(row.id))) this.db.prepare("DELETE FROM scanner_probes WHERE id=?").run(row.id!);
      for (const id of ids) this.db.prepare("INSERT INTO scanner_probes(id) VALUES(?) ON CONFLICT(id) DO NOTHING").run(id);
      this.db.exec("COMMIT");
    } catch (e) { this.db.exec("ROLLBACK"); throw e; }
  }
  async configure(id: string, spec: AlertSpec) {
    const key = marketKey(spec);
    this.db.prepare(`UPDATE scanner_probes SET spec=?,market_key=?,last_attempt_at=NULL,last_error=NULL,
      observed_at=NULL,last_available=NULL,recovery_at=NULL WHERE id=? AND (market_key IS NULL OR market_key<>?)`)
      .run(JSON.stringify(spec), key, id, key);
  }
  async list(): Promise<ScannerProbe[]> {
    return this.db.prepare("SELECT * FROM scanner_probes ORDER BY id").all().map(row => {
      const sample = row.market_key && row.observed_at !== null ? this.db.prepare(
        "SELECT * FROM market_observations WHERE market_key=? AND observed_at=?").get(row.market_key, row.observed_at!) : undefined;
      return { ...row, spec: row.spec ? JSON.parse(String(row.spec)) : null,
        observation: sample ? { ...sample, available: sample.available === 1 } : undefined } as unknown as ScannerProbe;
    });
  }
  async failed(id: string, code: string) {
    // Preserve observed availability. An error cannot manufacture a recovery transition.
    this.db.prepare("UPDATE scanner_probes SET last_attempt_at=?,last_error=? WHERE id=?").run(this.now(), code, id);
  }
  async observed(id: string, observation: Observation, maxGapMs: number) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const state = this.db.prepare("SELECT * FROM scanner_probes WHERE id=? AND market_key=?").get(id, observation.market_key);
      const sample = this.db.prepare("SELECT * FROM market_observations WHERE market_key=? AND observed_at=?")
        .get(observation.market_key, observation.observed_at);
      if (state && sample && (state.observed_at === null || Number(state.observed_at) < observation.observed_at)) {
        const gap = state.observed_at === null ? Infinity : observation.observed_at - Number(state.observed_at);
        const recovery = sample.available === 0 || gap > maxGapMs ? null
          : state.last_available === 0 ? observation.observed_at : state.recovery_at!;
        this.db.prepare(`UPDATE scanner_probes SET last_attempt_at=?,last_error=NULL,observed_at=?,last_available=?,recovery_at=? WHERE id=?`)
          .run(this.now(), observation.observed_at, sample.available!, recovery, id);
      }
      this.db.exec("COMMIT");
    } catch (e) { this.db.exec("ROLLBACK"); throw e; }
  }
}
