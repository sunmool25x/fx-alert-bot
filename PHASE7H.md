# Phase 7H — durable exact-amount quote continuation

Historical phase record. See [Phase 7M](PHASE7M.md) for the later verified Permit milestone and current execution blockers. Actions described below belong to that earlier phase; they are not current authorization to retry or sign.

## Observed failure and limits of the diagnosis

The owner reported `NO_TRADE_CONTEXT` after `/quote 50 USDC XSGD` and ownership verification. At investigation, the live database contained only three expired historical two-USDC intents, with no current fifty-USDC intent. Logs showed Mini App authentication, wallet connection and ownership verification, but no context lookup or preview for that session. The first independently observable failure was therefore the Mini App bootstrap: no valid continuation identifier was available, so the old client skipped `/api/context` entirely.

The old route depended on `/#intent=<opaque-id>`. A missing fragment had no authenticated server-selected recovery path. Reload also recreated authentication rather than resuming an existing valid session. The original request was persisted only after the initial external market quote succeeded, which could leave a request without a continuation when that read failed. These are verified design weaknesses; the logs do **not** establish whether the owner opened a generic wallet link, Telegram lost a fragment, an old button expired, or the initial quote failed. No connected-phone URL or provider state was inspected. Ownership verification and claim rendering do not delete the original intent. There is no evidence that they deleted the missing fifty-USDC record.

## Durable request, separate from an executable quote

Additive migration 9 creates `quote_continuations`. Before migration of an existing database, SQLite `VACUUM INTO` creates a consistent local backup. Existing funding, wallet, trading and analytics tables are preserved.

Each continuation records an opaque ID, Telegram user ID, exact token addresses and amount, Sepolia chain ID, verified-wallet recipient mode, creation/expiry timestamps, selection and PENDING/REVIEWED/CANCELLED state. A successful review additionally records its authenticated session ID and wallet epoch. No signatures, wallet secrets or prepared financial authorization are stored in this table.

The validated Telegram request is persisted before the initial public quote. Amount precision, integer bounds and token minimums remain identical. A `NO_LIQUIDITY` response can still offer explicit continuation without inventing quote values. All other failures retain their existing error behavior.

Only tapping the existing explicit **테스트 거래 계속** action selects a request. There is at most one selected continuation per Telegram user. A newer unselected request never silently replaces it. Mini App URLs carry only the opaque ID in `?intent=...`; legacy fragment URLs remain supported. A signed Telegram `start_param` is accepted only after the normal initData validation. Telegram documents signed start parameters and their launch query counterpart in its [Mini Apps documentation](https://core.telegram.org/bots/webapps); no BotFather remote configuration is required for the query-based inline Web App link.

An authenticated `/api/context` lookup without an ID can recover only that user's explicitly selected, unexpired continuation. An explicit invalid, conflicting, foreign, cancelled or expired ID never falls back to another request. No amount is inferred from history or a default.

## Authentication, ownership and reload

The client pins the recovered opaque ID in the current URL, restores that same ID after ownership verification, and displays its exact amount above claim history. The existing wallet authentication, nonce, epoch, origin, Host, CSRF and ownership freshness checks remain intact.

Reload uses `/api/bootstrap` to resume the existing HttpOnly-cookie session. The client stores only its CSRF nonce in sessionStorage, never trade terms, cookies, initData, signatures or wallet secrets. Bootstrap validates the existing cookie, CSRF, origin, Host, fresh Telegram HMAC initData and matching user; it neither creates a new proof nor extends any lifetime. Initial `/api/auth` replay protection is unchanged. If authentication is stale, normal authentication is required again. In particular, Telegram initData still has its existing five-minute age limit; this implementation does not promise indefinite authenticated reloads.

A changed development origin preserves the server-side request but carries no authentication across origins. The current runtime link and wallet metadata must use the new origin; a fresh Telegram session and ownership verification may be necessary. The same selected request remains available within its original TTL.

## Lifetime and quote refresh

The request keeps the existing fifteen-minute TTL. Opening the Mini App, connecting a wallet, ownership verification and reload do not consume it. Successful read-only review marks it REVIEWED but leaves it refreshable until explicit cancellation or TTL expiry. Every quote tap obtains a new quote for the same exact request and verifies the current wallet/session/epoch. The existing quote expiry, cost calculation, cost gate, balances, token identities, recipient binding and unsigned review validation are unchanged.

Quote expiry does not delete the request. The CTA becomes **새 Quote 다시 확인** and repeats the fresh read for the same amount. Cancelled requests cannot be resurrected by an old Telegram button. No-context and expired-request screens explain that no financial action occurred, disable quote lookup, and offer a return to the Telegram bot.

## Diagnostics and validation

Lifecycle logs cover parsing, persistence, explicit selection, Mini App bootstrap, authenticated lookup, ownership return, fresh quote and review/cancellation. Process-salted HMAC references replace raw user/context IDs. Logs never include initData, cookies, CSRF values, signatures or wallet secrets.

The full suite passes **609/609 tests**, including consistent pre-migration backup, exact fifty-USDC Telegram-to-HTTP continuation, real fixture ownership verification, same-session reload, quote expiry and fresh quote refresh, changed-origin reauthentication, cross-user isolation, malformed/expired/cancelled IDs, no implicit latest/default request, disabled no-context CTA and initial public-quote liquidity failure. The end-to-end tests use mock Sera/RPC data and fixture keys, not the owner's wallet or a live financial signature. Existing behavior assertions are retained. Typecheck and build pass.

Live verification preserved the same runtime origin and every protected funding/wallet/trading/analytics table byte-for-byte at row level. Database integrity and foreign keys pass, and the pre-migration backup is valid. The served bundle matches the local build and the query launch route loads. A fresh `wallet:preflight` process passes Telegram, Sera, RPC, database and public-origin checks. The already-running launcher retains its older imported preflight module and logged a migration-9 database warning after reload; this is a stale checker result, not a failed migration. The fresh checker confirms readiness. The functioning launcher/tunnel were retained to avoid an unnecessary origin change.

Publication hygiene passes for 205 public candidates and three existing commits; Gitleaks finds no secrets. Dependency audit reports three pre-existing moderate package entries, zero high/critical, on the existing OKX/StableLib dependency path; dependencies are unchanged. The owner's prior session expired during the task, so it is not treated as fresh ownership. No current fifty-USDC owner continuation or quote is manufactured by an operator.

An owner mobile review and a new owner-side live fifty-USDC quote remain pending. Historical Phase 7G quote values are expired and are not reused as fresh evidence. No ownership freshness extension, Permit, Intent, relayer submission, swap or new claim is performed. Mainnet and swap execution remain OFF. Financial service modules and execution gates are unchanged; only continuation persistence, authenticated read-only recovery and presentation are added.
