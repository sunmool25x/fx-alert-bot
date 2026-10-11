import {AppError} from '../utils/errors.js';
/** Admission budgets, not measured mobile guarantees. Includes separate user actions. */
export const timingBudget={permit:12_221,intent:8_000,submission:3_000,margin:5_000} as const;
export type FinancialStep='permit'|'intent'|'submit';
export function remainingBudget(step:FinancialStep){return timingBudget.margin+timingBudget.submission+(step!=='submit'?timingBudget.intent:0)+(step==='permit'?timingBudget.permit:0);}
export function admit(step:FinancialStep,now:number,quoteExpiry:number,permitDeadline:number,intentDeadline:number,ownershipExpiry:number){
  if(![now,quoteExpiry,permitDeadline,intentDeadline,ownershipExpiry].every(Number.isSafeInteger))throw new AppError('QUOTE_STALE');
  if(ownershipExpiry<=now+remainingBudget(step))throw new AppError('AUTH_STALE');
  const remaining=Math.min(quoteExpiry,permitDeadline,intentDeadline)-now;
  if(remaining<remainingBudget(step))throw new AppError('QUOTE_STALE');
  return{remainingMs:remaining,requiredMs:remainingBudget(step)};
}
