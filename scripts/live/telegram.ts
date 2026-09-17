import { isQuickOrigin } from "./environment.js";
// Only update an existing temporary development menu for this bot. Inline wallet buttons need no registration.
export async function syncDevelopmentMenu(token:string,origin:string,signal:AbortSignal,request:typeof fetch=fetch) {
  if(!isQuickOrigin(origin))throw new Error("TELEGRAM_LAUNCH");
  const endpoint="https://api.telegram.org/bot"+token;
  const read=await request(endpoint+"/getChatMenuButton",{signal:AbortSignal.any([signal,AbortSignal.timeout(10000)])});
  if(!read.ok)throw new Error("TG_READ");
  const data=await read.json() as {ok:boolean;result?:{type:string;text:string;web_app?:{url:string}}};
  if(!data.ok)throw new Error("TG_READ");const menu=data.result;
  if(menu?.type!=="web_app"||!menu.web_app?.url)return false;
  let previous:URL;try{previous=new URL(menu.web_app.url);}catch{return false;}
  if(!isQuickOrigin(previous.origin)||previous.pathname!=="/"||previous.search||previous.hash||previous.origin===origin)return false;
  const result=await request(endpoint+"/setChatMenuButton",{method:"POST",signal:AbortSignal.any([signal,AbortSignal.timeout(10000)]),headers:{"content-type":"application/json"},body:JSON.stringify({menu_button:{type:"web_app",text:menu.text,web_app:{url:origin+"/"}}})});
  if(!result.ok||(await result.json() as {ok:boolean}).ok!==true)throw new Error("TG_READ");return true;
}
