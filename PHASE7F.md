# Phase 7F — live quote cost characterization

Historical phase record. See [Phase 7M](PHASE7M.md) for the later verified Permit milestone and current execution blockers. Actions described below belong to that earlier phase; they are not current authorization to retry or sign.

**Read-only result, 2026-09-17:** the minimum tested size passing the unchanged cost gate is **5 test USDC**. The smallest tested size below 5% input-relative cost is **50 test USDC**, the suggested amount for a future explicitly selected acceptance review. No financial authorization is granted by this recommendation.

Mainnet and swap execution remain OFF. No Permit, Intent, relayer submission or swap occurred. The blocked owner quote and all operator samples are expired, non-signable research evidence. No stored user intent was resized.

## Evidence and method

The owner reported a fresh authenticated two-USDC review with pre-cost output 2.516406 XSGD, output deduction 2.283869 XSGD, minimum 0.232537 XSGD and input-equivalent cost 1.783915436321928 USDC (89.1958%). The application correctly held that review. This is owner-reported evidence, separate from the operator samples below.

At 09:44:38 UTC the exact linked acceptance wallet had one fresh ownership session, epoch 3, expiring at 09:55:16 UTC. No trade sessions, submission attempts or quarantines existed. A fresh Sepolia contract/deployment check verified both token contracts and their **six decimals**, the SOR relation to Sera, Permit domains/nonces and Intent digests. Test USDC balance was sufficient for every requested sample. The native funding claim was neither repeated nor modified.

Six **new** public `POST /swap/quote` calls ran sequentially at two-second start intervals, using the existing paced client. Each explicit amount was requested once: 2, 5, 10, 25, 50 and 100 USDC. All used `receive_less`, exact raw input and the same linked wallet as owner and recipient. Ownership remained fresh throughout the matrix, which completed at 09:46:42.404 UTC. No browser authentication was impersonated, session issued, API key supplied or signing/submission capability invoked. Existing `probeMatrix`, quote validation, on-chain reads and the unchanged `quoteEconomics` function supplied the checks.

The diagnostic retained response fields privately, including quote IDs, signed terms, nonce, deadline, timings and cost breakdowns. Only nonsecret aggregate evidence is documented here. The operator path never creates application trade rows or promotes research samples into live acceptance. Public quote reads need no signature; an expired ownership proof must still never authorize financial acceptance.

## Exact cost semantics

