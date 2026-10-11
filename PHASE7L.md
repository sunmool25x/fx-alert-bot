# Phase 7L — explicit Permit domain schema and October 11 reconciliation

Historical phase record. See [Phase 7M](PHASE7M.md) for the later verified Permit milestone and current execution blockers. Actions described below belong to that earlier phase; they are not current authorization to retry or sign.

## Proven failure

This is a different attempt from the retired September 19 UNKNOWN result. Private evidence correlates its request, continuation, quote, immutable review version and owner/session/epoch. Those internal identifiers, original payloads and signature bytes are not published.

The encrypted callback is a 65-byte, low-S signature with a valid recovery byte. It is **invalid for the original USDC Permit**. `src/permits/protocol.ts::verifyPermitSignature` fails the recovered-signer equality assertion: the recovered signer differs from the acceptance owner. Format, scalar bounds, exact amount, spender, nonce and prepared digest pass.

The wire object contained `types.Permit` but omitted `types.EIP712Domain`. The installed OKX Connect 1.9.1 adapter serializes that object unchanged. The same retained signature recovers to the owner only with an empty domain type; its digest differs from the intended canonical domain. This is cryptographic evidence of the domain-encoding mismatch; it is not evidence of a different owner account or an acceptable Permit. Full digest comparisons remain private. No signature is changed, retried, attached to another quote, or submitted.

