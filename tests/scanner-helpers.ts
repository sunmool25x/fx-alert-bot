import { loadConfig, type Config } from "../src/config/index.js";
import { SqliteStore } from "../src/database/store.js";
import type { AlertSpec, Observation } from "../src/alerts/types.js";
import { ScannerService } from "../src/scanner/service.js";
import { changingMarket, observation, spec } from "./alert-helpers.js";
import { NOW } from "./helpers.js";

export const scannerConfig = (env: NodeJS.ProcessEnv = {}) => loadConfig({ ALPHA_PROBES: "USDC/EURC:100", ...env });
export function setupScanner(config: Config = scannerConfig()) {
  let time = NOW;
  const now = () => time, store = new SqliteStore(":memory:", 900000, now);
  const market = changingMarket(now), service = new ScannerService(store, config, now);
  return { now, store, market, config, service, advance(ms: number) { time += ms; } };
}
export const probeSpec = (overrides: Partial<AlertSpec> = {}): AlertSpec => ({ ...spec, type: "QUOTE_AVAILABLE", threshold: null, ...overrides });
export async function registerProbe(store: SqliteStore, overrides: Partial<AlertSpec> = {}) {
  const s = probeSpec(overrides), id = `${s.base.toUpperCase()}/${s.quote.toUpperCase()}:${s.amount}`;
  const ids = new Set((await store.scanner.list()).map(row => row.id)); ids.add(id);
  await store.scanner.sync([...ids]); await store.scanner.configure(id, s);
  return { id, spec: s };
}
export async function observeProbe(store: SqliteStore, id: string, o: Observation, maxGap = 180000) {
  await store.alerts.record(o); await store.scanner.observed(id, o, maxGap);
}
export async function seedRate(store: SqliteStore, rate: string, at = NOW, overrides: Partial<AlertSpec> = {}) {
  const p = await registerProbe(store, overrides); await observeProbe(store, p.id, observation(rate, at, p.spec)); return p;
}
