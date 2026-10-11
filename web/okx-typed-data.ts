import{hashTypedData,type TypedDataDefinition}from'viem';
import{WalletFlowError}from'./connection.js';
import {intentRpcData} from '../src/trades/intent-protocol.js';
import{permitRpcData}from'../src/permits/protocol.js';
/** EIP-1193 uses a JSON string; OKX Connect 1.9.1's array adapter requires an object. */
export function okxTypedDataRequest(args:{method:string;params:unknown[]},owner:string){
  if(args.method!=='eth_signTypedData_v4')return args;
  if(args.params.length!==2||typeof args.params[0]!=='string'||args.params[0].toLowerCase()!==owner.toLowerCase())throw new WalletFlowError('WALLET_REQUIRED');
  let data:any;try{data=typeof args.params[1]==='string'?JSON.parse(args.params[1]):structuredClone(args.params[1]);}catch{throw new WalletFlowError('INVALID_PERMIT');}
  if(!data||typeof data!=='object'||Array.isArray(data)||!data.domain||data.domain.chainId!==11155111)throw new WalletFlowError('NETWORK_MISMATCH');
  if(!data.types||typeof data.primaryType!=='string'||!data.message||typeof data.message!=='object')throw new WalletFlowError('INVALID_PERMIT');
  if(data.primaryType==='Permit'&&data.message.owner?.toLowerCase()!==owner.toLowerCase())throw new WalletFlowError('WALLET_REQUIRED');
  // Keep the financial digest; explicitly declare its domain for JSON-RPC wallets.
  if(data.primaryType==='Permit')data=permitRpcData(data,owner);
  else if(data.primaryType==='Intent')data=intentRpcData(data,owner);
  try{hashTypedData(data as TypedDataDefinition);}catch{throw new WalletFlowError('INVALID_PERMIT');}
  return{method:args.method,params:[args.params[0],data]};
}
