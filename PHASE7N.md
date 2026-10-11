# Phase 7N — offline authorization and settlement readiness

2026-10-11. Classification **A — OFFLINE_READY_FOR_CONTROLLED_LIVE_ACCEPTANCE** applies to the implementation and fixtures only. It does **not** establish a reliable mobile two-signature flow or a completed swap. Mainnet, live swap execution, Intent signing and relayer submission remain OFF. No owner-acceptance Quote, financial signature, relayer POST or transaction was requested in this phase. No commit or push was made.

## Baseline and preserved evidence

Baseline: published commit `51387a693819f67206503dca92e01c0444d63f98`, Phase 7M, 772 passing tests. Existing TradeService, WalletStore, PermitStore, OKX bridge, funding history, settlement monitor and launcher were reused. This extends the existing application; it introduces no alternative exchange or execution service.

The successful historical record remains **PERMIT_SIGNED**, cryptographically VALID, encrypted and financially locked. Its Quote expired at `2026-10-11T04:17:14Z`; its Permit deadline was `2026-10-11T04:21:43Z`. Expiry does not relabel a valid signature as unsigned or invalid. Neither that signature nor its nonce/deadline may be rebound to a new Quote. Its original records, ciphertext, digest, successful funding claim and audit chronology are preserved. **No live retirement or financial schema migration was applied.**

Implementation was built and tested in an ignored working copy of this application before the validated files were applied together. This prevents the existing `dev:live` watcher from rebuilding half-written code. The existing launcher, tunnel, private environment and databases remain in place. Runtime reload uses the existing launcher and keeps its execution-OFF enforcement. The long-running launcher still prints its existing Database warning from its loaded preflight code; a fresh read-only check using the current validator passes, as do live integrity and foreign-key checks. The launcher/tunnel were not restarted merely to clear that diagnostic.

## Separate retirement policy for an expired valid Permit

`src/permits/valid-retirement.ts` and the existing PermitStore implement `EXPIRED_VALID_SIGNATURE_NO_ACTIVE_AUTHORITY`. The operator verifies both encrypted copies locally against the original canonical Permit; they must agree and remain VALID. No signature goes to RPC, logs or the report.

Retirement requires all of the following, and never changes the original signed row:

- Exact token, owner, spender, amount, nonce, original package/digest and retained callback hash.
- Two independent Sepolia RPC observations, common finalized block/hash, finalized time beyond the Permit deadline, matching current nonce and zero allowance.
- Previously independently inspected deployed token runtime/expiry behavior, exact domain separator and clock checks.
- A complete bounded zero-Approval history for the exact owner/spender, beginning before the original request and ending at the common finalized anchor; both RPCs must agree. The operator refuses a history wider than its 10,000-block bound.
- No unresolved trade/submission/claim conflict. Any uncertainty, inconsistent nonce evidence, nonzero allowance, inconsistent chain evidence or altered original result blocks retirement.

Default operator command (private request ID, no signature output):

```sh
node --use-system-ca --import tsx scripts/reconcile-signed-permit.ts --request <private-request-id>
```

This is a **dry run**. A separately authorized operator may later apply append-only retirement evidence using `--apply`, only after opt-in migration 15. That migration widens the existing retirement ledger's classification and preserves historical triggers/rows. Neither migration nor retirement is performed by normal startup. Fixtures exercise dry-run criteria and retirement against disposable databases; the actual signed lock is untouched. The live read-only dry run conservatively stopped at APPROVAL_HISTORY: dRPC returned HTTP 400 / code 35 (range restriction) even for a bounded 500-block probe. Both providers separately agreed on nonce 0 / allowance 0, but that does not replace complete independent history evidence. No retirement eligibility is claimed; obtain fresh complete evidence before any later operator action.

New full-trade authorization tables (migration 16) initialize only after the existing full-trade execution gate passes, or in explicit migration tests. They do not initialize in the disabled live runtime. Both migrations were tested twice for idempotency on a consistent disposable copy: all 28 original tables' rows remained identical, integrity `ok`, zero foreign-key errors. Do not run operator migrations against the live database as part of ordinary recovery.

## Protocol and exact Intent wire schema

