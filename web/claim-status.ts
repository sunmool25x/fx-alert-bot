import type {ClaimView} from '../src/claims/protocol.js';
export const claimStatus=(r:ClaimView)=>r.state==='CLAIM_BALANCES_VERIFIED'?'verified':r.state==='CLAIM_FAILED'?'failed':'pending';
// A visible screen performs at most 60 read-only checks in 20 minutes. Reaching
// the bound leaves manual status checking available; it never restarts a claim.
export class ClaimStatusPolling {
  private checks=0;private stopped=false;private deadline:number;
  constructor(private now=Date.now){this.deadline=now()+20*60*1000;}
  take(){if(this.stopped||this.checks>=60||this.now()>=this.deadline)return false;this.checks++;return true;}
  stop(){this.stopped=true;}
}
