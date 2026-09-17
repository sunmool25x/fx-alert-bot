import test from "node:test";
import assert from "node:assert/strict";
import { parseKorean,type Registry } from "../src/nlu/parser.js";
import { NluContext,CONTEXT_TTL_MS } from "../src/nlu/context.js";
import { A,B,NOW } from "./helpers.js";
export const X={...B,symbol:"XSGD",currency:"SGD"};
export const registry:Registry={tokens:[A,X],markets:[{symbol:"USDC/XSGD",base_address:A.address,quote_address:X.address,base_symbol:A.symbol,quote_symbol:X.symbol,tick_precision:6,quantity_precision:6}]};
const pair={base:"USDC",quote:"XSGD"};
for(const input of ["USDC/XSGD 환율 알려줘","USDC에서 XSGD 환율","USDC XSGD 지금 얼마야","USDC를 XSGD로 바꾸면 환율이 어떻게 돼?","usdc/xsgd환율알려줘","  USDC / XSGD   환율 알려줘  "]){
  test("rate parser: "+input,()=>assert.deepEqual(parseKorean(input,registry),{type:"RATE_QUERY",pair}));
}
for(const input of ["100 USDC를 XSGD로 바꾸면 얼마 받아?","USDC 100개 XSGD로 바꾸면?","100 USDC → XSGD","100USDC를XSGD로바꾸면얼마야?"]){
  test("quote parser: "+input,()=>assert.deepEqual(parseKorean(input,registry),{type:"QUOTE_QUERY",pair,amount:"100"}));
}
for(const direction of ["넘으면","이상이면","이상 되면","보다 높으면"]){test("above synonym: "+direction,()=>{
  const r=parseKorean("USDC/XSGD가 1.35 "+direction+" 알려줘",registry);assert.equal(r.type,"CREATE_RATE_ALERT");assert.equal(r.direction,"RATE_ABOVE");assert.equal(r.threshold,"1.35");assert.deepEqual(r.pair,pair);
});}
for(const direction of ["밑으로 내려가면","이하면","보다 낮으면"]){test("below synonym: "+direction,()=>{
  const r=parseKorean("1.30 "+direction+" 알려줘",registry);assert.equal(r.type,"CREATE_RATE_ALERT");assert.equal(r.direction,"RATE_BELOW");assert.equal(r.threshold,"1.30");assert.equal(r.pair,undefined);
});}
for(const [unit,percent] of [["시간","%"],[" hr","퍼"],["h"," 퍼센트"]]){test("movement normalization: "+unit+percent,()=>{
  const r=parseKorean(`6${unit} 동안 0.5${percent} 이상 움직이면 알려줘`,registry);assert.equal(r.type,"CREATE_MOVEMENT_ALERT");assert.equal(r.windowSeconds,21600);assert.equal(r.threshold,"0.5");
});}
for(const h of [1,6,24])test("supported movement window "+h,()=>{
  const r=parseKorean(`USDC/XSGD ${h}시간 변동 0.3% 넘으면 알려줘`,registry);assert.equal(r.windowSeconds,h*3600);assert.deepEqual(r.pair,pair);
});
for(const input of ["지금 볼만한 거 있어?","지금 FX 조건 뭐 있어?","시장 움직임 보여줘","지금 볼만한 FX 조건 있어?"])test("alpha: "+input,()=>assert.equal(parseKorean(input,registry).type,"SHOW_ALPHA"));
for(const input of ["내 알림 보여줘","설정한 알림 뭐 있어?"])test("alerts: "+input,()=>assert.equal(parseKorean(input,registry).type,"SHOW_ALERTS"));
for(const input of ["5 USDC를 XSGD로 바꾸고 싶어","USDC 5개 XSGD로 바꾸고 싶어"])test("preparation only: "+input,()=>assert.equal(parseKorean(input,registry).type,"PREPARE_SWAP"));
test("financial decimal strings are preserved exactly; token order remains directional",()=>{
  const amount="9007199254740993.123456";assert.equal(parseKorean(amount+" USDC → XSGD",registry).amount,amount);
  assert.deepEqual(parseKorean("XSGD에서 USDC 환율",registry).pair,{base:"XSGD",quote:"USDC"});
  assert.equal(parseKorean("1.000001 USDC → XSGD",registry).amount,"1.000001");
});
for(const input of ["100 DOGE를 XSGD로 바꾸면?","100 USDC를 FAKE로 바꾸면?","USDC XSGD EURC 환율","USDC USDC 환율","1e3 USDC → XSGD","-5 USDC → XSGD","+5 USDC → XSGD","0 USDC → XSGD","1,000 USDC → XSGD","1.2.3 USDC → XSGD",".5 USDC → XSGD","USDC를 100 XSGD로 바꾸면?","USDC로 XSGD를 바꾸면?","USDC XSGD 1.35 이상 이하 알림","2시간 동안 0.5% 움직이면 알려줘","6시간 동안 -0.5% 움직이면 알려줘","6시간 0.5% 1% 움직이면 알려줘","100 USDC XSGD 자동 실행","5 USDC XSGD 바꾸고 싶어 서명해줘","내일 날씨 어때?","5 USDC XSGD 바꾸고 싶지 않아"]){
  test("reject unsupported/ambiguous input: "+input,()=>assert.equal(parseKorean(input,registry).type,"HELP_OR_UNKNOWN"));
}
test("registry disappearance and duplicate token symbols are not guessed",()=>{
  assert.equal(parseKorean("USDC XSGD 환율",{...registry,markets:[]}).issue,"unsupported_pair");
  assert.equal(parseKorean("USDC XSGD 환율",{...registry,tokens:[...registry.tokens,{...A,address:"0x"+"3".repeat(40)}]}).issue,"ambiguous");
});
test("context expires exactly at five minutes and is isolated by user",()=>{
  let now=NOW;const c=new NluContext(()=>now);c.remember("1",pair);
  assert.deepEqual(c.resolve("1","1.35 넘으면 알려줘",registry).pair,pair);
  assert.equal(c.resolve("2","1.35 넘으면 알려줘",registry).pair,undefined);
  now+=CONTEXT_TTL_MS;assert.equal(c.resolve("1","1.35 넘으면 알려줘",registry).pair,undefined);
});
test("context rejects unsupported explicit tokens instead of reusing a prior pair",()=>{
  const c=new NluContext(()=>NOW);c.remember("1",pair);assert.equal(c.resolve("1","DOGE/XSGD 환율",registry).type,"HELP_OR_UNKNOWN");assert.equal(c.resolve("1","1.35 넘으면 알려줘",registry).pair,undefined);
});
test("narrow follow-ups fill pair and amount; context has a hard entry bound",()=>{
  const c=new NluContext(()=>NOW,2);c.wait("1",{type:"QUOTE_QUERY",amount:"100"});assert.deepEqual(c.resolve("1","USDC/XSGD",registry),{type:"QUOTE_QUERY",pair,amount:"100"});
  c.wait("1",{type:"QUOTE_QUERY",pair});assert.equal(c.resolve("1","100.000001",registry).amount,"100.000001");
  c.remember("2",pair);c.remember("3",pair);assert.equal(c.resolve("1","1.35 넘으면 알려줘",registry).pair,undefined);
});
test("unicode minus cannot become a positive target threshold",()=>{assert.equal(parseKorean("USDC/XSGD가 −1.35 넘으면 알려줘",registry).type,"HELP_OR_UNKNOWN");});
test("vague rate conditions and direction-only movement never become different actions",()=>{
  for(const text of ["USDC/XSGD 환율 좋아지면 알려줘","USDC/XSGD 환율 알림 만들어줘","USDC/XSGD 6시간 변동 0.5% 이상 내려가면 알려줘","6시간 동안 0.5% 미만 움직이면 알려줘"])assert.equal(parseKorean(text,registry).type,"HELP_OR_UNKNOWN");
});
