import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { WalletFlow,supportedWallets,type WalletScreen } from "../web/wallet-flow.js";
import { WalletFlowError } from "../web/connection.js";
import { routingText,connectionError } from "../web/wallet-copy.js";
import { walletCardModel } from "../web/wallet-card.js";
import { bindWalletTheme,themeValues } from "../web/wallet-theme.js";
import type { ConnectedProvider,WalletConnection } from "../web/connector-types.js";
import type { WalletChoice } from "../web/routing.js";
const address="0x"+"a".repeat(40),uri="https://web3.okx.com/ul/connect?topic=ui-test-fixtureabcdef";
const tick=()=>new Promise<void>(r=>setImmediate(r));
function deferred<T>(){let resolve!:(v:T)=>void,reject!:(e:unknown)=>void;const promise=new Promise<T>((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
function setup(){
  const views:WalletScreen[]=[],attempts:{connection:WalletConnection;ready:(uri:string)=>void;expire:()=>void;complete:()=>void;cancelled:()=>boolean}[]=[],calls:string[]=[];
  let verification=deferred<void>(),invalidateBlock:Promise<void>|undefined,throwHandoff=false;
  const provider:ConnectedProvider={accounts:[address],chainId:11155111,session:{},connect:async()=>{},request:async()=>{throw Error("No financial request expected");},on:()=>{},disconnect:async()=>{}};
  const flow=new WalletFlow({view:s=>views.push(s),pending:()=>{},cancelled:()=>calls.push("cancelled"),error:()=>calls.push("error"),
    invalidate:async()=>{calls.push("invalidate");await invalidateBlock;},connected:()=>calls.push("connected"),
    create:choice=>{
      let live=true;const pending=deferred<ConnectedProvider>();
      const attempt={connection:undefined as unknown as WalletConnection,ready:(_uri:string)=>{},expire:()=>{},complete:()=>pending.resolve(provider),cancelled:()=>!live};
      attempt.connection={choice,environment:"ios",handoffUri:uri,start:(onUri,onExpired)=>{attempt.ready=onUri;attempt.expire=onExpired;return pending.promise;},
        assert:()=>{if(!live)throw new WalletFlowError("WALLET_CONNECT_CANCELLED");},assertActive:()=>{if(!live)throw new WalletFlowError("WALLET_CONNECT_CANCELLED");},cancel:()=>{live=false;pending.reject(new WalletFlowError("WALLET_CONNECT_CANCELLED"));}};
      // Rejection may occur before start() in a rapid UI cancel; fixture consumes that case.
      void pending.promise.catch(()=>{});attempts.push(attempt);return attempt.connection;
    },
    open:(connection,value)=>{calls.push("open:"+connection.choice);assert.equal(value,uri);if(throwHandoff)throw Error("fixture handoff failure");},
    verify:async(_provider,guard,onRequest)=>{guard();calls.push("verify");onRequest();await verification.promise;guard();},
  });
  return {flow,views,attempts,calls,verification,block:(v:Promise<void>)=>{invalidateBlock=v;},handoffFails:()=>{throwHandoff=true;},resetVerify:()=>{verification=deferred<void>();return verification;},
    select:async(choice:WalletChoice="okx")=>{await flow.choose();void flow.select(choice);await tick();const a=attempts.at(-1)!;a.ready(uri);return a;},
    connected:async()=>{const a=attempts.at(-1)!;a.complete();await tick();},
  };
}
test("connect immediately opens selecting surface while backend invalidation is pending",async()=>{
  const f=setup(),block=deferred<void>();f.block(block.promise);const choosing=f.flow.choose();
  assert.equal(f.flow.screen.step,"selecting");assert.equal(f.flow.screen.busy,true);assert.equal(f.attempts.length,0);
  block.resolve();await choosing;assert.equal(f.flow.screen.busy,undefined);await f.flow.stop();
});
test("selector exposes only supported OKX Wallet and MetaMask options",()=>{assert.deepEqual(supportedWallets,["okx","metamask"]);});
for(const choice of supportedWallets)test(choice+" has dedicated preparing/opening/waiting states and a synchronous explicit handoff",async()=>{
  const f=setup(),a=await f.select(choice);assert.equal(f.flow.screen.step,"opening");assert.equal(f.flow.screen.choice,choice);
  assert(f.views.some(s=>s.step==="preparing"&&s.choice===choice));assert(!f.calls.some(c=>c.startsWith("open:")));assert(!f.calls.includes("verify"));
  f.flow.handoff();assert.equal(f.flow.screen.step,"waiting");assert(f.calls.includes("open:"+choice));assert(!a.cancelled());await f.flow.stop();
});
test("cancel closes the sheet, retires pairing and leaves an obvious cancelled result",async()=>{
  const f=setup(),a=await f.select();await f.flow.stop();assert.equal(f.flow.screen.step,"closed");assert(a.cancelled());assert(f.calls.includes("cancelled"));
  a.complete();await tick();assert(!f.calls.includes("connected"));assert.equal(f.flow.screen.step,"closed");
});
test("failed app handoff displays recovery and allows a fresh attempt",async()=>{
  const f=setup(),a=await f.select();f.handoffFails();f.flow.handoff();await tick();assert.equal(f.flow.screen.step,"error");assert.equal(f.flow.screen.code,"HANDOFF_FAILED");assert(a.cancelled());
  await f.select();assert.equal(f.attempts.length,2);assert.equal(f.flow.screen.step,"opening");await f.flow.stop();
});
test("pairing timeout retires the attempt and displays a retry state",async()=>{
  const f=setup(),a=await f.select();a.expire();await tick();assert.equal(f.flow.screen.step,"error");assert.equal(f.flow.screen.code,"CONNECTION_TIMEOUT");assert(a.cancelled());await f.flow.stop();
});
test("ownership explanation is a separate step before any signature request",async()=>{
  const f=setup();await f.select();await f.connected();assert.equal(f.flow.screen.step,"ownership");assert(!f.calls.includes("verify"));
  for(const m of Object.values(routingText)){assert(m.ownershipNote);assert(m.verify);}
  const verifying=f.flow.verify();assert(f.calls.includes("verify"));assert.equal(f.flow.screen.step,"verifying");f.verification.resolve();await verifying;f.flow.cancel();
});
test("verified ownership produces explicit success and closing preserves the connected provider",async()=>{
  const f=setup(),a=await f.select();await f.connected();const work=f.flow.verify();f.verification.resolve();await work;
  assert.equal(f.flow.screen.step,"success");assert.equal(f.flow.screen.address,address);f.flow.close();assert.equal(f.flow.screen.step,"closed");assert(!a.cancelled());f.flow.cancel();
});
test("ownership rejection never shows success and offers a fresh connection",async()=>{
  const f=setup();await f.select();await f.connected();const work=f.flow.verify();f.verification.reject(new WalletFlowError("OWNERSHIP_REJECTED"));await work;
  assert.equal(f.flow.screen.step,"error");assert.equal(f.flow.screen.code,"OWNERSHIP_REJECTED");assert(!f.views.some(s=>s.step==="success"));await f.flow.stop();
});
test("cancel during ownership cannot produce late success or overwrite a new selection",async()=>{
  const f=setup();await f.select();await f.connected();const old=f.flow.verify();await f.flow.stop();await f.select("metamask");f.verification.resolve();await old;
  assert.equal(f.flow.screen.choice,"metamask");assert.equal(f.flow.screen.step,"opening");assert(!f.views.some(s=>s.step==="success"));await f.flow.stop();
});
test("old URI callbacks cannot replace a new wallet's screen",async()=>{
  const f=setup(),old=await f.select();await f.select("metamask");old.ready("stale");old.complete();await tick();assert.equal(f.flow.screen.choice,"metamask");assert.equal(f.flow.screen.uri,uri);await f.flow.stop();
});
test("lost connection clears visible success without creating another pairing",async()=>{
  const f=setup(),a=await f.select();await f.connected();f.flow.lost();assert.equal(f.flow.screen.step,"error");assert.equal(f.flow.screen.code,"CONNECTION_LOST");assert(a.cancelled());assert.equal(f.attempts.length,1);await f.flow.stop();
});
test("connected card retains full address separately from its shortened display",()=>{
  const empty=walletCardModel("ko");assert(!empty.connected);assert.equal(empty.address,"");
  const connected=walletCardModel("ko",address);assert(connected.connected);assert.equal(connected.address,address);assert.equal(connected.shortAddress,"0xaaaa…aaaa");assert.equal(connected.network,"Sepolia Testnet");
});
for(const scheme of ["light","dark"] as const)test(scheme+" Telegram theme applies safe colors and updates on themeChanged",()=>{
  const values=new Map<string,string>();let callback=()=>{},removed=false;
  const root={dataset:{} as Record<string,string>,style:{setProperty:(k:string,v:string)=>values.set(k,v),removeProperty:(k:string)=>values.delete(k)}};
  const theme={colorScheme:scheme,themeParams:{bg_color:scheme==="dark"?"#17212b":"#ffffff",button_color:"#2481cc"},onEvent:(name:string,cb:()=>void)=>{assert.equal(name,"themeChanged");callback=cb;},offEvent:()=>{removed=true;}};
  const cleanup=bindWalletTheme(theme,root as unknown as HTMLElement);assert.equal(root.dataset.theme,scheme);assert.equal(values.get("--tg-theme-bg-color"),theme.themeParams.bg_color);
  theme.themeParams.bg_color="#123456";callback();assert.equal(values.get("--tg-theme-bg-color"),"#123456");cleanup();assert(removed);
});
test("theme input cannot inject CSS and UI errors never expose raw provider messages",()=>{
  assert.deepEqual(themeValues({themeParams:{bg_color:"url(https://bad.example)",text_color:"red;display:none"}}).values,{});
  for(const language of ["ko","en"] as const)for(const code of ["CONNECTION_TIMEOUT","NETWORK_MISMATCH","OWNERSHIP_REJECTED","secret-provider-payload"])assert(!connectionError(language,code).includes(code));
});
test("native modal provides keyboard dismissal, focus management and reduced-motion styling",()=>{
  const picker=readFileSync("web/wallet-picker.ts","utf8"),css=readFileSync("web/app.css","utf8");
  assert.match(picker,/createElement\("dialog"\)/);assert.match(picker,/dialog\.showModal\(\)/);assert.match(picker,/dialog\.addEventListener\("cancel"/);assert.match(picker,/opener\.focus\(\)/);assert.match(css,/prefers-reduced-motion/);assert.match(css,/safe-area-inset-bottom/);assert.match(css,/min-height:48px/);
});
