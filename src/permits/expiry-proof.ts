import {keccak256,toFunctionSelector,type Hex} from 'viem';
import {EXPIRY_RUNTIME_HASH,EXPIRY_PROOF} from './retirement.js';
import {PERMIT_RAW,PERMIT_SPENDER} from './protocol.js';
import {AppError} from '../utils/errors.js';
/** Narrow interpreter for the PINNED deployed runtime's expired Permit path, not a general EVM.
 * Signature words stay symbolic. No signature is created, signed, or sent to an RPC.
 * Unsupported instructions or branches fail closed. The path must revert before external calls/SSTORE.
 */
export function proveExpiredPermitRuntime(runtime:Hex,owner:string,deadline:number,timestamp:number){
  const fail=():never=>{throw new AppError('PERMIT_LOCKED');};
  if(keccak256(runtime)!==EXPIRY_RUNTIME_HASH||!Number.isSafeInteger(deadline)||!Number.isSafeInteger(timestamp)||deadline<=0||timestamp<=deadline)fail();
  const code=Buffer.from(runtime.slice(2),'hex'),mask=(1n<<256n)-1n;
  type Symbolic={symbol:'v'|'r'|'s'};type Word=bigint|Symbolic;
  const v:Symbolic={symbol:'v'},r:Symbolic={symbol:'r'},s:Symbolic={symbol:'s'};
  const args:Word[]=[BigInt(owner),BigInt(PERMIT_SPENDER),BigInt(PERMIT_RAW),BigInt(deadline),v,r,s];
  const calldata=new Map<bigint,Word>([[0n,BigInt(toFunctionSelector('permit(address,address,uint256,uint256,uint8,bytes32,bytes32)'))<<224n],...args.map((arg,i):[bigint,Word]=>[4n+BigInt(i*32),arg])]);
  const stack:Word[]=[],memory=new Map<bigint,Word>();let pc=0,deadlineLocated=false,steps=0;
  const pop=():Word=>stack.pop()??fail();const integer=(w:Word):bigint=>typeof w==='bigint'?w:fail();
  const binary=(fn:(a:bigint,b:bigint)=>bigint)=>{const a=integer(pop()),b=integer(pop());stack.push(fn(a,b)&mask);};
  const jump=(dest:Word)=>{pc=Number(integer(dest));if(code[pc]!==0x5b)fail();};
  for(;steps<1000;steps++){
    if(pc===0xb00){if(stack.at(-4)!==BigInt(deadline))fail();deadlineLocated=true;}
    const op=code[pc++];if(op===undefined)fail();
    if(op!>=0x60&&op!<=0x7f){const n=op!-0x5f;stack.push(BigInt('0x'+code.subarray(pc,pc+n).toString('hex')));pc+=n;continue;}
    if(op!>=0x80&&op!<=0x8f){stack.push(stack.at(-(op!-0x7f))??fail());continue;}
    if(op!>=0x90&&op!<=0x9f){const ix=stack.length-1-(op!-0x8f),top=stack.length-1;if(ix<0)fail();[stack[ix],stack[top]]=[stack[top]!,stack[ix]!];continue;}
    switch(op){
      case 0x01:binary((a,b)=>a+b);break;case 0x03:binary((a,b)=>a-b);break;
      case 0x10:binary((a,b)=>a<b?1n:0n);break;case 0x11:binary((a,b)=>a>b?1n:0n);break;
      case 0x12:binary((a,b)=>{const signed=(n:bigint)=>n>=(1n<<255n)?n-(1n<<256n):n;return signed(a)<signed(b)?1n:0n;});break;
      case 0x14:{const a=pop(),b=pop();stack.push(a===b?1n:0n);break;}
      case 0x15:stack.push(integer(pop())===0n?1n:0n);break;
      case 0x16:{const a=pop(),b=pop();stack.push(a===v&&b===255n||b===v&&a===255n?v:integer(a)&integer(b));break;}
      case 0x1b:binary((a,b)=>b<<a);break;case 0x1c:binary((a,b)=>b>>a);break;
      case 0x34:stack.push(0n);break;
      case 0x35:stack.push(calldata.get(integer(pop()))??fail());break;
      case 0x36:stack.push(228n);break;case 0x42:stack.push(BigInt(timestamp));break;
      case 0x50:pop();break;case 0x51:stack.push(memory.get(integer(pop()))??0n);break;
      case 0x52:{const offset=integer(pop()),word=pop();memory.set(offset,word);break;}
      case 0x56:jump(pop());break;
      case 0x57:{const dest=pop(),condition=integer(pop());if(condition!==0n)jump(dest);break;}
      case 0x5b:break;
      case 0xfd:{const offset=integer(pop()),size=integer(pop());if(!deadlineLocated||size!==36n||integer(memory.get(offset)??fail())>>224n!==BigInt('0x62791302')||memory.get(offset+4n)!==BigInt(deadline))fail();return{proof:EXPIRY_PROOF,codeHash:EXPIRY_RUNTIME_HASH,steps:steps+1,error:'ERC2612ExpiredSignature(uint256)',signatureWords:'SYMBOLIC',storageWrites:0,externalCalls:0};}
      default:fail();
    }
  }
  return fail();
}
