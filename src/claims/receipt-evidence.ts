import {CLAIM_COST_CAP,type ClaimTransaction} from './protocol.js';
export interface ReceiptFees {gas:bigint;maxFeePerGas?:bigint;maxPriorityFeePerGas?:bigint}
export function receiptCosts(review:ClaimTransaction,tx:ReceiptFees,receipt:{gasUsed:bigint;effectiveGasPrice:bigint}){
  const reviewedMaximum=BigInt(review.gas)*BigInt(review.maxFeePerGas);
  const actualMaximum=tx.gas*(tx.maxFeePerGas??0n),paid=receipt.gasUsed*receipt.effectiveGasPrice;
  // Wallets may reprice EIP-1559 fees. Preserve the reviewed TOTAL cost ceiling,
  // absolute safety cap and gas limit; do not mislabel a per-gas adjustment as missing tokens.
  const valid=tx.gas>0n&&tx.gas<=BigInt(review.gas)&&tx.maxFeePerGas!==undefined&&tx.maxFeePerGas>0n&&
    tx.maxPriorityFeePerGas!==undefined&&tx.maxPriorityFeePerGas>=0n&&tx.maxPriorityFeePerGas<=tx.maxFeePerGas&&
    actualMaximum<=reviewedMaximum&&actualMaximum<=CLAIM_COST_CAP&&receipt.gasUsed>0n&&receipt.gasUsed<=tx.gas&&
    receipt.effectiveGasPrice>=0n&&receipt.effectiveGasPrice<=tx.maxFeePerGas&&paid<=reviewedMaximum&&paid<=CLAIM_COST_CAP;
  return {valid,reviewedMaximum,actualMaximum,paid,feeAdjusted:tx.gas!==BigInt(review.gas)||tx.maxFeePerGas!==BigInt(review.maxFeePerGas)||tx.maxPriorityFeePerGas!==BigInt(review.maxPriorityFeePerGas)};
}
export const nativeAccounting=(before:bigint,received:bigint,gasPaid:bigint,after:bigint)=>before+received-gasPaid===after;
