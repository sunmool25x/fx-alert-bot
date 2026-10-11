import {encodeFunctionData,decodeFunctionResult,parseAbi,keccak256,type Hex} from 'viem';
import {CHAIN,USDC} from '../trades/contract.js';
import {PERMIT_SPENDER} from './protocol.js';
import {AppError} from '../utils/errors.js';
import type {AuthorityBlock,AuthorityObservation} from './retirement.js';
import {proveExpiredPermitRuntime} from './expiry-proof.js';
export interface ReadOnlyRpc{provider:string;call(method:string,params:unknown[]):Promise<unknown>}
const methods=new Set(['eth_chainId','eth_getBlockByNumber','eth_getCode','eth_call','eth_getTransactionCount','eth_getLogs']);
export function readOnlyRpc(url:string):ReadOnlyRpc{
  const parsed=new URL(url);if(parsed.protocol!=='https:')throw new AppError('PERMIT_LOCKED');let id=0;
  return{provider:parsed.hostname,async call(method,params){
    if(!methods.has(method))throw new AppError('PERMIT_LOCKED');
    try{const response=await fetch(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:++id,method,params})});
      const data=await response.json() as{error?:unknown;result?:unknown};if(!response.ok||data.error||data.result===undefined||data.result===null)throw Error();return data.result;
    }catch{throw new AppError('UNAVAILABLE');}
  }};
}
const abi=parseAbi(['function allowance(address,address) view returns(uint256)','function nonces(address) view returns(uint256)','function DOMAIN_SEPARATOR() view returns(bytes32)','function decimals() view returns(uint8)']);
const uint=(v:unknown)=>{if(typeof v!=='string'||!/^0x[0-9a-f]+$/i.test(v))throw new AppError('PERMIT_LOCKED');return BigInt(v);};
function block(value:unknown){const b=value as{number?:unknown;hash?:unknown;timestamp?:unknown};if(typeof b?.hash!=='string'||!/^0x[0-9a-f]{64}$/i.test(b.hash))throw new AppError('PERMIT_LOCKED');return{number:uint(b.number),hash:b.hash.toLowerCase(),timestamp:Number(uint(b.timestamp))};}
async function read(rpc:ReadOnlyRpc,name:'allowance'|'nonces'|'DOMAIN_SEPARATOR'|'decimals',args:readonly unknown[],tag:string){
  const data=encodeFunctionData({abi,functionName:name,args:args as never});const result=await rpc.call('eth_call',[{to:USDC,data},tag]);return decodeFunctionResult({abi,functionName:name,data:result as Hex});
}
/** Exactly two independent RPC hosts, agreed common finalized and latest anchors; no financial RPC methods. */
export async function collectAuthority(a:ReadOnlyRpc,b:ReadOnlyRpc,owner:string,deadline:number):Promise<AuthorityObservation[]>{
  if(a.provider===b.provider)throw new AppError('PERMIT_LOCKED');const providers=[a,b];
  const heads=await Promise.all(providers.map(async rpc=>{
    const chainId=Number(uint(await rpc.call('eth_chainId',[])));if(chainId!==CHAIN)throw new AppError('NETWORK_MISMATCH');
    return{finalized:block(await rpc.call('eth_getBlockByNumber',['finalized',false])),latest:block(await rpc.call('eth_getBlockByNumber',['latest',false]))};
  }));
  const lower=(kind:'finalized'|'latest')=>heads.reduce((n,h)=>h[kind].number<n?h[kind].number:n,heads[0]![kind].number);
  const tags={finalized:'0x'+lower('finalized').toString(16),latest:'0x'+lower('latest').toString(16)};
  const observations=await Promise.all(providers.map(async rpc=>{
    const at=async(tag:string):Promise<AuthorityBlock>=>{
      const anchor=block(await rpc.call('eth_getBlockByNumber',[tag,false]));if(anchor.number!==BigInt(tag))throw new AppError('PERMIT_LOCKED');
      const runtime=await rpc.call('eth_getCode',[USDC,tag]) as Hex;
      proveExpiredPermitRuntime(runtime,owner,deadline,anchor.timestamp);
      const nonce=String(await read(rpc,'nonces',[owner],tag)),allowance=String(await read(rpc,'allowance',[owner,PERMIT_SPENDER],tag)),domain=String(await read(rpc,'DOMAIN_SEPARATOR',[],tag)).toLowerCase();
      const again=block(await rpc.call('eth_getBlockByNumber',[tag,false]));if(again.hash!==anchor.hash)throw new AppError('PERMIT_LOCKED');
      return{number:anchor.number.toString(),hash:anchor.hash,timestamp:anchor.timestamp,runtimeHash:keccak256(runtime),domain,nonce,allowance};
    };
    const finalized=await at(tags.finalized),latest=await at(tags.latest);
    const decimals=Number(await read(rpc,'decimals',[],tags.latest));
    const ownerLatestNonce=uint(await rpc.call('eth_getTransactionCount',[owner,'latest'])).toString(),ownerPendingNonce=uint(await rpc.call('eth_getTransactionCount',[owner,'pending'])).toString();
    return{provider:rpc.provider,chainId:CHAIN,token:USDC,owner,spender:PERMIT_SPENDER,decimals,finalized,latest,ownerLatestNonce,ownerPendingNonce};
  }));
  if(JSON.stringify(observations[0]!.finalized)!==JSON.stringify(observations[1]!.finalized)||JSON.stringify(observations[0]!.latest)!==JSON.stringify(observations[1]!.latest))throw new AppError('PERMIT_LOCKED');
  return observations;
}
