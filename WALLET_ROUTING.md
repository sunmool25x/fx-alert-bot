# OKX routing investigation — 2026-09-17

**Historical first adapter — superseded by [OKX_CONNECT.md](OKX_CONNECT.md).** The owner subsequently tested its mobile button: it opened OKX Exchange home without Web3 approval. The current OKX connector uses the official OKX Connect EVM provider; MetaMask keeps this Reown flow. The findings below record the earlier implementation and must not be read as successful live acceptance.

Scope: connection routing only. Phase 5, execution, mainnet and transactions remain disabled/deferred. The backend Telegram session, ownership challenge, nonce/epoch checks, EOA checks and financial state machine are unchanged.

## Findings before editing

Installed versions: WalletConnect Ethereum Provider **2.25.0**, AppKit **1.8.24**. The configured owner Project ID was used for an isolated localhost chooser inspection; it was never printed. No Telegram authentication, wallet approval or signature was performed in that inspection.

1. The original provider used `showQrModal:true`, a generic AppKit chooser, no Telegram platform routing, no selected-wallet binding and no redirect metadata. Injected/EIP-6963/Coinbase options were disabled. There was **no hard-coded MetaMask fallback** in application code.
2. Actual rendered chooser: searching OKX returned **two identically named OKX Wallet entries**. Selecting the first preserved the OKX heading/logo. The rendered QR's URI started with `wc:`, not a MetaMask URL, and contained no MetaMask reference. This is a protocol pairing URI, not an app-specific launch URL. A QR logo cannot select the receiving OS application.
3. The old application `invalidate()` cleared the backend link but left the provider session intact. `connectAndVerify()` skipped `connect()` whenever that session existed. A previously connected MetaMask could therefore bypass a new selection. This is a verified application defect, now reproduced in a regression test.
4. Installed AppKit's QR view clears in-memory `wcLinking`, but does not remove the persisted `WALLETCONNECT_DEEPLINK_CHOICE` there. Finalizing a QR connection only overwrites that key when `wcLinking` exists. WalletConnect `getDeepLink()` reads the browser key before its own storage; request handling can reopen that stored wallet. A prior MetaMask selection could thus affect the ownership request after an OKX QR connection. This is a verified source-level route, not a captured trace of the owner's phone.
5. Installed UniversalProvider `abortPairingAttempt()` is explicitly deprecated and **a no-op**. Closing the old modal rejects its caller without necessarily retiring the underlying approval. AppKit's mobile decisions depend on UA/coarse-pointer detection, not Telegram's explicit platform field.

**Root-cause confidence:** stale provider reuse, stale app-link routing and incomplete cancellation are established defects. The exact source of the owner's phone's “Open with MetaMask” prompt is **not conclusively reproduced**. It may occur at QR scan/OS dispatch or a subsequent ownership request. We did not inspect the owner's phone, URI, OS association or wallet logs. No claim that a real OKX connection is fixed until owner acceptance passes.

## Official evidence

