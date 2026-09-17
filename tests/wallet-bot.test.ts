import test from "node:test";
import assert from "node:assert/strict";
import { BotController } from "../src/bot/controller.js";
import { fakeMarkets,NOW } from "./helpers.js";
import { fixture } from "./trade-helpers.js";
import type { View } from "../src/bot/view.js";

for(const language of ["ko","en"] as const)test(language+" connected wallet card opens existing read-only balances and disconnected card has no balance action",async()=>{
  const f=await fixture();try{
    f.config.wallet.enabled=false;await f.store.language("1",language);const views:View[]=[];
    const bot=new BotController(f.store,fakeMarkets(),f.config,()=>NOW,f.chain),out={reply:async(v:View)=>{views.push(v);}};
    await bot.handle({userId:"1",text:"/wallet"},out);const card=views.at(-1)!;
    assert.match(card.text,language==="ko"?/● 연결됨/:/● Connected/);assert(card.buttons!.flat().some(b=>b.data==="wallet:balance"));
    await bot.handle({userId:"1",callback:"wallet:balance"},out);assert.match(views.at(-1)!.text,/USDC: 1000/);assert.equal(f.submitted(),0);
    await bot.handle({userId:"1",callback:"wallet:disconnect"},out);await bot.handle({userId:"1",text:"/wallet"},out);
    assert(!views.at(-1)!.buttons!.flat().some(b=>b.data==="wallet:balance"));assert.equal(f.store.wallet.address("1"),undefined);
  }finally{f.store.close();}
});
test("missing Reown keeps Korean read-only commands and the setup page available, without execution",async()=>{
  const f=await fixture();try{
    f.config.wallet.enabled=false;f.config.wallet.projectId="";f.config.wallet.ready=false;f.config.wallet.uiReady=true;
    const views:View[]=[],bot=new BotController(f.store,fakeMarkets(),f.config,()=>NOW,f.chain),out={reply:async(v:View)=>{views.push(v);}};
    for(const text of ["/start","/markets","/rate USDC EURC","/quote 100 USDC EURC","/alpha"]){const before=views.length;await bot.handle({userId:"1",text},out);assert(views.length>before);assert(views.at(-1)!.text.length>0);}
    const before=views.length;await bot.handle({userId:"1",text:"/wallet"},out);assert(views.slice(before).some(v=>v.buttons?.flat().some(b=>b.webApp==="https://bot.example")));
    await bot.handle({userId:"1",text:"/swap"},out);assert.match(views.at(-1)!.text,/조회 모드/);assert.equal(f.submitted(),0);
  }finally{f.store.close();}
});
for(const language of ["ko","en"] as const)test(language+" wallet, actual balance, shared quote/swap entry and disconnect",async()=>{
  const f=await fixture();try{
    await f.store.language("1",language);const market=fakeMarkets(),views:View[]=[];
    const bot=new BotController(f.store,market,f.config,()=>NOW,f.chain),out={reply:async(v:View)=>{views.push(v);}};
    await bot.handle({userId:"1",text:"/wallet"},out);assert.match(views.at(-1)!.text,language==="ko"?/개인키/:/private key/);
    assert(views.at(-1)!.buttons!.flat().some(b=>b.webApp==="https://bot.example"));
    await bot.handle({userId:"1",text:"/balance"},out);assert.match(views.at(-1)!.text,/USDC: 1000/);assert.match(views.at(-1)!.text,/Vault/);
    for(const command of ["/quote 100 USDC EURC","/swap 100 USDC EURC"]){await bot.handle({userId:"1",text:command},out);const entry=views.at(-1)!.buttons!.flat().find(b=>b.data.startsWith("trade:"))!;assert(entry);
      await bot.handle({userId:"1",callback:entry.data},out);assert.match(views.at(-1)!.buttons![0]![0]!.webApp!,/^https:\/\/bot.example\/#intent=/);
      await bot.handle({userId:"2",callback:entry.data},out);assert(!views.at(-1)!.buttons);}
    assert.equal(f.submitted(),0);f.config.wallet.enabled=false;await bot.handle({userId:"1",text:"/swap"},out);assert.match(views.at(-1)!.text,language==="ko"?/조회 모드/:/Read-only/);
    await bot.handle({userId:"1",callback:"wallet:disconnect"},out);assert.equal(f.store.wallet.address("1"),undefined);
  }finally{f.store.close();}
});
