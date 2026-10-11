import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync, readdirSync} from 'node:fs';
import {hashTypedData, encodeAbiParameters} from 'viem';
import {fixtureDeployment as d, SYNTHETIC_START} from '../experiments/haruki-privy/fixtures.js';
import {normalTiming, OfflineExperiment, validateFixturePackage} from '../experiments/haruki-privy/harness.js';
import {privyInput, wireFromPrivy, realPrivySetupGate, type WireData} from '../experiments/haruki-privy/provider.js';
import {runScenarios} from '../experiments/haruki-privy/scenarios.js';
import {settlementFixture, reconcileFixtures} from '../experiments/haruki-privy/settlement.js';
import {hashes, intentData, type ExecutionQuote} from '../src/trades/contract.js';
import {permitRpcData, permitDigest} from '../src/permits/protocol.js';
import {intentRpcData} from '../src/trades/intent-protocol.js';

test('offline normal flow uses Intent then Permit, verifies both, submits once, finalizes after expiry', async () => {
  const f = new OfflineExperiment(); const r = await f.run();
  assert.deepEqual(r.signingOrder, ['Intent', 'Permit']);
  assert.equal(r.signaturesVerified, 2); assert.equal(r.submitCalls, 1);
  assert.equal(r.state, 'FIXTURE_FINALIZED'); assert.equal(r.acknowledgmentElapsedMs, 11350);
  assert.equal(r.quoteExpired, true); assert.equal(r.permitDeadlineExpired, true);
  assert.equal(r.livePrivyVerified, false); assert.equal(r.liveRelayerCalls, 0);
  assert.deepEqual(r.stages.map(s => s.stage), ['quoteMs','humanMs','intentMs','verificationMs','permitMs','verificationMs','preflightMs','acknowledgmentMs','inclusionMs','finalityMs']);
});
test('API acceptance alone remains pending; inclusion must precede signed deadline', async () => {
  const f = new OfflineExperiment({...normalTiming, inclusionMs: 300000}); f.prepare();
  assert.equal((await f.confirm(f.version, true)).state, 'ACKNOWLEDGED_PENDING');
  assert.equal(f.reconcile().state, 'FIXTURE_SETTLEMENT_FAILED');
});
test('confirmation is required and unsigned review does not call either provider', async () => {
  const f = new OfflineExperiment(); f.prepare();
  await assert.rejects(f.confirm(f.version, false), /EXPLICIT_CONSENT_REQUIRED/);
  assert.equal(f.report().signaturesReceived, 0); assert.equal(f.report().submitCalls, 0);
});
test('atomic duplicate taps reserve one sequence and one submit', async () => {
  const f = new OfflineExperiment(); f.prepare();
  const first = f.confirm(f.version, true);
  await assert.rejects(f.confirm(f.version, true), /ATTEMPT_LOCKED/); await first;
  assert.deepEqual(f.report().signingOrder, ['Intent','Permit']); assert.equal(f.report().submitCalls, 1);
});
test('expiry before consent requires explicit refresh and renewed review of a distinct quote', async () => {
  const f = new OfflineExperiment(); const old = f.prepare(); f.advance(30000);
  assert.equal((await f.confirm(old.version, true)).state, 'REFRESH_REQUIRED');
  assert.deepEqual(f.report().signingOrder, []);
  const next = f.prepare(); assert.notEqual(next.version, old.version); assert.notEqual(next.quote.uuid, old.quote.uuid);
  assert.equal(next.quote.route_params.maxInputAmount, '50000000');
  await assert.rejects(f.confirm(old.version, true), /RENEWED_REVIEW_REQUIRED/);
  await assert.rejects(f.confirm(next.version, false), /EXPLICIT_CONSENT_REQUIRED/);
  assert.equal((await f.confirm(next.version, true)).state, 'ACKNOWLEDGED_PENDING');
});
test('expiry during Intent verifies late signature, locks, never requests Permit', async () => {
  const f = new OfflineExperiment({...normalTiming, intentMs: 31000}); f.prepare();
  const r = await f.confirm(f.version, true);
  assert.equal(r.state, 'SIGNED_EXPIRED_LOCKED'); assert.equal(r.signaturesVerified, 1);
  assert.deepEqual(r.signingOrder, ['Intent']); assert.equal(r.submitCalls, 0);
  assert.equal(r.permitDeadlineExpired, false); assert.throws(() => f.prepare(), /ATTEMPT_LOCKED/);
});
test('expiry during Permit verifies original late result but cannot submit or rebind it', async () => {
  const f = new OfflineExperiment({...normalTiming, permitMs: 31000}); f.prepare();
  const r = await f.confirm(f.version, true);
  assert.equal(r.signaturesVerified, 2); assert.equal(r.state, 'SIGNED_EXPIRED_LOCKED');
  assert.equal(r.submitCalls, 0); assert.throws(() => f.prepare(), /ATTEMPT_LOCKED/);
});
test('expiry during preflight cannot submit, longer signed deadline does not replace quote TTL', async () => {
  const f = new OfflineExperiment({...normalTiming, preflightMs: 30000}); f.prepare();
  const r = await f.confirm(f.version, true);
  assert.equal(r.state, 'SIGNED_EXPIRED_LOCKED'); assert.equal(r.permitDeadlineExpired, false); assert.equal(r.submitCalls, 0);
});
for (const outcome of ['timeout','unknown','malformed'] as const) test(`${outcome} acknowledgment locks without a second submit`, async () => {
  const f = new OfflineExperiment(normalTiming, outcome); const r = await f.run();
  assert.equal(r.state, 'SUBMISSION_UNKNOWN_LOCKED'); assert.equal(r.submitCalls, 1); assert.equal(r.serverAccepted, null);
  await assert.rejects(f.confirm(f.version, true), /ATTEMPT_LOCKED/);
  assert.throws(() => f.prepare(), /ATTEMPT_LOCKED/); assert.throws(() => f.reconcile(), /NO_ACCEPTED_SUBMISSION/);
});
for (const fault of ['wrong-account','wrong-digest','invalid','unknown','rejected'] as const) test(`signing ${fault} stops without retry or raw errors`, async () => {
  const f = new OfflineExperiment(normalTiming, 'accepted', fault); const r = await f.run();
  assert.equal(r.signingOrder.length, 1); assert.equal(r.signaturesVerified, 0); assert.equal(r.submitCalls, 0);
  assert.equal(r.state, fault === 'unknown' ? 'RESULT_UNKNOWN_LOCKED' : fault === 'rejected' ? 'USER_REJECTED_CLOSED' : 'SIGNATURE_INVALID_LOCKED');
  await assert.rejects(f.confirm(f.version, true), /ATTEMPT_LOCKED/);
  assert.throws(() => f.prepare(), /ATTEMPT_LOCKED/);
});
test('current Privy serialized request preserves both full digests and explicit EIP712Domain', () => {
  const f = new OfflineExperiment(); const {quote: q} = f.prepare();
  for (const wire of [permitRpcData(q.permit.eip712, f.owner), intentRpcData(intentData(d, q), f.owner)]) {
    const input = privyInput(wire);
    assert.deepEqual(Object.keys(input), ['params']); assert.equal('primaryType' in input.params.typed_data, false);
    assert.ok(input.params.typed_data.types.EIP712Domain);
    assert.equal(hashTypedData(wireFromPrivy(input)), hashTypedData(wire));
    assert.equal(input.params.typed_data.domain.chainId, 11155111);
  }
  assert.notEqual(hashes(d, q).intent, hashes(d, q).struct);
  assert.equal(hashTypedData(wireFromPrivy(privyInput(permitRpcData(q.permit.eip712, f.owner) as WireData))), permitDigest(q.permit.eip712));
});
const mutations: Record<string, (q: ExecutionQuote) => void> = {
  'wrong chain': q => {q.permit.domain.chainId = 1 as 11155111;},
  'wrong spender': q => {q.permit.spender = q.route_params.recipient;},
  'wrong wallet': q => {q.route_params.recipient = d.sor_address;},
  'wrong token': q => {q.permit.token = q.route_params.outputToken;},
  'unlimited Permit': q => {q.permit.value_raw = (2n ** 256n - 1n).toString();},
  'wrong amount': q => {q.route_params.maxInputAmount = '51000000';},
  'wrong nonce': q => {q.permit.nonce = q.permit.eip712.message.nonce = 1;},
  'wrong token domain': q => {q.permit.domain.name = q.permit.eip712.domain.name = 'USD Coin';},
  'wrong Intent deadline': q => {q.route_params.deadline++;},
  'wrong executor UUID': q => {q.route_params.uuid = (1n << 252n).toString();},
  'malformed quote UUID': q => {q.uuid = 'not-a-quote-id';},
  'unverified costs': q => {delete q.quote_breakdown;},
  'inconsistent costs': q => {q.quote_breakdown!.output_amount_after_gas = '1';},
};
for (const [name, change] of Object.entries(mutations)) test(`package rejects ${name}`, () => {
  const f = new OfflineExperiment(); const {quote} = f.prepare(); change(quote);
  assert.throws(() => validateFixturePackage(quote, f.owner, SYNTHETIC_START + 750));
});
test('copy returned for review cannot mutate the immutable consent package', async () => {
  const f = new OfflineExperiment(); const q = f.prepare().quote; q.route_params.minOutputAmount = '1';
  assert.equal(f.quote.route_params.minOutputAmount, '60000000');
  assert.equal((await f.confirm(f.version, true)).signaturesVerified, 2);
});
for (const name of ['peer disagreement','reorg','reverted','not finalized','wrong event','wrong contract','over debit','under credit','balances'] as const)
  test(`fixture settlement rejects ${name}`, () => {
    const f = new OfflineExperiment(); const q = f.prepare().quote; const a = settlementFixture(q);
    if (name === 'peer disagreement') {const b = structuredClone(a); b.balances.outputAfter = '1'; assert.equal(reconcileFixtures(q, a, b), false); return;}
    if (name === 'reorg') a.canonicalHash = '0x' + 'c'.repeat(64);
    if (name === 'reverted') a.receipt.status = 'reverted';
    if (name === 'not finalized') a.finalized = 99n;
    if (name === 'wrong event') a.receipt.logs[0]!.topics[1] = hashes(d, q).intent;
    if (name === 'wrong contract') a.receipt.logs[0]!.address = q.route_params.inputToken;
    if (name === 'over debit') a.receipt.logs[1]!.data = encodeAbiParameters([{type:'uint256'}], [50000001n]);
    if (name === 'under credit') a.receipt.logs[2]!.data = encodeAbiParameters([{type:'uint256'}], [59999999n]);
    if (name === 'balances') a.balances.outputAfter = '1';
    assert.equal(reconcileFixtures(q, a, structuredClone(a)), false);
  });
