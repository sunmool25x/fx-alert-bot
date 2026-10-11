import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadConfig} from '../src/config/index.js';
import {inspectEmptyDomainResult,type InvalidPermitEvidence,type CapturedPermitResult} from '../src/permits/invalid-reconciliation.js';
import {INVALID_RETIREMENT_CLASS,validateRetirementAuthority} from '../src/permits/retirement.js';
import {PermitStore,type PermitRow} from '../src/database/permits.js';
import {EXPIRY_PROOF,RETIREMENT_CLASS,historicalPermitHash,validateExpiredPermitRetirement,type ExpiredPermitEvidence} from '../src/permits/retirement.js';
import {collectAuthority,readOnlyRpc} from '../src/permits/retirement-chain.js';
import {deployment,same,USDC} from '../src/trades/contract.js';
import {PERMIT_SPENDER} from '../src/permits/protocol.js';
import {SeraClient} from '../src/sera/client.js';
import {readEnvironment} from './live/environment.js';
import {sourceFingerprint} from './live/reload.js';
import {AppError} from '../src/utils/errors.js';

/** Explicit local operator command only. Default is read-only; no wallet/relayer transport exists here. */
async function main(){
  const root=process.cwd(),args=process.argv.slice(2),value=(flag:string)=>{const i=args.indexOf(flag);return i<0?undefined:args[i+1];};
  const requestId=value('--request'),apply=args.includes('--apply'),invalid=args.includes('--invalid-domain');
  if(!requestId||!/^[a-f0-9]{64}$/.test(requestId))throw new AppError('PERMIT_LOCKED');
  const c=loadConfig(readEnvironment(root));if(c.network!=='sepolia'||c.chainId!==11155111||c.wallet.enabled)throw new AppError('EXECUTION_DISABLED');
  const destination=resolve(root,value('--evidence')??(invalid?'.dev-live/phase7l/retirement-evidence.json':'.dev-live/phase7k/retirement-evidence.json'));
  if(!destination.startsWith(resolve(root,'.dev-live')+sep))throw new AppError('PERMIT_LOCKED');
  const d=new DatabaseSync(c.databasePath,{readOnly:true});let row:PermitRow,captured:CapturedPermitResult|undefined;
  try{
    if(!d.prepare('SELECT 1 FROM schema_migrations WHERE version=13').get())throw new AppError('PERMIT_LOCKED');
    if(invalid&&!d.prepare('SELECT 1 FROM schema_migrations WHERE version=14').get())throw new AppError('PERMIT_LOCKED');
    row=d.prepare('SELECT * FROM permit_acceptance WHERE id=?').get(requestId) as unknown as PermitRow;
    if(!row||!same(row.wallet,c.wallet.permitWallet)||!c.wallet.users.includes(row.user_id))throw new AppError('PERMIT_LOCKED');
    const store=new PermitStore(d),retired=store.retirement(row);if(retired){console.info(JSON.stringify({requestId,retired:true,classification:retired.classification,signatureResult:JSON.parse(retired.evidence).signatureResult,changed:false}));return;}
    captured=d.prepare('SELECT * FROM permit_results WHERE permit_id=? AND version=?').get(row.id,row.version) as CapturedPermitResult|undefined;
    if(store.financialPending(row)||(!invalid&&captured)||(invalid&&!captured))throw new AppError('PERMIT_LOCKED');
  }finally{d.close();}
  const live=deployment(await new SeraClient(c).liveConfig());if(!same(live.sor_address,PERMIT_SPENDER))throw new AppError('UNEXPECTED_CONTRACT');
  const snapshot=JSON.parse(row.payload);if(!same(snapshot.quote.permit.token,USDC))throw new AppError('UNEXPECTED_CONTRACT');
  const observations=await collectAuthority(readOnlyRpc('https://ethereum-sepolia-rpc.publicnode.com'),readOnlyRpc('https://sepolia.drpc.org'),row.wallet,snapshot.quote.permit.eip712.message.deadline);
  let history:ExpiredPermitEvidence['history']={status:'UNAVAILABLE',fromBlock:'0',toBlock:'0',approvalCount:0,note:'No historical event scan supplied. Current authority is checked independently; historical signature remains UNKNOWN.'};
  const historyFile=value('--history');if(historyFile){const saved=JSON.parse(readFileSync(resolve(root,historyFile),'utf8'));const p=saved.providers?.find((item:{historyStatus:string})=>item.historyStatus==='COMPLETE_BOUNDED');
    if(!p||saved.event!=='Approval(address,address,uint256)'||!Number.isSafeInteger(saved.fromBlock)||!Number.isSafeInteger(saved.toFinalizedBlock))throw new AppError('PERMIT_LOCKED');
    const complete=saved.providers.filter((item:{historyStatus:string})=>item.historyStatus==='COMPLETE_BOUNDED').length;
    history={status:complete>=2?'COMPLETE_BOUNDED':'PARTIAL',fromBlock:String(saved.fromBlock),toBlock:String(saved.toFinalizedBlock),approvalCount:p.approvalEventCount,note:`Exact token/owner/spender Approval filter: ${complete} providers completed the supplied bounded range. Any uncompleted provider history is unavailable. No events does not establish absence of an off-chain signature.`};
  }
  const e:ExpiredPermitEvidence={schema:1,classification:RETIREMENT_CLASS,signatureResult:'UNKNOWN',requestId:row.id,version:row.version,digest:row.digest,historicalHash:historicalPermitHash(row),checkedAt:Date.now(),codeVersion:sourceFingerprint(root),expiryProof:EXPIRY_PROOF,observations,history};
  if(invalid)validateRetirementAuthority(row,e,Date.now());else validateExpiredPermitRetirement(row,e,Date.now());
  const decision:ExpiredPermitEvidence|InvalidPermitEvidence=invalid?{...e,classification:INVALID_RETIREMENT_CLASS,signatureResult:'INVALID_FOR_ORIGINAL_PERMIT',...await inspectEmptyDomainResult(row,captured!,c.wallet.permitKey)}:e;
  mkdirSync(dirname(destination),{recursive:true});writeFileSync(destination,JSON.stringify(decision,null,2),{mode:0o600});
  let retired=false;
  if(apply){const db=new DatabaseSync(c.databasePath);try{db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000');const store=new PermitStore(db);if(invalid)await store.retireExpiredInvalid(row,decision as InvalidPermitEvidence,c.wallet.permitKey);else store.retireExpiredUnknown(row,e);retired=true;
      if(historicalPermitHash(store.row(row.id,row.user_id)!)!==e.historicalHash||db.prepare('PRAGMA integrity_check').get()?.integrity_check!=='ok'||db.prepare('PRAGMA foreign_key_check').all().length)throw new AppError('PERMIT_LOCKED');
    }finally{db.close();}}
  console.info(JSON.stringify({requestId:row.id,signatureResult:decision.signatureResult,criteriaPassed:true,retired,classification:retired?decision.classification:null,finalized:observations[0]!.finalized,latest:observations[0]!.latest,pendingOwnerNonce:observations[0]!.ownerPendingNonce,financialRequestCreated:false,mainnet:false,swapExecution:false}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))void main().catch(e=>{const code=e instanceof AppError?e.code:'UNAVAILABLE';console.error(JSON.stringify({retirement:'BLOCKED',code,newFinancialRequest:false}));process.exitCode=1;});
