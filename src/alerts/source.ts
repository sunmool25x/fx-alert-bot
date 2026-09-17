import { Decimal } from "decimal.js";
import { shortId } from "../database/store.js";
import type { MarketData } from "../sera/service.js";
import type { Token } from "../sera/schemas.js";
import { fromRawUnits, toRawUnits } from "../sera/precision.js";
import { AppError, errorCode } from "../utils/errors.js";
import { marketKey, type AlertSpec, type Observation } from "./types.js";
const Exact = Decimal.clone({ precision: 80 });

export function normalizedAmount(input: string, token: Token): string {
  if (input.length > 100 || !/^\d+(\.\d+)?$/.test(input)) throw new AppError("INVALID_AMOUNT");
  let amount: bigint;
  try { amount = toRawUnits(input, token.decimals); } catch { throw new AppError("INVALID_AMOUNT"); }
  if (amount <= 0n || amount >= 2n ** 256n) throw new AppError("INVALID_AMOUNT");
  if (token.min_trade_amount_raw && amount < BigInt(token.min_trade_amount_raw)) throw new AppError("AMOUNT_BELOW_MIN");
  return fromRawUnits(amount, token.decimals);
}
export function positiveThreshold(input: string): string {
  if (input.length > 40 || !/^\d+(\.\d+)?$/.test(input) || new Decimal(input).lte(0)) throw new AppError("INVALID_THRESHOLD");
  return new Decimal(input).toFixed();
}
export class QuoteObservationSource {
  constructor(private market: MarketData, private now = Date.now) {}
  async sample(spec: AlertSpec, registry?: Token[]): Promise<Observation> {
    const tokens = registry ?? await this.market.tokens();
    const from = tokens.find(t => t.address.toLowerCase() === spec.from_token.toLowerCase());
    const to = tokens.find(t => t.address.toLowerCase() === spec.to_token.toLowerCase());
    if (!from || !to || from.address.toLowerCase() === to.address.toLowerCase()) throw new AppError("UNSUPPORTED_PAIR");
    normalizedAmount(spec.amount, from);
    let available = false, rate: string | null = null, output: string | null = null;
    let gasUsd: string | null = null, expiresAt: number | null = null;
    try {
      const card = await this.market.quote(from, to, spec.amount);
      // The MarketService checks the quote's wallet, token and amount bindings.
      if (card.expiresAt <= this.now()) throw new AppError("QUOTE_STALE");
      const received = new Exact(card.output);
      if (!received.isFinite() || received.isNegative()) throw new AppError("SCHEMA_MISMATCH");
      if (card.executableRoute !== received.gt(0)) throw new AppError("SCHEMA_MISMATCH");
      available = card.executableRoute;
      output = card.output; gasUsd = card.gasUsd ?? null; expiresAt = card.expiresAt;
      if (available) rate = received.div(spec.amount).toFixed();
    } catch (e) {
      // ONLY a typed, verified no-liquidity response means known unavailable.
      // Timeout, malformed quote, min-size, unsupported pair and 429/503 are unknown.
      if (errorCode(e) !== "NO_LIQUIDITY") throw e;
      if (e instanceof AppError && e.status !== undefined && e.status !== 400)
        throw new AppError("UNAVAILABLE", e.status);
    }
    return { id: shortId(), market_key: marketKey(spec), network: "sepolia", from_token: spec.from_token,
      to_token: spec.to_token, base: spec.base, quote: spec.quote, amount: spec.amount,
      observed_at: this.now(), available, rate, output, gas_usd: gasUsd, expires_at: expiresAt };
  }
}
