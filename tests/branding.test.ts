import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BotController } from "../src/bot/controller.js";
import type { View } from "../src/bot/view.js";
import type { Language } from "../src/database/store.js";
import { notificationView } from "../src/alerts/views.js";
import { evaluate } from "../src/alerts/evaluate.js";
import { previewView, tradeView } from "../src/trades/view.js";
import { loadConfig } from "../src/config/index.js";
import { glossary } from "../src/i18n/glossary.js";
import { stateText } from "../src/i18n/wallet.js";
import { NOW } from "./helpers.js";
import { observation, createAlert } from "./alert-helpers.js";
import { setupScanner, seedRate } from "./scanner-helpers.js";
import { fixture } from "./trade-helpers.js";

async function ui(language: Language) {
  const a = setupScanner(), views: View[] = [];
  await a.store.touch("1"); await a.store.language("1", language);
  const bot = new BotController(a.store, a.market, a.config, a.now);
  const out = { reply: async (view: View) => { views.push(view); } };
  return { ...a, views, last: () => views.at(-1)!,
    text: (text: string) => bot.handle({ userId: "1", text }, out),
    callback: (callback: string) => bot.handle({ userId: "1", callback }, out) };
}
const noPromises = /알파|수익|매수 기회|차익거래|arbitrage|profit|buy opportunity/i;

