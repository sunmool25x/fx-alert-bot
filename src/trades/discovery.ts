import type { SeraClient } from "../sera/client.js";
import { quoteSchema, type Token, type Quote } from "../sera/schemas.js";
import { fromRawUnits, toRawUnits } from "../sera/precision.js";
import { AppError } from "../utils/errors.js";
import { same, USDC, XSGD, requireThat } from "./contract.js";

export const DISCOVERY_AMOUNTS = ["0.01", "0.1", "0.5", "1", "2", "5", "10", "25", "50", "100"] as const;
export type DiscoveryState = "EXECUTABLE_QUOTE" | "NO_LIQUIDITY" | "BELOW_MINIMUM" | "QUOTE_EXPIRED" | "RPC_ERROR" | "AUTH_ERROR" | "VALIDATION_ERROR" | "API_ERROR" | "RATE_LIMITED";
export interface DiscoveryPair { from:Token; to:Token }
export interface ProbeResult {
  pair:DiscoveryPair; amount:string; inputRaw:string; state:DiscoveryState; at:number; latencyMs:number;
  errorCode?:string; minimumOutputRaw?:string; minimumOutput?:string; expiresAt?:number;
  route?:{quoteId:string;intentId:string;deadline:number;recipientSameWallet:true;legCount:number|null};
  fees?:{gasCostFromToken:string|null;gasCostUsd:string|null;outputBeforeGasRaw:string|null;outputAfterGasRaw:string|null};
}
export function discoveryFailure(error:unknown):{state:DiscoveryState;errorCode:string} {
  const code=error instanceof AppError?error.code:"UNAVAILABLE";
  const groups:Record<string,DiscoveryState>={NO_LIQUIDITY:"NO_LIQUIDITY",AMOUNT_BELOW_MIN:"BELOW_MINIMUM",QUOTE_STALE:"QUOTE_EXPIRED",
    RPC_UNAVAILABLE:"RPC_ERROR",AUTH_STALE:"AUTH_ERROR",AUTH_INVALID:"AUTH_ERROR",WALLET_REQUIRED:"AUTH_ERROR",NOT_ALLOWLISTED:"AUTH_ERROR",RATE_LIMITED:"RATE_LIMITED",
    SCHEMA_MISMATCH:"VALIDATION_ERROR",QUOTE_BINDING_MISMATCH:"VALIDATION_ERROR",INVALID_PERMIT:"VALIDATION_ERROR",NETWORK_MISMATCH:"VALIDATION_ERROR",CLOCK_SKEW:"VALIDATION_ERROR",UNSUPPORTED_TRADE:"VALIDATION_ERROR"};
  return {state:groups[code]??"API_ERROR",errorCode:groups[code]?code:"UNAVAILABLE"};
}
/** Public quote evidence only. Never a signature payload, product-support claim or execution consent. */
export function discoveryBinding(value:unknown,pair:DiscoveryPair,wallet:string,input:bigint,deadline:number,now:number):Quote {
  const parsed=quoteSchema.safeParse(value);requireThat(parsed.success,"SCHEMA_MISMATCH");
  const q=parsed.data,r=q.route_params;
  requireThat(Object.keys(r).length===9&&same(r.taker,wallet)&&same(r.recipient,wallet)&&same(r.inputToken,pair.from.address)&&same(r.outputToken,pair.to.address));
  requireThat(BigInt(r.maxInputAmount)===input&&BigInt(r.initialDepositAmount)===input&&r.deadline===deadline);
  requireThat(q.expires_at*1000>now+5000&&q.expires_at*1000<=now+60000,"QUOTE_STALE");
  requireThat(BigInt(r.minOutputAmount)>0n,"NO_LIQUIDITY");return q;
}
export async function probeMatrix(options:{api:Pick<SeraClient,"getQuote"|"liveTime">;pairs:DiscoveryPair[];wallet:string;
  amounts?:readonly string[];intervalMs?:number;now?:()=>number;wait?:(ms:number)=>Promise<void>;
  verify?:(q:Quote,pair:DiscoveryPair,input:bigint,deadline:number)=>Promise<void>;onResult?:(row:ProbeResult)=>void}) {
  const {api,pairs,wallet}=options,amounts=options.amounts??DISCOVERY_AMOUNTS,interval=options.intervalMs??1500;
  const now=options.now??Date.now,wait=options.wait??(ms=>new Promise(resolve=>setTimeout(resolve,ms)));
  requireThat(/^0x[0-9a-fA-F]{40}$/.test(wallet)&&pairs.length>0&&pairs.length<=2&&amounts.length>0&&amounts.length<=10&&interval>=1000&&interval<=60000,"UNSUPPORTED_TRADE");
  const rawAmounts=amounts.map(a=>toRawUnits(a,6));
  requireThat(new Set(rawAmounts.map(String)).size===amounts.length&&rawAmounts.every(n=>n>0n&&n<=100000000n),"UNSUPPORTED_TRADE");
  requireThat(new Set(pairs.map(p=>p.from.address.toLowerCase()+p.to.address.toLowerCase())).size===pairs.length,"UNSUPPORTED_TRADE");
  for(const p of pairs)requireThat(!same(p.from.address,p.to.address)&&(same(p.from.address,USDC)||same(p.from.address,XSGD))&&p.from.decimals===6&&p.to.decimals>=0&&p.to.decimals<=36,"UNSUPPORTED_TRADE");
  const rows:ProbeResult[]=[];let lastStart:number|undefined;
  for(const pair of pairs)for(const amount of amounts){
    if(lastStart!==undefined)await wait(Math.max(0,interval-(now()-lastStart)));
    const at=now();lastStart=at;const input=toRawUnits(amount,pair.from.decimals);
    const row:ProbeResult={pair,amount,inputRaw:String(input),state:"API_ERROR",at,latencyMs:0};
    try{
      requireThat(input>=BigInt(pair.from.min_trade_amount_raw??"0"),"AMOUNT_BELOW_MIN");
      const time=(await api.liveTime()).timestamp;requireThat(Math.abs(time*1000-now())<5000,"CLOCK_SKEW");
      const deadline=time+300;
      const q=discoveryBinding(await api.getQuote({from_token:pair.from.address,to_token:pair.to.address,from_amount:String(input),owner_address:wallet,recipient:wallet,expiration:deadline,gas_mode:"receive_less"}),pair,wallet,input,deadline,now());
      try{await options.verify?.(q,pair,input,deadline);}catch(e){throw e instanceof AppError?e:new AppError("RPC_UNAVAILABLE");}
      requireThat(q.expires_at*1000>now()+5000,"QUOTE_STALE");
      Object.assign(row,{state:"EXECUTABLE_QUOTE",minimumOutputRaw:q.route_params.minOutputAmount,minimumOutput:fromRawUnits(q.route_params.minOutputAmount,pair.to.decimals),expiresAt:q.expires_at,
        route:{quoteId:q.uuid,intentId:q.route_params.uuid,deadline,recipientSameWallet:true,legCount:q.route_metadata?.leg_count??null},
        fees:{gasCostFromToken:q.fee_breakdown?.gas_cost_from_token??null,gasCostUsd:q.fee_breakdown?.gas_cost_usd??null,outputBeforeGasRaw:q.quote_breakdown?.output_amount_before_gas??null,outputAfterGasRaw:q.quote_breakdown?.output_amount_after_gas??null}});
    }catch(e){Object.assign(row,discoveryFailure(e));}
    row.latencyMs=now()-at;rows.push(row);options.onResult?.(row);
    // Respect backpressure. A partial matrix cannot prove pair-wide no liquidity.
    if(row.state==="RATE_LIMITED")return rows;
  }
  return rows;
}
export interface DiscoverySelection {classification:"A"|"B"|"C"|"D"|"E";selected?:ProbeResult;fallbackAllowed:boolean;referenceExecutable:boolean}
export function selectIntended(rows:ProbeResult[],amounts:readonly string[]=DISCOVERY_AMOUNTS):DiscoverySelection {
  const forward=rows.filter(r=>same(r.pair.from.address,USDC)&&same(r.pair.to.address,XSGD));
  const reverse=rows.filter(r=>same(r.pair.from.address,XSGD)&&same(r.pair.to.address,USDC));
  const complete=(items:ProbeResult[])=>items.length===amounts.length&&new Set(items.map(r=>r.inputRaw)).size===amounts.length&&amounts.every(a=>items.some(r=>BigInt(r.inputRaw)===toRawUnits(a,6)));
  const smallest=(items:ProbeResult[])=>items.filter(r=>r.state==="EXECUTABLE_QUOTE").sort((a,b)=>BigInt(a.inputRaw)<BigInt(b.inputRaw)?-1:1)[0];
  const first=smallest(forward),reverseFirst=smallest(reverse),referenceExecutable=forward.some(r=>r.state==="EXECUTABLE_QUOTE"&&r.inputRaw==="1000000");
  if(!complete(forward))return {classification:"E",fallbackAllowed:false,referenceExecutable};
  if(first)return {classification:BigInt(first.inputRaw)<=1000000n?"A":"B",selected:first,fallbackAllowed:false,referenceExecutable};
  if(!complete(forward)||!complete(reverse))return {classification:"E",fallbackAllowed:false,referenceExecutable};
  const noLiquidity=(items:ProbeResult[])=>items.some(r=>r.state==="NO_LIQUIDITY")&&items.every(r=>r.state==="NO_LIQUIDITY"||r.state==="BELOW_MINIMUM");
  if(!noLiquidity(forward))return {classification:"E",fallbackAllowed:false,referenceExecutable};
  if(reverseFirst)return {classification:"C",selected:reverseFirst,fallbackAllowed:false,referenceExecutable};
  const absent=noLiquidity(reverse);return {classification:absent?"D":"E",fallbackAllowed:absent,referenceExecutable};
}
/** Only one already-verified, held-USDC-funded fallback candidate; never adds runtime trade support. */
export function selectFallback(intended:DiscoverySelection,candidates:{row:ProbeResult;contractsVerified:boolean;heldInputRaw:string}[]) {
  if(!intended.fallbackAllowed||intended.classification!=="D")return;
  const candidatesInBudget=candidates.filter(c=>c.contractsVerified&&same(c.row.pair.from.address,USDC)&&c.row.pair.from.decimals===6&&
    !same(c.row.pair.to.address,XSGD)&&!same(c.row.pair.to.address,USDC)&&c.row.state==="EXECUTABLE_QUOTE"&&BigInt(c.row.inputRaw)>0n&&BigInt(c.row.inputRaw)<=100000000n&&BigInt(c.heldInputRaw)>=BigInt(c.row.inputRaw));
  const selected=candidatesInBudget.sort((a,b)=>BigInt(a.row.inputRaw)<BigInt(b.row.inputRaw)?-1:BigInt(a.row.inputRaw)>BigInt(b.row.inputRaw)?1:a.row.pair.to.address.localeCompare(b.row.pair.to.address))[0];
  return selected?{label:"E2E_TEST_FALLBACK_PAIR" as const,row:selected.row,executionSupported:false as const}:undefined;
}
