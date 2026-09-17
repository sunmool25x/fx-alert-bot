/**
 * Adapted from Haruki Kondo's MIT-licensed SeraProtocol-Sample:
 * de12dc8883a7fb2cdf6dd318b3860311a7b8ae44/telegram-bot/src/sera/precision.ts.
 * Copyright (c) 2026 Haruki Kondo. Full MIT notice: THIRD_PARTY_NOTICES.md.
 * Adaptation: zero-decimal formatting correction; service boundary enforces
 * positive amounts, finite input length, token precision and uint256 limits.
 */
export interface AmountCheck {
  ok: boolean; reason?: "not_a_number" | "not_positive" | "too_many_decimals";
}
export function validateAmount(input: string, maxDecimals: number): AmountCheck {
  const trimmed = input.trim().replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return { ok: false, reason: "not_a_number" };
  const [, frac = ""] = trimmed.split(".");
  if (Number(trimmed) <= 0 && !/[1-9]/.test(trimmed)) return { ok: false, reason: "not_positive" };
  if (frac.length > maxDecimals) return { ok: false, reason: "too_many_decimals" };
  return { ok: true };
}
export function toRawUnits(amount: string, decimals: number): bigint {
  const trimmed = amount.trim().replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(trimmed)) throw new Error("Invalid amount");
  const [whole, frac = ""] = trimmed.split(".");
  if (frac.length > decimals) throw new Error("Extra precision");
  return BigInt(whole!) * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, "0") || "0");
}
export function fromRawUnits(raw: bigint | string, decimals: number): string {
  const value = typeof raw === "string" ? BigInt(raw) : raw;
  const negative = value < 0n; const abs = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = decimals === 0 ? "" : (abs % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  const s = frac ? `${whole}.${frac}` : whole.toString();
  return negative ? `-${s}` : s;
}
export function formatDisplayAmount(human: string, maxShownDecimals = 6): string {
  const [whole, frac = ""] = human.split(".");
  if (!frac) return whole!;
  const shown = frac.slice(0, maxShownDecimals).replace(/0+$/, "");
  return shown ? `${whole}.${shown}` : whole!;
}
