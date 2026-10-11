# Phase 7E — exact 2 USDC review, stopped before Permit

Historical phase record. See [Phase 7M](PHASE7M.md) for the later verified Permit milestone and current execution blockers. Actions described below belong to that earlier phase; they are not current authorization to retry or sign.

The authenticated Mini App now offers an explicit **2 test USDC → XSGD** quote after the existing finalized test-funding claim. This is a read-only acceptance review. Mainnet and swap execution remain OFF. No Permit, Intent, relayer submission or swap is authorized by this phase.

## Current acceptance evidence

On 2026-09-17, the initial ownership check passed at 09:16:41 UTC, with one valid session at epoch 3. The existing session expired at 09:23:30 UTC. The follow-up check at 09:24:06 UTC failed closed; owner-dependent live validation stopped. Authentication was not extended or bypassed. The wallet reference, finalized claim and historical database state remain in place.

No fresh owner-initiated quote was obtained in this task. The earlier Phase 7D quote is expired discovery evidence only. Live minimum output, fees, Permit nonce/deadline/digest and Intent digest are therefore **not yet verified**. A fixture render or a served JavaScript bundle is not evidence of a live review on the owner's phone. Phase 7E is not complete.

## Owner-initiated request

- The claim success button explicitly requests `amount: "2"` from the existing authenticated `/api/claim/preview` endpoint. The same wallet is the recipient. Each tap performs one new quote request using the existing Sera client; no quote cache, discovery reuse, automatic retry, resize or alternate pair is used.
- A missing amount keeps the previous one-USDC request semantics for an already-open old client. It is not silently changed to two. Only the new explicit button selects two. Other supplied amounts are rejected.
- Existing Telegram authentication, CSRF, origin, ownership expiry/epoch and finalized-claim evidence checks still apply. The browser checks wallet/provider/network/epoch before and after the read. Reopen the Mini App to load changed assets; an expired session requires normal owner verification.
- `NO_LIQUIDITY` ends that request. Another request requires an explicit owner tap. It never falls back to five or ten USDC.

## Cost and authorization review

The [official Sera swap documentation](https://docs.testnet.sera.cx/api-reference/endpoints/swaps/) distinguishes the short quote expiry from the signed deadline. In `receive_less`, input remains unchanged and gas reduces output. `minOutputAmount` is the post-cost minimum, not a separately estimated fill. The input-token/USD fee summary is a display equivalent; the output deduction comes from `quote_breakdown` and must not be subtracted again from the minimum.

The acceptance review checks token identities, exact before/after input, before-minus-after output, the quoted minimum and both cost summaries. Decimal-to-raw input cost comparisons allow less than one base unit of quantization without assuming an undocumented rounding direction. Missing or inconsistent fields result in a visible review hold.

A deliberately conservative **acceptance-only hold** also applies when the input-equivalent cost is at least 50% of the input, or the output deduction is at least 50% of the pre-cost output. This is an application review threshold, not a Sera API rule, a profitability judgment or a change to scanner/trading calculations. A positive HTTP response alone does not pass this review.

The existing validation verifies the exact token contracts, Sepolia deployment, same-wallet recipient, raw input and Permit amount of 2,000,000, SOR spender, token domain, live nonce and Intent hash against contract reads. The review additionally displays both unsigned EIP-712 digests in expandable details. These values come from one validated snapshot; no signature payload or confirmation version is released by this read-only endpoint.

ERC-2612 Permit binds the owner, token domain, spender, value, nonce and deadline. It does **not** itself bind the output asset, recipient, minimum or quote ID; those are bound by the separate Intent and application snapshot. A Permit submission deadline is not an automatic expiry of an allowance already recorded on-chain. Both distinctions remain visible in the review.

The countdown stops review five seconds before Sera's quoted expiry, using the existing safety buffer. Expiry clears local authorization state and requires a new quote and review; there is no automatic refresh. Permit, Intent and final submit controls are absent in this read-only flow, even before expiry.

## Validation and scope

Automated tests cover the explicit two-USDC HTTP/browser flow, one-call no-liquidity behavior, no fallback size, cost arithmetic/holds, countdown, stale ownership, wallet/network/epoch mismatches and blocked confirmation/submission. Existing Permit/Intent binding and safety tests remain intact. Tests use isolated databases and mocked external services, never live transactions.

Wallet authentication, financial signing/submission, settlement verification, database schema and execution gates are unchanged. No private key, server signer, session extension, completion commit or push is introduced. Resume live acceptance only through the authenticated owner flow, and stop before Permit.

## Separate local runtime repair

Applying the additional tests exposed a launcher issue: validation children wrote to unconsumed stdout/stderr pipes. Once test output filled the Windows pipe buffer, the test process could not exit and automatic reload stalled, leaving the Mini App returning HTTP 502. Validation now drains both pipes without logging their contents. A regression test writes one MiB to each pipe and requires normal completion. Application and tunnel logging retain their existing sanitizers.

The existing launcher had to be stopped and restarted through its normal automated flow to load this repair. This necessarily created a new temporary HTTPS origin; runtime metadata is applied by the launcher, not hardcoded. The prior ownership session had already expired. Historical wallet/claim records are preserved, but the owner must enter through the new Telegram `/wallet` flow and satisfy its normal authentication before requesting a quote. No old session is promoted as valid for the new origin.