for (const language of ["ko", "en"] as const) {
  test(language + " start puts FX Alert Bot and user purpose first, with six safe shortcuts", async () => {
    const a = await ui(language);
    try {
      await a.text("/start");
      const view = a.last();
      assert.match(view.text, /^👋 FX Alert Bot\n\n/);
      assert.match(view.text, language === "ko" ? /환율을 확인하고/ : /Check exchange rates/);
      assert.equal(view.text.split("Sera").length - 1, 1);
      assert(view.text.endsWith("Powered by Sera Protocol"));
      assert.doesNotMatch(view.text, /CLOB|EIP-712|Permit|Intent|REST|MCP|11155111|Sera Korea|Sera FX Bot/);
      assert.match(view.text, /Sepolia/);
      assert.match(view.text, language === "ko" ? /자동 거래는 하지 않습니다/ : /never trade automatically/);
      assert.deepEqual(view.buttons!.map(row => row.map(b => b.data)),
        [["nav:alpha", "nav:alert"], ["nav:rate", "nav:markets"], ["nav:wallet", "nav:help"]]);
      assert(view.buttons!.flat().every(b => Buffer.byteLength(b.data) <= 64));
      for (const action of view.buttons!.flat()) await a.callback(action.data);
      assert.equal(a.market.calls, 0);
      assert.equal((await a.store.alerts.list("1")).length, 0);
      assert.equal(a.store.wallet.list("1").length, 0);
      await a.callback("nav:submit"); assert.match(a.last().text, language === "ko" ? /만료/ : /expired/);
      assert.equal(a.store.wallet.list("1").length, 0);
    } finally { a.store.close(); }
  });

  test(language + " help groups commands and offers separate terminology and privacy screens", async () => {
    const a = await ui(language);
    try {
      await a.text("/help"); const view = a.last();
      const headings = language === "ko" ? ["🔎 시장 보기", "🔔 알림", "👛 지갑 / 테스트 거래", "⚙️ 설정"]
        : ["🔎 Markets", "🔔 Alerts", "👛 Wallet / test trades", "⚙️ Settings"];
      let position = -1;
      for (const heading of headings) { assert(view.text.indexOf(heading) > position); position = view.text.indexOf(heading); }
      for (const command of ["markets", "rate", "quote", "liquidity", "alpha", "alert", "alerts", "deletealert", "wallet", "balance", "swap", "language"])
        assert(view.text.includes("/" + command + " — "));
      assert(view.text.endsWith("FX data and testnet execution infrastructure powered by Sera Protocol."));
      assert.match(view.text, language === "ko" ? /투자 자문이나 자동 거래 서비스가 아닙니다/ : /not an investment adviser or an automatic trading service/);
      assert(!view.text.includes(glossary[language].vault));
      await a.callback("nav:terms");
      for (const definition of Object.values(glossary[language])) assert(a.last().text.includes(definition));
      assert.match(a.last().text, language === "ko" ? /지원하지 않습니다/ : /not currently supported/);
      await a.callback("nav:privacy");
      assert.match(a.last().text, /\/forget/);
      assert.match(a.last().text, language === "ko" ? /거래 기록|확인 중인 거래/ : /trade records|Unresolved trades/);
      assert.match(a.last().text, language === "ko" ? /이름·전화번호·대화 내용은 저장하지 않습니다/ : /Names, phone numbers and chat content are not stored/);
      assert.equal(a.market.calls, 0);
    } finally { a.store.close(); }
  });

  test(language + " empty alerts and markets explain the state and lead into explicit setup", async () => {
    const a = await ui(language);
    try {
      for (const command of ["/alerts", "/deletealert"]) {
        await a.text(command);
        assert.match(a.last().text, language === "ko" ? /아직 만든 알림이 없어요/ : /haven't created any alerts/);
        assert.match(a.last().text, /Telegram/);
        assert.equal(a.last().buttons![0]![0]!.data, "nav:alert");
      }
      await a.callback(a.last().buttons![0]![0]!.data);
      assert.equal((await a.store.flow("1"))!.operation, "alert");
      assert.equal((await a.store.flow("1"))!.stage, "from");
      assert.equal((await a.store.alerts.list("1")).length, 0);
      await a.text("/markets NONE");
      assert.match(a.last().text, language === "ko" ? /표시할 시장이 없어요/ : /no markets to show/);
      assert(a.last().text.includes(glossary[language].pair));
    } finally { a.store.close(); }
  });

  test(language + " alpha empty/feed copy gives reasons and one attribution without profit language", async () => {
    const a = await ui(language);
    try {
      await a.text("/alpha");
      assert.match(a.last().text, language === "ko" ? /알림을 만들어두세요/ : /Create a personal alert/);
      assert(a.last().buttons!.flat().some(b => b.data === "s:new"));
      assert(a.last().buttons!.flat().some(b => b.data === "markets:0:"));
      assert.doesNotMatch(a.last().text, noPromises);
      await a.store.alerts.record(observation("1", NOW - 3600000));
      await seedRate(a.store, "1.0062");
      await a.text("/alpha"); const feed = a.last();
      assert.match(feed.text, language === "ko" ? /^🔎 지금 확인해볼 FX 조건/ : /^🔎 FX conditions to check now/);
      assert.match(feed.text, /1 USDC = 1.0062 EURC/);
      assert.match(feed.text, /\+0.62%/);
      assert.match(feed.text, language === "ko" ? /감지 이유/ : /Why shown/);
      assert.doesNotMatch(feed.text, noPromises);
      assert.equal(feed.text.split("Market data powered by Sera Protocol").length - 1, 1);
      assert(feed.text.endsWith("Market data powered by Sera Protocol"));
      assert.equal(a.market.calls, 0);
      assert.equal((await a.store.alerts.list("1")).length, 0);
    } finally { a.store.close(); }
  });

  test(language + " personal notification preserves exact condition, observed rate and refresh-only actions", async () => {
    const a = await ui(language);
    try {
      const alert = await createAlert(a.store, { threshold: "0.9" }), sample = observation("0.91");
      const payload = { alert, observation: sample, evaluation: evaluate(alert, sample) };
      const before = JSON.stringify(payload), view = notificationView(payload, language, "trigger123");
      assert.match(view.text, language === "ko" ? /^🔔 설정한 FX 조건에 도달했어요/ : /^🔔 Your FX condition has been met/);
      assert.match(view.text, /1 USDC ≥ 0.9 EURC/); assert.match(view.text, /1 USDC = 0.91 EURC/);
      assert.match(view.text, language === "ko" ? /내 조건/ : /My condition/);
      assert.match(view.text, language === "ko" ? /감지 이유|설정한 목표 환율/ : /Why it triggered/);
      assert.match(view.text, language === "ko" ? /시장 상황은 계속 변할 수/ : /Market conditions can keep changing/);
      assert.doesNotMatch(view.text, noPromises);
      assert.deepEqual(view.buttons!.flat().map(b => b.data), ["a:q:" + alert.id + ":trigger123", "a:list:0"]);
      assert.equal(JSON.stringify(payload), before);
      assert.equal((await a.store.alerts.get(alert.id, "1"))!.sequence, 0);
    } finally { a.store.close(); }
  });

  test(language + " fresh quotes explain minimum received and costs without claiming depth or execution", async () => {
    const a = await ui(language);
    try {
      await a.text("/quote 100 USDC EURC"); const first = a.last();
      assert.match(first.text, language === "ko" ? /^💱 최신 Quote/ : /^💱 Latest quote/);
      assert(first.text.includes(glossary[language].quote));
      assert.match(first.text, language === "ko" ? /최소 수령액: 89 EURC/ : /Minimum received: 89 EURC/);
      assert.match(first.text, /0.12/);
      assert(first.text.endsWith("Quote powered by Sera Protocol"));
      assert.match(first.text, language === "ko" ? /조회용 주소|새 Quote/ : /lookup address|new quote/);
      assert.match(first.text, language === "ko" ? /총 유동성은 제공되지 않았습니다/ : /total liquidity were not provided/);
      a.market.current = "0.92"; await a.callback(first.buttons![0]![0]!.data);
      assert.equal(a.market.calls, 2);
      assert.match(a.last().text, language === "ko" ? /최소 수령액: 92 EURC/ : /Minimum received: 92 EURC/);
      assert(!a.last().buttons!.flat().some(b => /trade:|confirm|submit/.test(b.data)));
      await a.text("/liquidity USDC EURC");
      assert.match(a.last().text, language === "ko" ? /거래 가능 규모/ : /Quoted trade sizes/);
      assert.match(a.last().text, language === "ko" ? /총 유동성이 아닙니다/ : /not total liquidity/);
      a.market.failure = "UNAVAILABLE"; await a.text("/quote 100 USDC EURC");
      assert.match(a.last().text, language === "ko" ? /잠시 후 다시 시도/ : /try again later/);
      assert.doesNotMatch(a.last().text, /Error:|stack|fetch\(|Sera 데이터를/);
      assert.equal(a.store.wallet.list("1").length, 0);
    } finally { a.store.close(); }
  });

  test(language + " wallet copy describes external custody and wallet approval while execution stays off", async () => {
    const f = await fixture();
    try {
      f.config.wallet.enabled = false;
      await f.store.language("2", language); const views: View[] = [];
      const a = setupScanner();
      try {
        const bot = new BotController(f.store, a.market, f.config, f.now, f.chain);
        const out = { reply: async (v: View) => { views.push(v); } };
        await bot.handle({ userId: "2", text: "/wallet" }, out);
        const view = views.at(-1)!;
        assert.match(view.text, language === "ko" ? /아직 연결된 지갑이 없어요/ : /haven't connected a wallet/);
        assert.match(view.text, language === "ko" ? /외부 지갑/ : /external wallet/);
        assert.match(view.text, language === "ko" ? /개인키나 시드 문구는 봇에 전달되지/ : /private key and seed phrase never reach the bot/);
        assert.match(view.text, language === "ko" ? /승인은 연결한 지갑에서 직접/ : /approve each action directly in your connected wallet/);
        assert(view.text.endsWith("Testnet trading powered by Sera Protocol"));
        assert.equal(view.buttons![0]![0]!.webApp, "https://bot.example");
        assert.doesNotMatch(view.text, /Sera wallet|Sera 지갑|Connect to Sera/);
        await bot.handle({ userId: "2", text: "/swap" }, out);
        assert.match(views.at(-1)!.text, language === "ko" ? /아직 활성화되지 않았습니다/ : /has not been enabled/);
        assert.equal(f.store.wallet.address("2"), undefined); assert.equal(f.submitted(), 0);
      } finally { a.store.close(); }
    } finally { f.store.close(); }
  });

  test(language + " trade display discloses Sera without changing exact terms or enabling a preview", async () => {
    const f = await fixture();
    try {
      f.config.wallet.enabled = false;
      const snapshot = await f.service.preview(f.session, f.intent), before = JSON.stringify(snapshot);
      const preview = previewView(snapshot, language);
      assert.match(preview.text, language === "ko" ? /이 거래는 Sera Protocol을 통해 처리됩니다/ : /This trade is processed through Sera Protocol/);
      assert.match(preview.text, language === "ko" ? /최소 수령액: 125 XSGD/ : /Minimum received: 125 XSGD/);
      assert.match(preview.text, /1 USDC ≥ 1.25 XSGD/);
      assert.match(preview.text, language === "ko" ? /최대 승인 금액: 100 USDC/ : /Maximum authorized input: 100 USDC/);
      assert.equal(preview.text.split("\n\n")[1], stateText(language, "PREVIEW"));
      assert.equal(preview.version, null); assert.equal(preview.id, "");
      assert.equal(JSON.stringify(snapshot), before); assert.equal(f.store.wallet.list("1").length, 0);
      await assert.rejects(f.prepare(), { code: "EXECUTION_DISABLED" });
      // An isolated mock config exercises the existing review renderer; no live execution is enabled.
      f.config.wallet.enabled = true;
      const row = await f.prepare(), rowBefore = JSON.stringify(row), review = tradeView(row, language);
      assert.equal(review.text.split("\n\n")[1], stateText(language, row.state));
      assert.match(review.text, language === "ko" ? /이 거래는 Sera Protocol/ : /This trade is processed through Sera Protocol/);
      assert(review.text.endsWith("Testnet trading powered by Sera Protocol"));
      assert.equal(JSON.stringify(row), rowBefore);
      assert.equal(f.submitted(), 0); assert.equal(review.explorer, undefined);
    } finally { f.store.close(); }
  });
}

test("Mini App uses FX Alert Bot identity and preserves license attribution", () => {
  const html = readFileSync(new URL("../web/index.html", import.meta.url), "utf8");
  const app = readFileSync(new URL("../web/app.ts", import.meta.url), "utf8");
  assert.match(html, /<title>FX Alert Bot/); assert.match(html, /<h1>FX Alert Bot<\/h1>/);
  assert.match(html, /Testnet trading powered by Sera Protocol/);
    assert.match(html, /THIRD_PARTY_LICENSES.txt/); assert.match(html, /Reown, Inc/);
    const routing = readFileSync(new URL("../web/routing-client.ts", import.meta.url), "utf8");
    assert.match(routing, /metadata:\{name:"FX Alert Bot"/);
  assert.doesNotMatch(html + app, /Sera Korea|Sera FX Bot/);
});

test("branding pass leaves default execution off and mainnet rejected", () => {
  const config = loadConfig({});
  assert.equal(config.network, "sepolia"); assert.equal(config.wallet.enabled, false);
  assert.throws(() => loadConfig({ SERA_NETWORK: "mainnet", ENABLE_MAINNET: "true" }));
});
