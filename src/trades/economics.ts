import {Decimal} from 'decimal.js';
import {z} from 'zod';
import {raw} from '../sera/schemas.js';
import {same,type ExecutionQuote} from './contract.js';
const ExactDecimal=Decimal.clone({precision:180});
const decimal=z.string().regex(/^\d+(\.\d+)?$/).max(150);
const breakdown=z.object({gas_mode:z.literal('receive_less'),input_token:z.string(),output_token:z.string(),input_amount_before_gas:raw,input_amount_after_gas:raw,
  output_amount_before_gas:raw,output_amount_after_gas:raw,gas_cost_input_token:raw,gas_cost_output_token:raw,gas_cost_usd:decimal});
export type Economics={status:'PASS'|'FAIL';reason:'CONSISTENT'|'UNVERIFIED_COSTS'|'INCONSISTENT_COSTS'|'EXTREME_COST';beforeRaw?:string;deductedRaw?:string;afterRaw?:string;costSharePercent?:string};
/** Read-only acceptance review; the 50% hold is our conservative review rule, not a Sera fee guarantee. */
export function quoteEconomics(q:ExecutionQuote):Economics{
  const parsed=breakdown.safeParse(q.quote_breakdown),fee=q.fee_breakdown;
  if(!parsed.success||!fee||!decimal.safeParse(fee.gas_cost_from_token).success||!decimal.safeParse(fee.gas_cost_usd).success)return{status:'FAIL',reason:'UNVERIFIED_COSTS'};
  const b=parsed.data,r=q.route_params,before=BigInt(b.output_amount_before_gas),after=BigInt(b.output_amount_after_gas),cost=BigInt(b.gas_cost_output_token),input=BigInt(r.initialDepositAmount);
  if(!same(b.input_token,r.inputToken)||!same(b.output_token,r.outputToken)||b.input_amount_before_gas!==r.initialDepositAmount||b.input_amount_after_gas!==r.maxInputAmount||
    r.maxInputAmount!==r.initialDepositAmount||b.output_amount_after_gas!==r.minOutputAmount||before<=0n||after<=0n||before-after!==cost||
    !new ExactDecimal(fee.gas_cost_usd!).eq(b.gas_cost_usd)||new ExactDecimal(fee.gas_cost_from_token!).mul(1000000).sub(b.gas_cost_input_token).abs().gte(1))return{status:'FAIL',reason:'INCONSISTENT_COSTS'};
  // The decimal display can be quantized into raw units in either direction; no undocumented rounding mode is assumed.
  const share=new ExactDecimal(fee.gas_cost_from_token!).mul(1000000).div(input.toString()).mul(100);
  const extreme=share.gte(50)||cost*2n>=before;
  return {status:extreme?'FAIL':'PASS',reason:extreme?'EXTREME_COST':'CONSISTENT',beforeRaw:String(before),deductedRaw:String(cost),afterRaw:String(after),costSharePercent:share.toFixed(4)};
}
