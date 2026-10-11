import {WalletFlowError,type WalletApi} from './connection.js';
import {walletError} from '../src/i18n/wallet.js';
export interface TradeContext {id:string;amount:string;fromSymbol:string;toSymbol:string;chainId:number;expiresAt:number}
export function continuationRoute(hash:string,search=''){
  const ids=[...new URLSearchParams(search).getAll('intent'),...new URLSearchParams(hash.replace(/^#/, '')).getAll('intent')];
  const invalid=ids.some(id=>! /^[A-Za-z0-9_-]{11}$/.test(id))||new Set(ids).size>1;
  return{id:invalid?undefined:ids[0],invalid};
}
export function continuationId(hash:string,search=''){return continuationRoute(hash,search).id;}
/** A pinned context is never replaced by a later request/default on refresh. */
export class TradeContinuation {
  context?:TradeContext;private id?:string;private invalid:boolean;
  constructor(private o:{api:WalletApi;id?:string;invalid?:boolean;changed:(context?:TradeContext)=>void;now?:()=>number}){this.id=o.id;this.invalid=o.invalid??false;}
  async restore(){
    if(this.invalid)throw new WalletFlowError('TRADE_STATE');
    try{
      const c:TradeContext=await this.o.api('context',this.id?{intent:this.id}:{});
      if(!/^[A-Za-z0-9_-]{11}$/.test(c.id)||(this.id&&c.id!==this.id)||c.expiresAt<=(this.o.now??Date.now)())throw new WalletFlowError('TRADE_STATE');
      this.id=c.id;this.context=c;this.o.changed(c);return c;
    }catch(e){this.context=undefined;this.o.changed();throw e;}
  }
  async quote(guard:()=>void,epoch:()=>number){await this.restore();return freshContinuationQuote({id:this.id,api:this.o.api,guard,epoch,now:this.o.now});}
  async cancel(){if(!this.context)throw new WalletFlowError('TRADE_STATE');await this.o.api('context/cancel',{intent:this.context.id});this.invalid=true;this.context=undefined;this.o.changed();}
  valid(){return !!this.context&&this.context.expiresAt>(this.o.now??Date.now)();}
}
export const isPermitContext=(c:TradeContext|undefined)=>!!c&&c.amount==='50'&&c.fromSymbol==='USDC'&&c.toSymbol==='XSGD'&&c.chainId===11155111;
/** The shared fresh-quote CTA selects a capability, never promotes an existing preview. */
export async function requestContinuationReview(o:{continuation:TradeContinuation;permitOnly:boolean;preparePermit?:(id:string)=>Promise<void>;guard:()=>void;epoch:()=>number;showReadOnly:(review:any)=>void}){
  const c=await o.continuation.restore();o.guard();
  if(o.permitOnly&&isPermitContext(c)){
    if(!o.preparePermit)throw new WalletFlowError('PERMIT_DISABLED');
    await o.preparePermit(c.id);return 'permit' as const;
  }
  o.showReadOnly(await o.continuation.quote(o.guard,o.epoch));return 'read-only' as const;
}
export const quoteErrorCode=(e:unknown)=>{
  const code=e instanceof WalletFlowError?e.code:'UNAVAILABLE';
  return code==='AUTH_STALE'?'SESSION_EXPIRED':code==='TRADE_STATE'?'NO_TRADE_CONTEXT':code==='WALLET_REQUIRED'?'OWNERSHIP_EXPIRED':code==='UNAVAILABLE'?'NETWORK_ERROR':code;
};
export function quoteFailure(language:'ko'|'en',e:unknown){
  const code=quoteErrorCode(e),ko=language==='ko';
  const text=code==='NO_TRADE_CONTEXT'?(ko?'거래 요청이 없거나 만료됐어요. 이번 Quote 조회에서 새로운 금융 승인이나 거래는 진행되지 않았습니다. Telegram에서 /quote <금액> USDC XSGD로 새 요청을 시작해 주세요.':'The trade request is missing or expired. This quote lookup did not request a new financial authorization or trade. Start a new /quote <amount> USDC XSGD request in Telegram.'):
    code==='SESSION_EXPIRED'?(ko?'로그인 시간이 만료됐습니다. Telegram의 같은 요청에서 테스트 거래 계속을 다시 열어 주세요.':'Your session expired. Reopen Continue test trade from the same Telegram request.'):
    code==='OWNERSHIP_EXPIRED'?(ko?'이 연결의 지갑 소유 확인이 필요합니다. 아래 소유 확인 버튼을 이용해 주세요. 요청 금액은 유지됩니다.':'Verify ownership for this connection using the button below. Your requested amount is retained.'):
    code==='NETWORK_ERROR'?(ko?'Quote를 조회하지 못했습니다. 연결을 확인하고 다시 눌러 주세요.':'Quote request failed. Check your connection and try again.'):
    walletError(language,code);
  return '['+code+'] '+text;
}
/** Only the opaque, owner-bound continuation is sent. Never resize or create an intent. */
export async function freshContinuationQuote(o:{id?:string;api:WalletApi;guard:()=>void;epoch:()=>number;now?:()=>number}){
  if(!o.id)throw new WalletFlowError('TRADE_STATE');
  const context:TradeContext=await o.api('context',{intent:o.id});
  if(context.id!==o.id||context.expiresAt<=(o.now??Date.now)())throw new WalletFlowError('TRADE_STATE');
  o.guard();const epoch=o.epoch();
  const review=await o.api('preview',{intent:o.id});
  o.guard();if(epoch!==o.epoch())throw new WalletFlowError('WALLET_REQUIRED');
  if(review.financialAuthorizationAvailable!==false||review.state!=='PREVIEW'||review.context?.amount!==context.amount||review.context?.fromSymbol!==context.fromSymbol||review.context?.toSymbol!==context.toSymbol||review.context?.chainId!==context.chainId)throw new WalletFlowError('QUOTE_BINDING_MISMATCH');
  return review;
}
/** Visible status is in the active request panel, including failures from claim CTA. */
export function quoteRequestButton(o:{root:HTMLElement;language:'ko'|'en';request:()=>Promise<void|'permit'|'read-only'>;renew:()=>Promise<void>;hasContext?:()=>boolean}){
  const status=document.createElement('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.tabIndex=-1;
  const button=document.createElement('button');button.type='button';button.className='primary';button.textContent=o.language==='ko'?'내 지갑의 최신 Quote 확인':'Check my fresh wallet quote';
  const renew=document.createElement('button');renew.type='button';renew.textContent=o.language==='ko'?'지갑 소유 확인':'Verify wallet ownership';renew.hidden=true;
  const reveal=()=>{status.scrollIntoView?.({block:'center'});status.focus?.({preventScroll:true});};
  let working=false;
  async function request(){
    if(o.hasContext&&!o.hasContext()){status.textContent=quoteFailure(o.language,new WalletFlowError('TRADE_STATE'));button.disabled=true;reveal();return;}
    if(working){status.textContent=o.language==='ko'?'Quote를 조회 중입니다…':'Fetching quote…';reveal();return;}
    working=true;button.disabled=true;renew.hidden=true;status.textContent=o.language==='ko'?'현재 요청으로 최신 Quote를 조회 중입니다…':'Fetching a fresh quote for this request…';reveal();
    try{const mode=await o.request();status.textContent=mode==='permit'?(o.language==='ko'?'새 Quote의 Permit 전용 검토 화면입니다. 아직 서명을 요청하지 않았습니다. Intent와 제출은 비활성 상태입니다.':'Fresh quote Permit-only review is ready. No signature has been requested. Intent and submission are disabled.'):(o.language==='ko'?'새 Quote 검토 화면을 표시했습니다. 서명과 제출은 비활성 상태입니다.':'Fresh quote review displayed. Signing and submission are disabled.');}
    catch(e){status.textContent=quoteFailure(o.language,e);renew.hidden=quoteErrorCode(e)!=='OWNERSHIP_EXPIRED';reveal();}
    finally{working=false;button.disabled=o.hasContext?!o.hasContext():false;}
  }
  button.onclick=()=>{void request();};renew.onclick=()=>{void o.renew().catch(e=>{status.textContent=quoteFailure(o.language,e);reveal();});};
  o.root.append(button,status,renew);return {request,status,button,setContext(valid:boolean){button.disabled=working||!valid;},expired(){button.textContent=o.language==='ko'?'새 Quote 다시 확인':'Check a new quote';}};
}
