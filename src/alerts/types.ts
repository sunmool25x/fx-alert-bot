export type AlertType = "RATE_ABOVE" | "RATE_BELOW" | "QUOTE_AVAILABLE" | "RATE_MOVEMENT" | "MARKET_RECOVERY";
export interface AlertSpec {
  network: "sepolia"; from_token: string; to_token: string;
  base: string; quote: string; amount: string; type: AlertType;
  threshold: string | null; window_seconds: number | null;
}
export interface Alert extends AlertSpec {
  id: string; telegram_user_id: string; status: "active";
  created_at: number; last_evaluated_at: number | null;
  last_observation_at: number | null; last_triggered_at: number | null;
  cooldown_until: number; last_condition: number | null;
  evaluation_status: string; sequence: number;
}
export interface Observation {
  id: string; market_key: string; network: "sepolia";
  from_token: string; to_token: string; base: string; quote: string; amount: string;
  observed_at: number; available: boolean; rate: string | null;
  output: string | null; gas_usd: string | null; expires_at: number | null;
}
export interface Evaluation {
  condition: boolean | null;
  status: "OK" | "WAITING_HISTORY" | "NO_LIQUIDITY";
  reason: "TARGET_ABOVE" | "TARGET_BELOW" | "SIZE_AVAILABLE" | "RATE_MOVEMENT" | "MARKET_RECOVERED";
  movement_pct?: string; baseline_at?: number; baseline_rate?: string;
}
export interface TriggerPayload { alert: Alert; observation: Observation; evaluation: Evaluation }
export interface Delivery {
  id: string; trigger_id: string; alert_id: string; telegram_user_id: string;
  status: string; attempts: number; created_at: number; lease_until: number;
  payload: TriggerPayload;
}
export interface AlertDraft {
  type?: AlertType; amount?: string; threshold?: string; window_seconds?: number;
  snapshot?: Observation;
}
export function marketKey(spec: Pick<AlertSpec, "network" | "from_token" | "to_token" | "amount">): string {
  return [spec.network, spec.from_token.toLowerCase(), spec.to_token.toLowerCase(), spec.amount].join(":");
}
