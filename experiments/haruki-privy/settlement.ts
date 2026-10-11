import {encodeAbiParameters, encodeEventTopics, parseAbiItem, type Hex} from 'viem';
import {receiptEvidence} from '../../src/wallet/chain.js';
import {hashes, USDC, XSGD, type ExecutionQuote} from '../../src/trades/contract.js';
import {fixtureDeployment as d} from './fixtures.js';

export function settlementFixture(q: ExecutionQuote) {
  const transfer = (token: string, from: string, to: string, value: string) => ({address: token,
    data: encodeAbiParameters([{type: 'uint256'}], [BigInt(value)]),
    topics: encodeEventTopics({abi: [parseAbiItem('event Transfer(address indexed from,address indexed to,uint256 value)')],
      eventName: 'Transfer', args: {from: from as Hex, to: to as Hex}}) as Hex[]});
  const r = q.route_params;
  return {
    receipt: {status: 'success', transactionHash: '0x' + 'a'.repeat(64), blockHash: '0x' + 'b'.repeat(64), blockNumber: 100n,
      logs: [{address: d.sor_address, data: encodeAbiParameters([{type: 'uint256'}], [1n]),
        topics: encodeEventTopics({abi: [parseAbiItem('event IntentMatched(bytes32 indexed intentHash,address indexed taker,uint256 legCount)')],
          eventName: 'IntentMatched', args: {intentHash: hashes(d, q).struct, taker: r.taker as Hex}}) as Hex[]},
      transfer(USDC, r.taker, d.sera_address, r.maxInputAmount), transfer(XSGD, d.sera_address, r.recipient, r.minOutputAmount)]},
    canonicalHash: '0x' + 'b'.repeat(64), finalized: 100n,
    balances: {inputBefore: '100000000', inputAfter: String(100000000n - BigInt(r.maxInputAmount)),
      outputBefore: '0', outputAfter: r.minOutputAmount},
  };
}
export type SettlementFixture = ReturnType<typeof settlementFixture>;
/** Two fixtures, not two real RPCs. A pending acknowledgment alone is never settlement. */
export function reconcileFixtures(q: ExecutionQuote, a: SettlementFixture, b: SettlementFixture): boolean {
  const encode = (value: unknown) => JSON.stringify(value, (_, v: unknown) => typeof v === 'bigint' ? v.toString() : v);
  if (encode(a) !== encode(b)) return false;
  const evidence = receiptEvidence(d, q, hashes(d, q).struct, a.receipt, a.canonicalHash, a.finalized);
  if (!evidence) return false;
  return BigInt(a.balances.inputBefore) - BigInt(a.balances.inputAfter) === BigInt(evidence.inputRaw)
    && BigInt(a.balances.outputAfter) - BigInt(a.balances.outputBefore) === BigInt(evidence.outputRaw);
}
