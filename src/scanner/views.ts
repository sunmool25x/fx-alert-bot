import { Decimal } from "decimal.js";
import type { Language } from "../database/store.js";
import { st } from "../i18n/scanner.js";
import { shownRate } from "../alerts/views.js";
import { utc } from "../bot/view.js";
import type { ScannerFeed, ScannerResult } from "./types.js";

export function signedMovement(value: string): string {
  const n = new Decimal(value);
  return (n.gte(0) ? "+" : "") + n.toSignificantDigits(4).toFixed() + "%";
}
export function scannerCard(result: ScannerResult, number: number, language: Language): string {
  const m = st(language);
  const movements = result.signals.filter(s => s.signal_type === "RATE_MOVEMENT")
    .sort((a, b) => a.comparison_window! - b.comparison_window!);
  const recovered = result.signals.find(s => s.signal_type === "AVAILABILITY_RECOVERY");
  return [
    `${number}. ${result.pair}`, `${m.size}: ${result.probe_amount} ${result.spec.base}`,
    `1 ${result.spec.base} = ${shownRate(result.current_rate)} ${result.spec.quote}`,
    ...movements.map(s => `${s.comparison_window! / 3600}${m.hour} ${m.movement}: ${signedMovement(s.movement_pct!)} ` +
      `(${m.threshold}: ±${s.threshold_pct}%)\n${m.baseline}: ${utc(s.supporting_data.baseline_at!)}`),
    ...(recovered ? [`${m.recovery}: ${utc(recovered.detected_at)}`] : []),
    m.available, `${m.reason}: ${m.reasons[result.primary.reason_code]}`, `${m.checked}: ${utc(result.observed_at)}`,
  ].join("\n");
}
export function scannerNotes(feed: ScannerFeed, language: Language): string[] {
  const m = st(language), notes: string[] = [];
  if (!feed.results.length) {
    notes.push(m.empty);
    if (feed.state !== "EMPTY" && feed.state !== "READY") notes.push(m[feed.state]);
  } else if (feed.errors || feed.stale || feed.waiting) notes.push(m.partial);
  if (feed.missing_history) notes.push(m.history);
  return notes;
}
