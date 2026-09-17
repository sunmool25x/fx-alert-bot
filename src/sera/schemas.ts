import { z } from "zod";
export const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
export const raw = z.string().regex(/^\d+$/).max(78).refine(s => /^\d+$/.test(s) && s.length <= 78 && BigInt(s) < 2n ** 256n);
const decimal = z.string().regex(/^-?\d+(\.\d+)?$/).max(150);
const positiveDecimal = decimal.refine(s => Number.isFinite(Number(s)) && Number(s) > 0);
export const tokenSchema = z.object({
  address, symbol: z.string().regex(/^[A-Za-z0-9_-]{1,20}$/),
  currency: z.string().regex(/^[A-Z]{3}$/), decimals: z.number().int().min(0).max(36),
  min_trade_amount_raw: raw.optional(), min_trade_amount: decimal.optional(),
}).passthrough();
export const tokensSchema = z.object({ tokens: z.array(tokenSchema).min(1).max(1000) });
export const marketSchema = z.object({
  symbol: z.string().max(50), base_address: address, quote_address: address,
  base_symbol: z.string().max(20), quote_symbol: z.string().max(20),
  tick_precision: z.number().int().min(0).max(36),
  quantity_precision: z.number().int().min(0).max(36),
}).passthrough();
export const marketsSchema = z.object({ markets: z.array(marketSchema).max(100000) });
export const configSchema = z.object({
  chain_id: z.number().int().positive(),
  eip712_domain: z.object({ chainId: z.number().int().positive() }).passthrough(),
}).passthrough();
export const timeSchema = z.object({ timestamp: z.number().int().positive() });
export const rateSchema = z.object({
  pair: z.string().regex(/^[A-Z]{3}\/[A-Z]{3}$/), rate: positiveDecimal,
  as_of: z.number().positive(), change_pct: decimal.nullable().optional(),
  rate_24h_ago: decimal.nullable().optional(), as_of_24h_ago: z.number().nullable().optional(),
}).passthrough();
export const quoteSchema = z.object({
  uuid: z.string().uuid(), expires_at: z.number().int().positive(),
  route_params: z.object({
    taker: address, inputToken: address, outputToken: address, recipient: address,
    maxInputAmount: raw, minOutputAmount: raw, initialDepositAmount: raw,
    uuid: raw, deadline: z.number().int().positive(),
  }).passthrough(),
  fee_breakdown: z.object({
    gas_cost_usd: decimal.optional(), gas_cost_from_token: decimal.optional(),
  }).passthrough().nullable().optional(),
  quote_breakdown: z.object({
    output_amount_before_gas: raw.optional(), output_amount_after_gas: raw.optional(),
  }).passthrough().nullable().optional(),
  route_metadata: z.object({ leg_count: z.number().int().positive().optional() }).passthrough().optional(),
  permit: z.unknown().optional(),
}).passthrough();
export type Token = z.infer<typeof tokenSchema>;
export type Market = z.infer<typeof marketSchema>;
export type FxRate = z.infer<typeof rateSchema>;
export type Quote = z.infer<typeof quoteSchema>;
