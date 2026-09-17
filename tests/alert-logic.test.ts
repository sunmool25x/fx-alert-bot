import test from "node:test";
import assert from "node:assert/strict";
import { evaluate, transition, baselineTolerance } from "../src/alerts/evaluate.js";
import { QuoteObservationSource, normalizedAmount, positiveThreshold } from "../src/alerts/source.js";
import { loadConfig } from "../src/config/index.js";
import { AppError } from "../src/utils/errors.js";
import { A, NOW } from "./helpers.js";
import { spec, observation, changingMarket } from "./alert-helpers.js";

test("above/below use inclusive exact decimals, not rounded display values", () => {
  assert.equal(evaluate(spec, observation("0.9")).condition, true);
  assert.equal(evaluate(spec, observation("0.899999999999999999999999")).condition, false);
  assert.equal(evaluate({ ...spec, type: "RATE_BELOW" }, observation("0.9")).condition, true);
  assert.equal(evaluate({ ...spec, type: "RATE_BELOW" }, observation("0.900000000000000000000001")).condition, false);
});
test("only false to true triggers: first true primes, errors preserve, cooldown crossing is consumed", () => {
  assert.deepEqual(transition(null, true, 0, NOW), { next: 1, trigger: false });
  assert.deepEqual(transition(0, true, 0, NOW), { next: 1, trigger: true });
  assert.deepEqual(transition(1, true, 0, NOW), { next: 1, trigger: false });
  assert.deepEqual(transition(1, null, 0, NOW), { next: 1, trigger: false });
  assert.deepEqual(transition(1, false, NOW + 1, NOW), { next: 0, trigger: false });
  assert.deepEqual(transition(0, true, NOW + 1, NOW), { next: 1, trigger: false });
  assert.equal(transition(0, true, NOW, NOW).trigger, true);
});
test("movement uses actual same-size history, counts both directions and does not round thresholds", () => {
  const s = { ...spec, type: "RATE_MOVEMENT" as const, threshold: "0.5", window_seconds: 21600 };
  const baseline = observation("1", NOW - 21600000);
  assert.equal(evaluate(s, observation("1.005"), baseline).movement_pct, "0.500000");
  assert.equal(evaluate(s, observation("0.995"), baseline).condition, true);
  assert.equal(evaluate(s, observation("1.00499999999999999"), baseline).condition, false);
  assert.equal(evaluate(s, observation("1.01")).condition, null);
  assert.equal(evaluate(s, observation("1.01"), observation("1", NOW)).status, "WAITING_HISTORY");
  assert.equal(evaluate(s, observation("1.01"), observation("1", NOW - 21600000, { amount: "1000" })).condition, null);
  assert.equal(baselineTolerance(3600, 600000), 360000);
});
test("quote-size and recovery use availability; missing quote cannot satisfy or rearm a rate target", () => {
  for (const type of ["QUOTE_AVAILABLE", "MARKET_RECOVERY"] as const) {
    assert.equal(evaluate({ ...spec, type }, observation(null)).condition, false);
    assert.equal(evaluate({ ...spec, type }, observation("0.9")).condition, true);
  }
  assert.equal(evaluate(spec, observation(null)).condition, null);
});
test("observation source distinguishes known unavailable from timeout, bad schema, stale and minimum errors", async () => {
  const market = changingMarket(() => NOW), source = new QuoteObservationSource(market, () => NOW);
  const o = await source.sample(spec); assert.equal(o.rate, "0.89"); assert.equal(o.available, true);
  market.current = "0"; assert.equal((await source.sample(spec)).available, false);
  market.current = null; assert.equal((await source.sample(spec)).rate, null);
  for (const code of ["UNAVAILABLE", "SCHEMA_MISMATCH", "RATE_LIMITED", "AMOUNT_BELOW_MIN", "UNSUPPORTED_PAIR", "QUOTE_STALE", "QUOTE_BINDING_MISMATCH"]) {
    market.failure = code; await assert.rejects(source.sample(spec), { message: code });
  }
  market.failure = undefined; market.current = "NaN";
  await assert.rejects(source.sample(spec), { message: "SCHEMA_MISMATCH" });
  market.current = "-1"; await assert.rejects(source.sample(spec), { message: "SCHEMA_MISMATCH" });
  const quote = market.quote; market.current = "0.9";
  market.quote = async (...args) => ({ ...await quote(...args), expiresAt: NOW });
  await assert.rejects(source.sample(spec), { message: "QUOTE_STALE" });
  market.quote = async () => { throw new AppError("NO_LIQUIDITY", 500); };
  await assert.rejects(source.sample(spec), { message: "UNAVAILABLE" });
});
test("amount canonicalization and thresholds reject malformed, tiny and overprecision input", () => {
  assert.equal(normalizedAmount("00100.000000", A), "100");
  assert.equal(positiveThreshold("00.9000"), "0.9");
  for (const value of ["0", "-1", "NaN", "1e3", "1,000", "0.5%", "9".repeat(41)]) assert.throws(() => positiveThreshold(value));
  for (const value of ["0", "0.5", "1.0000001", "1e3", "9".repeat(100)]) assert.throws(() => normalizedAmount(value, A));
});
test("monitor configuration is conservative, backwards compatible and execution remains disabled", () => {
  assert.equal(loadConfig({}).pollIntervalMs, 60000);
  assert.equal(loadConfig({ MARKET_POLL_INTERVAL_MS: "90000" }).pollIntervalMs, 90000);
  assert.equal(loadConfig({ MARKET_POLL_INTERVAL_MS: "90000", MARKET_POLL_INTERVAL_SECONDS: "120" }).pollIntervalMs, 120000);
  assert.throws(() => loadConfig({ MARKET_POLL_INTERVAL_SECONDS: "1" }));
  assert.throws(() => loadConfig({ ENABLE_TESTNET_EXECUTION: "true" }));
  assert.throws(() => loadConfig({ SERA_NETWORK: "mainnet" }));
});
