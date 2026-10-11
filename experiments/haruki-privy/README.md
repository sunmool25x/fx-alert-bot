# Offline Privy-style Sera experiment

Independent implementation; no Haruki source copied. Read [Phase 7P](../../PHASE7P.md) for the source/license audit, custody comparison, protocol references, timing assumptions and gated future live plan.

Run from the repository root with the existing dependencies:

```powershell
node --import tsx experiments/haruki-privy/run.ts
node --import tsx --test tests/haruki-privy.test.ts
npm run typecheck
```

The CLI always runs nine **offline synthetic** scenarios. It reads no secrets, connects to no services, creates no real wallet, writes no database and cannot enable execution. No Privy dependency was added. `realPrivySetupGate()` always throws; there is no live-mode environment flag.

Files:

- `fixtures.ts`: ephemeral in-memory fixture signer factory, synthetic quote and pinned deployment fixture.
- `provider.ts`: documented SDK-shaped `wallets().ethereum().signTypedData` facade; snake_case wire serialization; simulated provider.
- `harness.ts`: explicit simulated consent, immutable package, Intent → Permit, local verification, bounded one-submission model and protected unknown/expired outcomes.
- `settlement.ts`: synthetic receipts and balance views checked using the existing settlement verifier.
- `scenarios.ts`, `run.ts`: fake-clock scenario matrix and sanitized aggregate output.

The synthetic private key and signature bytes are never printed, exported or saved. Signature recovery is real cryptography; Privy service latency, relayer acceptance and chain settlement are simulated. Temporary synthetic signatures remain in private object fields only; durable encrypted storage/crash recovery would be required in a separately authorized live implementation.

Quote TTL is 30 seconds and signed deadlines are 300 seconds in these fixtures. No deadline is extended. Consent applies to one package version; refresh requires explicit new consent. A signed or unknown attempt cannot be refreshed or retried. There are no partial-signature fallbacks or live HTTP transports. The experiment's Intent-first order does not change production's Permit-first UI.

`localFixtureSigningWallMs` measures local cryptographic work, **not Privy latency**. Other durations are explicit fake-clock assumptions. Reports distinguish API acknowledgment, inclusion before signed deadlines, and finalized settlement after quote expiry. All three remain fixture evidence.

The root tests import the experiment, so the existing typecheck checks its modules. The production build only includes src/web; it does not ship this experiment. Real Privy credentials, account creation, restricted wallet setup, durable attempt storage, dependency/policy verification and one financial test each remain behind the separately authorized setup plan. Do not enroll or import the existing OKX wallet.
