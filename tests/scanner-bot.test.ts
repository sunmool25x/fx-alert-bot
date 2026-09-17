import test from "node:test";
import assert from "node:assert/strict";
import { BotController } from "../src/bot/controller.js";
import { createTelegramBot } from "../src/bot/telegram.js";
import { SeraClient } from "../src/sera/client.js";
import { MarketService, type MarketData } from "../src/sera/service.js";
import type { View } from "../src/bot/view.js";
import { NOW, A, B, quoteWire } from "./helpers.js";
import { observation } from "./alert-helpers.js";
import { setupScanner, scannerConfig, seedRate, registerProbe, observeProbe } from "./scanner-helpers.js";

function ui(a: ReturnType<typeof setupScanner>, market: MarketData = a.market) {
  const bot = new BotController(a.store, market, a.config, a.now), views: View[] = [];
  const text = (text: string, userId = "1") => bot.handle({ userId, text }, { reply: async v => { views.push(v); } });
  const callback = (callback: string, userId = "1") => bot.handle({ userId, callback }, { reply: async v => { views.push(v); } });
  const last = () => views.at(-1)!;
  return { bot, views, text, callback, last, button(row = 0, col = 0) { return last().buttons![row]![col]!.data; } };
}
for (const language of ["ko", "en"] as const) test(`${language} /alpha is a concise local feed with reasons, direction and safe actions`, async () => {
  const a = setupScanner(), b = ui(a);
  try {
    await a.store.alerts.record(observation("1", NOW - 21600000)); await seedRate(a.store, "0.98");
    if (language === "en") await b.callback("language:en");
    await b.text("/alpha");
    assert.match(b.last().text, language === "ko" ? /지금 확인해볼 FX 조건/ : /FX conditions to check/);
    assert.match(b.last().text, /1 USDC = 0.98 EURC/); assert.match(b.last().text, /-2%/);
    assert.match(b.last().text, language === "ko" ? /감지 이유/ : /Why shown/);
    assert(b.last().text.length < 4096); assert(b.last().buttons!.flat().every(button => Buffer.byteLength(button.data) <= 64));
    assert(!/profit|arbitrage|buy score|수익 기회|지금 사세요|투자 점수/i.test(b.last().text));
    assert.equal(b.views.filter(v => /USDC → EURC/.test(v.text)).length, 1);
    assert.equal(a.market.calls, 0);
    const marketButton = b.button(1); assert.equal(marketButton, "markets:0:USDC");
    await b.callback(marketButton); assert.match(b.last().text, language === "ko" ? /등록된 FX 시장/ : /Registered FX markets/);
  } finally { a.store.close(); }
});
test("empty/warming, stale, failed, no-quote and partial states are honest and offer useful actions", async () => {
  const a = setupScanner(scannerConfig({ ALPHA_PROBES: "USDC/EURC:100,USDC/EURC:1000" })), b = ui(a);
  try {
    await b.text("/alpha"); assert.match(b.last().text, /특별히 표시할 FX 조건이 없어요/); assert.match(b.last().text, /첫 시장 데이터/);
    assert.equal(b.button(), "markets:0:"); assert.equal(b.button(0, 1), "s:new");
    await seedRate(a.store, "1"); await b.text("/alpha"); assert.match(b.last().text, /일부 시장/); assert.match(b.last().text, /데이터가 아직 충분하지/);
    a.advance(180000); await b.text("/alpha"); assert.match(b.last().text, /오래된 결과는 표시하지/);
    await a.store.scanner.failed("USDC/EURC:100", "UNAVAILABLE"); await b.text("/alpha"); assert.match(b.last().text, /데이터를 가져오지 못/);
    a.advance(1); await observeProbe(a.store, "USDC/EURC:100", observation(null, a.now()));
    await b.text("/alpha"); assert.match(b.last().text, /유효한 Quote가 없어요/);
    await b.callback("s:new"); assert.match(b.last().text, /어떤 FX/);
  } finally { a.store.close(); }
});
test("one-message pagination shows three distinct pairs, caps results and rechecks freshness on old page buttons", async () => {
  const cfg = scannerConfig({ ALPHA_PROBES: [0, 1, 2, 3, 4].map(i => `USDC/T${i}:100`).join(","), ALPHA_MAX_RESULTS: "4" });
  const a = setupScanner(cfg), b = ui(a);
  try {
    for (let i = 0; i < 5; i++) await seedRate(a.store, "1", NOW, { quote: `T${i}`, to_token: "0x" + String(i + 2).repeat(40) });
    await b.text("/alpha"); assert.match(b.last().text, /1\/2/); assert.equal(b.views.length, 1);
    assert.equal((b.last().text.match(/USDC → T/g) ?? []).length, 3); assert(b.last().text.length < 4096);
    const next = b.last().buttons!.flat().find(button => button.data === "s:p:1")!.data;
    await b.callback(next); assert.match(b.last().text, /2\/2/); assert.equal((b.last().text.match(/USDC → T/g) ?? []).length, 1);
    a.advance(180000); await b.callback(next); assert.match(b.last().text, /만료/);
    await b.callback("s:p:0"); assert.match(b.last().text, /오래된 결과는 표시하지/);
  } finally { a.store.close(); }
});
test("movement alert prefill reuses Phase 2 flow, leaves threshold/window to the user and never auto-creates", async () => {
  const a = setupScanner(), b = ui(a);
  try {
    await a.store.alerts.record(observation("1", NOW - 3600000)); await seedRate(a.store, "1.01");
    await b.text("/alpha"); const action = b.button(0, 1);
    await b.callback(action, "2"); assert.equal(await a.store.flow("2"), undefined); assert.equal(a.market.calls, 0);
    await b.callback(action); assert.match(b.last().text, /변동률/);
    let flow = (await a.store.flow("1"))!; assert.equal(flow.from, A.address); assert.equal(flow.to, B.address);
    assert.equal(flow.alert!.amount, "100"); assert.equal(flow.alert!.type, "RATE_MOVEMENT"); assert.equal(flow.alert!.threshold, undefined);
    assert.equal((await a.store.alerts.list("1")).length, 0);
    await b.text("0.75"); await b.callback(b.button(0, 1)); // 6 hours, deliberately different from the scanner signal
    flow = (await a.store.flow("1"))!; assert.equal(flow.alert!.threshold, "0.75"); assert.equal(flow.alert!.window_seconds, 21600);
    assert.equal((await a.store.alerts.list("1")).length, 0);
    await b.callback(b.button()); assert.equal((await a.store.alerts.list("1")).length, 1);
  } finally { a.store.close(); }
});
test("availability and recovery prefill still require explicit alert confirmation", async () => {
  for (const recovery of [false, true]) {
    const a = setupScanner(), b = ui(a);
    try {
      const p = await registerProbe(a.store);
      if (recovery) await observeProbe(a.store, p.id, observation(null, NOW - 60000));
      await observeProbe(a.store, p.id, observation("1", NOW));
      await b.text("/alpha"); await b.callback(b.button(0, 1));
      assert.equal((await a.store.flow("1"))?.stage, "confirm"); assert.equal((await a.store.alerts.list("1")).length, 0);
      assert.match(b.last().text, /알림 설정/); await b.callback(b.button());
      assert.equal((await a.store.alerts.list("1"))[0]!.type, recovery ? "MARKET_RECOVERY" : "QUOTE_AVAILABLE");
    } finally { a.store.close(); }
  }
});
test("alpha quote buttons make NEW bound Sera POSTs, never reuse observation; owner and TTL checks precede HTTP", async () => {
  const a = setupScanner(); let posts = 0, requests = 0, clock = NOW;
  const fetcher: typeof fetch = async (url, init) => {
    requests++; const path = new URL(String(url)).pathname;
    if (path.endsWith("/config")) return Response.json({ chain_id: 11155111, eip712_domain: { chainId: 11155111 } });
    if (path.endsWith("/tokens")) return Response.json({ tokens: [A, B] });
    if (path.endsWith("/system/time")) return Response.json({ timestamp: NOW / 1000 });
    assert(path.endsWith("/swap/quote")); assert.equal(init?.method, "POST"); posts++;
    assert.equal(JSON.parse(String(init?.body)).from_amount, "100000000");
    return Response.json(quoteWire("100000000", String((90 + posts) * 1000000)));
  };
  const market = new MarketService(new SeraClient(a.config, fetcher, () => clock, async ms => { clock += ms; }), a.config), b = ui(a, market);
  try {
    await seedRate(a.store, "0.95"); await b.text("/alpha"); const quote = b.button();
    for (let n = 0; n < 5; n++) await b.text("/alpha", String(n + 1));
    assert.equal(requests, 0); await b.callback(quote, "2"); assert.equal(requests, 0);
    await b.callback(quote); assert.equal(posts, 1); assert.match(b.last().text, /최소 수령액: 91 EURC/); assert(!b.last().text.includes("예상 최소"));
    assert.match(b.last().text, /시장 상황이 변했을 수 있어 최신 Quote를 다시 조회했습니다/);
    await b.callback(quote); assert.equal(posts, 2); assert.match(b.last().text, /1 USDC = 0.92 EURC/);
    assert(!b.last().buttons!.flat().some(button => /서명|거래 확인|sign|execute/i.test(button.text)));
    a.advance(900001); await b.callback(quote); assert.equal(posts, 2); assert.match(b.last().text, /만료/);
  } finally { a.store.close(); }
});
test("actual grammY transport routes Korean /alpha as one private-chat message", async () => {
  const a = setupScanner(), b = ui(a), telegram = createTelegramBot("123456:TEST_TOKEN", b.bot);
  telegram.botInfo = { id: 123456, is_bot: true, first_name: "Sera", username: "SeraTestBot", can_join_groups: true, can_read_all_group_messages: false,
    supports_inline_queries: false, can_connect_to_business: false, has_main_web_app: false, has_topics_enabled: false,
    allows_users_to_create_topics: false, can_manage_bots: false, supports_join_request_queries: false };
  const sent: string[] = [];
  telegram.api.config.use(async (_previous, method, payload) => {
    if (method === "sendMessage") sent.push((payload as { text: string }).text);
    return { ok: true, result: { message_id: 1, date: NOW / 1000, chat: { id: 1, type: "private" }, text: "ok" } } as never;
  });
  try {
    await seedRate(a.store, "1");
    await telegram.handleUpdate({ update_id: 1, message: { message_id: 1, date: NOW / 1000, from: { id: 1, is_bot: false, first_name: "not stored" },
      chat: { id: 1, type: "private", first_name: "not stored" }, text: "/alpha", entities: [{ offset: 0, length: 6, type: "bot_command" }] } });
    assert.equal(sent.length, 1); assert.match(sent[0]!, /지금 확인해볼 FX 조건/); assert.equal(a.market.calls, 0);
  } finally { a.store.close(); }
});
