export function reviewClock(expiresAt:number,now:number,language:'ko'|'en'){
  const seconds=Math.max(0,Math.ceil((expiresAt-now)/1000)),expired=!Number.isFinite(expiresAt)||seconds===0;
  return {expired,seconds:expired?0:seconds,text:expired?(language==='ko'?'Quote가 만료되었습니다. 새 Quote를 다시 확인해주세요.':'Quote expired. Request and review a new quote.'):
    (language==='ko'?`검토 가능 시간 ${seconds}초 · 서명 비활성`:`Review time ${seconds}s · signing disabled`)};
}
