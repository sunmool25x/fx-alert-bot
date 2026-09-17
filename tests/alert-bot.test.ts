import test from "node:test";
import assert from "node:assert/strict";
import { BotController } from "../src/bot/controller.js";
import { SqliteStore } from "../src/database/store.js";
import { SeraClient } from "../src/sera/client.js";
import { MarketService, type MarketData } from "../src/sera/service.js";
import { evaluate } from "../src/alerts/evaluate.js";
import { notificationView } from "../src/alerts/views.js";
import type { View } from "../src/bot/view.js";
import { createAlert, changingMarket, observation } from "./alert-helpers.js";
import { A, B, NOW, config, quoteWire } from "./helpers.js";

function setup(market: MarketData = changingMarket(() => NOW)) {
  let now = NOW;
  const store = new SqliteStore(":memory:", 900000, () => now), bot = new BotController(store, market, config, () => now);
  const views: View[] = [], last = () => views.at(-1)!;
  const text = (text: string, userId = "1") => bot.handle({ userId, text }, { reply: async view => { views.push(view); } });
  const callback = (callback: string, userId = "1") => bot.handle({ userId, callback }, { reply: async view => { views.push(view); } });
  const button = (row = 0, col = 0) => last().buttons![row]![col]!.data;
  const select = async (index = 0) => {
    await text("/alert"); await callback(button()); await callback(button()); await callback(button(index));
  };
  return { store, bot, market, views, last, text, callback, button, select, advance(ms: number) { now += ms; } };
}
for (const language of ["ko", "en"] as const) test(`${language} target alert setup, explicit direction, confirmation, duplicate taps, list and delete`, async () => {
  const a = setup();
  try {
    if (language === "en") await a.callback("language:en");
    await a.text("/alert"); assert.match(a.last().text, language === "ko" ? /어떤 FX/ : /Which FX/);
    const from = a.button(); await a.callback(from, "2"); assert.equal(await a.store.flow("2"), undefined);
    await a.callback(from); const to = a.button(); await a.callback(from); assert.match(a.last().text, language === "ko" ? /버튼/ : /button/);
    await a.callback(to);
    assert.equal(a.last().buttons!.length, 5); assert(!a.last().buttons!.flat().some(b => /spread|스프레드/i.test(b.text)));
    await a.callback(a.button());
    await a.text("100.000000"); assert.match(a.last().text, /1 USDC = 0.89 EURC/);
    await a.text("0.9"); assert.match(a.last().text, /1 USDC ≥ 0.9 EURC/);
    assert.match(a.last().text, language === "ko" ? /비용/ : /costs/);
    assert.equal((await a.store.alerts.list("1")).length, 0); // not created before explicit confirmation
    const save = a.button(); await a.callback(save); await a.callback(save);
    assert.equal((await a.store.alerts.list("1")).length, 1);
    const alert = (await a.store.alerts.list("1"))[0]!;
    assert.equal(alert.amount, "100"); assert.equal(alert.last_condition, 0);
    await a.text("/alerts"); assert.match(a.last().text, /USDC → EURC/);
    await a.text("/alerts", "2"); assert.match(a.last().text, /아직 만든 알림이 없어요/);
    for (const action of ["status", "q", "del", "remove"]) await a.callback(`a:${action}:${alert.id}`, "2");
    assert(await a.store.alerts.get(alert.id, "1"));
    await a.text("/deletealert"); await a.callback(a.button(0, 1));
    assert.match(a.last().text, language === "ko" ? /삭제할까요/ : /Delete this alert/);
    await a.callback(a.button()); assert.equal((await a.store.alerts.list("1")).length, 0);
  } finally { a.store.close(); }
});
test("size, quote-recovery and movement wizards save only supported parameters", async () => {
  const a = setup();
  try {
    for (const [index, type] of [[2, "QUOTE_AVAILABLE"], [4, "MARKET_RECOVERY"]] as const) {
      await a.select(index); await a.text("100"); assert.match(a.last().text, /전체|총 유동성/);
      await a.callback(a.button()); assert((await a.store.alerts.list("1")).some(x => x.type === type));
    }
    await a.select(3); await a.text("100"); await a.text("0.5"); assert.match(a.last().text, /얼마 전/);
    await a.callback(a.button(0, 1)); assert.match(a.last().text, /6 시간 · ±0.5%/);
    await a.callback(a.button());
    const movement = (await a.store.alerts.list("1")).find(x => x.type === "RATE_MOVEMENT")!;
    assert.equal(movement.window_seconds, 21600); assert.equal(movement.last_condition, null);
    assert.equal(movement.evaluation_status, "WAITING_HISTORY");
  } finally { a.store.close(); }
});
test("invalid input, expired confirmations and stale previews cannot corrupt alert state", async () => {
  const a = setup();
  try {
    await a.select(); await a.text("0.5"); assert.match(a.last().text, /최소/);
    assert.equal((await a.store.flow("1"))?.stage, "amount");
    await a.text("100"); await a.text("0.5%"); assert.match(a.last().text, /기호/);
    assert.equal((await a.store.flow("1"))?.stage, "threshold");
    await a.text("0.9"); const save = a.button(); a.advance(31000); await a.callback(save);
    assert.equal((await a.store.alerts.list("1"))[0]!.last_condition, null);
    await a.select(); await a.text("100"); await a.text("0.8"); const expired = a.button();
    a.advance(900001); await a.callback(expired); assert.equal((await a.store.alerts.list("1")).length, 1);
    await a.select(); await a.text("/cancel"); assert.equal(await a.store.flow("1"), undefined);
  } finally { a.store.close(); }
});
test("already-met preview primes silently; unavailable/failed previews remain accurately labeled", async () => {
  const market = changingMarket(() => NOW), a = setup(market);
  try {
    await a.select(); await a.text("100"); await a.text("0.8"); await a.callback(a.button());
    const alert = (await a.store.alerts.list("1"))[0]!; assert.equal(alert.last_condition, 1);
    const o = observation("0.91", NOW + 1); assert.equal(await a.store.alerts.apply(alert.id, o, evaluate(alert, o), 1000), undefined);
    market.current = null; await a.select(4); await a.text("100"); assert.match(a.last().text, /Quote가 현재 없습니다/);
    await a.callback(a.button()); assert.equal((await a.store.alerts.list("1")).find(x => x.type === "MARKET_RECOVERY")!.last_condition, 0);
    market.failure = "UNAVAILABLE"; await a.select(2); await a.text("100"); assert.match(a.last().text, /상태를 확인하지 못했습니다/);
    await a.callback(a.button()); assert.equal((await a.store.alerts.list("1")).find(x => x.type === "QUOTE_AVAILABLE")!.last_condition, null);
  } finally { a.store.close(); }
});
test("alert list paginates, buttons fit Telegram limits, latest status does not alter the trigger state", async () => {
  const a = setup();
  try {
    for (let n = 1; n <= 7; n++) await createAlert(a.store, { threshold: String(n) });
    await a.text("/alerts"); assert.match(a.last().text, /1\/2/); assert(a.last().text.length < 4096);
    assert(a.last().buttons!.flat().every(b => Buffer.byteLength(b.data) <= 64));
    await a.callback(a.button(5)); assert.match(a.last().text, /2\/2/);
    const alert = (await a.store.alerts.list("1"))[0]!;
    await a.callback(`a:status:${alert.id}`); assert.match(a.last().text, /1 USDC = 0.89 EURC/);
    assert.equal((await a.store.alerts.get(alert.id, "1"))?.last_condition, null);
    await a.text("/forget"); await a.callback(a.button()); assert.equal((await a.store.alerts.list("1")).length, 0);
  } finally { a.store.close(); }
});
test("notification button fetches a NEW Sera POST each tap, shows changed output/cost and rejects other users/deleted alerts", async () => {
  let posts = 0, clock = NOW;
  const fetcher: typeof fetch = async (url, init) => {
    const path = new URL(String(url)).pathname;
    if (path.endsWith("/config")) return Response.json({ chain_id: 11155111, eip712_domain: { chainId: 11155111 } });
    if (path.endsWith("/system/time")) return Response.json({ timestamp: NOW / 1000 });
    if (path.endsWith("/tokens")) return Response.json({ tokens: [A, B] });
    assert(path.endsWith("/swap/quote")); assert.equal(init?.method, "POST"); posts++;
    assert.equal(JSON.parse(String(init?.body)).from_amount, "100000000");
    return Response.json(quoteWire("100000000", String((90 + posts) * 1000000)));
  };
  const market = new MarketService(new SeraClient(config, fetcher, () => clock, async ms => { clock += ms; }), config), a = setup(market);
  try {
    const alert = await createAlert(a.store, {}, "1", false), snapshot = observation("0.95");
    const event = notificationView({ alert, observation: snapshot, evaluation: evaluate(alert, snapshot) }, "ko");
    const button = event.buttons![0]![0]!.data;
    await a.callback(button, "2"); assert.equal(posts, 0);
    await a.callback(button); assert.equal(posts, 1); assert.match(a.last().text, /최소 수령액: 91 EURC/); assert(!a.last().text.includes("예상 최소"));
    assert.match(a.last().text, /알림이 발생한 이후 시장 상황이 변했을 수 있어 최신 Quote를 다시 조회했습니다/);
    assert.match(a.last().text, /가스 비용 \(USD\): 0.12/);
    await a.callback(button); assert.equal(posts, 2); assert.match(a.last().text, /1 USDC = 0.92 EURC/);
    assert(!a.last().buttons!.flat().some(b => /sign|trade|거래 확인|서명/i.test(b.text)));
    await a.store.alerts.delete(alert.id, "1"); await a.callback(button); assert.equal(posts, 2);
    const english = notificationView({ alert, observation: snapshot, evaluation: evaluate(alert, snapshot) }, "en");
    assert.match(english.text, /Why it triggered/); assert.match(english.buttons![0]![0]!.text, /latest quote/);
  } finally { a.store.close(); }
});

