# Phase 7M — real mobile Permit acceptance verified

Verified on 2026-10-11. **The first real OKX ERC-2612 Permit is cryptographically valid and encrypted at rest. Intent signing, relayer submission and swap settlement are not accepted or enabled.** This task performs reconciliation and prepares the next stage; it makes no new quote or financial request. Mainnet and swap execution stay OFF.

## Original evidence

The successful request is separate from both retired historical requests. Its state remains `PERMIT_SIGNED`; its financial lock is unchanged. No retirement, replay, replacement or database migration was performed.

| Field | Verified value |
|---|---|
| Request / Quote / package version | Correlated against the immutable private record; identifiers withheld |
| Signer / owner / recipient | Recovered signer matches the acceptance owner; recipient is the same wallet |
| Token | `0x965d4b4546716e416e950bc30467d128455d2d0e` (test USDC, 6 decimals) |
| Spender | `0x83c1368110B640A729f3810De5FBe94b99aa5668` |
| Value | Exactly `50000000` raw / 50 test USDC |
| Nonce | `0` |
| Domain | `CIRCLE`, version `1`, chain `11155111`, verifying contract = USDC above |
| Permit digest | Original, canonical, wire and independent ABI-encoded hashes match; full values retained privately |
| Quote expiry | `2026-10-11T04:17:14Z` — expired |
| Permit / unsigned Intent deadline | `2026-10-11T04:21:43Z` (`1791692503`) — expired |
| Historical economics | 63.241426 XSGD before cost; 1.285171 XSGD deducted; minimum 61.956255 XSGD; 1.00 USDC/USD-equivalent cost; 2% of input |

Independent checks recovered the expected owner from the original typed data, enforced canonical 65-byte/low-S ECDSA, checked every Permit field, and compared the stored digest with the backend hash and explicit wire-domain hash. A separate ABI-encoded Permit struct hash plus the live token `DOMAIN_SEPARATOR` produced the same digest through two independent Sepolia RPCs. No signature was sent to a verification API or RPC.

Both AES-256-GCM ciphertexts (captured callback and verified Permit) decrypt and verify locally to the same signature. Wrong record/owner/version associated data fails authentication. Neither decrypted bytes nor the encryption key appear in this report. The original snapshot version, Intent struct hash, and on-chain `getIntentDigest` all match. The snapshot's `intentHash` is a **struct hash**, not the full EIP-712 signing digest; these identifiers must remain distinct.

| Event, UTC | Timestamp |
|---|---|
| Review prepared | 04:16:44.701 |
| Consent / click recorded | 04:16:48.809 |
| Server preflight passed | 04:16:51.484 |
| Request reserved | 04:16:51.485 |
| SDK invoked | 04:16:51.801 |
| SDK returned | 04:16:56.911 |
| Callback captured | 04:16:56.917 |
| Verified Permit persisted | 04:16:56.922 |

The callback was valid **before** quote expiry. Expiry now affects usability, not historical cryptographic validity. Quote expiry alone would not have revoked the authorization during the remaining Permit lifetime. The Permit deadline has now passed, but the successful signature and audit history remain retained, permanently bound to this original package.

## Read-only chain and execution reconciliation

At 04:28:31 UTC, PublicNode and dRPC agreed on latest block **11889319** and its canonical hash. Both returned USDC nonce **0**, owner→SOR allowance **0**, and matching latest/pending owner transaction counts. Test USDC and XSGD balances remained unchanged. Owner account details and full observations remain private.

Both providers completed the bounded scan from block **11889232** (04:11:00 UTC, before this request) through **11889319** (04:28:24 UTC): zero USDC Approval events for this owner at any spender, zero outgoing USDC, zero incoming XSGD, and zero SOR `IntentMatched` events for this owner. This supports **no on-chain approval or settlement for this attempt within the inspected interval**. It is not a universal history claim or proof that an off-chain signature was absent; this task positively verified an off-chain signature.

The finalized head at that observation was still **11889232**, before the Permit deadline. No finalized post-deadline retirement is claimed. A future signed-Permit retirement would require fresh finalized evidence, retained ciphertext and a separately reviewed policy. No such path currently exists; the lock remains.

The database contains **zero trade sessions and zero submission attempts**, one preserved successful funding claim, and the successful Permit row with no Intent operation. The live Permit-only service has no Intent signer or relayer dependency. These checks establish no application Intent request/submission, relayer submission or swap. They do not claim access to an external relayer's private logs.

