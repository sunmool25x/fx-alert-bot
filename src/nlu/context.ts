import { amountReply,pairReply,parseKorean,supportedPair,type Intent,type Pair,type Registry } from "./parser.js";
export const CONTEXT_TTL_MS=300_000;
type Context={pair?:Pair;pending?:Intent;expiresAt:number};
/** Ephemeral, bounded, user-isolated structured context. No raw message retention. */
export class NluContext {
  private entries=new Map<string,Context>();
  constructor(private now=Date.now,private maxEntries=1000){}
  clear(user:string){this.entries.delete(user);}
  private get(user:string){
    for(const [id,entry] of this.entries)if(entry.expiresAt<=this.now())this.entries.delete(id);
    return this.entries.get(user);
  }
  remember(user:string,pair:Pair,pending?:Intent){
    this.get(user);this.entries.delete(user);
    if(this.entries.size>=this.maxEntries)this.entries.delete(this.entries.keys().next().value!);
    this.entries.set(user,{pair,pending,expiresAt:this.now()+CONTEXT_TTL_MS});
  }
  wait(user:string,intent:Intent){
    this.remember(user,intent.pair??{base:"",quote:""},intent);
  }
  resolve(user:string,text:string,registry:Registry):Intent {
    const context=this.get(user);let intent=parseKorean(text,registry),continuation=false;
    if(context?.pending&&intent.type==="HELP_OR_UNKNOWN"){
      const pending=context.pending;
      if(!pending.pair){const pair=pairReply(text,registry);if(pair){intent={...pending,pair};continuation=true;}}
      else if(!pending.amount){const amount=amountReply(text);if(amount){intent={...pending,amount};continuation=true;}}
    }
    if(intent.type==="HELP_OR_UNKNOWN"){this.clear(user);return intent;}
    if(!intent.pair&&context?.pair&&supportedPair(context.pair,registry))intent={...intent,pair:context.pair};
    if(intent.pair&&!supportedPair(intent.pair,registry)){this.clear(user);return {type:"HELP_OR_UNKNOWN",issue:"unsupported_pair"};}
    // A new request supersedes the prior context even if its subsequent API call fails.
    // Valid narrow amount replies retain the pending request for precision/minimum retries.
    if(!continuation)this.clear(user);
    return intent;
  }
}
