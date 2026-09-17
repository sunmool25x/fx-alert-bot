import { Decimal } from "decimal.js";
import type { Config } from "../config/index.js";
import type { Observation } from "../alerts/types.js";
import type { ScannerProbe, ScannerSignal } from "./types.js";
const Exact = Decimal.clone({ precision: 80 });
export const windows = [3600, 21600, 86400] as const;

export function fresh(sample: Observation, now: number, maxAge: number): boolean {
  return sample.observed_at <= now && now - sample.observed_at < maxAge;
}
export function validPositive(sample: Observation): boolean {
  if (!sample.available || !sample.rate || !sample.output) return false;
  return new Exact(sample.rate).isFinite() && new Exact(sample.rate).gt(0) &&
    new Exact(sample.output).isFinite() && new Exact(sample.output).gt(0);
}
export function buildSignals(probe: ScannerProbe, baselines: Map<number, Observation>, config: Config, now: number): ScannerSignal[] {
  const current = probe.observation;
  if (probe.last_error || !current || !fresh(current, now, config.alphaDataMaxAgeMs) || !validPositive(current)) return [];
  const freshness = new Exact(1).minus(new Exact(now - current.observed_at).div(config.alphaDataMaxAgeMs));
  const score = (weight: Decimal) => weight.mul(freshness).toDecimalPlaces(8).toNumber();
  const signals: ScannerSignal[] = [];
  for (const window of windows) {
    const baseline = baselines.get(window);
    if (!baseline || !validPositive(baseline) || baseline.market_key !== current.market_key || baseline.observed_at >= current.observed_at) continue;
    const movement = new Exact(current.rate!).div(baseline.rate!).minus(1).mul(100), threshold = config.alphaMovement[window];
    if (movement.abs().lt(threshold)) continue;
    signals.push({ signal_type: "RATE_MOVEMENT", reason_code: "MOVEMENT_THRESHOLD", detected_at: current.observed_at,
      comparison_window: window, movement_pct: movement.toFixed(), threshold_pct: threshold,
      supporting_data: { baseline_at: baseline.observed_at, baseline_rate: baseline.rate!, output: current.output! },
      notability_score: score(Exact.min(5, movement.abs().div(threshold)).mul(20)) });
  }
  if (probe.recovery_at !== null && probe.recovery_at <= current.observed_at && probe.recovery_at <= now &&
    now - probe.recovery_at < config.alphaRecoveryMaxAgeMs) {
    signals.push({ signal_type: "AVAILABILITY_RECOVERY", reason_code: "QUOTE_RETURNED", detected_at: probe.recovery_at,
      supporting_data: { recovered_at: probe.recovery_at, output: current.output! },
      notability_score: score(new Exact(60).mul(new Exact(1).minus(new Exact(now - probe.recovery_at).div(config.alphaRecoveryMaxAgeMs)))) });
  }
  signals.push({ signal_type: "QUOTE_AVAILABLE", reason_code: "POSITIVE_QUOTE", detected_at: current.observed_at,
    supporting_data: { output: current.output! }, notability_score: score(new Exact(5)) });
  return signals;
}
