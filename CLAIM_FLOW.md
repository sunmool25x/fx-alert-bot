# Transparent Sepolia test funding

FX Alert Bot prepares a test funding request inside the Telegram Mini App. The acceptance path now uses this review and the existing connected OKX wallet; it no longer uses Etherscan's Write Contract UI. Etherscan is a read-only source/explorer reference only.

**One real owner-approved claim has reached `CLAIM_BALANCES_VERIFIED`.** Its successful finalized transaction was reconciled from the existing persisted hash. No second claim or swap was submitted. `STATUS.md` and `ACCEPTANCE.md` now record this verified funding result; swap acceptance remains incomplete.

## Verified contract and units

- Official provenance: [Sera testnet quickstart](https://docs.testnet.sera.cx/quickstart/).
- [Explorer-verified IssueTestTokenV3](https://sepolia.etherscan.io/address/0x4FAc3BB8B77547E2Da7ed903baDBeD2f46cBe65a#code), Solidity source SPDX MIT.
- Network: Sepolia, chain ID `11155111` (`0xaa36a7`).
- Destination: `0x4FAc3BB8B77547E2Da7ed903baDBeD2f46cBe65a`.
- Function: nonpayable `claim()`, no arguments; calldata `0x4e71d92d`; ETH sent `0`.
- Runtime bytecode independently matched to the explorer's deployed bytecode on 2026-09-17: 7,331 bytes, keccak256 `0x0ae33dcb33b9e3e81b944422b11fcadc2541f3656d680c46823534717ebedcf8`.
- USDC: `0x965d4b4546716e416e950bc30467d128455d2d0e`; XSGD: `0x058e06ca2628165a6cd1e80e4dc82203dc0020aa`; both have 6 decimals.

The live contract's `claimAmount()` is **1,000,000,000,000,000 raw units**, equivalent to **1,000,000,000 displayed test tokens each**. The task's initial “1,000,000,000 base units” expectation was incorrect. The UI shows the actual verified allocation; technical details include raw units. `ethPerUser()` is 0.01 Sepolia ETH. Claiming pays gas separately and can result in a smaller net ETH increase.

The fixed faucet call processes its configured token bundle, including tokens other than USDC/XSGD (117 token entries at independent verification). It is not a configurable token purchase. Token inventory can run out and allocations can be deferred by the contract. The app requires simulations to demonstrate receipt of both required tokens and the ETH allocation before releasing a wallet request. It does not promise receipt of every other token in the bundle.

## Ownership and transaction boundaries

No new secret, signer, private key, wallet selection flow, or network configuration was introduced. Existing Telegram authentication, CSRF/same-origin checks, short-lived ownership proof, session epoch, account binding, allowlist and wallet-origin protections still apply. The faucet is available only when wallet readiness is configured, the user is on the existing execution allowlist, Sepolia is active, and **swap execution is disabled**. Configuration already rejects mainnet.

The server and client build/validate exactly one bounded native transaction. HTTP callers supply no destination, calldata, value, gas or recipient. Unknown fields are rejected. The OKX connector and isolated SDK bridge independently validate the fixed claim against the connected account. Other native sends, approvals, deployments and arbitrary calldata remain blocked. The same existing OKX session is used only when it advertises `eth_sendTransaction`; unsupported sessions fail closed.

Gas limit includes a 20% estimate margin and cannot exceed 12 million. Maximum fee exposure cannot exceed 0.05 **test** ETH. The review shows this maximum fee separately. Confirmation re-simulates, checks unchanged nonce/claim epoch/balances/allocation, and ensures the fresh estimate fits the approved bounds. The wallet receives the reviewed transaction fields without increasing those bounds. Actual owner approval remains necessary in OKX.

## Read-only simulation

`SepoliaClaimChain` pins runtime bytecode, RPC chain, recent block, eligibility, faucet inventory, token decimals and wallet nonce. `eth_simulateV1` executes the claim and subsequent token balance reads in simulated state only. Exact token deltas and matching USDC/XSGD Transfer and faucet EthClaimed events are required; a successful `eth_call` alone is insufficient. RPCs without simulation support fail closed. No broadcast or signature occurs during preparation.

The implementation was exercised against the configured Sepolia RPC and the acceptance wallet without writing chain state. The read-only simulation passed with both required token deltas and +0.01 ETH; gas estimate was 7,814,456. This is preparation evidence, not owner authentication or acceptance completion. A new simulation is required for each review/confirmation.

## Review and lifecycle

Korean and English screens show testnet status, Sepolia, masked wallet, masked contract, `claim()`, ETH sent 0, expected allocations and maximum gas cost. Expandable details show full destination/sender, chain ID, calldata, gas/fee/nonce and simulation block. Only **Continue to OKX** hands off the request. Cancel before handoff does not open a wallet.

`CLAIM_PREPARED → CLAIM_SIMULATED → CLAIM_USER_CONFIRMED → CLAIM_WALLET_REQUESTED → CLAIM_BROADCAST → CLAIM_MINED → CLAIM_BALANCES_VERIFIED`

Failures use `CLAIM_FAILED`. A transaction hash, wallet success response or mined receipt alone never counts as PASS. Verification requires matching chain/hash/sender/destination/calldata/value/nonce, fee bounds, canonical finalized successful receipt, matching transfer events and increased actual USDC/XSGD balances. Sepolia ETH and token balances at the receipt block are retained. Reorgs, RPC outages and incomplete finality remain unresolved.

After verified balances, the existing claim-success button retrieves a fresh **1 test USDC → XSGD** quote using the read-only, same-wallet recipient flow. It does not enable swaps or open swap approval. Phase 7D found no liquidity at one USDC and selected two as the smallest successful tested amount; that separate acceptance flow must be explicitly initiated through `/quote 2 USDC XSGD` or `/swap 2 USDC XSGD`. Publication does not change the existing button or silently resize its request.

## Persistence and duplicate prevention

Migration 7 adds `funding_claims` and `funding_claim_events`, leaving existing financial tables intact. Existing databases are backed up before migration. An active-wallet unique index and atomic state transitions prevent concurrent/double confirmations. The handoff marker commits before the response leaves the server. Review validity is at most two minutes and never exceeds ownership expiry; the final handoff ticket lasts at most 15 seconds.

Client/controller, OKX connector and bridge also consume the request once. Reconnect/reload never resubmits. Read-only reconciliation polls at most every 20 seconds while the visible Mini App has an authenticated owner; server refresh is throttled. After restart, the same freshly authenticated wallet can retrieve its durable claim and check status.

Known conservative limitations:

- A rejected request, lost response or ambiguous timeout keeps the wallet's durable lock. A client rejection cannot prove absence of a broadcast. There is no automatic reset/retry; operator investigation is required if no transaction hash exists.
- A lost hash response can be recovered with the exact wallet transaction hash; receipt verification remains mandatory. An incorrect reported hash fails closed and needs operator investigation.
- Finality can outlast the existing ownership session. Reopen the Mini App and reverify ownership to resume read-only checks; do not submit another claim.
- Account deletion cannot discard an attempted claim's recovery evidence. Historical diagnostics and backups remain local and excluded from version control.
- This phase supports the existing native OKX connector only. It does not add native sends to other wallet connectors or establish closed-beta live acceptance.

Diagnostics emit only a masked sender, chain, contract, selector, gas estimate and timestamp; errors use a fixed code vocabulary. No raw RPC error, authentication secret, signature or full ownership address is logged. The live launcher's existing log filter may omit claim simulation messages; durable database events remain the state record.

## Validation and files

Added security suites: `tests/claims.test.ts`, `tests/claim-chain.test.ts`, `tests/claim-ui.test.ts`, `tests/claim-server.test.ts`, `tests/claim-okx.test.ts`. They cover transaction tampering, freshness/account/chain changes, simultaneous confirmations, persisted replay locks, rejection, RPC/simulation failures, reverted/mismatched receipts, finality/reorgs, insufficient balances, HTTP origin/CSRF/ownership, safe diagnostics, and exact forwarding through the installed OKX SDK adapter. `tests/claim-helpers.ts` and the public MIT-runtime fixture support these tests. Existing tests are preserved.

Implementation files added: `src/claims/{protocol,chain,service,diagnostics}.ts`, `src/database/claims.ts`, `web/claim-{flow,panel}.ts`.

Integration files updated: `src/database/store.ts`, `src/i18n/wallet.ts`, `src/wallet/{preflight,server}.ts`, `web/{app.ts,app.css,connector-types.ts,okx-protocol.ts,okx-connector.ts,okx-bridge.ts,wallet-flow.ts,wallet-picker.ts}`. No swap financial calculation, Permit/Intent payload or settlement verifier was modified. Existing changes from earlier phases are preserved.

Validation on 2026-09-17: **474/474 tests passed** (62 new tests), typecheck and build passed. Publication checks covered 176 candidate files plus the index and both existing commits; Gitleaks found no leaks. The production source scan found no private-key or server-signer construction. Korean/English reviews and expanded transaction details were inspected in an isolated browser fixture with no connected wallet.

The running bot rebuilt successfully. Fresh `npm run wallet:preflight` passed all required checks; the existing HTTPS origin was retained. SQLite integrity passed, migration 7 completed with a backup, and hashes of existing user/wallet/transaction-attempt records remained unchanged. Current chain balances remained 0.1 Sepolia ETH and zero USDC/XSGD; outgoing latest/pending nonce remained zero. No claim or trade attempt was created by implementation verification.

The already-running launcher's cached preflight module reported the new database version as unsupported immediately after reload. A separate fresh preflight recognized version 7 and passed. No database reset or tunnel restart was performed; restarting the launcher in a later development session will load the new preflight module normally.

At the implementation checkpoint the previous owner session had expired. The owner subsequently renewed ownership and approved the in-app claim. The reconciliation below supersedes that earlier pending status.

## Reconciliation correction

The existing persisted transaction succeeded at Sepolia block **11,721,783**, with 117 ERC-20 Transfer logs. Its chain, sender, faucet destination, `claim()` calldata, zero value and nonce match the original request. Canonical finality, actual token contract decimals, exact token amounts and gas-adjusted ETH were independently verified. There is one claim record and one transaction; no new claim was created or submitted during recovery.

The original verifier rejected two **per-gas fee fields**, before checking finality or tokens:

| Field | Prepared | Wallet-approved transaction |
|---|---:|---:|
| Gas limit | 9,377,348 | 7,814,456 |
| Maximum fee/gas, wei | 2,380,503,998 | 2,406,770,487 |
| Priority fee/gas, wei | 1,000,000 | 1,000,000,000 |
| Maximum total cost, wei | 22,322,814,404,637,304 | 18,807,602,072,760,072 |

The recorded request and the signed transaction establish these changes; on-chain evidence does not identify which wallet UI/SDK component selected the revised fees. No token contract, decimal, amount, parsing, recipient, native accounting or duplicate-hash mismatch was found. At initial inspection finality was still pending, but that was not the assertion which caused the terminal failure.

Post-broadcast verification now accepts wallet fee repricing only when **maximum total exposure stays within both the reviewed maximum and the existing absolute cost cap**, the gas limit is no higher than reviewed, and the effective fee/gas, gas used and actual cost are bounded. Core transaction fields remain exact. This change does not modify construction or wallet handoff: those still send and assert the original reviewed fields. The success screen discloses an observed fee adjustment.

USDC and XSGD each delivered `1,000,000,000,000,000` raw units; actual contract `decimals()` returned 6 for both. Each therefore received **1 billion test tokens**, not 1 billion raw units. Native receipt is proven by the faucet event and historical balances, including `gasUsed × effectiveGasPrice`: `7,751,767 × 2,089,080,847 = 16,194,067,970,106,649 wei`. The resulting ETH is exactly `0.1 + 0.01 − 0.016194067970106649 = 0.093805932029893351`. If other activity prevents this equation from balancing, the app keeps verification pending until the additional change can be proven; it does not guess.

Migration 8 adds a separate `evidence` column after a consistent backup. It preserves the original row/hash/request snapshot and lock, and retains the earlier failure in event history. `ClaimService.reconcile` can recheck an already-attempted hash without requiring a still-live browser session; it cannot prepare or confirm a claim. The authenticated HTTP refresh endpoint retains ownership/CSRF checks. Concurrent checks share one receipt read, with a persisted 15-second read throttle. Finalized success becomes idempotent and does not call the wallet, simulator or transaction sender.

RPC outages, nonfinal receipts, historical balance lag and unresolved native accounting remain `CLAIM_BROADCAST`/`CLAIM_MINED` with verification-pending codes rather than token-failure claims. A visible screen stops automatic checks after 60 reads or 20 minutes and on lost authentication. Manual checking remains available for the same hash. Genuine contract, amount, recipient, fee-ceiling and decimal mismatches have distinct safe failure categories. No lock is released to permit another claim.

The configured public RPC subsequently stopped serving historical state at the receipt block. For an **already verified** database record only, read-only first-quote preparation now rebinds the retained evidence to fresh transaction fields, receipt logs/costs, canonical block hash and finalized head, checks native accounting and exact token proof, and reads current runtime, decimals and balances. The immutable historical proof is retained, not replaced by current balances. Initial or failed-claim reconciliation cannot use this path: it still requires historical state, and remains pending if that RPC data is unavailable. No caller can supply retained evidence through HTTP. Fresh ownership remains mandatory for new quote preparation. This path was exercised successfully against the actual transaction after historical state became unavailable.

Operator recovery: `node --use-system-ca --import tsx scripts/reconcile-claim.ts`. It resolves the single allowlisted wallet's already-attempted persisted hash and fails on ambiguous selection. It does not accept a new destination, calldata or value and cannot issue signatures or blockchain writes.

Validation: **510/510 tests**, typecheck/build and fresh live preflight passed. There are 36 additional regression tests plus updated receipt fixtures/assertions for the explicitly corrected behavior. Dependency audit reports 3 moderate package entries (one underlying [StableLib Ed25519 advisory](https://github.com/advisories/GHSA-x3ff-w252-2g7j) propagated through the existing OKX dependencies), 0 high/critical, and no available automatic fix; the lockfile/dependencies remain unchanged. These package findings do not come from the claim code and are not presented as resolved. Publication and Gitleaks scans found no leaks; no server signer was found. Four unsafe-log pattern matches were reviewed as static smoke-test summaries or startup guidance, with no credentials or signature values. Database integrity/foreign keys pass and existing claim identity and historical state remain preserved.

Changed reconciliation files: `src/claims/{chain,protocol,receipt-evidence,service}.ts`, `src/database/{claims,store}.ts`, `src/i18n/wallet.ts`, `src/wallet/preflight.ts`, `web/{app.css,claim-panel.ts,claim-status.ts}`, `scripts/reconcile-claim.ts`, `tests/{claim-chain,claim-reconciliation,claim-server,claims}.test.ts`, `tests/claim-helpers.ts`, and `CLAIM_FLOW.md`, `STATUS.md`, `ACCEPTANCE.md`. Mainnet and swap execution remain OFF. First swap authentication/preflight and actual mobile success-screen review remain distinct from successful funding verification.
