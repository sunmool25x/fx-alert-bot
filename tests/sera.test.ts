import test from "node:test";
import assert from "node:assert/strict";
import { SeraClient } from "../src/sera/client.js";
import { MarketService, percentageChange } from "../src/sera/service.js";
import { quoteSchema, tokensSchema, rateSchema } from "../src/sera/schemas.js";
import { toRawUnits, fromRawUnits, validateAmount } from "../src/sera/precision.js";
import { AppError } from "../src/utils/errors.js";
import { retryAfterMs } from "../src/utils/pacing.js";
import { loadConfig } from "../src/config/index.js";
import { A, B, NOW, config, quoteWire } from "./helpers.js";

function api(quote = quoteWire()) {
  let now = NOW; const paths: string[] = []; const bodies: unknown[] = [];
  const fetcher: typeof fetch = async (url, init) => {
    const u = new URL(String(url)); paths.push(u.pathname + u.search);
    if (init?.body) bodies.push(JSON.parse(String(init.body)));
    const data = u.pathname.endsWith("/config") ? { chain_id: 11155111, eip712_domain: { chainId: 11155111 } }
      : u.pathname.endsWith("/system/time") ? { timestamp: NOW / 1000 }
      : u.pathname.endsWith("/tokens") ? { tokens: [A, B] }
      : u.pathname.endsWith("/swap/quote") ? quote
      : { pair: "USD/EUR", rate: "0.9", as_of: NOW / 1000 };
    return Response.json(data);
  };
  const client = new SeraClient(config, fetcher, () => now, async ms => { now += ms; });
  return { client, paths, bodies, market: new MarketService(client, config) };
}
test("parsers accept optional fields and reject malformed raw amounts and invalid FX", () => {
  assert(tokensSchema.safeParse({ tokens: [A, B] }).success);
  assert(quoteSchema.safeParse(quoteWire()).success);
  assert(!quoteSchema.safeParse({ ...quoteWire(), route_params: { ...quoteWire().route_params, minOutputAmount: "1e6" } }).success);
  assert(!rateSchema.safeParse({ pair: "USD/EUR", rate: "0", as_of: 1 }).success);
  assert(!quoteSchema.safeParse({ ...quoteWire(), route_params: { ...quoteWire().route_params, uuid: (2n ** 256n).toString() } }).success);
});
test("exact conversion preserves large amounts, tiny positive values and zero-decimal tokens", () => {
  assert.equal(toRawUnits("9007199254740993.123456", 6), 9007199254740993123456n);
  assert.equal(fromRawUnits(123n, 0), "123");
  assert.equal(fromRawUnits(1n, 6), "0.000001");
  assert.equal(validateAmount("0", 6).ok, false);
  assert.equal(validateAmount("1.0000001", 6).ok, false);
  assert.throws(() => toRawUnits("1e3", 6));
});
test("percentage arithmetic uses decimal math and rejects a zero baseline", () => {
  assert.equal(percentageChange("1.005", "1"), "0.5000");
  assert.equal(percentageChange("0.995", "1"), "-0.5000");
  assert.throws(() => percentageChange("1", "0"));
});
test("every quote refresh makes a new POST; metadata is cached and spend/output are exact", async () => {
  const a = api(); const c = await a.market.quote(A, B, "100"); await a.market.quote(A, B, "100");
  assert.equal(c.output, "90"); assert.equal(c.rate, "0.9");
  assert.equal(a.paths.filter(p => p.endsWith("/swap/quote")).length, 2);
  assert.equal(a.paths.filter(p => p.endsWith("/config")).length, 1);
  assert.equal((a.bodies[0] as { from_amount: string }).from_amount, "100000000");
});
test("200 zero-output quote is unavailable; mismatched token/amount/owner and stale quotes are rejected", async () => {
  assert.equal((await api(quoteWire("100000000", "0")).market.quote(A, B, "100")).executableRoute, false);
  const wrong = quoteWire(); wrong.route_params.taker = A.address;
  await assert.rejects(api(wrong).market.quote(A, B, "100"), { code: "QUOTE_BINDING_MISMATCH" });
  await assert.rejects(api(quoteWire("200000000")).market.quote(A, B, "100"), { code: "QUOTE_BINDING_MISMATCH" });
  const stale = quoteWire(); stale.expires_at = NOW / 1000;
  await assert.rejects(api(stale).market.quote(A, B, "100"), { code: "QUOTE_STALE" });
});
test("min trade, uint256, nonpositive and extra precision blocked before quote POST", async () => {
  const a = api();
  for (const amount of ["0", "0.5", "1.0000001", (2n ** 256n).toString(), "-1"])
    await assert.rejects(a.market.quote(A, B, amount), AppError);
  assert.equal(a.bodies.length, 0);
});
test("unexpected chain ID fails before market data is fetched", async () => {
  const fetcher: typeof fetch = async () => Response.json({ chain_id: 1, eip712_domain: { chainId: 1 } });
  const client = new SeraClient(config, fetcher);
  await assert.rejects(client.preflight(), { code: "NETWORK_MISMATCH" });
});
test("no-liquidity and token-minimum error envelopes are parsed without exposing response text", async () => {
  for (const [field, value, code] of [["error", "no_liquidity", "NO_LIQUIDITY"], ["code", "AMOUNT_BELOW_MIN", "AMOUNT_BELOW_MIN"]]) {
    const fetcher: typeof fetch = async () => Response.json({ detail: { [field!]: value } }, { status: 400 });
    await assert.rejects(new SeraClient(config, fetcher).getTokens(), { code });
  }
});

