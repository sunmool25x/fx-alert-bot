import {hashTypedData, type Hex} from 'viem';
import {hashes, intentData, validateQuote, type ExecutionQuote} from '../../src/trades/contract.js';
import {quoteEconomics} from '../../src/trades/economics.js';
import {intentRpcData, verifyIntentSignature} from '../../src/trades/intent-protocol.js';
import {permitRpcData, permitDigest, verifyPermitSignature} from '../../src/permits/protocol.js';
import {AMOUNT, fixtureDeployment as d, fixtureQuote, SYNTHETIC_START} from './fixtures.js';
import {SimulatedPrivy, privyInput, wireDigest, type SigningFault, type WireData} from './provider.js';
import {reconcileFixtures, settlementFixture} from './settlement.js';

export interface Timing {
  quoteMs: number; humanMs: number; intentMs: number; permitMs: number;
  verificationMs: number; preflightMs: number; acknowledgmentMs: number; inclusionMs: number; finalityMs: number;
}
export type Outcome = 'accepted' | 'timeout' | 'unknown' | 'rejected' | 'malformed';
export type State = 'EMPTY' | 'REVIEW' | 'SIGNING' | 'REFRESH_REQUIRED' | 'SIGNED_EXPIRED_LOCKED' | 'SIGNED_WINDOW_BLOCKED_LOCKED'
  | 'SIGNATURE_INVALID_LOCKED' | 'RESULT_UNKNOWN_LOCKED' | 'USER_REJECTED_CLOSED'
  | 'SUBMISSION_UNKNOWN_LOCKED' | 'SUBMISSION_REJECTED_LOCKED' | 'ACKNOWLEDGED_PENDING' | 'FIXTURE_FINALIZED' | 'FIXTURE_SETTLEMENT_FAILED';
export const normalTiming: Timing = {quoteMs: 750, humanMs: 7000, intentMs: 800, permitMs: 800,
  verificationMs: 100, preflightMs: 900, acknowledgmentMs: 1000, inclusionMs: 10000, finalityMs: 600000};
type Stage = keyof Timing;
type Event = {stage: Stage; startMs: number; endMs: number};

export function validateFixturePackage(q: ExecutionQuote, owner: string, now: number) {
  validateQuote(q, d, owner, BigInt(AMOUNT), q.route_params.deadline, Math.floor(now / 1000), 0);
  if (q.permit.domain.name !== 'CIRCLE' || q.permit.domain.version !== '1' || BigInt(q.permit.nonce) !== 0n)
    throw new Error('FIXTURE_DOMAIN_OR_NONCE');
  permitRpcData(q.permit.eip712, owner);
  intentRpcData(intentData(d, q), owner);
  if (quoteEconomics(q).status !== 'PASS') throw new Error('COST_GATE');
}

/** Single synthetic attempt. No fetch, SDK client, DB, filesystem or runtime configuration. */
export class OfflineExperiment {
  readonly #provider: SimulatedPrivy;
  readonly #timing: Timing;
  readonly #outcome: Outcome;
  #now = SYNTHETIC_START;
  #state: State = 'EMPTY';
  #quote?: ExecutionQuote;
  #generation = 0;
  #version?: string;
  #consumed = false;
  #intent?: Hex;
  #permit?: Hex;
  #events: Event[] = [];
  #submitCalls = 0;
  #atSubmit?: number;
  #atAck?: number;
  #serverAccepted?: boolean;
  #receivedSignatures = 0;
  #verifiedSignatures = 0;
  #reason = 'NONE';

