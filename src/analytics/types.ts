import type { ActionOrigin } from "../nlu/parser.js";
export const eventNames=["product_activity","bot_started","user_returned","markets_viewed","rate_requested","quote_requested","alpha_viewed","natural_language_used","alert_setup_started","alert_created","alert_deleted","alert_triggered","alert_delivered","fresh_quote_clicked","fresh_quote_viewed","wallet_connect_started","wallet_verified","trade_flow_started","trade_review_viewed","trade_authorization_started","trade_submitted","trade_pending","testnet_trade_completed"] as const;
export type EventName=typeof eventNames[number];
export const entries=["none","quote","alpha","alert","direct_swap"] as const;
export type Entry=typeof entries[number];
export const parsedIntents=["rate_query","quote_query","rate_alert","movement_alert","alpha","show_alerts","swap_prepare","unknown"] as const;
export type ParsedIntent=typeof parsedIntents[number];
export type EventContext={origin?:ActionOrigin;entry?:Entry;entityId?:string;parentId?:string;intent?:ParsedIntent;parsed?:boolean;key?:string;at?:number};
export function entryFromOrigin(origin:string):Entry {
  return origin==="alpha"?"alpha":origin.startsWith("alert:")||origin.startsWith("alert-trigger:")?"alert":origin==="swap"?"direct_swap":"quote";
}
export function triggerFromOrigin(origin:string):string|undefined {return origin.startsWith("alert-trigger:")?origin.slice(14):undefined;}
export const DAY=86_400_000,SEOUL=9*3_600_000;
export type Period=1|7|30;
export function periodBounds(days:Period,now:number){return {start:Math.floor((now+SEOUL)/DAY)*DAY-SEOUL-(days-1)*DAY,end:now+1};}
export function conversion(count:number,previous:number):string {return previous>0?(count/previous*100).toFixed(1)+"%":"—";}
export type Metric={users:number;events:number};
export type FunnelStep={name:string;users:number;previousPercent:string;totalPercent:string};
export interface GrowthReport {
  days:Period;start:number;end:number;trackingSince:number;totalUsers:number;activeUsers:number;newUsers:number;returningUsers:number;retainedUsers:number;
  daily:{day:string;users:number}[];metrics:Partial<Record<EventName,Metric>>;
  quoteOrigins:{origin:string;entry:string;users:number;events:number}[];
  nlu:{users:number;requests:number;parsed:number;unknown:number;intents:Record<string,number>};
  main:FunnelStep[];discovery:FunnelStep[];
  sources:{source:string;users:number;creators:number;quotes:number;trades:number;alertPercent:string;quotePercent:string;tradePercent:string}[];
}
