import {hashTypedData,recoverTypedDataAddress,type Hex,type Address} from 'viem';
import type{ExecutionQuote}from'../trades/contract.js';
import{AppError}from'../utils/errors.js';
const same=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase();
function requireThat(c:unknown,code:string):asserts c{if(!c)throw new AppError(code);}
// Browser-safe canonical ERC-2612 shape; tested against the execution contract validator.
const USDC='0x965d4b4546716e416e950bc30467d128455d2d0e',CHAIN=11155111;
const permitTypes={Permit:[{name:'owner',type:'address'},{name:'spender',type:'address'},{name:'value',type:'uint256'},{name:'nonce',type:'uint256'},{name:'deadline',type:'uint256'}]} as const;
function typed(data:PermitTypedData){const m=data.message;return{domain:{...data.domain,verifyingContract:data.domain.verifyingContract as Address},types:permitTypes,primaryType:'Permit' as const,message:{owner:m.owner as Address,spender:m.spender as Address,value:BigInt(m.value),nonce:BigInt(m.nonce),deadline:BigInt(m.deadline)}};}
export const PERMIT_SPENDER='0x83c1368110B640A729f3810De5FBe94b99aa5668';
export const PERMIT_RAW='50000000';
export type PermitTypedData=ExecutionQuote['permit']['eip712'];
export const permitDomainTypes=[{name:'name',type:'string'},{name:'version',type:'string'},{name:'chainId',type:'uint256'},{name:'verifyingContract',type:'address'}] as const;
export class PermitSignatureError extends AppError{
  constructor(readonly reason:'DIGEST_MISMATCH'|'SIGNATURE_FORMAT'|'NON_CANONICAL_SIGNATURE'|'RECOVERY_FAILED'|'SIGNER_MISMATCH'){super('INVALID_PERMIT');}
}
/** Explicit JSON-RPC domain schema; viem's implicit inference is not a wire-format guarantee. */
export function permitRpcData(input:PermitTypedData,owner:string){
  const data=structuredClone(input),types=data.types as typeof data.types&{EIP712Domain?:unknown};
  if(types.EIP712Domain!==undefined&&JSON.stringify(types.EIP712Domain)!==JSON.stringify(permitDomainTypes))throw new AppError('INVALID_PERMIT');
  delete types.EIP712Domain;checkPermitFields(data,owner);
  if(Object.keys(data.domain).sort().join(',')!=='chainId,name,verifyingContract,version'||!data.domain.name||!data.domain.version)throw new AppError('INVALID_PERMIT');
  const wire={...data,types:{EIP712Domain:permitDomainTypes,...data.types}};
  if(hashTypedData(wire as never)!==permitDigest(data))throw new AppError('INVALID_PERMIT');
  return wire;
}
function checkPermitFields(data:PermitTypedData,owner:string){
  requireThat(data.primaryType==='Permit'&&JSON.stringify(data.types)===JSON.stringify(permitTypes),'INVALID_PERMIT');
  requireThat(data.domain.chainId===CHAIN&&same(data.domain.verifyingContract,USDC),'INVALID_PERMIT');
  const m=data.message;
  requireThat(Object.keys(m).length===5&&same(m.owner,owner)&&same(m.spender,PERMIT_SPENDER)&&m.value===PERMIT_RAW,'INVALID_PERMIT');
  requireThat(BigInt(m.nonce)>=0n&&Number.isSafeInteger(m.deadline)&&m.deadline>0,'INVALID_PERMIT');
}
export function checkPermit(data:PermitTypedData,owner:string,now:number){checkPermitFields(data,owner);requireThat(data.message.deadline*1000>now,'INVALID_PERMIT');}
export function permitDigest(data:PermitTypedData){return hashTypedData(typed(data));}
export async function verifyPermit(data:PermitTypedData,signature:unknown,owner:string,digest:string,now:number){
  checkPermit(data,owner,now);
  return verifyPermitSignature(data,signature,owner,digest);
}
/** Cryptographic verification of ORIGINAL data, independent of quote/Permit expiry or current nonce. */
export async function verifyPermitSignature(data:PermitTypedData,signature:unknown,owner:string,digest:string){
  checkPermitFields(data,owner);
  if(permitDigest(data)!==digest)throw new PermitSignatureError('DIGEST_MISMATCH');
  if(typeof signature!=='string'||!/^0x[0-9a-fA-F]{130}$/.test(signature))throw new PermitSignatureError('SIGNATURE_FORMAT');
  const r=BigInt('0x'+signature.slice(2,66)),s=BigInt('0x'+signature.slice(66,130)),v=signature.slice(130).toLowerCase();
  const order=0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
  if(!(r>0n&&r<order&&s>0n&&s<=order/2n&&['1b','1c'].includes(v)))throw new PermitSignatureError('NON_CANONICAL_SIGNATURE');
  let recovered:string;try{recovered=await recoverTypedDataAddress({...typed(data),signature:signature as Hex});}catch{throw new PermitSignatureError('RECOVERY_FAILED');}
  if(!same(recovered,owner))throw new PermitSignatureError('SIGNER_MISMATCH');return signature.toLowerCase() as Hex;
}