The current [official swap endpoint documentation](https://docs.testnet.sera.cx/api-reference/endpoints/swaps/) describes `receive_less` and the two cost summaries. The actual response contained only the documented quote/route, fee, breakdown, metadata and Permit objects; each route reported one leg.

| Field | Unit and interpretation |
| --- | --- |
| Request `from_amount` | Raw USDC units; 1 USDC = 1,000,000 raw units. |
| `initialDepositAmount`, `maxInputAmount` | Exact input deposit and signed input ceiling; equal to the requested input in these samples. |
| `input_amount_before_gas`, `input_amount_after_gas` | Both remain the same raw USDC amount under `receive_less`. There is no additional input debit in this quote mode. |
| `output_amount_before_gas` | Quoted XSGD before the quoted gas deduction, in raw units. This is not a guaranteed expected fill. |
| `gas_cost_output_token` | Raw XSGD deducted from that output. |
| `output_amount_after_gas`, `minOutputAmount` | Equal raw XSGD values: the signed **minimum already net of the quoted gas deduction**. |
| `fee_breakdown.gas_cost_from_token` | Decimal input-token equivalent of the quoted gas/execution expense, in USDC here; not raw units or an additional debit. |
| `quote_breakdown.gas_cost_input_token` | Raw input-token equivalent. The current checker allows sub-base-unit quantization against the decimal display. |
| `gas_cost_usd` in both objects | Decimal USD reference for that same expense, not native ETH gas and not another charge. |
| Quote price/spread | Pre-cost output includes the quoted exchange terms. These responses do not itemize a bid/ask spread or separate trading-fee component. |
| Separate relayer surcharge | Not separately provided. The gas/execution summary does not expose an itemized network-gas/relayer-markup calculation. No extra charge is invented. |

**One deduction only:** `pre-cost XSGD − deducted XSGD = minimum XSGD`. The UI reads the minimum directly, labels the USDC cost as an equivalent, and explicitly says it is not an additional debit. No double deduction or six-decimal normalization bug was found; no UI or production calculation change was needed.

The output and input summaries represent the same reported gas expense in different units, but their conversion need not use this swap's executable rate. Their implied conversion is approximately **1.280256166879 XSGD per USDC**, while the pre-cost swap rate is approximately 1.25820348. The public schema does not establish the internal conversion source or formula, so the diagnostic does not manufacture one or require those two rates to match.

A separate official `GET /fx/rate?base=USD&quote=SGD` read at 09:55:06 UTC returned 1.26238, with `as_of` 09:40:27 UTC—about 879 seconds old when read. This is an aggregated currency reference, not an executable quote, as described in the [system documentation](https://docs.testnet.sera.cx/api-reference/endpoints/system/). It does not establish the earlier gas-conversion input, a simultaneous spread or an independently verified USD valuation of the minimum output, and was not used for selection.

## Cost sanity matrix

All six requests succeeded and passed contract/quote bindings while fresh. Monetary token values below are exact to their six decimals. Percentages are rounded for this table; the gate and analytical selection use unrounded values. **PASS describes only the current cost policy**, not execution permission.

All rows have the same reported cost: **1.91129171122422000000 USDC**, and the same separate USD reference: **1.91129171122422000000 USD**.

| Input USDC | Quote success | Pre-cost XSGD | Deducted XSGD | Minimum XSGD | Reported cost USDC | Cost / input % | Deduction / pre-cost % | Current gate | Quote expiry UTC |
| ---: | :---: | ---: | ---: | ---: | ---: | ---: | ---: | :---: | --- |
| 2 | Yes | 2.516406 | 2.446943 | 0.069463 | 1.91129171122422 | 95.564586 | 97.239595 | BLOCK | 09:47:01 — expired |
| 5 | Yes | 6.291017 | 2.446943 | 3.844074 | 1.91129171122422 | 38.225834 | 38.895826 | PASS | 09:47:03 — expired |
| 10 | Yes | 12.582034 | 2.446943 | 10.135091 | 1.91129171122422 | 19.112917 | 19.447913 | PASS | 09:47:05 — expired |
| 25 | Yes | 31.455087 | 2.446943 | 29.008144 | 1.91129171122422 | 7.645167 | 7.779165 | PASS | 09:47:07 — expired |
| 50 | Yes | 62.910174 | 2.446943 | 60.463231 | 1.91129171122422 | 3.822583 | 3.889582 | PASS | 09:47:09 — expired |
| 100 | Yes | 125.820348 | 2.446943 | 123.373405 | 1.91129171122422 | 1.911292 | 1.944791 | PASS | 09:47:11 — expired |

Dates in these tables are 2026-09-17 UTC. At the analytical snapshot, 09:55:05 UTC, the samples were approximately 8m23s–8m33s old and all expired. Expired Permit/Intent terms cannot be reused.

| Input USDC | Validated response time UTC | Signed deadline UTC | Permit amount raw | Minimum XSGD / input USDC | Diagnostic band |
| ---: | --- | --- | ---: | ---: | --- |
| 2 | 09:46:32.492 | 09:51:30 | 2,000,000 | 0.03473150 | EXTREME |
| 5 | 09:46:34.371 | 09:51:32 | 5,000,000 | 0.76881480 | VERY HIGH |
| 10 | 09:46:36.362 | 09:51:34 | 10,000,000 | 1.01350910 | HIGH |
| 25 | 09:46:38.361 | 09:51:36 | 25,000,000 | 1.16032576 | ELEVATED |
| 50 | 09:46:40.394 | 09:51:38 | 50,000,000 | 1.20926462 | LOWER |
| 100 | 09:46:42.403 | 09:51:40 | 100,000,000 | 1.23373405 | LOWER |

Every hypothetical Permit had verified spender **`0x83c1368110B640A729f3810De5FBe94b99aa5668`**, exact input amount, Sepolia domain and nonce **0**, matching the read-only chain check. These are research terms, not requests to sign. Minimum/input is an XSGD-per-USDC rate; it is not a USD value or a promised fill.

## Hypothesis and selection

**A — evidence consistent with a fixed cost component: SUPPORTED.** Input increased 50-fold while absolute USDC cost and absolute XSGD deduction remained exactly constant across the six samples. Absolute reported cost range was zero. All routes had one reported leg. This supports a fixed-like component over the sampled sizes and brief observation window; it does not prove an immutable fee schedule, gas-unit estimate or relayer pricing formula.

**B — material amount-dependent price impact: not observed in this range.** Pre-cost XSGD/USDC varied only from 1.258203 to 1.25820348, approximately 0.00003815% relative range, consistent with raw-unit quantization. A larger input did not show material deterioration. A one-direction, sequential matrix cannot determine a bid/ask spread.

**C — incorrect unit interpretation/double deduction: not found.** Both token decimals, raw normalization and all cost arithmetic passed. **D — specifically abnormal testnet pricing: undetermined.** There is no mainnet comparison or disclosed internal fee model establishing that cause. No other exact internal cause is claimed.

The prior owner-observed cost was 1.783915436321928 USDC; this later matrix reported 1.91129171122422. That difference shows why future acceptance needs another fresh quote. Historical success never promises future liquidity or costs.

| Research selection | Smallest sampled amount |
| --- | ---: |
| Current gate PASS | 5 USDC |
| Input-relative cost strictly below 20% | 10 USDC |
| Strictly below 10% | 25 USDC |
| Strictly below 5% | 50 USDC |
| Suggested future acceptance review | **50 test USDC** |

The suggestion uses the requested analytical LOWER band to avoid selecting the 38.2258%-cost five-USDC sample merely because it passes the broad block. It does **not** add a 5% product policy or change the existing rule: block at input-equivalent cost **>=50%**, output deduction **>=50%** of pre-cost output, or missing/inconsistent costs. No size is selected automatically in the app.

## Existing owner path and remaining UI boundary

The claim-success button still explicitly requests **2 USDC**. It was not changed to 50. An owner can explicitly enter `/quote 50 USDC XSGD`, open its existing test-trade continuation, complete normal ownership verification, and press the Mini App's fresh wallet-quote action. That path requests another exact 50-USDC quote; it does not reuse the Telegram quote or this matrix. Execution remains OFF.

The generic amount-based wallet preview currently shows minimum output, input-equivalent cost and authorization details. The extra Phase 7E cost-deduction rows and cost-hold heading belong to its two-USDC claim path. This operator task does not redesign that runtime UI or claim a new 50-USDC mobile review was observed. Uniform cost review coverage must be addressed before any future financial authorization; a generic preview is not evidence that its new economics passed this diagnostic. The next screenshot is for read-only inspection only.

## Tests and scope

An operator-only helper, `scripts/diagnostics/costs.ts`, summarizes independently validated quotes and compares the specified diagnostic bands. It imports the unchanged application cost policy and is not imported by the bot, Mini App or transaction service. It always returns `signable: false` and never returns a signing payload or saved intent.

Regression tests cover the owner-reported numbers, Korean/English same-cost wording, one output deduction, six-decimal normalization, informational USD values, exact ratio/band boundaries, both 50% block conditions, malformed costs, the six-size matrix, no resizing, expired research and blocked financial methods even for a passing 50-USDC sample. No state-changing live test is performed.

Product source, wallet architecture, signing, submission, settlement, safety policy, `.env`, database schema and existing user choices are unchanged. The running launcher may rebuild automatically after test changes, preserving its origin and persisted records. No mainnet call, execution enablement, transaction, completion commit or push is part of this task.
