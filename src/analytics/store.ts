import { randomBytes,createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { ActionOrigin } from "../nlu/parser.js";
import { eventNames,entries,parsedIntents,entryFromOrigin,triggerFromOrigin,periodBounds,DAY,SEOUL,conversion,type EventName,type EventContext,type GrowthReport,type Period,type FunnelStep } from "./types.js";
export function normalizedSource(raw:string|undefined):string {
  if(raw===undefined)return "direct";
  return /^[a-zA-Z0-9_-]{1,48}$/.test(raw)?raw.toLowerCase():"unknown";
}
const origin=(v:unknown):ActionOrigin=>["command","button","natural_language"].includes(String(v))?v as ActionOrigin:"button";
const ref=(v:unknown)=>typeof v==="string"&&/^[A-Za-z0-9_-]{1,100}$/.test(v)?v:null;
export class AnalyticsStore {
  private lastWarning=0;
  constructor(private db:DatabaseSync,private now=Date.now){}
  private safe(work:()=>void){try{work();}catch{if(this.now()-this.lastWarning>=60_000){this.lastWarning=this.now();console.warn(JSON.stringify({event:"analytics_write_failed",code:"ANALYTICS_UNAVAILABLE"}));}}}
  /** Analytics failure must never change the outcome of a product write. */
  bestEffort(work:()=>void){this.safe(work);}
  attribution(user:string,raw?:string,isStart=false){this.safe(()=>{
    const existing=this.db.prepare("SELECT * FROM user_attribution WHERE user_id=?").get(user);
    const legacy=this.db.prepare("SELECT source FROM users WHERE id=?").get(user)?.source;
    const source=isStart?normalizedSource(raw):legacy?normalizedSource(String(legacy)):"unknown";
    if(!existing)this.db.prepare("INSERT INTO user_attribution VALUES(?,?,?,?,?)").run(user,legacy?normalizedSource(String(legacy)):source,source,isStart?this.now():null,isStart?this.now():null);
    else if(isStart){
      // A user first seen through another action can acquire their first start source later.
      this.db.prepare(`UPDATE user_attribution SET first_source=CASE WHEN first_source='unknown' AND ?<>'unknown' THEN ? ELSE first_source END,
        first_start_at=COALESCE(first_start_at,?),latest_source=?,latest_start_at=? WHERE user_id=?`).run(source,source,this.now(),source,this.now(),user);
    }
  });}
  record(user:string,event:EventName,context:EventContext={}){this.safe(()=>{
    if(!eventNames.includes(event))return;
    if(event==="testnet_trade_completed"&&(!context.entityId||!this.completionAllowed(context.entityId,user)))return;
    if(event==="testnet_trade_completed")context={...context,key:context.entityId};
    const c=context as EventContext,meta:Record<string,unknown>={};
    if(c.intent&&parsedIntents.includes(c.intent))meta.intent=c.intent;
    if(typeof c.parsed==="boolean")meta.parsed=c.parsed;
    const source=String(this.db.prepare("SELECT first_source FROM user_attribution WHERE user_id=?").get(user)?.first_source??"unknown");
    this.db.prepare(`INSERT INTO analytics_events VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(dedupe_key) DO NOTHING`).run(
      randomBytes(12).toString("base64url"),user,event,source,origin(c.origin),c.entry&&entries.includes(c.entry)?c.entry:"none",
      ref(c.entityId),ref(c.parentId),JSON.stringify(meta),c.at??this.now(),c.key?createHash("sha256").update(event+":"+user+":"+c.key).digest("hex"):null);
  });}
  activity(user:string,context:EventContext={}){this.safe(()=>{
    const day=Math.floor((this.now()+SEOUL)/DAY);
    const prior=this.db.prepare("SELECT 1 FROM analytics_events WHERE user_id=? AND event_name='product_activity' AND created_at<? LIMIT 1").get(user,day*DAY-SEOUL);
    this.record(user,"product_activity",context);
    if(prior)this.record(user,"user_returned",{...context,key:"day:"+day});
  });}
  /** Persisted-state projection. No quote, balance, signature, challenge or wallet data copied. */
  reconcile(){this.safe(()=>{
    if(this.db.isTransaction)return;
    const since=Number(this.db.prepare("SELECT tracking_since FROM analytics_state WHERE id=1").get()!.tracking_since);
    for(const a of this.db.prepare(`SELECT a.id,a.telegram_user_id AS user,a.created_at,i.input_origin,i.entry,i.parent_id
      FROM alerts a LEFT JOIN alert_input_origins i ON i.id=a.id WHERE a.created_at>=?
      AND NOT EXISTS(SELECT 1 FROM analytics_events e WHERE e.event_name='alert_created' AND e.entity_id=a.id)`).all(since)){
      this.record(String(a.user),"alert_created",{entityId:String(a.id),origin:origin(a.input_origin),entry:entries.includes(a.entry as any)?a.entry as any:"none",parentId:a.parent_id?String(a.parent_id):undefined,key:String(a.id),at:Number(a.created_at)});
    }
    for(const t of this.db.prepare(`SELECT t.id,t.triggered_at,a.id AS alert,a.telegram_user_id AS user FROM alert_triggers t JOIN alerts a ON a.id=t.alert_id
      WHERE t.triggered_at>=? AND NOT EXISTS(SELECT 1 FROM analytics_events e WHERE e.event_name='alert_triggered' AND e.entity_id=t.id)`).all(since))
      this.record(String(t.user),"alert_triggered",{entityId:String(t.id),parentId:String(t.alert),entry:"alert",key:String(t.id),at:Number(t.triggered_at)});
    for(const o of this.db.prepare(`SELECT t.id,a.telegram_user_id AS user,o.sent_at FROM delivery_outbox o JOIN alert_triggers t ON t.id=o.trigger_id JOIN alerts a ON a.id=t.alert_id
      WHERE o.status='sent' AND o.sent_at>=? AND NOT EXISTS(SELECT 1 FROM analytics_events e WHERE e.event_name='alert_delivered' AND e.entity_id=t.id)`).all(since))
      this.record(String(o.user),"alert_delivered",{entityId:String(o.id),entry:"alert",key:String(o.id),at:Number(o.sent_at)});
    for(const t of this.db.prepare(`SELECT id,user_id,state,origin,intent_id,chain_id,created_at,confirmed_at,submitted_at,evidence
      FROM trade_sessions t WHERE created_at>=? AND (
        (confirmed_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM analytics_events e WHERE e.event_name='trade_authorization_started' AND e.entity_id=t.id)) OR
        (submitted_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM analytics_events e WHERE e.event_name='trade_submitted' AND e.entity_id=t.id)) OR
        (state='PENDING' AND NOT EXISTS(SELECT 1 FROM analytics_events e WHERE e.event_name='trade_pending' AND e.entity_id=t.id)) OR
        (state='CONFIRMED' AND evidence IS NOT NULL AND NOT EXISTS(SELECT 1 FROM analytics_events e WHERE e.event_name='testnet_trade_completed' AND e.entity_id=t.id)))`).all(since)){
      const c:EventContext={entityId:String(t.id),parentId:String(t.intent_id),entry:entryFromOrigin(String(t.origin)),origin:"button",key:String(t.id)};
      if(t.confirmed_at)this.record(String(t.user_id),"trade_authorization_started",{...c,at:Number(t.confirmed_at)});
      if(t.submitted_at)this.record(String(t.user_id),"trade_submitted",{...c,at:Number(t.submitted_at)});
      if(t.state==="PENDING")this.record(String(t.user_id),"trade_pending",c);
      // CONFIRMED is written only by the existing verified settlement predicate.
      // A transaction hash, submitted_at, signature or pending state cannot satisfy this.
      if(t.state==="CONFIRMED"&&t.chain_id===11155111&&t.evidence)this.record(String(t.user_id),"testnet_trade_completed",c);
    }
  });}
  alertCreated(user:string,id:string,context:EventContext={}){
    this.record(user,"alert_created",{...context,entityId:id,key:id});
  }
  /** Optional presentation provenance; a failed read cannot affect quote validation. */
  quoteContext(user:string,id:string):EventContext|undefined{
    let result:EventContext|undefined;
    this.safe(()=>{
      const q=this.db.prepare("SELECT origin FROM quote_intents WHERE id=? AND user_id=? AND expires_at>?").get(id,user,this.now());
      if(q)result={origin:"button",entry:entryFromOrigin(String(q.origin)),parentId:triggerFromOrigin(String(q.origin))??this.db.prepare("SELECT parent_id FROM quote_input_origins WHERE id=?").get(id)?.parent_id as string|undefined};
    });
    return result;
  }
  completionAllowed(id:string,user?:string){return !!this.db.prepare("SELECT 1 FROM trade_sessions WHERE id=? AND state='CONFIRMED' AND chain_id=11155111 AND evidence IS NOT NULL AND evidence<>''"+(user?" AND user_id=?":"")).get(id,...(user?[user]:[]));}
  report(days:Period,excluded:string[]=[]):GrowthReport {
    this.reconcile();const {start,end}=periodBounds(days,this.now());
    const omit=new Set(excluded);
    const users=this.db.prepare(`SELECT u.id,u.created_at,COALESCE(a.first_source,CASE WHEN u.source IS NOT NULL THEN lower(u.source) ELSE 'unknown' END) AS source FROM users u LEFT JOIN user_attribution a ON a.user_id=u.id`).all().filter(u=>!omit.has(String(u.id)));
    const allowed=new Set(users.map(u=>String(u.id)));
    const all=this.db.prepare("SELECT * FROM analytics_events WHERE created_at>=? AND created_at<? ORDER BY created_at,id").all(start,end)
      .filter(e=>allowed.has(String(e.user_id))&&(e.event_name!=="testnet_trade_completed"||this.completionAllowed(String(e.entity_id))));
    const activity=all.filter(e=>e.event_name==="product_activity"),active=new Set(activity.map(e=>String(e.user_id)));
    const metrics:GrowthReport["metrics"]={};
    for(const name of eventNames){const events=all.filter(e=>e.event_name===name);metrics[name]={users:new Set(events.map(e=>e.user_id)).size,events:events.length};}
    const usersById=new Map(users.map(u=>[String(u.id),u]));
    const daily=new Map<string,Set<string>>(),activeDays=new Map<string,Set<string>>();
    for(const a of activity){const day=new Date(Number(a.created_at)+SEOUL).toISOString().slice(0,10),id=String(a.user_id);if(!daily.has(day))daily.set(day,new Set());daily.get(day)!.add(id);if(!activeDays.has(id))activeDays.set(id,new Set());activeDays.get(id)!.add(day);}
    const count=(name:EventName,entry?:string)=>new Set(all.filter(e=>e.event_name===name&&(!entry||e.entry===entry)).map(e=>String(e.user_id)));
    const intersect=(a:Set<string>,b:Set<string>)=>new Set([...a].filter(x=>b.has(x)));
    // Ordered unique-user cohort within the selected period. Explicit trigger/quote/trade
    // parent IDs prevent unrelated direct quotes/trades from inflating alert conversion.
    let cohort=new Map([...active].map(id=>[id,{at:start,entities:new Map<string,number>()}]));
    const main:FunnelStep[]=[{name:"users",users:cohort.size,previousPercent:"—",totalPercent:cohort.size?"100.0%":"—"}];
    let previous=cohort.size;
    for(const name of ["alert_created","alert_triggered","fresh_quote_viewed","trade_flow_started","testnet_trade_completed"] as EventName[]){
      const next=new Map<string,{at:number;entities:Map<string,number>}>();
      for(const e of all.filter(e=>e.event_name===name)){
        const id=String(e.user_id),prev=cohort.get(id);if(!prev||Number(e.created_at)<prev.at)continue;
        if(!e.entity_id)continue;
        if(["fresh_quote_viewed","trade_flow_started","testnet_trade_completed"].includes(name)&&e.entry!=="alert")continue;
        if(name!=="alert_created"&&(!prev.entities.has(String(e.parent_id))||prev.entities.get(String(e.parent_id))!>Number(e.created_at)))continue;
        const state=next.get(id)??{at:Number(e.created_at),entities:new Map<string,number>()};
        const entity=String(e.entity_id);state.entities.set(entity,Math.min(state.entities.get(entity)??Infinity,Number(e.created_at)));next.set(id,state);
      }
      const n=next.size;main.push({name,users:n,previousPercent:conversion(n,previous),totalPercent:conversion(n,active.size)});previous=n;cohort=next;
    }
    const alpha=intersect(active,count("alpha_viewed"));
    const alphaQuotes=all.filter(e=>e.event_name==="fresh_quote_viewed"&&e.entry==="alpha"&&alpha.has(String(e.user_id)));
    const alphaQuote=new Set(alphaQuotes.map(e=>String(e.user_id)));
    const quoteTimes=new Map<string,number>();
    for(const q of alphaQuotes)if(q.parent_id){const key=String(q.user_id)+":"+String(q.parent_id);quoteTimes.set(key,Math.min(quoteTimes.get(key)??Infinity,Number(q.created_at)));}
    const alphaAlert=new Set(all.filter(e=>e.event_name==="alert_created"&&e.entry==="alpha"&&e.parent_id&&(quoteTimes.get(String(e.user_id)+":"+String(e.parent_id))??Infinity)<=Number(e.created_at)).map(e=>String(e.user_id)));
    const discovery=[{name:"users",users:active.size,previousPercent:"—",totalPercent:active.size?"100.0%":"—"},
      {name:"alpha_viewed",users:alpha.size,previousPercent:conversion(alpha.size,active.size),totalPercent:conversion(alpha.size,active.size)},
      {name:"alpha_quote",users:alphaQuote.size,previousPercent:conversion(alphaQuote.size,alpha.size),totalPercent:conversion(alphaQuote.size,active.size)},
      {name:"alpha_alert",users:alphaAlert.size,previousPercent:conversion(alphaAlert.size,alphaQuote.size),totalPercent:conversion(alphaAlert.size,active.size)}];
    const created=count("alert_created"),quoted=count("fresh_quote_viewed"),traded=count("testnet_trade_completed");
    const sourcesMap=new Map<string,Set<string>>();for(const id of active){const source=String(usersById.get(id)!.source);if(!sourcesMap.has(source))sourcesMap.set(source,new Set());sourcesMap.get(source)!.add(id);}
    const sources=[...sourcesMap].map(([source,ids])=>{const creators=intersect(ids,created).size,quotes=intersect(ids,quoted).size,trades=intersect(ids,traded).size;return {source,users:ids.size,creators,quotes,trades,alertPercent:conversion(creators,ids.size),quotePercent:conversion(quotes,ids.size),tradePercent:conversion(trades,ids.size)};}).sort((a,b)=>b.users-a.users||a.source.localeCompare(b.source));
    const quoteOrigins:GrowthReport["quoteOrigins"]=[];for(const entry of entries)for(const input of ["command","button","natural_language"]){const list=all.filter(e=>e.event_name==="quote_requested"&&e.entry===entry&&e.origin===input);if(list.length)quoteOrigins.push({entry,origin:input,users:new Set(list.map(e=>e.user_id)).size,events:list.length});}
    const nlu=all.filter(e=>e.event_name==="natural_language_used"),intents:Record<string,number>={};let parsed=0;for(const e of nlu){const m=JSON.parse(String(e.metadata_json));const k=String(m.intent??"unknown");intents[k]=(intents[k]??0)+1;if(m.parsed===true)parsed++;}
    return {days,start,end,trackingSince:Number(this.db.prepare("SELECT tracking_since FROM analytics_state WHERE id=1").get()!.tracking_since),totalUsers:users.length,activeUsers:active.size,
      newUsers:[...active].filter(id=>Number(usersById.get(id)!.created_at)>=start).length,
      returningUsers:[...active].filter(id=>Number(usersById.get(id)!.created_at)<start).length,
      retainedUsers:[...activeDays.values()].filter(s=>s.size>=2).length,daily:[...daily].map(([day,ids])=>({day,users:ids.size})),metrics,quoteOrigins,
      nlu:{users:new Set(nlu.map(e=>e.user_id)).size,requests:nlu.length,parsed,unknown:nlu.length-parsed,intents},main,discovery,sources};
  }
}
