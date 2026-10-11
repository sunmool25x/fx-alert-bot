import {TradeAuthorizationFlow} from './trade-authorization.js';
import {remainingBudget} from '../src/trades/timing.js';
import {reviewClock} from './review-clock.js';
import type {AuthorizationReview} from '../src/trades/review.js';
import type {ConnectedProvider} from './connector-types.js';
import type {WalletApi} from './connection.js';
export interface FinancialReview{id:string;version:string;state:string;expiresAt:number;text:string;details?:AuthorizationReview}
export function tradeAuthorizationPanel(o:{root:HTMLElement;review:FinancialReview;language:'ko'|'en';api:WalletApi;provider:()=>ConnectedProvider|undefined;wallet:()=>string;epoch:()=>number;enabled:()=>boolean;handoff:()=>void;pending:(v:boolean)=>void;submitted:(review:any)=>void;error:(e:unknown)=>void}){
  const {review,language}=o,ko=language==='ko',panel=document.createElement('section'),progress=document.createElement('p');progress.setAttribute('role','status');o.root.prepend(panel);
  const summary=document.createElement('pre');summary.textContent=review.details?[review.details.title,...review.details.rows.filter(([k])=>!['예상 수령','Expected receive'].includes(k)).map(([k,v])=>k+': '+v),...review.details.steps.flatMap(step=>step.rows.filter(([k])=>['최대 승인 금액','Maximum allowance','사용 승인 대상','Spender','서명 제출 기한','Signature submission deadline','교환 기한','Swap deadline'].includes(k)).map(([k,v])=>k+': '+v)),ko?'각 버튼은 별도 금융 승인입니다. 서명 후에도 자동 제출하지 않습니다.':'Each action is a separate financial authorization. Signatures do not submit automatically.'].join('\n'):review.text;panel.append(summary,progress);
  const consent=document.createElement('input');consent.type='checkbox';const label=document.createElement('label');label.append(consent,document.createTextNode(ko?'표시된 이번 금융 승인 내용을 확인했습니다.':'I reviewed this financial authorization.'));panel.append(label);
  let busy=false,quoteExpiry=0,availability={permit:false,intent:false,submit:false};
  const open=document.createElement('button');open.textContent=ko?'OKX 열기':'Open OKX';open.disabled=true;
  const flow=new TradeAuthorizationFlow({...o,id:review.id,version:review.version,needsConfirm:review.state==='REVIEW',progress:state=>{const pending=state==='WAITING_WALLET'||state==='OPEN_OKX';o.pending(pending);progress.textContent=state==='WAITING_WALLET'?(ko?'OKX에서 승인을 기다리고 있어요.':'Waiting for OKX approval.'):state;open.disabled=!pending;}});
  const actions=['permit','intent','submit']as const,labels=ko?['1. USDC 사용 승인','2. 이번 교환 승인','3. 거래 제출']:['1. Authorize USDC use','2. Authorize this swap','3. Submit once'];
  const buttons=actions.map((step,i)=>{const b=document.createElement('button');b.textContent=labels[i]!;b.disabled=true;panel.append(b);b.onclick=async()=>{
    if(!consent.checked||busy||b.disabled)return;busy=true;paint();
    try{if(step==='submit')o.submitted(await flow.submit(true));else await flow.sign(step,true);}catch(e){o.error(e);}finally{busy=false;o.pending(false);consent.checked=false;await refresh().catch(o.error);}
  };return b;});
  const paint=()=>buttons.forEach((b,i)=>b.disabled=!o.enabled()||busy||!consent.checked||!availability[actions[i]!]||Date.now()+remainingBudget(actions[i]!)>quoteExpiry);
  const refresh=async()=>{const state=await flow.status();availability=state.available;quoteExpiry=state.quoteExpiresAt;progress.textContent=[state.state,state.permit?.state,state.intent?.state].filter(Boolean).join(' · ');paint();};
  consent.onchange=paint;open.onclick=()=>{try{flow.reopen();}catch(e){o.error(e);}};panel.append(open);
  const clock=document.createElement('p');panel.prepend(clock);const tick=()=>{if(!panel.isConnected)return;clock.textContent=reviewClock(quoteExpiry||review.expiresAt,Date.now(),language).text;paint();setTimeout(tick,250);};tick();void refresh().catch(o.error);
  const check=document.createElement('button');check.textContent=ko?'승인 상태 확인':'Check authorization status';check.onclick=()=>{void refresh().catch(o.error);};panel.append(check);
  const note=document.createElement('p');note.textContent=ko?'유효시간이 부족하면 다음 승인을 요청할 수 없어요. 이미 요청한 서명은 상태를 확인하고 다시 요청하지 마세요.':'The next action is blocked when validity is insufficient. Check an existing signature request instead of requesting it again.';panel.append(note);
  return{flow,refresh};
}
