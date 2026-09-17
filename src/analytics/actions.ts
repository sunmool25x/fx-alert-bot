import type { Store,User } from "../database/store.js";
import type { Output } from "../bot/controller.js";
import type { EventName,EventContext } from "./types.js";
export function track(store:Store,user:User,out:Output,event:EventName,context:EventContext={}){
  store.analytics.record(user.id,event,{...out.analytics,origin:out.origin,...context});
}
