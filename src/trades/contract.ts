import { z } from "zod";
import { hashTypedData, hashStruct, hashDomain, type Address } from "viem";
import { address, raw, quoteSchema, type Token } from "../sera/schemas.js";
import { AppError } from "../utils/errors.js";
import { toRawUnits } from "../sera/precision.js";
import { digest } from "../database/wallet.js";
export const CHAIN=11155111;
// Deployment token identities from the live registry; symbol alone is not authorization.
export const USDC="0x965d4b4546716e416e950bc30467d128455d2d0e";
export const XSGD="0x058e06ca2628165a6cd1e80e4dc82203dc0020aa";
export const intentTypes={Intent:[
  {name:"taker",type:"address"},{name:"inputToken",type:"address"},{name:"outputToken",type:"address"},
  {name:"maxInputAmount",type:"uint256"},{name:"minOutputAmount",type:"uint256"},{name:"recipient",type:"address"},
  {name:"initialDepositAmount",type:"uint256"},{name:"uuid",type:"uint256"},{name:"deadline",type:"uint48"},
]} as const;
export const permitTypes={Permit:[{name:"owner",type:"address"},{name:"spender",type:"address"},{name:"value",type:"uint256"},{name:"nonce",type:"uint256"},{name:"deadline",type:"uint256"}]} as const;
const domainSchema=z.object({name:z.string().min(1).max(80),version:z.string().min(1).max(12),chainId:z.literal(CHAIN),verifyingContract:address}).strict();
export const deploymentSchema=z.object({chain_id:z.literal(CHAIN),sera_address:address,vault_address:address,sor_address:address,
  domain_separator:z.string().regex(/^0x[0-9a-fA-F]{64}$/),eip712_domain:domainSchema});
export type Deployment=z.infer<typeof deploymentSchema>;
const nonce=z.union([raw,z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)]);
const permitSchema=z.object({permit_supported:z.literal(true),permit_required:z.literal(true),token:address,spender:address,owner:address,value_raw:raw,
  current_allowance_raw:raw,nonce,suggested_deadline:z.number().int().positive(),domain:domainSchema,
  eip712:z.object({domain:domainSchema,primaryType:z.literal("Permit"),types:z.object({Permit:z.array(z.object({name:z.string(),type:z.string()}).strict())}).strict(),
    message:z.object({owner:address,spender:address,value:raw,nonce,deadline:z.number().int().positive()}).strict()}).strict()});
