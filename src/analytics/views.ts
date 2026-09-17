import type { Language } from "../database/store.js";
import type { GrowthReport,Period } from "./types.js";
import type { View } from "../bot/view.js";
export type StatsScreen="summary"|"sources"|"funnel";
const labels={ko:{users:"활성 사용자",alert_created:"알림 생성",alert_triggered:"알림 발생",fresh_quote_viewed:"최신 Quote 확인",trade_flow_started:"거래 흐름 시작",testnet_trade_completed:"검증된 테스트넷 거래 완료",alpha_viewed:"FX 조건 보기",alpha_quote:"조건 → Quote",alpha_alert:"조건 → 알림"},
  en:{users:"Active users",alert_created:"Alert created",alert_triggered:"Alert triggered",fresh_quote_viewed:"Fresh quote viewed",trade_flow_started:"Trade flow started",testnet_trade_completed:"Verified testnet trade completed",alpha_viewed:"Alpha viewed",alpha_quote:"Alpha → Quote",alpha_alert:"Alpha → Alert"}};
export function statsView(r:GrowthReport,language:Language,screen:StatsScreen="summary"):View{
  const ko=language==="ko",l=labels[language],period=r.days===1?(ko?"오늘":"Today"):(ko?`최근 ${r.days}일`:`Last ${r.days} days`);
  const title=`📊 FX Alert Bot — Growth · ${period}`;
  const metric=(name:keyof typeof l)=>{const m=r.metrics[name as keyof typeof r.metrics]??{users:0,events:0};return `${l[name]}: ${m.users}${ko?"명 / ":" users / "}${m.events}${ko?"건":" events"}`;};
  let lines:string[];
  if(screen==="summary")lines=[title,"Asia/Seoul",`${ko?"전체 사용자":"Total users"}: ${r.totalUsers}`,`${l.users}: ${r.activeUsers}`,`${ko?"신규 / 재방문":"New / returning"}: ${r.newUsers} / ${r.returningUsers}`,
    `${ko?"2일 이상 활동":"Active on 2+ days"}: ${r.retainedUsers}`,`${ko?"일별 활성 사용자":"Daily active users"}: ${r.daily.length?r.daily.map(d=>`${d.day.slice(5)} ${d.users}`).join(" · "):"0"}`,
    metric("alpha_viewed"),metric("alert_created"),metric("alert_triggered"),`${ko?"알림 수신 사용자":"Alert recipients"}: ${r.metrics.alert_delivered?.users??0}`,metric("fresh_quote_viewed"),metric("trade_flow_started"),metric("testnet_trade_completed"),
    `${ko?"알림 → Quote":"Alert → Quote"}: ${r.main[3]!.previousPercent}`,`${ko?"Quote → 거래 시작":"Quote → trade start"}: ${r.main[4]!.previousPercent}`,
    `${ko?"탐색 건수 (Start / Markets / Rate)":"Discovery events (Start / Markets / Rate)"}: ${r.metrics.bot_started?.events??0} / ${r.metrics.markets_viewed?.events??0} / ${r.metrics.rate_requested?.events??0}`,
    `${ko?"알림 설정 시작 / 삭제":"Alert setup started / deleted"}: ${r.metrics.alert_setup_started?.events??0} / ${r.metrics.alert_deleted?.events??0}`,
    `${ko?"Quote 요청 / 새로고침 클릭":"Quote requests / fresh clicks"}: ${r.metrics.quote_requested?.events??0} / ${r.metrics.fresh_quote_clicked?.events??0}`,
    ...r.quoteOrigins.map(o=>`Quote ${o.origin}/${o.entry}: ${o.users}/${o.events}`),
    `${ko?"지갑 연결 시작 / 검증":"Wallet start / verified"}: ${r.metrics.wallet_connect_started?.events??0} / ${r.metrics.wallet_verified?.events??0}`,
    `${ko?"거래 검토 / 승인 / 제출 / 대기":"Review / authorize / submit / pending"}: ${r.metrics.trade_review_viewed?.events??0} / ${r.metrics.trade_authorization_started?.events??0} / ${r.metrics.trade_submitted?.events??0} / ${r.metrics.trade_pending?.events??0}`,
    `NLU: ${r.nlu.users}${ko?"명":" users"} · ${r.nlu.parsed} parsed / ${r.nlu.unknown} unknown`,...Object.entries(r.nlu.intents).map(([k,n])=>`${k}: ${n}`)];
  else if(screen==="funnel")lines=[title,ko?"연결된 행동 · 고유 사용자 · 직전 단계 대비 / 전체 대비":"Linked actions · unique users · previous / total",...r.main.map(s=>`${l[s.name as keyof typeof l]}: ${s.users} · ${s.previousPercent} / ${s.totalPercent}`),"",ko?"FX 조건 탐색 퍼널":"Alpha discovery funnel",...r.discovery.map(s=>`${l[s.name as keyof typeof l]}: ${s.users} · ${s.previousPercent} / ${s.totalPercent}`)];
  else{
    const top=r.sources.slice(0,8),rest=r.sources.slice(8);
    const grouped=rest.length?[{source:"other",users:rest.reduce((n,s)=>n+s.users,0),creators:rest.reduce((n,s)=>n+s.creators,0),quotes:rest.reduce((n,s)=>n+s.quotes,0),trades:rest.reduce((n,s)=>n+s.trades,0)}]:[];
    lines=[title,ko?"📍 첫 유입 경로 · 기간 내 활성 사용자":"📍 First-touch sources · active users in period",...[...top,...grouped].map(s=>`${s.source}\n${s.users} ${ko?"명":"users"} · ${s.creators} ${ko?"알림 생성":"alert creators"} · ${s.quotes} Quote · ${s.trades} ${ko?"완료":"completed"}\n${ko?"알림 / Quote / 완료 전환":"Alert / quote / completion conversion"}: ${s.users?(s.creators/s.users*100).toFixed(1):"0"}% / ${s.users?(s.quotes/s.users*100).toFixed(1):"0"}% / ${s.users?(s.trades/s.users*100).toFixed(1):"0"}%`),...(!r.sources.length?[ko?"아직 집계할 유입 데이터가 없어요.":"No acquisition data yet."]:[])];
  }
  lines.push("",(ko?"추적 시작: ":"Tracking since: ")+new Date(r.trackingSince+9*3600000).toISOString().slice(0,16).replace("T"," ")+" KST",ko?"내부 사용자 제외 · 기간 내 이벤트 기준":"Internal users excluded · events within selected period");
  const button=(text:string,days:Period,target:StatsScreen)=>({text,data:`stats:${days}:${target}`});
  return {text:lines.join("\n"),buttons:[[button(ko?"오늘":"Today",1,screen),button("7"+(ko?"일":" days"),7,screen),button("30"+(ko?"일":" days"),30,screen)],
    [button(ko?"요약":"Summary",r.days,"summary"),button(ko?"유입 경로":"Sources",r.days,"sources"),button(ko?"퍼널":"Funnel",r.days,"funnel")]]};
}
