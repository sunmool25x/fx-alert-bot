import { Decimal } from "decimal.js";
import type { Language } from "../database/store.js";
import { at, alertReasons } from "../i18n/alerts.js";
import { t } from "../i18n/messages.js";
import { utc, type View } from "../bot/view.js";
import type { Alert, AlertSpec, Observation, TriggerPayload } from "./types.js";

export const shownRate = (rate: string) => new Decimal(rate).toSignificantDigits(14).toFixed();
export function conditionText(spec: AlertSpec, language: Language): string {
  const m = at(language);
  if (spec.type === "RATE_ABOVE" || spec.type === "RATE_BELOW")
    return `1 ${spec.base} ${spec.type === "RATE_ABOVE" ? "≥" : "≤"} ${spec.threshold} ${spec.quote}`;
  if (spec.type === "RATE_MOVEMENT") return `${spec.window_seconds! / 3600} ${m.hour} · ±${spec.threshold}%`;
  return spec.type === "MARKET_RECOVERY" ? m.recovery : m.sizeCondition;
}
export function snapshotText(snapshot: Observation | undefined, language: Language): string {
  const m = at(language);
  if (!snapshot) return m.previewFailed;
  if (!snapshot.available || !snapshot.rate) return m.noLiquidity;
  return `${m.current}:\n1 ${snapshot.base} = ${shownRate(snapshot.rate)} ${snapshot.quote}\n${m.checked}: ${utc(snapshot.observed_at)}`;
}
export function summary(spec: AlertSpec, language: Language): string {
  const m = at(language);
  return `${spec.base} → ${spec.quote}\n${m[spec.type]}\n${m.sample}: ${spec.amount} ${spec.base}\n${conditionText(spec, language)}`;
}
export function stateText(alert: Alert, language: Language): string {
  const m = at(language);
  if (alert.evaluation_status === "WAITING_HISTORY") return m.pausedHistory + " · " + m.history;
  if (alert.evaluation_status === "NO_LIQUIDITY") return m.noLiquidity;
  if (alert.evaluation_status === "WAITING_FIRST_SAMPLE") return m.waiting;
  if (alert.evaluation_status !== "OK") return m.errorState;
  return alert.last_condition === 1 ? m.trueState : alert.last_condition === 0 ? m.falseState : m.waiting;
}
export function notificationView(payload: TriggerPayload, language: Language,triggerId?:string): View {
  const { alert, observation, evaluation } = payload; const m = at(language);
  return {
    text: [m.detected, m.condition + "\n" + summary(alert, language), "", snapshotText(observation, language), "",
      m.reason + ": " + alertReasons[language][evaluation.reason],
      ...(evaluation.movement_pct !== undefined ? [m.measured + ": " + evaluation.movement_pct + "%",
        m.baseline + ": " + utc(evaluation.baseline_at!),
        `1 ${alert.base} = ${shownRate(evaluation.baseline_rate!)} ${alert.quote}`] : []),
      m.at + ": " + utc(observation.observed_at), "", m.changed, m.basis, m.probe, t(language).testnet,
    ].join("\n"),
    buttons: [[{ text: m.refresh, data: "a:q:" + alert.id+(triggerId?":"+triggerId:"") }], [{ text: m.manage, data: "a:list:0" }]],
  };
}
