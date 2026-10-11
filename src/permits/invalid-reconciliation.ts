import{createHash}from'node:crypto';
import{hashTypedData,recoverTypedDataAddress,type Hex}from'viem';
import type{PermitRow}from'../database/permits.js';
import{AppError}from'../utils/errors.js';
import{decryptPermit}from'./crypto.js';
import{PermitSignatureError,verifyPermitSignature}from'./protocol.js';
import{permitData,same}from'../trades/contract.js';
import{INVALID_RETIREMENT_CLASS,validateRetirementAuthority,type ExpiredPermitEvidence}from'./retirement.js';
export type CapturedPermitResult={permit_id:string;version:string;encrypted_response:string|null;response_kind:string;crypto_valid:number|null;validation_code:string;quote_expired:number;permit_expired:number;chain_status:string;received_at:number};
export type InvalidPermitEvidence=Omit<ExpiredPermitEvidence,'classification'|'signatureResult'>&{classification:typeof INVALID_RETIREMENT_CLASS;signatureResult:'INVALID_FOR_ORIGINAL_PERMIT';resultHash:string;reason:'MISSING_EIP712_DOMAIN_SCHEMA';canonicalRecovery:string;emptyDomainDigest:string};
export const capturedResultHash=(r:CapturedPermitResult)=>createHash('sha256').update(JSON.stringify(r)).digest('hex');
/** Read-only examination of retained ciphertext. Never emits/returns signature bytes. */
export async function inspectEmptyDomainResult(r:PermitRow,result:CapturedPermitResult,key:string){
  if(r.state!=='PERMIT_INVALID'||r.signed_at!==null||r.encrypted_signature||result.permit_id!==r.id||result.version!==r.version||result.response_kind!=='SIGNATURE_BYTES'||result.crypto_valid!==0||!result.encrypted_response)throw new AppError('PERMIT_LOCKED');
  const q=JSON.parse(r.payload).quote;
  if(Object.hasOwn(q.permit.eip712.types,'EIP712Domain'))throw new AppError('PERMIT_LOCKED');
  let signature=decryptPermit(result.encrypted_response,key,r.id+':'+r.user_id+':'+r.version+':response');
  try{
    let mismatch=false;try{await verifyPermitSignature(q.permit.eip712,signature,r.wallet,r.digest);}catch(e){if(e instanceof PermitSignatureError&&e.reason==='SIGNER_MISMATCH')mismatch=true;else throw new AppError('PERMIT_LOCKED');}
    if(!mismatch)throw new AppError('PERMIT_LOCKED');
    const canonical=permitData(q),empty={...canonical,types:{...canonical.types,EIP712Domain:[]}};
    const canonicalRecovery=await recoverTypedDataAddress({...canonical,signature:signature as Hex});
    if(!same(await recoverTypedDataAddress({...empty,signature:signature as Hex}),r.wallet)||same(canonicalRecovery,r.wallet))throw new AppError('PERMIT_LOCKED');
    return{resultHash:capturedResultHash(result),reason:'MISSING_EIP712_DOMAIN_SCHEMA' as const,canonicalRecovery,emptyDomainDigest:hashTypedData(empty)};
  }finally{signature='';}
}
export function validateInvalidRetirement(r:PermitRow,e:InvalidPermitEvidence,now:number){
  if(e.classification!==INVALID_RETIREMENT_CLASS||e.signatureResult!=='INVALID_FOR_ORIGINAL_PERMIT'||e.reason!=='MISSING_EIP712_DOMAIN_SCHEMA'||!/^[a-f0-9]{64}$/.test(e.resultHash))throw new AppError('PERMIT_LOCKED');
  validateRetirementAuthority(r,e,now);
}
