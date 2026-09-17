import { z } from "zod";
import type { Config } from "../config/index.js";
import { Cache } from "../utils/cache.js";
import { AppError } from "../utils/errors.js";
import { RequestQueue, retryAfterMs, sleep, type Sleep } from "../utils/pacing.js";
import { tokensSchema, marketsSchema, configSchema, timeSchema, rateSchema, quoteSchema } from "./schemas.js";

type Fetch = typeof fetch;
export interface QuoteRequest {
  from_token: string; to_token: string; from_amount: string;
  owner_address: string; recipient: string; expiration: number; gas_mode: "receive_less";
}
export class SeraClient {
  private cache: Cache;
  private queue: RequestQueue;
  constructor(private config: Config, private fetcher: Fetch = fetch,
    private now = Date.now, private wait: Sleep = sleep) {
    this.cache = new Cache(now);
    this.queue = new RequestQueue(config.requestIntervalMs, now, wait);
  }
  private async call<T>(path: string, schema: z.ZodType<T>, body?: unknown): Promise<T> {
    // Fixed public reads plus /swap, exposed only through the gated execution capability below.
    const allowed = new Set(["/tokens", "/markets", "/config", "/system/time", "/health", "/fx/rate", "/swap/quote", "/swap"]);
    const url = new URL(this.config.baseUrl + path);
    const relative = url.pathname.replace("/api/v1", "");
    if (!allowed.has(relative)) throw new AppError("UNSUPPORTED");
    const hosts = this.config.network === "sepolia"
      ? ["api.testnet.sera.cx"] : ["api.sera.cx"];
    if (url.protocol !== "https:" || !hosts.includes(url.hostname)) throw new AppError("NETWORK_MISMATCH");
    for (let attempt = 0; ; attempt++) {
      const result = await this.queue.run(async () => {
        let response: Response;
        try {
          response = await this.fetcher(url, {
            method: body ? "POST" : "GET", redirect: "error",
            headers: { accept: "application/json", ...(body ? { "content-type": "application/json" } : {}) },
            body: body ? JSON.stringify(body) : undefined,
            signal: AbortSignal.timeout(this.config.timeoutMs),
          });
        } catch { throw new AppError("UNAVAILABLE"); }
        if (response.status === 429 || response.status === 503) {
          const delay = retryAfterMs(response.headers.get("retry-after"), this.now());
          this.queue.block(delay);
          await response.body?.cancel();
          return { retry: true as const, delay, status: response.status };
        }
        if (response.headers.get("content-length") &&
          Number(response.headers.get("content-length")) > 8_000_000) throw new AppError("SCHEMA_MISMATCH");
        let data: unknown;
        try {
          const reader = response.body?.getReader();
          if (!reader) throw new Error("empty");
          const chunks: Uint8Array[] = []; let size = 0;
          while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            size += chunk.value.byteLength;
            if (size > 8_000_000) { await reader.cancel(); throw new Error("size"); }
            chunks.push(chunk.value);
          }
          data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        } catch { throw new AppError(response.ok ? "SCHEMA_MISMATCH" : "UNAVAILABLE", response.status); }
        if (!response.ok) {
          const d = data as { detail?: unknown };
          const detail = d?.detail;
          const nested = detail && typeof detail === "object" ? detail as Record<string, unknown> : {};
          const candidate = nested.error_code ?? nested.code ?? nested.error;
          const known = ["NO_LIQUIDITY", "AMOUNT_BELOW_MIN", "QUOTE_STALE", "SLIPPAGE_EXCEEDED"];
          const code = typeof candidate === "string" ? candidate.toUpperCase() : "";
          throw new AppError(known.includes(code) ? code : "UNAVAILABLE", response.status);
        }
        const parsed = schema.safeParse(data);
        if (!parsed.success) throw new AppError("SCHEMA_MISMATCH");
        return { retry: false as const, data: parsed.data };
      });
      if (!result.retry) return result.data;
      // GETs only; quote POSTs mint UUIDs and are never automatically retried.
      if (body || attempt >= this.config.retries || result.delay > this.config.maxRetryWaitMs)
        throw new AppError(result.status === 429 ? "RATE_LIMITED" : "UNAVAILABLE", result.status);
      await this.wait(result.delay);
    }
  }
  getTokens() { return this.cache.get("tokens", 300000, () => this.call("/tokens", tokensSchema)); }
  getMarkets() { return this.cache.get("markets", 600000, () => this.call("/markets", marketsSchema)); }
  getConfig() { return this.cache.get("config", 60000, () => this.call("/config", configSchema)); }
  getTime() { return this.cache.get("time", 3000, () => this.call("/system/time", timeSchema)); }
  getRate(base: string, quote: string) {
    if (!/^[A-Z]{3}$/.test(base) || !/^[A-Z]{3}$/.test(quote)) throw new AppError("INVALID_PAIR");
    return this.cache.get("rate:" + base + "/" + quote, this.config.rateCacheMs,
      () => this.call("/fx/rate?base=" + base + "&quote=" + quote, rateSchema));
  }
  getQuote(request: QuoteRequest) { return this.call("/swap/quote", quoteSchema, request); }
  // Only the trade orchestrator receives this capability. MarketData has no submission method.
  executionTransport() {
    return { submit: async (user: string, body: {uuid:string;signature:string;permit_signature:string;permit_deadline:number}) => {
      if(this.config.network!=="sepolia" || !this.config.wallet.enabled || !this.config.wallet.users.includes(user)) throw new AppError("EXECUTION_DISABLED");
      return this.call("/swap",z.object({success:z.literal(true),trade_id:z.string().uuid(),status:z.string().max(40)}),body);
    }};
  }
  liveConfig() {return this.call("/config",configSchema);}
  liveTime() {return this.call("/system/time",timeSchema);}
  health() {return this.call("/health",z.object({executor_id:z.number().int().min(0).max(15),signature_ready:z.boolean()}));}
  async preflight(): Promise<void> {
    const config = await this.getConfig();
    if (config.chain_id !== this.config.chainId || config.eip712_domain.chainId !== this.config.chainId)
      throw new AppError("NETWORK_MISMATCH");
  }
}
