import { z } from "zod";
const https = z.string().url().refine(v => { const u = new URL(v); return u.protocol === "https:" && !u.username && !u.password && !u.hash; });
const optionalHttps = z.union([z.literal(""), https]).default("");
const bool = z.enum(["true", "false"]).default("false").transform(v => v === "true");
export function walletConfig(env: NodeJS.ProcessEnv) {
  const s = z.object({
    ENABLE_TESTNET_EXECUTION: bool,
    ENABLE_TESTNET_PERMIT_ONLY: bool,
    TESTNET_PERMIT_WALLET: z.union([z.literal(''),z.string().regex(/^0x[0-9a-fA-F]{40}$/)]).default(''),
    PERMIT_STORAGE_KEY: z.union([z.literal(''),z.string().regex(/^[0-9a-fA-F]{64}$/)]).default(''),
    EXECUTION_USER_IDS: z.string().regex(/^(\d{1,20}(,\d{1,20})*)?$/).default(""),
    SEPOLIA_RPC_URL: optionalHttps, SIGNING_ORIGIN: optionalHttps,
    WALLETCONNECT_PROJECT_ID: z.union([z.literal(""), z.string().regex(/^[a-f0-9]{32}$/i)]).default(""),
    SIGNING_PORT: z.coerce.number().int().min(1024).max(65535).default(8787),
    WALLET_SESSION_SECONDS: z.coerce.number().int().min(300).max(1800).default(900),
    SETTLEMENT_POLL_SECONDS: z.coerce.number().int().min(30).max(300).default(60),
    TEST_USDC_MAX_AMOUNT: z.string().regex(/^\d+(\.\d{1,6})?$/).refine(v => Number(v) > 0 && Number(v) <= 100).default("100"),
  }).parse(env);
  if (s.SIGNING_ORIGIN && new URL(s.SIGNING_ORIGIN).origin !== s.SIGNING_ORIGIN)
    throw new Error("SIGNING_ORIGIN must be an HTTPS origin without path.");
  const uiReady = Boolean(s.SIGNING_ORIGIN && s.SEPOLIA_RPC_URL);
  const ready = uiReady && Boolean(s.WALLETCONNECT_PROJECT_ID);
  if (s.ENABLE_TESTNET_EXECUTION && !ready) throw new Error("Execution requires signing origin, connector and Sepolia RPC setup.");
  if(s.ENABLE_TESTNET_PERMIT_ONLY&&(s.ENABLE_TESTNET_EXECUTION||!ready||!s.TESTNET_PERMIT_WALLET||!s.PERMIT_STORAGE_KEY||!/^[0-9]{1,20}$/.test(s.EXECUTION_USER_IDS)))throw new Error('Permit-only requires execution OFF, one owner, wallet, storage key and connector.');
  return { enabled: s.ENABLE_TESTNET_EXECUTION, users: s.EXECUTION_USER_IDS.split(",").filter(Boolean),
    permitOnly:s.ENABLE_TESTNET_PERMIT_ONLY,permitWallet:s.TESTNET_PERMIT_WALLET.toLowerCase(),permitKey:s.PERMIT_STORAGE_KEY,
    rpc: s.SEPOLIA_RPC_URL, origin: s.SIGNING_ORIGIN, projectId: s.WALLETCONNECT_PROJECT_ID,
    port: s.SIGNING_PORT, sessionMs: s.WALLET_SESSION_SECONDS * 1000,
    pollMs: s.SETTLEMENT_POLL_SECONDS * 1000, maxUsdc: s.TEST_USDC_MAX_AMOUNT, ready, uiReady };
}
export type WalletConfig = ReturnType<typeof walletConfig>;
