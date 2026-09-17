import { Decimal } from "decimal.js";
import type { AlertSpec, Evaluation, Observation } from "./types.js";
const Exact = Decimal.clone({ precision: 80 });

// Baseline must be the closest *actual* observation to now-window. No interpolation.
export function baselineTolerance(windowSeconds: number, configuredMs: number): number {
  return Math.min(configuredMs, windowSeconds * 1000 * 0.1);
}
export function evaluate(spec: AlertSpec, observation: Observation, baseline?: Observation): Evaluation {
  if (spec.type === "QUOTE_AVAILABLE" || spec.type === "MARKET_RECOVERY") {
    return { condition: observation.available, status: "OK",
      reason: spec.type === "QUOTE_AVAILABLE" ? "SIZE_AVAILABLE" : "MARKET_RECOVERED" };
  }
  const reason = spec.type === "RATE_ABOVE" ? "TARGET_ABOVE" : spec.type === "RATE_BELOW" ? "TARGET_BELOW" : "RATE_MOVEMENT";
  if (!observation.available || !observation.rate) return { condition: null, status: "NO_LIQUIDITY", reason };
  const current = new Exact(observation.rate);
  if (spec.type === "RATE_MOVEMENT") {
    if (!baseline?.available || !baseline.rate || new Exact(baseline.rate).lte(0) ||
      baseline.market_key !== observation.market_key || baseline.observed_at >= observation.observed_at)
      return { condition: null, status: "WAITING_HISTORY", reason };
    const movement = current.div(baseline.rate).minus(1).mul(100);
    // Compare full precision; rounding is presentation only.
    return { condition: movement.abs().gte(spec.threshold!), status: "OK", reason,
      movement_pct: movement.toFixed(6), baseline_at: baseline.observed_at, baseline_rate: baseline.rate };
  }
  return { condition: spec.type === "RATE_ABOVE" ? current.gte(spec.threshold!) : current.lte(spec.threshold!), status: "OK", reason };
}
export function transition(previous: number | null, condition: boolean | null, cooldownUntil: number, now: number) {
  if (condition === null) return { next: previous, trigger: false };
  // First valid sample primes state. Only an observed false -> true crossing triggers.
  // Crossings suppressed during cooldown are consumed, not delayed into a later notification.
  return { next: condition ? 1 : 0, trigger: previous === 0 && condition && now >= cooldownUntil };
}
