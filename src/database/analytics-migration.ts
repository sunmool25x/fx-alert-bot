import type { DatabaseSync } from "node:sqlite";
export function migrateAnalytics(db:DatabaseSync,now:number){
  if(db.prepare("SELECT 1 FROM schema_migrations WHERE version=6").get())return;
  db.exec("BEGIN IMMEDIATE");
  try{
    db.exec(`CREATE TABLE analytics_state (id INTEGER PRIMARY KEY CHECK(id=1),tracking_since INTEGER NOT NULL);
      CREATE TABLE user_attribution (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        first_source TEXT NOT NULL,latest_source TEXT NOT NULL,first_start_at INTEGER,latest_start_at INTEGER);
      CREATE TABLE analytics_events (id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        event_name TEXT NOT NULL,source TEXT NOT NULL,origin TEXT NOT NULL CHECK(origin IN ('command','button','natural_language')),
        entry TEXT NOT NULL CHECK(entry IN ('none','quote','alpha','alert','direct_swap')),
        entity_id TEXT,parent_id TEXT,metadata_json TEXT NOT NULL DEFAULT '{}',created_at INTEGER NOT NULL,dedupe_key TEXT UNIQUE);
      CREATE INDEX analytics_period ON analytics_events(created_at,event_name,user_id);
      CREATE INDEX analytics_owner ON analytics_events(user_id,created_at);
      CREATE INDEX analytics_entity ON analytics_events(event_name,entity_id);
      ALTER TABLE alert_input_origins ADD COLUMN entry TEXT NOT NULL DEFAULT 'none';
      ALTER TABLE alert_input_origins ADD COLUMN parent_id TEXT;
      ALTER TABLE quote_input_origins ADD COLUMN parent_id TEXT;
      INSERT INTO schema_migrations VALUES(6);`);
    db.prepare("INSERT INTO analytics_state VALUES(1,?)").run(now);db.exec("COMMIT");
  }catch(e){db.exec("ROLLBACK");throw e;}
}
