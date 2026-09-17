import type { DatabaseSync } from "node:sqlite";

export function migrateAlerts(db: DatabaseSync): void {
  if (db.prepare("SELECT version FROM schema_migrations WHERE version=2").get()) return;
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(`
      CREATE TABLE alerts (
        id TEXT PRIMARY KEY, telegram_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        network TEXT NOT NULL CHECK(network='sepolia'), from_token TEXT NOT NULL, to_token TEXT NOT NULL,
        base TEXT NOT NULL, quote TEXT NOT NULL, amount TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('RATE_ABOVE','RATE_BELOW','QUOTE_AVAILABLE','RATE_MOVEMENT','MARKET_RECOVERY')),
        threshold TEXT, window_seconds INTEGER,
        status TEXT NOT NULL DEFAULT 'active' CHECK(status='active'),
        created_at INTEGER NOT NULL, last_evaluated_at INTEGER, last_observation_at INTEGER,
        last_triggered_at INTEGER, cooldown_until INTEGER NOT NULL DEFAULT 0,
        last_condition INTEGER CHECK(last_condition IN (0,1)), evaluation_status TEXT NOT NULL DEFAULT 'WAITING_FIRST_SAMPLE',
        sequence INTEGER NOT NULL DEFAULT 0, fingerprint TEXT NOT NULL, creation_nonce TEXT NOT NULL,
        UNIQUE(telegram_user_id,fingerprint), UNIQUE(telegram_user_id,creation_nonce)
      );
      CREATE INDEX alerts_owner ON alerts(telegram_user_id,created_at,id);
      CREATE TABLE market_observations (
        id TEXT PRIMARY KEY, market_key TEXT NOT NULL, network TEXT NOT NULL,
        from_token TEXT NOT NULL, to_token TEXT NOT NULL, base TEXT NOT NULL, quote TEXT NOT NULL,
        amount TEXT NOT NULL, observed_at INTEGER NOT NULL, available INTEGER NOT NULL,
        rate TEXT, output TEXT, gas_usd TEXT, expires_at INTEGER,
        UNIQUE(market_key,observed_at)
      );
      CREATE INDEX observations_baseline ON market_observations(market_key,observed_at);
      CREATE TABLE alert_triggers (
        id TEXT PRIMARY KEY, alert_id TEXT NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
        sequence INTEGER NOT NULL, reason TEXT NOT NULL, triggered_at INTEGER NOT NULL,
        payload TEXT NOT NULL, UNIQUE(alert_id,sequence)
      );
      CREATE TABLE delivery_outbox (
        id TEXT PRIMARY KEY, trigger_id TEXT NOT NULL UNIQUE REFERENCES alert_triggers(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','delivering','sent','failed','expired')),
        attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER NOT NULL,
        lease_until INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, sent_at INTEGER, last_error TEXT
      );
      CREATE INDEX outbox_due ON delivery_outbox(status,next_attempt_at,lease_until);
      INSERT INTO schema_migrations(version) VALUES(2);
    `);
    db.exec("COMMIT");
  } catch (e) { db.exec("ROLLBACK"); throw e; }
}