- [Reown AppKit options](https://docs.reown.com/appkit/javascript/core/options): featured/include wallet IDs, custom mobile links, reconnect configuration. Installed public headless APIs were also inspected; their mobile connect path still uses UA detection and global linking state, so configuration alone did not cover cancellation and Telegram routing.
- [WalletConnect mobile linking](https://docs.walletconnect.network/wallet-sdk/ios/mobile-linking): wallet-specific links and native/universal return concepts. Search excerpts were accessible; a full open redirected to an unavailable endpoint. We do not claim a full read of that page.
- [Reown Sign dapp usage](https://docs.reown.com/advanced/api/sign/dapp-usage): WalletConnect pairing URI delivery and metadata redirect. QR and mobile links are different transport UX for the same protocol session.
- [OKX EVM UI integration](https://web3.okx.com/cs/onchainos/dev-docs/wallet/dapp-connect/app-connect-evm-ui), [SDK integration](https://web3.okx.com/cs/onchainos/dev-docs/wallet/dapp-connect/app-connect-evm-sdk), [preparation](https://web3.okx.com/cs/onchainos/dev-docs/wallet/dapp-connect/app-connect-preparation): direct app connections, universal links, and SDK-specific Telegram return settings. These SDK settings are not undocumented parameters to append to WalletConnect links.
- [OKX troubleshooting](https://web3.okx.com/cs/onchainos/dev-docs/wallet/dapp-connect/app-connect-faq): iOS app opening needs a user gesture; connection and ownership signature should be separate actions. The localized official path returned English technical content when the root English path failed.
- [Telegram Web Apps](https://core.telegram.org/bots/webapps): `WebApp.platform`, user-initiated `openLink`, retained Mini App while opening an external link. [Telegram links](https://core.telegram.org/api/links): `tg://resolve?domain=...` opens a bot chat; this is not proof that a wallet restored the original Mini App.

Reown's official WalletGuide API (`api.web3modal.org/getWallets`, the installed AppKit ApiController endpoint) was read with the configured project. No API response secret or pairing URI is logged. Relevant registry fields:

| Wallet | Exact WalletGuide ID | App link |
|---|---|---|
| OKX Wallet (exposed) | `971e689d0a5be527bac79629b4ee9b925e82208e5168b733496a09c0faed0709` | `mobile_link: okex://main`; `link_mode: https://www.okx.com/download?appendQuery=true&deeplink=okx://web3/wallet/walletConnect` |
| Other OKX entry (not exposed) | `5d9f1395b3a8e848684848dc4147cbd05c8d54bb737eac78fe103901fe6b01a1` | `mobile_link: okxwallet://main`; no link_mode |
| MetaMask | `c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96` | `mobile_link: metamask://`; no link_mode |

Both OKX entries report `com.okex.wallet`. Their names alone do not establish which installed app edition the owner uses. This pass deliberately pins the first universal-link-capable route and exposes OKX/MetaMask, rather than two ambiguous names or unverified other wallets. Other wallet support can be evaluated separately.

## Implementation

- One WalletConnect Ethereum Provider stack, unchanged version. Reown's `wui-qr-code` is reused through the already installed `@reown/appkit-ui` 1.8.24, now declared directly. No `@okxconnect/ui`, wallet SDK fork or alternative financial backend.
- Small application routing/picker layer replaces the generic modal for these two explicit choices. It uses registry links and AppKit's existing URI formatting, including Telegram Android's double encoding, with `WebApp.platform` replacing UA guesses. No invented OKX URL scheme.
- Native Telegram iOS/Android: prepare URI, then show **OKX Wallet로 열기 / Open OKX Wallet**. This deliberate second tap keeps the app launch synchronous with a user gesture. OKX uses the inspected HTTPS universal route through `WebApp.openLink`. MetaMask uses its own native scheme in a new context. Unknown/web/desktop platforms show QR. No automatic wallet launch or same-phone mobile QR.
- Desktop: local Reown QR rendering of the fresh raw WC pairing URI. Never opens a wallet on the computer or supplies a saved MetaMask link. Scan in the selected wallet, not the general camera. A WC URI cannot cryptographically force the phone's chosen handler; phone behavior still needs acceptance.
- Each selection owns a new provider/Core, unique storage prefix and memory-only store. Previous persisted sessions are never restored. An unexpected restored session is disconnected defensively. Legacy AppKit app-link/recent-wallet keys are removed selectively; no localStorage.clear, Telegram cookie or CSRF mutation.
- Cancellation immediately marks the attempt inactive; cleanup disconnects its provider, expires its pairings and closes its transport. Late approval/init completion stays attached to the retired instance, is rejected and cleaned up. A four-minute connection timeout offers retry. No reliance on the SDK's no-op abort method.
- Before ownership and at every ownership async boundary, check active attempt, exact WC pairing topic, unchanged session topic and selected wallet's metadata host. Metadata checks are routing consistency only, not identity proof; unknown/mismatched metadata fails closed. The existing EOA ownership signature remains mandatory. Do not relax this check based on wallet name alone.
- After connection, user explicitly taps **지갑 소유 확인**. After the challenge is ready, a selected-wallet opening button is available for the ownership request. SDK automatic opening is suppressed by clearing its legacy app-link key. Nothing initiates financial signing.
- Mobile-only standard metadata advertises `tg://resolve?domain=world_fx_alert_bot`. It contains no session token, initData, CSRF, trade or wallet identifier. The original Telegram webview retains its same cookie/CSRF and API instance. If wallet return opens the bot chat, switch back to the original Mini App. No anonymous-browser auth fallback; if Telegram destroys the webview, reopen from a fresh bot button and verify again. Desktop QR metadata omits redirect to avoid sending the scanning phone into a different session.

## Development and acceptance

`npm run dev:live` remains the only owner command. New launches watch source/config inputs (debounced, excluding secrets/build output/databases), run tests/typecheck/build, then restart the owned app on the existing tunnel. Build errors stop the live loop safely. The current running server reads static files on each GET, so rebuilding `dist/web` updates a fresh Mini App without restarting it. An already open authenticated Mini App is **not forcibly reloaded**: reload can replay initData or abandon an in-flight wallet approval. Use a fresh bot wallet button after an update.

Automated routing tests mock wallet approvals/app opening and preserve all 190 prior tests. Isolated browser inspection can establish real relay URI issuance and correct controls, not a real wallet connection. See [ACCEPTANCE.md](ACCEPTANCE.md) for explicitly unchecked **Mobile + OKX** and **Desktop + OKX QR** tests. Never log/copy/share WC pairing QR/URI values; they include pairing key material.

Remaining live uncertainties: owner OS/Telegram/OKX edition, universal-link dispatch and Android nested URI handling, actual peer metadata, QR scanning in OKX, and whether the wallet honors Telegram return metadata. No phone approvals, signatures or transactions have been performed by the agent.

## Files in this routing pass

- Frontend: `web/app.ts`, `web/connection.ts`, `web/index.html`, `web/app.css`; new `web/routing.ts`, `web/routing-client.ts`, `web/routing-copy.ts`, `web/wallet-picker.ts`.
- Development: `scripts/dev-live.ts`; new `scripts/live/reload.ts`.
- Tests: `tests/branding.test.ts`; new `tests/wallet-routing.test.ts`, `tests/live-reload.test.ts`.
- Dependencies: `package.json`, `package-lock.json` (declare the existing Reown UI version directly).
- Documentation: `README.md`, `ACCEPTANCE.md`, `STATUS.md`, `THIRD_PARTY_NOTICES.md`; new `WALLET_ROUTING.md`.

Verification: **210/210 tests** (190 prior + 20 new), typecheck and build pass. No backend/financial source changed. Public `/api/health` reports Sepolia, execution false, connector ready true; the served `/app.js` matches the rebuilt bundle. This is readiness evidence only, not wallet acceptance.
