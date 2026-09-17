import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, isAbsolute } from "node:path";
import { ScannerCoverage } from "../src/scanner/coverage.js";
import { ScannerService } from "../src/scanner/service.js";
import { AlertMonitor } from "../src/alerts/monitor.js";
import { SqliteStore } from "../src/database/store.js";
import { AppError } from "../src/utils/errors.js";
import { createAlert, observation } from "./alert-helpers.js";
import { NOW, A, B } from "./helpers.js";
import { setupScanner, scannerConfig, seedRate, registerProbe, observeProbe } from "./scanner-helpers.js";

function monitor(a: ReturnType<typeof setupScanner>) {
  return new AlertMonitor(a.store, a.market, a.config, { async send() { assert.fail("Unexpected initial alert"); } },
    a.now, async () => {}, new ScannerCoverage(a.store.scanner, a.market, a.config));
}
test("scanner and 20 matching alerts share one monitor quote; repeated scans perform no upstream work", async () => {
  const a = setupScanner(), worker = monitor(a);
  try {
    for (let i = 1; i <= 20; i++) await createAlert(a.store, {}, String(i));
    await worker.tick(); assert.equal(a.market.calls, 1);
    for (let i = 0; i < 10; i++) assert.equal((await a.service.scan()).results.length, 1);
    assert.equal(a.market.calls, 1);
    assert((await a.store.alerts.active()).every(x => x.last_observation_at === NOW));
  } finally { await worker.stop(); a.store.close(); }
});
test("scanner collects with no users, shares group cap/rotation, and never creates personal subscriptions", async () => {
  const a = setupScanner({ ...scannerConfig({ ALPHA_PROBES: "USDC/EURC:100,USDC/EURC:1000" }), alertMaxGroups: 1 }), worker = monitor(a);
  try {
    await worker.tick(); assert.equal(a.market.calls, 1); assert.equal((await a.service.scan()).waiting, 1);
    a.advance(60001); await worker.tick(); assert.equal(a.market.calls, 2); assert.equal((await a.service.scan()).fresh, 2);
    assert.equal((await a.store.alerts.active()).length, 0); assert.equal(await a.store.user("1"), undefined);
  } finally { await worker.stop(); a.store.close(); }
});
test("API failure hides affected results and cannot turn an available pair into recovery", async () => {
  const a = setupScanner(), worker = monitor(a);
  try {
    await worker.tick(); a.advance(60001); a.market.failure = "UNAVAILABLE"; await worker.tick();
    assert.equal((await a.service.scan()).results.length, 0); assert.equal((await a.service.scan()).errors, 1);
    a.advance(60001); a.market.failure = undefined; await worker.tick();
    assert.equal((await a.service.scan()).results[0]!.primary.signal_type, "QUOTE_AVAILABLE");
  } finally { await worker.stop(); a.store.close(); }
});
test("catalog failures, unsupported pairs and invalid minimum sizes are excluded without quote probes", async () => {
  for (const mode of ["catalog", "unsupported", "minimum", "ambiguous"] as const) {
    const a = setupScanner(scannerConfig({ ALPHA_PROBES: mode === "minimum" ? "USDC/EURC:0.5" : "USDC/EURC:100" })), worker = monitor(a);
    try {
      if (mode === "catalog") a.market.markets = async () => { throw new AppError("UNAVAILABLE"); };
      if (mode === "unsupported") a.market.markets = async () => [];
      if (mode === "ambiguous") a.market.tokens = async () => [A, { ...A, address: "0x" + "3".repeat(40) }, B];
      await worker.tick(); assert.equal(a.market.calls, 0); assert.equal((await a.service.scan()).errors, 1);
      assert.equal((await a.service.scan()).results.length, 0);
    } finally { await worker.stop(); a.store.close(); }
  }
});
test("one failed sample allows verified unaffected samples; known unavailability has a distinct state", async () => {
  const a = setupScanner(scannerConfig({ ALPHA_PROBES: "USDC/EURC:100,USDC/EURC:1000" })), worker = monitor(a);
  const quote = a.market.quote;
  try {
    a.market.quote = async (from, to, amount) => { if (amount === "1000") throw new AppError("SCHEMA_MISMATCH"); return quote(from, to, amount); };
    await worker.tick(); const feed = await a.service.scan(); assert.equal(feed.results.length, 1); assert.equal(feed.errors, 1);
    a.market.quote = quote; a.market.current = null; a.advance(60001); await worker.tick();
    assert.equal((await a.service.scan()).state, "NO_QUOTES"); assert.equal((await a.service.scan()).results.length, 0);
  } finally { await worker.stop(); a.store.close(); }
});
test("scanner summaries/recovery survive restart; changing token binding resets old observations", async () => {
  const root = realpathSync(tmpdir()), dir = mkdtempSync(join(root, "sera-scanner-restart-")), path = join(dir, "db.sqlite");
  let store = new SqliteStore(path, 900000, () => NOW);
  try {
    const oldAlert = await createAlert(store);
    await store.alerts.record(observation("0.9", NOW - 3600000));
    store.close();
    const prior = new DatabaseSync(path);
    // Reproduce the exact previous schema by removing only the Phase 3 addition.
    prior.exec("DROP TABLE scanner_probes; DELETE FROM schema_migrations WHERE version=3;"); prior.close();
    store = new SqliteStore(path, 900000, () => NOW);
    assert.equal((await store.alerts.get(oldAlert.id, "1"))?.threshold, "0.9");
    assert.equal((await store.alerts.nearest(observation("1").market_key, NOW - 3600000, 1000, NOW))?.rate, "0.9");
    const p = await registerProbe(store);
    await observeProbe(store, p.id, observation(null, NOW - 60000)); await observeProbe(store, p.id, observation("1"));
    store.close(); store = new SqliteStore(path, 900000, () => NOW);
    assert.equal((await store.scanner.list())[0]!.recovery_at, NOW);
    assert((await new ScannerService(store, scannerConfig(), () => NOW).scan()).results[0]!.signals
      .some(signal => signal.signal_type === "AVAILABILITY_RECOVERY"));
    await store.scanner.configure(p.id, { ...p.spec, from_token: "0x" + "3".repeat(40) });
    assert.equal((await store.scanner.list())[0]!.observation, undefined);
    assert.equal((await store.scanner.list())[0]!.recovery_at, null);
    assert(await store.user("1"));
  } finally {
    store.close(); const rel = relative(root, realpathSync(dir)); assert(!isAbsolute(rel) && !rel.startsWith("..")); rmSync(dir, { recursive: true });
  }
});
test("only configured public samples appear; private thresholds and unconfigured sizes never enter the feed", async () => {
  const a = setupScanner();
  try {
    await createAlert(a.store, { threshold: "123456.789", amount: "12345" });
    await seedRate(a.store, "99", NOW, { amount: "12345" });
    assert.equal((await a.service.scan()).results.length, 0);
    await a.store.scanner.sync(a.config.alphaProbes.map(p => p.id));
    assert.equal((await a.store.scanner.list()).length, 1); // obsolete summaries removed, original history kept
    assert.equal((await a.store.alerts.active())[0]!.threshold, "123456.789");
  } finally { a.store.close(); }
});
test("disabled scanner schedules no work and cannot expose Sepolia data through a mainnet configuration", async () => {
  for (const cfg of [scannerConfig({ ALPHA_ENABLED: "false" }), { ...scannerConfig(), network: "mainnet" as const }]) {
    const a = setupScanner(cfg), worker = monitor(a);
    try { await worker.tick(); assert.equal(a.market.calls, 0); assert.equal((await a.service.scan()).state, "DISABLED"); }
    finally { await worker.stop(); a.store.close(); }
  }
});