export const executionQuoteSchema=quoteSchema.extend({permit:permitSchema});
export type ExecutionQuote=z.infer<typeof executionQuoteSchema>;
export const same=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase();
export function requireThat(condition: unknown,code="QUOTE_BINDING_MISMATCH"): asserts condition {if(!condition) throw new AppError(code);}
export function domainHash(domain:z.infer<typeof domainSchema>) {
  return hashDomain({domain:{...domain,chainId:BigInt(domain.chainId),verifyingContract:domain.verifyingContract as Address},types:{EIP712Domain:[{name:"name",type:"string"},{name:"version",type:"string"},{name:"chainId",type:"uint256"},{name:"verifyingContract",type:"address"}]}});
}
export function deployment(value: unknown) {
  const d=deploymentSchema.parse(value);
  requireThat(d.eip712_domain.name==="Sera" && d.eip712_domain.version==="1" && same(d.eip712_domain.verifyingContract,d.sera_address),"UNEXPECTED_CONTRACT");
  requireThat(new Set([d.sera_address,d.sor_address,d.vault_address].map(a=>a.toLowerCase())).size===3,"UNEXPECTED_CONTRACT");
  requireThat(same(domainHash(d.eip712_domain),d.domain_separator),"UNEXPECTED_CONTRACT");return d;
}
export function supportedAmount(from:Token,to:Token,amount:string,max:string) {
  requireThat(same(from.address,USDC)&&same(to.address,XSGD)&&from.decimals===6&&to.decimals===6,"UNSUPPORTED_TRADE");
  requireThat(amount.length<=80 && /^\d+(\.\d{1,6})?$/.test(amount),"INVALID_AMOUNT");
  const value=toRawUnits(amount,from.decimals);
  requireThat(value>0n&&value<=toRawUnits(max,6)&&value<2n**256n,"TRADE_LIMIT");
  requireThat(value>=BigInt(from.min_trade_amount_raw??"0"),"AMOUNT_BELOW_MIN");return value;
}
export function validateQuote(value:unknown,d:Deployment,wallet:string,input:bigint,deadline:number,now:number,executorId:number) {
  const q=executionQuoteSchema.parse(value),r=q.route_params,p=q.permit,m=p.eip712.message;
  requireThat(Object.keys(r).length===9,"UNSUPPORTED_TRADE");
  requireThat(same(r.taker,wallet)&&same(r.recipient,wallet)&&same(r.inputToken,USDC)&&same(r.outputToken,XSGD));
  requireThat(BigInt(r.maxInputAmount)===input&&BigInt(r.initialDepositAmount)===input&&BigInt(r.minOutputAmount)>0n,"NO_LIQUIDITY");
  requireThat(q.expires_at>now+3 && q.expires_at<=now+60 && r.deadline===deadline && deadline>now && deadline<=now+305,"QUOTE_STALE");
  // The cache quote UUID and signed Intent identifier are distinct server-generated IDs.
  // Bind BOTH in the immutable snapshot digest; never derive one from the other.
  const signed=BigInt(r.uuid);
  requireThat(signed>0n && Number(signed>>252n)===executorId && (signed&4095n)===0n);
  requireThat(same(p.token,USDC)&&same(p.spender,d.sor_address)&&same(p.owner,wallet)&&BigInt(p.value_raw)===input,"INVALID_PERMIT");
  requireThat(same(p.eip712.domain.verifyingContract,USDC)&&same(domainHash(p.domain),domainHash(p.eip712.domain)),"INVALID_PERMIT");
  requireThat(JSON.stringify(p.eip712.types)===JSON.stringify(permitTypes),"INVALID_PERMIT");
  requireThat(same(m.owner,wallet)&&same(m.spender,d.sor_address)&&BigInt(m.value)===input&&BigInt(m.nonce)===BigInt(p.nonce)&&m.deadline===deadline&&p.suggested_deadline===deadline,"INVALID_PERMIT");
  const breakdown=q.quote_breakdown;
  if(breakdown) requireThat(breakdown.gas_mode==="receive_less"&&breakdown.output_amount_after_gas===r.minOutputAmount&&breakdown.input_amount_after_gas===r.maxInputAmount);
  return q;
}
export function intentData(d:Deployment,q:ExecutionQuote) {
  const r=q.route_params;
  return {domain:{...d.eip712_domain,verifyingContract:d.sera_address as Address},types:intentTypes,primaryType:"Intent" as const,
    message:{...r,taker:r.taker as Address,inputToken:r.inputToken as Address,outputToken:r.outputToken as Address,recipient:r.recipient as Address,
      maxInputAmount:BigInt(r.maxInputAmount),minOutputAmount:BigInt(r.minOutputAmount),initialDepositAmount:BigInt(r.initialDepositAmount),uuid:BigInt(r.uuid)}};
}
export function permitData(q:ExecutionQuote) {
  const p=q.permit.eip712,m=p.message;
  return {domain:{...p.domain,verifyingContract:p.domain.verifyingContract as Address},types:permitTypes,primaryType:"Permit" as const,
    message:{owner:m.owner as Address,spender:m.spender as Address,value:BigInt(m.value),nonce:BigInt(m.nonce),deadline:BigInt(m.deadline)}};
}
export const json=(v:unknown)=>JSON.stringify(v,(_,x)=>typeof x==="bigint"?x.toString():x);
export function hashes(d:Deployment,q:ExecutionQuote) {
  const td=intentData(d,q);
  return {intent:hashTypedData(td),struct:hashStruct({data:td.message,types:intentTypes,primaryType:"Intent"}),
    version:digest(json({deployment:d,quote:q}))};
}
