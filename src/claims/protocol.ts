// Independently matched against explorer-verified IssueTestTokenV3 runtime on
// Sepolia, 2026-09-17. Provenance: docs.testnet.sera.cx/quickstart/ -> this faucet.
// This is the only native transaction supported by the funding feature.
export const FAUCET = "0x4FAc3BB8B77547E2Da7ed903baDBeD2f46cBe65a" as const;
export const FAUCET_CODE_HASH = "0x0ae33dcb33b9e3e81b944422b11fcadc2541f3656d680c46823534717ebedcf8";
export const CLAIM_DATA = "0x4e71d92d" as const;
export const CLAIM_CHAIN = 11155111;
export const CLAIM_CHAIN_HEX = "0xaa36a7" as const;
export const CLAIM_ALLOCATION = 1000000000000000n; // 1 billion tokens at 6 decimals, NOT 1 billion raw units.
export const CLAIM_ETH = 10000000000000000n;
export const CLAIM_COST_CAP = 50000000000000000n; // 0.05 test ETH; fees cannot become an unrestricted transfer.
export type ClaimTransaction = {from:string;to:typeof FAUCET;chainId:typeof CLAIM_CHAIN_HEX;data:typeof CLAIM_DATA;value:"0x0";gas:string;maxFeePerGas:string;maxPriorityFeePerGas:string;nonce:string};
export class ClaimError extends Error {constructor(readonly code:string){super(code);}}
export function claimAssert(value:unknown,code="CLAIM_INVALID"):asserts value {if(!value)throw new ClaimError(code);}
export const equalAddress=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase();
export const quantity=(n:bigint)=>"0x"+n.toString(16);
const quantityValue=(x:unknown)=>{claimAssert(typeof x==="string"&&/^0x(?:0|[1-9a-f][0-9a-f]{0,31})$/.test(x));return BigInt(x);};
export function assertClaimTransaction(value:unknown,owner:string):asserts value is ClaimTransaction {
  claimAssert(value&&typeof value==="object"&&!Array.isArray(value));
  const t=value as Record<string,unknown>;
  const keys=["from","to","chainId","data","value","gas","maxFeePerGas","maxPriorityFeePerGas","nonce"];
  claimAssert(Object.keys(t).length===keys.length&&Object.keys(t).every(k=>keys.includes(k)));
  claimAssert(/^0x[0-9a-fA-F]{40}$/.test(owner)&&typeof t.from==="string"&&equalAddress(t.from,owner),"CLAIM_WALLET_CHANGED");
  claimAssert(t.chainId===CLAIM_CHAIN_HEX,"NETWORK_MISMATCH");
  claimAssert(typeof t.to==="string"&&equalAddress(t.to,FAUCET)&&t.data===CLAIM_DATA&&t.value==="0x0");
  const gas=quantityValue(t.gas),fee=quantityValue(t.maxFeePerGas),tip=quantityValue(t.maxPriorityFeePerGas);quantityValue(t.nonce);
  claimAssert(gas>0n&&gas<=12000000n&&fee>0n&&tip<=fee&&gas*fee<=CLAIM_COST_CAP);
}
export function claimTransaction(owner:string,gas:bigint,fee:bigint,tip:bigint,nonce:bigint):ClaimTransaction {
  const t={from:owner,to:FAUCET,chainId:CLAIM_CHAIN_HEX,data:CLAIM_DATA,value:"0x0" as const,gas:quantity(gas),maxFeePerGas:quantity(fee),maxPriorityFeePerGas:quantity(tip),nonce:quantity(nonce)};
  assertClaimTransaction(t,owner);return t;
}
export const claimStates=["CLAIM_PREPARED","CLAIM_SIMULATED","CLAIM_USER_CONFIRMED","CLAIM_WALLET_REQUESTED","CLAIM_BROADCAST","CLAIM_MINED","CLAIM_BALANCES_VERIFIED","CLAIM_FAILED"] as const;
export type ClaimState=typeof claimStates[number];
export interface ClaimBalances {eth:string;usdc:string;xsgd:string}
export interface ClaimEvidence {
  transactionHash:string;blockNumber:string;blockHash:string;confirmations:string;finalized:boolean;
  usdc:{contract:string;decimals:number;receivedRaw:string};xsgd:{contract:string;decimals:number;receivedRaw:string};
  nativeReceivedRaw:string;nativeBeforeRaw:string;nativeAfterRaw:string;gasPaidRaw:string;nativeAccountingVerified:boolean;
  reviewedMaximumCostRaw:string;actualMaximumCostRaw:string;feeAdjusted:boolean;
}
export interface ClaimSnapshot {
  transaction:ClaimTransaction;block:string;blockHash:string;epoch:string;gasEstimate:string;
  before:ClaimBalances;receive:{usdc:string;xsgd:string;eth:string};simulatedAt:number;
}
export interface ClaimView {id:string;version:string;state:ClaimState;wallet:string;expiresAt:number;snapshot:ClaimSnapshot|null;txHash:string|null;error:string|null;balances:ClaimBalances|null;attempted:boolean;evidence?:ClaimEvidence|null}