test("trigger-specific quote keeps its origin through refresh and rejects another alert or user's trigger", async () => {
  const market = changingMarket(() => NOW), a = setup(market);
  try {
    const alert = await createAlert(a.store, {}, "1", false), snapshot = observation("0.95");
    const trigger = await a.store.alerts.apply(alert.id, snapshot, evaluate(alert, snapshot), 1000);
    assert(trigger);
    const view = notificationView({ alert, observation: snapshot, evaluation: evaluate(alert, snapshot) }, "ko", trigger);
    const button = view.buttons![0]![0]!.data;
    assert(Buffer.byteLength(button) <= 64);
    await a.callback(button, "2"); assert.equal(market.calls, 0);
    const other = await createAlert(a.store, { threshold: "0.8" }, "1", false);
    await a.callback(`a:q:${other.id}:${trigger}`); assert.equal(market.calls, 0);
    await a.callback(button); assert.equal(market.calls, 1);
    const refresh = a.button();
    const intent = await a.store.intent(refresh.split(":")[1]!, "1");
    assert.equal(intent?.origin, `alert-trigger:${trigger}`);
    await a.callback(refresh); assert.equal(market.calls, 2);
    assert.equal((await a.store.intent(a.button().split(":")[1]!, "1"))?.origin, `alert-trigger:${trigger}`);
  } finally { a.store.close(); }
});
