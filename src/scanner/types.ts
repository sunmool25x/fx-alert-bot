import type { AlertSpec, Observation } from "../alerts/types.js";

export interface ProbeConfig { id: string; base: string; quote: string; amount: string }
export interface ScannerProbe {
  id: string; spec: AlertSpec | null; market_key: string | null;
  last_attempt_at: number | null; last_error: string | null;
  observed_at: number | null; last_available: number | null; recovery_at: number | null;
  observation?: Observation;
}
export interface ObservationJob { id: string; spec: AlertSpec; last_attempt_at: number | null }
// The existing monitor owns timing, request budget, grouping and history insertion.
export interface ObservationConsumer {
  jobs(): Promise<ObservationJob[]>;
  observed(job: ObservationJob, observation: Observation): Promise<void>;
  failed(job: ObservationJob, code: string): Promise<void>;
}
export type SignalType = "RATE_MOVEMENT" | "QUOTE_AVAILABLE" | "AVAILABILITY_RECOVERY";
export interface ScannerSignal {
  signal_type: SignalType; reason_code: "MOVEMENT_THRESHOLD" | "POSITIVE_QUOTE" | "QUOTE_RETURNED";
  detected_at: number; notability_score: number;
  comparison_window?: number; movement_pct?: string; threshold_pct?: string;
  supporting_data: { baseline_at?: number; baseline_rate?: string; recovered_at?: number; output: string };
}
export interface ScannerResult {
  key: string; pair: string; spec: AlertSpec; current_rate: string; probe_amount: string;
  observed_at: number; primary: ScannerSignal; signals: ScannerSignal[]; notability_score: number;
}
export interface ScannerFeed {
  results: ScannerResult[]; configured: number; fresh: number; unavailable: number;
  errors: number; stale: number; waiting: number; missing_history: number;
  state: "READY" | "WARMING" | "STALE" | "UNAVAILABLE" | "NO_QUOTES" | "EMPTY" | "DISABLED";
}
