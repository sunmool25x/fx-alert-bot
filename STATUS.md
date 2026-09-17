# Implementation status

## Current — public README and verification status, 2026-09-17 KST

Public original repository: [sunmool25x/fx-alert-bot](https://github.com/sunmool25x/fx-alert-bot). GitHub API verification confirms public visibility, `fork=false`, default branch `main`, the configured Sera description and all seven topics including `built-on-sera`. GitHub was connected to Sera Community according to the maintainer's update. The API showed zero stars/forks at this check; external qualification and daily XP sync remain pending/unverified. No +300 XP credit is claimed.

**LIVE TESTED:** Sera read-only markets/rates/quotes; Telegram mobile Mini App launch; official OKX Web3 Wallet handoff and connection; successful backend ownership verification on mobile. **NOT YET LIVE VERIFIED:** MetaMask real-device connection, Telegram Desktop wallet flow, actual Sepolia swap submission and complete settlement. Mainnet and development execution remain OFF. Specific new ownership-tap/UX/recovery cases remain separate unchecked regression items in ACCEPTANCE.md; mobile connection success is not blanket wallet acceptance.

README is a concise product landing page and quick setup guide. Detailed configuration, launcher, funding, deployment, recovery and acceptance instructions now live in ACCEPTANCE.md; API/alert/scanner/NLU reference is in RESEARCH.md; Telegram connector setup is in OKX_CONNECT.md. Growth definitions remain in GROWTH_ANALYTICS.md. No new docs file or fabricated screenshot is introduced. Publication-pending setup wording is removed from the current README; older reports below retain their historical context.

This is documentation only. Hash verification confirms all **146 protected baseline files** remain unchanged: all non-Markdown tracked files and the private `.env`, including every existing test and all wallet/financial behavior. No execution switch, signature, transaction or new development phase is authorized by this update.

Validation: README **634 → 311 lines**; **398/398 tests pass**, with no failures/skips/cancellations; typecheck and build pass. All **74 local Markdown links/anchors** pass, including references into relocated sections; the four unique external README links returned HTTP 200. Source, dependencies, license notices and `.env` were not edited. One meaningful documentation commit is pushed to the existing `main` remote after staged-tree and history secret checks; no history rewrite or extra contribution commits.

## Historical — GitHub publication preparation, 2026-09-17 KST

Prepared target **sunmool25x/fx-alert-bot**, a public original repository. Publication is pending the owner action; no remote writes have been made. The checkout began as a Git repository on master with no commits or remotes. A genuine clean initial commit on main is prepared after validation; no contribution history is fabricated.

Publication changes are documentation, ignore rules, a blank optional referral example and publication-only scripts. All 136 baseline source/web/test/script/dependency/license files and the private `.env` are byte-for-byte unchanged; no financial logic, safety gate or wallet architecture changes. Execution/mainnet remain OFF and no transaction has been submitted. MIT/Haruki attribution and wallet SDK license notices are retained.

Secret audit covers public working tree/index, local credential comparisons, operational wallet/session references and reachable history after commit. Local credentials, four database/backup files and tunnel state remain ignored. Personal checkout paths in README/STATUS were replaced with generic paths. Gitleaks 8.30.1 independently scans the public export and initial history with full value redaction; a research prose false positive was reworded without broad scan exclusions. No real public credential exposure was detected, so no credential rotation or history rewrite is indicated. Isolated test vectors remain; they are not funded/private user keys or signatures.

Fresh index export with no `.env`: **npm install passed; 398/398 tests passed, zero failures/skips/cancellations; typecheck and build passed**. Missing token startup exits safely with a sanitized message before creating a database. The live health check remains Sepolia 11155111, executionEnabled false, connectorReady true.

Prepared metadata includes the built-on-sera topic and a Sera mention in README/description. External stars/forks, community daily sync and +300 XP are unverified; publication preparation does not claim credit. No screenshots were fabricated. SECURITY.md describes private vulnerability reporting, enabled by the owner publication command.

Run the prepared publication script only when approving public disclosure. Its --check mode makes no remote writes and requires the expected authenticated owner, clean main branch, permitted remote and a passing hygiene scan. It creates no fork and refuses divergent repositories/history. Stop here; no next product phase.

## Previous — Phase 6, 2026-09-17 KST

**Local Growth analytics implemented. Execution OFF, mainnet OFF; no live transaction submitted. Stop before Phase 7/recruitment.**

Baseline inspection covered README, STATUS, ACCEPTANCE, current migrations, Telegram start, alerts/monitor/alpha/fresh-quote/NLU paths, wallet identity and verified settlement. Before code, **335/335 tests**, typecheck and build passed. Work was staged in ignored `.dev-live/phase6-stage` to keep the running bot stable until validation.

Migration 6 adds local analytics events, user attribution and tracking start, period/user/entity indexes, and optional entry/parent metadata on the existing input-origin tables. Existing file upgrades create a consistent `.before-phase6-*` SQLite backup and fail closed on backup error. Operational state is preserved. Historical usage is not fabricated; current legacy users/sources remain available. A compatibility issue was found in preflight's exact `[1,2,3,4]` version comparison: it now accepts the supported migration-4 or complete migration-6 database. This is readiness metadata, not a financial change.

First valid normalized Telegram source is immutable (including direct), latest touch can update, invalid input is unknown until a first valid touch, and legacy first touch is preserved. Reports use UTC timestamps with Seoul calendar boundaries. Active/new/returning/DAU/two-day metrics, origin-separated quotes, NLU aggregates, alerts/triggers/acknowledged recipients, wallet proof and existing trade stages are documented in [GROWTH_ANALYTICS.md](GROWTH_ANALYTICS.md).

Owner-only `/stats` uses authenticated grammY sender identity and offers Today/7/30 days, summary, sources and two funnels in Korean/English. Dedicated admin/exclusion configuration falls back independently to the already-configured local owner allowlist when unset; excluded users keep normal functionality/data. Every report omits them consistently. No HTTP stats/event ingestion endpoint, SaaS, private-text storage, wallet analytics address, referral rewards, user scoring or public leaderboard exists.

Main conversion uses exact user-owned alert → trigger → new quote → continuation → verified completion references within the period, with alert entry; direct actions cannot fill it. Alpha quote → alert requires shared card lineage. Unique users and event totals are separate; zero denominators are safe. Completion is projected only from the existing Sepolia CONFIRMED evidence state, deduped by trade, and excluded from reports on reorg. Durable submission attempts and PENDING never imply completion. Instrumentation observes successful existing wallet writes after commit/outside open transactions and cannot change their result.

Best-effort analytics failures cannot break product actions. Persisted alert/trade state reconstructs durable events; transient gesture/quote/NLU failures can undercount, and historical/pre-cutover actions are not backfilled. `/forget` cascades user analytics/attribution; backups require separate retention. Tracking since is displayed. See the documented limits before interpreting beta data.

**Final validation: 398/398 tests pass**, zero failures/skips/cancellations; full typecheck and production build pass. All 335 existing tests are unchanged, with 63 focused new cases. They cover normalization/first touch/latest touch, new/returning/Seoul boundaries, retention, origins/NLU, explicit linked unique-user/event funnels and denominators, source/exclusion consistency, actual grammY authorization, privacy, backup/idempotent migration, callback/settlement/delivery deduplication, backend proof and verified-settlement/reorg semantics, and failure isolation/recovery. Audit confirms 71 protected test/financial/NLU/transport/dependency files and `.env` unchanged. The root launcher repeated all test/typecheck/build gates successfully after promotion.

**Live checks:** the migration-6 database passes quick_check; exactly one consistent pre-migration backup exists and its user/alert/wallet/session/trade/attempt/quarantine counts match the captured pre-upgrade records. Live product counts remain unchanged. The existing owner is authorized and excluded through secure local configuration; Growth has zero non-excluded users and no unresolved/confirmed trades. Read-only rendering against the actual database produces compact Korean/English summary/source/funnel screens. Health reports Sepolia 11155111, executionEnabled false, connectorReady true; served app.js/app.css/index.html match the built bytes. Telegram getMe/polling/menu readiness, Sera testnet deployment/tokens/health, Sepolia RPC contracts/finalized reads and public HTTPS all pass live preflight.

The first automatic reload retained the long-running launcher's cached migration-4 readiness function and showed a stale DATABASE failure, although the bot/database and fresh CLI preflight passed. That one owned launcher was stopped and restarted to load the new check. The new temporary tunnel origin is applied automatically, with no `.env` edits or manual URL copying. Its complete readiness check now passes. Process audit confirms the old launcher exited and exactly one managed launcher and one bot remain. This is a development-runtime restart, not a wallet/signing architecture change.

### Phase 6 files (30)

- New analytics: `src/analytics/actions.ts`, `config.ts`, `store.ts`, `types.ts`, `views.ts`.
- New migration: `src/database/analytics-migration.ts`.
- New documentation: [GROWTH_ANALYTICS.md](GROWTH_ANALYTICS.md).
- New tests: `tests/analytics.test.ts`, `analytics-bot.test.ts`, `analytics-wallet.test.ts`.
- Metadata/instrumentation: `src/config/index.ts`, `src/database/store.ts`, `input-origins.ts`, `wallet.ts`; `src/alerts/monitor.ts`; `src/bot/controller.ts`, `telegram.ts`, `alerts.ts`, `scanner.ts`, `wallet.ts`; `src/wallet/server.ts`, `preflight.ts`; `web/app.ts`, `wallet-picker.ts`; `src/i18n/messages.ts`, `wallet.ts`.
- Updated documentation/config examples: `.env.example`, README.md, STATUS.md, ACCEPTANCE.md.

Phone checks in [Growth Analytics acceptance](ACCEPTANCE.md#growth-analytics) remain entirely unchecked. No new real Telegram user interaction, wallet approval or transaction is implied by mocked tests. All prior wallet architecture, contracts, signing/submission/settlement predicates and gates remain in place. No `.env` changes are authorized or made.

## Previous — Part A + Phase 5, 2026-09-17 KST

**Implemented and stopped before Phase 6. Execution OFF, mainnet OFF; no transaction submitted.**

Part A was completed and independently checked before Phase 5 code began: **260/260 tests** (251 originals + 9), typecheck and production build passed. Inspection found separate connection approval and backend ownership proof, with challenge fetching after a generic verification tap. Official OKX documentation and the installed 1.9.1 implementation did not establish a reliable one-trip path for this address-bound challenge. Two wallet visits remain. After connection the page fetches the challenge without prompting, focuses “OKX Wallet에서 확인”, then that explicit tap dispatches personal_sign and reopens the existing session. A labelled Reopen action is recovery only. Prepared proofs are one-use, guarded against cancellation/account/session changes, and locally expire after 90 seconds; backend proof checks are unchanged. See [the investigation](OKX_CONNECT.md#current--ownership-round-trip-refinement-part-a).

Phase 5 adds local deterministic RATE_QUERY, QUOTE_QUERY, CREATE_RATE_ALERT, CREATE_MOVEMENT_ALERT, SHOW_ALPHA, SHOW_ALERTS, PREPARE_SWAP and HELP_OR_UNKNOWN handling. Symbols/pairs are checked against the current Sera registry; amounts remain exact strings. Korean spacing/case variants, above/below synonyms, 시간/hr/h and %/퍼/퍼센트 are covered. Missing pairs/amounts receive a narrow follow-up. Alerts ask for their size-specific monitoring amount and use the existing preview/explicit-save path. Swap requests only use the existing fresh quote/card/continuation path. No wallet connection or financial authorization is inferred from text.

Pair/pending context is isolated by user, retained only in memory for five minutes, capped at 1,000 entries, and reset on restart, cancellation, unrelated commands/buttons or failed/unknown requests. Existing active command/alert wizards retain priority; /cancel exits them. No LLM/dependency/key was added, and no message is sent to an external AI service. English commands remain supported. Separate optional input-origin metadata (command/button/natural_language) references existing quote/alert records and cascades on deletion; existing trade/trigger provenance remains intact. No analytics pipeline or dashboard was built.

**Final validation: 335/335 tests pass**, zero failures/skips/cancellations: all 251 original tests unchanged + 9 wallet refinement + 75 parser/controller/context/adapter/persistence tests. Full typecheck and production build pass. The existing live launcher repeated tests, typecheck and build successfully after promotion and reported readiness without changing its tunnel/origin. Public /api/health reports chain 11155111, executionEnabled false and connectorReady true; served app.js, app.css and index.html match the final build.

Live Sera read-only checks passed for Korean reference-rate, fresh quote, target-size prompt/preview, cancellation, 5-USDC swap preparation and empty-alert-list requests. These used an in-memory test user, not the live Telegram conversation/database. The actual grammY text adapter is covered with mocked Telegram delivery, including rejection of group input. Local browser fixtures checked the real wallet UI with mocked Telegram/API/connector: focused Korean and English verification action, one-button handoff, explicit recovery label and success. These checks do not prove the new tap's delivery on a phone. **No new real Telegram mobile / OKX approval was performed by the agent.** Prior owner-reported success is not treated as new acceptance; the current phone checklists remain unchecked.

Baseline hashes confirm no edits to .env, package files, vendor bridge/provider/protocol/routing, backend wallet authentication, Sera calculations, alert/scanner evaluation, transaction payload/signing/submission/settlement, financial database state or safety configuration. Browser financial review/sign/submit functions are byte-for-byte unchanged. Additions to the database are input metadata only; the frontend ownership preparation lifecycle and bot text routing are the intended behavior changes.

**Files changed (21):**

- Wallet presentation/preparation: web/app.ts, web/connection.ts, web/wallet-flow.ts, web/wallet-picker.ts, web/wallet-copy.ts.
- NLU and UI routing: src/nlu/parser.ts, src/nlu/context.ts, src/bot/controller.ts, src/bot/alerts.ts, src/bot/scanner.ts, src/i18n/nlu.ts, src/i18n/messages.ts.
- Input metadata: src/database/input-origins.ts, src/database/store.ts.
- Tests: tests/wallet-refinement.test.ts, tests/nlu-parser.test.ts, tests/nlu-bot.test.ts.
- Docs: README.md, OKX_CONNECT.md, ACCEPTANCE.md, STATUS.md.

Known limits: two wallet visits, platform-dependent handoff recovery, five-minute/nonpersistent pair context, monitoring-size follow-up, 1/6/24-hour movement windows, narrow Korean patterns and no English NLU. Live availability/history can prevent a quote/condition from appearing. There is no verified one-trip, transaction or production-trading acceptance. Stop here; no Phase 6.

## Historical — Phase 4.6 wallet connection UX, 2026-09-17 KST

**Real transport result:** the owner reports successful Telegram mobile → official OKX Web3 connection → ownership verification. Existing redacted runtime diagnostics also include `WALLET_CONNECTED` and `OWNERSHIP_VERIFIED`. The agent did not perform those approvals. The working connector was preserved; this phase changes presentation and interaction states. **New real-device UX acceptance remains pending.**

- Connect opens one native dialog, styled as a mobile bottom sheet or centered desktop panel. Only OKX Wallet and MetaMask appear, with text monograms as logo fallbacks. The landing card, full-address disclosure, connected status and balance display are distinct from selection, preparation, continuation, approval waiting, ownership explanation, success and recovery states.
- Mobile keeps an explicit **OKX Wallet에서 계속** gesture after asynchronous link preparation. No automatic app launch or signature was added. Desktop keeps its single QR. The ownership-only explanation precedes **지갑에서 확인**; success can be dismissed without disconnecting. Cancel/back continues to retire the current attempt; stale completions cannot replace a new choice. Korean and English, Telegram theme updates, light/dark fallback colors, mobile safe areas, touch targets, native focus handling and reduced motion are supported.
- Telegram `/wallet` now has clear connected/disconnected wording and a balance button for linked wallets, routed to the existing read-only balance handler. Account details remain available; infrastructure attribution and required notices remain.
- **231 existing tests preserved + 20 added = 251/251 passing**, zero failures/skips/cancellations. The new cases cover actual presentation-controller transitions, cancellation/retry/timeout, late completion, ownership consent/rejection/success, connected-card data, theme updates and the chat balance action. One existing UI-source assertion was updated for the new handoff callback; transport/safety behavior assertions are retained. Full typecheck and production build pass. The real launcher repeated tests/typecheck/build successfully after promotion.
- Browser checks used the real app/components in a local fixture with mocked Telegram/API/connector responses. Korean light/dark and English copy were inspected, including a 390px iframe viewport for the mobile sheet, OKX/MetaMask selection, continuation, ownership explanation, success, balances and cancellation. No real wallet request, ownership/financial signature or transaction was performed. No actual Telegram UX acceptance is inferred from the fixture.
- `npm run dev:live` automatically rebuilt/reloaded the owned bot on the **same tunnel and origin**. Readiness passes. Public app JS/CSS/HTML match the final build; public health reports Sepolia **11155111**, execution **false**, connector ready **true**. The owner does not need another terminal, tunnel or origin update.
- Task-baseline hashes confirm `.env`, package files, official OKX bridge/provider/protocol, connector dispatch, Reown routing, ownership verification and all `src/wallet`, `src/trades`, `src/sera`, `src/alerts`, `src/scanner`, `src/database`, `src/config` files unchanged. The frontend quote review, financial signing and submission functions are byte-for-byte unchanged. No dependencies were added. Execution/mainnet stay OFF; Phase 5 was not started.

**Files changed in Phase 4.6 (19):**

- UI: `web/app.ts`, `web/app.css`, `web/index.html`, `web/wallet-picker.ts`, `web/wallet-flow.ts`, `web/wallet-copy.ts`, `web/routing-copy.ts`, `web/wallet-card.ts`, `web/wallet-theme.ts`.
- Chat presentation: `src/bot/wallet.ts`, `src/bot/controller.ts`, `src/i18n/wallet.ts`.
- Tests: `tests/wallet-ux.test.ts`, `tests/wallet-bot.test.ts`, `tests/okx-connector.test.ts`.
- Documentation: `README.md`, `OKX_CONNECT.md`, `ACCEPTANCE.md`, `STATUS.md`.

The short state diagram and second-gesture rationale are in [OKX_CONNECT.md](OKX_CONNECT.md#phase-46--wallet-connection-ux). All new [Wallet UX Acceptance](ACCEPTANCE.md#wallet-ux-acceptance) boxes remain unchecked for the owner.

## Historical — official OKX Web3 connector correction, 2026-09-17 KST

The owner tested the previous adapter: **OKX Exchange home opened without Web3 connection approval**. That is a real failed acceptance result. [OKX_CONNECT.md](OKX_CONNECT.md) records the exact redacted previous URL, evidence, dependency choice and current implementation. The new connector is **ready for owner acceptance, not phone-verified**.

- OKX Wallet now uses **@okxconnect/universal-provider 1.9.1**, with the SDK-generated `https://web3.okx.com/ul/connect?topic=[REDACTED]` link. MetaMask keeps Reown. Only one direct dependency was added; none removed. The documented EVM SDK minimum is OKX App **6.88.0**.
- Each attempt has an isolated SDK frame/memory store/private channel. Late/cancelled sessions cannot replace the current selection. A Sepolia address still requires the existing backend challenge and ownership signature. Mobile uses the official EVM `tg://resolve` return setting; desktop uses one QR and no Telegram redirect on the scanning phone.
- **210 prior cases preserved + 21 added tests = 231/231 passing**, zero failures/skips/cancellations. Full typecheck and production build pass. The live launcher repeated all checks successfully after the final UI edit. Git working/staged whitespace checks pass. Two previous OKX link expectations were updated to the new protocol route; existing safety assertions remain.
- Isolated browser inspection obtained a real SDK relay link, rendered mobile opening controls and exactly one desktop QR. App opening was mocked. No real wallet approval, ownership signature, financial signature or transaction was performed by the agent. The new [OKX Mobile Acceptance](ACCEPTANCE.md#okx-mobile-acceptance) and desktop checks remain unchecked.
- The old launcher was gracefully interrupted after verifying its console process list, and the sole **`npm run dev:live`** runtime was restarted. Tests/typecheck/build, Telegram/Sera/RPC/database/public HTTPS and configured connector readiness all pass. There is one launcher and one bot process. Local/public health reports Sepolia **11155111**, execution **false**, connector ready **true**. The public app/bridge/icon bytes match the current build; the bridge CSP is served correctly. The current launcher includes source-change rebuild/reload; no extra owner terminal or origin copying is needed.
- Start-of-task comparison confirms **`.env` unchanged** and every `src/` file unchanged except `src/wallet/server.ts` static assets/CSP. Its authentication and financial API handlers are byte-for-byte unchanged. `web/app.ts` changes only its provider type. Telegram auth, ownership proof, Sepolia/allowlist gates, financial confirmation, Permit/Intent, duplicate prevention and settlement remain unchanged. Execution/mainnet remain **OFF**; Phase 5 was not started.

## Historical — first OKX connection routing adapter, 2026-09-17 KST

The owner reports Telegram, Mini App and Reown setup working. Missing-Project-ID reports below are historical. The current task fixes connection routing only; Phase 5 remains deferred, execution/mainnet remain OFF, and no transaction was submitted.

- **190 existing tests preserved + 20 new routing/reload tests = 210 tests.** Typecheck and production build pass. The only existing test edit moves the provider-metadata branding assertion to its new module; behavioral assertions remain intact.
- Confirmed defects: backend disconnect left the old provider session reusable; AppKit's QR path could leave a prior wallet app link persisted; WalletConnect 2.25.0's abort method is a no-op. The inspected original OKX QR was generic WC and had no MetaMask URL. The owner's exact phone prompt has not been reproduced.
- The existing WalletConnect provider and Reown QR component remain. A small Telegram routing layer pins explicit OKX/MetaMask routes, uses mobile buttons versus desktop QR, isolates each attempt in memory, checks selected wallet/pairing/session, retires cancelled attempts, and separates connection from user-triggered ownership proof. No second wallet SDK.
- Isolated browser checks used the real relay to obtain fresh pairing URIs and inspect desktop QR, iOS OKX controls, MetaMask-specific controls and cancellation. HTTPS wallet opening was mocked; no wallet was approved or signed. These checks do not complete mobile or desktop owner acceptance.
- The public signing server reports Sepolia **11155111**, execution **false**, connector ready **true**. Its `/app.js` matches the rebuilt local bundle. Existing server static-file reads make the new UI available on a fresh Telegram wallet opening without restarting the owner process.
- New `dev:live` launches also watch source changes and automatically run checks/build/restart on their existing tunnel. The launcher already running before this change retains its older Project-ID watcher until its next normal launch; this does not block the current rebuilt UI. Authenticated Mini Apps are never forcibly reloaded.
- Comparison with the start-of-task hashes confirms **no changes to Sera/alerts/scanner/trades/database/config/backend wallet code or `.env`**. Backend ownership, replay/epoch protection, signing payloads, execution/allowlist gates and settlement logic are unchanged.
- Full investigation, official sources, limitations and the current 20-file change list: [WALLET_ROUTING.md](WALLET_ROUTING.md). Both new owner checks in [ACCEPTANCE.md](ACCEPTANCE.md) remain unchecked.

## Historical — live setup automation

Updated: **2026-09-17 KST — Live setup automation.** Phase 5 remains deferred. No wallet connection, ownership/financial signature, claim or swap was performed. Execution and mainnet stay OFF.

## Current result and root cause

**READY FOR OWNER REOWN SETUP:** the single command is `npm run dev:live`. It handles tests, typecheck, build, official Cloudflare acquisition, temporary origin, bot/server startup and readiness. The owner no longer copies tunnel URLs, edits SIGNING_ORIGIN or manages multiple terminals. Saving the Project ID triggers checks/build/reload on the existing tunnel.

**Handoff runtime:** the read-only launcher is left running, watching `.env` for the owner Project ID. Local/public readiness passes; Reown remains the only setup failure. Its temporary coordinates remain in ignored runtime state, not this report. The owner does not need to start a second terminal or repeat the completed setup.

The original `signingUi:false` was caused by **missing WALLETCONNECT_PROJECT_ID**. `walletConfig.ready` required origin + RPC + Project ID, and `src/index.ts` did not construct the signing HTTP server unless that flag was true. Actual `.env` inspection (values not printed) showed the token, one tester, RPC and syntactically valid temporary origin present, execution/mainnet false and Reown absent. Baseline preflight passed Telegram/Sera/RPC/database/build/origin-format checks; only Reown and public companion failed. An unavailable public companion was a consequence of the local server being gated off, not a frontend build failure.

The code now separates **page availability** (`uiReady`, origin + RPC) from **connector readiness** (also Project ID). The authenticated page can explain missing setup while the read-only bot works. Financial gates still require complete configuration and explicit authorization. No validation or signing path was bypassed.

## AUTOMATED TESTED

- Baseline before edits: **159/159 tests**, typecheck and build passed; original 140-test ancestry retained.
- Final suite: **172/172 tests**, 0 failures/skips; typecheck and production build passed. `git diff --check` and staged whitespace checks passed.
- **13 added regressions:** strict/fragmented tunnel parsing, runtime origin/safety overrides, no permanent .env mutation, secret-free runtime state, active/dead launcher behavior, missing/invalid/valid-format Reown configuration, owner summary, restricted Cloudflare environment/config, output redaction, IPC shutdown/repeated stop/failed spawn, optional Telegram menu updates, authenticated missing-Reown setup and Korean read-only commands with the setup page available.
- Fake-format Project IDs and Telegram/SIWE fixtures were used only in isolated tests. No fake Project ID was used against the real relay. No dependencies were upgraded.
- The actual `.env` SHA-256 digest was compared before/after and **unchanged**. Secret values and the digest are not published. Git ignores generated `.dev-live` origins, binaries and state.

## LIVE READ-ONLY VERIFIED

- Real Windows `npm run dev:live` ran its complete local checks, initialized the real dedicated Telegram bot and normal migration-4 database, generated/applied a new Quick Tunnel origin and served the built companion.
- Automatic official Windows cloudflared download/verification passed (2026.9.1). The initial forced-HTTP/2 attempt produced a public tunnel error; **automatic protocol selection** registered successfully and passed public HTTPS. TLS verification remained enabled.
- Local `/api/health` and its public HTTPS counterpart returned **200**, Sepolia 11155111, execution false and connector readiness false while Reown was absent. A real browser loaded the public signing page and correctly received the Korean external-browser authentication instruction with no wallet action controls.
- `npm run wallet:preflight` automatically picked up the active generated origin while the old manual origin remained unchanged in .env. It passed Telegram, network/mainnet, Sera, RPC, database, build, beta allowlist, launch and public companion checks. **Exit 1 solely for REOWN_PROJECT missing**, with an explicit owner action. Execution-OFF is an expected warning.
- Actual interactive **Ctrl+C** stopped the managed bot/tunnel and removed session/lock files; local port 8787 was released. SQLite `quick_check` returned `ok`; durable trade-attempt count remained **0**. One-shot `dev:live -- --check` also performed checks then closed its children, returning 1 for the missing owner prerequisite.
- The prior manually started bot process was identified as holding this repository's database before it was replaced. Unrelated Node processes and tunnels were preserved. No production deployment, DNS registration or permanent tunnel was created.

## LIVE TELEGRAM VERIFIED

**API/startup verified; owner chat/Mini App acceptance NOT YET TESTED by the agent.** Real token identity, polling compatibility, command registration and bot startup passed. This does not establish a native Telegram session or trusted owner initData. No Telegram message was sent as a setup test. Optional menu rewriting is isolated-test verified; no unrelated/stable menu is replaced.

## LIVE WALLET VERIFIED

**NOT YET TESTED.** The owner must create/access a dedicated Reown development project and save its Project ID once. Real relay access, native Mini App authentication, external wallet selection, ownership approval and wallet-specific quote remain owner checks. The launcher never connects a wallet or invents a project.

## LIVE SEPOLIA EXECUTION VERIFIED

**NOT YET TESTED / DISABLED.** The development launcher always forces `SERA_NETWORK=sepolia`, `ENABLE_MAINNET=false`, `ENABLE_TESTNET_EXECUTION=false` in the app process regardless of saved flags. It does not edit those flags in .env. This convenience command cannot enable trading. The existing EOA/USDC → XSGD/100-test-USDC ceiling and all confirmation/Permit/Intent controls are unchanged.

## LIVE SETTLEMENT VERIFIED

**NOT YET TESTED.** Public RPC capability reads and automated evidence tests are not an owner swap or proof of settlement. No submission occurred; duplicate prevention and read-only reconciliation are preserved.

## BLOCKED

**Owner Reown Project ID only for the current setup gate.** The selected WalletConnect Ethereum Provider requires an owner dashboard project. Current [official relay documentation](https://docs.reown.com/cloud/relay) permits all origins when its allowlist is empty, so the chosen minimal setup is a **new, separate temporary development project with an empty origin allowlist**. Repeated domain registration is then unnecessary. This lets other sites consume that public project's relay quota; it does not authorize wallet spending or bypass this bot's authentication. A stable domain/tunnel with an exact allowlist is the alternative for ongoing restricted use. No existing Reown policy is changed automatically.

The sole immediate owner action is to **create their dedicated development project in Reown Dashboard**. Its one local destination is `.env` → `WALLETCONNECT_PROJECT_ID`. Wallet consent comes later; setup success is not a wallet acceptance claim. [Start Live Testing](README.md#start-live-testing) is the short owner path; [ACCEPTANCE.md](ACCEPTANCE.md) separates future manual gates.

The dashboard was inspected in the available browser and showed **Sign In / Continue with Google / Sign Up**. No authenticated Reown session was available there. No cookie consent, account terms, sign-in or project creation was completed on behalf of the owner.

## Files changed for live setup automation

Created:

- `scripts/dev-live.ts` — foreground lifecycle, automatic gates/startup/readiness and Project ID reload.
- `scripts/live/environment.ts`, `processes.ts`, `tunnel.ts`, `telegram.ts`, `report.ts` — runtime-only settings, Windows child ownership/redaction, verified executable/tunnel parsing, optional temporary-menu synchronization, concise status.
- `tests/live-setup.test.ts`, `tests/fixtures/live-child.mjs` — local-only automation/subprocess regressions.

Modified:

- `src/wallet/config.ts`, `src/wallet/server.ts`, `src/wallet/preflight.ts`, `src/index.ts`, `src/bot/wallet.ts` — separate page/connector readiness, safe health metadata, actionable checks, private IPC shutdown and setup-page navigation.
- `scripts/wallet-preflight.ts`, `package.json`, `.gitignore`, `.env.example` — one command, system CA handling, active-runtime preflight and ignored temporary files.
- `tests/wallet-server.test.ts`, `tests/wallet-bot.test.ts` — absent-Reown authenticated setup and Korean command preservation.
- `README.md`, `ACCEPTANCE.md`, `RESEARCH.md`, `STATUS.md` — short owner launch path, developer detail below it and explicit evidence/owner boundaries.

Existing staged/unstaged work and license attribution remain preserved. No reset, commit, product feature, analytics, NLU, execution-pair expansion or wallet architecture replacement.

---

## Historical Phase 4.5 preparation report (superseded setup blockers)

Updated: **2026-09-17 KST — Phase 4.5 acceptance preparation complete; stopped at the owner gate.** Execution remains OFF, mainnet remains disabled, and the existing `.env` was not displayed or overwritten. Phase 5/NLU/analytics were not started. This is not a production-ready or security-audited release.

## AUTOMATED TESTED

**READY FOR MANUAL TEST.** Before implementation changes: **140/140 baseline tests passed**, typecheck passed and production build passed. No baseline discrepancy, removed test case or weakened assertion. Final check at approximately **2026-09-16T18:54:48Z**: **159/159 tests passed**, 0 failures, 0 skips; typecheck and build passed. `git diff --check` passed. Existing staged/unstaged/untracked work and MIT attribution were preserved; no reset, commit or deployment.

Nineteen added regression cases:

- Five preflight cases: execution-OFF readiness, missing setup exit code, secret/error redaction, invalid configuration/mainnet/allowlist/build, migration read-only behavior.
- Seven connector cases: connection cancellation/retry, ownership cancellation/new challenge, wrong-chain switch/recovery, account change during approval, account change during challenge load, disconnected/expired quote checks, unsupported EOA rejection before signing.
- Five service/view cases: read-only preview without financial authorization, owner/disconnect binding, owner-scoped non-retrying UNKNOWN refresh/backoff, safe pseudonymous diagnostics, verified completion details/explorer.
- Two HTTP cases: authenticated identity/read-only preview and recovery, safe authentication/RPC/diagnostic failures. Existing Phase 1–4 tests, including incomplete-wallet-setup commands and default execution-OFF gates, still pass.

Local built-page browser inspection verified only the **unauthenticated** state: Korean instruction to reopen through Telegram, no wallet/financial action buttons, and retained license link. A temporary loopback static server was stopped afterward. This was not a Telegram session, wallet connection, public tunnel or CSP/relay acceptance test.

## LIVE READ-ONLY VERIFIED

**LIVE VERIFIED — public reads only**, on 2026-09-17 KST. See [RESEARCH](RESEARCH.md#phase-45-addendum--2026-09-17-kst) for exact official sources and addresses.

- **18:33:42.077Z:** official-linked faucet inventory/parameters through public Sepolia RPC: exact USDC/XSGD included, sufficient configured-claim token stock, epoch 2, 117 tokens, native ETH stock and allocation read. No owner eligibility check.
- **18:34:17.911Z:** positive **5-test-USDC → XSGD** quote with live deployment, permit metadata, exact on-chain Intent digest, balances and finalized/bounded log checks. A 1-USDC probe failed; five is the smallest successful tested amount, not a fixed protocol minimum.
- **18:34:19.541Z:** official faucet `claim()` simulation using a public burn address returned success. This was an `eth_call`, not a transaction or token claim. No wallet credentials/signature were used.
- Official testnet site → app wallet page inspected without sign-in. The page requires sign-in for wallet/token claiming.
- Final live preflight safely read Sera testnet configuration, token catalog and health. Overall preflight exited **1 as expected**, because local owner setup remains incomplete. It did not claim remote Telegram/Reown/origin/RPC checks passed when their settings were absent.
- **18:58:00.061Z:** separately ran the new RPC preflight capability probe with a temporary public Sepolia endpoint: chain/deployed domains, finalized block, an actual public receipt and bounded event logs passed. This did not modify `.env` or make the owner's incomplete full preflight pass.

These reads used a temporary public Sepolia RPC setting without writing it into `.env`. No mainnet operation, real user wallet, financial approval or POST /swap was performed.

## LIVE TELEGRAM VERIFIED

**NOT YET TESTED.** Real BotFather token, chat commands/notifications, native Mini App launch, initData/session identity, HTTPS tunnel routing and Telegram client behavior need the owner. Mock Telegram tests and the local unauthenticated browser inspection are separate evidence.

## LIVE WALLET VERIFIED

**NOT YET TESTED.** Real Reown project authorization, EOA pairing, wallet return, ownership approval, exact wallet balances, account-change recovery and fresh wallet-specific preview require the owner's test wallet. No wallet was created or connected for the owner. Faucet source/stock/simulation are verified; actual owner funding/eligibility/gas remain pending.

## LIVE SEPOLIA EXECUTION VERIFIED

**NOT YET TESTED.** Execution remains false. No real Permit, Intent, submission or swap transaction occurred. The only execution pair remains **Sepolia USDC → XSGD**, plain EOA, wallet-funded, same-wallet recipient, at most **100 test USDC**, optionally lower. A new owner quote at 5 is a reasonable first checked size if current liquidity permits; no size is automatically changed.

## LIVE SETTLEMENT VERIFIED

**NOT YET TESTED.** Live finalized blocks/log reads validate RPC capability, not a completed owner swap. Actual accepted/pending/unknown/confirmed behavior, matching receipt/Intent evidence, real output and explorer link must be checked after the owner's single authorized transaction. UNKNOWN remains locked and never automatically retries. Status refresh has no submission capability.

## BLOCKED

**BLOCKED — owner configuration/participation, not automated implementation.** Current preflight reports missing Telegram token, HTTPS signing origin, Reown project ID, configured Sepolia RPC, one-person allowlist and initialized migration-4 database. Public signing launch consequently cannot be verified. The signing build, execution/mainnet defaults and live Sera reads pass. Execution-OFF is an expected warning, not the reason for failure.

The exact next action was: **open official @BotFather in Telegram and send `/newbot` for a dedicated development bot**. Keep its token local. The relocated [Windows setup guide](ACCEPTANCE.md#live-acceptance-setup) covers the temporary HTTPS tunnel, Reown allowlist, public RPC and obtaining the numeric ID through this bot's `/wallet`.

Only after tests/typecheck/build/full preflight and all real read-only Telegram, Mini App, wallet, Sepolia, token/balance, wallet-specific quote and sole-tester checks pass may the owner personally enable the existing execution flag. [ACCEPTANCE.md](ACCEPTANCE.md) contains the A–H checklist; no live boxes have been prechecked. A free-gas/faucet eligibility failure keeps execution OFF and requires official Sera assistance, not asset purchases or a silent pair switch. Native mobile completion inside the short quote window and unresolved settlement remain practical uncertainties. No deployment/tunnel/account setup or wallet approval is delegated to the agent.

## Phase 4.5 files and fixes

New files (Phase 4.5 only):

- `ACCEPTANCE.md` — owner checklist with a how-to for every item.
- `src/wallet/preflight.ts`, `src/wallet/diagnostics.ts` — read-only readiness probes and bounded, redacted diagnostics.
- `web/connection.ts` — testable ownership-only connector, cancellation and chain/epoch handling.
- `scripts/funding-smoke.ts` — exact official-faucet public stock reads, no claim/submission.
- `tests/preflight.test.ts`, `tests/wallet-connection.test.ts`, `tests/acceptance.test.ts`.

Modified files (preserving earlier phase work):

- `scripts/wallet-preflight.ts`, `scripts/wallet-smoke.ts`, `package.json` — nonzero/secret-free preflight, bounded optional probe amount and funding script.
- `src/wallet/chain.ts`, `src/wallet/server.ts` — RPC readiness, safe health/auth/diagnostic responses, read-only preview and status refresh.
- `src/trades/service.ts`, `src/trades/view.ts`, `src/trades/settlement.ts`, `src/database/wallet.ts` — shared validated preview without signable state, explicit approval explanations and actual settlement details, serialized owner-scoped reconciliation. No new database migration or signing path.
- `src/bot/controller.ts`, `src/bot/wallet.ts`, `src/bot/telegram.ts`, `src/bot/view.ts`, `src/index.ts` — disabled-mode navigation, status refresh, verified explorer buttons, shared read-only worker wiring.
- `src/i18n/wallet.ts`, `web/app.ts`, `web/index.html` — Korean/English modes and stable errors, authenticated identity, delayed Reown startup, cancellation/chain recovery, expiry clearing, distinct submission states. No financial confirmation UI in execution-OFF mode.
- `tests/wallet-server.test.ts` — additional HTTP acceptance regressions; prior assertions retained.
- `.env.example`, `README.md`, `RESEARCH.md`, `PHASE4_CONTRACT.md`, `STATUS.md` — linear setup, funding evidence, explicit owner gate and historical/current status separation. Actual `.env` is unchanged.

Preflight command: `npm run wallet:preflight` (on this Windows machine use `$env:NODE_OPTIONS = '--use-system-ca'` first). It checks token structure and read-only Telegram identity/polling/menu APIs, HTTPS origin/live companion consistency, Reown ID presence, Sepolia RPC/contracts/finalized receipt/log capability, canonical Sera testnet health/config/tokens, execution/mainnet flags, one tester, generated session-secret design, database migration/health and all frontend build artifacts. It does not create credentials, migrate data, toggle execution, prove relay authorization or sign anything. `--offline` is diagnostic only and does not satisfy the live gate.

External setup: a Telegram development bot, an owner Reown dashboard project with the exact HTTPS origin allowed, a temporary HTTPS tunnel (Cloudflare Quick Tunnel needs no account/domain; alternatives are supported), Sepolia RPC (the documented public endpoint needs no key), and the owner's plain test EOA with official faucet assets/native gas. No Sera operator API key, server signing key or static encryption/session secret is needed. Full steps and exact `.env` field mappings are in README; failures are reported using only the safe code and redacted terminal line.

---

## Historical Phase 4 report (superseded funding/setup status)

Updated: **2026-09-17 KST — Phase 4 only.** The older Phase 3 report is preserved below as historical evidence.

**IMPLEMENTED AND AUTOMATED-TESTED:** external-wallet authentication, balance reads, shared quote/review/signature/submission flow, durable duplicate prevention and public-contract settlement reconciliation. Baseline 85/85 passed before changes; final results are recorded below. Execution remains disabled. This is not a production-ready or security-audited release.

**LIVE ACCEPTANCE PENDING:** real Telegram commands/notifications, WalletConnect in Telegram mobile, ownership and financial signatures, live swap acceptance, finalized settlement and restart behavior with a real transaction. No real wallet or financial transaction was used. Local browser inspection covered only the unauthenticated page, not wallet acceptance.

**BLOCKED:** live owner acceptance currently lacks a dedicated bot token, public HTTPS origin, Reown project configuration, configured Sepolia RPC, allowlisted user and funded EOA test wallet. Preflight reports setup as missing with execution false. Exact test-USDC faucet distribution/eligibility remains unverified. These setup gaps do not block the automated implementation or existing read-only bot.

**DEFERRED:** mainnet, other execution pairs, smart/delegated wallets, on-chain token approval flows, Vault funding/deposits, orders, transfers, withdrawals, NLU, growth analytics/dashboard, deployment and Phase 5. Authenticated Sera order history is not implemented; public contract reads are the selected settlement path.

## 1. Files created and modified in Phase 4

Created:

- `src/wallet/config.ts`, `auth.ts`, `chain.ts`, `server.ts` — setup, Telegram/SIWE identity, public chain reads, protected companion HTTP surface.
- `src/trades/contract.ts`, `service.ts`, `settlement.ts`, `view.ts` — canonical schemas/hashes, authorization state transitions, submission, evidence and review rendering.
- `src/database/wallet.ts`, `src/bot/wallet.ts`, `src/i18n/wallet.ts`.
- `web/index.html`, `web/app.ts`, `web/app.css` — minimal Korean/English wallet interface.
- `scripts/build-web.mjs`, `scripts/wallet-preflight.ts`, `scripts/wallet-smoke.ts`.
- `tests/trade-helpers.ts`, `trade-contract.test.ts`, `trade-service.test.ts`, `settlement.test.ts`, `wallet-auth.test.ts`, `wallet-bot.test.ts`, `wallet-server.test.ts`, `wallet-persistence.test.ts`.
- `PHASE4_CONTRACT.md`.

Modified:

- `src/config/index.ts`, `src/index.ts`, `src/sera/client.ts`, `src/database/store.ts`.
- `src/bot/controller.ts`, `telegram.ts`, `view.ts`, `alerts.ts`, `scanner.ts`.
- `src/database/alerts.ts`, `src/alerts/views.ts`, `src/alerts/monitor.ts`, `src/i18n/messages.ts`.
- `tests/bot.test.ts`, `sera.test.ts`, `alert-bot.test.ts`, `scanner-bot.test.ts`.
- `.env.example`, `package.json`, `package-lock.json`, `tsconfig.json`, `Dockerfile`.
- `README.md`, `RESEARCH.md`, `STATUS.md`, `THIRD_PARTY_NOTICES.md`.

Existing staged and unstaged Phase 1–3 files were preserved; many were already untracked before Phase 4. No reset, commit or public deployment. The actual `.env` was neither displayed nor overwritten. Haruki's MIT notice is retained. Dependency additions are pinned viem 2.56.5, WalletConnect Ethereum Provider 2.25.0, AppKit 1.8.24 and esbuild 0.28.2 (build only).

## 2. Architecture and rationale

Private Telegram chat → existing bot/quote flow → Telegram Mini App → backend-validated Telegram identity → one-use SIWE wallet proof → new wallet-specific quote → exact final review → explicit confirmation → separate Permit and Intent wallet requests → single authorized REST submission → read-only settlement worker → Telegram result.

One WalletConnect QR/mobile path serves an external EOA. It does not depend on injected browser extensions. viem verifies signatures; the bot has no signing key or delegated authority. The existing Sera client and request queue are reused, with a separate gated submission capability given only to TradeService. Existing scanner, market monitor and notifications cannot submit. The settlement worker has only public read capability and a notification callback. No additional MCP client/runtime is present.

## 3. Verified execution contract and sources

See [RESEARCH.md](RESEARCH.md#phase-4-addendum--2026-09-17-kst) and [PHASE4_CONTRACT.md](PHASE4_CONTRACT.md) for exact addresses, field order, evidence classifications and official source links. Authoritative references include [swaps](https://docs.testnet.sera.cx/api-reference/endpoints/swaps/), [authentication](https://docs.testnet.sera.cx/api-reference/authentication/), [SOR](https://docs.testnet.sera.cx/contracts/sor/) and its official source, plus [Telegram validation](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app).

Canonical REST is `https://api.testnet.sera.cx/api/v1`. Intent domain is Sera/version 1/Sepolia/Sera contract; SOR is the permit spender. The nine exact Intent fields, independent quote UUID and signed composite UUID, live permit metadata, actual quote expiry and separate signed deadline are preserved. The live USDC Permit domain is CIRCLE/version 1, not the illustrative USD Coin example. Live RPC confirmed the domain separators and exact Intent digest. No financial submission was used to verify these reads.

## 4. Commands and shared entry points

`/wallet`: verified public address, Sepolia, connect/disconnect, recent trade states and owner Telegram ID for setup. `/balance`: actual supported wallet token balances including zero. `/swap`: existing pair/amount selection, with disabled-mode explanation when execution is off. Existing `/quote`, alert latest-quote results and `/alpha` latest-quote results all lead to the same continuation and TradeService. Existing read-only commands and alert/scanner behavior remain available.

The Telegram continuation is navigation, not financial consent. `/order` remains an accurate unavailable/deferred placeholder. All new UI and errors support Korean/default and English. Operations are restricted to private chats.

## 5. Supported scope and funding

Only Sepolia 11155111; plain EOA wallets; registry **USDC → XSGD**, both six decimals; wallet-funded `receive_less`; same verified recipient; positive amount at most 100 test USDC (configurable downward), with current token minimum and sufficient balance checked. Other pairs still work for read-only discovery. Unsupported precision, zero output, smart/delegated wallets or another recipient are rejected.

The wallet-held USDC funding contract is verified. Obtaining the owner's test USDC is still a setup blocker: official quickstart/testnet app references exist, but faucet distribution/eligibility was not tested. There is no invented claim endpoint or purchase instruction.

## 6. Permit and approval behavior

Each trade requires a minimal exact-value ERC-2612 Permit plus the exact Sera Intent. An existing allowance does not bypass Permit. Token, owner, live SOR spender, value, nonce, domain and deadline are validated, including on-chain checks before submission. Ownership proof and financial authorizations have separate purposes and screens. There is no unlimited allowance, on-chain approval transaction or fallback for unsupported tokens.

## 7. Quote refresh and consent

Every latest-quote click remains a new API request. A second, NEW quote is requested after actual wallet verification and setup. It binds taker/recipient, tokens, raw amount, receive_less and deadlines. Final review displays network, addresses, input/max input, minimum output, directional rate, provided costs and expiry. Unavailable costs are not zero; minimum output is not expected output.

Server confirmation consumes the exact stored payload/version; only then are canonical signing payloads returned. UI requires separate wallet approvals and an explicit submit. Actual expiry is displayed; signing/submission ends five seconds earlier. Expired/changed/disconnected sessions lose prior authorization and signatures. New terms require new review, confirmation and signatures. No silent requote, amount adjustment or slippage widening.

## 8. Backend gates

1. Strict boolean execution flag defaults false; explicit mainnet configuration is rejected.
2. Required HTTPS origin, WalletConnect project and RPC configuration; empty beta allowlist denies everyone.
3. Fresh Telegram HMAC authentication, replay protection, short-lived hashed session, owner checks, Origin/Host and CSRF checks, rate limits and strict input schemas.
4. Single-use domain/chain/session-bound SIWE, verified EOA, current wallet link/session epoch and no quarantine.
5. Sepolia wallet/RPC/live Sera domain and contract roles, allowed tokens/decimals, balance, supported amount and current quote.
6. Exact version/confirmation, both valid wallet signatures, live permit nonce/domain, unexpired terms and atomic database submission attempt.

An earlier button, address supplied by a browser, monitoring quote, another user's context or reloaded page cannot bypass these gates. No arbitrary client-selected API/RPC/redirect or development auth bypass exists.

## 9. Duplicate prevention and unknown outcomes

States: DRAFT → REVIEW → SIGNATURES → SUBMITTING → PENDING → CONFIRMED, plus FAILED, EXPIRED, CANCELLED, UNKNOWN and UNKNOWN_REORG. Atomic SQLite transitions, unique quote/attempt constraints and one active wallet reservation handle concurrent tabs and repeated requests. The attempt commits **before** the external POST; financial POSTs are never auto-retried. Only reviewed signatures authorize this one request.

Timeouts/ambiguous errors stay UNKNOWN. Restart converts SUBMITTING to UNKNOWN and performs reads only. Request acceptance is PENDING. Neither state releases the wallet for another attempt until evidence resolves it. This is duplicate prevention, not a claim of end-to-end exactly-once execution. Telegram notification retries cannot cause financial retries.

## 10. Settlement completion predicate

Required together: Sepolia RPC; receipt success; canonical block hash at or below `finalized`; matching live SOR `IntentMatched` with exact Intent **struct hash** and taker; input-token transfer debit > 0 and ≤ signed maximum; output-token transfer(s) to the signed same-wallet recipient ≥ signed minimum. The struct hash binds tokens, recipient, amounts, UUID and deadline; SOR enforces that envelope. Relayed/batched execution is accepted without requiring a user transaction sender.

Only this result produces the completion message and Sepolia explorer link. No hash, API response, permit or approval alone is success. At most two due records and a 2,000-block range are read per cycle; interval defaults 60 seconds and unresolved backoff caps at five minutes. Finalized receipts are rechecked hourly. A detected reorg blocks the wallet, invalidates new unsubmitted drafts and resumes reconciliation; no automatic quarantine unlock is provided.

No matching event can remain unresolved indefinitely. Authenticated order history would be needed for additional pre-broadcast diagnosis; it is not implemented. Investigate using the Sera trade ID rather than retrying. Finality can take many minutes, and RPC availability is required.

## 11. Database and secrets

Migration 4 adds `wallet_links`, `wallet_sessions`, `telegram_auth_replays`, `wallet_challenges`, `trade_sessions`, `trade_attempts`, `wallet_quarantine`, and a small origin field in `quote_intents`. Existing users, alerts, observations, triggers, scanner probes and intents survive migration. Existing databases receive a consistent SQLite `VACUUM INTO` backup beside the source before migration; backup failure aborts the upgrade.

Persisted: public wallet reference, hashed session/CSRF credentials, expiring challenges, exact nonsecret trade snapshot/digest, owner/network/origin, state/timestamps/attempts, trade ID and verified receipt evidence. No private keys, raw financial signatures, Telegram initData or per-wallet Sera API credentials are persisted/logged. Financial signatures remain in browser/request memory. Cookie is Secure/HttpOnly/SameSite; secrets and tokens are absent from URLs. RPC URL/token remain backend environment only. Reown session storage is managed by the connector and has its own privacy implications.

Disconnect cancels unsubmitted local authorizations across sessions. It cannot revoke on-chain approvals or signed permits or undo submissions. `/forget` is blocked while an unresolved submitted trade needs reconciliation, then deletes personal terminal records. Backups require separate owner retention/deletion.

## 12–13. Automated checks and build

Before editing: **85/85 tests, typecheck and build PASS**. No baseline failure was concealed or original test case deleted. The old mainnet opt-in expectation now asserts rejection; old minimum-output labels now assert “minimum received,” with existing amount/refresh assertions retained.

Final full-suite results:

| Command | Result |
|---|---|
| `npm test` | **140/140 passed, 0 failed, 0 skipped** |
| `npm run typecheck` | **PASS** |
| `npm run build` | **PASS** — backend, browser bundle and complete installed dependency license notices |

55 added cases cover Telegram forgery/staleness/replay, SIWE nonce/expiry/wrong signer/async disconnect; user isolation including foreign submission; gates/networks/contracts/tokens/precision; payload/permit/signature tampering; quote refresh and stale consent; concurrent submission, restart and unknown outcomes; receipt identity/amount/finality failures; reorg and notification retry; persistent migration/backup/secret exclusion; HTTP Origin/CSRF/session boundaries; Korean/English wallet and continuation flows; trigger-specific origin preservation and ownership checks.

The frontend's unauthenticated local page was also inspected in the in-app browser: readable Korean auth gate and no warning/error console entries. This did not test Telegram initialization, a wallet popup, the production reverse proxy/CSP combination or mobile behavior.

## 14. Live read-only checks performed

`scripts/wallet-smoke.ts`, observed **2026-09-16T17:32:59.628Z**, passed Sepolia deployment/roles/domain, registry/token decimals, positive 100 USDC → XSGD probe, exact Permit domain/nonce and on-chain Intent digest, probe-address balances, finalized block and bounded SOR logs. Public RPC used for this diagnostic was `https://ethereum-sepolia-rpc.publicnode.com`; it was not written to `.env`. No user wallet, private key, financial signature, funding transaction or POST /swap.

Historical Phase 1–3 live API checks remain separate evidence below. Current prices/liquidity are not guaranteed by a historical successful probe.

## 15. Live checks not performed

No live Telegram bot/chat/alert delivery, Mini App authenticated session, WalletConnect pairing, mobile wallet return, real ownership/Permit/Intent signature, submission, on-chain approval/funding, finalized swap receipt or transaction explorer result was performed. No public deployment, real secret configuration or execution enablement occurred. Mocks are not an end-to-end acceptance claim.

## 16. Remaining limitations

- Setup blockers and test-token availability described above. External mobile approvals must fit the actual short quote lifetime; this needs user testing.
- Accepted/unknown requests without matching events retain their wallet lock; account-history diagnosis is unavailable. Deep reorg quarantine requires investigation and has no UI reset shortcut.
- Single process/SQLite, no horizontal scaling or Docker companion acceptance. Reconciliation depends on reliable Sepolia finalized/log/receipt RPC methods. Numeric Sera quotas remain unconfirmed.
- AppKit/WalletConnect community-license obligations apply separately from MIT. Full agreements/attribution ship in the build; installed terms currently require commercial licensing beyond 500 MAU or 2,500,000 monthly RPC calls. Review vendor terms before scaling. No SDK source was copied or patched.
- Independent security review and full real-user acceptance remain outstanding. Phase 5 is not started.

## 17. Exact owner setup and testing

The original Phase 4 guide has been superseded by the [live acceptance runbook](ACCEPTANCE.md#live-acceptance-setup), including BotFather/Reown configuration, environment settings, funding, manual acceptance and execution rollback instructions.

On this Windows computer:

```powershell
cd fx-alert-bot
npm ci
npm run typecheck
npm test
npm run build
notepad .env
# Set your dedicated TELEGRAM_BOT_TOKEN locally; never paste it into chat.
# Keep SERA_NETWORK=sepolia, ENABLE_MAINNET=false, ENABLE_TESTNET_EXECUTION=false.
npm run wallet:preflight
$env:NODE_OPTIONS = '--use-system-ca'
npm start
```

First accept read-only commands in a private chat. Then configure your own HTTPS origin, Reown project/origin allowlist and Sepolia RPC per README; connect a dedicated test EOA and verify actual balances while execution is still false. Confirm appropriate test-USDC funding. Only after those checks should you choose to enable test execution with **your ID only** allowlisted and restart. Review/sign/submit one small trade yourself, observe evidence-based completion, then disable execution again. Keep RPC configured to reconcile already-submitted trades. None of those live actions was performed for you.

**Stopped after Phase 4 implementation for owner review. Do not start Phase 5.**

---

# Historical Phase 3 report (superseded by the Phase 4 status above)

Updated: 2026-09-17 KST. Phase 3 live Sera check: 2026-09-16 15:54:40 UTC.

| Phase | Status |
|---|---|
| Phase 0 — research | Complete; RESEARCH.md, licenses and attribution unchanged |
| Phase 1 — read-only commands | Complete and preserved |
| Phase 2 — personalized alerts | Complete and preserved; original 54 Phase 1/2 test cases retained |
| Phase 3 — /alpha scanner | **Complete in code and automated tests; live Sera read-only checks passed** |
| Live Telegram acceptance | **Pending** — no token configured or used |
| Phase 4 and later | **Not implemented. Stopped for user review.** |

Execution/signing remain disabled. No wallet, mainnet implementation, Privy, NLU, full analytics, source/referral features, admin dashboard or external-market comparison was added. Existing Phase 1 source storage remains unchanged.

## 1. Files created and modified

Created (15 files):

- src/scanner/types.ts, config.ts, coverage.ts, signals.ts, scoring.ts, service.ts, views.ts
- src/database/scanner.ts
- src/bot/scanner.ts
- src/i18n/scanner.ts
- scripts/scanner-smoke.ts
- tests/scanner-helpers.ts, tests/scanner-signals.test.ts, tests/scanner-monitor.test.ts, tests/scanner-bot.test.ts

Modified (12 files):

- src/alerts/monitor.ts — merge public sample jobs into the existing grouped monitor
- src/bot/controller.ts, src/bot/alerts.ts — route /alpha and reuse explicit alert setup for prefills
- src/config/index.ts, src/database/store.ts, src/i18n/messages.ts, src/index.ts
- .env.example, package.json, README.md, STATUS.md, tests/bot.test.ts

No dependencies were added, existing .env was not overwritten, and no deployment was performed. The original /alpha placeholder assertion now expects the implemented scanner response; no original test case was removed.

## 2. Signals actually implemented

- **RATE_MOVEMENT**: absolute change in amount-specific quoted rate over 1, 6 or 24 hours, with positive/negative direction retained. Defaults: 0.5%, 1%, 2%.
- **QUOTE_AVAILABLE**: a valid positive-minimum-output quote was returned at the configured source-token size.
- **AVAILABILITY_RECOVERY**: observed unavailable → available, with the two valid monitor observations no more than the freshness limit apart. No initial-state or error-derived recovery.

Rate is minimum received / input at the same amount, including quoted costs; fee changes can contribute. Every card includes direction, amount, rate, last-check time and a reason. Movement cards include configured thresholds and actual baseline times. Recovery includes its observation time.

The configured default public samples are USDC/XSGD:100, USDC/EURC:100 and XIDR/USDT:1000000. This is a limited sample set, not a scan of every registered market.

## 3. Deferred signals

- **Spread:** verified bid/ask is unavailable. Reverse quotes are not used as a substitute.
- **Total order-book liquidity/depth:** no verified native endpoint. Quote availability is explicitly labeled as a size-specific probe.
- **Shared target-rate/near-threshold counts:** deferred for privacy and scope. The scanner never reads or exposes personal thresholds or user counts. /alert remains the place for subjective targets.
- Profit prediction, trade advice, arbitrage and external-market comparisons are outside the product.

No new Sera endpoint/field was introduced. No material API finding required modifying RESEARCH.md; its early proposed spread behavior remains superseded by the Phase 2/3 deferral.

## 4. Exact ranking

Internal notability determines display order only; it is not shown as a financial score.

For a current sample, F = 1 − sample_age / data_max_age.

- Movement: 20 × min(5, abs(movement_pct) / threshold_pct) × F.
- Recovery: 60 × (1 − recovery_age / recovery_max_age) × F, only while unexpired.
- Quote availability: 5 × F.
- Scores round to 8 decimal places. Card score is the maximum signal score, not a sum.
- Signal ties: alphabetical signal type, then shorter comparison window.
- Card ties: newer observation, then lexical network/source-address/destination-address/amount key.

Amounts in different currencies are not compared as notional significance. No AI, expected-profit or user-popularity factor is used.

## 5. Freshness and historical rules

Current data must be strictly younger than ALPHA_DATA_MAX_AGE_SECONDS (default 180) and cannot be future-dated. A failed most recent probe suppresses that sample until a successful observation arrives. Missing, stale, failed, no-quote and partially available states are explicit.

Movement uses the nearest actual same-pair/direction/amount observation to current observation time minus the window, within the existing baseline tolerance (default ±300 seconds, capped at 10% of the window). No interpolation or fabricated historical values. Missing history suppresses movement only; availability may still be shown.

Recovery expires after ALPHA_RECOVERY_MAX_AGE_SECONDS (default 900). Remaining available never refreshes its timestamp; observed unavailability or a sampling gap beyond data_max_age clears it. Errors never establish unavailability.

A recent observation is not a currently executable quote: the original quote may expire after roughly 30 seconds. The UI describes a past check and tells users to request a fresh quote.

## 6. API requests and caching

One existing AlertMonitor owns all timing, grouping, pacing, budgets and retention. ScannerCoverage only supplies additional configured jobs and consumes their observations; it has no timer or independent API client.

Groups are keyed by Sepolia + token addresses + direction + canonical amount. Matching scanner and personal-alert jobs share one quote POST. Existing max groups/cycle (default 10), soft 25-second polling budget, oldest-evaluated rotation and 60-second delay after completion apply to the combined work.

With only the default scanner enabled: at most 3 quote POSTs per cycle plus existing cached config/token/market and server-time requests. Metadata/request queue are shared with Telegram commands, including Retry-After handling. Numeric provider quotas remain unconfirmed.

Repeated /alpha calls and pagination make **zero Sera requests**. They read local data and store expiring button contexts. Latest-quote and prefill actions can make the existing intentional quote/metadata requests. ALPHA_ENABLED=false disables scanner collection and UI; alerts keep working.

## 7. Deduplication

One card per directed pair. Qualifying 1h/6h/24h signals and availability/recovery consolidate at one explicit amount. If multiple configured amounts qualify, keep the highest-ranked size's card; do not mix rates from different sizes. Reverse directions remain distinct.

Apply ALPHA_MAX_RESULTS after consolidation (default 12, maximum 12). Three cards per Telegram message, with Previous/Next. Pagination recomputes current freshness/ranking, so positions can change rather than retaining stale results.

## 8. /alpha → fresh quote

A result button uses the existing owner-scoped, expiring quote_intents table to identify pair/amount. The callback obtains a **new uncached Sera quote**; scanner observations, UUIDs and routes are never reused.

The reply shows input, output, explicit direction/rate, API-provided costs, expiry, new fetch time, probe limitations and “시장 상황이 변했을 수 있어 최신 Quote를 다시 조회했습니다.” Foreign-user and expired buttons are rejected before upstream requests. No signature, execution or unattended transaction is prepared.

## 9. /alpha → alert prefill

The same Phase 2 AlertController handles setup. Pair and source-token amount are prefilled; the primary signal suggests movement, recovery or size availability.

Movement still asks the user for their own threshold and a 1/6/24-hour window. Availability/recovery show the existing confirmation screen. No alert exists until the user presses 알림 만들기. Normal /alert supports other conditions/sizes. Market buttons reuse the existing source-token-filtered /markets view.

## 10. Database

Migration 3 adds only scanner_probes, at most 12 configured public probe summaries: resolved spec/key, last attempt/error, last observed time/availability and recovery time. It contains no user IDs or personal alert thresholds.

All history stays in the existing market_observations table and uses Phase 2 retention (72 hours default). Existing quote_intents provide user-owned callback context/TTL. No duplicate history, scanner_events or growth analytics table was added.

Probe summaries/recovery survive restart. Removing a configured probe removes its summary on the next monitor cycle; changing token addresses resets prior state. Phase 1/2 data and delivery behavior remain intact. Tests explicitly upgrade a version 2 database while preserving alerts/history. PostgreSQL remains a future adapter.

## 11–14. Automated validation

Before editing: **54/54 tests, typecheck and build passed**.

Final results:

| Command | Result |
|---|---|
| npm test | **85/85 passed, 0 failed** |
| npm run typecheck | **PASS** |
| npm run build | **PASS** |

31 new tests cover each movement window and sign; exact thresholds/baselines; insufficient history; freshness boundaries; recovery/expiry/errors; quote availability and absence of spread; capped ranking, tie determinism and consolidation; result limits/pagination; Korean/English/empty/partial UI; real grammY routing with mocked Telegram; fresh HTTP quote requests, user/TTL checks, prefill confirmation; no upstream work on repeated reads; shared monitor grouping/budgets; unsupported/minimum/ambiguous tokens; persistence/migration and private-threshold exclusion.

All tests mock external services unless explicitly described below. The original 54 cases remain; only the old /alpha placeholder expectation changed for the implemented feature.

## 15. Live Sera Sepolia check

Ran: node --use-system-ca --import tsx scripts/scanner-smoke.ts.

Observed at 2026-09-16 15:54:40 UTC:

- Live /tokens and /markets validated the configured supported pairs.
- Existing monitor evaluated 3 configured samples with 3 quote requests and no personal alerts.
- Real QUOTE_AVAILABLE cards: 1,000,000 XIDR → USDT and 100 USDC → XSGD.
- USDC/EURC did not yield an available quote at the sampled size.
- Repeated local scanner reads and /alpha made no additional quote requests.
- Result callback made exactly 1 additional quote request and returned a positive fresh quote.
- No historical movement/recovery was seeded or claimed. Empty history naturally yielded availability-only signals.
- In-memory database and synthetic user only. No Telegram client, notification, signature, mainnet request or transaction.

The Windows system certificate store was used without disabling TLS verification. Live observations describe that check time and do not guarantee later testnet liquidity.

Prior Phase 1/2 live checks remain valid historical evidence; they are not live Telegram acceptance.

## 16. Known limitations

- **No live Telegram acceptance:** project's .env has no configured token; no real token was used.
- Only configured samples, not all Sera FX markets. Real movements/recovery require actual history and market changes.
- Quotes include costs and use a probe address; execution for a user's wallet is not established.
- Polling gaps, shared-budget load and delivery work can delay samples; stale rows disappear rather than receiving fabricated updates.
- One process with persistent SQLite; no horizontal scaling, deployment or Docker runtime acceptance was performed.
- Public Sera rate quotas need confirmation before scaling.
- Phase 2 Telegram delivery remains bounded/recoverable, not exactly once after an ambiguous send acknowledgement.

There is no known blocker to the implemented read-only Phase 3 code. A dedicated BotFather token and real chat testing remain necessary before claiming live Telegram acceptance.

## 17. Manual Telegram testing

See [Testing /alpha locally](ACCEPTANCE.md#testing-alpha-locally) for the relocated manual checklist.

1. Keep the existing project .env and database; set your own BotFather token locally.
2. Keep Sepolia, mainnet=false and execution=false; scanner defaults are enabled.
3. Run npm ci, npm run build, npm start. On this Windows host set NODE_OPTIONS=--use-system-ca if needed for HTTPS.
4. In a private bot chat send /start then /alpha. Allow about 60–90 seconds for first collection.
5. Check pair, size, last-check timestamp and reason; availability may appear before movement history exists.
6. Press 최신 Quote 확인 twice; verify new fetch times and no signing/trade UI.
7. Press 알림 설정; choose threshold/window where prompted, explicitly create, and verify with /alerts.
8. Test 시장 보기, available pagination, /language English, /deletealert and restart persistence.
9. Inspect monitor_cycle and scanner/API error events in the terminal. Repeated /alpha reads do not trigger new scans.
10. Movement/recovery testing requires natural qualifying observations; npm test provides deterministic mocked coverage without manufacturing live data.

**Stopped after Phase 3. Do not begin Phase 4 until the user reviews this result.**
