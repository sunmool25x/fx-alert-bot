import test from "node:test";
import assert from "node:assert/strict";
import { Decimal } from "decimal.js";
import { buildSignals } from "../src/scanner/signals.js";
import { rankAndConsolidate } from "../src/scanner/scoring.js";
import { signedMovement } from "../src/scanner/views.js";
import { NOW, A, B } from "./helpers.js";
import { observation } from "./alert-helpers.js";
import { setupScanner, scannerConfig, seedRate, registerProbe, observeProbe } from "./scanner-helpers.js";

for (const [window, pct] of [[3600, "0.5"], [21600, "1"], [86400, "2"]] as const)
  for (const sign of [1, -1]) test(`${window / 3600}h movement surfaces exact ${sign > 0 ? "positive" : "negative"} threshold with direction`, async () => {
    const a = setupScanner();
    try {
      await a.store.alerts.record(observation("1", NOW - window * 1000));
      await seedRate(a.store, new Decimal(1).plus(new Decimal(pct).mul(sign).div(100)).toFixed());
      const result = (await a.service.scan()).results[0]!;
      const signal = result.signals.find(s => s.comparison_window === window)!;
      assert(signal); assert.equal(signal.movement_pct, new Decimal(pct).mul(sign).toFixed());
      assert.equal(signal.notability_score, 20); assert.equal(signal.supporting_data.baseline_at, NOW - window * 1000);
      assert.match(signedMovement(signal.movement_pct!), sign > 0 ? /^\+/ : /^-/);
    } finally { a.store.close(); }
  });
