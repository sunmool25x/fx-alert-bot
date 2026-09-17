import test from "node:test";
import assert from "node:assert/strict";
import { BotController } from "../src/bot/controller.js";
import { SqliteStore } from "../src/database/store.js";
import { createTelegramBot } from "../src/bot/telegram.js";
import { rateView } from "../src/bot/view.js";
import type { View } from "../src/bot/view.js";
import { A, B, NOW, config, fakeMarkets } from "./helpers.js";

function setup() {
  const store = new SqliteStore(":memory:", 900000, () => NOW);
  const market = fakeMarkets(); const bot = new BotController(store, market, config, () => NOW);
  const views: View[] = [];
  const text = (text: string, user = "1") => bot.handle({ userId: user, text }, { reply: async v => { views.push(v); } });
  const callback = (callback: string, user = "1") => bot.handle({ userId: user, callback }, { reply: async v => { views.push(v); } });
  return { store, market, bot, views, text, callback };
}
test("Korean is default, source is first-touch and English preference persists", async () => {
  const a = setup();
  try {
    await a.text("/start source_korea_news"); assert.match(a.views[0]!.text, /^👋 FX Alert Bot\n\n환율을 확인하고/);
    assert.equal((await a.store.user("1"))?.source, "source_korea_news");
    await a.text("/start source_other"); assert.equal((await a.store.user("1"))?.source, "source_korea_news");
    await a.callback("language:en"); await a.text("/start");
    assert.match(a.views.at(-1)!.text, /^👋 FX Alert Bot\n\nCheck exchange rates/);
  } finally { a.store.close(); }
});
test("Korean quote wizard selects tokens then amount; previous-stage and wrong-user callbacks cannot change state", async () => {
  const a = setup();
  try {
    await a.text("/quote");
    const first = a.views.at(-1)!.buttons![0]![0]!.data;
    await a.callback(first, "2"); assert.equal(await a.store.flow("2"), undefined);
    await a.callback(first);
    const second = a.views.at(-1)!.buttons![0]![0]!.data;
    await a.callback(first); assert.match(a.views.at(-1)!.text, /만료/);
    await a.callback(second); assert.match(a.views.at(-1)!.text, /금액/);
    await a.text("100"); assert.match(a.views.at(-1)!.text, /최소 수령액/); assert(!a.views.at(-1)!.text.includes("예상 최소"));
    assert.equal(await a.store.flow("1"), undefined); assert.equal(a.market.calls, 1);
    assert(!a.views.at(-1)!.buttons!.flat().some(b => /확인 거래|거래 확인|confirm/i.test(b.text)));
  } finally { a.store.close(); }
});
test("refresh fetches NEW quote and rejects another user's quote button", async () => {
  const a = setup();
  try {
    await a.text("/quote 100 USDC/EURC");
    const refresh = a.views.at(-1)!.buttons![0]![0]!.data;
    await a.callback(refresh, "2"); assert.equal(a.market.calls, 1);
    await a.callback(refresh); assert.equal(a.market.calls, 2);
    assert.notEqual(a.views.at(-1)!.buttons![0]![0]!.data, refresh);
  } finally { a.store.close(); }
});
test("markets, rate, liquidity, help and read-only financial commands have Korean responses", async () => {
  const a = setup();
  try {
    for (const [command, expected] of [["/markets USDC", /등록된 FX 시장/], ["/rate USDC EURC", /참고 환율/], ["/liquidity USDC EURC", /총 유동성이 아닙니다/], ["/help", /❓ FX Alert Bot 사용 안내/], ["/swap", /조회 전용/], ["/alpha", /지금 확인해볼 FX 조건/]] as const) {
      await a.text(command); assert.match(a.views.at(-1)!.text, expected);
    }
    await a.text("/quote 100 UNKNOWN EURC"); assert.match(a.views.at(-1)!.text, /찾지 못했습니다/);
  } finally { a.store.close(); }
});
test("cancel clears persisted wizard; forget needs fresh confirmation and removes related records", async () => {
  const a = setup();
  try {
    await a.text("/quote"); await a.text("/cancel"); assert.equal(await a.store.flow("1"), undefined);
    await a.text("/quote 100 USDC EURC"); await a.text("/forget");
    const button = a.views.at(-1)!.buttons![0]![0]!.data;
    await a.callback(button, "2"); assert(await a.store.user("1"));
    await a.callback(button); assert.equal(await a.store.user("1"), undefined);
  } finally { a.store.close(); }
});
test("stale reference data is visibly labeled and not presented as executable", () => {
  const view = rateView(A, B, { pair: "USD/EUR", rate: "0.9", as_of: NOW / 1000 - 3600 }, "ko", 900, NOW);
  assert.match(view.text, /오래되었습니다/); assert.match(view.text, /참고 환율/);
});
test("actual grammY adapter routes /start and rejects group use without storing users", async () => {
  const a = setup();
  const telegram = createTelegramBot("123456:TEST_TOKEN", a.bot);
  telegram.botInfo = { id: 123456, is_bot: true, first_name: "Sera", username: "SeraTestBot", can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false, can_connect_to_business: false, has_main_web_app: false, has_topics_enabled: false, allows_users_to_create_topics: false, can_manage_bots: false, supports_join_request_queries: false };
  const sent: string[] = [];
  telegram.api.config.use(async (_previous, method, payload) => {
    if (method === "sendMessage") sent.push((payload as { text: string }).text);
    return { ok: true, result: { message_id: 1, date: NOW / 1000, chat: { id: 1, type: "private" }, text: "ok" } } as never;
  });
  try {
    await telegram.handleUpdate({ update_id: 1, message: { message_id: 1, date: NOW / 1000,
      from: { id: 1, is_bot: false, first_name: "not stored" }, chat: { id: 1, type: "private", first_name: "not stored" },
      text: "/start", entities: [{ offset: 0, length: 6, type: "bot_command" }] } });
    assert.match(sent[0]!, /^👋 FX Alert Bot\n\n환율을 확인하고/);
    await telegram.handleUpdate({ update_id: 2, message: { message_id: 2, date: NOW / 1000,
      from: { id: 99, is_bot: false, first_name: "not stored" }, chat: { id: -2, type: "group", title: "group" }, text: "/start" } });
    assert.equal(await a.store.user("99"), undefined); assert.match(sent[1]!, /개인 대화/);
  } finally { a.store.close(); }
});
