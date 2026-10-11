import {Decimal} from 'decimal.js';
import {quoteEconomics} from '../../src/trades/economics.js';
import {executionQuoteSchema,USDC,XSGD,same,requireThat} from '../../src/trades/contract.js';
import {fromRawUnits} from '../../src/sera/precision.js';

const D=Decimal.clone({precision:180});
export const ECONOMICS_AMOUNTS=['2','5','10','25','50','100'] as const;
export type CostBand='EXTREME'|'VERY HIGH'|'HIGH'|'ELEVATED'|'LOWER';
/** Diagnostic labels only; the application cost policy is imported unchanged below. */
export function costBand(percent:string):CostBand {
  const p=new D(percent);requireThat(p.isFinite()&&p.gte(0),'INVALID_AMOUNT');
  return p.gte(50)?'EXTREME':p.gte(20)?'VERY HIGH':p.gte(10)?'HIGH':p.gte(5)?'ELEVATED':'LOWER';
}

/** Summarize an independently bound quote; never returns a signable package or a trade intent. */
export function costSample(value:unknown,capturedAt:number) {
  const q=executionQuoteSchema.parse(value),r=q.route_params,input=fromRawUnits(r.initialDepositAmount,6);
  requireThat(same(r.inputToken,USDC)&&same(r.outputToken,XSGD)&&r.initialDepositAmount===r.maxInputAmount&&
    ECONOMICS_AMOUNTS.includes(input as typeof ECONOMICS_AMOUNTS[number])&&Number.isSafeInteger(capturedAt)&&capturedAt>0,'UNSUPPORTED_TRADE');
  const e=quoteEconomics(q),cost=e.costSharePercent!==undefined?q.fee_breakdown!.gas_cost_from_token!:null;
  // Selection uses full precision, never rounded display percentages.
  const costPercent=cost===null?null:new D(cost).div(input).mul(100).toString();
  const deductionPercent=e.beforeRaw&&e.deductedRaw?new D(e.deductedRaw).div(e.beforeRaw).mul(100).toString():null;
  return {input,capturedAt,expiresAt:q.expires_at*1000,deadline:r.deadline*1000,
    freshAtCapture:q.expires_at*1000>capturedAt+5000&&r.deadline*1000>capturedAt,
    preCostXsgd:e.beforeRaw?fromRawUnits(e.beforeRaw,6):null,deductedXsgd:e.deductedRaw?fromRawUnits(e.deductedRaw,6):null,
    minimumXsgd:fromRawUnits(r.minOutputAmount,6),reportedCostUsdc:cost,reportedCostUsd:cost===null?null:q.fee_breakdown!.gas_cost_usd!,
    costPercent,deductionPercent,preCostRate:e.beforeRaw?new D(e.beforeRaw).div(r.initialDepositAmount).toString():null,
    effectiveMinimumRate:new D(r.minOutputAmount).div(r.initialDepositAmount).toString(),
    gate:e.status==='PASS'?'PASS' as const:'BLOCK' as const,reason:e.reason,band:costPercent===null?null:costBand(costPercent),
    permitSpender:q.permit.spender,permitAmountRaw:q.permit.value_raw,
    researchOnly:true as const,signable:false as const};
}
export type CostSample=ReturnType<typeof costSample>;

/** Select research amounts for a future owner request, even though all sampled quotes expire. */
export function costSelection(samples:readonly CostSample[]) {
  requireThat(samples.length<=ECONOMICS_AMOUNTS.length&&new Set(samples.map(s=>s.input)).size===samples.length,'UNSUPPORTED_TRADE');
  const ordered=[...samples].sort((a,b)=>new D(a.input).cmp(b.input));
  const passing=ordered.filter(s=>s.freshAtCapture&&s.gate==='PASS');
  const below=(pct:number)=>passing.find(s=>s.costPercent!==null&&new D(s.costPercent).lt(pct))?.input??null;
  return {smallestPassing:passing[0]?.input??null,below20:below(20),below10:below(10),below5:below(5),researchOnly:true as const};
}
