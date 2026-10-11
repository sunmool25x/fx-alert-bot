import type {PermitRow} from '../database/permits.js';
import {decryptPermit} from './crypto.js';
import {verifyPermitSignature} from './protocol.js';
import {capturedResultHash,type CapturedPermitResult} from './invalid-reconciliation.js';
import {validateAuthorityEvidence,type ExpiredPermitEvidence} from './retirement.js';
import {AppError} from '../utils/errors.js';
export const VALID_RETIREMENT_CLASS='EXPIRED_VALID_SIGNATURE_NO_ACTIVE_AUTHORITY' as const;
export type ValidRetirementEvidence=Omit<ExpiredPermitEvidence,'classification'|'signatureResult'>&{classification:typeof VALID_RETIREMENT_CLASS;signatureResult:'VALID_FOR_ORIGINAL_PERMIT';resultHash:string;historyStartTime:number};
/** Expiry changes usability, never the cryptographic result. Both retained copies must agree. */
export async function inspectSignedPermit(row:PermitRow,result:CapturedPermitResult,key:string){
  if(row.state!=='PERMIT_SIGNED'||!row.encrypted_signature||row.signed_at===null||row.requested_at===null||row.closed_at!==null||result.permit_id!==row.id||result.version!==row.version||result.crypto_valid!==1||result.response_kind!=='SIGNATURE_BYTES'||!result.encrypted_response)throw new AppError('PERMIT_LOCKED');
  let signature='',callback='';try{
    signature=decryptPermit(row.encrypted_signature,key,row.id+':'+row.user_id+':'+row.version);
    callback=decryptPermit(result.encrypted_response,key,row.id+':'+row.user_id+':'+row.version+':response');
    if(signature.toLowerCase()!==callback.toLowerCase())throw new AppError('PERMIT_LOCKED');
    await verifyPermitSignature(JSON.parse(row.payload).quote.permit.eip712,signature,row.wallet,row.digest);
    return{resultHash:capturedResultHash(result),signatureResult:'VALID_FOR_ORIGINAL_PERMIT' as const};
  }finally{signature='';callback='';}
}
export function validateValidRetirement(row:PermitRow,e:ValidRetirementEvidence,now:number){
  if(row.state!=='PERMIT_SIGNED'||!row.encrypted_signature||row.signed_at===null||row.requested_at===null||row.closed_at!==null||e.classification!==VALID_RETIREMENT_CLASS||e.signatureResult!=='VALID_FOR_ORIGINAL_PERMIT'||!/^[a-f0-9]{64}$/.test(e.resultHash))throw new AppError('PERMIT_LOCKED');
  validateAuthorityEvidence(row,e,now);
  // A more conservative separate policy for known-valid signatures; incomplete history never retires them.
  if(e.history.status!=='COMPLETE_BOUNDED'||e.history.approvalCount!==0||e.history.toBlock!==e.observations[0]!.finalized.number||!Number.isSafeInteger(e.historyStartTime)||e.historyStartTime*1000>row.requested_at)throw new AppError('PERMIT_LOCKED');
}
