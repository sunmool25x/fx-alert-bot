# OKX Web3 connector correction — 2026-09-17

This supersedes the first OKX handoff adapter in [WALLET_ROUTING.md](WALLET_ROUTING.md). The owner tested that adapter on a phone and reported **OKX Exchange home, without Web3 connection approval**. That adapter failed acceptance. The official connector's later result is recorded below.

**Owner update — 2026-09-17:** the official OKX Connect mobile handoff, Web3 connection and backend ownership verification **successfully worked in real Telegram mobile**. This is the owner's reported result, not an agent-performed approval. OS/app versions and desktop acceptance were not supplied. The transport is preserved in the presentation changes below.

## Current — ownership round-trip refinement (Part A)

Inspected call sequence before this change: connection approval resolves in the SDK bridge; WalletFlow shows ownership; a generic verification tap invokes connectAndVerify; only then the backend creates the address-bound challenge, personal_sign is requested, and a separate continuation button can reopen the wallet. Connection and ownership are separate approvals. WalletAuth.challenge requires the approved address and binds the nonce/message to the authenticated session; choosing an unverified address in advance would change that model.

The [official OKX troubleshooting guide](https://web3.okx.com/cs/onchainos/dev-docs/wallet/dapp-connect/app-connect-faq) describes separate non-TON connection/signature messages and a user gesture for each app wake-up, with iOS restrictions on asynchronous deep links. The [EVM SDK guide](https://web3.okx.com/cs/onchainos/dev-docs/wallet/dapp-connect/app-connect-evm-sdk) documents connection/address discovery followed by request. Installed universal-provider **1.9.1** exposes connectAndSign with a prebuilt signing request; it cannot create our address-bound backend challenge before learning the approved account. A reliable one-trip path was therefore **not established or enabled**.

Current flow:

~~~text
Select OKX → continue in OKX → approve connection → return
→ ownership challenge prepared (no prompt/signature)
→ focused “OKX Wallet에서 확인” / “Verify in OKX Wallet”
→ one explicit tap dispatches personal_sign and reopens the existing session
→ user signs ownership only → existing backend verifies → connected
~~~

Two wallet visits remain. There is no repeated wallet selection or generic preparation tap. The same tap dispatches the prepared request before the synchronous mobile handoff; no backend await intervenes. Transport delivery/background behavior still depends on the actual Telegram/OS/OKX client. A clearly labelled **다시 열기 / Reopen** button remains recovery if the app or signature panel did not open; this is not a guarantee of real-device delivery. Desktop requests the proof through its existing session without a local app launch.

Prepared proofs are one-use, locally limited to 90 seconds, and guarded by connector generation, account, account epoch and Sepolia. Cancellation, delayed replies and account/session changes cannot sign or verify a new account with an old challenge. Backend nonce consumption, expiry, address verification and session binding are unchanged. No Permit/Intent, financial signing, transaction request, vendor upgrade or connector/return-link change. The ownership message itself remains unchanged.

**Sequential gate:** Part A passed **260/260 tests** (251 originals + 9 refinement tests), typecheck and production build before Phase 5 implementation began. Browser fixture verified focused ownership action and success; the owner must verify the newly combined tap on their real phone.

## Phase 4.6 — wallet connection UX

Historical interface snapshot; the current ownership refinement above supersedes its second-step button.

The Mini App now uses one native modal dialog: a bottom sheet on narrow/mobile screens and a centered panel on desktop. The wallet screen remains behind it. Only OKX Wallet and MetaMask are offered, using clearly labelled text monograms rather than invented brand logos. Korean/English copy, Telegram theme colors and changes, dark/light fallbacks, safe-area spacing, 48px primary targets, keyboard dismissal/focus restoration and reduced motion are supported without a UI framework or new dependency.

```text
DISCONNECTED → SELECT WALLET → PREPARING → CONTINUE IN WALLET
             → WAITING APPROVAL → OWNERSHIP EXPLANATION
             → USER REQUESTS OWNERSHIP SIGNATURE → SUCCESS → CONNECTED
Cancel → retire current attempt → DISCONNECTED
Timeout / rejected verification / failed handoff → explanation → fresh selection
```

The second mobile gesture is intentional: the relay prepares the official link asynchronously after wallet selection. App opening must happen synchronously in a user tap for reliable iOS/Telegram dispatch, as described in the [OKX troubleshooting guide](https://web3.okx.com/cs/onchainos/dev-docs/wallet/dapp-connect/app-connect-faq). **OKX Wallet에서 계속 / Continue in OKX Wallet** therefore appears on a distinct connection screen. There is no timer-based app launch or automatic signature. The existing SDK link and Telegram return parameters are unchanged. Desktop retains one QR. The same existing user-triggered ownership challenge remains separate from all financial approvals.

Cancel/back retires the current connector through the existing cancellation API. Closing **success** only dismisses the sheet and preserves the verified connection. Account/disconnect events clear the presentation as well as invoking the existing invalidation. Raw provider errors and diagnostic codes are not displayed in the connection sheet; known codes stay in diagnostics. Auth expiry directs the user to a fresh Telegram `/wallet`, without an authentication fallback. Balances keep the verified address visible. The Telegram chat card's new balance button calls the existing read-only balance handler.

**Verification:** 231 previous tests preserved, 20 new UI/state/theme/chat tests added. Browser inspection uses the real app/components with a local fixture replacing Telegram, backend and connector responses. It covers light/dark, a 390px mobile viewport, selection, OKX/MetaMask continuation, ownership explanation, success, balances and cancellation. Those mocked previews do not establish real-device UX acceptance. See the unchecked [Wallet UX Acceptance](ACCEPTANCE.md#wallet-ux-acceptance) checklist. No financial signing or transaction was performed.

## Exact previous route and diagnosis

The actual `walletLink()` output was reproduced using a synthetic WC fixture before editing. The safe route shape was:

```text
https://www.okx.com/download?appendQuery=true&deeplink=okx://web3/wallet/walletConnect/wc?uri=[REDACTED_PAIRING]
```

Source: our `web/routing.ts` adapter combined Reown WalletGuide entry `971e689d0a5be527bac79629b4ee9b925e82208e5168b733496a09c0faed0709`'s `link_mode` with AppKit-style `/wc?uri=` formatting. It URI-encoded the WC payload once on iOS and twice on Telegram Android. The outer target was **`www.okx.com/download`**. A nested `okx://web3/...` string and the pairing payload were present; their presence did not prove that the phone delivered them to the intended Web3 handler. The adapter was responsible for constructing this route.

The owner established that this route opened the exchange surface. We cannot establish whether OS dispatch, download-page handling, nested-link parsing, or the installed app dropped/misinterpreted the payload without a phone trace. We do not claim that the Web3 path or WC payload was literally absent. The defect was relying on this generic download/deeplink wrapper as a verified Web3 connection entry point.

## Current official sources and decision

- [OKX EVM SDK documentation](https://web3.okx.com/cs/onchainos/dev-docs/wallet/dapp-connect/app-connect-evm-sdk): `@okxconnect/universal-provider`, EVM `eip155` namespaces, connection `sessionConfig.redirect`, request `redirect`, and generated `display_uri`. Published minimum **OKX App 6.88.0**. The API is universal with documented EVM support; no TON API is used.
- [OKX EVM UI documentation](https://web3.okx.com/cs/onchainos/dev-docs/wallet/dapp-connect/app-connect-evm-ui): an optional larger UI package and UI-specific return options; its guide says **6.90.1**. It was inspected but **not installed**. We do not copy UI/TON configuration into the universal provider.
- [OKX troubleshooting](https://web3.okx.com/cs/onchainos/dev-docs/wallet/dapp-connect/app-connect-faq): synchronous user gestures for app opening and separate connection/signature actions.
- [Telegram Mini Apps](https://core.telegram.org/bots/webapps): platform selection and external `openLink` without transferring Mini App credentials.
- Reown's installed WalletGuide metadata and AppKit routing were inspected in the previous pass. No verified Reown-only route solving this owner's exchange-home failure was found. A raw WC URI is not interchangeable with an OKX Connect session topic.

The official npm artifacts for **1.9.1** were inspected before integration. Their published types/source are the implementation contract where examples differ: initialization uses lowercase **`dappMetaData`** in this version, although some website examples use uppercase `DAppMetaData`. `ConnectWalletType.OKX_APP_COMMON` is the public SDK value **130**. Its generated universal link is:

```text
https://web3.okx.com/ul/connect?topic=[SDK_TOPIC_AND_SUFFIX]
```

This is produced by OKX Connect's `getOKXLink`/`display_uri` after its EVM connection request is prepared on the official relay. The application passes it **unchanged** to Telegram's opener or the desktop QR renderer. It does not append a WC URI, build an undocumented scheme, or use the exchange download page. For reopening the wallet during ownership approval, the SDK supplies the same Web3 connect path without a new pairing query.

## Dependency scope and attribution

Added exactly one direct dependency: **`@okxconnect/universal-provider@1.9.1`**, MIT in published metadata. The lockfile adds 35 package entries in total: this provider, `@okxconnect/core@1.9.1`, and 33 other transitive entries. No package was removed. Reown/AppKit/WalletConnect versions remain unchanged. `@okxconnect/ui` is not installed.

The provider is used only for self-custodial wallet session transport and forwarding explicitly requested wallet methods. No exchange account/login API is used. The existing backend remains the only wallet-ownership and trade-authorization system.

The two OKX packages identify **OKX Wallet** as author and MIT as license, but ship no top-level LICENSE file. The build preserves their package attribution/license metadata, their published bundled third-party notices, and installed dependency agreements in `THIRD_PARTY_LICENSES.txt`. Existing MIT/Haruki and Reown notices remain. No vendor source file is edited. The SDK's upstream dependency tree includes deprecated `core-js@2` and `crypto-js`; these were not silently upgraded or replaced. This dependency and app-version compatibility need review before a broader release.

## Connection and lifetime handling

- Selector: **OKX Wallet → OKX Connect**; **MetaMask → existing Reown flow**. One connector and one QR flow are active at a time.
- Telegram iOS/Android: prepare the SDK session, then show **OKX Wallet에서 계속** inside its dedicated connection sheet. The tap synchronously opens the SDK's Web3 universal link. No same-device QR, copied URI, MetaMask fallback or exchange-navigation instructions. An explicit second tap avoids losing the iOS user gesture during async relay setup.
- Desktop: one QR encodes the SDK-generated URL. Scan inside OKX Wallet's **Web3 scanner**. No desktop app launch, competing Reown QR or Telegram redirect on the scanning phone.
- The SDK has a global singleton and storage restore behavior. Each attempt runs in its own hidden same-origin frame, with a frame-local memory implementation of localStorage installed **before importing the SDK**. It never loads a previous OKX session or reads/clears Telegram/Reown storage. This isolates lifetime/state, not an untrusted-code security boundary.
- A fresh transferred **MessageChannel** belongs only to that frame. Initialization checks parent source and exact origin. No initData, cookie value, CSRF token, bot token, server RPC secret or trade authorization is passed to the SDK. Frame URLs contain no credentials or attempt token.
- Cancellation closes the channel/removes the frame, rejects outstanding operations and makes late responses inert. Four-minute connection and two-minute request timeouts permit retry. Each new selection starts fresh; duplicate/incorrect topics and replaced sessions fail closed.
- The SDK's exact session topic must match its generated link's topic plus SDK suffix. EVM namespaces, default chain and accounts must be Sepolia; a returned address alone is insufficient. Account changes feed the existing account invalidation event.
- After connection, an ownership-only explanation precedes **지갑에서 확인**, using the unchanged server challenge → `personal_sign` → server signature verification path. The original cookie/CSRF stay in the parent Mini App. No automatic financial signing. Direct transaction-sending SDK methods are rejected by the adapter.
- Official EVM return configuration is `sessionConfig.redirect: "tg://resolve"` and request `redirect: "tg://resolve"` for mobile, `"none"` for desktop. This is not UI `tmaReturnUrl` or a TON method. Return may open Telegram rather than the exact Mini App; switch back to the original open view. If Telegram destroys that view, start with a fresh bot button and ownership proof; no anonymous-browser fallback.

## SDK diagnostics and HTTP changes

The inspected SDK has raw console output, including full connection links. Its separate build strips console calls; the public reporter's sending methods are disabled before initialization. The frame's CSP permits only the three SDK relay WebSocket endpoints and self-hosted script/image assets, blocking telemetry HTTP destinations. No debug-output capture or pairing URI logging is added.

The HTTP server change is limited to serving `okx-bridge.html`, `okx-bridge.js`, and a local 180×180 FX icon, permitting its own frame, and applying the relay-only frame CSP. Telegram initData validation, CSRF/origin/host checks, backend ownership nonces/epochs, Sepolia, allowlist, trade confirmation, Permit/Intent validation, submission deduplication and settlement code are unchanged.

`npm run dev:live` remains the sole owner command. Its existing build invokes the new bridge bundle and carries its notices automatically. No manual tunnel or origin copying is introduced. The server must load the static-route/CSP change; the running development process is reloaded as part of this update. Do not forcibly refresh a Mini App with an in-flight approval; open a fresh `/wallet` screen.

## Historical — initial connector verification before owner acceptance

All **210 previous test cases remain**, with two old link expectations corrected for the new SDK target. **21 added cases; 231/231 tests pass**, with no failures/skips/cancellations. Typecheck and build pass, including the complete live-launcher check after the final UI edit. Added connector and HTTP asset/security tests cover dispatch, unmodified SDK payload/link, exchange URL rejection, mobile versus single desktop QR, Telegram return, cancellation/retry/late results, same-backend ownership, account changes, execution/mainnet OFF, memory lifetime, and CSP/auth boundaries.

Isolated browser inspection obtained an actual SDK relay connection link and rendered mobile controls and one desktop QR. App opening was mocked. No Telegram identity, real wallet connection approval, ownership signature, trade signature or transaction was performed by the agent. The owner must test actual phone dispatch, the Web3 approval surface, SDK account response and Telegram return. The mobile and desktop acceptance checks remain unchecked.

The sole live launcher was restarted successfully and reports readiness; the public app, bridge and icon match the final build, with the relay-only bridge CSP in place. Execution remains false on both local and public health checks. The saved `.env` hash is unchanged. Every backend source except the server's static asset/CSP portion is unchanged; the server's entire authentication and financial API handler portion is identical to the task baseline.

## Files changed in this correction

This list is compared with the worktree at the start of this task; earlier uncommitted implementation files are preserved.

- Dependencies/build: `package.json`, `package-lock.json`, `scripts/build-web.mjs`.
- Connector and interface: `web/connector-types.ts`, `web/connectors.ts`, `web/okx-protocol.ts`, `web/okx-connector.ts`, `web/okx-bridge.ts`, `web/okx-bridge.html`, `web/wallet-icon.png`, `web/routing.ts`, `web/routing-copy.ts`, `web/wallet-picker.ts`, `web/app.ts` (type only).
- Static serving/CSP: `src/wallet/server.ts`.
- Tests: `tests/okx-connector.test.ts`, `tests/okx-assets.test.ts`, `tests/wallet-routing.test.ts`.
- Documentation: `README.md`, `ACCEPTANCE.md`, `OKX_CONNECT.md`, `WALLET_ROUTING.md`, `STATUS.md`, `THIRD_PARTY_NOTICES.md`.
