import test from "node:test";
import assert from "node:assert/strict";
import { Api } from "grammy";
import { AlertMonitor, DeliveryError } from "../src/alerts/monitor.js";
import { telegramNotifications } from "../src/bot/notifications.js";
import { SqliteStore } from "../src/database/store.js";
import type { View } from "../src/bot/view.js";
import { evaluate } from "../src/alerts/evaluate.js";
import { NOW, config } from "./helpers.js";
import { createAlert, changingMarket, observation } from "./alert-helpers.js";

function setup(overrides: Partial<typeof config> = {}) {
  let clock = NOW; const now = () => clock;
  const store = new SqliteStore(":memory:", 900000, now), market = changingMarket(now);
  const sent: { user: string; view: View }[] = [];
  const sender = { async send(user: string, view: View) { sent.push({ user, view }); } };
  const monitor = new AlertMonitor(store, market, { ...config, cooldownMs: 60000, ...overrides }, sender, now, async () => {});
  return { store, market, monitor, sent, sender, advance(ms = 60001) { clock += ms; }, now };
}
for (const type of ["RATE_ABOVE", "RATE_BELOW"] as const) test(`${type} edges, no duplicates, cooldown consumption and rearm end to end`, async () => {
  const a = setup(); const unmet = type === "RATE_ABOVE" ? "0.89" : "0.91", met = type === "RATE_ABOVE" ? "0.91" : "0.89";
  try {
    await createAlert(a.store, { type });
    a.market.current = unmet; await a.monitor.tick(); assert.equal(a.sent.length, 0);
    a.advance(1000); a.market.current = met; await a.monitor.tick(); assert.equal(a.sent.length, 1);
    assert.match(a.sent[0]!.view.text, /설정한 FX 조건에 도달했어요/); assert.match(a.sent[0]!.view.text, /1 USDC/);
    a.advance(1000); await a.monitor.tick(); assert.equal(a.sent.length, 1);
    a.advance(1000); a.market.current = unmet; await a.monitor.tick();
    a.advance(1000); a.market.current = met; await a.monitor.tick(); assert.equal(a.sent.length, 1);
    a.advance(); await a.monitor.tick(); assert.equal(a.sent.length, 1); // cooldown expiry alone is not an edge
    a.advance(); a.market.current = unmet; await a.monitor.tick();
    a.advance(); a.market.current = met; await a.monitor.tick(); assert.equal(a.sent.length, 2);
  } finally { await a.monitor.stop(); a.store.close(); }
});
test("20 identical monitors share one request; a different amount is a separate observation", async () => {
  const a = setup();
  try {
    for (let i = 1; i <= 20; i++) await createAlert(a.store, {}, String(i));
    await createAlert(a.store, { amount: "1000" }, "21");
    await a.monitor.tick(); assert.equal(a.market.calls, 2); assert.equal(a.sent.length, 0);
    a.advance(); a.market.current = "0.91"; await a.monitor.tick(); assert.equal(a.market.calls, 4);
    assert.equal(a.sent.length, 10); // bounded post-poll delivery, queue persists remaining events
    a.advance(); await a.monitor.tick(); assert.equal(a.sent.length, 21);
    assert.equal(a.market.calls, 6);
  } finally { await a.monitor.stop(); a.store.close(); }
});
for (const type of ["QUOTE_AVAILABLE", "MARKET_RECOVERY"] as const) test(`${type} only known unavailable to valid quote triggers; outages never rearm`, async () => {
  const a = setup();
  try {
    const alert = await createAlert(a.store, { type, threshold: null });
    a.market.current = "0.9"; await a.monitor.tick(); assert.equal(a.sent.length, 0);
    for (const error of ["UNAVAILABLE", "SCHEMA_MISMATCH", "QUOTE_BINDING_MISMATCH", "RATE_LIMITED", "QUOTE_STALE", "AMOUNT_BELOW_MIN", "UNSUPPORTED_PAIR"]) {
      a.advance(); a.market.failure = error; await a.monitor.tick();
      assert.equal(a.sent.length, 0); assert.equal((await a.store.alerts.get(alert.id, "1"))?.last_condition, 1);
    }
    a.market.failure = undefined; a.advance(); await a.monitor.tick(); assert.equal(a.sent.length, 0);
    a.advance(); a.market.current = null; await a.monitor.tick();
    a.advance(); a.market.current = "0.9"; await a.monitor.tick(); assert.equal(a.sent.length, 1);
    a.advance(); await a.monitor.tick(); assert.equal(a.sent.length, 1);
  } finally { await a.monitor.stop(); a.store.close(); }
});
test("movement waits for history, primes first eligible sample and uses nearest six-hour observation", async () => {
  const a = setup();
  try {
    const alert = await createAlert(a.store, { type: "RATE_MOVEMENT", threshold: "0.5", window_seconds: 21600 });
    a.market.current = "1"; await a.monitor.tick();
    assert.equal((await a.store.alerts.get(alert.id, "1"))?.evaluation_status, "WAITING_HISTORY");
    a.advance(21600000); await a.monitor.tick(); assert.equal(a.sent.length, 0);
    a.advance(60000); a.market.current = "1.005"; await a.monitor.tick(); assert.equal(a.sent.length, 1);
    assert.match(a.sent[0]!.view.text, /0.500000%/); assert.match(a.sent[0]!.view.text, /실제 비교 데이터 시각/);
    a.advance(600000); await a.monitor.tick();
    assert.equal((await a.store.alerts.get(alert.id, "1"))?.evaluation_status, "WAITING_HISTORY");
    assert.equal(a.sent.length, 1);
  } finally { await a.monitor.stop(); a.store.close(); }
});
test("recoverable database errors do not crash or invent transitions", async () => {
  const a = setup();
  try {
    const alert = await createAlert(a.store, {}, "1", false), record = a.store.alerts.record.bind(a.store.alerts);
    a.store.alerts.record = async () => { throw new Error("database busy"); };
    a.market.current = "0.91"; await a.monitor.tick(); assert.equal(a.sent.length, 0);
    assert.equal((await a.store.alerts.get(alert.id, "1"))?.last_condition, 0);
    a.store.alerts.record = record; a.advance(); await a.monitor.tick(); assert.equal(a.sent.length, 1);
  } finally { await a.monitor.stop(); a.store.close(); }
});
test("concurrent ticks coalesce and bounded groups rotate fairly", async () => {
  const a = setup({ alertMaxGroups: 1 });
  try {
    await createAlert(a.store); await createAlert(a.store, { amount: "1000" }, "2");
    await Promise.all([a.monitor.tick(), a.monitor.tick(), a.monitor.tick()]); assert.equal(a.market.calls, 1);
    a.advance(); await a.monitor.tick(); assert.equal(a.market.calls, 2);
    assert((await a.store.alerts.active()).every(x => x.last_evaluated_at !== null));
    await a.monitor.stop(); await a.monitor.tick(); assert.equal(a.market.calls, 2);
  } finally { await a.monitor.stop(); a.store.close(); }
});
test("delivery retries are independent of Sera health; blocked Telegram delivery fails permanently", async () => {
  const a = setup();
  try {
    const alert = await createAlert(a.store, {}, "1", false); a.market.current = "0.91";
    let attempts = 0; a.sender.send = async () => { attempts++; throw new DeliveryError("TELEGRAM_TEMPORARY"); };
    await a.monitor.tick(); assert.equal(attempts, 1); assert.equal(await a.store.alerts.lastDelivery(alert.id, "1"), "pending");
    a.advance(); a.market.failure = "UNAVAILABLE";
    a.sender.send = async () => { attempts++; };
    await a.monitor.tick(); assert.equal(attempts, 2); assert.equal(await a.store.alerts.lastDelivery(alert.id, "1"), "sent");
    const other = await createAlert(a.store, { threshold: "0.88" }, "2", false), o = observation("0.91", a.now());
    await a.store.alerts.apply(other.id, o, evaluate(other, o), 60000);
    a.sender.send = async () => { attempts++; throw new DeliveryError("TELEGRAM_BLOCKED", 0, true); };
    await a.monitor.tick(); assert.equal(await a.store.alerts.lastDelivery(other.id, "2"), "failed");
    a.advance(); await a.monitor.tick(); assert.equal(attempts, 3);
  } finally { await a.monitor.stop(); a.store.close(); }
});
test("Telegram retry-after pauses all outbox sends and resumes later", async () => {
  const a = setup();
  try {
    await createAlert(a.store, {}, "1", false); await createAlert(a.store, {}, "2", false); a.market.current = "0.91";
    let attempts = 0;
    a.sender.send = async () => { attempts++; throw new DeliveryError("TELEGRAM_RATE_LIMITED", 120000); };
    await a.monitor.tick(); assert.equal(attempts, 1);
    a.advance(60000); await a.monitor.tick(); assert.equal(attempts, 1);
    a.sender.send = async () => { attempts++; }; a.advance(60001); await a.monitor.tick(); assert.equal(attempts, 3);
  } finally { await a.monitor.stop(); a.store.close(); }
});
test("real Telegram sender adapter maps 429/403/400/500 into sanitized delivery errors", async () => {
  for (const [code, expected, terminal] of [[429, "TELEGRAM_RATE_LIMITED", false], [403, "TELEGRAM_BLOCKED", true], [400, "TELEGRAM_REJECTED", true], [500, "TELEGRAM_TEMPORARY", false]] as const) {
    const api = new Api("123456:TEST_TOKEN");
    api.config.use(async () => ({ ok: false, error_code: code, description: "not logged", parameters: { retry_after: 17 } }));
    await assert.rejects(telegramNotifications(api).send("1", { text: "test" }), e => {
      assert(e instanceof DeliveryError); assert.equal(e.code, expected); assert.equal(e.terminal, terminal);
      if (code === 429) assert.equal(e.retryAfterMs, 17000);
      return true;
    });
  }
});
test("monitor never polls mainnet, and an idle monitor performs no Sera requests", async () => {
  const idle = setup(), mainnet = setup({ network: "mainnet" });
  try {
    await idle.monitor.tick(); assert.equal(idle.market.calls, 0);
    await createAlert(mainnet.store); await mainnet.monitor.tick(); assert.equal(mainnet.market.calls, 0);
  } finally { await idle.monitor.stop(); idle.store.close(); await mainnet.monitor.stop(); mainnet.store.close(); }
});
test("start schedules the configured interval after completion and stop cancels the timer", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const a = setup({ pollIntervalMs: 120000 });
  try {
    await createAlert(a.store); a.monitor.start(); a.monitor.start(); await a.monitor.tick();
    assert.equal(a.market.calls, 1);
    t.mock.timers.tick(119999); await Promise.resolve(); assert.equal(a.market.calls, 1);
    a.advance(120000); t.mock.timers.tick(1); await a.monitor.tick(); assert.equal(a.market.calls, 2);
    await a.monitor.stop(); t.mock.timers.tick(240000); await Promise.resolve(); assert.equal(a.market.calls, 2);
  } finally { await a.monitor.stop(); a.store.close(); t.mock.timers.reset(); }
});
