import {DatabaseSync} from 'node:sqlite';
import {resolve} from 'node:path';import {fileURLToPath} from 'node:url';
import {loadConfig} from '../src/config/index.js';import {readEnvironment} from './live/environment.js';
import {sourceFingerprint} from './live/reload.js';
import {PermitStore,type PermitRow} from '../src/database/permits.js';
import type {CapturedPermitResult} from '../src/permits/invalid-reconciliation.js';
import {inspectSignedPermit,validateValidRetirement,VALID_RETIREMENT_CLASS,type ValidRetirementEvidence} from '../src/permits/valid-retirement.js';
import {EXPIRY_PROOF,historicalPermitHash} from '../src/permits/retirement.js';
import {collectAuthority,readOnlyRpc} from '../src/permits/retirement-chain.js';
import {same} from '../src/trades/contract.js';
import {collectEmptyApprovalHistory} from '../src/permits/approval-history.js';
import {AppError} from '../src/utils/errors.js';
let stage='INPUT';
/** Default dry run. Applying requires the separately authorized migration 15 already installed. */
async function main(){
  const args=process.argv.slice(2),id=args[args.indexOf('--request')+1],apply=args.includes('--apply');
  if(!args.includes('--request')||!id||!/^[a-f0-9]{64}$/.test(id))throw new AppError('PERMIT_LOCKED');
  const c=loadConfig(readEnvironment(process.cwd()));if(c.wallet.enabled||c.network!=='sepolia')throw new AppError('EXECUTION_DISABLED');
  const db=new DatabaseSync(c.databasePath,{readOnly:true});let row:PermitRow,result:CapturedPermitResult;
  try{row=db.prepare('SELECT * FROM permit_acceptance WHERE id=?').get(id) as unknown as PermitRow;result=db.prepare('SELECT * FROM permit_results WHERE permit_id=? AND version=?').get(id,row?.version??'') as CapturedPermitResult;
    if(!row||!result||!same(row.wallet,c.wallet.permitWallet)||!c.wallet.users.includes(row.user_id)||new PermitStore(db).financialPending(row))throw new AppError('PERMIT_LOCKED');
  }finally{db.close();}
  const checked=await inspectSignedPermit(row,result,c.wallet.permitKey),a=readOnlyRpc('https://ethereum-sepolia-rpc.publicnode.com'),b=readOnlyRpc('https://sepolia.drpc.org');
  stage='AUTHORITY';
  const observations=await collectAuthority(a,b,row.wallet,JSON.parse(row.payload).quote.permit.eip712.message.deadline),end=BigInt(observations[0]!.finalized.number);
  stage='BOUNDED_HISTORY_START';
  let low=end>10000n?end-10000n:0n,high=end;const get=async(n:bigint)=>(await a.call('eth_getBlockByNumber',['0x'+n.toString(16),false])) as{timestamp:string;hash:string};
  if(Number(BigInt((await get(low)).timestamp))*1000>row.requested_at!)throw new AppError('PERMIT_LOCKED');
  while(low<high){const mid=(low+high+1n)/2n;if(Number(BigInt((await get(mid)).timestamp))*1000<=row.requested_at!)low=mid;else high=mid-1n;}
  if(end-low>10000n)throw new AppError('PERMIT_LOCKED');
  const starts=await Promise.all([a,b].map(r=>r.call('eth_getBlockByNumber',['0x'+low.toString(16),false]))) as{timestamp:string;hash:string}[];
  if(starts[0]!.hash!==starts[1]!.hash)throw new AppError('PERMIT_LOCKED');
  stage='APPROVAL_HISTORY';
  const history=await collectEmptyApprovalHistory([a,b],row.wallet,low,end,{startHash:starts[0]!.hash,endHash:observations[0]!.finalized.hash});
  const evidence:ValidRetirementEvidence={schema:1,classification:VALID_RETIREMENT_CLASS,...checked,requestId:row.id,version:row.version,digest:row.digest,historicalHash:historicalPermitHash(row),checkedAt:Date.now(),codeVersion:sourceFingerprint(process.cwd()),expiryProof:EXPIRY_PROOF,observations,historyStartTime:Number(BigInt(starts[0]!.timestamp)),history};
  stage='VALIDATE';
  validateValidRetirement(row,evidence,Date.now());
  if(apply){const write=new DatabaseSync(c.databasePath);try{write.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000');if(!write.prepare('SELECT 1 FROM schema_migrations WHERE version=15').get())throw new AppError('PERMIT_LOCKED');await new PermitStore(write).retireExpiredValid(row,evidence,c.wallet.permitKey);}finally{write.close();}}
  console.info(JSON.stringify({dryRun:!apply,signature:'VALID_FOR_ORIGINAL_PERMIT',authority:'EXPIRED',criteriaPassed:true,retired:apply,financialRequestCreated:false}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))void main().catch(e=>{console.error(JSON.stringify({retirement:'BLOCKED',stage,code:e instanceof AppError?e.code:'UNAVAILABLE'}));process.exitCode=1;});
