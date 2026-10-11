import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { loadConfig } from "./config/index.js";
import { SqliteStore } from "./database/store.js";
import { SeraClient } from "./sera/client.js";
import { MarketService } from "./sera/service.js";
import { BotController } from "./bot/controller.js";
import { createTelegramBot } from "./bot/telegram.js";
import { safeLog } from "./utils/errors.js";
import { Api,InlineKeyboard } from "grammy";
import { AlertMonitor } from "./alerts/monitor.js";
import { telegramNotifications } from "./bot/notifications.js";
import { ScannerCoverage } from "./scanner/coverage.js";
import { SepoliaReads } from "./wallet/chain.js";
import { TradeService } from "./trades/service.js";
import{PermitService}from'./permits/service.js';
import { signingServer } from "./wallet/server.js";
import { SettlementMonitor } from "./trades/settlement.js";
import { tradeView } from "./trades/view.js";
import { walletText } from "./i18n/wallet.js";

async function main() {
  if (existsSync(".env")) loadEnvFile(".env");
  const config = loadConfig();
  if (!config.botToken) throw new Error("TELEGRAM_BOT_TOKEN is required.");
  const client = new SeraClient(config);
  await client.preflight();
  const store = new SqliteStore(config.databasePath, config.conversationTtlMs);
  const market = new MarketService(client, config);
  const chain=config.wallet.rpc?new SepoliaReads(config.wallet.rpc,new URL(config.wallet.rpc).hostname==='sepolia.drpc.org'?'https://ethereum-sepolia-rpc.publicnode.com':'https://sepolia.drpc.org'):undefined;
  const financialNotifications=new Api(config.botToken,{timeoutSeconds:10});
  const settlement=chain?new SettlementMonitor(store.wallet,chain,config.wallet.pollMs,async row=>{
    const user=await store.user(row.user_id);if(user){const view=tradeView(row,user.language),m=walletText[user.language];const keyboard=new InlineKeyboard().text(m.refresh,"wallet:status");if(view.explorer)keyboard.row().url(m.explorer,view.explorer);await financialNotifications.sendMessage(user.id,view.text,{reply_markup:keyboard});}
  }):undefined;
  const reconcile=settlement?(user:string)=>settlement.refresh(user):undefined;
  const bot = createTelegramBot(config.botToken, new BotController(store, market, config,Date.now,chain,reconcile));
  const tradeService=chain?new TradeService(store,client,chain,config,client.executionTransport()):undefined;
  const web=config.wallet.uiReady&&chain&&tradeService?signingServer(config,store,chain,tradeService,Date.now,reconcile,undefined,new PermitService(store,tradeService,client,chain,config)):undefined;
  const monitor = new AlertMonitor(store, market, config, telegramNotifications(new Api(config.botToken, { timeoutSeconds: 20 })),
    Date.now, undefined, new ScannerCoverage(store.scanner, market, config));
  let stopping = false;
  let shutdownPromise: Promise<void> | undefined;
  const shutdown = () => shutdownPromise ??= (async () => {
    stopping = true;
    await monitor.stop();
    await settlement?.stop();
    if(web?.listening)await new Promise<void>((resolve,reject)=>web.close(error=>error?reject(error):resolve()));
    if (bot.isRunning()) await bot.stop();
  })();
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.once(signal, () => { void shutdown().catch(e => safeLog("shutdown_failed", e)); });
  // Private parent/child IPC allows graceful shutdown on Windows; no HTTP control endpoint.
  if(process.send) {
    process.on("message", message=>{if(message&&typeof message==="object"&&"type" in message&&message.type==="dev:shutdown")void shutdown();});
    process.once("disconnect",()=>{void shutdown();});
  }
  try {
    await bot.init();
    if ((await bot.api.getWebhookInfo()).url) throw new Error("Existing webhook: use a dedicated polling token.");
    const commands = [
      { command: "start", description: "시작" }, { command: "markets", description: "FX 시장 보기" },
      { command: "rate", description: "현재 참고 환율" }, { command: "quote", description: "최신 Quote 확인" },
      { command: "liquidity", description: "거래 가능 규모 확인" }, { command: "language", description: "언어 선택" },
      { command: "help", description: "사용 안내" }, { command: "cancel", description: "입력 취소" },
      { command: "forget", description: "저장한 내 기록 삭제" },
      { command: "alert", description: "FX 조건 알림 만들기" }, { command: "alerts", description: "내 알림 보기" },
      { command: "deletealert", description: "알림 삭제" },
      { command: "alpha", description: "지금 확인해볼 FX 조건" },
      { command:"wallet",description:"지갑 연결 상태" },{command:"balance",description:"테스트넷 잔액"},{command:"swap",description:"테스트 거래 준비"},
    ];
    await bot.api.setMyCommands(commands, { scope: { type: "all_private_chats" } });
    await bot.api.setMyCommands(commands.map((c, i) => ({
      ...c, description: ["Start", "FX markets", "Current reference rate", "Check latest quote", "Quoted trade sizes", "Language", "Help", "Cancel input", "Delete my records", "Create FX alert", "My alerts", "Delete alert", "FX conditions to check","Wallet connection status","Testnet balances","Prepare test trade"][i]!,
    })), { scope: { type: "all_private_chats" }, language_code: "en" });
    // Fail if a webhook is already configured; never delete it or drop pending updates.
    console.info(JSON.stringify({ event: "bot_start", network: config.network, mode: config.wallet.enabled?"gated_testnet":"read_only",signingUi:!!web,connectorReady:config.wallet.ready }));
    if(web)await new Promise<void>((resolve,reject)=>{web.once("error",reject);web.listen(config.wallet.port,"127.0.0.1",()=>resolve());});
    settlement?.start();
    if (stopping) return;
    await bot.start({ allowed_updates: ["message", "callback_query"], drop_pending_updates: false,
      onStart: () => { if (!stopping) {monitor.start();process.send?.({type:"dev:ready",signingUi:!!web,connectorReady:config.wallet.ready});} } });
  } finally {
    // bot.start resolves only after in-flight middleware finishes; stop() alone does not wait for it.
    try { await shutdown(); } finally { store.close();if(process.connected)process.disconnect(); }
  }
}
main().catch(error => { safeLog("startup_failed", error); console.error("Startup failed. Check project .env, BotFather token, network and database settings."); process.exitCode = 1; });
