import {createHash} from 'node:crypto';
import type {PermitRow} from '../database/permits.js';
import {AppError} from '../utils/errors.js';
import {CHAIN,USDC,XSGD,domainHash,hashes,executionQuoteSchema,deployment,same} from '../trades/contract.js';
import {checkPermit,permitDigest,PERMIT_SPENDER,PERMIT_RAW} from './protocol.js';

/** Pinned deployed runtime, inspected directly; explorer source is NOT verified. See PHASE7K.md. */
export const EXPIRY_RUNTIME_HASH='0xfe64f142bffc2ab52331e35fe9af24a4c8e4d65f49e5cb6e6a9623cf63392b97';
export const EXPIRY_PROOF='SEPOLIA_USDC_D505ACCF_0B00_TIMESTAMP_GT_REVERT_62791302_V1';
export const RETIREMENT_CLASS='EXPIRED_RESULT_UNKNOWN_NO_ACTIVE_AUTHORITY' as const;
export const INVALID_RETIREMENT_CLASS='EXPIRED_INVALID_SIGNATURE_NO_ACTIVE_AUTHORITY' as const;
export type AuthorityBlock={number:string;hash:string;timestamp:number;runtimeHash:string;domain:string;nonce:string;allowance:string};
export type AuthorityObservation={provider:string;chainId:number;token:string;owner:string;spender:string;decimals:number;finalized:AuthorityBlock;latest:AuthorityBlock;ownerLatestNonce:string;ownerPendingNonce:string};
export type ExpiredPermitEvidence={schema:1;classification:typeof RETIREMENT_CLASS;signatureResult:'UNKNOWN';requestId:string;version:string;digest:string;historicalHash:string;checkedAt:number;codeVersion:string;expiryProof:typeof EXPIRY_PROOF;observations:AuthorityObservation[];history:{status:'COMPLETE_BOUNDED'|'PARTIAL'|'UNAVAILABLE';fromBlock:string;toBlock:string;approvalCount:number;note:string};};
export const historicalPermitHash=(r:PermitRow)=>createHash('sha256').update(JSON.stringify(r)).digest('hex');
const validUint=(s:unknown):s is string=>typeof s==='string'&&/^(0|[1-9][0-9]*)$/.test(s)&&s.length<=78&&BigInt(s)<2n**256n;
function must(v:unknown):asserts v {if(!v)throw new AppError('PERMIT_LOCKED');}
/** Operator-only evidence. No HTTP endpoint or browser-supplied retirement capability exists. */
export function validateExpiredPermitRetirement(r:PermitRow,e:ExpiredPermitEvidence,now:number){
  must(e.schema===1&&e.classification===RETIREMENT_CLASS&&e.signatureResult==='UNKNOWN');
  validateRetirementAuthority(r,e,now);
}
/** Shared authority gates; signature classifications have separate strict reconciliation paths. */
export function validateRetirementAuthority(r:PermitRow,e:Omit<ExpiredPermitEvidence,'classification'|'signatureResult'>,now:number){
  must(['RESULT_UNKNOWN','PERMIT_INVALID'].includes(r.state)&&r.closed_at===null&&r.requested_at!==null&&r.signed_at===null&&!r.encrypted_signature);
  validateAuthorityEvidence(r,e,now);
}
/** Authority evidence only. Callers must separately prove the exact signature classification. */
export function validateAuthorityEvidence(r:PermitRow,e:Omit<ExpiredPermitEvidence,'classification'|'signatureResult'>,now:number){
  must(e.schema===1);
  must(e.requestId===r.id&&e.version===r.version&&e.digest===r.digest&&e.historicalHash===historicalPermitHash(r));
  must(/^[a-f0-9]{64}$/.test(e.codeVersion)&&e.expiryProof===EXPIRY_PROOF);
  // Local clock limits observation age only; financial expiry is established by finalized chain time below.
  must(Number.isSafeInteger(now)&&Number.isSafeInteger(e.checkedAt)&&e.checkedAt<=now&&now-e.checkedAt<=60_000);
  const p=JSON.parse(r.payload),q=executionQuoteSchema.parse(p.quote),d=deployment(p.deployment),m=q.permit.eip712.message;
  checkPermit(q.permit.eip712,r.wallet,r.requested_at!);
  must(p.amount==='50'&&p.fromSymbol==='USDC'&&p.toSymbol==='XSGD'&&same(d.sor_address,PERMIT_SPENDER));
  must(hashes(d,q).version===r.version&&hashes(d,q).struct===p.intentHash&&permitDigest(q.permit.eip712)===r.digest);
  must(same(q.route_params.inputToken,USDC)&&same(q.route_params.outputToken,XSGD)&&same(q.route_params.taker,r.wallet)&&same(q.route_params.recipient,r.wallet));
  must(q.route_params.maxInputAmount===PERMIT_RAW&&q.route_params.initialDepositAmount===PERMIT_RAW&&q.route_params.deadline===m.deadline);
  must(same(q.permit.token,USDC)&&same(q.permit.spender,PERMIT_SPENDER)&&q.permit.value_raw===PERMIT_RAW&&String(q.permit.nonce)===String(m.nonce));
  must(e.observations.length===2&&new Set(e.observations.map(o=>o.provider)).size===2);
  const domain=domainHash(q.permit.eip712.domain);
  for(const o of e.observations){
    must(/^[a-z0-9.-]+$/.test(o.provider)&&o.chainId===CHAIN&&same(o.token,USDC)&&same(o.owner,r.wallet)&&same(o.spender,PERMIT_SPENDER)&&o.decimals===6);
    must(validUint(o.ownerLatestNonce)&&validUint(o.ownerPendingNonce)&&o.ownerLatestNonce===o.ownerPendingNonce);
    for(const b of [o.finalized,o.latest]){
      must(validUint(b.number)&&/^0x[a-f0-9]{64}$/.test(b.hash)&&Number.isSafeInteger(b.timestamp)&&b.timestamp>m.deadline&&b.timestamp>q.expires_at);
      must(b.runtimeHash===EXPIRY_RUNTIME_HASH&&same(b.domain,domain)&&validUint(b.nonce)&&BigInt(b.nonce)>=BigInt(m.nonce)&&b.allowance==='0');
    }
    must(BigInt(o.latest.number)>=BigInt(o.finalized.number)&&o.latest.timestamp>=o.finalized.timestamp&&BigInt(o.latest.nonce)>=BigInt(o.finalized.nonce));
    must(o.latest.timestamp*1000<=now+5000&&now-o.latest.timestamp*1000<=180_000);
  }
  const[a,b]=e.observations;
  must(JSON.stringify(a!.finalized)===JSON.stringify(b!.finalized)&&JSON.stringify(a!.latest)===JSON.stringify(b!.latest)&&a!.ownerLatestNonce===b!.ownerLatestNonce);
  must(['COMPLETE_BOUNDED','PARTIAL','UNAVAILABLE'].includes(e.history.status)&&validUint(e.history.fromBlock)&&validUint(e.history.toBlock)&&BigInt(e.history.fromBlock)<=BigInt(e.history.toBlock)&&Number.isSafeInteger(e.history.approvalCount)&&e.history.approvalCount>=0&&e.history.note.length<=2000);
  // Approval history and nonce advancement NEVER turn the original result into NO_SIGNATURE_RETURNED.
}
