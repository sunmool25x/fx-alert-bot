/** Offline synthetic data only. No owner records, network, credentials or database access. */
import {generatePrivateKey, privateKeyToAccount} from 'viem/accounts';
import {domainHash, permitTypes, USDC, XSGD, type Deployment, type ExecutionQuote} from '../../src/trades/contract.js';
import {PERMIT_SPENDER} from '../../src/permits/protocol.js';

export const SYNTHETIC_START = Date.UTC(2030, 0, 1);
export const AMOUNT = '50000000';
export const fixtureAccount = () => privateKeyToAccount(generatePrivateKey());
const domain = {name: 'Sera', version: '1', chainId: 11155111 as const,
  verifyingContract: '0x83475A1bD98a8DC2DCd507A747e4DC85da241D6e'};
export const fixtureDeployment: Deployment = {
  chain_id: 11155111, sera_address: domain.verifyingContract, sor_address: PERMIT_SPENDER,
  vault_address: '0x3c7945840bAE0d7e7f3824Ebccef1962629250F0',
  eip712_domain: domain, domain_separator: domainHash(domain),
};

export function fixtureQuote(owner: string, createdMs: number, index: number): ExecutionQuote {
  const deadline = Math.floor(createdMs / 1000) + 300;
  // This domain is the testnet deployment observation, not the illustrative USD Coin/2 in the docs.
  const permitDomain = {name: 'CIRCLE', version: '1', chainId: 11155111 as const, verifyingContract: USDC};
  return {
    uuid: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    expires_at: Math.floor(createdMs / 1000) + 30,
    route_params: {taker: owner, recipient: owner, inputToken: USDC, outputToken: XSGD,
      maxInputAmount: AMOUNT, initialDepositAmount: AMOUNT, minOutputAmount: '60000000',
      uuid: ((BigInt(index) + 1000n) << 124n).toString(), deadline},
    fee_breakdown: {gas_cost_usd: '2', gas_cost_from_token: '2'},
    quote_breakdown: {gas_mode: 'receive_less', input_token: USDC, output_token: XSGD,
      input_amount_before_gas: AMOUNT, input_amount_after_gas: AMOUNT,
      output_amount_before_gas: '62500000', output_amount_after_gas: '60000000',
      gas_cost_input_token: '2000000', gas_cost_output_token: '2500000', gas_cost_usd: '2'},
    permit: {permit_supported: true, permit_required: true, token: USDC, owner,
      spender: PERMIT_SPENDER, value_raw: AMOUNT, current_allowance_raw: '0', nonce: 0,
      suggested_deadline: deadline, domain: permitDomain,
      eip712: {domain: permitDomain, primaryType: 'Permit', types: {Permit: permitTypes.Permit.map(field => ({...field}))},
        message: {owner, spender: PERMIT_SPENDER, value: AMOUNT, nonce: 0, deadline}}},
  };
}
