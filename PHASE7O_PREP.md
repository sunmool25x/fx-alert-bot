# Phase 7O-PREP — live blockers and persistent Git policy

2026-10-11. **C — MOBILE_TIMING_OR_PROTOCOL_BLOCKED.** Phase 7N remains offline-ready; reliable mobile Permit + Intent + explicit submission is not proven. The historical Permit retirement dry run now passes, but no retirement or live financial migration was applied. Mainnet and swap execution remain OFF. No new financial signature, relayer submission, transaction, approval or revocation was requested.

## Baseline and historical evidence

The 43 local Phase 7N files based on public commit `51387a693819f67206503dca92e01c0444d63f98` were present and retained. Its 870-test baseline is included in this milestone. This work extends the existing application and retirement operator; it creates no alternative acceptance flow.

The successful original Permit remains **PERMIT_SIGNED / VALID / MATCH**, encrypted and locked. Both retained ciphertext copies were decrypted only in memory and verified against the original typed data and digest. Owner, exact 50-USDC amount, token, verified spender, Sepolia chain/domain, nonce and deadline still match. Its Quote expired at 04:17:14 UTC and Permit at 04:21:43 UTC on October 11. Neither may be reused. A valid expired signature is not an unsigned or invalid result.

At 06:06:24 UTC, independent PublicNode and dRPC reads agreed on common finalized block 11889712 and latest block 11889808: Permit nonce **0**, allowance **0**, no pending owner transaction-nonce difference. Deployed token runtime, domain and deadline enforcement passed the existing independent expiry proof. Current allowance/nonce alone were not used as evidence that an off-chain signature was absent.

## RPC history blocker: verified cause and minimal repair

The unchanged Phase 7N dry run reproduced `BLOCKED / APPROVAL_HISTORY / UNAVAILABLE`. Controlled probes used standard hexadecimal block bounds, the exact USDC address and indexed Approval owner/spender topics:

| dRPC query | HTTP / result |
|---|---|
| Historical one-block and 50-block ranges | 200; zero matching logs |
| Recent one-block and 50-block ranges | 200; zero matching logs |
| Historical and recent 500-block ranges | 400, code 35 |
| Historical and recent 1,000-block ranges | 400, code 35 |
| Historical 50-block range with event topic only | 200; zero matching logs |

