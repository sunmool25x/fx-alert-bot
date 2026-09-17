import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { loadConfig, type Config } from "../config/index.js";
import { SeraClient } from "../sera/client.js";
import { deployment, type Deployment } from "../trades/contract.js";
import { SepoliaReads } from "./chain.js";
import { ZodError } from "zod";

export type Check = { status: "PASS" | "WARN" | "FAIL"; code: string; message: string };
export interface Probes {
  telegram(config: Config): Promise<void>;
  sera(config: Config): Promise<Deployment>;
  rpc(config: Config, d: Deployment): Promise<void>;
  origin(config: Config): Promise<void>;
}
async function json(url: string) {
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error("probe failed");
  return await response.json() as Record<string, any>;
}
export const liveProbes: Probes = {
  async telegram(c) {
    // Token is sent only to Telegram. No request URL or provider error is returned/logged.
    const root = "https://api.telegram.org/bot" + c.botToken;
    const me = await json(root + "/getMe");
    if (!me.ok || me.result?.is_bot !== true || String(me.result.id) !== c.botToken.split(":")[0]) throw new Error("bot identity");
    const webhook = await json(root + "/getWebhookInfo");
    if (!webhook.ok || webhook.result?.url !== "") throw new Error("polling bot required");
    const menu = await json(root + "/getChatMenuButton");
    if (!menu.ok || (menu.result?.type === "web_app" && menu.result.web_app?.url !== c.wallet.origin + "/" && menu.result.web_app?.url !== c.wallet.origin)) throw new Error("menu origin");
  },
  async sera(c) {
    const api = new SeraClient(c), d = deployment(await api.liveConfig());
    await api.getTokens(); await api.health(); return d;
  },
  async rpc(c, d) { await new SepoliaReads(c.wallet.rpc).readiness(d); },
  async origin(c) {
    const h = await json(c.wallet.origin + "/api/health");
    if (h.app !== "sera-korea-fx-bot" || h.origin !== c.wallet.origin || h.chainId !== 11155111 || h.executionEnabled !== c.wallet.enabled || h.connectorReady !== c.wallet.ready) throw new Error("origin/config mismatch");
  },
};
export function databaseReady(path: string): boolean {
  if (!existsSync(path)) return false;
  let db: DatabaseSync | undefined;
  try {
    db = new DatabaseSync(path, { readOnly: true });
    const versions = db.prepare("SELECT version FROM schema_migrations ORDER BY version").all().map(r => r.version);
    if (!["[1,2,3,4]","[1,2,3,4,6]"].includes(JSON.stringify(versions))) return false;
    if(versions.includes(6))for(const table of ["analytics_events","user_attribution","analytics_state"]){
      if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table))return false;
    }
    for (const table of ["users", "alerts", "market_observations", "alert_triggers", "scanner_probes", "wallet_sessions", "wallet_links", "wallet_challenges", "telegram_auth_replays", "trade_sessions", "trade_attempts", "wallet_quarantine"]) {
      if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table)) return false;
    }
    if (!db.prepare("PRAGMA table_info(quote_intents)").all().some(r => r.name === "origin")) return false;
    return db.prepare("PRAGMA quick_check").get()?.quick_check === "ok";
  } catch { return false; } finally { db?.close(); }
}
export async function preflight(env: NodeJS.ProcessEnv, options: { offline?: boolean; root?: string; development?:boolean } = {}, probes: Probes = liveProbes) {
  const checks: Check[] = [];
  const add = (status: Check["status"], code: string, message: string) => checks.push({ status, code, message });
  const token = env.TELEGRAM_BOT_TOKEN ?? "";
  const tokenOk = /^\d{5,20}:[A-Za-z0-9_-]{30,80}$/.test(token);
  add(tokenOk ? "PASS" : "FAIL", "TG_CONFIG", tokenOk ? "Telegram token structure is valid" : "Telegram token missing or malformed; set TELEGRAM_BOT_TOKEN locally");
  add((env.SERA_NETWORK ?? "sepolia") === "sepolia" ? "PASS" : "FAIL", "NETWORK", "Supported network must be Sepolia (11155111)");
  add((env.ENABLE_MAINNET ?? "false") === "false" ? "PASS" : "FAIL", "MAINNET", "Mainnet must remain disabled");
  const execution = env.ENABLE_TESTNET_EXECUTION ?? "false";
  add(execution === "false" ? "WARN" : execution === "true" ? "WARN" : "FAIL", "EXECUTION", execution === "false" ? "Execution disabled; correct for read-only acceptance" : execution === "true" ? "Execution ENABLED; owner acceptance gate must already be complete" : "Invalid execution boolean; use true or false");
  const project=env.WALLETCONNECT_PROJECT_ID??"",projectValid=/^[a-f0-9]{32}$/i.test(project);
  let c: Config;
  try { c = loadConfig({...env,WALLETCONNECT_PROJECT_ID:projectValid?project:""}); } catch(e) {
    const fields=e instanceof ZodError?[...new Set(e.issues.map(i=>i.path[0]).filter(p=>typeof p==="string"&&/^[A-Z_]+$/.test(p)))].join(", "):"network/origin/execution settings";
    add("FAIL", "CONFIG_INVALID", "Configuration invalid: "+fields+". Check .env.example; values are intentionally omitted");
    return { checks, exitCode: 1 };
  }
  add(c.wallet.origin ? "PASS" : "FAIL", "HTTPS_ORIGIN", c.wallet.origin ? "HTTPS Mini App origin configured" : "SIGNING_ORIGIN missing");
  add(projectValid ? "PASS" : "FAIL", "REOWN_PROJECT", projectValid ? "Reown project ID format valid; actual relay access needs owner wallet testing" : project ? "WALLETCONNECT_PROJECT_ID must be 32 hexadecimal characters; value omitted" : "WALLETCONNECT_PROJECT_ID missing");
  add(c.wallet.rpc ? "PASS" : "FAIL", "RPC_CONFIG", c.wallet.rpc ? "Sepolia HTTPS RPC configured" : "SEPOLIA_RPC_URL missing");
  add(c.baseUrl === "https://api.testnet.sera.cx/api/v1" ? "PASS" : "FAIL", "SERA_CONFIG", "Canonical Sera testnet API v1 selected by network; no separate API URL/key required");
  add(c.wallet.users.length === 1 ? "PASS" : "FAIL", "BETA_ALLOWLIST", c.wallet.users.length === 1 ? "Exactly one beta tester configured; confirm it is your /wallet ID" : "Acceptance requires exactly one EXECUTION_USER_IDS entry; obtain your ID from /wallet");
  add("PASS", "SESSION_SECRETS", "Sessions use generated random credentials stored as hashes; no static session/encryption key is used");
  const root = options.root ?? process.cwd();
  add(databaseReady(c.databasePath) ? "PASS" : "FAIL", "DATABASE", "Database must have supported migrations (4 or 6); start the bot with execution OFF to initialize/upgrade with backup");
  add(["index.html", "app.js", "app.css", "THIRD_PARTY_LICENSES.txt"].every(f => existsSync(resolve(root, "dist/web", f))) ? "PASS" : "FAIL", "WEB_BUILD", "Signing frontend and license build; run npm run build if missing");
  add(c.wallet.origin ? "PASS" : "FAIL", "TELEGRAM_LAUNCH", "Inline private-chat Web App URL derives from SIGNING_ORIGIN; /newapp and Login Widget /setdomain are not required");
  add("WARN", "REOWN_ALLOWLIST", options.development?"Dedicated development Reown project: documented empty allowlist permits changing tunnel origins; actual relay access remains untested":"For stable hosting allow the exact origin; dev:live supports a dedicated development project with Reown's documented empty allowlist");
  if (options.offline) add("WARN", "OFFLINE_ONLY", "Network probes skipped; this is NOT a passing live acceptance preflight");
  else {
    if (tokenOk) {
      try { await probes.telegram(c); add("PASS", "TG_READ", "Telegram getMe, polling compatibility and optional menu URL verified"); }
      catch { add("FAIL", "TG_READ", "Telegram read failed: check token, connectivity, existing webhook and optional menu URL"); }
    }
    let d: Deployment | undefined;
    try { d = await probes.sera(c); add("PASS", "SERA_READ", "Sera live Sepolia deployment, tokens and health readable"); }
    catch { add("FAIL", "SERA_READ", "Sera testnet read failed; verify network/TLS and retry preflight later"); }
    if (c.wallet.rpc && d) {
      try { await probes.rpc(c, d); add("PASS", "RPC_READ", "Sepolia contracts/domain, finalized block, receipt and bounded logs readable"); }
      catch { add("FAIL", "RPC_READ", "RPC capabilities or contract verification failed; check Sepolia provider"); }
    }
    if (c.wallet.origin) {
      try { await probes.origin(c); add("PASS", "HTTPS_READ", "Public signing URL reaches this companion with matching origin/network/mode"); }
      catch { add("FAIL", "HTTPS_READ", "Public companion unavailable or mismatched; start bot/tunnel and check Host forwarding/origin"); }
    }
  }
  return { checks, exitCode: checks.some(c => c.status === "FAIL") ? 1 : 0 };
}
const autoActions:Record<string,string>={
  HTTPS_ORIGIN:"Run npm run dev:live; it obtains and applies a new HTTPS origin without editing .env.",
  HTTPS_READ:"Run npm run dev:live; it starts the companion/tunnel and checks their origin. If already running, report HTTPS_READ; no URL copying is needed.",
  TELEGRAM_LAUNCH:"Run npm run dev:live; private-chat wallet buttons use the active temporary origin.",
  DATABASE:"Run npm run dev:live; normal bot startup initializes/upgrades the database with existing backup protections.",
  WEB_BUILD:"Run npm run dev:live; it builds the app and signing assets automatically.",
  SERA_READ:"Run npm run dev:live with network access; it uses the system CA store. If Sera is down, retry later.",
  RPC_READ:"Retry npm run dev:live. If the configured provider is unavailable, use a Sepolia endpoint supporting finalized blocks, receipts and logs.",
  BUILD_FAILED:"Run npm run typecheck for code diagnostics or ask the developer to repair the build; no credentials are needed.",
  TESTS_FAILED:"The automatic test gate failed. Ask the developer to inspect npm test; live setup was stopped.",
  TYPECHECK_FAILED:"The automatic typecheck gate failed. Ask the developer to inspect npm run typecheck; live setup was stopped.",
  CLOUDFLARED_DOWNLOAD:"Retry npm run dev:live with access to official GitHub downloads. The launcher will not execute an unverified download.",
  TUNNEL_START:"Cloudflare did not provide a valid temporary URL. Retry npm run dev:live; no .env URL edit is needed.",
  APP_START:"The bot did not finish startup. Report APP_START to the developer; the launcher has stopped its child processes.",
  CHILD_EXIT:"A managed process stopped. Retry npm run dev:live; report CHILD_EXIT if repeated.",
};
const humanActions:Record<string,string>={
  REOWN_PROJECT:"Create your own dedicated development project at https://dashboard.reown.com/ and save its 32-character Project ID once in this repository's .env field WALLETCONNECT_PROJECT_ID. Use that project's documented empty origin allowlist for temporary testing. Run npm run dev:live (or keep it open; it reloads after saving). Never use a shared/sample ID.",
  TG_CONFIG:"Save your own BotFather token locally in .env as TELEGRAM_BOT_TOKEN; then run npm run dev:live. Do not share the token.",
  TG_READ:"Check that this dedicated token is active, has no webhook/other polling process, and uses our wallet button. Report TG_READ if configuration was already verified; do not send the token.",
  RPC_CONFIG:"Save a Sepolia HTTPS endpoint in .env as SEPOLIA_RPC_URL; the documented public endpoint requires no provider account.",
  BETA_ALLOWLIST:"Copy your numeric ID from this bot's /wallet into EXECUTION_USER_IDS as the only entry. Execution stays OFF.",
  NETWORK:"Use SERA_NETWORK=sepolia. dev:live always forces Sepolia in its child process.",
  MAINNET:"Keep ENABLE_MAINNET=false. dev:live always forces mainnet OFF.",
  EXECUTION:"Keep ENABLE_TESTNET_EXECUTION=false for setup. dev:live cannot enable execution.",
  CONFIG_INVALID:"Check the named field against .env.example, or report CONFIG_INVALID to the developer without sharing .env.",
  CLOUDFLARED_INSTALL:"Install the official cloudflared executable or set optional CLOUDFLARED_PATH to your installation. Automatic download supports Windows x64/arm64.",
  CLOUDFLARED_PATH:"Correct optional CLOUDFLARED_PATH or remove it so the launcher can locate/download Cloudflare automatically.",
  PORT_BUSY:"The signing port is already occupied. Use your existing live-launch window, or ask the developer to identify the older process; the launcher never kills unrelated programs.",
  LIVE_RUNNING:"This repository already has an active launcher. Use its existing window; save the Reown ID there via .env and it reloads automatically.",
  LIVE_LOCK:"The local launcher lock needs developer inspection; do not delete a running process's lock.",
};
export function setupAction(code:string) {return autoActions[code]?"AUTO-FIXABLE: "+autoActions[code]:"HUMAN ACTION REQUIRED: "+(humanActions[code]??"Report this setup code to the developer; do not send secrets.");}
export const formatPreflight = (checks: Check[]) => checks.map(c => `${c.status.padEnd(4)}  ${c.code}  ${c.message}`+(c.status==="FAIL"?"\n      "+setupAction(c.code):"")).join("\n");
