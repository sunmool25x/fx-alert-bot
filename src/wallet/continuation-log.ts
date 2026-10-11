import {createHmac,randomBytes} from 'node:crypto';
const salt=randomBytes(32),ref=(v:string)=>createHmac('sha256',salt).update(v).digest('hex').slice(0,12);
export function continuationLog(stage:'QUOTE_PARSED'|'RECORDED'|'SELECTED'|'BOOTSTRAP'|'LOOKUP'|'OWNERSHIP_RETURN'|'FRESH_QUOTE'|'REVIEWED'|'CANCELLED',result:'OK'|'MISSING'|'REJECTED'|'RECOVERED',user:string,id?:string){
  console.info(JSON.stringify({event:'quote_continuation',at:new Date().toISOString(),stage,result,user_ref:ref(user),...(id?{context_ref:ref(id)}:{})}));
}
