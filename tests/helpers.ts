import { loadConfig } from "../src/config/index.js";
import type { Token, Quote } from "../src/sera/schemas.js";
import type { QuoteCard, MarketData } from "../src/sera/service.js";
import { PROBE_OWNER } from "../src/sera/service.js";
export const NOW = 1789568000000;
export const A: Token = { address: "0x" + "1".repeat(40), symbol: "USDC", currency: "USD", decimals: 6, min_trade_amount_raw: "1000000" };
export const B: Token = { address: "0x" + "2".repeat(40), symbol: "EURC", currency: "EUR", decimals: 6 };
export const config = loadConfig({ SERA_RATE_CACHE_MS: "0" });
export function quoteWire(input = "100000000", output = "90000000"): Quote {
  return { uuid: "00000000-0000-4000-8000-000000000001", expires_at: NOW / 1000 + 30,
    route_params: { taker: PROBE_OWNER, recipient: PROBE_OWNER, inputToken: A.address, outputToken: B.address,
      maxInputAmount: input, minOutputAmount: output, initialDepositAmount: input, uuid: "123", deadline: NOW / 1000 + 300 },
    fee_breakdown: { gas_cost_usd: "0.12" } };
}
export function fakeMarkets(): MarketData & { calls: number } {
  return {
    calls: 0,
    async tokens() { return [A, B]; },
    async markets() { return [{ symbol: "USDC/EURC", base_address: A.address, quote_address: B.address,
      base_symbol: A.symbol, quote_symbol: B.symbol, tick_precision: 6, quantity_precision: 6 }]; },
    async reference() { return { pair: "USD/EUR", rate: "0.9", as_of: NOW / 1000, change_pct: "0.1" }; },
    async quote(from, to, amount): Promise<QuoteCard> {
      this.calls++;
      return { from, to, amount, output: "90", rate: "0.9", expiresAt: NOW + 30000,
        executableRoute: true, gasUsd: "0.12", quote: quoteWire() };
    },
    async depth(from, to) { return [{ amount: "100", status: "OK", card: await this.quote(from, to, "100") }]; },
  };
}
