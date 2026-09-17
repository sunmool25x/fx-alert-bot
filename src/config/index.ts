import { resolve } from "node:path";
import { z } from "zod";
import { parseProbes } from "../scanner/config.js";
import { walletConfig } from "../wallet/config.js";
import { analyticsConfig } from "../analytics/config.js";

const integer = (fallback: number, min: number, max: number) =>
  z.coerce.number().int().min(min).max(max).default(fallback);
const bool = z.enum(["true", "false"]).default("false").transform(v => v === "true");
const percent = (fallback: string) => z.string().regex(/^\d+(\.\d+)?$/).max(24)
  .refine(v => Number(v) > 0 && Number(v) <= 100).default(fallback);
const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().default(""),
  SERA_NETWORK: z.enum(["sepolia", "mainnet"]).default("sepolia"),
  ENABLE_MAINNET: bool, ENABLE_TESTNET_EXECUTION: bool,
  DATABASE_PATH: z.string().min(1).default("./data/bot.sqlite"),
  SERA_REQUEST_INTERVAL_MS: integer(500, 250, 60000),
  SERA_TIMEOUT_MS: integer(15000, 1000, 30000),
  SERA_RETRIES: integer(2, 0, 3),
  SERA_MAX_RETRY_WAIT_MS: integer(2000, 0, 5000),
  SERA_RATE_CACHE_MS: integer(10000, 0, 60000),
  SERA_REFERENCE_MAX_AGE_SECONDS: integer(900, 30, 86400),
  LIQUIDITY_PROBE_SIZES: z.string().default("100,1000,10000"),
  CONVERSATION_TTL_SECONDS: integer(900, 60, 3600),
  MARKET_POLL_INTERVAL_MS: z.coerce.number().int().min(60000).max(3600000).optional(),
  MARKET_POLL_INTERVAL_SECONDS: integer(60, 60, 3600),
  ALERT_COOLDOWN_SECONDS: integer(3600, 60, 604800),
  ALERT_MAX_GROUPS_PER_CYCLE: integer(10, 1, 20),
  ALERT_MAX_PER_USER: integer(20, 1, 100),
  ALERT_MAX_TOTAL: integer(500, 1, 5000),
  ALERT_BASELINE_TOLERANCE_SECONDS: integer(300, 30, 600),
  ALERT_OBSERVATION_RETENTION_HOURS: integer(72, 26, 720),
  ALERT_NOTIFICATION_TTL_SECONDS: integer(900, 60, 86400),
  ALPHA_ENABLED: z.enum(["true", "false"]).default("true").transform(v => v === "true"),
  ALPHA_PROBES: z.string().max(1500).default("USDC/XSGD:100,USDC/EURC:100,XIDR/USDT:1000000"),
  ALPHA_MAX_RESULTS: integer(12, 1, 12),
  ALPHA_DATA_MAX_AGE_SECONDS: integer(180, 30, 900),
  ALPHA_MOVEMENT_1H_PCT: percent("0.5"),
  ALPHA_MOVEMENT_6H_PCT: percent("1"),
  ALPHA_MOVEMENT_24H_PCT: percent("2"),
  ALPHA_RECOVERY_MAX_AGE_SECONDS: integer(900, 60, 86400),
});
export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const e = envSchema.parse(env);
  if (e.SERA_NETWORK !== "sepolia" || e.ENABLE_MAINNET)
    throw new Error("Phase 4 supports Sepolia only. Mainnet is disabled.");
  const wallet = walletConfig(env);
  const probeSizes = e.LIQUIDITY_PROBE_SIZES.split(",").map(s => s.trim());
  if (probeSizes.length < 1 || probeSizes.length > 5 ||
      probeSizes.some(s => !/^\d+(\.\d+)?$/.test(s) || !Number.isFinite(Number(s)) || Number(s) <= 0 || s.length > 40))
    throw new Error("LIQUIDITY_PROBE_SIZES needs 1–5 positive decimal amounts in source-token units.");
  return {
    analytics:analyticsConfig(env),
    wallet, botToken: e.TELEGRAM_BOT_TOKEN, network: e.SERA_NETWORK as "sepolia" | "mainnet",
    chainId: e.SERA_NETWORK === "sepolia" ? 11155111 : 1,
    baseUrl: e.SERA_NETWORK === "sepolia" ? "https://api.testnet.sera.cx/api/v1" : "https://api.sera.cx/api/v1",
    databasePath: resolve(e.DATABASE_PATH), requestIntervalMs: e.SERA_REQUEST_INTERVAL_MS,
    timeoutMs: e.SERA_TIMEOUT_MS, retries: e.SERA_RETRIES,
    maxRetryWaitMs: e.SERA_MAX_RETRY_WAIT_MS, rateCacheMs: e.SERA_RATE_CACHE_MS,
    referenceMaxAgeSeconds: e.SERA_REFERENCE_MAX_AGE_SECONDS,
    probeSizes, conversationTtlMs: e.CONVERSATION_TTL_SECONDS * 1000,
    // Explicit seconds setting wins; preserve the existing Phase 1 milliseconds variable.
    pollIntervalMs: env.MARKET_POLL_INTERVAL_SECONDS !== undefined ? e.MARKET_POLL_INTERVAL_SECONDS * 1000
      : e.MARKET_POLL_INTERVAL_MS ?? e.MARKET_POLL_INTERVAL_SECONDS * 1000,
    cooldownMs: e.ALERT_COOLDOWN_SECONDS * 1000,
    alertMaxGroups: e.ALERT_MAX_GROUPS_PER_CYCLE, alertMaxPerUser: e.ALERT_MAX_PER_USER,
    alertMaxTotal: e.ALERT_MAX_TOTAL, baselineToleranceMs: e.ALERT_BASELINE_TOLERANCE_SECONDS * 1000,
    observationRetentionMs: e.ALERT_OBSERVATION_RETENTION_HOURS * 3600000,
    notificationTtlMs: e.ALERT_NOTIFICATION_TTL_SECONDS * 1000,
    alphaEnabled: e.ALPHA_ENABLED, alphaProbes: parseProbes(e.ALPHA_PROBES),
    alphaMaxResults: e.ALPHA_MAX_RESULTS, alphaDataMaxAgeMs: e.ALPHA_DATA_MAX_AGE_SECONDS * 1000,
    alphaMovement: { 3600: e.ALPHA_MOVEMENT_1H_PCT, 21600: e.ALPHA_MOVEMENT_6H_PCT, 86400: e.ALPHA_MOVEMENT_24H_PCT },
    alphaRecoveryMaxAgeMs: e.ALPHA_RECOVERY_MAX_AGE_SECONDS * 1000,
  };
}
export type Config = ReturnType<typeof loadConfig>;
