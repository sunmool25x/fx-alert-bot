import{AppError}from'../utils/errors.js';import{checkPermit,permitDigest}from'./protocol.js';import type{PermitRow}from'../database/permits.js';
export type NoSignatureEvidence={reason:'OKX_1_9_1_STRING_REJECTED_BEFORE_DISPATCH';requestId:string;version:string;digest:string;wallet:string;reproducedCode:0;walletTransportCalls:0;servedBuildMatched:true;sdkHash:string;sourceEvidenceHash:string;chainId:11155111;domainVerified:true;independentDigestVerified:true;nonce:string;allowance:'0';blockTimestamp:number;checkedAt:number};
/** Operator-only proof, never accepted from a browser error, status call or public endpoint. */
export function validateNoSignatureClosure(r:PermitRow,e:NoSignatureEvidence,now:number){
  const fail=()=>{throw new AppError('PERMIT_LOCKED');};
  if(!['WALLET_ERROR','RESULT_UNKNOWN'].includes(r.state)||r.error_code!=='WALLET_TRANSPORT_ERROR'||r.rpc_code!==0||r.encrypted_signature||r.signed_at!==null||r.requested_at===null||r.closed_at!==null)fail();
  if(e.reason!=='OKX_1_9_1_STRING_REJECTED_BEFORE_DISPATCH'||e.requestId!==r.id||e.version!==r.version||e.digest!==r.digest||e.wallet.toLowerCase()!==r.wallet||e.reproducedCode!==0||e.walletTransportCalls!==0||e.servedBuildMatched!==true||!/^[a-f0-9]{64}$/.test(e.sdkHash)||!/^[a-f0-9]{64}$/.test(e.sourceEvidenceHash))fail();
  if(e.chainId!==11155111||e.domainVerified!==true||e.independentDigestVerified!==true||e.allowance!=='0'||!Number.isSafeInteger(e.checkedAt)||e.checkedAt>now||now-e.checkedAt>60000||!Number.isSafeInteger(e.blockTimestamp)||e.blockTimestamp*1000>now+5000)fail();
  const p=JSON.parse(r.payload),q=p.quote,data=q.permit.eip712;
  checkPermit(data,r.wallet,r.requested_at!);
  if(permitDigest(data)!==r.digest||e.nonce!==String(data.message.nonce)||e.blockTimestamp<=data.message.deadline||now<=q.expires_at*1000||p.amount!=='50')fail();
}
