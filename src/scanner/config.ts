import { Decimal } from "decimal.js";
import type { ProbeConfig } from "./types.js";

export function parseProbes(input: string): ProbeConfig[] {
  const entries = input.split(",").map(s => s.trim());
  if (!entries.length || entries.length > 12) throw new Error("ALPHA_PROBES requires 1–12 directed pair:amount entries.");
  const probes = entries.map(value => {
    const match = /^([A-Za-z0-9_-]{1,20})\/([A-Za-z0-9_-]{1,20}):(\d+(?:\.\d+)?)$/.exec(value);
    if (!match || match[3]!.length > 40 || new Decimal(match[3]!).lte(0)) throw new Error("Invalid ALPHA_PROBES entry.");
    const base = match[1]!.toUpperCase(), quote = match[2]!.toUpperCase(), amount = new Decimal(match[3]!).toFixed();
    if (base === quote) throw new Error("ALPHA_PROBES requires different source/destination tokens.");
    return { id: `${base}/${quote}:${amount}`, base, quote, amount };
  });
  if (new Set(probes.map(p => p.id)).size !== probes.length) throw new Error("Duplicate ALPHA_PROBES entry.");
  return probes;
}
