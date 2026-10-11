# Phase 7P — isolated Privy server-wallet experiment

2026-10-11. **A — PRIVY_TESTNET_POC_READY, OFFLINE ONLY.** The independent harness passes synthetic cryptographic and timing checks. It does not establish real Privy latency, Sera relayer acceptance, or on-chain settlement. No new wallet, account, financial authorization, submission, retirement or live migration was created. Existing OKX ownership, financial locks and execution permissions remain unchanged.

## Upstream audit and reuse boundary

Audited [mashharuki/Sera-Telegram-Bot](https://github.com/mashharuki/Sera-Telegram-Bot/tree/be50b4711c2665090769ebd1ac408d5629facf24), pinned to `be50b4711c2665090769ebd1ac408d5629facf24`, rather than assuming the older sample is the same project. GitHub reports `license: null`; the recursive tree has no LICENSE/COPYING file, package.json has no license field, and README declares no license. **Permission for source modification/redistribution/derivatives is not established. No upstream implementation was copied.** The older sample's MIT attribution remains intact; it does not grant rights to this separate repository. Our experiment is independently written using official interfaces and our existing validated protocol modules. Private reference downloads are excluded from Git.

| Area | Source finding and limit |
|---|---|
| Consent | [callbacks.ts](https://github.com/mashharuki/Sera-Telegram-Bot/blob/be50b4711c2665090769ebd1ac408d5629facf24/src/bot/callbacks.ts) consumes an owner-bound pending action only after Telegram confirmation. [pending-actions.ts](https://github.com/mashharuki/Sera-Telegram-Bot/blob/be50b4711c2665090769ebd1ac408d5629facf24/src/services/pending-actions.ts) checks user, expiry and consumption; repository conditional UPDATE makes consumption single-use. Expiry is checked before that UPDATE, not again afterward. |
| Wallet | [signer.ts](https://github.com/mashharuki/Sera-Telegram-Bot/blob/be50b4711c2665090769ebd1ac408d5629facf24/src/privy/signer.ts) creates Ethereum wallets mapped to Telegram users. Optional application P-256 authorization key becomes owner; omission creates owner-less wallets. No wallet policy or separate signer scope is assigned in this path. |
| Signatures | [swap-service.ts](https://github.com/mashharuki/Sera-Telegram-Bot/blob/be50b4711c2665090769ebd1ac408d5629facf24/src/services/swap-service.ts) reads Sera config, constructs canonical Intent types, signs route_params, then signs the returned Permit. Privy uses `wallets().ethereum().signTypedData(walletId, {params:{typed_data:…}})` with `primary_type`. No repeated external wallet handoff is required by that backend path. |
| Authority | Signing calls omit `authorization_context`; export/import supplies the configured key. A source comment claims app-secret signing of owned wallets was live tested. That comment is not independently verified compatibility with current Privy authorization settings. This must be tested for a new restricted wallet, never assumed. |
| Expiry/economics | Quote TTL is displayed and checked at confirmation, but no fresh expiry/budget check follows config retrieval or either signature. Missing/invalid expiry falls back to local now + 30 seconds. The fee formatter looks for generic total_fee/fee_summary, otherwise says included in rate; no exact cost-consistency gate is evident. We reproduce none of these weaker checks. |
| Requote | Stale submission errors create a new card; callback presents a new Confirm button. This does require renewed confirmation rather than silently signing the replacement quote. It does not account for the prior financial signatures' residual authority. |
| Retries/errors | [Sera client](https://github.com/mashharuki/Sera-Telegram-Bot/blob/be50b4711c2665090769ebd1ac408d5629facf24/src/sera/client.ts) retries HTTP 429 up to twice, including /swap; transport exceptions bubble to a generic callback catch that logs the error object. No durable unknown-submission reconciliation or signature-evidence ledger is shown in this swap path. |
| Success | SwapService ignores the submit response's status/trade_id and returns success with the quoted minimum as received. The result schema makes all acknowledgment fields optional. Its mocked tests return success/trade_id; these are not chain evidence. |
| Settlement | [tx-wait.ts](https://github.com/mashharuki/Sera-Telegram-Bot/blob/be50b4711c2665090769ebd1ac408d5629facf24/src/services/tx-wait.ts) waits for receipts for other broadcast flows, but SwapService does not call it. No independent swap receipt/finality/transfer/balance reconciliation is demonstrated. **Publicly evidenced finalized swap in this audited material: no.** This does not assert that Haruki has never completed a swap. |
| Key transfer | [wallet-key-service.ts](https://github.com/mashharuki/Sera-Telegram-Bot/blob/be50b4711c2665090769ebd1ac408d5629facf24/src/services/wallet-key-service.ts) can export a plaintext key to its caller or import a supplied key and replace the user wallet. The source describes display/auto-deletion. This is outside our experiment and is not an acceptable recovery channel for our existing users. |
| Credential storage | Upstream README explicitly lists plaintext Sera API secrets in its database as a limitation, with encryption deferred. The Privy client receives appId/appSecret; no evidence here establishes production secret-manager controls. Its README manual E2E checklist and example wallet link are not finalized swap receipts. |

## Custody and compromise model

| Question | Existing OKX flow | Haruki-style application-controlled Privy wallet |
|---|---|---|
| Who authorizes? | Owner approves each EIP-712 request in their external wallet. | Backend invokes signing after an application-level Telegram consent check; that check is not an independent wallet veto. |
| Who can initiate? | Bot prepares requests; owner controls private-key signing. Signed authorizations still need strict storage/submission controls. | Application credentials plus the wallet's configured owner/signer authority can request signatures without mobile interaction. |
| Compromised backend | Can misrepresent requests or leak already signed material, but has no owner's private key. Wallet review is still essential. | Could authorize operations across all wallets within its credentials' authority. Shared app-owner credentials widen the blast radius; Telegram consent code alone cannot contain a compromised backend. |
| Credential protection | No server EOA private key. Encrypted authorizations and wallet sessions still sensitive. | Protect app secret and authorization keys separately; use restricted signer identities, separate owner control/KMS or quorum, least privilege, redacted errors and short retention. Our repo holds none of these credentials. |
| Recovery/export | Existing owner's wallet recovery remains external. | Owner-controlled recovery must be deliberately designed. Export creates a new plaintext-key exposure surface; do not send keys in Telegram or import the owner's OKX wallet. |
| Revocation/limits | Removing a connection does not revoke a signed Permit or on-chain allowance. | Removing signer access limits future signing; it does not revoke signatures already produced. A backend holding full owner power can also change policies, so owner authority must be separated from a constrained runtime signer. |

Privy's current [owners/signers documentation](https://docs.privy.io/controls/authorization-keys/owners/overview) distinguishes full owner control, including export and policy changes, from restricted signers. Its [policy engine](https://docs.privy.io/controls/policies/overview) supports method, network and EIP-712 constraints with default-deny rules. These are capabilities, not policies configured or tested here. [Server authorization context](https://docs.privy.io/controls/authorization-keys/using-owners/sign/signing-on-the-server) supports authorization keys, user authorization and custom signing functions. A server-wallet option changes who controls signing even if the underlying wallet key remains inside Privy's service.

An optional wallet type is technically plausible only as a separately disclosed, opt-in product with isolated credentials, state and reviewed custody/recovery policy. No adapter was added to the production app. Faster programmatic signatures do not fix the existing OKX handoff/timing constraints.

## Official compatibility and evidence

Current [Sera swap API](https://docs.testnet.sera.cx/api-reference/endpoints/swaps/) specifies:

- POST /swap/quote takes owner, recipient, raw input, token addresses, signed expiration and gas_mode. Returned expires_at is approximately 30 seconds; signed deadlines are separate.
- Wallet-deposit quotes require their Permit even with standing allowance. The reported nonce can include accepted-but-unmined swaps. Our isolated first-attempt policy requires no pending swaps and an exact on-chain nonce match.
- The quote UUID identifies POST /swap's cached record. route_params.uuid is the distinct composite uint256 in the Intent; neither is regenerated from the other.
- POST /swap carries exactly uuid, signature, permit_signature and permit_deadline for this path. Pending trade_id is an acknowledgment, inspectable through GET /orders/{order_id}; it is not a receipt.
- A valid complete submission must reach the service while the quote remains available. Network delays can invalidate a locally timely dispatch. Contract execution must meet the signed deadlines; finality can arrive later.

The documentation's 409 suggestion to silently re-quote is **not adopted**: any changed package requires renewed user review, and unknown or signed attempts remain protected. No undocumented extension/reservation endpoint was invented. Relayer queue/inclusion guarantees and safe recovery after a lost acknowledgment are not established.

Existing [contract schemas](src/trades/contract.ts), [Intent verifier](src/trades/intent-protocol.ts) and [Permit verifier](src/permits/protocol.ts) are reused unchanged. Intent field order is taker, inputToken, outputToken, maxInputAmount, minOutputAmount, recipient, initialDepositAmount, uuid, deadline; deadline is uint48, other amounts/UUID are uint256. Permit order is owner, spender, value, nonce, deadline, with uint256 integers. Both serialized wire objects explicitly include EIP712Domain. Synthetic amount is exactly 50,000,000, recipient equals signer, and Permit spender is the existing verified SOR.

At 07:29:24 UTC, official [public config](https://api.testnet.sera.cx/api/v1/config) and independent PublicNode/dRPC read-only calls agreed with the existing addresses. Sera's domain is Sera / 1 / 11155111 / `0x83475A1bD98a8DC2DCd507A747e4DC85da241D6e`. The USDC contract at `0x965d4b4546716e416e950bc30467d128455d2d0e` reports CIRCLE; CIRCLE / 1 / 11155111 hashes to its DOMAIN_SEPARATOR. The API documentation's illustrative USD Coin / 2 must not override deployed metadata. SOR remains `0x83c1368110B640A729f3810De5FBe94b99aa5668`; XSGD remains the existing pinned token. No owner nonce or historical signature was sent to an external service in this experiment.

Upstream declares @privy-io/node ^0.25.0. The current registry package 0.35.0 and [official typed-data interface](https://docs.privy.io/wallets/using-wallets/ethereum/sign-typed-data) were inspected. The downloaded SDK's actual Ethereum service was invoked **with a mock rpc object only**: both requests used eth_signTypedData_v4, chain_type ethereum and the same nested params as our facade; both synthetic signatures recovered correctly. No SDK was installed into the project or production dependency tree. Package dependencies include jose, svix, lru-cache, HPKE, noble/scure and canonicalize; this inspection is not a full dependency security audit or authenticated Privy service test. A future installation needs a pinned lockfile and dependency audit.

## Reproducible offline experiment

See [experiments/haruki-privy](experiments/haruki-privy/README.md). No environment switch, HTTP client, live SDK client, wallet import/export, database access or production entry point exists. All signing accounts use ephemeral synthetic keys kept in memory and never exported. The harness follows **Intent then Permit** to study Haruki's ordering; production OKX remains Permit then separately approved Intent.

Explicit simulated approval binds one immutable quote version. Each signature crosses the serialized Privy-shaped interface and is recovered against the original digest with canonical signature checks. Exact amount, tokens, owner, spender, nonce, domain, UUIDs, costs and deadlines are validated. Expired-before-consent requires an explicit refresh and new consent. Partial signatures, unknown callbacks and ambiguous submission remain locked. No retry, silent requote or signature rebinding occurs. Signed synthetic results remain private in memory; this is not a durable live signing service.

The receipt fixture exercises the existing SOR event/struct-hash verifier, successful canonical finalized receipt, net token transfers, two matching fixture views and before/after balances. These are generated fixtures, not RPC evidence. Inclusion is modeled before the signed deadline; finalization happens afterward. This explicitly tests that receipt status, a transaction hash, or API acknowledgment alone cannot prove the intended settlement.

## Timing results: assumptions, not real Privy measurements

All durations below are deterministic fake-clock inputs. Quote validity starts at the beginning of retrieval, conservatively charging the entire request delay. Signature wall-clock work is separately measured for local fixture cryptography only and does not estimate Privy HTTP latency. In one local run, each fixture signature took approximately 0.4–1.9 ms; variable machine measurements are not acceptance thresholds.

| Scenario | Quote / human / Intent / Permit (s) | Verify / preflight / ack (s) | Dispatch / ack elapsed (s) | Outcome |
|---|---|---|---|---|
| FAST | 0.30 / 2 / 0.15 / 0.15 | 0.05 / 0.30 / 0.50 | 2.95 / 3.45 | Fixture accepted and finalized |
| NORMAL | 0.75 / 7 / 0.80 / 0.80 | 0.10 / 0.90 / 1 | 10.35 / 11.35 | Fixture accepted and finalized |
| SLOW | 0.75 / 23 / 0.80 / 0.80 | 0.10 / 0.90 / — | — / — | Five-second submit margin blocks; quote not yet expired |
| NETWORK DELAY | 4 / 7 / 0.80 / 0.80 | 0.10 / 5 / 15 | 17.70 / — | Server receives after TTL; fixture rejects at 32.70 s |
| PRIVY SIGNING DELAY | 0.75 / 7 / 11 / 11 | 0.10 / — / — | — / — | Both signatures verified, quote expired, locked |
| EXPIRED BEFORE CONFIRMATION | 0.75 / 31 / — / — | — / — / — | — / — | Zero signatures; new review required |
| EXPIRED DURING SIGNING | 0.75 / 7 / 0.80 / 23 | 0.10 / — / — | — / — | Late Permit verified, no submit, locked |
| RELAYER TIMEOUT | 0.75 / 7 / 0.80 / 0.80 | 0.10 / 0.90 / 20 | 10.35 / unknown | One request; result unknown, no retry |
| UNKNOWN SUBMISSION | 0.75 / 7 / 0.80 / 0.80 | 0.10 / 0.90 / 1 | 10.35 / unknown | One request; result unknown, no retry |

Accepted scenarios assume inclusion 10 seconds after acknowledgment and finality another 600 seconds later. FAST finalizes at 613.45 seconds and NORMAL at 621.35 seconds, after quote and Permit deadlines; modeled inclusion itself precedes those signed deadlines. Inclusion delayed beyond the signed deadline fails even if acknowledgment succeeded.

The five-second buffer is our experiment's conservative pre-dispatch rule, not a promise of network delivery. NORMAL has 19.65 seconds left at dispatch. With other NORMAL assumptions, human review must take less than 21.65 seconds to retain this buffer. There is no latency distribution, p95/p99 bound or reliability conclusion from nine fixtures.

[Phase 7O-PREP](PHASE7O_PREP.md) measured 29.219–29.351 seconds of quote life after preparation and a historical real OKX Permit path of 12.221 seconds. Its full-mobile conservative admission requirement was 28.221 seconds; there was effectively no comfortable review window after mandatory preflight. Replacing handoffs with backend calls can remove that component **for a newly authorized server wallet**, but both real Privy signature timings and real relayer latency remain unknown. The existing OKX blocker is unchanged.

## Future test plan and setup gate — not performed

1. Obtain separate owner authorization for a dedicated free development app and **new** server wallet. Keep existing OKX, database and lock completely separate. No existing key import or export. Confirm technical custody/recovery obligations before enrollment.
2. Use a separate restricted runtime signer, with ultimate owner/policy authority outside the runtime. Enforce Sepolia-only domains, exact USDC/SOR Permit limit, same-wallet recipient, exact Sera Intent fields, bounded deadline and one attempt. Deny native transaction signing, raw/personal signing, key export and unrelated methods. Verify actual EIP-712 policy field support and denial tests; stop if these constraints cannot be enforced. A per-signature limit alone does not enforce a cumulative one-trade limit.
3. Store credentials outside Git/logs and use an isolated encrypted attempt store with atomic durable reservations and crash recovery before any real financial request. Pin/audit the SDK. Disable SDK-level request retries for financial signing; verify request authorization and wallet controls rather than relying on upstream comments. The present in-memory PoC cannot be promoted to live by changing a flag.
4. Fund only the newly approved test wallet with the minimum viable test-token inventory for one selected swap; use the live minimum/cost gate. The faucet can distribute far more than one trade: do not claim minimal inventory if using such a faucet, and arrange limited test funding instead. No real-value deposits, paid funding or existing acceptance-wallet transfers without separate authorization.
5. Measure read-only checks first, then show a fresh full quote and explicit consent that authorizes both programmatic signatures and **one** submission for that immutable package. Do not start if a documented/measured remaining-window budget is insufficient. If the quote changes or expires, stop; never extend it locally. If signatures already exist, reconcile residual authority before any new attempt.
6. Verify both actual Privy signatures locally and against deployed domain/digest/nonce constraints, then make one separately authorized POST /swap. Persist acknowledgment safely; timeout becomes UNKNOWN, never a retry. Do not treat success/pending/trade_id as received funds.
7. Reconcile via read-only order status and two independent RPCs: canonical finalized successful receipt, exact SOR event with Intent **struct hash**, owner/token/recipient transfer bounds, historical before/after balances and reorg checks. Track failures/unknowns separately. Stop after this one attempt, review residual allowance/nonce, and disable the test signer; do not automatically revoke on-chain permissions.

The [current Privy pricing page](https://www.privy.io/pricing) lists a $0 Developer tier for 0–499 MAU, 50,000 monthly signatures and $1M transaction volume. This makes a small isolated test potentially free within the stated limits. Actual account eligibility, configured policy availability and billing settings were not tested. No account, credentials, wallet, purchase or live financial request was created. There is no published signing-latency guarantee established here.

## Sera inquiry — prepared, not sent

**Inquiry still needed: yes, for the existing user-controlled mobile path and delivery/settlement ambiguity.** The server-wallet fixture is plausible under fast assumptions, so it does not establish a protocol-wide timing impossibility. It also cannot establish live server-wallet success.

Suggested technical question:

> We observe roughly 30 seconds of cached quote validity and wallet-funded quotes requiring Permit plus Intent. Our user-controlled mobile Permit acceptance took 12.221 seconds; two independent wallet handoffs plus validated preflight leave an unreliable review window. A server-wallet fixture removes handoffs but is not a live latency result. Is there a documented protocol-supported method to retain an explicitly reviewed immutable package long enough for mobile authorization, without extending expires_at locally or replacing the quote after consent? At what exact server boundary is quote validity checked, what accepted-to-inclusion deadline guarantees exist, and what read-only correlation is supported when POST /swap may have succeeded but its acknowledgment is lost? We require renewed consent for changed economics and will not automatically resubmit an ambiguous attempt.

## Validation and publication

Targeted tests **43/43**, complete suite **926/926**, typecheck and build pass. Audit reports the same 3 moderate inherited findings in @stablelib/ed25519 and the OKX dependency chain, no available fix, zero high/critical; no dependencies changed. Gitleaks and publication/configured-secret scans pass. All 13 financial/wallet/history tables match the consistent pre-task backup; integrity is ok with zero foreign-key errors. Encrypted Permit evidence and active lock, schema 14, funding history, environment and runtime origin are preserved. Zero trade sessions/submission attempts remain. Public HTTPS health/page checks return 200 with execution OFF and the same origin. The initial health probe overlapped the launcher's rebuild; the completed runtime passed without replacing the tunnel.

The complete public diff is limited to this report, the experiment, its tests and documentation. No financial configuration or production implementation files are changed. The validated milestone is eligible for the owner's standing ordinary commit/push policy; the final response records the resulting commit and independently verified remote SHA. Source publication does not authorize the future test plan.

**Exactly one recommended owner action:** review and authorize the isolated, free Privy test-wallet setup described above, without authorizing a trade yet. Do not initiate another OKX Permit or clear its historical lock.
