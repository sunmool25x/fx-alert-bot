import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, isAbsolute } from "node:path";
import { SqliteStore } from "../src/database/store.js";
import { evaluate } from "../src/alerts/evaluate.js";
import { marketKey } from "../src/alerts/types.js";
import { NOW } from "./helpers.js";
import { spec, observation, createAlert } from "./alert-helpers.js";

test("migration upgrades real version 1 schema without replacing Phase 1 records", async () => {
  const root = realpathSync(tmpdir()), dir = mkdtempSync(join(root, "sera-alert-upgrade-")), path = join(dir, "bot.sqlite");
  let store: SqliteStore | undefined;
  try {
    const db = new DatabaseSync(path);
    db.exec(`CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY); INSERT INTO schema_migrations VALUES(1);
      CREATE TABLE users(id TEXT PRIMARY KEY,language TEXT,source TEXT,created_at INTEGER,last_seen_at INTEGER);
      CREATE TABLE conversations(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,state TEXT,expires_at INTEGER);
      CREATE TABLE quote_intents(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id) ON DELETE CASCADE,from_token TEXT,to_token TEXT,amount TEXT,expires_at INTEGER);
      INSERT INTO users VALUES('1','en','source_existing',1,2);
      INSERT INTO conversations VALUES('1','{"operation":"quote","stage":"amount","nonce":"old","choices":[]}',9999999999999);`);
    db.close(); store = new SqliteStore(path);
    assert.equal((await store.user("1"))?.language, "en"); assert.equal((await store.flow("1"))?.nonce, "old");
    await createAlert(store); assert.equal((await store.alerts.list("1")).length, 1);
  } finally {
    store?.close();
    const rel = relative(root, realpathSync(dir)); assert(!isAbsolute(rel) && !rel.startsWith(".."));
    rmSync(dir, { recursive: true });
  }
});
test("alerts, history, cooldown, trigger and delivery lease survive restart; stale leases cannot mark success", async () => {
  const root = realpathSync(tmpdir()), dir = mkdtempSync(join(root, "sera-alert-restart-")), path = join(dir, "bot.sqlite");
  let now = NOW, store = new SqliteStore(path, 900000, () => now);
  try {
    const a = await createAlert(store, {}, "1", false), o = observation("0.91");
    await store.alerts.record(o);
    const trigger = await store.alerts.apply(a.id, o, evaluate(a, o), 3600000); assert(trigger);
    assert.equal(await store.alerts.apply(a.id, o, evaluate(a, o), 3600000), undefined);
    const first = (await store.alerts.claim(900000, 8))!; assert(first);
    store.close(); store = new SqliteStore(path, 900000, () => now);
    assert.equal((await store.alerts.get(a.id, "1"))?.last_condition, 1);
    assert.equal((await store.alerts.get(a.id, "1"))?.cooldown_until, NOW + 3600000);
    assert.equal((await store.alerts.nearest(marketKey(spec), NOW, 1000, NOW + 1))?.rate, "0.91");
    assert.equal(await store.alerts.claim(900000, 8), undefined);
    now += 120001;
    const recovered = (await store.alerts.claim(900000, 8))!; assert.equal(recovered.id, first.id); assert.equal(recovered.attempts, 2);
    await store.alerts.sent(first); assert.equal(await store.alerts.lastDelivery(a.id, "1"), "delivering");
    await store.alerts.sent(recovered); assert.equal(await store.alerts.lastDelivery(a.id, "1"), "sent");
    assert.equal(await store.alerts.claim(900000, 8), undefined);
  } finally {
    store.close(); const rel = relative(root, realpathSync(dir)); assert(!isAbsolute(rel) && !rel.startsWith(".."));
    rmSync(dir, { recursive: true });
  }
});
test("duplicate creation, ownership, per-user limits, deletion and forget cascade pending notifications", async () => {
  const store = new SqliteStore(":memory:", 900000, () => NOW);
  try {
    const a = await createAlert(store, {}, "1", false);
    const again = await createAlert(store); assert.equal(again.id, a.id);
    await createAlert(store, {}, "2");
    assert.equal((await store.alerts.list("2")).length, 1); assert.equal(await store.alerts.get(a.id, "2"), undefined);
    assert.equal(await store.alerts.delete(a.id, "2"), false);
    await assert.rejects(store.alerts.create("1", { ...spec, threshold: "2" }, "new", undefined, 1, 100), { message: "ALERT_LIMIT" });
    const o = observation("0.91"); await store.alerts.apply(a.id, o, evaluate(a, o), 1000);
    const d = (await store.alerts.claim(900000, 8))!; assert(d);
    assert.equal(await store.alerts.delete(a.id, "1"), true); assert.equal(await store.alerts.deliveryActive(d), false);
    assert.equal(await store.alerts.lastDelivery(a.id, "1"), undefined);
    await store.forget("2"); assert.equal((await store.alerts.active()).length, 0);
  } finally { store.close(); }
});
test("historical nearest observation has bounded tolerance, ignores unavailable/wrong-size/future samples", async () => {
  const store = new SqliteStore(":memory:");
  try {
    for (const o of [observation("0.9", NOW - 21600000 - 20000), observation("0.91", NOW - 21600000 + 10000),
      observation(null, NOW - 21600000), observation("0.99", NOW - 21600000, { amount: "1000" }), observation("1", NOW)]) await store.alerts.record(o);
    assert.equal((await store.alerts.nearest(marketKey(spec), NOW - 21600000, 300000, NOW))?.rate, "0.91");
    assert.equal(await store.alerts.nearest(marketKey(spec), NOW - 21600000, 9999, NOW), undefined);
    assert.equal(await store.alerts.nearest(marketKey(spec), NOW, 1000, NOW), undefined);
    await store.alerts.prune(NOW - 1000, NOW - 30 * 86400000);
    assert.equal(await store.alerts.nearest(marketKey(spec), NOW - 21600000, 300000, NOW), undefined);
  } finally { store.close(); }
});
test("outbox expires old events and bounded retries fail closed", async () => {
  let now = NOW; const store = new SqliteStore(":memory:", 900000, () => now);
  try {
    const a = await createAlert(store, {}, "1", false), o = observation("0.91");
    await store.alerts.apply(a.id, o, evaluate(a, o), 1000);
    const d = (await store.alerts.claim(900000, 1))!; await store.alerts.retry(d, "TEMPORARY", 0, false);
    assert.equal(await store.alerts.claim(900000, 1), undefined); assert.equal(await store.alerts.lastDelivery(a.id, "1"), "failed");
    const b = await createAlert(store, { threshold: "0.88" }, "1", false);
    await store.alerts.apply(b.id, o, evaluate(b, o), 1000);
    now += 900000; assert.equal(await store.alerts.claim(900000, 8), undefined);
    assert.equal(await store.alerts.lastDelivery(b.id, "1"), "expired");
  } finally { store.close(); }
});
test("outbox insertion failure rolls back the crossing and trigger, allowing a safe retry", async () => {
  const root = realpathSync(tmpdir()), dir = mkdtempSync(join(root, "sera-alert-atomic-")), path = join(dir, "bot.sqlite");
  const store = new SqliteStore(path, 900000, () => NOW), db = new DatabaseSync(path);
  try {
    const a = await createAlert(store, {}, "1", false), o = observation("0.91");
    db.exec("CREATE TRIGGER fail_outbox BEFORE INSERT ON delivery_outbox BEGIN SELECT RAISE(ABORT,'injected failure'); END;");
    await assert.rejects(store.alerts.apply(a.id, o, evaluate(a, o), 60000));
    assert.equal((await store.alerts.get(a.id, "1"))?.last_condition, 0);
    assert.equal((await store.alerts.get(a.id, "1"))?.sequence, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM alert_triggers").get()!.n, 0);
    db.exec("DROP TRIGGER fail_outbox;");
    assert(await store.alerts.apply(a.id, o, evaluate(a, o), 60000));
    assert(await store.alerts.claim(900000, 8));
  } finally {
    db.close(); store.close(); const rel = relative(root, realpathSync(dir)); assert(!isAbsolute(rel) && !rel.startsWith(".."));
    rmSync(dir, { recursive: true });
  }
});
