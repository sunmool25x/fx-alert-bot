# Phase 7I — one ERC-2612 Permit, stop before Intent

Historical phase record. See [Phase 7M](PHASE7M.md) for the later verified Permit milestone and current execution blockers. Actions described below belong to that earlier phase; they are not current authorization to retry or sign.

Implementation and isolated tests are complete. The owner's real financial signature is **pending**. No historical mobile quote is reused, no financial signature is claimed, and no relayer submission or swap has occurred. Mainnet and swap execution remain OFF.

## Narrow capability

`ENABLE_TESTNET_PERMIT_ONLY` defaults to false. Enabling it requires one existing allowlisted Telegram user, an explicitly configured `TESTNET_PERMIT_WALLET`, the existing Sepolia connector/RPC/origin, and a random 32-byte `PERMIT_STORAGE_KEY`. Configuration rejects simultaneous swap execution. This is a financial authorization capability even though swap execution is disabled; the Mini App labels it accordingly. The new service has no sender or relayer transport, and never returns a signable Intent.

The original ownership, connector and execution architecture is retained. The existing OKX connection carries one `eth_signTypedData_v4` request after an explicit checkbox and Permit button. Ownership expiry requires the ordinary proof flow. The existing exact-amount continuation survives ownership renewal within its original TTL. Expired continuations require a new explicit Telegram request; no default amount or fabricated user authentication is used.

## Official contract and quote checks

