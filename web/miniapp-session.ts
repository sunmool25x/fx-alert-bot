import {WalletFlowError,type WalletApi} from './connection.js';
const key='fx-alert:csrf';
/** Only the CSRF nonce is tab/origin-local. Context and ownership remain authoritative on the server. */
export async function miniAppSession(api:WalletApi,initData:string,setCsrf:(v:string)=>void,storage:Pick<Storage,'getItem'|'setItem'|'removeItem'>){
  let cached:string|null=null;try{cached=storage.getItem(key);}catch{/* Storage may be disabled in WebViews. */}
  if(cached){
    setCsrf(cached);
    try{return await api('bootstrap',{initData});}
    catch(e){if(!(e instanceof WalletFlowError)||!['AUTH_STALE','AUTH_INVALID'].includes(e.code))throw e;try{storage.removeItem(key);}catch{}}
  }
  setCsrf('');const result=await api('auth',{initData});setCsrf(result.csrf);
  try{storage.setItem(key,result.csrf);}catch{}
  return result;
}