The provider's error says “ranges over 10000 blocks are not supported on free plan”, even for 500 blocks. This establishes an effective per-request free-service range restriction with misleading numeric wording. It does **not** establish the exact maximum or dRPC's internal routing cause. Successful historical 50-block reads disprove an across-the-board archival prohibition for this interval. Successful exact and reduced-topic queries rule out the tested filter/encoding as the cause. [dRPC documents network-specific public-node limits](https://drpc.org/docs/howitworks/ratelimiting) and standard [range/topic filters](https://drpc.org/docs/ethereum-api/eventlogs/eth_getLogs).

PublicNode accepted the same recent probes. The alternative endpoint listed by [Automata 1RPC](https://docs.1rpc.io/overview/supported-networks), `https://public.1rpc.io/sepolia`, returned HTTP 521 / HTML during this run and was not used as evidence. No paid accounts, access-control bypass, endpoint rotation or unverified replacement provider was needed.

`collectEmptyApprovalHistory` now scans every block in the bounded interval with **50-block requests, paced 400 ms apart per provider**, on the existing two independent providers. It verifies both start and finalized end anchors before and after each provider's scan. Any missing/malformed response, matching Approval, provider error or changed anchor blocks completion. No partial result is promoted to complete evidence; no failed range is silently retried. The existing 10,000-block total bound and all cryptographic/authority/conflict checks remain in force.

The same proven range restriction could stall settlement catch-up after a restart. The existing read-only settlement reader now advances in 50-block windows, retaining its cursor, two-provider agreement, receipt/transfer/balance and finality checks. Fixtures verify exact contiguous catch-up coverage. This changes only query size, not what qualifies as settlement.

**Corrected operator dry run: PASS — RETIREMENT_READY_FOR_SEPARATE_APPROVAL.** Both providers supplied complete bounded zero-Approval history from the block before the original request through the common finalized anchor. The original signature remained valid for its original Permit. `retired:false`, `financialRequestCreated:false`. No `--apply`, schema 15/16 installation, lock deletion or state relabel occurred. This is point-in-time evidence: any later authorized retirement must collect it afresh and separately preserve/verify the original rows.

## Measured timing, not a mobile guarantee

Three sequential read-only diagnostic quotes requested exactly 50 USDC → XSGD for the same recipient. They did not create application financial records, renew ownership, call the wallet or attach the historical signature. A network allowlist admitted only public Sera reads/quote requests and read-only Sepolia RPC methods; `POST /swap` was forbidden. All three quote packages passed current economics, nonce/domain and deployed Intent-digest checks. These quotes are diagnostic historical observations, never reusable acceptance packages.

The API pacing remained 500 ms; measurements include queue wait and response parsing where applicable. These are **three component samples**, not tail-latency estimates or a full signed execution benchmark.

| Component | Observed time |
|---|---:|
| Quote API call, including pacing | 728–744 ms |
| Actual Quote validity left at response | 29.399–29.543 s |
| Post-Quote domain/nonce/Intent-digest RPC checks | 178–185 ms |
| Local package/digest/economics checks | 1–3 ms |
| Validity left when review could render | 29.219–29.351 s |
| Permit request preflight network reads | 877–934 ms |
| Original retained Permit cryptographic verification | 3–21 ms |
| Callback's dynamic RPC checks | 116–153 ms |
| Future Intent preflight network reads | 863–898 ms |
| Future Intent callback RPC reads | 124–129 ms |
| Final submission preflight network reads | 879–896 ms |

The future Intent and submission rows measure the same read operations, **not** a real Intent signature, durable callback round trip or relayer POST. They exclude mobile interaction, Telegram transport, wallet switching, callback delivery and relayer processing. No submission latency is claimed. Synthetic cryptographic/lifecycle tests remain separate from these live reads.

The original successful mobile Permit chronology remains: review to consent **4.108 s**, consent/preflight to reservation approximately **2.676 s**, SDK request to result **5.110 s**, result to durable verified persistence **11 ms**, total review to persistence **12.221 s**. The historical Quote then had **17.078 s** left, or **12.078 s** after the five-second safety margin. This is one real Permit observation, not two-signature mobile evidence.

Current conservative admission reserves 28.221 s before Permit, 16 s before Intent and 8 s before final submission. It intentionally reserves the entire historical 12.221 s for the Permit stage, plus assumed 8 s Intent / 3 s submission / 5 s margin. The assumptions were not reduced in this task. At rendered review only **0.998–1.130 s** remains before the Permit threshold; after its mandatory preflight, a zero-reading probe leaves only **95–196 ms**. An ordinary informed user cannot use that as a practical review window. The previous observed 4.108 s reading time alone exceeds it.

Fast fixtures still finish in 11.5 s and the baseline fixture in 23.721 s; slow reading/handoff/callbacks fail closed. Those fixtures establish theoretical feasibility under assumptions. **Reliable real-mobile completion is NOT proven, and the current admission/UI budget is not practically usable for this full flow.** A screenshot/chat round trip cannot be inserted into the TTL. The task did not ask the owner to repeat the live attempt.

## What can safely precede a Quote

Already before Quote creation: wallet connection, fresh ownership, general education, token metadata, deployment/EOA/balance checks, executor readiness and clock check. Metadata caches already exist. Independent post-Quote domain/nonce/Intent-digest reads and EOA checks already run in parallel where safe.

Keep after the new Quote: validate exact returned economics, both UUID bindings, same-wallet recipient, fresh nonce and deadlines; show the concrete terms; obtain separate Permit and Intent consent; verify and retain each result; perform explicit final submission and fresh dynamic checks. Rechecking chain/configuration/nonce cannot be replaced by an old cached answer. Immutable ABI/domain construction can be cached, but measured local work is only 1–3 ms. Optimizing that cannot recover meaningful mobile consent time. No Quote expiry, safety budget, signing boundary or authorization policy was weakened.

## Official execution requirements and alternatives

The current [Sera swap API](https://docs.testnet.sera.cx/api-reference/endpoints/swaps/) still uses a short stored Quote. Wallet-funded quotes require their returned Permit even with standing allowance. An equity-only route can omit it; unsupported-ERC-2612 tokens have an approval transaction fallback. Neither changes this USDC wallet-funded acceptance. Batch quotes are not reservations. No documented reserved-Quote or expiry-extension endpoint was found in the reviewed official reference.

[Authentication documentation](https://docs.testnet.sera.cx/api-reference/authentication/) defines the separate Sera Intent domain and fields. A longer signed `expiration` does not extend stored `expires_at`. [SOR contract documentation](https://docs.testnet.sera.cx/contracts/sor/) distinguishes Intent verification and wallet funding; the executor supplies route matches and checks the signed bounds. Direct SOR calls are not a documented replacement for this bot's relayer workflow.

The existing flow must bind one new Quote to its exact Permit and Intent; collect each signature explicitly; persist and locally verify both; then make one separately confirmed `POST /swap` containing the Quote ID, Intent signature, Permit signature and its deadline. A pending acknowledgment is not settlement. The existing reader requires independent finalized receipt, SOR event, recipient token movements and reconciled balances. No silent re-quote/resubmit behavior from API retry guidance is adopted.

**Sera inquiry needed — prepared, not sent:**

> We are testing a Sepolia Telegram/OKX mobile flow with separate informed consent for each authorization and final submission. `/swap/quote` returns about 30 seconds of validity and requires a fresh per-quote ERC-2612 Permit for wallet-funded USDC, followed by a separate Sera Intent. Our one real review-to-Permit result took 12.221 seconds; we still need Intent review, wallet approval/return and explicit submission. Mandatory preflight and a safety margin leave insufficient practical mobile review time. Is there an officially supported longer-lived reserved quote, server-side reservation/extension, or another wallet-funded mobile workflow? Please specify endpoint/schema, precise expiry semantics, nonce/Intent/Permit bindings and failure/replay rules. We cannot extend expiry locally, reuse a signature for another quote, silently replace terms or auto-sign/submit. Equity-only funding would require a separate product and authorization review.

## Narrow readiness and future acceptance gate

Phase 7N's exact 50-USDC policy, pinned spender, Sepolia Intent domain, immutable package, encrypted callbacks, common financial locks, duplicate/restart protection, unknown-result handling and finalized settlement tests remain intact. No additional offline authorization defect was found in this review. Remaining blockers/prerequisites:

- A protocol-supported usable authorization window, or separately reviewed evidence-based design that allows meaningful mobile consent. Current full-mobile reliability is unmeasured.
- Separate authorization for fresh retirement evidence/application and opt-in migrations; the historical lock deliberately remains active.
- Separately reviewed narrow runtime execution configuration, without removing launcher safety enforcement as a workaround.
- Fresh ownership and a genuinely new exact-50 package; original history/signature is never reused.
- Real owner-controlled Permit, then Intent, then one final submission only in a future explicitly authorized task; reconcile uncertain outcomes rather than retry.
- Validate actual deployed settlement transfer patterns and historical balance-read availability. Mock success is not live settlement evidence; any provider failure remains unresolved rather than confirmed.
- Three existing moderate dependency findings remain, with no audit-reported fix. No dependency or wallet transport change was made.

## Persistent Git instructions

Installed `AGENTS.md` in the repository and an appropriately scoped global `~/.codex/AGENTS.md`, preserving the previously empty instruction locations. Both contain **Git Commit and Push Policy**. This owner-authorized policy persists for future tasks: independently choose commit/push, local-only commit, defer incomplete work, or no change. Meaningful validated secure milestones normally get a commit and normal fast-forward push without another reminder. Financial execution remains separately authorized.

[Official Codex instruction discovery](https://learn.chatgpt.com/docs/agent-configuration/agents-md) supports both locations. The installed Codex CLI 0.159.2 `debug prompt-input` confirmed **both policy texts are loaded**, without starting an agent or development task. No conflicting override was present. The repository policy is versioned; the global policy stays local. Secret/financial evidence exclusions, exact staged-diff review, tests, security scans, verified remote and no force-push are explicit. Failure/divergence defers publication with a reason.

## Validation and publication scope

Targeted history/retirement/timing/settlement tests **61/61 PASS**; full suite **883/883 PASS**, zero skipped; typecheck/build PASS. Audit reports 3 moderate findings, zero high/critical and no available fixes. Gitleaks passed all 252 public files and existing history; the publication scanner passed working tree, index and history. Configured secrets, real signature bytes/ciphertext and private financial identifiers were also checked locally without printing them. Tests cover contiguous small ranges, independent providers, malformed/partial history, approvals, changed anchors, range bounds and settlement catch-up, alongside all Phase 7N financial regressions.

The actual database remains at schema 14; migrations 15/16 are absent. All 13 financial/wallet/continuation/history tables match the consistent pre-task snapshot. Both encrypted signature copies and the financial lock are intact; zero trade sessions/submission attempts. Integrity `ok`, zero foreign-key errors. Private environment and managed runtime origin are unchanged. Bot identity, no-webhook polling configuration, HTTPS page/health and execution-OFF state pass read-only checks. No messages were sent and no new phone acceptance is claimed.

Publication includes all Phase 7N work plus this preparation, small-range read repairs, regression tests and repository Git policy. Private databases, evidence, diagnostic quotes, signature bytes/ciphertext, sessions, tunnel origin and logs are excluded. Phase 7N remains described as offline-ready; this milestone remains **C**, regardless of Git publication.

**One next owner action:** send the prepared technical inquiry to Sera and obtain the supported mobile quote-validity workflow before authorizing live acceptance. Do not request a new financial signature now.
