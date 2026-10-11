# Phase 7K — retirement of an expired, historically unknown Permit

Historical phase record. See [Phase 7M](PHASE7M.md) for the later verified Permit milestone and current execution blockers. Actions described below belong to that earlier phase; they are not current authorization to retry or sign.

The September 19 callback result remains **UNKNOWN**. Retirement never means that no signature was returned. The original request, payload, digest, callback events, review, state and error are preserved. An append-only `permit_retirements` record releases only the specified request's blocking effect after an explicit operator reconciliation.

## Deployment and expiry proof

Sepolia chain ID is `11155111`. The token is `0x965d4b4546716e416e950bc30467d128455d2d0e`; the current Sera SOR spender is `0x83c1368110B640A729f3810De5FBe94b99aa5668`. The current [Sera testnet configuration](https://api.testnet.sera.cx/api/v1/config) and [system API documentation](https://docs.testnet.sera.cx/api-reference/endpoints/system/) identify this integration.

The [token explorer](https://sepolia.etherscan.io/address/0x965d4b4546716e416e950bc30467d128455d2d0e#code) did **not** supply verified source, and Sourcify full/partial metadata was unavailable. This work does not claim source verification or a full token audit. The public repository's example token is not assumed to be this deployment.

Instead, two independent RPC providers returned the exact deployed runtime with Keccak hash:

`0xfe64f142bffc2ab52331e35fe9af24a4c8e4d65f49e5cb6e6a9623cf63392b97`

`src/permits/expiry-proof.ts` follows the pinned runtime's complete expired Permit path from selector dispatch through ABI decoding. Selector `0xd505accf` dispatches via `0x0402`, decoder `0x17e9`, and function entry `0x0b00`. The fourth stack item from the top is the decoded deadline. `TIMESTAMP > deadline` takes the revert path; `0x0b24` is the continuation for an unexpired deadline. The expired path reaches `ERC2612ExpiredSignature(uint256)` (`0x62791302`) before signature recovery, external calls or storage writes. The signature words remain symbolic: no signature bytes are manufactured and no Permit simulation or transaction is sent. Any different runtime hash, unsupported instruction, unexpected argument mapping or unexpected revert fails closed. The executable runtime also contains no `DELEGATECALL`, `CALLCODE` or `SELFDESTRUCT`.

This directly verifies the relevant [ERC-2612 expiry rule](https://eips.ethereum.org/EIPS/eip-2612). A deadline prohibits creating a new authorization with that expired Permit; it does **not** revoke an allowance established earlier.

## Authority and historical evidence

The collector uses explicit independent PublicNode and dRPC Sepolia HTTPS endpoints. It verifies chain ID, common canonical finalized/latest anchors, exact runtime, token domain, decimals, allowance and nonce through both providers. It rejects disagreement, unavailable reads, stale evidence, nonzero allowance, nonce regression, and a pending owner transaction count differing from latest. Local time only bounds evidence freshness; expiry itself requires the finalized block timestamp to exceed both historical deadlines.

On October 11, the bounded historical investigation covered blocks `11739202` (September 19 at approximately 18:00 UTC) through `11888688`, plus a tail through `11888783`. PublicNode returned no matching owner/spender Approval events. dRPC agreed on tail events and supplied the earlier nonce/allowance/code state, but refused older event queries. PublicNode's earlier storage reads were unavailable. These limitations remain explicit. Neither the logs, nonce nor allowance prove whether an off-chain signature existed. Pending reads are not a global or private mempool inventory.

The operator command recollects current authority immediately before applying a decision. It also checks all matching persisted Permit, trade, submission-attempt, quarantine and funding rows within the atomic write transaction. It does not use the UI's limited recent-trade list. A record with retained callback evidence requires separate reconciliation and cannot use this historical-loss path.

## Atomic lock retirement

Migration 13 first creates a consistent SQLite backup. The original Permit table remains unchanged. An immutable ledger records classification `EXPIRED_RESULT_UNKNOWN_NO_ACTIVE_AUTHORITY`, request/version/digest, original-row SHA256, chain observations, expiry proof identifier, bounded history, source fingerprint and retirement time. Exactly one `RETIRED_EXPIRED_UNKNOWN` event is appended. Database triggers preserve retired evidence and prevent concurrent active requests for the same wallet. The transition is atomic and idempotent; conflicting repeat evidence is rejected.

The UI still reports `RESULT_UNKNOWN` and signature classification D, with a separate retirement explanation. It never calls this a rejection or a no-signature result. All operations against the old request remain blocked permanently.

After retirement a new request requires ownership verified after retirement, a changed session/epoch, a new continuation created after retirement, and all existing fresh quote, nonce, deadline, exact 50-USDC, spender and cost gates. The existing browser flow accepts a different request ID/version only after authoritative retry eligibility. No quote, wallet request, Intent, relayer call or transaction is created by retirement.

## Operator command

From the project root, the command defaults to read-only validation:

```text
node --use-system-ca --import tsx scripts/reconcile-permit-expiry.ts --request <request-id> --evidence .dev-live/phase7k/retirement-evidence.json
```

`--history <private-history-summary.json>` attaches the bounded investigation. The explicit `--apply` flag appends the retirement only when all current gates pass. Evidence must stay in ignored `.dev-live`; no browser/API retirement endpoint exists. Mainnet and swap execution must be disabled. Do not use this command to process a retained signature or bypass an unresolved submission.

The successful funding claim and unrelated wallet/trade history remain untouched. No allowance is revoked, no balance changes, and no new financial signature is requested.

## Applied reconciliation — October 11, 2026

The explicit operator transition committed at `2026-10-11T02:47:54.791Z`. PublicNode and dRPC agreed on finalized block `11888720` (`0x4075eee1737bcc1188e5daa6415005e4bea60989808c5d2f26f3353fcb0c9660`, `2026-10-11T02:28:36Z`) and latest block `11888816` (`0x208db4a948b38b3dad8ad3e6972c2feb8cb3932cc037acf33b06c1b836a5b043`, `2026-10-11T02:47:48Z`). Both reported nonce `0` and allowance `0` raw / `0` test USDC. Owner transaction counts were `1` for both latest and pending. The exact deployed code/domain matched at both anchors; both block times exceeded the historical deadline. No relevant unresolved submission was found in the exhaustive persisted-state checks.

The classification is `EXPIRED_RESULT_UNKNOWN_NO_ACTIVE_AUTHORITY`. Historical signature result is still **UNKNOWN**, not `NO_SIGNATURE_RETURNED`. Its original database row, review and callback evidence remain unchanged. The private immutable ledger retains the exact request/version/digest, observed blocks and states, source fingerprint and original-row hash; public documentation does not expose wallet credentials or signatures.

Post-transition comparison with the consistent pre-change SQLite backup verified that all original Permit rows/reviews/results/events, wallet links/sessions, continuations, funding claims/events, trade sessions and attempts were preserved. Exactly one retirement event was appended. Integrity is `ok`, foreign-key errors are zero, and `.env` is unchanged. The same HTTPS tunnel and launcher remain running; the managed backend reload and fresh live preflight succeeded.

Validation: 744/744 tests passed, including 57 dedicated retirement regressions; typecheck/build passed; Gitleaks found no leaks in publication candidates or Git history. The dependency audit reports 3 moderate package entries, 0 high/critical and no available fixes. No new live quote, Permit, Intent, relayer request, transaction or revocation was issued. Mainnet and swap execution remain OFF. A new owner-initiated `/quote 50 USDC XSGD` must pass renewed ownership and all fresh financial checks; retirement never reuses or restores the historical payload.
