import {fixture} from './trade-helpers.js';
import {claimTransaction,CLAIM_ALLOCATION,CLAIM_ETH,type ClaimSnapshot,type ClaimEvidence} from '../src/claims/protocol.js';
import {USDC,XSGD} from '../src/trades/contract.js';
import type {ClaimChain,ClaimReceiptResult} from '../src/claims/chain.js';
import {ClaimService} from '../src/claims/service.js';
import {NOW} from './helpers.js';
export const claimHash=('0x'+'ab'.repeat(32)) as `0x${string}`;
export function claimEvidence():ClaimEvidence{return {transactionHash:claimHash,blockNumber:'101',blockHash:'0x'+'cd'.repeat(32),confirmations:'10',finalized:true,
  usdc:{contract:USDC,decimals:6,receivedRaw:String(CLAIM_ALLOCATION)},xsgd:{contract:XSGD,decimals:6,receivedRaw:String(CLAIM_ALLOCATION)},
  nativeReceivedRaw:String(CLAIM_ETH),nativeBeforeRaw:'100000000000000000',nativeAfterRaw:'93805932029893351',gasPaidRaw:'16194067970106649',nativeAccountingVerified:true,reviewedMaximumCostRaw:'22322814404637304',actualMaximumCostRaw:'18807602072760072',feeAdjusted:true};}
export function claimSnapshot(wallet:string):ClaimSnapshot{return {transaction:claimTransaction(wallet,10000000n,2000000000n,1000000n,0n),block:'100',blockHash:'0x'+'cd'.repeat(32),epoch:'2',gasEstimate:'8000000',before:{eth:'100000000000000000',usdc:'0',xsgd:'0'},receive:{eth:String(CLAIM_ETH),usdc:String(CLAIM_ALLOCATION),xsgd:String(CLAIM_ALLOCATION)},simulatedAt:NOW};}
export async function claimFixture(path=':memory:'){
  const f=await fixture(path);f.config.wallet.enabled=false;
  let simulations=0,result:ClaimReceiptResult={state:'pending'};
  const chain:ClaimChain={simulate:async wallet=>{simulations++;return claimSnapshot(wallet);},receipt:async()=>result};
  const claims=new ClaimService(f.store,chain,f.config,f.now);
  return {...f,chain,claims,simulations:()=>simulations,result:(r:ClaimReceiptResult)=>{result=r;},prepare:()=>claims.prepare(f.session)};
}
