import assert from "node:assert/strict";
import { loadConfig } from "../src/config/index.js";
import { SeraClient } from "../src/sera/client.js";
import { MarketService } from "../src/sera/service.js";
import { errorCode } from "../src/utils/errors.js";
const config = loadConfig({ ...process.env, SERA_NETWORK: "sepolia", ENABLE_MAINNET: "false", ENABLE_TESTNET_EXECUTION: "false" });
const client = new SeraClient(config);
const market = new MarketService(client, config);
await client.preflight();
const tokens = await market.tokens();
const markets = await market.markets();
assert(tokens.length > 0); assert(markets.length > 0);
const token = (s: string) => { const t = tokens.find(t => t.symbol === s); assert(t, s); return t; };
const rate = await market.reference(token("USDC"), token("EURC"));
assert(Number(rate.rate) > 0);
console.info(JSON.stringify({ check: "catalog_reference", network: config.network, tokens: tokens.length, markets: markets.length, sourceAsOf: rate.as_of }));
let positive = false;
for (const [from, to, amount] of [["USDC", "XSGD", "100"], ["XIDR", "USDT", "1000000"], ["USDC", "EURC", "100"]]) {
  try {
    const card = await market.quote(token(from!), token(to!), amount!);
    positive ||= card.executableRoute;
    console.info(JSON.stringify({ check: "quote_probe", pair: from + "/" + to, routeAvailable: card.executableRoute, expiresAt: card.expiresAt }));
  } catch (e) {
    const code = errorCode(e);
    if (!["NO_LIQUIDITY", "AMOUNT_BELOW_MIN"].includes(code)) throw e;
    console.info(JSON.stringify({ check: "quote_probe", pair: from + "/" + to, result: code }));
  }
}
if (!positive) console.warn("No positive route in the sampled pairs. Full quote-success acceptance remains pending liquidity.");
console.info("Read-only smoke passed. No signature or financial mutation submitted.");
