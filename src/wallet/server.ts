import { createServer,type IncomingMessage,type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import type { Config } from "../config/index.js";
import type { Store,Language } from "../database/store.js";
import type { ChainReads } from "./chain.js";
import { validateTelegram,WalletAuth } from "./auth.js";
import { AppError,errorCode } from "../utils/errors.js";
import type { TradeService } from "../trades/service.js";
import { tradeView,previewView } from "../trades/view.js";
import { walletFailure,walletText,safeWalletCode } from "../i18n/wallet.js";
import { acceptanceLog } from "./diagnostics.js";
import type { Hex } from "viem";
import { createHash,randomUUID } from "node:crypto";
import { entryFromOrigin } from "../analytics/types.js";
const id=z.string().regex(/^[a-f0-9]{64}$/),signature=z.string().regex(/^0x[0-9a-fA-F]{130}$/);
async function body(req:IncomingMessage) {
  if(req.headers["content-type"]!=="application/json")throw new AppError("AUTH_INVALID");
  let size=0;const chunks:Buffer[]=[];
  for await(const chunk of req) {size+=chunk.length;if(size>20000)throw new AppError("AUTH_INVALID");chunks.push(chunk);}
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}
export function signingServer(config:Config,store:Store,chain:ChainReads,trades:TradeService,now=Date.now,refresh?: (user:string)=>Promise<void>) {
  const auth=new WalletAuth(store.wallet,config.wallet,a=>chain.eoa(a),now),limits=new Map<string,{at:number;count:number}>();
  const handler=async(req:IncomingMessage,res:ServerResponse)=>{
    let language:Language="ko";
    let userRef:string|undefined,walletRef:string|undefined,operation="request";
    const send=(status:number,value:unknown)=>{res.writeHead(status,{"content-type":"application/json; charset=utf-8"});res.end(JSON.stringify(value));};
    res.setHeader("cache-control","no-store");res.setHeader("x-content-type-options","nosniff");res.setHeader("referrer-policy","no-referrer");
    res.setHeader("permissions-policy","camera=(), microphone=(), geolocation=()");
    res.setHeader("content-security-policy","default-src 'self'; script-src 'self' https://telegram.org; style-src 'self' 'unsafe-inline'; font-src 'self' https://fonts.reown.com; img-src 'self' data: https://*.walletconnect.com https://*.reown.com https://*.walletconnect.org https://api.web3modal.com https://api.web3modal.org; connect-src 'self' https://*.walletconnect.com wss://*.walletconnect.com https://*.walletconnect.org wss://*.walletconnect.org https://*.reown.com wss://*.reown.com https://*.reown.org https://*.walletconnect.network https://api.web3modal.com https://api.web3modal.org; frame-src 'self' https://verify.walletconnect.com https://verify.walletconnect.org; frame-ancestors https://web.telegram.org; object-src 'none'; base-uri 'none'; form-action 'none'");
    try {
      const path=req.url??"";
      operation=path.startsWith("/api/")?path.slice(5):"request";
      if(req.method==="GET"&&path==="/api/health") {
        if(req.headers.host!==new URL(config.wallet.origin).host)throw new AppError("AUTH_INVALID");
        send(200,{app:"sera-korea-fx-bot",origin:config.wallet.origin,chainId:config.chainId,executionEnabled:config.wallet.enabled,connectorReady:config.wallet.ready});return;
      }
      if(req.method==="GET"&&["/","/app.js","/app.css","/okx-bridge.html","/okx-bridge.js","/wallet-icon.png","/THIRD_PARTY_LICENSES.txt"].includes(path)) {
        if(path==="/okx-bridge.html")res.setHeader("content-security-policy","default-src 'none'; script-src 'self'; connect-src wss://wsdexpri.okx.com/ws/v1/wallet-connect-relay wss://wsdexpri.okx.ac/ws/v1/wallet-connect-relay wss://wsdexpri.coinall.ltd/ws/v1/wallet-connect-relay; img-src 'self'; frame-ancestors 'self'; object-src 'none'; base-uri 'none'; form-action 'none'");
        const name=path==="/"?"index.html":path.slice(1);
        const file=await readFile(resolve("dist/web",name));
        res.setHeader("content-type",name.endsWith("html")?"text/html; charset=utf-8":name.endsWith("css")?"text/css":name.endsWith("png")?"image/png":name.endsWith("txt")?"text/plain; charset=utf-8":"text/javascript");res.end(file);return;
      }
      if(req.method!=="POST"||req.headers.origin!==config.wallet.origin||!(req.headers.host===new URL(config.wallet.origin).host))throw new AppError("AUTH_INVALID");
      const key=req.socket.remoteAddress??"unknown",bucket=limits.get(key);
      if(!bucket||now()-bucket.at>=60000){if(limits.size>1000)limits.clear();limits.set(key,{at:now(),count:1});}
      else if(++bucket.count>120)throw new AppError("RATE_LIMITED");
      const data=await body(req);
      if(path==="/api/auth") {
        const {initData}=z.object({initData:z.string().max(12000)}).strict().parse(data);
        const telegram=validateTelegram(initData,config.botToken,now());
        const user=await store.user(telegram.user);if(!user)throw new AppError("AUTH_INVALID");
        language=user.language;
        const session=store.wallet.newSession(user.id,telegram.hash,config.wallet.sessionMs);
        acceptanceLog("auth","TG_SESSION_CREATED",user.id);
        res.setHeader("set-cookie",`__Host-sera=${session.token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${config.wallet.sessionMs/1000}`);
        send(200,{csrf:session.csrf,language,userId:user.id,projectId:config.wallet.projectId,origin:config.wallet.origin,ready:config.wallet.ready,enabled:config.wallet.enabled&&config.wallet.users.includes(user.id)});return;
      }
      const token=req.headers.cookie?.match(/(?:^|;\s*)__Host-sera=([a-f0-9]{64})(?:;|$)/)?.[1];
      const s=token?store.wallet.session(token):undefined;if(!s)throw new AppError("AUTH_STALE");
      language=(await store.user(s.user_id))?.language??"ko";
      userRef=s.user_id;walletRef=s.wallet??undefined;
      auth.csrf(s,String(req.headers["x-csrf-token"]??""));
      if(["/api/preview","/api/prepare","/api/challenge","/api/submit","/api/refresh","/api/diagnostic"].includes(path)) {
        const k=s.user_id+path,b=limits.get(k);
        if(!b||now()-b.at>=60000)limits.set(k,{at:now(),count:1});else if(++b.count>6)throw new AppError("RATE_LIMITED");
      }
      if(path==="/api/state"||path==="/api/refresh") {
        z.object({}).strict().parse(data);
        if(path==="/api/refresh"){await refresh?.(s.user_id);acceptanceLog("refresh","OK",userRef,walletRef);}
        send(200,{wallet:store.wallet.current(s).wallet,linked:store.wallet.address(s.user_id),userId:s.user_id,trades:store.wallet.list(s.user_id).map(r=>tradeView(r,language))});return;
      }
      if(path==="/api/diagnostic") {
        const d=z.object({code:z.enum(["MINI_APP_OPENED","WALLET_RETURNED","WALLET_CONNECTED","WALLET_CONNECT_STARTED","WALLET_CONNECT_CANCELLED","OWNERSHIP_REJECTED","PERMIT_REJECTED","INTENT_REJECTED","NETWORK_MISMATCH"]),eventId:z.uuid().optional()}).strict().parse(data);
        acceptanceLog("diagnostic",d.code,userRef,walletRef);
        if(d.code==="WALLET_CONNECT_STARTED"){
          const key=d.eventId??createHash("sha256").update(s.id+":connect").digest("hex");
          store.analytics.activity(s.user_id,{origin:"button",key});
          store.analytics.record(s.user_id,"wallet_connect_started",{origin:"button",key});
        }
        send(200,{ok:true});return;
      }
      if(path==="/api/challenge") {const d=z.object({address:z.string().regex(/^0x[0-9a-fA-F]{40}$/),chainId:z.number().int()}).strict().parse(data);send(200,await auth.challenge(s,d.address,d.chainId));return;}
      if(path==="/api/verify") {
        const d=z.object({id,signature}).strict().parse(data);const wallet=await auth.verify(s,d.id,d.signature as Hex);
        acceptanceLog("verify","OWNERSHIP_VERIFIED",userRef,wallet);
        const key=createHash("sha256").update(d.id).digest("hex");
        store.analytics.activity(s.user_id,{origin:"button",key});
        store.analytics.record(s.user_id,"wallet_verified",{origin:"button",key});
        send(200,{wallet});return;
      }
      if(path==="/api/disconnect") {z.object({}).strict().parse(data);store.wallet.disconnect(s.user_id);send(200,{message:walletText[language].disconnected});return;}
      if(path==="/api/balance") {z.object({}).strict().parse(data);if(!s.wallet)throw new AppError("WALLET_REQUIRED");try{send(200,await chain.balances(s.wallet));}catch(e){throw e instanceof AppError?e:new AppError("RPC_UNAVAILABLE");}return;}
      if(path==="/api/prepare") {
        const d=z.object({intent:z.string().regex(/^[A-Za-z0-9_-]{11}$/)}).strict().parse(data);
        const intent=await store.intent(d.intent,s.user_id);if(!intent)throw new AppError("TRADE_STATE");
        const row=await trades.prepare(s,d.intent,intent.origin);
        send(200,tradeView(row,language));
        if(row.state==="REVIEW")store.analytics.record(s.user_id,"trade_review_viewed",{origin:"button",entry:entryFromOrigin(row.origin),entityId:row.id,parentId:row.intent_id,key:row.id});
        return;
      }
      if(path==="/api/preview") {
        const d=z.object({intent:z.string().regex(/^[A-Za-z0-9_-]{11}$/)}).strict().parse(data);
        const provenance=store.analytics.quoteContext(s.user_id,d.intent);
        const context={...provenance,origin:"button" as const,key:randomUUID()};
        if(provenance){store.analytics.activity(s.user_id,context);store.analytics.record(s.user_id,"quote_requested",context);}
        const p=await trades.preview(s,d.intent);acceptanceLog("preview","OK",userRef,walletRef);send(200,previewView(p,language));
        if(provenance)store.analytics.record(s.user_id,"fresh_quote_viewed",{...context,entityId:d.intent});return;
      }
      if(path==="/api/confirm") {const d=z.object({id,version:id}).strict().parse(data);send(200,trades.confirm(s,d.id,d.version));return;}
      if(path==="/api/cancel") {const d=z.object({id}).strict().parse(data);trades.cancel(s,d.id);send(200,{ok:true});return;}
      if(path==="/api/submit") {const d=z.object({id,version:id,signature,permitSignature:signature}).strict().parse(data);send(200,tradeView(await trades.submit(s,d.id,d.version,d.signature as Hex,d.permitSignature as Hex),language));return;}
      throw new AppError("AUTH_INVALID");
    } catch(e) {const code=safeWalletCode(e instanceof AppError?errorCode(e):"AUTH_INVALID");acceptanceLog(operation,code,userRef,walletRef);send(code==="RATE_LIMITED"?429:400,{code,message:walletFailure(language,code)});}
  };
  const server=createServer((req,res)=>{void handler(req,res);});server.requestTimeout=20000;server.headersTimeout=10000;server.maxHeadersCount=30;
  return server;
}
