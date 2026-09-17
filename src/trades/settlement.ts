import type { WalletStore,TradeRow } from "../database/wallet.js";
import type { ChainReads,Evidence } from "../wallet/chain.js";
import type { Snapshot } from "./service.js";
import { hashes,executionQuoteSchema,deployment,requireThat } from "./contract.js";
import { safeLog } from "../utils/errors.js";
// Read-only capability: this worker never receives a signer or submission transport.
export class SettlementMonitor {
  private timer?:ReturnType<typeof setTimeout>;private flight?:Promise<void>;private stopped=true;
  private cycleFlight?:Promise<void>;
  constructor(private store:WalletStore,private chain:ChainReads,private interval:number,
    private notify:(row:TradeRow)=>Promise<void>,private now=Date.now) {}
  start() {this.store.recover();this.stopped=false;this.schedule();}
  private schedule() {if(this.stopped)return;this.timer=setTimeout(()=>{this.flight=this.cycle().finally(()=>this.schedule());},this.interval);}
  async stop() {this.stopped=true;clearTimeout(this.timer);await this.flight;await this.cycleFlight;}
  refresh(user:string) {return this.cycle(user);}
  cycle(user?:string):Promise<void> {
    if(this.cycleFlight)return this.cycleFlight;
    this.cycleFlight=this.check(user).finally(()=>{this.cycleFlight=undefined;});return this.cycleFlight;
  }
  private async check(user?:string) {
    for(const row of this.store.pending(user)) {
      try {
        if(row.state==="CONFIRMED") {
          const evidence=JSON.parse(row.evidence!) as Evidence;
          if(!await this.chain.canonical(evidence)) {
            this.store.reorg(row);row.state="UNKNOWN_REORG";
            continue;
          }
        } else if(row.state!=="FAILED") {
          const p=JSON.parse(row.payload!) as Snapshot,d=deployment(p.deployment),q=executionQuoteSchema.parse(p.quote);
          requireThat(hashes(d,q).version===row.version,"QUOTE_BINDING_MISMATCH");
          const result=await this.chain.settle(d,q,hashes(d,q).struct,BigInt(row.cursor_block!));
          if(result.evidence) {
            this.store.transition(row.id,["PENDING","UNKNOWN","UNKNOWN_REORG"],"CONFIRMED",{evidence:JSON.stringify(result.evidence),tx_hash:result.evidence.txHash,error_code:null,notified:0});
            row.state="CONFIRMED";row.tx_hash=result.evidence.txHash;row.evidence=JSON.stringify(result.evidence);row.notified=0;
          }
          this.store.transition(row.id,[row.state],row.state,{cursor_block:result.next.toString()});
        }
        if(!row.notified) {
          await this.notify(row);
          this.store.transition(row.id,[row.state],row.state,{notified:1});
        }
      } catch(e) {safeLog("settlement_read_failed",e);}
      finally {
        // Confirmed receipts are rechecked hourly. Unresolved reads back off to at most 5 min.
        this.store.transition(row.id,[row.state],row.state,{checks:row.checks+1,next_check:this.now()+(row.state==="CONFIRMED"?3600000:Math.min(300000,this.interval*2**Math.min(row.checks,3)))});
      }
    }
  }
}
