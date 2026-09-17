import type { Config } from "../config/index.js";
import type { Store } from "../database/store.js";
import type { Observation } from "../alerts/types.js";
import { baselineTolerance } from "../alerts/evaluate.js";
import { buildSignals, fresh, validPositive, windows } from "./signals.js";
import { compareSignals, rankAndConsolidate } from "./scoring.js";
import type { ScannerFeed, ScannerResult } from "./types.js";

export class ScannerService {
  constructor(private store: Store, private config: Config, private now = Date.now) {}
  async scan(): Promise<ScannerFeed> {
    const feed: ScannerFeed = { results: [], configured: this.config.alphaProbes.length, fresh: 0, unavailable: 0,
      errors: 0, stale: 0, waiting: 0, missing_history: 0, state: "EMPTY" };
    if (!this.config.alphaEnabled || this.config.network !== "sepolia") return { ...feed, state: "DISABLED" };
    // Only the public configured sample set is discoverable. Never inspect users' alert thresholds.
    const rows = new Map((await this.store.scanner.list()).map(row => [row.id, row]));
    const now = this.now(), candidates: ScannerResult[] = [];
    for (const configured of this.config.alphaProbes) {
      const row = rows.get(configured.id);
      if (row?.last_error) { feed.errors++; continue; }
      const o = row?.observation;
      if (!row?.spec || !o) { feed.waiting++; continue; }
      if (!fresh(o, now, this.config.alphaDataMaxAgeMs)) { feed.stale++; continue; }
      feed.fresh++;
      if (!o.available) { feed.unavailable++; continue; }
      if (!validPositive(o)) { feed.errors++; continue; }
      const baselines = new Map<number, Observation>();
      for (const window of windows) {
        const baseline = await this.store.alerts.nearest(o.market_key, o.observed_at - window * 1000,
          baselineTolerance(window, this.config.baselineToleranceMs), o.observed_at);
        if (baseline) baselines.set(window, baseline); else feed.missing_history++;
      }
      const signals = buildSignals(row, baselines, this.config, now).sort(compareSignals);
      if (!signals.length) continue;
      candidates.push({ key: row.market_key!, pair: row.spec.base + " → " + row.spec.quote, spec: row.spec,
        current_rate: o.rate!, probe_amount: o.amount, observed_at: o.observed_at, primary: signals[0]!,
        signals, notability_score: signals[0]!.notability_score });
    }
    feed.results = rankAndConsolidate(candidates, this.config.alphaMaxResults);
    feed.state = feed.results.length ? "READY" : feed.errors ? "UNAVAILABLE" : feed.stale ? "STALE"
      : feed.fresh && feed.unavailable === feed.fresh ? "NO_QUOTES" : feed.waiting ? "WARMING" : "EMPTY";
    return feed;
  }
}
