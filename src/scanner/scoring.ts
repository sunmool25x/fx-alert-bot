import type { ScannerResult, ScannerSignal } from "./types.js";
const lexical = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
export const compareSignals = (a: ScannerSignal, b: ScannerSignal) => b.notability_score - a.notability_score ||
  lexical(a.signal_type, b.signal_type) || (a.comparison_window ?? 0) - (b.comparison_window ?? 0);
export function rankAndConsolidate(results: ScannerResult[], max: number): ScannerResult[] {
  // A card uses one explicit amount. Never mix rate baselines from different sizes.
  const ordered = [...results].sort((a, b) => b.notability_score - a.notability_score ||
    b.observed_at - a.observed_at || lexical(a.key, b.key));
  const seen = new Set<string>();
  return ordered.filter(result => {
    const pair = [result.spec.network, result.spec.from_token.toLowerCase(), result.spec.to_token.toLowerCase()].join(":");
    if (seen.has(pair)) return false;
    seen.add(pair); return true;
  }).slice(0, max);
}
