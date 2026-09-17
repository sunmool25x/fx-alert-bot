import assert from "node:assert/strict";
import { loadConfig } from "../src/config/index.js";
import { SeraClient } from "../src/sera/client.js";
import { MarketService } from "../src/sera/service.js";
import { SqliteStore } from "../src/database/store.js";
import { AlertMonitor } from "../src/alerts/monitor.js";
import { BotController } from "../src/bot/controller.js";

// Real Sera reads; isolated, synthetic users in RAM. No Telegram network client exists in this script.
const config = loadConfig({ ...process.env, SERA_NETWORK: "sepolia", ENABLE_MAINNET: "false", ENABLE_TESTNET_EXECUTION: "false" });
const market = new MarketService(new SeraClient(config), config), store = new SqliteStore(":memory:");
const tokens = await market.tokens();
const from = tokens.find(t => t.symbol === "USDC"), to = tokens.find(t => t.symbol === "XSGD");
assert(from && to, "Expected smoke-test pair is absent from the live registry");
const original = market.quote.bind(market); let quoteRequests = 0;
market.quote = async (...args) => { quoteRequests++; return original(...args); };
const monitor = new AlertMonitor(store, market, config, { async send() { assert.fail("Initial observations must never trigger"); } });
try {
  for (const id of ["1", "2"]) {
    await store.touch(id);
    await store.alerts.create(id, { network: "sepolia", from_token: from.address, to_token: to.address,
      base: from.symbol, quote: to.symbol, amount: "100", type: "QUOTE_AVAILABLE", threshold: null, window_seconds: null },
      "smoke", undefined, 20, 500);
  }
  await monitor.tick();
  assert.equal(quoteRequests, 1, "Identical alert probes must be grouped");
  const alerts = await store.alerts.active();
  assert(alerts.every(a => a.last_observation_at !== null && a.evaluation_status === "OK"), "Valid live observation unavailable");
  console.info(JSON.stringify({ check: "live_alert_monitor", at: new Date().toISOString(), network: "sepolia",
    pair: "USDC/XSGD", alerts: alerts.length, quoteRequests, available: alerts[0]!.last_condition === 1, initialTriggers: 0 }));
  if (alerts[0]!.last_condition === 1) {
    const alert = alerts[0]!;
    await new BotController(store, market, config).handle({ userId: alert.telegram_user_id, callback: "a:q:" + alert.id }, {
      async reply(view) { assert.match(view.text, /새 Quote 조회 시각/); },
    });
    assert.equal(quoteRequests, 2);
    console.info(JSON.stringify({ check: "live_alert_button_new_quote", quoteRequests, telegramTransport: "NOT_USED" }));
  } else console.info("Live fresh-success check deferred: the sampled amount currently has no quote.");
} finally { await monitor.stop(); store.close(); }
console.info("Read-only alert smoke passed. No Telegram messages, signatures or transactions sent.");
