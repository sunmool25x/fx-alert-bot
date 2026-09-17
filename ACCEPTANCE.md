# FX Alert Bot — Owner acceptance checklist

Start with [README: Start Live Testing](README.md#start-live-testing). The owner reports Telegram, Mini App opening and Reown Project ID setup are working. Keep those settings. The launcher manages the tunnel/origin and rebuilds source changes on new launches. Mark a box only after **you perform that check**. Automated tests and public probes are recorded separately in [STATUS.md](STATUS.md); they do not complete phone tests.

## Current scope — Phase 6

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
- [ ] **`/balance` correct.** How to test: compare the actual wallet USDC/XSGD balances with the exact contract addresses in README. Zero is valid before funding. There must be no fictitious Vault balance. An RPC failure must show a safe error, not a zero balance.
- [ ] **Disconnect invalidates the session.** How to test: disconnect, try balance/old preparation and require wallet verification again. Reconnect before proceeding. A previous ownership challenge cannot be reused; protocol replay rejection is also covered by automated tests.

## E. Trade Preparation

- [ ] **Supported test funds available.** How to test: follow README's test-token section and personally claim the official faucet tokens if needed. Confirm receipt success and a positive exact-contract USDC wallet balance. Public stock/simulation checks do not mark this box complete.
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
