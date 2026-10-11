# Permit expiry and OKX handoff repair

Historical phase record. See [Phase 7M](PHASE7M.md) for the later verified Permit milestone and current execution blockers. Actions described below belong to that earlier phase; they are not current authorization to retry or sign.

This repairs the existing Permit-only flow. It adds no alternative acceptance path, signing method, spender, amount policy or execution capability.

## Reconciled evidence — 2026-09-20 KST

Times below are UTC on 2026-09-19. The full owner-scoped identifiers, payloads and sanitized evidence remain private.

| Evidence | Earlier review | Later persisted attempt |
| --- | --- | --- |
| Permit deadline | 18:33:44, owner screenshot | 18:35:41, exact persisted match |
| Request / quote | UNKNOWN; previous unrequested review was overwritten | Exact private request/version/quote correlation verified; identifiers withheld |
| Preparation | UNKNOWN | 18:30:43.879 |
| Quote expiry | UNKNOWN | 18:31:12.000 |
| Server reservation | UNKNOWN | 18:30:51.174 |
| Client dispatch observation | UNKNOWN | 18:30:51.335 |
| Handoff observation | UNKNOWN | 18:30:51.336 |
| Callback observation | UNKNOWN | 18:30:58.196 |
| Failure | Separate uncorrelated QUOTE_STALE log at 18:29:12.130 | INVALID_PERMIT at 18:30:58.238 |
| Stored signature | No matching retained package to examine | None; no server SIGNATURE_RECEIVED event |

The later callback arrived about fourteen seconds **before** quote expiry, and minutes before the Permit deadline. The existing source only records that callback event after the provider promise resolves. It then performs local Permit/signature validation before posting a signature to the server. Therefore the first proven failure boundary is local response validation, before result persistence. The result's shape, bytes, recovery result and exact failing check were not retained: **signature returned = UNKNOWN**. A successful callback is not proof that signature bytes were returned, and an absent encrypted signature is not proof that no signature existed.

Neither screenshot records consent/click history. An unchecked checkbox in a later screenshot cannot establish the checkbox state at the reported tap: the old expiry clock also cleared consent. SDK invocation is implied by the inspected response path, but there is no independent SDK invocation, remote wallet transport or actual app-open timestamp. The handoff observation records the opener being called, not the phone successfully switching apps. The request passed server preflight because it was durably reserved. No old signature is recoverable from the database; none has been attached to another quote.

The 18:29:12 QUOTE_STALE log has no request/version identifier. It cannot authoritatively be assigned to the earlier screenshot. The later screen can show QUOTE_STALE once its 18:31:12 quote expires; that is a display-time condition, not the cause of its earlier INVALID_PERMIT. These observations are not merged.

## Proven flow problems and repairs

- The old layout placed the action after all technical disclosures, consuming much of a short quote lifetime. The same panel now keeps amount, Sepolia, wallet/recipient, minimum receive, quoted costs, Permit limit/spender, expiry, consent and action together. Full disclosures remain expandable.
- Quote expiry now has a nearby explanation and explicit fresh-quote action. Refresh keeps the existing fifty-USDC continuation within its original lifetime, fetches a new package, and clears consent. Ownership renewal retains the selected request. No Sera expiry or Permit deadline is extended or substituted.
- The browser previously kept its tap lock even when server preflight definitively rejected a quote before reservation. It now releases only that local lock after authoritative status confirms the same request/version is still unreserved. Lost acknowledgements, reserved requests and unknown results remain locked. No refresh triggers signing.
- The existing code already called the app opener before awaiting the signing result. There was no proven await-before-open deadlock. A visible **OKX 열기** button now opens the same pending request/session without another SDK request; progress and errors appear beside it. No unproven SDK transport workaround was added.
- OKX still receives `eth_signTypedData_v4`, `[address, typedDataObject]`, and explicit `eip155:11155111`. The SDK-boundary object correction remains unchanged. See the [official OKX EVM SDK request documentation](https://web3.okx.com/id/onchainos/dev-docs/wallet/dapp-connect/app-connect-evm-sdk).
- Results are now captured as encrypted, owner/request/version-bound evidence before cryptographic inspection. Validity against the original Permit, quote expiry, Permit deadline expiry, and read-only domain/nonce status are recorded separately. A valid late signature is kept even if its quote or Permit deadline expired. An RPC outage does not discard it. The verifier still requires the exact token, owner, spender, amount, schema, digest and canonical signature; expiry still blocks new dispatch.
- While the original connector session remains active, a response arriving after its local timeout is delivered once for secure result capture, not discarded or retried. Session loss or unavailable authentication can still prevent capture; these cases stay unknown and locked. No browser storage contains signature bytes.

## Evidence and lock preservation

Migration 12 makes a consistent backup, preserves existing Permit rows/events exactly, archives each current review, and adds per-version review history plus encrypted result evidence for future attempts. It does not fabricate older reviews or callback contents. New server preflight events and client SDK/opener observations are timestamped and version-bound; client observations do not claim independently verified remote delivery.

The historical later row remains `PERMIT_INVALID / INVALID_PERMIT` in the database to preserve its original evidence. Because no retained result supports a cryptographic classification, its current presentation is `RESULT_UNKNOWN / PERMIT_RESULT_UNKNOWN`. Its financial lock remains intact. This task does **not** declare that old response unsigned, close it as no-signature, or enable another real attempt for that wallet. No inference is made from nonce, allowance or a missing transaction hash. Resolving that historical result or separately deciding an expired-authorization reconciliation policy remains outstanding; the owner should not retry the unresolved request.

## Validation and safety

687/687 tests pass, including expiry before/during preflight, consent reset, exact amount retention, unknown acknowledgements, duplicate prevention, installed OKX object serialization, pending-request reopening, delayed and timeout-late callbacks, wrong signatures, encrypted original-result retention, RPC uncertainty, immutable review history and backup migration. Typecheck and build pass. A 390×844 browser fixture verified the compact Korean review, visible expiry, explicit refresh and one mock request with two app-open actions. No live financial signature was requested during tests.

Mainnet and swap execution remain OFF. Intent and relayer access remain disabled. No native transaction, claim, Permit retry or swap is submitted. The working tunnel and environment configuration are preserved. No separate research project is modified. Once a request is legitimately eligible, the intended interaction is refresh → review current terms → select consent → one explicit Permit request → open the same pending OKX request if needed. No screenshot/chat round trip is required within the quote window.
