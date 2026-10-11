import {hashTypedData, type Hex, type TypedDataDomain} from 'viem';
import {fixtureAccount} from './fixtures.js';

export type WireData = {
  domain: TypedDataDomain;
  types: Record<string, readonly {name: string; type: string}[]>;
  primaryType: string;
  message: Record<string, unknown>;
};
/** Minimal structural subset of @privy-io/node 0.35.0, not an installed/live SDK adapter. */
export type PrivyInput = {params: {typed_data: Omit<WireData, 'primaryType'> & {primary_type: string}}};
export interface PrivyShape {
  wallets(): {ethereum(): {signTypedData(walletId: string, input: PrivyInput): Promise<{signature: string; encoding: 'hex'}>}};
}
export function privyInput(wire: WireData): PrivyInput {
  const {primaryType, ...rest} = wire;
  return JSON.parse(JSON.stringify({params: {typed_data: {...rest, primary_type: primaryType}}},
    (_, value: unknown) => typeof value === 'bigint' ? value.toString() : value)) as PrivyInput;
}
export function wireFromPrivy(input: PrivyInput): WireData {
  const {primary_type, ...rest} = input.params.typed_data;
  return {...rest, primaryType: primary_type};
}
export type SigningFault = 'none' | 'wrong-account' | 'wrong-digest' | 'invalid' | 'unknown' | 'rejected';

/** Ephemeral, unexported fixture key. Cannot connect to Privy or sign for any real wallet. */
export class SimulatedPrivy implements PrivyShape {
  readonly #account = fixtureAccount();
  readonly #other = fixtureAccount();
  readonly walletId = 'offline-fixture-wallet';
  readonly owner = this.#account.address;
  readonly calls: string[] = [];
  readonly cryptoWallMs: number[] = [];
  constructor(private readonly fault: SigningFault = 'none') {}
  wallets() { return {ethereum: () => ({signTypedData: this.signTypedData.bind(this)})}; }
  private async signTypedData(walletId: string, input: PrivyInput) {
    if (walletId !== this.walletId) throw new Error('FIXTURE_WALLET_ONLY');
    // Exercise serialized snake_case request data, not a different backend signing object.
    const wire = wireFromPrivy(JSON.parse(JSON.stringify(input)) as PrivyInput);
    if (wire.domain.chainId !== 11155111 || !['Intent', 'Permit'].includes(wire.primaryType)) throw new Error('FIXTURE_DOMAIN_ONLY');
    this.calls.push(wire.primaryType);
    if (this.fault === 'unknown') throw new Error('RESULT_UNKNOWN');
    if (this.fault === 'rejected') throw new Error('USER_REJECTED');
    if (this.fault === 'invalid') return {signature: '0x', encoding: 'hex' as const};
    if (this.fault === 'wrong-digest') wire.message = {...wire.message, deadline: 1};
    const start = performance.now();
    const signature: Hex = await (this.fault === 'wrong-account' ? this.#other : this.#account).signTypedData(wire);
    this.cryptoWallMs.push(performance.now() - start);
    return {signature, encoding: 'hex' as const};
  }
}
export const wireDigest = (wire: WireData) => hashTypedData(wire);

/** No environment flag can turn this experiment into a real signer. */
export function realPrivySetupGate(): never {
  throw new Error('SEPARATE_AUTHORIZATION_AND_ISOLATED_WALLET_REQUIRED');
}