[EIP-712's JSON-RPC schema](https://eips.ethereum.org/EIPS/eip-712#specification-of-the-eth_signtypeddata-json-rpc) requires the domain type declaration. [OKX's official EVM SDK example](https://web3.okx.com/zh-hans/onchainos/dev-docs/wallet/dapp-connect/app-connect-evm-sdk) supplies it with an object parameter and an explicit chain argument. A hashing library's implicit domain inference is not sufficient for the wallet's JSON-RPC payload.

## Correlated timeline, UTC

| Event | October 11 time |
|---|---|
| Review prepared | 02:57:36.573 |
| Consent/click; preflight started | 02:57:45.658 |
| Preflight passed; server reservation | 02:57:48.230 |
| App handoff observation | 02:57:48.567 |
| Provider dispatch observation | 02:57:48.569 |
| SDK invocation observation | 02:57:48.580 |
| SDK returned | 02:57:53.454 |
| Callback observed | 02:57:53.456 |
| Encrypted response captured | 02:57:53.459 |
| Signature rejected | 02:57:53.464 |
| Sera quote expiry | 02:58:06.000 |
| Permit deadline | 03:02:35.000 |

Preflight took 2.572 seconds. It completed with 17.770 seconds of quote life; rejection occurred with 12.536 seconds left. The persisted quote/Permit expiry flags were both false at receipt. The later screenshot countdown is not the rejection timestamp. Server/Sera clock validation passed; no persisted client clock reading establishes the screenshot's timing. Quote expiry did not cause this failure and no TTL/deadline is extended.

## On-chain verification

Independent PublicNode and dRPC reads identify Sepolia `11155111`, the expected USDC runtime hash `0xfe64f142bffc2ab52331e35fe9af24a4c8e4d65f49e5cb6e6a9623cf63392b97`, and `eip712Domain()` values `CIRCLE`, version `1`, chain `11155111`, token `0x965d4b4546716e416e950bc30467d128455d2d0e`. The reported domain separator is `0x68bbf65f8ae7607bb49c0e1c9612cce4c4bc4333bacc8aed7d1635a54157c745`. Manual ABI encoding of the Permit struct, combined with that on-chain separator, reproduces the original digest independently of the wallet adapter. Nonce and spender allowance were both zero at the initial read. Zero nonce/allowance does not imply that no signature was returned.

The actual deployed runtime's expiry proof is described in [Phase 7K](PHASE7K.md). A current latest-block time alone does not satisfy the retirement policy: a finalized block must also exceed this new request's deadline. An early read failed that gate and left the lock untouched.

## Minimal transport correction and durable status

`permitRpcData` clones the original Permit and explicitly declares the canonical four-field domain schema. It rejects conflicting supplied domain types and verifies that the resulting wire digest is exactly the original intended digest. Amount, spender, token, owner, nonce, deadlines and message schema are unchanged. The request remains `eth_signTypedData_v4`, `[address, typedDataObject]`, `eip155:11155111`. There is no fallback signing method and no Intent change.

Tests now sign the actual serialized SDK output using a strict JSON-RPC wallet fixture. The previous mock signed the canonical backend object instead, masking the omission. Production validation still rejects the malformed-domain signature; the fix does not weaken recovery checks.

New records retain safe validation reasons such as `SIGNER_MISMATCH`, `DIGEST_MISMATCH`, `NON_CANONICAL_SIGNATURE`, and explicit pre-dispatch boundary/reason events. Raw provider errors and signatures are not logged. The UI distinguishes server reservation from SDK dispatch and shows the authoritative invalid-signature result after a rejected capture, without a second failure POST or signature request. Existing quote/ownership checks, five-second dispatch margin, compact review, explicit refresh and renewed consent remain intact. Client observations alone never clear a lock.

## Guarded retained-signature retirement

The historical-loss path still refuses retained callback evidence. A separate, narrow operator reconciliation can classify this proven, expired malformed-domain response as `EXPIRED_INVALID_SIGNATURE_NO_ACTIVE_AUTHORITY`. It decrypts the original response locally, verifies canonical rejection and the exact empty-domain mismatch, and binds the ciphertext record hash. All Phase 7K finalized/latest chain, code, domain, zero-allowance, identity, freshness and unresolved-submission checks remain required. A valid original signature, absent response, different mismatch or uncertain result fails closed.

Migration 14 backs up SQLite and preserves the existing retirement ledger while adding this precise classification. The transition atomically appends one ledger record and event. Original Permit/result/review rows, ciphertext and historical events remain unchanged; September's UNKNOWN retirement is not reclassified. Repeated identical reconciliation is idempotent. All old payload operations remain blocked. Fresh post-retirement ownership, a new continuation/quote and explicit consent are still necessary for a new attempt. No browser retirement endpoint or automatic retry exists.

The operator command remains read-only by default. `--invalid-domain` selects this retained-evidence path; `--apply` is separately required to write after all gates pass. Private evidence belongs under ignored `.dev-live`. No Permit, Intent, relayer, transaction or revocation is issued by this command.

## Validation

The guarded transition committed at `2026-10-11T03:20:57.609Z`, after both providers agreed on finalized block `11888912`, timestamp `2026-10-11T03:07:00Z` (after the `03:02:35Z` Permit deadline), and latest block `11888981`, timestamp `03:20:48Z`. Finalized/latest nonce and allowance were zero; code and domain matched, owner latest/pending transaction counts were both `1`, and no relevant unresolved persisted submission existed. Earlier attempts to evaluate retirement were read-only and blocked while finalized time still preceded the deadline.

Only this October request's blocking effect was retired as `EXPIRED_INVALID_SIGNATURE_NO_ACTIVE_AUTHORITY`. Its original `PERMIT_INVALID` row and encrypted invalid response remain unchanged, with one appended `RETIRED_EXPIRED_INVALID` event. September's UNKNOWN retirement and all earlier events are unchanged. The bounded Approval scan found no events through block `11888957` on PublicNode; dRPC historical logs were unavailable. Current authority was independently rechecked through both providers at the decision anchors; absence of historical logs is not treated as signature evidence.

Comparison with the pre-change backup confirms all original Permit/results/reviews/events, wallet records, continuations, successful funding history and trade state are preserved. DB integrity is `ok`, foreign-key errors are zero, and `.env` is unchanged. The same managed launcher and HTTPS tunnel remain running; a fresh preflight uses schema 14 and passes. The older in-memory launcher's cached schema checker can print a stale database warning after reload; the fresh preflight and direct integrity checks are authoritative. No tunnel restart was needed.

The next action is an owner-initiated `/quote 50 USDC XSGD`, followed by the existing fresh-ownership/review requirements. Nothing is automatically signed, and the historical payload is permanently non-reusable. A corrected live signature has not yet been attempted.

772/772 tests passed; typecheck and build passed. Coverage includes strict wire-domain serialization, the reproduced empty-domain mismatch, correct/invalid recovery, encrypted capture before validation, quote expiry before/during preflight, duplicate/unknown protection, retained-result retirement failures, immutable historical evidence and fresh-owner retry gates. No live signing was used in tests. Dependency audit reports 3 moderate package entries, 0 high/critical, with no available fix. Mainnet and swap execution remain OFF.

## Files changed

- `web/okx-typed-data.ts`, `src/permits/protocol.ts`: explicit wire-domain schema, digest equality and specific signature failure reasons.
- `src/permits/service.ts`, `web/permit-flow.ts`, `web/permit-panel.ts`, `src/wallet/server.ts`: safe stage evidence and authoritative callback-error UI; no automatic retry.
- `src/permits/retirement.ts`, `src/permits/invalid-reconciliation.ts`, `src/database/permits.ts`: separate retained-invalid-response reconciliation using the existing authority gates.
- `src/database/permit-domain-migration.ts`, `src/database/store.ts`, `src/wallet/preflight.ts`: backed-up migration 14, immutable ledger compatibility and readiness validation.
- `scripts/reconcile-permit-expiry.ts`: explicit operator-only `--invalid-domain` reconciliation mode.
- `tests/permit-domain.test.ts`, `tests/okx-permit-transport.test.ts`, `tests/permit-only.test.ts`, `tests/permit-retirement.test.ts`: 28 added regressions and preserved migration/behavior assertions.
- `PHASE7L.md`, `STATUS.md`, `README.md`: evidence, limitations and current acceptance status.