Private backup, sanitized correlation evidence and validation logs are under ignored `.dev-live/phase7m/`. Database financial rows, encrypted results, events, retirement ledger, wallet history, continuations and claim history are compared against the consistent pre-task SQLite backup. Nothing in that private directory is a publication artifact.

## Current official protocol contract

The live [testnet configuration](https://api.testnet.sera.cx/api/v1/config) still matches the original deployment: Sepolia, Sera `0x83475A1bD98a8DC2DCd507A747e4DC85da241D6e`, SOR/spender above, Vault `0x3c7945840bAE0d7e7f3824Ebccef1962629250F0`. Test XSGD is `0x058e06ca2628165a6cd1e80e4dc82203dc0020aa`. Documentation sample token domains are illustrative; the deployed USDC domain verified here is CIRCLE/1.

The existing preflight also uses [system endpoints](https://docs.testnet.sera.cx/api-reference/endpoints/system/) for token metadata/minimums, server time, executor identity and signing readiness. Preserve application ownership/session checks, clock-skew validation, deployed-contract/domain checks, EOA/balance checks and fresh on-chain Permit nonce verification before financial authorization.

The [swap API](https://docs.testnet.sera.cx/api-reference/endpoints/swaps/) requires a fresh `POST /swap/quote` with token addresses, raw input, owner, recipient, `expiration`, and gas mode. Quotes are public API responses; application ownership authentication is a separate gate. `uuid` identifies the cached quote; `route_params.uuid` belongs to the signed Intent. The cache lasts roughly 30 seconds. Wallet-funded swaps require a fresh per-quote ERC-2612 Permit even with standing allowance; equity-only quotes can have no Permit. Submit `POST /swap` once with `uuid`, `signature` (Intent), `permit_signature`, and its exact signed `permit_deadline`. A pending response returns `trade_id`, not settlement proof. Stale/consumed quotes or uncertain responses must never trigger automatic replay in this product.

The [authentication contract](https://docs.testnet.sera.cx/api-reference/authentication/) supplies the Sera/1 EIP-712 domain via live configuration and uses server time for expiration checks. Request `expiration` controls the Intent deadline; it is not permission to extend `expires_at`. The application currently chooses five minutes and must not increase that to conceal a short quote window.

The exact existing Intent schema is in `src/trades/contract.ts`: `taker`, `inputToken`, `outputToken`, `maxInputAmount`, `minOutputAmount`, `recipient`, `initialDepositAmount`, `uuid`, `deadline` (uint48). Preserve all returned values and bind both authorization results to the same immutable package. Verify Permit against the token domain; verify Intent against the Sera domain. The current chain read checks the latter with `getIntentDigest`.

The [SOR contract](https://docs.testnet.sera.cx/contracts/sor/) enforces replay/deadline and input/output/recipient bounds. Its [official source](https://github.com/sera-cx/orderbook-contract-v2/blob/audit/src/SeraSOR.sol) restricts route execution to the executor role, applies the optional Permit to the wallet deposit and emits an Intent struct hash. Direct user submission is therefore not an API-expiry workaround. Source review is supporting architectural evidence, not a claim of byte-for-byte verification of the deployed SOR.

The [order status API](https://docs.testnet.sera.cx/api-reference/endpoints/orders/#get-order) can inspect the returned trade ID but requires an API key. No key-management signature was requested. The existing application instead uses read-only finalized chain reconciliation: successful canonical receipt, exact SOR/taker/Intent struct hash, positive USDC debit within the signed maximum, and XSGD received by the signed recipient at or above the signed minimum. Final balances and nonce/allowance should also be recorded for owner acceptance. HTTP acceptance alone cannot mark a trade settled.

## Timing feasibility and protocol-supported design

Measured for **this one successful Permit**, not a latency guarantee:

| Interval | Time |
|---|---|
| Quote lifetime left when review was saved | 29.299 s |
| Reading until consent/click | 4.108 s |
| Server preflight | 2.674 s |
| SDK invocation to callback | 5.110 s |
| Review saved to verified Permit saved | 12.221 s |
| Remaining before official quote expiry | 17.078 s |
| Remaining before existing five-second submission margin | **12.078 s** |

A second wallet visit, independent Intent review/consent, callback verification, explicit submission and final network checks would all need to fit inside that remaining budget. There is no measured Intent or end-to-end latency distribution. The protocol path may fit a fast session, but **reliable mobile completion is not established and the current implementation is not ready**. A screenshot/chat round trip cannot be part of the live 30-second sequence.

Prepare ownership, wallet connection, education and non-quote checks before requesting the new quote. On the existing concise review, retain separate explicit actions for Permit, Intent and submission, with current terms/countdown visible together. Recheck dynamic nonce, domain, owner, amount, cost and freshness; do not remove checks for speed. Test safe parallelization of independent reads and measure the remaining-time budget under realistic delays before activation. Reserve enough time for the remaining user actions plus the existing safety margin; fail closed when it cannot fit.

This uses the documented per-quote two-signature protocol without changing authorization semantics. No published quote-refresh/TTL-extension/reservation API was found in the reviewed official contract. A longer server-held quote must be confirmed and provided by Sera before relying on it. Preapproval does not remove this API's per-quote Permit requirement. Equity/vault funding is a different design and is not introduced here. Never rebind a signed Permit/Intent to a new quote, silently requote after consent, batch both signatures, or use personal_sign for financial authorization.

## Concrete blockers before owner-controlled execution

| Existing boundary | Required next-stage work; none enabled here |
|---|---|
| Signed Permit lock | Add a reviewed, append-only **expired valid signature** retirement policy only after fresh finalized authority/history checks. Preserve `PERMIT_SIGNED`, original digest, ciphertext and chronology. Existing UNKNOWN/invalid retirement operators cannot retire it. No automatic retirement. |
| Intent wire domain | `web/okx-typed-data.ts` inserts the explicit canonical domain only for Permit. Offline strict-wallet characterization of the current Intent produces a different digest when the missing schema defaults to empty. Extend and test the same exact-domain wire validation for Intent before a live request. This is a predicted compatibility defect, not a live Intent failure. |
| Generic signing lifecycle | `web/app.ts` keeps full-trade signatures only in memory, cancels/clears on error or expired return, and lacks the Permit flow's immediate handoff/reopen/persistent result handling. Carry those protections into the existing trade state machine. Preserve late/unknown results and never retry a financial request automatically. |
| Cross-flow authorization | Full `TradeService.prepare` does not consult the Permit acceptance lock or enforce its exact-50/cost gate. Configuration currently excludes simultaneous Permit-only/execution. A future stage needs one coordinated lock, exact owner/amount/cost policy and a single allowed submission, not a parallel acceptance path or a broad flag flip. |
| Submission / settlement | Existing persisted attempt-before-POST and finalized receipt monitor are useful foundations. Add durable signature stages, same-version checks and failure/timeout/restart reconciliation. Bind a narrow single-use acceptance authorization to one package. Keep uncertain POST results locked and read-only; no retry or substitution. |
| Timing / deployment | Measure both wallet stages and network checks with fixtures before live acceptance. `dev:live` forces execution OFF; preserve it now. Activation needs a separately reviewed narrow configuration, not removal of the launcher safety rule. |

The next stage is **implementation and offline acceptance of these blockers**, with all live financial controls still OFF. Extend existing modules; do not build another acceptance application. Required fixtures: exact Intent domain/schema/digest through installed OKX serialization; separate explicit taps; no Intent before verified Permit; delayed responses after either expiry; ownership/account/session changes; durable result encryption and restart; signed-expired lock preservation; refreshed package requiring new consent; duplicate submission CAS; timeout/409/410 uncertainty; canonical finalized settlement and reorg. A later live session requires separate owner authorization and a completely new package.

## Validation

- Relevant Permit/OKX/contract/trade/settlement/server tests: **217/217 PASS**.
- Full existing suite: **772/772 PASS**, zero skipped; no financial behavior or test assertions changed.
- Typecheck and build: PASS.
- Dependency audit: 3 moderate entries (`@okxconnect/core`, `@okxconnect/universal-provider`, `@stablelib/ed25519`), zero high/critical; audit reports no available fix. Dependencies were not changed.
- Gitleaks: zero leaks in public candidate files and all 3 Git commits. The configured-secret publication check also covers the working tree, index and history.
- Database: integrity `ok`, zero foreign-key errors; all 13 inspected financial/wallet/history tables match the pre-task backup. The signed row, both ciphertexts and its lock are unchanged. `.env` is unchanged; runtime mainnet and execution remain OFF.
- Exact-signature plaintext scan: zero matches in public candidate files, managed runtime logs and logical SQLite values. No signature bytes were printed. Only this report, README, STATUS and ACCEPTANCE documentation changed publicly in Phase 7M; source/tests/dependencies remain unchanged. No commit or push.

Next development stage: review and implement the existing full-trade path's documented blockers with all live financial controls OFF. It requires separate authorization; the publication task does not start that work or request another Quote/signature.
