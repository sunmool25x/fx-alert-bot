import type { Language } from "../database/store.js";
import { t } from "../i18n/messages.js";
import { glossary } from "../i18n/glossary.js";
import { branding } from "../i18n/branding.js";
import { formatDisplayAmount } from "../sera/precision.js";
import type { QuoteCard, DepthRow } from "../sera/service.js";
import type { Token, FxRate } from "../sera/schemas.js";

export interface Button { text: string; data: string; webApp?:string; url?:string }
export interface View { text: string; buttons?: Button[][] }
const display = (s: string) => formatDisplayAmount(s, 8);
export const utc = (ms: number) => new Date(ms).toISOString().replace("T", " ").replace(".000Z", " UTC");
export function quoteView(card: QuoteCard, language: Language, intent: string, network: string): View {
  const m = t(language);
  const lines = [
    (network === "sepolia" ? m.quoteTitle : "Quote") + " · " + (network === "sepolia" ? m.testnet : m.mainnet),
    card.from.symbol + " → " + card.to.symbol, "",
    glossary[language].quote, "",
    m.spend + ": " + card.amount + " " + card.from.symbol,
    m.receive + ": " + card.output + " " + card.to.symbol,
    m.rate + ": 1 " + card.from.symbol + " = " + display(card.rate) + " " + card.to.symbol,
    card.gasUsd ? m.gas + ": " + display(card.gasUsd) : m.noFee,
    m.expiry + ": " + utc(card.expiresAt), "",
    ...(!card.executableRoute ? [m.noRoute, ""] : []), m.quoteNote, "", branding.quote,
  ];
  return { text: lines.join("\n"), buttons: [[{ text: m.refresh, data: "refresh:" + intent }], [{ text: m.markets, data: "markets:0:" }]] };
}
export function rateView(from: Token, to: Token, rate: FxRate, language: Language, maxAge: number, now: number): View {
  const m = t(language);
  return { text: [
    m.referenceTitle, from.symbol + " → " + to.symbol + " (" + rate.pair + ")",
    "1 " + from.currency + " = " + display(rate.rate) + " " + to.currency,
    rate.change_pct == null ? "" : "24h: " + rate.change_pct + "%",
    m.updated + ": " + utc(rate.as_of * 1000),
    now / 1000 - rate.as_of > maxAge || rate.as_of * 1000 > now + 60000 ? m.stale : "",
    "", m.referenceNote,
  ].filter(Boolean).join("\n") };
}
export function depthView(from: Token, to: Token, rows: DepthRow[], language: Language): View {
  const m = t(language);
  return { text: [
    m.depthTitle + "\n" + from.symbol + " → " + to.symbol, m.depthNote, "",
    ...rows.map(r => r.amount + " " + from.symbol + ": " +
      (r.status === "OK" ? m.enough + " → " + r.card!.output + " " + to.symbol + " (" + m.rate + ": " + display(r.card!.rate) + ")"
        : r.status === "AMOUNT_BELOW_MIN" ? m.belowMin : r.status === "INVALID_AMOUNT" ? m.invalidProbe : m.noLiquidity)),
    "", m.depthEnd,
  ].join("\n") };
}
