# Phase 7G — Explicit read-only quote continuation

Historical phase record. See [Phase 7M](PHASE7M.md) for the later verified Permit milestone and current execution blockers. Actions described below belong to that earlier phase; they are not current authorization to retry or sign.

The claim-completion panel no longer chooses a trade amount. Its **새 Quote 확인 / Check a new quote** action delegates to the current explicit Telegram continuation. Without that context it shows `NO_TRADE_CONTEXT` and asks for a new amount-bearing `/quote` command.

## Root cause and evidence

Telegram already saved the explicit amount in an owner-bound `quote_intents` row and placed its opaque ID in `#intent=…`. The claim panel independently called the legacy `requestTwoUsdcPreview` helper, which posted `{id, amount: "2"}` to `claim/preview`. That endpoint created a separate two-USDC intent, ignoring the incoming Telegram continuation. The old app also erased the fragment after opening, so reloading lost the continuation.

At inspection, the remaining recent intents were three two-USDC wallet-origin records. Their creation times, inferred from the existing fifteen-minute expiry, precede the three `NO_LIQUIDITY` responses in sanitized logs at 10:37:36, 10:37:51 and 10:38:06 UTC. This corroborates requests reaching the backend rather than a completely unregistered handler. The actual phone's DOM/network trace was unavailable. The old handler showed no loading state and wrote errors above the long claim review, away from the tapped bottom CTA; successful reviews also lacked scrolling. Those visible-feedback defects are reproduced and covered by registered-handler tests.

## Current path

`/quote <amount> USDC XSGD` → saved, owner-bound continuation → Telegram WebApp fragment → authenticated `context` read → amount/pair heading above claim history → explicit fresh `preview` → transparent read-only review.

The fragment remains across reload/ownership renewal; no local amount default or browser-storage fallback exists. The authenticated context endpoint applies the existing CSRF/origin/session checks and existing intent expiry/ownership lookup. Each tap rereads context and fetches a new quote, preserving exact input, pair and same-wallet recipient. Missing/expired contexts never create another intent or resize a request. Errors and loading are visible next to the active action, announced through a status region and brought into view.

Ownership errors offer the existing proof preparation/verification on the connected provider, without another pairing when that provider is available. Preparation alone does not sign. The owner explicitly taps the existing ownership action; the continuation remains unchanged. An expired authenticated session instead requires reopening from Telegram. Valid ownership is not renewed for a quote.

The generic preview now includes the existing cost review for the actual requested amount, unsigned digests and exact future authorization details. `REVIEW_READY` or `COST_REVIEW_BLOCKED` is presentation state; financial state remains `PREVIEW`, with no version or trade ID. The original 50% policy and all quote calculations remain unchanged. Neither state releases a signing payload or financial consent controls.

## New read-only observation

One new operator-side, read-only quote for exactly 50 USDC and the acceptance wallet was captured at **2026-09-17 10:44:37 UTC**, while the existing owner session was valid. It was validated against the live Sepolia deployment and read-only permit checks. Minimum output was **60.451755 XSGD**, Sera-reported equivalent cost **1.92033206417988 USDC**, cost/input **3.8407%**, gate **PASS**. It is short-lived evidence and has expired; it is not the owner's newly rendered mobile review and must never be reused. No owner authentication was manufactured, no browser cookie was borrowed and no owner endpoint was impersonated for this capture.

The managed launcher stopped itself when its watcher encountered an intermediate test failure during edits. After all fixes and checks, the existing automated launcher is used to restore the live environment with a new Quick Tunnel. Current public origin is obtained from runtime state, never copied into committed documentation. A new origin/session requires fresh ownership in the normal Telegram flow; old proof is not represented as fresh on the new origin.

## Validation and scope

596/596 tests pass, including exact 2/50 Telegram propagation, owner/context expiry, repeated fresh requests, no resizing, registered click/loading/error/success states, generic claim CTA with/without context, connected-provider ownership renewal, exact read-only review and disabled confirmation/submission. Typecheck and build pass. Prior tests are retained; the former test asserting that a 50-USDC review must throw is replaced with exact-amount, gate and disabled-authorization assertions.

Wallet/authentication architecture, quote computation, scanner/alert rules, signing payloads, execution/settlement code, cost thresholds and financial database state machine are unchanged. The legacy claim-preview API/helper remain available for existing compatibility tests but are disconnected from the active Mini App. No Permit, Intent, relayer submission or transaction is requested. Mainnet and swap execution remain OFF. Claim evidence and historical database state are preserved. No NLU, commit or push is performed.
