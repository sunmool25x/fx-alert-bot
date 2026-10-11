# FX Alert Bot — Owner acceptance checklist

Start with [README: Start Live Testing](README.md#start-live-testing). Telegram mobile Mini App launch, official OKX Web3 handoff, connection and backend ownership verification have been successfully tested. MetaMask, Telegram Desktop, real swap submission and settlement remain unverified. Preserve existing private credentials. The launcher manages the tunnel/origin and rebuilds source changes on new launches. Mark a box only after **you perform that check**. Automated tests and public probes are recorded separately in [STATUS.md](STATUS.md); they do not complete phone tests.

## Current gate — Phase 7O-PREP, mobile timing/protocol blocked

- [x] Phase 7N implementation retained and revalidated; full suite 883/883 PASS, targeted history/retirement/timing/settlement 61/61 PASS.
- [x] Two independent RPCs provide complete bounded Approval history with paced 50-block requests; original signature and zero current authority checks pass.
- [x] Retirement dry run PASS only; valid historical Permit remains encrypted, `PERMIT_SIGNED`, expired and locked. No live migration or retirement.
- [x] Three read-only timing probes distinguish network components from real wallet latency. No real Intent/submission timing claim.
- [x] Persistent repository/global Git policy installed and instruction discovery verified. Publication includes Phase 7N and 7O-PREP public-safe work.
- [x] Mainnet and swap execution OFF; no new live financial signature, submission or transaction.
- [ ] Obtain an official Sera-supported practical mobile authorization window/workflow; current budget is insufficient for informed review.
- [ ] Separately authorize fresh retirement evidence/application, reviewed migrations and narrowly scoped execution configuration.
- [ ] In a future explicitly authorized task only: new ownership/Quote, separate Permit and Intent decisions, explicit single submission, independent finalized settlement verification.

**One next owner action: send the prepared [Sera inquiry](PHASE7O_PREP.md#official-execution-requirements-and-alternatives) and obtain the supported workflow.** No new signature is requested. Historical checklists below are not current instructions.

## Historical gate — Phase 7N offline ready; no live execution authorized

- [x] Strict canonical Intent wire/digest and installed OKX serialization tested; current two-RPC on-chain getIntentDigest comparison matches.
- [x] Durable encrypted Permit/Intent capture, late/unknown outcomes, common locks, immutable package, separate explicit actions and one submission attempt tested offline.
- [x] Finalized two-RPC receipt/event/transfer/balance verification and reorg handling tested.
- [x] Fake-clock timing admission tested; full suite 870/870 PASS, typecheck/build PASS.
- [x] Signed-expired **valid** Permit retirement policy and migrations validated on disposable databases only. Live signed record/lock remain untouched.
- [x] Mainnet, live swap execution, Intent and relayer remain OFF. No live financial request in Phase 7N.
- [ ] Owner separately authorizes Phase 7O preparation after reviewing [PHASE7N.md](PHASE7N.md#verification-and-phase-7o-gate).
- [ ] Fresh finalized authority evidence and separately authorized historical lock retirement; reviewed migrations/configuration with execution scope bounded.
- [ ] Real mobile fresh package: Permit → Intent → one explicit submission within the original Quote's actual lifetime. **Not proven by fixtures.**
- [ ] Independently verified finalized Sera settlement and final balances; no HTTP-only success claim.

**Next owner action: review the Phase 7N report and decide whether to separately authorize Phase 7O preparation. Do not request another signature now.** The historical checkpoints below are evidence, not current instructions.

## Historical gate — Phase 7M Permit verified; execution preparation only

- [x] Owner completed one real mobile OKX Permit for exactly 50 test USDC → XSGD.
- [x] Original signature independently recovered to the acceptance wallet; token, amount, spender, chain, nonce, domain and digest match. Encrypted callback and verified copy retained.
- [x] Mark **mobile Permit signing VERIFIED**, separately from on-chain approval or settlement.
- [x] Historical Quote (04:17:14 UTC) and Permit (04:21:43 UTC, 2026-10-11) expired. Original `PERMIT_SIGNED` record and financial lock remain preserved; no reuse or retirement.
- [x] Read-only chain reconciliation: current nonce/allowance 0/0; no relevant approval or settlement in the inspected attempt interval; zero application trade sessions/attempts.
- [x] Mainnet and swap execution remain OFF; no new Quote, Permit, Intent, relayer submission or transaction in Phase 7M.
- [ ] Review [the next-stage plan and blockers](PHASE7M.md#concrete-blockers-before-owner-controlled-execution).
- [ ] Implement and test the existing full-trade path with execution still OFF: exact Intent wire domain, persistent signature stages, shared locks/cost gates, expiry/unknown-result handling and bounded timing.
- [ ] Only after separate authorization and readiness: a completely new owner-controlled package, two separate financial signatures and one explicit relayer submission.
- [ ] Verify actual finalized settlement, signed token bounds, recipient and final balances.

**Next owner action: review the Phase 7M plan. Do not start another Quote or wallet signature.** One successful Permit is not end-to-end trade acceptance. Existing historical checkpoints below do not authorize replaying an expired package or enabling execution.

## Historical gate — Phase 7D review prepared

The complete read-only matrix found a positive forward quote at **2 test USDC**, the smallest successful tested amount; this is classification **B**, not pair-wide no liquidity. Use USDC → XSGD; no fallback. See [matrix, costs and verified Permit/Intent/relayer architecture](PHASE7D.md). Discovery does not change a user's amount, create a trade or authorize execution.

- [x] Twenty bounded, paced quote probes; exact token identities and same-wallet recipient.
- [x] Forward successful quotes validated against live Permit nonce/domain and on-chain Intent digest.
- [x] Separate Korean/English ownership, Permit and Intent explanations; transparent read-only review implementation and automated tests.
- [x] Mainnet and swap execution OFF; existing claim and database state preserved; no new transaction.
- [ ] Renew the expired ownership proof through the existing wallet flow.
- [ ] Owner views a NEW two-USDC quote and its review in the authenticated mobile Mini App; the matrix's expired quotes cannot be reused.
- [ ] In a later separately authorized execution session only: exact-amount Permit, Intent and one owner-triggered relayer submission.
- [ ] Actual canonical finalized SOR event, exact token transfer bounds and final wallet balances independently verified.

There are two **financial** wallet signatures; ownership renewal is separate. No financial request is pending now. Keep `dev:live` execution OFF. Do not begin a claim again, promote public probe data into an authenticated session, or mark automated/UI-fixture checks as owner phone acceptance.

## Historical gate — Phase 7C quote unavailable

At 07:14 UTC on 2026-09-17, fresh ownership, sufficient exact USDC/XSGD balances and the Sepolia deployment were checked for the acceptance wallet. The same-wallet **1 test USDC → XSGD** quote returned HTTP 400 `No liquidity`. This is a rejected quote, not a failed on-chain swap. No wallet request, trade row, signature, submission or transaction was created. Execution and mainnet remain OFF. Owner activity remains excluded from production analytics through the existing configured exclusion policy.

- [x] Fresh ownership and Sepolia funds checked for the exact acceptance wallet.
- [x] Current quote requested for exactly 1 USDC, without promoting scanner/alert/cache data.
- [x] Unavailable quote rejected; size and execution policy unchanged.
- [ ] Executable quote with verified minimum output, costs and expiry.
- [ ] Transparent Mini App financial review and explicit confirmation.
- [ ] Separate Permit and Intent approvals in OKX, then exactly one Sera submission.
- [ ] Broadcast/mining/finalized Sera settlement and final balances.
- [ ] Completion commit `feat: verify end-to-end Sepolia swap` and push to main, only after real settlement is verified.

The selected Sera path is relayed: Permit plus Intent signatures authorize one swap; the user does not approve a faucet-style native `eth_sendTransaction`. The UI must accurately explain both approvals and the quoted token cost. The single-native-request wording in the Phase 7C request does not match the current official API/architecture. No alternate transaction path or approval bypass was implemented. Before eventual activation, enforce the requested one-swap scope and recheck a fresh ownership session and executable quote.

## Completed funding — Phase 7B claim verified, first swap still disabled

The owner approved one transparent in-app claim. Its existing persisted transaction was independently verified as a successful, canonical finalized Sepolia `claim()` to the documented faucet, with zero ETH value. The same record is now `CLAIM_BALANCES_VERIFIED`; **do not press claim again**. The opaque Etherscan manual write flow is retired from acceptance.

- [x] Actual exact-contract USDC/XSGD transfers and their on-chain decimals verified: 10^15 raw units each, 6 decimals, 1 billion displayed test tokens each.
- [x] Native receipt verified including actual gas: 0.1 + 0.01 − 0.016194067970106649 = 0.093805932029893351 Sepolia ETH.
- [x] Original fee mismatch identified and repaired under the reviewed total cost ceiling; no second claim or swap submitted.
- [x] Existing hash, request snapshot and duplicate lock preserved; evidence stored after independent recheck.
- [x] Automated HTTP refresh/idempotency, RPC delay and fee-budget regressions pass. Korean/English success, pending and failure rendering use isolated UI fixtures; these are not a claim of mobile UX acceptance.
- [ ] Owner sees the repaired success state in the updated authenticated Mini App.
- [ ] First fresh 1 test USDC → XSGD quote through the existing ownership-gated preflight.
- [ ] Swap approval/submission/settlement acceptance — **not authorized by this reconciliation task**.

`수령 상태 확인` only re-reads the existing transaction and updates verification evidence. It cannot create a claim or submit a transaction. If the browser session expires, use a fresh `/wallet` ownership session to view the existing record; do not reset the claim or remove its lock. The internal operator command `node --use-system-ca --import tsx scripts/reconcile-claim.ts` reconciles only the single allowlisted wallet's already-attempted persisted hash and does not require a wallet request. Details and cost bounds: [CLAIM_FLOW.md](CLAIM_FLOW.md#reconciliation-correction).

Mainnet and swap execution remain OFF. Preserve earlier diagnostics as history; the earlier generic mismatch message was not evidence that the assets failed to arrive.

## Historical gate — Phase 7A domain trust

See [WALLET_TRUST.md](WALLET_TRUST.md) for the confirmed external Etherscan subdomain mismatch, exact source evidence and application guards. The historical mobile connection is not evidence that this warning has disappeared. Do not reuse the affected Etherscan WalletConnect QR or ask an owner to ignore a wallet warning.

- [x] Identify actual page/iframe origin versus published third-party metadata URL.
- [x] Add and test the bot's exact-origin, own-session-metadata and callback guards; retain Sepolia-only financial gates.
- [x] Show TESTNET, selected wallet, purpose, actual expected domain and no-swap-consent explanation in Korean/English.
- [x] Owner reports a fresh post-reboot bot /wallet connection and ownership verification without a domain-mismatch warning. Read-only server checks independently confirm a fresh, unexpired proof for the exact acceptance wallet. This does not verify the external funding site's connection.
- [ ] Independently verify a supported external Sera funding connection's truthful domain without the affected Etherscan QR. A proposed direct/injected alternative is not yet device-verified.
- [ ] Before one claim request, verify exact acceptance wallet, fresh proof, Sepolia, gas, official contract, OFF flags and no duplicate/pending claim. Preserve the successful single ETH faucet attempt.
- [ ] Owner approves the claim; confirm successful Sepolia receipt and exact-token balance increase. Sera's fixed bundle cannot be requested as a custom one-USDC quantity.
- [ ] Prepare a fresh one-USDC swap preflight under a hard five-USDC acceptance cap. No automatic swap submission.

Latest read-only claim preparation, 2026-09-17 04:16 UTC: 0.1 Sepolia ETH; zero test USDC/XSGD; hasClaimed=false; no unmined outgoing transaction; zero bot trade attempts. claim() simulation and gas affordability checks passed, with an unsigned description retained only in ignored local evidence. No claim request was submitted. External funding connection trust and end-to-end swap acceptance remain **UNVERIFIED**; the owner confirmed the fresh bot connection was warning-free. Mainnet and swap execution remain OFF. Refresh eligibility, pending transactions and gas before requesting approval.

## Historical scope — Phase 6

Execution OFF, mainnet OFF, no transaction submitted. The prior real OKX transport is owner-confirmed; the latest combined ownership tap and Korean NLU still need phone acceptance. Keep every new box unchecked until personally tested. Automated results and read-only live Sera probes are recorded separately in STATUS.md.

### Ownership round-trip refinement

- [ ] Fresh /wallet → OKX connection approval → original Telegram Mini App automatically shows “마지막으로 지갑 소유권만 확인하면 연결이 완료돼요.”
- [ ] “OKX Wallet에서 확인” is the focused primary action. One tap reopens the already-connected OKX session; no repeated selector or generic preparation tap.
- [ ] Personally inspect/sign only the ownership message, then return to verified success. Record actual wallet visit/tap count and whether “다시 열기” recovery was needed. A blocked or missing signature panel is not a passed check.
- [ ] Cancellation, rejection, account change and expired ownership preparation recover safely. No transaction authorization appears.

### Korean Natural Language

- [ ] Rate query: “USDC/XSGD 환율 알려줘”; confirm source/destination and reference-rate label.
- [ ] Quote: “100 USDC를 XSGD로 바꾸면 얼마 받아?”; confirm a fresh quote and exact source amount.
- [ ] Rate alert: “USDC/XSGD가 1.35 넘으면 알려줘” → enter monitoring amount → verify condition → explicitly create/cancel. No alert exists before confirmation.
- [ ] Movement alert: after a pair query, “6시간 동안 0.5퍼 이상 움직이면 알려줘” → monitoring amount → confirmation; absent history is explained.
- [ ] Alpha: “지금 볼만한 FX 조건 있어?” reaches the existing conditions feed or honest empty state.
- [ ] Alerts: “내 알림 보여줘” shows only your alerts.
- [ ] Swap preparation: “USDC 5개 XSGD로 바꾸고 싶어” shows a fresh quote; wallet/trade continuation still requires buttons and stays read-only.
- [ ] Ambiguous request recovery: after /cancel, “1.35 넘으면 알려줘” asks for the pair. Unsupported tokens/2-hour windows give a useful response. Pair context expires after five minutes. /cancel leaves an existing wizard.
- [ ] No automatic execution: text cannot create an alert without its confirmation, open a wallet, sign, create a trade authorization or submit a transaction. English /help /rate /quote remain usable.

## Wallet UX Acceptance

**Phase 4.6.** The owner has reported a successful real Telegram mobile → official OKX Web3 connection → ownership verification. The transport is preserved. The polished interface below still needs your review; browser fixtures and automated tests do not mark these boxes complete. Use the same single `npm run dev:live` runtime and a **fresh `/wallet`** button after the automatic reload. Execution and mainnet remain OFF.

- [ ] `/wallet` disconnected screen looks intentional and shows one clear connection action.
- [ ] Connect opens a clear wallet-selection surface over a stable underlying screen; only OKX Wallet and MetaMask appear.
- [ ] Selecting OKX moves into a dedicated connection screen without awkward inline button replacement.
- [ ] **OKX Wallet에서 계속** and the working Web3 handoff feel like one continuous flow. No same-phone QR, Exchange home or MetaMask detour.
- [ ] Return from OKX shows the ownership-verification explanation before requesting a signature. It explicitly says the ownership signature moves no tokens and executes no trade.
- [ ] **OKX Wallet에서 확인** successfully completes the existing ownership verification with the intended address.
- [ ] Success is obvious. Closing success keeps the wallet connected; **잔액 보기** displays balances without losing the address.
- [ ] Connected `/wallet` and Mini App screens look polished; network/status are clear and the full address can be checked.
- [ ] Cancel/back and retry are understandable, with no hidden old attempt becoming active. Timeout/rejection give a useful next step; do not approve an unwanted old request merely to test it.
- [ ] No raw connector, error-code or debugging terminology appears in the connection flow. Review touch targets, keyboard dismissal where applicable, and readability in your Telegram light/dark theme.

Record the actual OS/Telegram/OKX versions and which language/theme you reviewed. Desktop QR and additional client/theme coverage remain separate checks. Do not send pairing links, QR images, signatures or Telegram credentials. These UX boxes are intentionally unchecked.

## OKX Connect transport regression checklist

Use the single `npm run dev:live` runtime, execution OFF, mainnet OFF and a fresh `/wallet` button in `@world_fx_alert_bot`. Do not rescan an old QR or refresh an old authenticated webview. The old adapter **failed** with Exchange home; the owner subsequently confirmed successful mobile connection and ownership with official OKX Connect. The detailed checklist is retained for regressions and unverified client coverage. Investigation: [OKX_CONNECT.md](OKX_CONNECT.md).

### OKX Mobile Acceptance

Use native Telegram iOS/Android and a current OKX Wallet/OKX App supporting OKX Connect. The selected official EVM SDK documentation requires **OKX App 6.88.0 or later**; the bot does not detect your installed version.

- [ ] 1. Open **FX Alert Bot** on Telegram mobile.
- [ ] 2. Send `/wallet` in the private bot chat.
- [ ] 3. Tap **지갑 연결** to open the fresh Mini App.
- [ ] 4. Select **OKX Wallet**, wait for connection preparation, then tap **OKX Wallet에서 계속**. No same-device QR should appear.
- [ ] 5. Require OKX to open **directly to Web3 Wallet connection approval**. Opening only Exchange home fails this test.
- [ ] 6. Personally approve connection with the intended Sepolia test wallet. No transaction approval is requested.
- [ ] 7. Return to FX Alert Bot's **original Mini App**. Record whether return was automatic, opened Telegram chat, or needed switching back to the retained view.
- [ ] 8. Read the ownership-only explanation and tap **OKX Wallet에서 확인**. The same tap requests ownership and reopens OKX. If the app did not open, use the explicitly labelled reopen recovery; personally inspect/sign the ownership-only challenge, then return. No Permit/Intent or trade request should appear.
- [ ] 9. Send `/wallet` again and compare the **same verified address** with OKX Wallet. The Mini App must remain read-only.

**Failure conditions:** OKX Exchange home with no connection prompt; MetaMask opens; a same-device QR appears; wrong wallet address returned; Telegram authentication/session lost. Also fail if a download page replaces approval, manual Exchange → Web3 navigation is needed, or any financial authorization appears. Do not mark passed because an app merely opens. Record OS, Telegram and OKX versions and a safe error code; never share the QR, connection link, signature or Telegram credentials.

### OKX Desktop Acceptance

- [ ] Open fresh `/wallet` on native Telegram Desktop → 지갑 연결 → OKX Wallet. Require **exactly one** OKX-labelled QR generated from the SDK connection link and no local wallet launch. Scan using OKX Wallet's **Web3 scanner**, approve connection, then read the explanation and press **OKX Wallet에서 확인** on the desktop. Personally review/sign the ownership-only request in OKX. Require the matching verified address in the original desktop Mini App and `/wallet`. No competing Reown QR, MetaMask prompt or Telegram redirect on the scanning phone. Do not share the QR/link.
- [ ] Cancel an unapproved MetaMask attempt, select OKX and repeat the relevant connection test. Require a fresh attempt; an old/cancelled approval cannot link or replace it. Do not approve an unwanted old request merely to test this.

These boxes are deliberately unchecked. No real OKX approval/signature was performed by the agent.

Use one dedicated Sepolia EOA and one allowlisted Telegram tester. Execution stays **false** throughout A–E. Do not buy assets. Do not share tokens, private keys, seed phrases, initData, cookies or signatures. No wallet approvals or transactions have been performed by the agent.

Record locally: date/time ______; Git revision/local changes ______; Node version ______; Telegram client/version ______; wallet/version ______; public origin ______; tested amount ______. Public addresses and transaction hashes are optional evidence; do not include credentials.

## A. Build

One `npm run dev:live` performs all four checks below. You do not need separate setup terminals or commands. It always forces execution OFF; a missing Reown ID leaves the page available but blocks wallet readiness.

- [ ] **Tests.** How to test: observe the launcher's `✓ Tests` result; a failing test stops live setup. The Phase 4 baseline was 140, the prior setup baseline 159; current results are in STATUS.md.
- [ ] **Typecheck.** How to test: observe `✓ Typecheck` from the same launch.
- [ ] **Build.** How to test: observe the app and signing-page build checks from the same launch.
- [ ] **Full preflight.** How to test: require `READY FOR TELEGRAM WALLET TEST` with every prerequisite passing. Missing Reown must first be resolved. Execution OFF is expected. Detailed `wallet:preflight` remains available to developers and automatically uses the active runtime origin; `--offline` does not satisfy this box.

## B. Telegram

- [ ] **`/start`.** How to test: open a private chat with your own development bot, send `/start`, and confirm the Korean introduction and test/read-only explanation.
- [ ] **`/markets`.** How to test: request markets and open a listed pair; verify real symbols appear or a clear temporary API error appears. An error must be resolved before marking success.
- [ ] **`/rate`.** How to test: select USDC and XSGD; check direction, rate label and retrieval time. Reference information must not be presented as guaranteed execution.
- [ ] **`/quote`.** How to test: select USDC → XSGD and an amount such as 5 test USDC. Confirm the amount, validity time and rate/minimum-output labels; an unavailable quote is not a successful trade preparation.
- [ ] **`/liquidity`.** How to test: select the pair; check sampled executable sizes or the honest no-liquidity result. It must not claim a complete order book.
- [ ] **`/alpha`.** How to test: open the feed; each card must explain its signal and last check. An honest empty/warming feed is acceptable; no fabricated profit claim.
- [ ] **Create and delete an alert.** How to test: `/alert` → pair → condition → review → confirm, then `/alerts`. Delete that alert with `/deletealert`; confirm it disappears. No alert should exist before your confirmation.
- [ ] **Fresh quote continuation.** How to test: use an alert/alpha latest-quote button if a real card exists, or the quote refresh flow twice. Check a new retrieval/expiry; price need not change. Do not fabricate a trigger to complete this item; record unavailable entry points as pending.
- [ ] **`/wallet` and `/balance` before connection.** How to test: confirm your own numeric Telegram ID appears and the bot asks for wallet verification without exposing any other user's balance.
- [ ] **Disabled `/swap`.** How to test: keep execution false, choose its quote-preparation path and open the Mini App. It must state that execution is disabled and offer no financial confirmation/sign/submit button.
- [ ] **English option.** How to test: switch `/language`, repeat `/wallet` and `/swap`, then return to Korean. Safety/errors must remain understandable in both languages.

## C. Mini App

- [ ] **Opens from Telegram.** How to test: while dev:live is running, use a fresh private-chat wallet button in a native Telegram client. It carries the current automatic HTTPS origin; do not copy a tunnel URL into .env. Do not use a pasted external-browser link for authentication.
- [ ] **Telegram identity verified.** How to test: expand **연결 정보 / Connection details** and compare the authenticated Telegram ID with `/wallet`. They must match exactly; reject unexpected identity.
- [ ] **Session created.** How to test: find a safe terminal diagnostic with `TG_SESSION_CREATED`, then `MINI_APP_OPENED`; it contains a timestamp and redacted reference, never initData or credentials.
- [ ] **Invalid/expired authentication is safe.** How to test: open the bare URL in an external browser; it must request Telegram launch and offer no authenticated wallet actions. If an old native session expires/replays, close it and open a fresh bot button; record the safe code and successful recovery.
- [ ] **Client coverage recorded.** How to test: record exactly the native Desktop/Android/iOS client used. If you test another, record it separately. Do not mark Telegram Web or other clients tested by inference.

## D. Wallet

- [ ] **Cancelled connection recovers.** How to test: press Connect Wallet, cancel, check the cancellation message and unlinked `/wallet`, then retry. No Permit or Intent request should appear.
- [ ] **Wallet connects.** How to test: select your dedicated external test EOA, approve the connection in that wallet and return to Telegram. Confirm `WALLET_CONNECTED` in safe diagnostics.
- [ ] **Sepolia verified / wrong chain recovers.** How to test: with execution OFF, connect on a different network and require rejection. Use the explicit Sepolia switch button or switch manually, reconnect, and verify chain 11155111. No financial signing occurs on either network during this test.
- [ ] **Cancelled ownership proof stays unlinked.** How to test: decline the ownership challenge; `/wallet` must stay unlinked. Connect again and obtain a new challenge.
- [ ] **Ownership signature works.** How to test: read the ownership-only message (origin, Sepolia, purpose, expiry), approve it yourself, and check `OWNERSHIP_VERIFIED`. This is not token-use or trade authorization.
- [ ] **Wallet app return works.** How to test: on mobile, approve ownership, return to Telegram and check the verified address. `WALLET_RETURNED` records visibility only; it does not substitute for successful backend verification. Mark N/A with reason if no app switch was involved.
- [ ] **`/wallet` address correct.** How to test: compare its full address with the wallet app. Only one linked EOA should appear. Smart/delegated wallets must fail cleanly if tried; no alternative signing path is supported.
- [ ] **`/balance` correct.** How to test: compare the actual wallet USDC/XSGD balances with the exact contract addresses in [supported test tokens](#obtain-the-exact-supported-test-tokens). Zero is valid before funding. There must be no fictitious Vault balance. An RPC failure must show a safe error, not a zero balance.
- [ ] **Disconnect invalidates the session.** How to test: disconnect, try balance/old preparation and require wallet verification again. Reconnect before proceeding. A previous ownership challenge cannot be reused; protocol replay rejection is also covered by automated tests.

## E. Trade Preparation

- [ ] **Supported test funds available.** How to test: follow [supported test tokens](#obtain-the-exact-supported-test-tokens) and personally claim the official faucet tokens if needed. Confirm receipt success and a positive exact-contract USDC wallet balance. Public stock/simulation checks do not mark this box complete.
- [ ] **Fresh wallet-specific quote.** How to test: with execution OFF and verified wallet, start USDC → XSGD preparation, then press the Mini App's fresh quote button. Try 5 test USDC only if live liquidity supports it; never exceed the configured ceiling. Check there are no financial consent buttons.
- [ ] **Review terms correct.** How to test: compare Sepolia, input, same-wallet recipient, minimum output, rate, costs/unknown-cost explanation and actual expiry. The output is a protocol minimum, not a guaranteed price or independently estimated fill. Two future financial approvals must be explained before execution is enabled.
- [ ] **Expiry handled.** How to test: leave a read-only preview until its displayed expiry/safety cutoff. Require an expired/new-review message, then explicitly request a fresh quote. No automatic refresh or signing.
- [ ] **Only the intended tester is allowlisted.** How to test: compare `/wallet` ID with the sole `EXECUTION_USER_IDS` entry in your local `.env`, then rerun full preflight. Do not paste `.env` into a report.
- [ ] **Owner's read-only gate complete.** How to test: review A–E together, resolve every relevant failure and record completion time ______. If any prerequisite is missing, execution stays OFF and F–G remain pending.

## F. Execution

**Deferred to a later owner-authorized session, after A–E pass.** The current setup task stops before wallet approval. `dev:live` always disables execution, even if `.env` says true, and cannot perform this section. A later transaction session must use the ordinary runtime with a stable HTTPS origin and the existing owner gates. One small authorized test swap is the target; a faucet claim is a separate funding transaction.

- [ ] **Execution manually enabled.** How to test: only in that later authorized session and after the gate, personally configure the existing execution flag/ordinary runtime, rerun preflight and open a new Mini App session. Verify the enabled banner. Never try to enable execution through dev:live; no program changes your .env flag.
- [ ] **Allowlist enforced.** How to test: the intended user can prepare a final review; an unlisted Telegram test profile, if available, gets `NOT_ALLOWLISTED` before financial authorization. Never add that profile to the allowlist or fund it for this check. Automated rejection tests do not imply a second profile was live tested.
- [ ] **New final review and explicit consent.** How to test: fetch a NEW wallet-specific quote, compare every field with E, tick the confirmation and press continue. A preview from execution-OFF mode must not become a signable trade.
- [ ] **Permit reviewed.** How to test: personally inspect token, owner, live SOR spender, exact raw input value, nonce and deadline in the wallet before approving token-use authorization. It is an exact-value Permit, not an unlimited approval.
- [ ] **Intent reviewed.** How to test: personally inspect Sepolia/Sera domain, same taker/recipient, tokens, maximum input, minimum output, UUID and deadline before approving the separate Intent. Cancel on unexpected or expired terms.
- [ ] **Submission occurs once.** How to test: after both approvals, press submit once. Require the SUBMITTING screen and a single trade entry. Do not retry after an ambiguous response; a developer can compare redacted operation logs and the single durable attempt record without receiving signatures.
- [ ] **Pending state shown.** How to test: on accepted submission, check the distinct message saying Sera accepted the request but settlement is not yet confirmed. If the response is ambiguous, UNKNOWN is correct and G must resolve it without resubmission.

## G. Settlement

- [ ] **Actual final status found.** How to test: press “상태 다시 확인” in the Mini App or `/wallet`, or wait for the worker. This only reads existing submission evidence and respects polling backoff; it never starts a swap. Record the final state, or leave pending if unresolved.
- [ ] **Matching swap evidence verified.** How to test: inspect the returned Sepolia explorer receipt and compare SOR IntentMatched evidence, exact Intent identity, tokens, recipient and transfers with the final review. The backend requires a canonical successful finalized receipt; a successful unrelated transaction is insufficient.
- [ ] **Transaction hash correct.** How to test: match the UI's hash to the explorer URL and successful receipt. A Sera trade ID or accepted HTTP response alone is insufficient.
- [ ] **Completed only after verification.** How to test: require CONFIRMED with actual input/output, Intent/trade ID, Sepolia hash and verified explorer button. Until that evidence exists, leave completion unchecked. Record receipt/hash and time locally ______.
- [ ] **UNKNOWN remains non-retrying.** How to test: if a real UNKNOWN occurs, use only status refresh and observe no new wallet approvals, submission or second trade entry. Never create an ambiguous live submission deliberately. If it does not occur, record NOT OBSERVED; its automated regression remains separate.

## H. Safety

- [ ] **Double click does not duplicate.** How to test: when performing the single authorized F submission, repeated clicking of that same button must be disabled/ignored and leave one attempt. Do not create a second trade for this test; durable double-click/restart cases also have automated coverage.
- [ ] **Expired final quote cannot submit.** How to test: before the authorized swap, let an enabled final review expire without approving financial requests; require disabled authorization and a fresh-review action. Obtain a completely new review for F; old signatures must never carry over.
- [ ] **Wrong chain rejected.** How to test: rely on D's explicit switch/recovery check and, before any financial approval, confirm Sepolia again. A later wallet/account change must clear unsubmitted authorization.
- [ ] **Cancelled/disconnected trade cannot continue.** How to test: cancel a preparation or disconnect before financial approval, then try its old controls; require a new wallet proof/review. Do not test by approving or submitting another swap.
- [ ] **Execution disabled again.** How to test: after the single submission (including pending/unknown), personally restore `ENABLE_TESTNET_EXECUTION=false`, restart, reopen and confirm the read-only banner. Keep the worker/readonly status checks available; never reset/delete an UNKNOWN attempt to trade again.
- [ ] **Secrets absent from logs.** How to test: inspect terminal diagnostics locally. They may contain timestamp, safe code, operation and redacted references; they must not contain keys, tokens, authenticated initData, cookie/session values, wallet signatures or secret URLs. Stop and report a code if that fails; never forward the leaked value.

If a test fails, send the **safe error code and the corresponding redacted terminal log line** to the developer, plus the checklist item and native client/wallet version. Do not send `.env`, request bodies or wallet approvals. Keep any unresolved box unchecked and execution OFF.

## Growth Analytics

Phase 6. All boxes below require the owner's actual Telegram checks; automated fixtures do not mark them passed. `/stats` defaults to the configured owner and excludes that owner from Growth through the existing local allowlist fallback. Zero public-user counts are correct until non-excluded activity exists. No trade is needed or authorized for this checklist. Safe trigger fixtures run in isolated test databases, never by mutating the live financial state.

- [ ] Open https://t.me/world_fx_alert_bot?start=x_test and use the bot's Start action.
- [ ] First valid touch is recorded locally; an authorized non-excluded test cohort appears under the source report. Do not publish a user's raw ID/event history to verify this.
- [ ] Start again from another source/direct and verify first touch remains unchanged; latest touch may update.
- [ ] `/alpha` exploration appears in stats for non-excluded test users.
- [ ] Explicitly create an alert; stats separates setup from successful creation and users from events.
- [ ] Observe an actual condition trigger or use isolated safe test tooling; trigger/acknowledged delivery counts remain distinct. Never invent a live completion.
- [ ] Fresh quote from the exact notification appears in the linked funnel. Alpha quote followed by its card's alert appears in the separate discovery funnel.
- [ ] A Korean NLU request appears as aggregate intent usage without its message body.
- [ ] Excluded owner/tester activity is omitted consistently from all Growth reports while normal functionality remains available.
- [ ] An unauthorized Telegram profile cannot view `/stats` or its callback screens; claiming an owner ID in text cannot grant access.
- [ ] Today/7/30 days, Sources and Funnel are understandable; no private user/wallet/auth data is visible. Check saved English preference separately if used.

Keep execution and mainnet OFF. Completion must stay zero unless an already authorized transaction has independently reached the established verified settlement state; this phase does not authorize such a transaction. Stop before Phase 7.

## Configuration and runtime reference

Detailed setup and operating instructions formerly embedded in README. Existing acceptance checkboxes remain separate regression checks; successful mobile connection does not complete every safety/UX case. Keep execution and mainnet OFF.

## Telegram runtime
Use the single launcher above and your own BotFather setup.

The MVP uses long polling and one process per token. An existing webhook causes startup to fail; the bot does not remove webhooks or drop pending updates. A webhook deployment requires a separately implemented authenticated endpoint.

Acquisition deep links: https://t.me/world_fx_alert_bot?start=community_a and https://t.me/world_fx_alert_bot?start=telegram_group_a.
First valid touch is immutable; latest touch may update. Sources are lowercase ASCII letters/digits/underscore/hyphen, maximum 48 characters; invalid payloads become unknown and no payload means direct. Existing legacy first source is preserved. This is attribution only, with no referral rewards. See [Growth analytics](GROWTH_ANALYTICS.md).

## Recommended BotFather metadata

These are copy recommendations for the owner to apply manually. Apply these recommendations manually in BotFather. The copy is kept conservatively short; no unverified field limit is assumed.

**Username:** `@world_fx_alert_bot`
**Name:** `FX Alert Bot`

**Short description / About — Korean**

> 환율을 확인하고 원하는 FX 조건이 오면 Telegram으로 알려주는 FX 모니터링 봇.

**Short description / About — English**

> Monitor FX markets, set personal rate alerts, and check fresh quotes from Telegram.

**Description — Korean**

> FX 시장을 확인하고 목표 환율·시장 움직임·거래 가능 조건을 알림으로 받아보세요.
>
> 자동 거래 없이, 알림 → 최신 Quote → 직접 확인하는 방식으로 동작합니다.
>
> Powered by Sera Protocol.

**Description — English**

> Explore FX markets and get alerts for target rates, market movements and quoted trade sizes.
>
> Alert → fresh quote → your review. No automatic trading.
>
> Powered by Sera Protocol.

Keep the short text in the compact About/short-description field and the longer text in Description. Command descriptions are defined locally in `src/index.ts`; the existing startup registration behavior is unchanged. A running process needs a normal restart to load the new bot copy; do not run a second polling process for the same token.

## Environment
| Variable | Default | Meaning |
|---|---|---|
| TELEGRAM_BOT_TOKEN | empty | Required for live Telegram; not needed for API smoke or tests |
| SERA_REFERRAL_URL | empty | Optional owner-supplied attribution URL, reserved for documentation/footer use; no runtime referral UI or transaction attribution change |
| SERA_NETWORK | sepolia | Sepolia only; mainnet is rejected |
| ENABLE_MAINNET | false | Must remain false; true is rejected |
| ENABLE_TESTNET_EXECUTION | false | Owner-controlled Sepolia switch; also requires setup and per-user allowlist |
| DATABASE_PATH | ./data/bot.sqlite | SQLite file; automatically initialized |
| SERA_REQUEST_INTERVAL_MS | 500 | Minimum API request-start spacing, at least 250 ms |
| SERA_TIMEOUT_MS | 15000 | Request timeout, bounded to 30 seconds |
| SERA_RETRIES | 2 | GET retries for 429/503; no quote POST retries |
| SERA_MAX_RETRY_WAIT_MS | 2000 | Maximum inline retry wait; longer server delays fail promptly and block subsequent requests until Retry-After |
| SERA_RATE_CACHE_MS | 10000 | Reference FX cache; source timestamp remains visible |
| SERA_REFERENCE_MAX_AGE_SECONDS | 900 | Stale reference warning |
| LIQUIDITY_PROBE_SIZES | 100,1000,10000 | Up to five source-token sizes, not dollar notionals |
| CONVERSATION_TTL_SECONDS | 900 | Wizard and refresh-intent TTL |
| MARKET_POLL_INTERVAL_SECONDS | 60 | Delay after a monitoring cycle finishes; minimum 60, maximum 3600 |
| MARKET_POLL_INTERVAL_MS | unset | Legacy fallback (60000–3600000); explicit seconds setting takes precedence |
| ALERT_COOLDOWN_SECONDS | 3600 | Per-alert minimum time between triggers; minimum 60 |
| ALERT_MAX_GROUPS_PER_CYCLE | 10 | Maximum unique pair/direction/amount probes per cycle; maximum 20 |
| ALERT_MAX_PER_USER | 20 | Maximum saved alerts per user |
| ALERT_MAX_TOTAL | 500 | Maximum saved alerts for this single instance |
| ALERT_BASELINE_TOLERANCE_SECONDS | 300 | Historical sample tolerance, further capped at 10% of the requested window |
| ALERT_OBSERVATION_RETENTION_HOURS | 72 | Shared observation retention; minimum 26 hours to cover the 24h window |
| ALERT_NOTIFICATION_TTL_SECONDS | 900 | Expire undelivered notifications after this age |
| ALPHA_ENABLED | true | Add configured discovery probes to the existing monitor; false disables /alpha and its background jobs |
| ALPHA_PROBES | USDC/XSGD:100,USDC/EURC:100,XIDR/USDT:1000000 | Directed pair:source-token-amount entries; 1–12, no duplicates; symbols/pairs and token precision/minimum are checked against the live registry |
| ALPHA_MAX_RESULTS | 12 | Maximum distinct directed pairs in a feed; 1–12; pages show 3 cards |
| ALPHA_DATA_MAX_AGE_SECONDS | 180 | Maximum age of a displayed observation; 30–900; also maximum gap between samples establishing recovery |
| ALPHA_MOVEMENT_1H_PCT | 0.5 | Absolute 1-hour movement display threshold (%) |
| ALPHA_MOVEMENT_6H_PCT | 1 | Absolute 6-hour movement display threshold (%) |
| ALPHA_MOVEMENT_24H_PCT | 2 | Absolute 24-hour movement display threshold (%) |
| ALPHA_RECOVERY_MAX_AGE_SECONDS | 900 | Recovery visibility window, 60–86400 seconds; current observation must independently be fresh |

Scanner movement thresholds must be positive plain decimals ≤100. The defaults are conservative display filters, not recommended trading thresholds. Probe amounts are token units, not comparable dollar notionals. Change .env and restart to apply settings. No probe is automatically resized when it violates a token minimum.

No Sera API key or private key is needed for these read-only features. Later account functions require wallet-specific authorization; an operator's Sera credentials must never be reused for every Telegram user.

## Database and privacy
On startup the version 1 migration creates users, conversations, quote_intents and schema_migrations. Version 2 adds alerts, market_observations, alert_triggers and delivery_outbox. Version 3 adds scanner_probes: at most 12 configured public probe summaries, with resolved pair/amount, last attempt/error, last observed availability/time and recovery time. Existing records are preserved. Back up an existing database before the first upgraded startup.
Stored information: Telegram operational user ID, language, existing first source, created/last-seen timestamps, expiring token selections, amount/pair settings, alert conditions, evaluation state, cooldown and trigger/delivery history. Scanner summaries contain no user IDs or personal thresholds. They reuse market_observations for history and quote_intents for user-owned result buttons. Migration 6 adds local aggregate analytics and normalized attribution; see [Growth analytics](GROWTH_ANALYTICS.md).
No usernames, personal names, phone numbers, location, message history, raw private keys, signatures or Sera API secrets are stored.
Telegram still stores chat messages. /forget requires a fresh confirmation and deletes the user's stored bot records, including conversations, quote intents, alerts, triggers, terminal trade records and pending deliveries. It is blocked while a submitted/unknown trade still needs reconciliation; disconnect remains available. /deletealert also cancels dependent pending deliveries. A send already in flight cannot be recalled. Financial migration and backup evidence are documented in [STATUS.md](STATUS.md#11-database-and-secrets).
Market observations are shared and contain no Telegram IDs. The monitor prunes them after 72 hours by default and removes terminal trigger/delivery history after 30 days. Active alerts remain until deleted. Failed/expired delivery status is visible in /alerts. Logs contain random operational record IDs; restrict access and rotate logs at the host.
Expired conversations are removed on access; expired quote intents are removed when new ones are saved. Stored quote-button intentions are not executed and have separate TTLs from live quote expiry.
Restrict data-directory permissions. Use SQLite's online backup tool or stop the process before copying the database; an active WAL database must not be backed up by copying only its main file.

## Testing Alerts Locally
1. Open PowerShell and run `cd fx-alert-bot`. Install Node 24 first if necessary. Run `npm ci`. Keep your existing `.env`; if absent, run `Copy-Item .env.example .env`. Edit only this project's `.env` and put your own BotFather token in `TELEGRAM_BOT_TOKEN`. Keep `SERA_NETWORK=sepolia`, `ENABLE_MAINNET=false` and `ENABLE_TESTNET_EXECUTION=false`.
2. Keep `MARKET_POLL_INTERVAL_SECONDS=60`. For a shorter testing cooldown you may set `ALERT_COOLDOWN_SECONDS=60` (normal default: 3600). Run `npm run build`, then `npm start`, and leave that terminal open. If HTTPS fails on this Windows machine, run `$env:NODE_OPTIONS='--use-system-ca'` before startup; never disable certificate verification. Existing databases upgrade automatically; no SQL commands are needed.
3. Open your bot in a **private** Telegram chat. Send `/start`, then `/alert`. Select **USDC → XSGD**, **목표 환율 이상**, then enter **100**. This pair had quotes during testing; current testnet liquidity may differ. The bot shows the current amount-specific rate before asking for the target.
4. Choose a target slightly **above** that live rate so the condition starts unmet. For example, if the screen shows `1 USDC = 1.2500 XSGD`, try `1.2501` or about 0.01% higher. These are illustrative numbers, not live prices. For **목표 환율 이하**, choose a slightly lower target. Check the final pair, amount, direction and target; press **알림 만들기**. If the preview is already beyond your target, cancel and choose a new target. An already-met condition will not send an immediate notification.
5. Send `/alerts`. Check the saved condition, last check time and state. **최신 상태** checks the current quote without changing trigger state. Keep the bot running. A push requires a real observed crossing; prices may not cross during the test, and polling can miss brief movements. Creating an already-satisfied alert is not a shortcut to a trigger.
6. When **🔔 설정한 FX 조건에 도달했어요** arrives, check the reason and `1 BASE = X QUOTE` direction. Press **최신 Quote 확인**, then press it again. Each press makes a new Sera request; the new fetch time/expiry should update even if the rate stays identical. The response includes **알림이 발생한 이후 시장 상황이 변했을 수 있어 최신 Quote를 다시 조회했습니다.** No signature prompt or trade execution should appear. Before a crossing, the same retrieval can be checked through `/alerts` → **최신 상태** → **최신 Quote 확인**.
7. Send `/deletealert` (or `/alerts`), press the desired alert's **삭제**, and confirm. Run `/alerts` again. The deleted alert is gone and old alert-specific buttons no longer work. Existing independent Phase 1 quote-refresh intents expire normally.
8. Use `/language` → **English** and repeat setup/list/delete to check English. Stop with Ctrl+C and restart with `npm start`; language and active alerts persist. Movement alerts need actual 1/6/24-hour history before evaluation. Size/recovery alerts need an observed no-quote → valid-quote transition.
9. Inspect the startup terminal for JSON events: `monitor_cycle`, `alert_triggered` (reason and timestamp), `alert_delivered`, `alert_delivery_failed`, `market_observation_failed`. For a saved local log, use `npm start 2>&1 | Tee-Object -FilePath bot.log`. Docker users can run `docker compose logs -f`. Logs do not include private keys, token URLs, message text or raw API responses.

For deterministic crossing/error/restart testing without waiting for a market move, run `npm test`; it mocks both external services. For real Sera reads without a Telegram token run `npm run alerts:smoke` (on this Windows machine: `node --use-system-ca --import tsx scripts/alerts-smoke.ts`). The smoke script uses synthetic users in an in-memory database and cannot send Telegram messages. Neither is a claim of live Telegram acceptance.

## Testing `/alpha` Locally

1. Open the project in PowerShell: `cd fx-alert-bot`. Keep the existing .env and database. Set your dedicated BotFather token locally if it is not configured. Do not paste it into chat.
2. Keep SERA_NETWORK=sepolia, ENABLE_MAINNET=false and ENABLE_TESTNET_EXECUTION=false. The defaults in .env.example enable ALPHA_ENABLED=true and the three sample pairs. Existing .env files inherit these defaults without being overwritten.
3. Run npm ci, npm run build, then npm start. On this Windows machine, set $env:NODE_OPTIONS='--use-system-ca' first if HTTPS certificate verification fails. Leave the terminal running.
4. In your bot's private Telegram chat, send /start, then /alpha. If it is still collecting data, wait about 60–90 seconds and try again. Two of the default samples had quotes in the live check; future testnet availability may differ. An empty or partial result is valid behavior.
5. Check each card's direction, amount, reason and last-check timestamp. Fresh quote-availability cards need no long history. Leave the process running for 1/6/24 hours to build movement history. Do not expect movement or recovery to appear unless real observations meet the criteria.
6. Press a numbered **최신 Quote 확인** button twice. Check the new retrieval time and expiry; the rate may stay the same. You should see the market-change sentence, with no trade/signature button.
7. Return to /alpha and press **알림 설정**. For movement, enter your own percentage and choose a window. Review the pair, amount and condition, then press **알림 만들기**. Verify it with /alerts. Before confirmation, no subscription should exist. Manage or delete it through the existing commands.
8. Press **시장 보기** to open the existing markets list. If more than three distinct pairs qualify, use 이전/다음; the feed intentionally sends one message per page. Switch /language to English and repeat.
9. For a restart check, stop with Ctrl+C and start again. Existing alerts, language and scanner summaries persist; old scanner samples expire normally. After downtime, history gaps are not fabricated into a recovery.
10. Watch terminal JSON logs: monitor_cycle, scanner_catalog_failed, scanner_probe_invalid and market_observation_failed. Use npm start 2>&1 | Tee-Object -FilePath bot.log to keep a local log. /alpha reads should not generate new monitor cycles or quote probes.

For deterministic threshold/ranking/error tests without waiting on real prices, run npm test. For a small real Sera check without Telegram credentials, run npm run scanner:smoke (on this Windows machine: node --use-system-ca --import tsx scripts/scanner-smoke.ts). It uses an in-memory database, never fabricates history and sends no Telegram messages. Mocked tests and this read-only smoke do **not** constitute live Telegram acceptance.

## Deploy
Use one persistent Node 24 process on a VPS/container with a persistent writable data volume and platform-managed secret injection.
Run npm ci, npm run build, npm start under a process supervisor with graceful SIGTERM. Keep outbound HTTPS access to Telegram and Sera available.
A [Dockerfile](Dockerfile) and [compose.yaml](compose.yaml) provide a single polling-instance recipe. Set your token in .env then:
```bash
docker compose up --build -d
docker compose logs -f
```
The named volume preserves SQLite and the container runs as the node user. Docker recipes require local deployment validation; do not claim they are deployed.
Do not use ephemeral serverless storage for SQLite or run multiple replicas against this polling token. PostgreSQL/shared worker leases and budget coordination come before horizontal scaling.
No cloud resources, public endpoint, Telegram webhook or production deployment is created by this repository.

## Live acceptance setup

Use [README quick setup](README.md#install). The following is the detailed runbook; none of it authorizes enabling execution during documentation work.

### Launcher behavior

`dev:live` preserves `.env`. It runs the test/typecheck/build gates, finds cloudflared on PATH/in Downloads, or downloads the official Windows executable into ignored `.dev-live/bin` and verifies GitHub's SHA-256 release digest. Optional `CLOUDFLARED_PATH` selects an existing executable; normally leave it unset.

A 503 bootstrap listener reserves the local signing port while Cloudflare obtains a URL. The launcher then replaces it with the real app using that URL. Telegram starts only with the real origin. The app listens on 127.0.0.1:8787, or configured SIGNING_PORT. No bootstrap page authenticates or performs wallet actions.

The origin, launcher PID and port are stored in ignored `.dev-live/session.json`, with no credentials. The old temporary SIGNING_ORIGIN in `.env` remains untouched but is overridden at runtime. `wallet:preflight` automatically uses the active launcher. Normal shutdown removes its state/lock; dead-process state is ignored/recovered. Temporary URLs are never committed.

Cloudflare receives only a minimal system/network environment, not bot credentials. Its separate generated config leaves the user's `~/.cloudflared` files untouched. Protocol selection is **auto**: forced HTTP/2 failed on this connection; automatic selection registered the edge and passed public HTTPS. Debug/header logging and self-updates are disabled. [Quick Tunnel documentation](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/).

Only spawned children are managed. Interactive Ctrl+C drains the bot through private process IPC and closes the tunnel. Unrelated processes are never killed by name. The HTTP server has no shutdown or authentication-bypass endpoint. A second launcher is blocked by a repository-local lock.

### Readiness and developer troubleshooting

The owner command shows one compact checklist. A missing Reown ID is an owner gate, not a broken signing server. Detailed diagnostics remain available with `npm run wallet:preflight`, using the system CA store automatically. Execution-OFF WARN is expected; `--offline` does not satisfy live acceptance.

Developer-only `npm run dev:live -- --check` runs startup/probes and then closes its children. It returns nonzero for missing prerequisites. Normal `dev:live` stays open and reloads after a saved Project ID. Do not run another polling instance for the same bot token.

| Result | Action |
|---|---|
| REOWN_PROJECT — HUMAN ACTION REQUIRED | Owner creates a dedicated development project and saves its Project ID once |
| HTTPS_ORIGIN / HTTPS_READ / WEB_BUILD / DATABASE — AUTO-FIXABLE | The launcher starts/builds/checks these; report the code if its bounded checks still fail |
| TUNNEL_NETWORK / TUNNEL_TLS / TUNNEL_CONNECT | Safe connection diagnostics; do not disable TLS. Service/network failures can still block a tunnel |
| CLOUDFLARED_DOWNLOAD | Retry with official GitHub downloads reachable; unverified binaries are not executed |
| LIVE_RUNNING / PORT_BUSY | Use the existing launcher; a developer identifies any older manual process |
| TESTS_FAILED / TYPECHECK_FAILED / BUILD_FAILED | Developer repairs the failing check before live startup |
| TG_READ / RPC_READ / SERA_READ | Check the dedicated bot/provider/service without sharing credentials |

When no launcher is running, preflight checks saved configuration; an expired manual origin may fail. `dev:live` obtains a fresh runtime origin automatically. A fresh developer checkout needs Node 24 and `npm install` once.

Keep the configured Sepolia RPC. The verified public option is `https://ethereum-sepolia-rpc.publicnode.com`; no provider account is necessary to begin. Sera is selected internally at `https://api.testnet.sera.cx/api/v1`. No Sera operator API key, server signer or static session/encryption secret is needed.

### Test Telegram, Mini App and wallet without financial authorization

Follow ACCEPTANCE.md sections B–D: /start, /markets, /rate, /quote, /liquidity, /alpha, alert create/delete, /wallet, /balance and disabled /swap.

The Mini App must show **조회 모드 · 거래 실행 꺼짐 / Read-only · Trading is off** (Korean by default) and the Telegram connection acknowledgement. Expand **연결 정보 / Connection details** to compare your own authenticated Telegram ID. The backend verified that identity. Disabled /swap offers quote preparation; its read-only preview has no financial confirmation/sign/submit buttons.

Use a dedicated plain **EOA test wallet** in OKX Wallet or MetaMask. Choose Sepolia. Smart/delegated-code wallets are rejected. Press Connect Wallet and explicitly choose the wallet. Native Telegram mobile offers a selected-wallet continuation button; desktop offers a QR to scan inside that wallet. Approve only connection, return to the original Mini App, read the ownership explanation, then press **지갑에서 확인 / Verify in wallet**. If needed, use the selected-wallet button again to review the ownership request. No Permit/Intent appears during connection. Cancel/choose another wallet creates a fresh isolated attempt. On a wrong chain, select Sepolia in the wallet or use the existing switch action under connection details before ownership. No Telegram authentication credentials are carried in wallet/Telegram links. The Mini App supports Telegram light/dark themes and shows the full verified address on demand; balance reads do not replace the wallet card.

Compare /wallet to your exact wallet address, then check /balance. These are actual wallet USDC/XSGD balances, including zero; no Vault balance is fabricated. Disconnect invalidates local unsubmitted authorizations, but cannot revoke allowances/signed permits or undo submitted swaps. A new Mini App session needs ownership verification again. Reloaded Telegram initialization may show AUTH_REPLAY; close and reopen with a fresh private-chat bot button.

Telegram mobile + OKX connection and ownership verification were successfully tested. Telegram Desktop and MetaMask real-device flows remain unverified. Telegram Web's cross-site iframe/cookie behavior is not a supported acceptance claim; use a native client. A raw external-browser link is deliberately unauthenticated. WALLET_RETURNED only means the page became visible while a wallet request was pending; it does not prove a signature succeeded.

### Obtain the exact supported test tokens

The official [Sera quickstart](https://docs.testnet.sera.cx/quickstart/) links this [verified Sepolia faucet contract](https://sepolia.etherscan.io/address/0x4FAc3BB8B77547E2Da7ed903baDBeD2f46cBe65a#code), **IssueTestTokenV3**. Its public claim() function sends test assets to the calling wallet once per claim epoch. It is not admin-only. The official site also links [app.testnet.sera.cx](https://app.testnet.sera.cx/), whose wallet page requires sign-in for token claims; that signed-in path was not tested.

**LIVE READ-ONLY CHECKED on 2026-09-17 KST:** the faucet list contains our exact USDC/XSGD and sufficient stock for its configured claim. A public-address eth_call simulation of claim() succeeded without changing chain state. This was not a token claim or a check of your eligibility. The current six-decimal-token allocation was 1,000,000,000 mock units each; the bot's 100-test-USDC maximum remains unchanged. Faucet stocks/allocations can change.

To claim yourself:

1. Use the same plain Sepolia test EOA. A **funding claim is a separate wallet-approved transaction** needing some native Sepolia ETH for gas. The bot's later relayed receive_less swap does not ask you to broadcast an ETH-funded swap.
2. If needed, obtain free Sepolia ETH through the faucet linked by Sera's quickstart. Provider eligibility can differ. **Do not buy assets to pass a faucet gate.** If you cannot obtain gas or claim, stop and ask official Sera support through their site for test-funding assistance using your public address only.
3. At the exact Etherscan address above, inspect **Contract → Read Contract**: getTokens, claimAmount and hasClaimed with your address. A true hasClaimed means another ordinary claim cannot be made in the current epoch.
4. If eligible and funded for gas, choose **Contract → Write Contract → Connect to Web3** with that test EOA. Review and invoke **claim with no arguments** yourself. Do not select admin/reset functions or a different recipient. Confirm this funding transaction only in your wallet.
5. After its receipt, use our /balance. Verify USDC at **0x965d4b4546716e416e950bc30467d128455d2d0e** and XSGD at **0x058e06ca2628165a6cd1e80e4dc82203dc0020aa**. Same-symbol tokens at other addresses cannot fund this flow; generic Circle test USDC is not assumed interchangeable.

Insufficient faucet inventory can leave a pending claim. Check balances and seek Sera assistance instead of repeatedly claiming. No funding transaction was performed by the agent. To recheck stock without claiming:

~~~powershell
npm run funding:smoke
~~~

The single pair remains **USDC → XSGD**. Phase 7D's complete matrix selected **2 test USDC** as the smallest successful tested amount; 1 USDC failed. This supersedes the earlier five-USDC sample, not the runtime cap. It is not a permanent minimum or liquidity guarantee. Start the manual preview at 2. If unavailable, stop and report the code; the application will not resize it.

### Complete the read-only execution gate

With execution false, use /quote 2 USDC XSGD and continue into the Mini App. Connect/verify first, then press **내 지갑의 최신 Quote 확인**. This fetches a NEW wallet-specific quote with the same verified recipient and the same contract, balance, permit-metadata and amount checks. It returns display terms only, **no signable trade/version**.

Check input, minimum received (not an invented expected output), rate direction, addresses, costs, expiry and the two future Permit/Intent approvals. Wait for expiry, then request a new preview. Quote life is about 30 seconds with a five-second safety cutoff; it is never extended.

**Stop until YOU have verified all prerequisites:** tests, typecheck, build, full live preflight, real Telegram, authenticated Mini App, wallet connection/ownership, Sepolia, exact supported funds, correct /balance, a successful fresh wallet-specific preview and only your ID allowlisted. Record them in ACCEPTANCE.md. Any failed/unchecked prerequisite keeps execution OFF. Automated tests do not fill live boxes.

### Future authorized test swap

Financial authorization remains deferred. **dev:live cannot enable trading.** Only after the full owner gate passes in a later session may the owner explicitly authorize the existing execution workflow through the ordinary runtime (`npm start`), with a stable HTTPS origin and all safety gates satisfied. Keep execution false until that separately authorized session.

Use /swap 2 USDC XSGD or an existing quote/alert/alpha continuation. Obtain a NEW wallet quote; the read-only preview cannot be promoted. Review its current exact terms and confirm. Explicitly approve the exact token-use Permit, then the Sera Intent, then submit **once**. Both financial requests are explained before they start and remain separate from ownership. Cancellation/expiry requires fresh review and signatures.

Expect SUBMITTING, PENDING, CONFIRMED, FAILED or UNKNOWN. Telegram and Mini App **상태 새로 확인** invoke the same owner-scoped read-only reconciliation, respecting polling/backoff; they cannot submit. Only the matching SOR Intent event and finalized canonical successful receipt with valid token amounts produce completion, verified amounts, IDs, actual hash and explorer button. Finalization can take many minutes. Missing evidence remains unresolved, possibly indefinitely, without an automatic retry or timed release.

After this single test, set execution false again and restart. Keep RPC configured to reconcile submissions. Disconnect cannot cancel submitted transactions. Do not delete an UNKNOWN row or reorg quarantine to force another attempt; report it for investigation. Stop the tunnel when you no longer need the Mini App.

### Report failures safely

**If a test fails, send the error code and the terminal log line to the developer.** Include checklist item, Telegram Desktop/Android/iOS version, wallet name and approximate time. Never include initData, cookies, request bodies, signatures, seed phrases, tokens or RPC connection strings. UI/provider errors omit raw stacks.

| Code/check | Recovery |
|---|---|
| TG_CONFIG / TG_READ | Check the local token, polling/webhook compatibility and optional menu URL |
| HTTPS_READ | Run dev:live to manage the bot/tunnel and refresh the runtime origin |
| AUTH_INVALID / AUTH_STALE / AUTH_REPLAY | Reopen from a fresh private-chat bot button; check clock/HTTPS |
| WALLET_CONNECT_CANCELLED | Retry with a fresh wallet selection; for OKX check supported app version/Web3 prompt, for MetaMask check Reown project/origin access |
| OWNERSHIP_REJECTED | Press Connect again for a new ownership challenge |
| NETWORK_MISMATCH | Explicitly switch to Sepolia and reconnect/verify |
| EOA_REQUIRED | Use a plain EOA; smart/delegated wallets are unsupported |
| RPC_UNAVAILABLE / RPC_READ | Check Sepolia RPC and retry reads later |
| INSUFFICIENT_BALANCE | Check exact token address and official funding; do not buy assets |
| NO_LIQUIDITY / UNAVAILABLE | Stop and report; no silent pair/amount changes |
| QUOTE_STALE | Fetch/review new terms, confirm again and obtain new signatures |
| PERMIT_REJECTED / INTENT_REJECTED | Cancelled authorization was not submitted; start with a new quote |
| SUBMISSION_UNKNOWN / UNKNOWN | Refresh reads only; no second submission |
| WALLET_BUSY | Resolve prior trade/quarantine; do not delete its lock |

Safe diagnostic lines contain timestamp, allowlisted operation/code and process-local pseudonymous user/wallet references. No raw user ID, wallet address, session credential or financial signature is logged. Client visibility events are diagnostics, not analytics or authorization. Protect database/log access. /forget leaves backups untouched and is blocked while a submitted trade is unresolved.

### Settings retained for acceptance

| Setting | Default / purpose |
|---|---|
| SIGNING_PORT | 8787; loopback only |
| WALLET_SESSION_SECONDS | 900; range 300–1800; Telegram initialization ≤5 minutes, ownership challenge 2 minutes |
| SETTLEMENT_POLL_SECONDS | 60; range 30–300; two due records/cycle, 2,000 blocks/scan, unresolved backoff ≤5 minutes |
| TEST_USDC_MAX_AMOUNT | 100; can be lowered, never raised past 100 |

MIT and Haruki attribution remain intact. WalletConnect/Reown retain separate community licenses, network/branding requirements and installed commercial-license thresholds of 500 MAU or 2,500,000 monthly RPC calls. Full agreements ship in dist/web/THIRD_PARTY_LICENSES.txt and the signing page's license link. Review vendor terms before expanding.

Mobile OKX connection and ownership proof are verified; this runbook does not establish full UX acceptance, a swap, settlement or production deployment. Keep execution OFF until every relevant acceptance gate passes in a separately authorized session.
