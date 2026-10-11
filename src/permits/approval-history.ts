import {encodeEventTopics,parseAbiItem,type Address} from 'viem';
import type {ReadOnlyRpc} from './retirement-chain.js';
import {USDC} from '../trades/contract.js';
import {PERMIT_SPENDER} from './protocol.js';
import {AppError} from '../utils/errors.js';

const hex=(n:bigint)=>'0x'+n.toString(16);
const pause=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
export const APPROVAL_HISTORY_CHUNK=50n;
/** Complete coverage from the pre-request block through the agreed finalized anchor.
 * Small, paced requests respect the observed free RPC limit. Never retries a failed
 * range, switches provider mid-scan, or promotes partial history to complete evidence.
 */
export async function collectEmptyApprovalHistory(
  providers:readonly ReadOnlyRpc[],owner:string,from:bigint,to:bigint,
  anchors:{startHash:string;endHash:string},wait=pause,
){
  if(providers.length!==2||providers[0]!.provider===providers[1]!.provider||from<0n||to<from||to-from>10000n||
    ![anchors.startHash,anchors.endHash].every(h=>/^0x[0-9a-f]{64}$/i.test(h)))throw new AppError('PERMIT_LOCKED');
  const topics=encodeEventTopics({abi:[parseAbiItem('event Approval(address indexed owner,address indexed spender,uint256 value)')],eventName:'Approval',args:{owner:owner as Address,spender:PERMIT_SPENDER}});
  const anchor=async(rpc:ReadOnlyRpc,n:bigint,expected:string)=>{
    const b=await rpc.call('eth_getBlockByNumber',[hex(n),false]) as {number?:unknown;hash?:unknown};
    if(b?.number!==hex(n)||typeof b.hash!=='string'||b.hash.toLowerCase()!==expected.toLowerCase())throw new AppError('PERMIT_LOCKED');
  };
  await Promise.all(providers.map(async rpc=>{
    await anchor(rpc,from,anchors.startHash);await anchor(rpc,to,anchors.endHash);
    for(let n=from;n<=to;n+=APPROVAL_HISTORY_CHUNK){
      await wait(400);
      const end=n+APPROVAL_HISTORY_CHUNK-1n<to?n+APPROVAL_HISTORY_CHUNK-1n:to;
      const logs=await rpc.call('eth_getLogs',[{address:USDC,topics,fromBlock:hex(n),toBlock:hex(end)}]);
      // Any matching approval is a conflict under this zero-authority retirement policy.
      if(!Array.isArray(logs)||logs.length!==0)throw new AppError('PERMIT_LOCKED');
    }
    await anchor(rpc,from,anchors.startHash);await anchor(rpc,to,anchors.endHash);
  }));
  return {status:'COMPLETE_BOUNDED' as const,fromBlock:String(from),toBlock:String(to),approvalCount:0,
    note:'Two independent RPCs returned zero exact owner/spender Approval logs across every bounded block; start and finalized end anchors were rechecked.'};
}