The current official [swap API](https://docs.testnet.sera.cx/api-reference/endpoints/swaps/), [authentication contract](https://docs.testnet.sera.cx/api-reference/authentication/) and [testnet configuration](https://api.testnet.sera.cx/api/v1/config) were checked. The wallet-funded API still requires a per-quote Permit plus Intent, then one `POST /swap` with `uuid`, `signature`, `permit_signature`, and the exact signed numeric `permit_deadline`. Standing allowance does not eliminate this API's per-quote Permit requirement. A pending `trade_id` acknowledges processing; it does not prove settlement.

Strict wire validation in `src/trades/intent-protocol.ts` includes an explicit canonical `types.EIP712Domain` and this exact ordered schema:

| Field | Type |
|---|---|
| taker | address |
| inputToken | address |
| outputToken | address |
| maxInputAmount | uint256 |
| minOutputAmount | uint256 |
| recipient | address |
| initialDepositAmount | uint256 |
| uuid | uint256 |
| deadline | uint48 |

Domain: `Sera`, version `1`, chain `11155111`, verifying contract `0x83475A1bD98a8DC2DCd507A747e4DC85da241D6e`. Permit spender/SOR remains `0x83c1368110B640A729f3810De5FBe94b99aa5668`. Unsupported fields, order, domain, chain, owner, recipient or tokens fail closed. Permit is exactly 50 USDC (`50000000` raw), never unlimited. Production has no wallet private key or server signer.

At 05:30:14 UTC, read-only PublicNode and dRPC checks agreed with the live configuration, Sera `DOMAIN_SEPARATOR`, SOR `sera()` binding and deployed `getIntentDigest`. The explicit wire full digest matches the deployed verifier for the original unsigned Intent snapshot. This used historical data solely for read-only digest comparison, **not** for authorization or execution. The event's Intent **struct hash** is separately retained and differs from the full EIP-712 signing digest.

The installed OKX serializer was exercised with fixtures. The provider boundary retains `eth_signTypedData_v4`, `[address, typedDataObject]` and explicit `eip155:11155111`. No personal-sign fallback or arbitrary hash signing exists. Both signatures undergo canonical 65-byte/low-S ECDSA validation and recovery against their original full digests.

## One durable authorization lifecycle

The existing TradeService creates one immutable package using its original trade/version/snapshot. `trade_packages` binds owner, wallet, session epoch and both digests. SQL triggers also preserve the trade's Quote, payload, continuation, origin, expiry, chain and version. Exact tokens, 50-USDC amount, cost gate, same-wallet recipient, route UUID, Quote UUID/expiry, nonce and both deadlines are rechecked from this package. Configuration is rechecked before each financial action. Independent EOA/Permit checks and domain/nonce/Intent-digest reads are safely parallelized; none are skipped.

| Stage | Durable state / effect |
|---|---|
| Fresh package | Existing DRAFT → REVIEW; immutable package retained |
| Explicit first approval | QUOTE_REVIEWED / SIGNATURES, then Permit reservation |
| Signature request | Per-step REQUESTING before returning its typed data |
| Proven client observations | Separate CLIENT_DISPATCHED, SDK_INVOKED, handoff and callback events; none alone prove delivery or signing |
| Callback | CAPTURED ciphertext committed **before** asynchronous cryptographic checks |
| Valid result | Per-step SIGNED with crypto, quote expiry, signature expiry and chain status kept distinct |
| Rejected / uncertain | REJECTED or RESULT_UNKNOWN; retained financial lock, no retry |
| Explicit final submission | Durable attempt + SUBMITTING before the sole external POST |
| Ambiguous response | UNKNOWN; read-only reconciliation, no replay |
| Pending acknowledgment | PENDING; no settlement success claim |
| Verified settlement | CONFIRMED only after independent finalized receipt, event, transfer and balance checks |

Intent cannot be reserved until the same package's retained Permit is SIGNED and reverified. The server never returns both signature requests together. Intent and submission are separate explicit actions. Submission decrypts and verifies **both** original ciphertexts again, rechecks live nonce/domain/configuration, cost/freshness/ownership and atomically records one attempt. The client cannot submit arbitrary signature strings through the legacy endpoint.

AES-256-GCM associated data binds trade, owner, wallet, package version, step and digest. Authenticated owner callbacks can be retained after wallet/proof changes or Quote expiry, but cannot advance the old package. Invalid bytes remain encrypted evidence. Restarted REQUESTING becomes RESULT_UNKNOWN; CAPTURED results can be validated from ciphertext without another wallet call. Browser closure or a callback that cannot reach the authenticated server remains unknown and locked. Signatures are never stored in browser storage, diagnostics or analytics.

The shared financial-lock policy covers legacy Permit-only requests, full trades, unknown submissions, unresolved funding and quarantined wallets. Duplicate taps, requests and identical callbacks are idempotent or rejected by durable compare-and-swap checks. Different callbacks cannot replace retained ciphertext. Signed/unknown expired packages remain locked; cancellation does not revoke authorization. The new legacy-valid-Permit retirement operator is **not** a general retirement policy for full-trade Intent/Permit packages. Those unresolved packages conservatively require a future dedicated reconciliation review.

## Existing Mini App: three explicit actions

The existing continuation/Quote button can prepare a full financial review only when the existing full-trade gate is enabled and Permit-only mode is disabled. The current live configuration does neither. Ordinary read-only and Permit-only routing stays distinct and cannot silently promote an old preview.

The prepared Korean-first panel shows TESTNET/Sepolia, amount, wallet/recipient, minimum receive, quoted costs, Permit limit/spender, signature deadlines and Quote countdown next to consent. Full technical disclosures remain accessible. Each action resets consent:

1. **USDC 사용 승인** — explicitly confirm this Quote and request one Permit.
2. **이번 교환 승인** — request one Intent, only after verified Permit and adequate remaining time.
3. **거래 제출** — submit once, only after both verified results and fresh final checks.

Pending and error state appears immediately. **OKX 열기** reopens the same in-flight request; it never signs again. **승인 상태 확인** reads retained state. Refresh can close only a package with no financial request, then requires a genuinely new Quote and consent. A requested, signed or unknown package cannot be cleared to enable a refresh. There is no screenshot/chat prerequisite inside the short Quote window.

## Finalized settlement, not HTTP success

The existing SepoliaReads/SettlementMonitor now require two independent RPCs to agree on the same successful canonical finalized receipt, one exact SOR IntentMatched event/taker/struct hash, protocol token paths, positive net USDC debit within the signed maximum and net XSGD credit to the signed recipient at least the signed minimum. Historical block-before/block-after balances must equal the receipt's net movements. Block hashes are rechecked after balance reads.

Missing/reverted/nonfinal receipts, duplicate Intent events, wrong recipients, unrelated same-wallet transfers, insufficient output, RPC disagreement and unavailable historical balances never mark completion. A matching but incomplete receipt retains its cursor for reconciliation. A later canonical-block mismatch quarantines the wallet and moves settlement to UNKNOWN_REORG. A separate unrelated same-wallet transaction in the same block can make balance reconciliation ambiguous; this conservatively blocks verification rather than attributing its funds to the swap. Real protocol transfer paths and archive-RPC availability still require live acceptance evidence.

## Short-Quote admission and limits

Pre-Quote: connection, fresh ownership, education, token metadata, deployment/EOA/balances, executor readiness and clock checks. Post-Quote: exact returned package/nonce/digests, review, two separate wallet decisions, final owner submission and dynamic checks. A new quote never inherits prior consent or signatures.

| Remaining step | Budget including later actions and five-second margin |
|---|---:|
| Before Permit dispatch | 28.221 seconds |
| Before Intent dispatch | 16 seconds |
| Before submission | 8 seconds |

The measured Phase 7M review-to-Permit-persistence time was 12.221 seconds. We conservatively reserve that entire amount for the Permit stage; the 8-second Intent and 3-second submission allowances are **unproven assumptions**, plus the existing 5-second safety margin. Admission checks the earliest of official Quote expiry, Permit deadline, Intent deadline and ownership validity before and after server work. No local TTL extension occurs.

Fake clocks: fast (0.5s review + 5s Permit + 4s Intent + 2s submission) finishes at 11.5s; baseline (0.5 + 12.221 + 8 + 3) finishes at 23.721s with 6.279s left. Four seconds of additional initial reading, 16-second Permit handoff, 11-second Intent, slow preflight, delayed callbacks, proof changes and expired final submission all fail closed. A 30-second Quote leaves **only 1.779 seconds** for initial elapsed time before the conservative Permit admission threshold; actual RPC time may exhaust it. These are admission simulations, not a mobile latency guarantee.

**Reliable real-mobile completion is NOT proven.** No documented Quote TTL extension or signed-package rebind endpoint was found. Ask Sera whether a server-supported longer reserved Quote is available for sequential wallet approvals; use it only after an official contract is verified. Documented equity/vault-only funding is another protocol path with different custody/balance semantics, not an implemented substitute here. Standing approval, direct executor calls, automatic signing or silent requoting are not workarounds.

## Verification and Phase 7O gate

Targeted tests **130/130**, full suite **870/870**, typecheck and build pass. Gitleaks covers public files and all four Git commits; configured-secret/publication and exact financial-evidence scans report zero leaks. The live DB has integrity ok, zero FK errors and all 13 financial/wallet/history tables identical to the pre-task backup; schema remains through 14. No secret environment or runtime origin change. Tests use fixtures, fake clocks and disposable SQLite. The public protocol check is read-only. Dependencies are unchanged. Audit still reports 3 moderate package findings: `@stablelib/ed25519` <=2.0.2 ([GHSA-x3ff-w252-2g7j](https://github.com/advisories/GHSA-x3ff-w252-2g7j)), inherited by `@okxconnect/core` and `@okxconnect/universal-provider`; no available fix reported, zero low/high/critical. This is not a security audit certification.

For separately authorized Phase 7O only:

- Review this implementation and known dependency/timing limits; authorize a narrowly scoped acceptance configuration. Do not remove `dev:live`'s existing safety enforcement or introduce a broad override.
- Apply reviewed migrations only after backup/copy verification. Independently reconcile and separately authorize the historical valid-Permit retirement with fresh finalized evidence. Preserve the signed row/ciphertext.
- Renew ownership and create a completely new exact-50 package. Verify current deployment, nonce, domains, economics, original Quote validity and admission budget. Never reuse the historical signature.
- The owner alone chooses each of Permit, Intent and one final submission. Any uncertainty/expiry stops progression; no automatic retry or new package.
- Verify actual finalized receipt, exact transfers and reconciled balances before marking first swap acceptance. Record real timing separately from fixtures. If the safe window cannot fit, stop and pursue the official protocol question above.

No remaining implementation safety blocker was found in offline checks. Outstanding live prerequisites are the intentionally retained historical lock, disabled execution configuration, fresh ownership/Quote and unmeasured two-signature mobile timing. **Next owner action: review this Phase 7N readiness report and decide whether to separately authorize Phase 7O preparation.** This task does not begin it.


## Changed files (43)

- Documentation (4): `PHASE7N.md`, `STATUS.md`, `ACCEPTANCE.md`, `README.md`.
- Operator (1): `scripts/reconcile-signed-permit.ts`.
- Database (6): `src/database/authorizations.ts`, `financial-locks.ts`, `permits.ts`, `store.ts`, `valid-permit-migration.ts`, `wallet.ts`.
- Protocol/trade/runtime (11): `src/permits/retirement-chain.ts`, `retirement.ts`, `valid-retirement.ts`; `src/trades/intent-protocol.ts`, `service.ts`, `settlement.ts`, `timing.ts`; `src/wallet/chain.ts`, `preflight.ts`, `server.ts`; `src/index.ts`.
- Mini App (6): `web/app.ts`, `okx-typed-data.ts`, `permit-flow.ts`, `quote-continuation.ts`, `trade-authorization.ts`, `trade-panel.ts`.
- New regression tests (8): `tests/phase7n-intent.test.ts`, `phase7n-lifecycle.test.ts`, `phase7n-migration.test.ts`, `phase7n-navigation.test.ts`, `phase7n-retirement.test.ts`, `phase7n-settlement.test.ts`, `phase7n-timing.test.ts`, `phase7n-transport.test.ts`.
- Existing tests/fixtures (7): `tests/acceptance.test.ts`, `analytics-wallet.test.ts`, `branding.test.ts`, `permit-only.test.ts`, `quote-continuation.test.ts`, `trade-helpers.ts`, `trade-service.test.ts`. Existing assertions were adapted to the durable authorization API and exact-50 policy without deleting or skipping tests.
