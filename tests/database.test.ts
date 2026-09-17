import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteStore } from "../src/database/store.js";
import { NOW, A, B } from "./helpers.js";

test("users, language, source, flow and quote intents survive a database restart", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sera-korea-test-")); const path = join(dir, "bot.db");
  let store = new SqliteStore(path, 900000, () => NOW);
  try {
    await store.touch("1", "source_korea"); await store.language("1", "en");
    await store.saveFlow("1", { operation: "quote", stage: "amount", nonce: "abc", choices: [], from: A.address, to: B.address });
    const intent = await store.saveIntent("1", A.address, B.address, "100");
    store.close(); store = new SqliteStore(path, 900000, () => NOW + 1);
    assert.equal((await store.user("1"))?.language, "en");
    assert.equal((await store.user("1"))?.source, "source_korea");
    assert.equal((await store.flow("1"))?.stage, "amount");
    assert.equal((await store.intent(intent, "1"))?.amount, "100");
    assert.equal(await store.intent(intent, "2"), undefined);
    await store.forget("1"); assert.equal(await store.intent(intent, "1"), undefined);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});
test("conversation and quote-intent TTLs persist, and invalid acquisition sources are ignored", async () => {
  let now = NOW; const store = new SqliteStore(":memory:", 60000, () => now);
  try {
    await store.touch("1", "invalid/path"); assert.equal((await store.user("1"))?.source, null);
    await store.saveFlow("1", { operation: "rate", stage: "from", nonce: "x", choices: [A.address] });
    const id = await store.saveIntent("1", A.address, B.address, "100");
    now += 60001;
    assert.equal(await store.flow("1"), undefined); assert.equal(await store.intent(id, "1"), undefined);
  } finally { store.close(); }
});
