import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync,readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BotController } from "../src/bot/controller.js";
import { SqliteStore } from "../src/database/store.js";
import type { View } from "../src/bot/view.js";
import { A,B,NOW,config,fakeMarkets } from "./helpers.js";
import { CONTEXT_TTL_MS } from "../src/nlu/context.js";
function setup(path=":memory:"){
  let now=NOW;const store=new SqliteStore(path,900000,()=>now),X={...B,symbol:"XSGD",currency:"SGD"},base=fakeMarkets();
  const calls:{from:string;to:string;amount:string}[]=[],rates:string[]=[];
  const market={...base,tokens:async()=>[A,X],markets:async()=>[{symbol:"USDC/XSGD",base_symbol:"USDC",quote_symbol:"XSGD",base_address:A.address,quote_address:X.address,tick_precision:6,quantity_precision:6}],
    reference:async(from:typeof A,to:typeof A)=>{rates.push(from.symbol+"/"+to.symbol);return {pair:from.currency+"/"+to.currency,rate:"1.35",as_of:now/1000};},
    quote:async(from:typeof A,to:typeof A,amount:string)=>{calls.push({from:from.symbol,to:to.symbol,amount});return {...await base.quote(from,to,amount),expiresAt:now+30000};}};
  const c={...config,wallet:{...config.wallet,ready:true,uiReady:true,enabled:false,origin:"https://bot.example"}},bot=new BotController(store,market,c,()=>now);
  const views:View[]=[],last=()=>views.at(-1)!,out={reply:async(v:View)=>{views.push(v);}};
  return {store,c,bot,market,calls,rates,last,views,text:(text:string,userId="1")=>bot.handle({userId,text},out),callback:(callback:string,userId="1")=>bot.handle({userId,callback},out),advance:(ms:number)=>{now+=ms;},button:(prefix:string)=>last().buttons!.flat().find(b=>b.data.startsWith(prefix))!.data};
}
test("Korean rate then contextual above alert asks size and reuses existing explicit confirmation",async()=>{
  const f=setup();try{
    await f.text("USDC/XSGD 환율 알려줘");assert.match(f.last().text,/참고 환율/);assert.deepEqual(f.rates,["USDC/XSGD"]);
    await f.text("1.35 넘으면 알려줘");assert.match(f.last().text,/어느 금액/);assert.equal(f.calls.length,0);
    await f.text("100");assert.match(f.last().text,/1 USDC ≥ 1.35 XSGD/);assert.equal((await f.store.alerts.list("1")).length,0);
    const save=f.button("a:save:");await f.callback(save,"2");assert.equal((await f.store.alerts.list("2")).length,0);
    await f.callback(save);await f.callback(save);const alerts=await f.store.alerts.list("1");assert.equal(alerts.length,1);assert.equal(alerts[0]!.amount,"100");assert.equal(f.store.inputOrigins.get("alert",alerts[0]!.id),"natural_language");
  }finally{f.store.close();}
});
test("below alert is never created by text confirmation, and cancel invalidates its button",async()=>{
  const f=setup();try{await f.text("USDC/XSGD가 1.35 이하면 알려줘");await f.text("100");assert.match(f.last().text,/≤ 1.35/);const save=f.button("a:save:"),cancel=f.button("a:cancel:");
    await f.text("응 만들어줘");assert.equal((await f.store.alerts.list("1")).length,0);await f.callback(cancel);await f.callback(save);assert.equal((await f.store.alerts.list("1")).length,0);
  }finally{f.store.close();}
});
test("movement uses the existing window and waiting-history semantics after confirmation",async()=>{
  const f=setup();try{await f.text("USDC/XSGD 환율 알려줘");await f.text("6시간 동안 0.5퍼 이상 움직이면 알려줘");await f.text("100");assert.match(f.last().text,/6 시간 · ±0.5%/);await f.callback(f.button("a:save:"));
    const a=(await f.store.alerts.list("1"))[0]!;assert.equal(a.type,"RATE_MOVEMENT");assert.equal(a.window_seconds,21600);assert.equal(a.evaluation_status,"WAITING_HISTORY");
  }finally{f.store.close();}
});
test("NL quote preserves precision, gets a fresh quote every time and retains refresh ownership checks",async()=>{
  const f=setup();try{await f.text("100.123456 USDC를 XSGD로 바꾸면 얼마 받아?");assert.match(f.last().text,/최신 Quote/);assert.equal(f.calls[0]!.amount,"100.123456");const refresh=f.button("refresh:"),id=refresh.slice(8);
    assert.equal(f.store.inputOrigins.get("quote",id),"natural_language");assert.equal((await f.store.intent(id,"1"))!.origin,"quote");await f.callback(refresh,"2");assert.equal(f.calls.length,1);
    await f.callback(refresh);assert.equal(f.calls.length,2);assert.equal(f.store.inputOrigins.get("quote",f.button("refresh:").slice(8)),"button");
    await f.text("100.123456 USDC를 XSGD로 바꾸면 얼마 받아?");assert.equal(f.calls.length,3);
  }finally{f.store.close();}
});
test("swap language prepares the same quote and only offers existing manual wallet continuation",async()=>{
  const f=setup();try{await f.text("USDC 5개 XSGD로 바꾸고 싶어");assert.equal(f.calls.length,1);assert.equal(f.calls[0]!.amount,"5");assert.match(f.last().text,/최신 Quote/);assert.equal(f.c.wallet.enabled,false);assert.equal(f.c.network,"sepolia");
    const intent=await f.store.intent(f.button("refresh:").slice(8),"1");assert.equal(intent!.origin,"swap");assert.equal(f.store.wallet.address("1"),undefined);assert.deepEqual(f.store.wallet.list("1"),[]);
    const trade=f.button("trade:");await f.callback(trade);assert.match(f.last().buttons![0]![0]!.webApp!,/^https:\/\/bot.example\/\?intent=/);assert.deepEqual(f.store.wallet.list("1"),[]);
    await f.text("자동으로 거래 실행하고 서명해줘");assert.deepEqual(f.store.wallet.list("1"),[]);assert.equal(f.calls.length,1);
  }finally{f.store.close();}
});
test("NL alpha and alerts use existing empty states",async()=>{
  const f=setup();try{await f.text("지금 볼만한 FX 조건 있어?");assert.match(f.last().text,/지금 확인해볼 FX 조건/);await f.text("내 알림 보여줘");assert.match(f.last().text,/아직 만든 알림이 없어요/);}finally{f.store.close();}
});
test("missing pair and amount recover with one narrow follow-up each",async()=>{
  const f=setup();try{await f.text("100 바꾸면 얼마야?");assert.match(f.last().text,/어떤 FX Pair/);await f.text("USDC/XSGD");assert.equal(f.calls[0]!.amount,"100");
    await f.text("/cancel");await f.text("USDC XSGD로 바꾸면 얼마 받아?");assert.match(f.last().text,/바꿀 금액/);await f.text("5.000001");assert.equal(f.calls.at(-1)!.amount,"5.000001");
  }finally{f.store.close();}
});
test("context is isolated, expires, clears on command/cancel/unknown and revalidates current markets",async()=>{
  const f=setup();try{await f.text("/rate USDC XSGD");await f.text("1.35 넘으면 알려줘","2");assert.match(f.last().text,/어떤 FX Pair/);
    f.advance(CONTEXT_TTL_MS);await f.text("1.35 넘으면 알려줘");assert.match(f.last().text,/어떤 FX Pair/);
    for(const reset of ["/cancel","/help","날씨 알려줘"]){await f.text("USDC/XSGD 환율 알려줘");await f.text(reset);await f.text("1.35 넘으면 알려줘");assert.match(f.last().text,/어떤 FX Pair/);}
    await f.text("USDC/XSGD 환율 알려줘");f.market.markets=async()=>[];await f.text("1.35 넘으면 알려줘");assert.match(f.last().text,/어떤 FX Pair/);assert.equal(f.calls.length,0);
  }finally{f.store.close();}
});
test("malformed amounts, token precision, unknown tokens and unsupported windows cannot create actions",async()=>{
  const f=setup();try{
    for(const input of ["-5 USDC → XSGD","1e3 USDC → XSGD","0 USDC → XSGD","0.1 USDC → XSGD","1.0000001 USDC → XSGD","1,000 USDC → XSGD","100 FAKE → XSGD","USDC/XSGD 2시간 변동 0.5% 넘으면 알려줘"]){await f.text(input);assert.equal(f.calls.length,0,input);assert.equal((await f.store.alerts.list("1")).length,0);}
    await f.text("지원하지 않는 한국어 요청");assert.match(f.last().text,/정확히 이해하지 못했어요/);
  }finally{f.store.close();}
});
test("English commands and both existing command/button wizards retain input origin",async()=>{
  const f=setup();try{await f.callback("language:en");await f.text("/help");assert.match(f.last().text,/FX Alert Bot help/);await f.text("/rate XSGD USDC");assert.deepEqual(f.rates,["XSGD/USDC"]);
    await f.text("/quote 100 USDC XSGD");assert.equal(f.store.inputOrigins.get("quote",f.button("refresh:").slice(8)),"command");
    await f.text("/quote");await f.callback(f.button("pick:"));await f.callback(f.button("pick:"));await f.text("100");assert.equal(f.store.inputOrigins.get("quote",f.button("refresh:").slice(8)),"command");
    await f.callback("wallet:quote");await f.callback(f.button("pick:"));await f.callback(f.button("pick:"));await f.text("100");assert.equal(f.store.inputOrigins.get("quote",f.button("refresh:").slice(8)),"button");
  }finally{f.store.close();}
});
test("origin metadata persists, deletes with records and leaves existing quote provenance intact",async()=>{
  const path=join(mkdtempSync(join(tmpdir(),"fx-nlu-")),"test.sqlite"),f=setup(path);let id="",alertId="";
  try{await f.text("100 USDC → XSGD");id=f.button("refresh:").slice(8);await f.text("1.35 넘으면 알려줘");await f.text("100");await f.callback(f.button("a:save:"));alertId=(await f.store.alerts.list("1"))[0]!.id;}finally{f.store.close();}
  const s=new SqliteStore(path,900000,()=>NOW);try{assert.equal(s.inputOrigins.get("quote",id),"natural_language");assert.equal(s.inputOrigins.get("alert",alertId),"natural_language");assert.equal((await s.intent(id,"1"))?.origin,"quote");await s.forget("1");assert.equal(s.inputOrigins.get("quote",id),undefined);assert.equal(s.inputOrigins.get("alert",alertId),undefined);}finally{s.close();}
});
test("parser and context import no wallet, transaction, networking or LLM capability",()=>{
  for(const file of ["src/nlu/parser.ts","src/nlu/context.ts"]){const code=readFileSync(file,"utf8");assert.doesNotMatch(code,/fetch\(|personal_sign|eth_sign|sendTransaction|api\(|from ["'].*(?:wallet|trades|openai|anthropic)/);}
});
test("start and help make Korean requests discoverable without losing product identity",async()=>{
  const f=setup();try{for(const command of ["/start","/help"]){await f.text(command);assert.match(f.last().text,/FX Alert Bot/);assert.match(f.last().text,/100 USDC를 XSGD로 바꾸면/);assert.match(f.last().text,/Sera Protocol/);}}finally{f.store.close();}
});
import { createTelegramBot } from "../src/bot/telegram.js";
import { AppError } from "../src/utils/errors.js";
test("actual Telegram adapter routes Korean text locally; group messages cannot use NLU",async()=>{
  const f=setup(),bot=createTelegramBot("123456:TEST_TOKEN",f.bot),sent:string[]=[];
  bot.botInfo={id:123456,is_bot:true,first_name:"FX",username:"WorldFxFixtureBot",can_join_groups:true,can_read_all_group_messages:false,supports_inline_queries:false,can_connect_to_business:false,has_main_web_app:false,has_topics_enabled:false,allows_users_to_create_topics:false,can_manage_bots:false,supports_join_request_queries:false};
  bot.api.config.use(async(_prev,method,payload)=>{if(method==="sendMessage")sent.push((payload as {text:string}).text);return {ok:true,result:{message_id:1,date:NOW/1000,chat:{id:1,type:"private"},text:"fixture"}} as never;});
  try{await bot.handleUpdate({update_id:20,message:{message_id:20,date:NOW/1000,from:{id:1,is_bot:false,first_name:"not retained"},chat:{id:1,type:"private",first_name:"not retained"},text:"USDC/XSGD 환율 알려줘"}});assert.match(sent[0]!,/참고 환율/);
    await bot.handleUpdate({update_id:21,message:{message_id:21,date:NOW/1000,from:{id:99,is_bot:false,first_name:"not retained"},chat:{id:-99,type:"group",title:"fixture"},text:"100 USDC → XSGD"}});assert.equal(await f.store.user("99"),undefined);assert.equal(f.calls.length,0);
  }finally{f.store.close();}
});
test("failed new pair query never silently falls back to the earlier pair",async()=>{
  const f=setup();try{await f.text("USDC/XSGD 환율 알려줘");f.market.reference=async()=>{throw new AppError("UNAVAILABLE");};await f.text("XSGD/USDC 환율 알려줘");await f.text("1.35 넘으면 알려줘");assert.match(f.last().text,/어떤 FX Pair/);}finally{f.store.close();}
});
test("pending amount allows correction after minimum/precision rejection; restart loses context",async()=>{
  const f=setup();try{await f.text("USDC XSGD로 바꾸면 얼마 받아?");await f.text("0.1");assert.equal(f.calls.length,0);await f.text("1.0000001");assert.equal(f.calls.length,0);await f.text("5.000001");assert.equal(f.calls[0]!.amount,"5.000001");
    const restarted=new BotController(f.store,f.market,f.c,()=>NOW),views:View[]=[];await restarted.handle({userId:"1",text:"1.35 넘으면 알려줘"},{reply:async v=>{views.push(v);}});assert.match(views.at(-1)!.text,/어떤 FX Pair/);
  }finally{f.store.close();}
});