  constructor(timing: Timing = normalTiming, outcome: Outcome = 'accepted', fault: SigningFault = 'none') {
    if (Object.values(timing).some(n => !Number.isSafeInteger(n) || n < 0) || timing.verificationMs % 2) throw new Error('INVALID_FIXTURE_TIMING');
    this.#timing = {...timing}; this.#outcome = outcome; this.#provider = new SimulatedPrivy(fault);
  }
  get state() { return this.#state; }
  get owner() { return this.#provider.owner; }
  get quote() { if (!this.#quote) throw new Error('NO_REVIEW'); return structuredClone(this.#quote); }
  get version() { if (!this.#version) throw new Error('NO_REVIEW'); return this.#version; }
  advance(ms: number) { if (!Number.isSafeInteger(ms) || ms < 0) throw new Error('INVALID_FIXTURE_TIME'); this.#now += ms; }
  private elapsed(stage: Stage, ms = this.#timing[stage]) {
    const startMs = this.#now - SYNTHETIC_START;
    this.advance(ms);
    this.#events.push({stage, startMs, endMs: this.#now - SYNTHETIC_START});
  }
  prepare() {
    if (!['EMPTY', 'REFRESH_REQUIRED'].includes(this.#state) || this.#provider.calls.length) throw new Error('ATTEMPT_LOCKED');
    const q = fixtureQuote(this.owner, this.#now, ++this.#generation);
    this.elapsed('quoteMs');
    validateFixturePackage(q, this.owner, this.#now);
    this.#quote = q; this.#version = hashes(d, q).version; this.#consumed = false; this.#state = 'REVIEW';
    return {version: this.version, quote: this.quote, economics: quoteEconomics(q)};
  }
  private validWindow(marginMs = 0) {
    const q = this.#quote!;
    if (hashes(d, q).version !== this.#version) throw new Error('PACKAGE_CHANGED');
    if (this.#now >= q.expires_at * 1000 || this.#now >= q.route_params.deadline * 1000)
      throw new Error('QUOTE_EXPIRED');
    if (this.#now + marginMs >= q.expires_at * 1000) throw new Error('SUBMISSION_MARGIN');
  }
  async confirm(reviewedVersion: string, explicitlyApproved: boolean) {
    if (!explicitlyApproved) throw new Error('EXPLICIT_CONSENT_REQUIRED');
    if (this.#state !== 'REVIEW' || this.#consumed) throw new Error('ATTEMPT_LOCKED');
    if (reviewedVersion !== this.#version) throw new Error('RENEWED_REVIEW_REQUIRED');
    this.#consumed = true; // Reserve synchronously before the first asynchronous call.
    try {
      this.validWindow();
      this.#state = 'SIGNING';
      const q = this.#quote!;
      const intent = intentRpcData(intentData(d, q), this.owner) as WireData;
      this.#intent = await this.sign('intentMs', intent, async value =>
        verifyIntentSignature(intent, value, this.owner, hashes(d, q).intent));
      this.validWindow();
      const permit = permitRpcData(q.permit.eip712, this.owner) as WireData;
      this.#permit = await this.sign('permitMs', permit, async value =>
        verifyPermitSignature(q.permit.eip712, value, this.owner, permitDigest(q.permit.eip712)));
      this.validWindow();
      this.elapsed('preflightMs');
      // A local five-second buffer is an experiment admission rule, not an extension of Sera TTL.
      this.validWindow(5000);
      await this.submitOnce({uuid: q.uuid, signature: this.#intent, permit_signature: this.#permit,
        permit_deadline: q.permit.eip712.message.deadline});
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      // Never propagate provider objects/messages, request bodies or signature bytes into reports.
      this.#reason = ['QUOTE_EXPIRED', 'SUBMISSION_MARGIN', 'RESULT_UNKNOWN', 'USER_REJECTED', 'INVALID_SIGNATURE'].includes(code) ? code : 'VALIDATION_FAILED';
      if (code === 'QUOTE_EXPIRED') this.#state = this.#verifiedSignatures ? 'SIGNED_EXPIRED_LOCKED' : 'REFRESH_REQUIRED';
      else if (code === 'SUBMISSION_MARGIN') this.#state = 'SIGNED_WINDOW_BLOCKED_LOCKED';
      else if (code === 'USER_REJECTED') this.#state = 'USER_REJECTED_CLOSED';
      else if (code === 'RESULT_UNKNOWN') this.#state = 'RESULT_UNKNOWN_LOCKED';
      else this.#state = 'SIGNATURE_INVALID_LOCKED';
    }
    return this.report();
  }
  private async sign(stage: 'intentMs' | 'permitMs', wire: WireData, verify: (signature: unknown) => Promise<Hex>) {
    this.validWindow();
    const input = privyInput(wire);
    if (hashTypedData(wire) !== wireDigest({...input.params.typed_data, primaryType: input.params.typed_data.primary_type}))
      throw new Error('PACKAGE_CHANGED');
    const pending = this.#provider.wallets().ethereum().signTypedData(this.#provider.walletId, input);
    this.elapsed(stage);
    const response = await pending;
    this.#receivedSignatures++;
    // Verify original typed data even when the modeled provider returns after quote expiry.
    const signature = await verify(response.signature);
    this.#verifiedSignatures++;
    this.elapsed('verificationMs', this.#timing.verificationMs / 2);
    return signature;
  }
  private async submitOnce(payload: {uuid: string; signature: Hex; permit_signature: Hex; permit_deadline: number}) {
    if (this.#submitCalls) throw new Error('ATTEMPT_LOCKED');
    const q = this.#quote!;
    if (Object.keys(payload).sort().join(',') !== 'permit_deadline,permit_signature,signature,uuid'
      || payload.uuid !== q.uuid || payload.permit_deadline !== q.permit.eip712.message.deadline) throw new Error('PACKAGE_CHANGED');
    await verifyIntentSignature(intentRpcData(intentData(d, q), this.owner), payload.signature, this.owner, hashes(d, q).intent);
    await verifyPermitSignature(q.permit.eip712, payload.permit_signature, this.owner, permitDigest(q.permit.eip712));
    this.validWindow(5000);
    this.#submitCalls++;
    this.#atSubmit = this.#now;
    this.elapsed('acknowledgmentMs');
    // Model server receipt/validation at the end of this delay conservatively.
    if (this.#outcome === 'timeout' || this.#outcome === 'unknown' || this.#outcome === 'malformed') {
      this.#state = 'SUBMISSION_UNKNOWN_LOCKED'; this.#reason = this.#outcome.toUpperCase(); return;
    }
    if (this.#outcome === 'rejected' || this.#now >= q.expires_at * 1000) {
      this.#serverAccepted = false; this.#state = 'SUBMISSION_REJECTED_LOCKED'; this.#reason = 'SERVER_REJECTED'; return;
    }
    this.#serverAccepted = true; this.#atAck = this.#now; this.#state = 'ACKNOWLEDGED_PENDING';
  }
  reconcile() {
    if (this.#state !== 'ACKNOWLEDGED_PENDING') throw new Error('NO_ACCEPTED_SUBMISSION');
    this.elapsed('inclusionMs');
    if (this.#now >= this.#quote!.route_params.deadline * 1000) {
      this.#state = 'FIXTURE_SETTLEMENT_FAILED'; this.#reason = 'SIGNED_DEADLINE_EXPIRED_BEFORE_INCLUSION'; return this.report();
    }
    this.elapsed('finalityMs');
    const receipt = settlementFixture(this.#quote!);
    if (!reconcileFixtures(this.#quote!, receipt, structuredClone(receipt))) throw new Error('SETTLEMENT_MISMATCH');
    this.#state = 'FIXTURE_FINALIZED';
    return this.report();
  }
  async run() {
    this.prepare(); this.elapsed('humanMs');
    await this.confirm(this.version, true);
    if (this.#state === 'ACKNOWLEDGED_PENDING') this.reconcile();
    return this.report();
  }
  report() {
    return {evidence: 'OFFLINE_FIXTURE_ONLY' as const, state: this.#state, reason: this.#reason,
      signingOrder: [...this.#provider.calls], signaturesReceived: this.#receivedSignatures,
      signaturesVerified: this.#verifiedSignatures, submitCalls: this.#submitCalls,
      serverAccepted: this.#serverAccepted ?? null,
      submitElapsedMs: this.#atSubmit === undefined ? null : this.#atSubmit - SYNTHETIC_START,
      acknowledgmentElapsedMs: this.#atAck === undefined ? null : this.#atAck - SYNTHETIC_START,
      remainingAtSubmitMs: this.#atSubmit === undefined ? null : this.#quote!.expires_at * 1000 - this.#atSubmit,
      elapsedMs: this.#now - SYNTHETIC_START,
      quoteExpired: !!this.#quote && this.#now >= this.#quote.expires_at * 1000,
      permitDeadlineExpired: !!this.#quote && this.#now >= this.#quote.permit.suggested_deadline * 1000,
      stages: structuredClone(this.#events),
      localFixtureSigningWallMs: [...this.#provider.cryptoWallMs],
      livePrivyVerified: false, liveRelayerCalls: 0, productionStateModified: false};
  }
}
