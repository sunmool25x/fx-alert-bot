import {hashTypedData,recoverTypedDataAddress,type Hex} from 'viem';
import {AppError} from '../utils/errors.js';
import {permitDomainTypes} from '../permits/protocol.js';

export const SERA_INTENT_CONTRACT='0x83475A1bD98a8DC2DCd507A747e4DC85da241D6e';
export const canonicalIntentTypes={Intent:[
  {name:'taker',type:'address'},{name:'inputToken',type:'address'},{name:'outputToken',type:'address'},
  {name:'maxInputAmount',type:'uint256'},{name:'minOutputAmount',type:'uint256'},{name:'recipient',type:'address'},
  {name:'initialDepositAmount',type:'uint256'},{name:'uuid',type:'uint256'},{name:'deadline',type:'uint48'},
]} as const;
// Public testnet token identities; intentionally duplicated at the browser-safe boundary.
const USDC='0x965d4b4546716e416e950bc30467d128455d2d0e',XSGD='0x058e06ca2628165a6cd1e80e4dc82203dc0020aa';
const same=(a:unknown,b:string)=>typeof a==='string'&&a.toLowerCase()===b.toLowerCase();
function must(v:unknown):asserts v {if(!v)throw new AppError('INVALID_SIGNATURE');}
/** Browser-safe exact protocol schema, independent of display strings. */
export function intentRpcData(input:unknown,owner:string){
  const d=structuredClone(input) as any;
  must(d&&d.primaryType==='Intent'&&d.types&&d.domain&&d.message);
  must(Object.keys(d).sort().join(',')==='domain,message,primaryType,types');
  must(Object.keys(d.domain).sort().join(',')==='chainId,name,verifyingContract,version');
  must(d.domain.name==='Sera'&&d.domain.version==='1'&&d.domain.chainId===11155111&&same(d.domain.verifyingContract,SERA_INTENT_CONTRACT));
  if(d.types.EIP712Domain!==undefined)must(JSON.stringify(d.types.EIP712Domain)===JSON.stringify(permitDomainTypes));
  delete d.types.EIP712Domain;must(JSON.stringify(d.types)===JSON.stringify(canonicalIntentTypes));
  const m=d.message;must(Object.keys(m).sort().join(',')===canonicalIntentTypes.Intent.map(f=>f.name).sort().join(','));
  for(const k of ['taker','recipient','inputToken','outputToken'])must(/^0x[0-9a-fA-F]{40}$/.test(m[k]));
  must(same(m.taker,owner)&&same(m.recipient,owner));
  must(same(m.inputToken,USDC)&&same(m.outputToken,XSGD));
  for(const k of ['maxInputAmount','minOutputAmount','initialDepositAmount','uuid']){
    must((typeof m[k]==='string'&&/^[1-9][0-9]*$/.test(m[k])||typeof m[k]==='bigint')&&BigInt(m[k])>0n&&BigInt(m[k])<2n**256n);
    m[k]=String(m[k]);
  }
  must(m.initialDepositAmount===m.maxInputAmount&&Number.isSafeInteger(m.deadline)&&m.deadline>0&&m.deadline<2**48);
  const digest=hashTypedData(d);
  d.types={EIP712Domain:structuredClone(permitDomainTypes),...structuredClone(canonicalIntentTypes)};must(hashTypedData(d)===digest);
  return d;
}
export async function verifyIntentSignature(data:unknown,signature:unknown,owner:string,expected:string){
  const wire=intentRpcData(data,owner);must(hashTypedData(wire)===expected);
  must(typeof signature==='string'&&/^0x[0-9a-fA-F]{130}$/.test(signature));
  const r=BigInt('0x'+signature.slice(2,66)),s=BigInt('0x'+signature.slice(66,130));
  const order=0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
  must(r>0n&&r<order&&s>0n&&s<=order/2n&&['1b','1c'].includes(signature.slice(130).toLowerCase()));
  try{must(same(await recoverTypedDataAddress({...wire,signature:signature as Hex}),owner));}catch{throw new AppError('INVALID_SIGNATURE');}
  return signature.toLowerCase() as Hex;
}
