# FX Alert Bot: branding and Korean UX

Public product: **FX Alert Bot** · **@world_fx_alert_bot**. This is an FX monitoring and personal alert utility. Explain the user's task first; use **Powered by Sera Protocol** as infrastructure attribution. The product does not advertise guaranteed returns or trade automatically.

## Attribution placement

| Surface | Attribution |
| --- | --- |
| `/start` | `Powered by Sera Protocol` at the bottom, after the product explanation |
| `/help` | `FX data and testnet execution infrastructure powered by Sera Protocol.` |
| `/quote` and refreshed quotes | `Quote powered by Sera Protocol` after current terms and limitations |
| `/alpha` | `Market data powered by Sera Protocol` once per feed, never repeated on each card |
| Wallet and trade screens | `Testnet trading powered by Sera Protocol` |
| Trade continuation, preparation, review and status | `이 거래는 Sera Protocol을 통해 처리됩니다.` / `This trade is processed through Sera Protocol.` |
| README, BotFather Description | Product first, infrastructure attribution afterward |

The Mini App title, heading and connector display metadata use FX Alert Bot. Sera contract identifiers, technical module names, the repository/package name and protocol trade IDs retain their actual names. MIT notices, dependency licenses, historical research and technical integration documentation remain intact.

**Authentication exception:** the existing ownership challenge in `src/wallet/auth.ts` still says “Verify wallet ownership for Sera Korea FX Bot. This does not authorize a trade.” It is deliberately unchanged because this pass freezes Phase 4/4.5 authentication and signed messages. This is the historical name of the same application, not a separate Sera wallet product. A future change requires a separately scoped authentication review. WalletConnect display metadata is presentation only; methods, chains, authentication, signing and transaction payloads are unchanged.

## Command audit

| Command | Presentation |
| --- | --- |
| `/start` | Product purpose, six action buttons, Sepolia-only preparation/no automatic trading, subtle attribution |
| `/markets` | Registered FX markets, pair explanation and friendly empty state; registration does not mean an executable quote exists |
| `/rate` | Current **reference** exchange rate, source time and stale warning; no Sera-first headline |
| `/quote` | Latest quote, short definition, input, **minimum received**, derived rate, provided costs, expiry and attribution |
| `/liquidity` | **거래 가능 규모** / Quoted trade sizes; amount checks, not verified total depth |
| `/alpha` | **🔎 지금 확인해볼 FX 조건**; current observed rate, amount, movement, reason and next actions |
| `/alert` | Conversational condition setup, direction, amount, preview and explicit save |
| `/alerts`, `/deletealert` | My alerts, status/delete actions, first-alert button when empty |
| `/wallet` | External wallet connection, no private key or seed phrase sent to the bot, wallet-side approval |
| `/balance` | Testnet wallet balances; Vault balances explicitly excluded |
| `/swap` | Test trade preparation; execution-disabled notice and existing gates retained |
| `/language` | Korean / English selection |
| `/help` | Markets, alerts, wallet/test trades, settings; buttons for FX terms and privacy details |

Start buttons use a small navigation allowlist that routes into existing command handlers. They cannot confirm, sign or submit a trade. Empty-alert buttons enter the existing alert wizard; they never create an alert without confirmation. Quotes, alert ownership and expiring callback contexts keep their existing checks.

## Terminology and accuracy

Definitions live in `src/i18n/glossary.ts`, in Korean and English. Show FX Pair on the markets screen and Quote on the quote screen. Spread, trade size, Limit Order and Vault explanations are available through the help glossary button. Privacy details moved to a help button; the disclosed retention and deletion behavior has not changed.

- **FX Pair:** 서로 교환하려는 두 자산의 조합입니다. 예: USDC/XSGD
- **Quote:** 지금 이 조건으로 예상되는 교환 결과입니다.
- **Spread:** 사려는 가격과 팔려는 가격의 차이입니다.
- **거래 가능 규모:** 현재 조건에서 유효한 Quote를 받을 수 있는 거래 규모입니다.
- **Limit Order:** 원하는 환율을 지정해두는 주문 방식입니다.
- **Vault:** 프로토콜 안에서 자산을 보관하거나 거래에 사용하는 별도 잔액 영역입니다.

The API's verified output is a **minimum**, not an estimated fill or guaranteed execution. Keep 최소 수령액 / Minimum received and the existing calculations. Costs are already reflected in the quoted amount; provided gas cost is not a complete fee breakdown. Reference currency rates differ from amount-specific quoted rates.

No total order-book depth, native spread view/alert, limit-order management or Vault management is claimed. The glossary explicitly distinguishes explanations from currently supported features. Scanner results are past observations for configured amounts. An availability result is not profit, arbitrage or a buy recommendation.

## Scope and release handling

This pass changes copy, display attribution, help navigation and empty-state buttons. It does not change Sera calculations, alert evaluation/cooldowns/deduplication, scanner signals/thresholds, wallet authentication, signing, Permit/Intent payloads, transaction execution, settlement verification, database state machines or safety gates. Execution and mainnet remain disabled; Phase 5 NLU was not started.

Recommended BotFather name, About/short description and Description in both languages are in [ACCEPTANCE.md](ACCEPTANCE.md#recommended-botfather-metadata). They are recommendations only. No Telegram profile metadata changes, bot restart, wallet authorization or live transaction are part of the branding pass.

## Verification

- `npm test`: **190 passed**, zero failed/skipped (172 existing tests plus 18 focused branding/UX tests).
- `npm run typecheck`: passed.
- `npm run build`: passed.
- All 34 core files covered by the before/after hash comparison were unchanged: Sera integration, configuration, database, wallet/authentication, utilities, trade/scanner/alert logic and wallet connection handling. Display renderers were reviewed separately.
- `.env` was unchanged: Sepolia, testnet execution false, mainnet false. No secrets are included in this report.
- Tests mock external services. These results do not claim live Telegram or wallet acceptance. The existing bot process was not restarted; Telegram copy loads on its next normal restart.

## Files changed in this pass

| Area | Files |
| --- | --- |
| Localized copy | `src/i18n/messages.ts`, `src/i18n/alerts.ts`, `src/i18n/scanner.ts`, `src/i18n/wallet.ts` |
| New reusable copy | `src/i18n/branding.ts`, `src/i18n/glossary.ts` |
| Telegram presentation | `src/bot/controller.ts`, `src/bot/view.ts`, `src/bot/alerts.ts`, `src/bot/scanner.ts`, `src/bot/wallet.ts`, `src/index.ts` (command descriptions only) |
| Alert/trade display | `src/alerts/views.ts`, `src/trades/view.ts` |
| Mini App branding | `web/app.ts` (display metadata only), `web/index.html` |
| Existing text assertions | `tests/bot.test.ts`, `tests/alert-bot.test.ts`, `tests/alert-monitor.test.ts`, `tests/scanner-bot.test.ts`, `tests/acceptance.test.ts` |
| New UX coverage | `tests/branding.test.ts` |
| Documentation | `README.md`, `BRANDING.md` |
