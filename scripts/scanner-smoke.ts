import assert from "node:assert/strict";
import { loadConfig } from "../src/config/index.js";
import { SeraClient } from "../src/sera/client.js";
import { MarketService } from "../src/sera/service.js";
import { SqliteStore } from "../src/database/store.js";
import { AlertMonitor } from "../src/alerts/monitor.js";
import { ScannerCoverage } from "../src/scanner/coverage.js";
import { ScannerService } from "../src/scanner/service.js";
import { BotController } from "../src/bot/controller.js";
import type { View } from "../src/bot/view.js";

// Small real-Sera check with synthetic users in RAM. There is no Telegram client or signer here.
const config = loadConfig({ ...process.env, SERA_NETWORK: "sepolia", ENABLE_MAINNET: "false", ENABLE_TESTNET_EXECUTION: "false",
  ALPHA_ENABLED: "true", ALPHA_PROBES: "USDC/XSGD:100,USDC/EURC:100,XIDR/USDT:1000000" });
const market = new MarketService(new SeraClient(config), config), store = new SqliteStore(":memory:");
let quoteRequests = 0;
const quote = market.quote.bind(market);
market.quote = async (...args) => { quoteRequests++; return quote(...args); };
const monitor = new AlertMonitor(store, market, config, { async send() { assert.fail("No personal alerts exist"); } },
  Date.now, undefined, new ScannerCoverage(store.scanner, market, config));
try {
  await monitor.tick();
  const scanner = new ScannerService(store, config), feed = await scanner.scan();
  assert(feed.fresh > 0, "No current supported pair could be evaluated; inspect monitor errors");
  console.info(JSON.stringify({ check: "live_scanner", at: new Date().toISOString(), network: "sepolia",
    evaluated: feed.fresh, configured: feed.configured, quoteRequests, state: feed.state,
    results: feed.results.map(r => ({ pair: r.pair, amount: r.probe_amount, signals: r.signals.map(s => s.signal_type) })) }));
  // No historical movement/recovery is seeded or fabricated for this check.
  assert(feed.results.every(r => r.signals.every(s => s.signal_type === "QUOTE_AVAILABLE")));
  const before = quoteRequests;
  await scanner.scan(); await scanner.scan(); assert.equal(quoteRequests, before);
  const views: View[] = [], out = { async reply(view: View) { views.push(view); } };
  const controller = new BotController(store, market, config);
  await controller.handle({ userId: "1", text: "/alpha" }, out);
  assert.equal(quoteRequests, before);
  const button = views.at(-1)!.buttons?.flat().find(b => b.data.startsWith("s:q:"));
  if (button) {
    await controller.handle({ userId: "1", callback: button.data }, out);
    assert.equal(quoteRequests, before + 1);
    const succeeded = views.at(-1)!.text.includes("시장 상황이 변했을 수 있어 최신 Quote를 다시 조회했습니다.");
    console.info(JSON.stringify({ check: "live_scanner_fresh_quote", newQuoteRequests: quoteRequests - before,
      positiveQuote: succeeded, telegramTransport: "NOT_USED" }));
    if (!succeeded) throw new Error("Fresh quote response unavailable; live success acceptance remains pending");
  } else console.info("No positive quote sample to exercise a result button. Fresh-success acceptance is pending liquidity.");
  assert.equal((await store.alerts.active()).length, 0);
} finally { await monitor.stop(); store.close(); }
console.info("Scanner read-only smoke passed. No Telegram messages, signatures or transactions sent.");