test("below-threshold movements and insufficient history never produce movement signals", async () => {
  const a = setupScanner();
  try {
    await a.store.alerts.record(observation("1", NOW - 3600000));
    await seedRate(a.store, "1.004999999999999999999");
    const feed = await a.service.scan();
    assert.deepEqual(feed.results[0]!.signals.map(s => s.signal_type), ["QUOTE_AVAILABLE"]);
    assert.equal(feed.missing_history, 2);
    assert(!feed.results[0]!.signals.some(s => String(s.signal_type).includes("SPREAD")));
  } finally { a.store.close(); }
});
test("baseline is nearest within tolerance and never from a different trade size", async () => {
  const a = setupScanner();
  try {
    await a.store.alerts.record(observation("1", NOW - 3600000 - 100000));
    await a.store.alerts.record(observation("2", NOW - 3600000 + 10000));
    await a.store.alerts.record(observation("3", NOW - 3600000, { amount: "1000" }));
    await a.store.alerts.record(observation("1", NOW - 21600000 - 300001));
    await seedRate(a.store, "2.02");
    const feed = await a.service.scan(), move = feed.results[0]!.signals.find(s => s.comparison_window === 3600)!;
    assert.equal(move.movement_pct, "1"); assert.equal(move.supporting_data.baseline_rate, "2");
    assert(!feed.results[0]!.signals.some(s => s.comparison_window === 21600));
  } finally { a.store.close(); }
});
test("stale/future data is excluded at the exact freshness boundary, even when quotes were once valid", async () => {
  const a = setupScanner();
  try {
    await seedRate(a.store, "1");
    a.advance(179999); assert.equal((await a.service.scan()).results.length, 1);
    a.advance(1); assert.equal((await a.service.scan()).state, "STALE");
    assert.equal((await a.service.scan()).results.length, 0);
    a.advance(-180001); assert.equal((await a.service.scan()).results.length, 0);
  } finally { a.store.close(); }
});
test("observed unavailable to available recovery expires and remaining available does not reset it", async () => {
  const a = setupScanner();
  try {
    const p = await registerProbe(a.store);
    await observeProbe(a.store, p.id, observation(null, NOW - 60000));
    await observeProbe(a.store, p.id, observation("1", NOW));
    let feed = await a.service.scan(); assert.equal(feed.results[0]!.primary.signal_type, "AVAILABILITY_RECOVERY");
    assert.equal(feed.results[0]!.primary.notability_score, 60);
    for (let n = 1; n <= 15; n++) { a.advance(60000); await observeProbe(a.store, p.id, observation("1", a.now())); }
    feed = await a.service.scan(); assert(!feed.results[0]!.signals.some(s => s.signal_type === "AVAILABILITY_RECOVERY"));
    assert.equal((await a.store.scanner.list())[0]!.recovery_at, NOW);
  } finally { a.store.close(); }
});
test("unknown first state, long gaps and temporary failures never manufacture a recovery", async () => {
  const a = setupScanner();
  try {
    const p = await seedRate(a.store, "1");
    assert.equal((await a.store.scanner.list())[0]!.recovery_at, null);
    await a.store.scanner.failed(p.id, "UNAVAILABLE"); assert.equal((await a.service.scan()).state, "UNAVAILABLE");
    a.advance(60000); await observeProbe(a.store, p.id, observation("1", a.now()));
    assert.equal((await a.store.scanner.list())[0]!.recovery_at, null);
    a.advance(60000); await observeProbe(a.store, p.id, observation(null, a.now()));
    a.advance(180001); await observeProbe(a.store, p.id, observation("1", a.now()));
    assert.equal((await a.store.scanner.list())[0]!.recovery_at, null);
  } finally { a.store.close(); }
});
test("ranking is capped, freshness weighted and deterministic; windows consolidate into one card", async () => {
  const a = setupScanner();
  try {
    for (const window of [3600, 21600, 86400]) await a.store.alerts.record(observation("1", NOW - window * 1000));
    await seedRate(a.store, "1.2");
    const feed = await a.service.scan(); assert.equal(feed.results.length, 1);
    assert.equal(feed.results[0]!.signals.filter(s => s.signal_type === "RATE_MOVEMENT").length, 3);
    assert.equal(feed.results[0]!.notability_score, 100);
    assert.equal(feed.results[0]!.primary.comparison_window, 3600); // stable shorter-window tiebreak
    assert.deepEqual(await a.service.scan(), feed);
    a.advance(90000); assert.equal((await a.service.scan()).results[0]!.notability_score, 50);
    const row = (await a.store.scanner.list())[0]!;
    row.recovery_at = NOW;
    const recovery = buildSignals(row, new Map(), a.config, a.now()).find(s => s.signal_type === "AVAILABILITY_RECOVERY")!;
    assert.equal(recovery.notability_score, 27); // 60 × 0.9 recovery freshness × 0.5 sample freshness
  } finally { a.store.close(); }
});
test("different sizes of one directed pair consolidate without mixing their historical rates", async () => {
  const a = setupScanner(scannerConfig({ ALPHA_PROBES: "USDC/EURC:100,USDC/EURC:1000,EURC/USDC:100" }));
  try {
    await a.store.alerts.record(observation("1", NOW - 3600000)); await seedRate(a.store, "1.01");
    await seedRate(a.store, "1000", NOW, { amount: "1000" });
    await seedRate(a.store, "1", NOW, { base: "EURC", quote: "USDC", from_token: B.address, to_token: A.address });
    const feed = await a.service.scan(); assert.equal(feed.results.length, 2);
    assert.equal(feed.results[0]!.probe_amount, "100"); assert.equal(feed.results[0]!.primary.movement_pct, "1");
    assert.deepEqual(rankAndConsolidate([...feed.results].reverse(), 1), [feed.results[0]]);
  } finally { a.store.close(); }
});
test("configured maximum results caps results after pair deduplication", async () => {
  const a = setupScanner(scannerConfig({ ALPHA_PROBES: "USDC/EURC:100,EURC/USDC:100", ALPHA_MAX_RESULTS: "1" }));
  try {
    await seedRate(a.store, "1");
    await seedRate(a.store, "1", NOW, { base: "EURC", quote: "USDC", from_token: B.address, to_token: A.address });
    assert.equal((await a.service.scan()).results.length, 1);
    a.config.alphaMaxResults = 2;
    const tied = (await a.service.scan()).results;
    assert.equal(tied.length, 2); assert.equal(tied[0]!.notability_score, tied[1]!.notability_score);
    assert.deepEqual(rankAndConsolidate([...tied].reverse(), 12), rankAndConsolidate(tied, 12));
  } finally { a.store.close(); }
});
test("configuration canonicalizes probes and rejects excessive load, malformed amounts and invalid thresholds", () => {
  assert.equal(scannerConfig({ ALPHA_PROBES: "usdc/eurc:00100.00" }).alphaProbes[0]!.id, "USDC/EURC:100");
  for (const env of [
    { ALPHA_PROBES: "USDC/EURC:100,usdc/eurc:100.00" }, { ALPHA_PROBES: "USDC/USDC:100" },
    { ALPHA_PROBES: "USDC/EURC:1e3" }, { ALPHA_PROBES: "USDC/EURC:0" }, { ALPHA_PROBES: "" },
    { ALPHA_PROBES: Array.from({ length: 13 }, (_, i) => `USDC/EURC:${i + 1}`).join(",") },
    { ALPHA_MAX_RESULTS: "100" }, { ALPHA_DATA_MAX_AGE_SECONDS: "999999" },
    { ALPHA_MOVEMENT_1H_PCT: "0" }, { ALPHA_MOVEMENT_6H_PCT: "NaN" }, { ALPHA_MOVEMENT_24H_PCT: "-1" },
    { ALPHA_RECOVERY_MAX_AGE_SECONDS: "0" },
  ]) assert.throws(() => scannerConfig(env));
});
