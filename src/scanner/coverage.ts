import type { Config } from "../config/index.js";
import type { ScannerStore } from "../database/scanner.js";
import type { MarketData } from "../sera/service.js";
import type { AlertSpec, Observation } from "../alerts/types.js";
import { normalizedAmount } from "../alerts/source.js";
import { AppError, errorCode, safeLog } from "../utils/errors.js";
import type { ObservationConsumer, ObservationJob } from "./types.js";

// Supplies extra jobs to the existing monitor. No timer or independent HTTP client.
export class ScannerCoverage implements ObservationConsumer {
  constructor(private store: ScannerStore, private market: MarketData, private config: Config) {}
  async jobs(): Promise<ObservationJob[]> {
    if (!this.config.alphaEnabled || this.config.network !== "sepolia") return [];
    await this.store.sync(this.config.alphaProbes.map(p => p.id));
    let tokens, markets;
    try { tokens = await this.market.tokens(); markets = await this.market.markets(); }
    catch (e) {
      for (const probe of this.config.alphaProbes) await this.store.failed(probe.id, errorCode(e));
      safeLog("scanner_catalog_failed", e); return [];
    }
    const specs = new Map<string, AlertSpec>();
    for (const probe of this.config.alphaProbes) {
      try {
        const from = tokens.filter(t => t.symbol.toUpperCase() === probe.base), to = tokens.filter(t => t.symbol.toUpperCase() === probe.quote);
        if (from.length !== 1 || to.length !== 1) throw new AppError("UNKNOWN_TOKEN");
        const a = from[0]!, b = to[0]!;
        const addresses = [a.address.toLowerCase(), b.address.toLowerCase()];
        if (!markets.some(m => addresses.includes(m.base_address.toLowerCase()) && addresses.includes(m.quote_address.toLowerCase()) &&
          m.base_address.toLowerCase() !== m.quote_address.toLowerCase())) throw new AppError("UNSUPPORTED_PAIR");
        const spec: AlertSpec = { network: "sepolia", from_token: a.address, to_token: b.address, base: a.symbol, quote: b.symbol,
          amount: normalizedAmount(probe.amount, a), type: "QUOTE_AVAILABLE", threshold: null, window_seconds: null };
        await this.store.configure(probe.id, spec); specs.set(probe.id, spec);
      } catch (e) { await this.store.failed(probe.id, errorCode(e)); safeLog("scanner_probe_invalid", e); }
    }
    return (await this.store.list()).filter(row => specs.has(row.id))
      .map(row => ({ id: row.id, spec: specs.get(row.id)!, last_attempt_at: row.last_attempt_at }));
  }
  observed(job: ObservationJob, observation: Observation) { return this.store.observed(job.id, observation, this.config.alphaDataMaxAgeMs); }
  failed(job: ObservationJob, code: string) { return this.store.failed(job.id, code); }
}
