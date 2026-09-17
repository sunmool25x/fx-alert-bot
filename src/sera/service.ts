import { Decimal } from "decimal.js";
import type { Config } from "../config/index.js";
import { AppError, errorCode } from "../utils/errors.js";
import { SeraClient } from "./client.js";
import type { Token, Market, FxRate, Quote } from "./schemas.js";
import { fromRawUnits, toRawUnits, validateAmount } from "./precision.js";
Decimal.set({ precision: 80 });
export const PROBE_OWNER = "0x000000000000000000000000000000000000dEaD";
export interface QuoteCard {
  from: Token; to: Token; amount: string; output: string; rate: string;
  expiresAt: number; executableRoute: boolean; gasUsd?: string;
  legs?: number; quote: Quote;
}
export interface DepthRow { amount: string; card?: QuoteCard; status: string }
export interface MarketData {
  tokens(): Promise<Token[]>; markets(): Promise<Market[]>;
  reference(from: Token, to: Token): Promise<FxRate>;
  quote(from: Token, to: Token, amount: string): Promise<QuoteCard>;
  depth(from: Token, to: Token): Promise<DepthRow[]>;
}
export function percentageChange(current: string, previous: string): string {
  if (new Decimal(previous).lte(0)) throw new AppError("INVALID_AMOUNT");
  return new Decimal(current).minus(previous).div(previous).mul(100).toFixed(4);
}
export class MarketService implements MarketData {
  constructor(private client: SeraClient, private config: Config) {}
  async tokens() { await this.client.preflight(); return (await this.client.getTokens()).tokens; }
  async markets() { await this.client.preflight(); return (await this.client.getMarkets()).markets; }
  async reference(from: Token, to: Token): Promise<FxRate> {
    await this.client.preflight();
    const rate = await this.client.getRate(from.currency, to.currency);
    if (rate.pair !== from.currency + "/" + to.currency) throw new AppError("SCHEMA_MISMATCH");
    return rate;
  }
  async quote(from: Token, to: Token, amount: string): Promise<QuoteCard> {
    await this.client.preflight();
    if (from.address.toLowerCase() === to.address.toLowerCase()) throw new AppError("INVALID_PAIR");
    if (amount.length > 100 || !validateAmount(amount, from.decimals).ok) throw new AppError("INVALID_AMOUNT");
    const input = toRawUnits(amount, from.decimals);
    if (input <= 0n || input >= 2n ** 256n) throw new AppError("INVALID_AMOUNT");
    if (from.min_trade_amount_raw && input < BigInt(from.min_trade_amount_raw)) throw new AppError("AMOUNT_BELOW_MIN");
    const time = await this.client.getTime();
    const q = await this.client.getQuote({
      from_token: from.address, to_token: to.address, from_amount: input.toString(),
      owner_address: PROBE_OWNER, recipient: PROBE_OWNER,
      expiration: time.timestamp + 300, gas_mode: "receive_less",
    });
    const r = q.route_params;
    if (r.taker.toLowerCase() !== PROBE_OWNER.toLowerCase() ||
      r.recipient.toLowerCase() !== PROBE_OWNER.toLowerCase() ||
      r.inputToken.toLowerCase() !== from.address.toLowerCase() ||
      r.outputToken.toLowerCase() !== to.address.toLowerCase() ||
      BigInt(r.maxInputAmount) !== input || BigInt(r.initialDepositAmount) !== input)
      throw new AppError("QUOTE_BINDING_MISMATCH");
    if (q.expires_at <= time.timestamp || r.deadline <= time.timestamp) throw new AppError("QUOTE_STALE");
    const humanAmount = fromRawUnits(input, from.decimals);
    const output = fromRawUnits(r.minOutputAmount, to.decimals);
    return { from, to, amount: humanAmount, output,
      rate: new Decimal(output).div(humanAmount).toSignificantDigits(14).toString(),
      expiresAt: q.expires_at * 1000, executableRoute: BigInt(r.minOutputAmount) > 0n,
      gasUsd: q.fee_breakdown?.gas_cost_usd, legs: q.route_metadata?.leg_count, quote: q };
  }
  async depth(from: Token, to: Token): Promise<DepthRow[]> {
    const rows: DepthRow[] = [];
    const sizes = [...this.config.probeSizes].sort((a, b) => new Decimal(a).cmp(b));
    for (const amount of sizes) {
      try {
        const card = await this.quote(from, to, amount);
        rows.push({ amount, card, status: card.executableRoute ? "OK" : "NO_LIQUIDITY" });
      } catch (e) {
        const code = errorCode(e);
        if (!["NO_LIQUIDITY", "AMOUNT_BELOW_MIN", "INVALID_AMOUNT"].includes(code)) throw e;
        rows.push({ amount, status: code });
      }
    }
    return rows;
  }
}