Read-only verification on 2026-09-19 KST matched current Sera testnet `GET /config` and on-chain deployment checks to spender `0x83c1368110B640A729f3810De5FBe94b99aa5668`. Source references: [official swap API](https://docs.dev.sera.cx/api-reference/endpoints/swaps/), [SeraSOR](https://docs.dev.sera.cx/contracts/sor/), [ERC-2612](https://eips.ethereum.org/EIPS/eip-2612).

Each explicit preparation requests a new owner-bound quote through the existing `TradeService.preview`. It requires precisely 50 USDC / 50,000,000 raw, the exact six-decimal Sepolia USDC/XSGD contracts, same-wallet recipient, current deployment, a fresh deadline, valid quote/route binding, on-chain Permit nonce/domain and Intent digest, and the unchanged economics gate. No scanner, diagnostic capture or previous review supplies the quote.

Immediately before releasing the Permit to OKX, the backend checks current configuration, contracts, nonce, domain, ownership epoch, selected request validity, economics and quote freshness again. Any unexpected spender, mismatch, stale quote or failed gate stops before wallet dispatch. The review shows costs, expiry, full expandable contracts, owner, maximum 50 USDC, nonce and typed-data digests. The future Intent is comparison-only. Its signing and submission controls are absent.

## Exactly one request and persistence

Additive migration 10 creates a separate `permit_acceptance` table after a consistent SQLite backup. A unique wallet constraint and atomic REVIEW → PERMIT_REQUESTED transition reserve the one financial request before returning its payload. Concurrent clicks, page reloads, new continuations and process restarts cannot request another Permit after reservation. A lost HTTP acknowledgement is treated as uncertain and never retried automatically. This permanent acceptance lock must not be cleared as routine recovery.

On receipt, both browser and server verify the displayed digest, exact fields, recovered owner, canonical 65-byte ECDSA signature with low S, and deadline. The server rechecks on-chain nonce/domain before storing. AES-256-GCM binds the encrypted signature to its record, Telegram user and immutable quote version. The encryption key remains in the ignored local environment; it is not a wallet key or server signer. Responses expose only status and review data, never the stored signature. Console, analytics, telemetry and public files receive no signatures. Pending financial evidence cannot be deleted through `/forget` to bypass the one-request lock.

Successful state is `PERMIT_SIGNED` in this isolated table, never `INTENT_SIGNED`, `SUBMITTED` or `SETTLED`. It is not an executable `trade_sessions` row. The normal execution gates stay OFF and the ordinary submission route rejects it.

Owner rejection records `USER_REJECTED`. Transport errors and timeouts are terminal. The OKX adapter now preserves safe numeric provider error codes for typed-data requests; arbitrary provider messages are not stored because they can contain sensitive payloads. Missing codes remain classified as an unknown transport error rather than guessed. Late responses after a timeout or account/session change do not reopen the flow.

## Quote expiry versus Permit validity

Quote expiry does not erase a successfully verified Permit. A returned signature can be stored after the quote expires if the Permit deadline, nonce and owner remain valid. Review status separately reports quote expiry, Intent deadline and Permit submission deadline. The signature is never attached to another quote automatically.

ERC-2612 authorizes the token's spender/value and does not bind an output token, recipient, quote UUID or minimum receive. Before its deadline, an unused valid signature may still be submitted on-chain despite quote expiry. Its actual usability also depends on current nonce/domain. An allowance already recorded on-chain does not disappear when the signature submission deadline passes. This phase performs no submission, nonce-changing transaction or revocation. Any later cancellation/revocation decision requires separate review.

## Validation and owner boundary

651/651 tests pass, including exact amount, unlimited/wrong amount rejection, current nonce, spender/domain/chain/owner mismatch, economics hold, expiry, recovered signer, canonical signature, duplicate requests, owner rejection, transport errors, encrypted persistence/restart, migration backup, authenticated HTTP access and blocked Intent/submission. Fixtures use isolated test keys and mock Sera/RPC responses. Typecheck and build pass.

The initial live ownership proof was valid at inspection and expired during implementation; it was not extended. The owner now starts a new `/quote 50 USDC XSGD` request, opens its Mini App continuation, completes ordinary ownership verification if requested, and taps **새 Quote · Permit 전용 검토**. For the current navigation acceptance, stop at the new Permit review without requesting a signature. No phone session is impersonated and no approval is inferred from the earlier read-only review.

After `PERMIT_SIGNED`, stop. A later owner must review the **same** Intent before any separately authorized signing step; if the quote has expired, the next phase must explain that fact and the remaining Permit validity, not silently replace the quote or reuse its signature.
Live verification: the existing HTTPS origin is unchanged, the served bundle matches the build, and health reports Permit-only ON with swap execution OFF. A fresh preflight passes Telegram, Sera, Sepolia RPC, database and origin checks. All protected funding/wallet/trading/analytics and continuation tables match their pre-task hashes. Migration 10 has a valid consistent backup; database integrity is `ok` with no foreign-key errors. The live Permit table is empty: no new financial request or signature was made.

Security verification: publication hygiene passes for 213 public files and three existing commits; Gitleaks reports no leaks. Dependency audit retains three existing moderate entries and zero high/critical entries; dependencies were not changed. Only three local environment values were added for the narrowly authorized Permit capability, owner wallet and encryption key. The encryption key and private diagnostics remain excluded from Git. The retained launcher can print a stale migration warning from its cached preflight module; the fresh process passes migration 10.

## Navigation correction — 2026-09-19

The owner reached `REVIEW_READY` through the primary wallet Quote button. That handler always called `/api/preview`, whose explicit non-signable response correctly stopped the read-only renderer. Permit-only was already enabled in the live runtime, but its separate prepare panel had no connection from the main Quote action. Insertion of claim history ahead of that panel and automatic scrolling to the read-only review made it harder to discover. The reported quote and ownership session are now expired; they are historical evidence, never a source for this fix.

The shared Quote action now chooses `/api/permit/prepare` only for the enabled, owner-selected exact 50-USDC → XSGD Sepolia context. The claim-history Quote shortcut uses the same action. Preparation always fetches a new authenticated quote through the existing validation service; no preview is promoted or reused. Other amounts and disabled Permit capability retain their read-only flow. The response is focused in one `PERMIT_REVIEW` panel above claim history, with accurate status and the visible **OKX에서 Permit 1회 서명** button. Consent and a separate button click are still required; preparing or refreshing never prompts a wallet.

Display-only ownership/session and continuation expiries now accompany the review. The browser disables consent and signing when ownership, continuation, quote safety margin or Permit deadline expires; missing metadata fails closed. A different ownership session/epoch cannot revive an old review. Wallet invalidation also discards late preparation/status responses while retaining the one-request lock. The backend's existing ownership, current nonce/domain, exact amount, pinned spender, cost and request-reservation checks remain authoritative and unchanged. No financial calculations, signing schema, encryption, execution gates or database migration were changed by this correction.

Thirteen additional regressions cover Korean/English main-Quote navigation, fresh replacement of an expired review, ownership renewal with the same exact amount, all four expiry guards, blocked costs, read-only fallback, missing capability wiring, stale wallet responses, and session-bound metadata/server rejection. The isolated rendered browser check confirms the sole Permit button is visible and disabled without consent and after expiry. Live mobile acceptance is still an owner action; automated fixtures are not evidence of a live quote or financial authorization.
