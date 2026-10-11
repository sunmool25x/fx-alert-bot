import {hashTypedData} from 'viem';
import type {Language} from '../database/store.js';
import type {Snapshot} from './service.js';
import {previewView} from './view.js';
import {quoteEconomics} from './economics.js';
import {fromRawUnits,toRawUnits} from '../sera/precision.js';
import {hashes,permitData,requireThat} from './contract.js';
export function acceptanceReview(p:Snapshot,language:Language){
  const input=String(toRawUnits(p.amount,6));
  requireThat(p.fromSymbol==='USDC'&&p.toSymbol==='XSGD'&&p.quote.route_params.initialDepositAmount===input&&p.quote.route_params.maxInputAmount===input&&p.quote.permit.value_raw===input,'UNSUPPORTED_TRADE');
  const view=previewView(p,language),e=quoteEconomics(p.quote),ko=language==='ko';
  view.details.technical.push(['Permit digest',hashTypedData(permitData(p.quote))],['Intent EIP-712 digest',hashes(p.deployment,p.quote).intent]);
  const unknown=ko?'검증할 수 없음':'Not verified';
  view.details.rows.push([ko?'비용 차감 전 Quote 수령량':'Quoted output before gas',e.beforeRaw?fromRawUnits(e.beforeRaw,6)+' XSGD':unknown],
    [ko?'수령량에서 차감되는 비용':'Cost deducted from output',e.deductedRaw?fromRawUnits(e.deductedRaw,6)+' XSGD':unknown],[ko?'입력 금액 대비 비용 참고값':'Input-equivalent cost share',e.costSharePercent!==undefined?e.costSharePercent+'%':unknown]);
  if(e.beforeRaw)view.details.notes.push(ko?`보내는 금액은 ${p.amount} USDC 그대로이고 비용은 수령할 XSGD에서 차감됩니다. USDC 비용 값은 같은 비용의 환산 표시이며 추가 출금액이 아닙니다.`:`Input stays at ${p.amount} USDC. Cost reduces XSGD received. The USDC cost is an equivalent display, not an additional debit.`);
  const hold=ko?'비용 검토 필요 — 서명 단계로 진행하지 않습니다. 비용이 입력액 또는 차감 전 수령량의 50% 이상이거나 비용 정보를 검증할 수 없습니다.':'Cost review required — stop before signing. Costs reach 50% of input or pre-cost output, or cost information could not be verified.';
  if(e.status==='FAIL'){view.details.notes.unshift(hold);view.details.title=ko?'🧪 TESTNET · 비용 검토로 중단':'🧪 TESTNET · Cost review hold';}
  view.details.notes.push(ko?'현재는 읽기 전용 검토 단계입니다. Permit·Intent 서명과 최종 제출은 비활성 상태입니다.':'Read-only review: Permit, Intent and final submission are disabled.');
  view.details.title=(ko?'🧪 TESTNET · ':'🧪 TESTNET · ')+p.amount+' test USDC → XSGD';
  return {...view,economics:e,reviewState:e.status==='PASS'?'REVIEW_READY' as const:'COST_REVIEW_BLOCKED' as const,context:{amount:p.amount,fromSymbol:p.fromSymbol,toSymbol:p.toSymbol,chainId:11155111,recipient:p.quote.route_params.recipient},financialAuthorizationAvailable:false as const};
}
