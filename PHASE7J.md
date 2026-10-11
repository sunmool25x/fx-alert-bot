# Phase 7J — reconcile the first Permit transport failure

Historical phase record. See [Phase 7M](PHASE7M.md) for the later verified Permit milestone and current execution blockers. Actions described below belong to that earlier phase; they are not current authorization to retry or sign.

The first fifty-test-USDC acceptance attempt failed before the OKX wallet transport. No financial signature was returned. The expired request is historical evidence only; it must never be replayed.

## Authoritative evidence

The owner-scoped database contained one `WALLET_ERROR` request, with `WALLET_TRANSPORT_ERROR`, numeric provider code `0`, no encrypted signature and no signing timestamp. Its request was created at 2026-09-19 05:49:02.230 UTC and durably reserved at 05:49:13.725 UTC. The quote expired at 05:49:31 UTC; the Permit and Intent deadline was 05:54:00 UTC. The requested Permit had nonce `0`, exactly `50000000` raw test-USDC units and the existing verified Sepolia spender. Private evidence retains the request/continuation/quote identifiers, payload, digest and source/build hashes; none are needed in public documentation.

The original implementation did not retain wallet handoff/callback timestamps or the provider's raw message. Those values cannot be reconstructed as observed facts. The safe error message below was reproduced with the actual installed SDK and historical typed data, with a mocked wallet client and no live signing call.

## Proven root cause and minimal transport fix

The parent EIP-1193 request was `eth_signTypedData_v4` with `[address, JSON.stringify(typedData)]`. The OKX iframe passed that array unchanged to `@okxconnect/universal-provider` 1.9.1. Its EIP-155 `adaptArray` requires an **object** in the second position and rejects a string before calling its wallet client:

`Request params message data error, method: 'eth_signTypedData_v4'`

The reproduction returned provider code `0`, with **zero wallet transport calls and no signature**. The served app/bridge bundles matched the inspected local bundles and source at reconciliation. This establishes `A — NO_SIGNATURE_RETURNED` for this particular attempt; an empty signature column or code `0` alone would not establish it.

`web/okx-typed-data.ts` now converts only at the OKX SDK boundary, preserving the typed-data object, field values and digest. The generic EIP-1193 request remains unchanged for other connectors. The SDK receives `[address, typedDataObject]` and the explicit `eip155:11155111` chain argument, then performs its own serialization. There is no alternate signing method, raw-hash signing, `personal_sign` fallback, batch or automatic retry. This matches the [official OKX EVM SDK documentation](https://web3.okx.com/id/onchainos/dev-docs/wallet/dapp-connect/app-connect-evm-sdk).

## Independent contract verification

Read-only Sepolia calls checked test USDC `0x965d4b4546716e416e950bc30467d128455d2d0e`, name `CIRCLE`, chain `11155111`, nonce `0`, and zero allowance to `0x83c1368110B640A729f3810De5FBe94b99aa5668`. The contract does not expose the attempted `version()` getter; version `1` is verified by recomputing and matching its `DOMAIN_SEPARATOR`, rather than assuming a getter exists. Manual ABI encoding and Keccak hashing independently reproduced the exact requested domain separator and Permit digest, following [ERC-2612](https://eips.ethereum.org/EIPS/eip-2612). The evidence includes a chain block after the Permit deadline.

Quote expiry and Permit expiry are distinct. A signed Permit can outlive its quote until its own deadline, subject to nonce/contract conditions. For this attempt no signature was produced, and the Permit deadline has also expired. No revocation or other transaction is needed or performed.

## Lock reconciliation and persistence

Migration 11 makes a consistent pre-migration SQLite backup and preserves the historical Permit row and payload. It adds append-only stage events and a partial unique index allowing only one **open** Permit request per wallet. Signed requests and unknown results retain their lock.

Generic transport failures now become `RESULT_UNKNOWN`. They cannot be unlocked by a browser callback, polling status or HTTP reconciliation endpoint. The operator-only `closeNoSignature` operation requires request/version/digest-bound evidence of this exact pre-dispatch SDK failure, matching served-build evidence, fresh read-only domain/digest/nonce/allowance checks, and expiry of the old quote and Permit. Any stored signature or callback/signature receipt evidence blocks this closure. Closure records `WALLET_ERROR_NO_SIGNATURE`, a closure timestamp and evidence hashes, while retaining the original request, error, economics and payload.

A new attempt is permitted only with ownership verified after closure, a new session or ownership epoch, a new exact fifty-USDC continuation created after closure, and a newly fetched quote passing all existing cost, token, spender, amount, recipient, chain, nonce, deadline and route-binding checks. The old request ID/version/payload cannot be replayed. The new Permit review requires a separate explicit consent and button; preparation itself never signs.

New event timestamps record server receipt of client stage observations, not independently observed phone/SDK internals. Callback/signature receipt events contain no signature bytes. Missing observations never prove that no signature exists. Handoff navigation errors no longer discard a still-pending wallet response; the one pending result is awaited without a second signing request.

## Validation and stopping point

673/673 isolated tests pass, including the real installed SDK with a fake wallet client, exact request shape/digest, wrong account/chain/digest, expired requests, signature recovery, rejection, timeouts/late callbacks, handoff failure, duplicate prevention, guarded closure, new ownership/context requirements, migration preservation and inaccessible Intent/relayer routes. Typecheck and production build pass. No automated test uses a live wallet signature.

Mainnet and swap execution remain OFF. Permit-only acceptance retains its existing narrow owner/wallet gate; Permit economics, spender/amount policy, Intent architecture and relayer architecture are unchanged. No live Permit retry, Intent, relayer submission, swap or token claim is initiated in Phase 7J. The corrected real-device signing transport remains unverified until a separately authorized future owner attempt.

Next owner action after authoritative closure: start a completely new fifty-USDC quote/Permit review and show the Permit screen **before signing**. Refresh ownership through the existing flow when prompted.