test('nine scenario matrix labels modeled success, blocked expiry and uncertainty separately', async () => {
  const results = await runScenarios();
  assert.deepEqual(results.map(r => r.result.state), ['FIXTURE_FINALIZED','FIXTURE_FINALIZED','SIGNED_WINDOW_BLOCKED_LOCKED',
    'SUBMISSION_REJECTED_LOCKED','SIGNED_EXPIRED_LOCKED','REFRESH_REQUIRED','SIGNED_EXPIRED_LOCKED','SUBMISSION_UNKNOWN_LOCKED','SUBMISSION_UNKNOWN_LOCKED']);
  for (const {result} of results) {assert.ok(result.submitCalls <= 1); assert.equal(result.evidence, 'OFFLINE_FIXTURE_ONLY');}
});
test('offline CLI runs without credentials and emits no signatures or signed payloads', () => {
  const output = execFileSync(process.execPath, ['--import','tsx','experiments/haruki-privy/run.ts'], {encoding:'utf8'});
  const report = JSON.parse(output); assert.equal(report.results.length, 9);
  assert.doesNotMatch(output, /0x[0-9a-fA-F]{128,}|permit_signature|private_key|authorization_context/);
});
test('no live adapter, no environment switch, no production import, no new dependency', () => {
  assert.throws(realPrivySetupGate, /SEPARATE_AUTHORIZATION/);
  for (const file of readdirSync('experiments/haruki-privy').filter(f => f.endsWith('.ts'))) {
    const source = readFileSync('experiments/haruki-privy/' + file, 'utf8');
    assert.doesNotMatch(source, /\bfetch\s*\(|process\.env|https:\/\/|from ['"](?:node:fs|node:http|node:sqlite|@privy-io\/node)/);
  }
  const pkg = JSON.parse(readFileSync('package.json','utf8')); assert.equal(pkg.dependencies['@privy-io/node'], undefined);
  const walk = (dir: string) => {for (const entry of readdirSync(dir,{withFileTypes:true})) {
    const path = dir + '/' + entry.name;
    if (entry.isDirectory()) walk(path); else if (entry.name.endsWith('.ts')) assert.doesNotMatch(readFileSync(path,'utf8'), /experiments\/haruki-privy/);
  }}; walk('src'); walk('web');
});