test("legacy quote No liquidity is classified without retrying, caching success or exposing provider text", async () => {
  let calls=0;const client=new SeraClient(config,async()=>{calls++;return Response.json({detail:"No liquidity"},{status:400});},()=>NOW,async()=>{});
  const request={from_token:A.address,to_token:B.address,from_amount:"1000000",owner_address:A.address,recipient:A.address,expiration:NOW/1000+300,gas_mode:"receive_less" as const};
  await assert.rejects(client.getQuote(request),{code:"NO_LIQUIDITY",status:400});assert.equal(calls,1);
});

test("unknown error text or server outage is never interpreted as quote liquidity evidence", async () => {
  for(const [status,detail] of [[400,"No liquidity https://private.example/key"],[500,"No liquidity"],[400,"secret provider error"]] as const){
    const client=new SeraClient(config,async()=>Response.json({detail},{status}));
    await assert.rejects(client.getQuote({from_token:A.address,to_token:B.address,from_amount:"1000000",owner_address:A.address,recipient:A.address,expiration:1,gas_mode:"receive_less"}),e=>{
      assert(e instanceof AppError);assert.equal(e.code,"UNAVAILABLE");assert(!String(e).includes(detail));return true;
    });
  }
});
test("429 obeys Retry-After and retries GET; quote POST is never retried", async () => {
  let now = NOW, calls = 0;
  const fetcher: typeof fetch = async () => ++calls === 1
    ? Response.json({}, { status: 429, headers: { "retry-after": "1" } }) : Response.json({ tokens: [A] });
  const client = new SeraClient(config, fetcher, () => now, async ms => { now += ms; });
  await client.getTokens(); assert.equal(calls, 2); assert(now >= NOW + 1000);
  calls = 0;
  const limited: typeof fetch = async () => { calls++; return Response.json({}, { status: 429, headers: { "retry-after": "60" } }); };
  const c = new SeraClient(config, limited, () => now, async ms => { now += ms; });
  await assert.rejects(c.getQuote({ from_token: A.address, to_token: B.address, from_amount: "100", owner_address: A.address, recipient: A.address, expiration: 1, gas_mode: "receive_less" }), { code: "RATE_LIMITED" });
  await assert.rejects(c.getTokens(), { code: "RATE_LIMITED" }); assert.equal(calls, 1);
  assert.equal(retryAfterMs(new Date(NOW + 5000).toUTCString(), NOW), 5000);
});
test("transport failures during depth probing propagate, without reporting no liquidity", async () => {
  const a = api();
  a.market.quote = async () => { throw new AppError("UNAVAILABLE"); };
  await assert.rejects(a.market.depth(A, B), { code: "UNAVAILABLE" });
});
test("metadata cache deduplicates concurrent requests and evicts rejected flights", async () => {
  let calls = 0, fail = true;
  const fetcher: typeof fetch = async () => { calls++; await Promise.resolve(); if (fail) return Response.json({}, { status: 400 }); return Response.json({ tokens: [A] }); };
  const c = new SeraClient(config, fetcher, () => NOW, async () => undefined);
  await Promise.allSettled([c.getTokens(), c.getTokens()]); assert.equal(calls, 1);
  fail = false; await c.getTokens(); assert.equal(calls, 2);
});
test("configuration rejects implicit mainnet, execution flags and invalid probe sizes", () => {
  assert.equal(loadConfig({}).network, "sepolia");
  assert.throws(() => loadConfig({ SERA_NETWORK: "mainnet" }));
  assert.throws(() => loadConfig({ ENABLE_TESTNET_EXECUTION: "true" }));
  assert.throws(() => loadConfig({ LIQUIDITY_PROBE_SIZES: "1e3" }));
  // Phase 4 intentionally tightens the former opt-in read-only mainnet policy.
  assert.throws(() => loadConfig({ SERA_NETWORK: "mainnet", ENABLE_MAINNET: "true" }), /Sepolia only/);
});
