import { createServer,request } from "node:http";
import { readFileSync,writeFileSync,existsSync,mkdirSync,rmSync } from "node:fs";
import { resolve,dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";
import type { ChildProcess } from "node:child_process";
import { loadConfig } from "../src/config/index.js";
import { preflight,setupAction } from "../src/wallet/preflight.js";
import { liveSummary } from "./live/report.js";
import { readEnvironment,liveEnvironment,projectIdValid,writeState,clearState,alive } from "./live/environment.js";
import { ensureCloudflared,tunnelEnvironment,tunnelArgs,parseTunnelOrigin } from "./live/tunnel.js";
import { syncDevelopmentMenu } from "./live/telegram.js";
import { ownedChild,finished,lines,stopChild,safeChildLine,waitFor,SetupError } from "./live/processes.js";
import { sourceFingerprint,StableSourceChange } from "./live/reload.js";

export function localHealth(port:number,origin:string,connectorReady?:boolean):Promise<boolean> {
  return new Promise(resolve=>{
    const req=request({host:"127.0.0.1",port,path:"/api/health",headers:{host:new URL(origin).host},timeout:3000},res=>{
      let text="";res.on("data",chunk=>{text+=String(chunk);if(text.length>10000)req.destroy();});res.on("end",()=>{
        try{const h=JSON.parse(text);resolve(res.statusCode===200&&h.app==="sera-korea-fx-bot"&&h.origin===origin&&h.chainId===11155111&&h.executionEnabled===false&&(connectorReady===undefined||h.connectorReady===connectorReady));}catch{resolve(false);}
      });
    });req.on("timeout",()=>req.destroy());req.on("error",()=>resolve(false));req.end();
  });
}
export async function runLive(root:string,checkOnly=false,parent:NodeJS.ProcessEnv=process.env) {
  const cancel=new AbortController(),children=new Set<ChildProcess>(),expectedStops=new Set<ChildProcess>(),runId=randomBytes(16).toString("hex");
  const dir=resolve(root,".dev-live"),lock=resolve(dir,"launcher.lock");let ownsLock=false,app:ChildProcess|undefined,tunnel:ChildProcess|undefined;
  let bootstrap:ReturnType<typeof createServer>|undefined,origin="",unexpected=false,shutting=false;
  const stop=()=>cancel.abort();
  // Consume Ctrl+C ourselves in an interactive Windows terminal, so npm/console groups
  // do not kill the child before its private IPC shutdown can drain SQLite work.
  const wasRaw=process.stdin.isRaw,interactive=Boolean(process.stdin.isTTY&&!checkOnly);
  const keypress=(key:Buffer)=>{if(key.includes(3))stop();};
  if(interactive){process.stdin.setRawMode(true);process.stdin.on("data",keypress);process.stdin.resume();}
  const ipcStop=(message:unknown)=>{if(message&&typeof message==="object"&&"type" in message&&message.type==="dev:shutdown")stop();};
  for(const signal of ["SIGINT","SIGTERM"] as const)process.once(signal,stop);
  if(process.send){process.on("message",ipcStop);process.once("disconnect",stop);}
  const attach=(child:ChildProcess,critical=false)=>{
    children.add(child);void finished(child).then(()=>{if(critical&&!shutting&&!expectedStops.has(child)){unexpected=true;stop();}});return child;
  };
  const build=async(env:NodeJS.ProcessEnv)=>{
    console.info("… Running tests, typecheck and build automatically");
    const steps:[string,string[]][]=[
      ["Tests",["--import","tsx","--test","tests/*.test.ts"]],
      ["Typecheck",[resolve(root,"node_modules/typescript/bin/tsc"),"--noEmit"]],
      ["App build",[resolve(root,"node_modules/typescript/bin/tsc"),"-p","tsconfig.build.json"]],
      ["Signing page build",[resolve(root,"scripts/build-web.mjs")]],
    ];
    for(const [label,args] of steps){
      cancel.signal.throwIfAborted();const child=attach(ownedChild(process.execPath,args,root,{...tunnelEnvironment(env),SERA_NETWORK:"sepolia",ENABLE_MAINNET:"false",ENABLE_TESTNET_EXECUTION:"false"}));
      const abort=()=>{void stopChild(child);};cancel.signal.addEventListener("abort",abort,{once:true});
      try{if(await finished(child)!==0)throw new SetupError(label==="Tests"?"TESTS_FAILED":label==="Typecheck"?"TYPECHECK_FAILED":"BUILD_FAILED");}finally{cancel.signal.removeEventListener("abort",abort);}
      console.info("✓ "+label);
    }
    console.info("✓ Build ready");
  };
  const launch=async(env:NodeJS.ProcessEnv)=>{
    let ready=false;
    app=attach(ownedChild(process.execPath,["--use-system-ca",resolve(root,"dist/index.js")],root,env,true),true);
    const child=app;child.on("message",message=>{if(message&&typeof message==="object"&&"type" in message&&message.type==="dev:ready")ready=true;});
    lines(child,line=>{const safe=safeChildLine(line);if(safe)console.info(safe);});
    await waitFor(async()=>{if(child.exitCode!==null||child.signalCode!==null)throw new SetupError("APP_START");return ready&&await localHealth(Number(env.SIGNING_PORT??8787),origin,projectIdValid(env.WALLETCONNECT_PROJECT_ID??""));},cancel.signal,60000,"APP_START");
    console.info("✓ Telegram bot running · signing page available · execution OFF");
  };
  const checks=async(env:NodeJS.ProcessEnv)=>{
    const result=await preflight(env,{root,development:true});console.info("\n"+liveSummary(result.checks));
    if(result.exitCode===0)console.info("\nREADY FOR TELEGRAM WALLET TEST\nOpen your bot → /wallet. Real Reown pairing/ownership are still owner tests. Execution is OFF.");
    else if(result.checks.some(c=>c.code==="REOWN_PROJECT"&&c.status==="FAIL"))console.info("\nNEXT ACTION: Create your own development project in Reown Dashboard.\nSave its Project ID in .env → WALLETCONNECT_PROJECT_ID. "+(checkOnly?"This one-shot check now stops; normal dev:live watches for the saved ID.":"This window reloads automatically."));
    else console.info("\nSetup needs attention; follow the action shown above. Execution remains OFF.");
    process.send?.({type:"dev:checked",exitCode:result.exitCode,origin,children:[...children].filter(c=>c.exitCode===null&&c.signalCode===null).map(c=>c.pid)});
    return result.exitCode;
  };
  try {
    console.info("FX Alert Bot — Live Test Setup\nRead-only Sepolia · mainnet and execution forced OFF\n");
    mkdirSync(dir,{recursive:true});
    if(existsSync(lock)){
      let old:{pid:number};try{old=JSON.parse(readFileSync(lock,"utf8"));}catch{throw new SetupError("LIVE_LOCK");}
      if(Number.isInteger(old.pid)&&old.pid>0&&!alive(old.pid))rmSync(lock);else throw new SetupError("LIVE_RUNNING");
    }
    writeFileSync(lock,JSON.stringify({pid:process.pid,runId}),{flag:"wx",mode:0o600});ownsLock=true;
    let base=readEnvironment(root,parent);
    // The bootstrap origin is used only for validation, never for a bot process or Telegram link.
    const validation=liveEnvironment(base,"https://local-validation.trycloudflare.com");
    if(!projectIdValid(validation.WALLETCONNECT_PROJECT_ID??""))validation.WALLETCONNECT_PROJECT_ID="";
    let config;try{config=loadConfig(validation);}catch{throw new SetupError("CONFIG_INVALID");}
    if(!/^\d{5,20}:[A-Za-z0-9_-]{30,80}$/.test(config.botToken))throw new SetupError("TG_CONFIG");
    if(!config.wallet.rpc)throw new SetupError("RPC_CONFIG");
    const sourceChanges=new StableSourceChange(sourceFingerprint(root));
    await build(validation);
    console.info("… Locating Cloudflare (downloads a checksum-verified official Windows binary if needed)");
    const executable=await ensureCloudflared(root,base,cancel.signal);cancel.signal.throwIfAborted();
    // A 503 bootstrap listener reserves our port before creating the tunnel. It has no auth/API route.
    bootstrap=createServer((_req,res)=>{res.writeHead(503,{"content-type":"text/plain"});res.end("Starting live setup");});
    await new Promise<void>((resolve,reject)=>{bootstrap!.once("error",()=>reject(new SetupError("PORT_BUSY")));bootstrap!.listen(config.wallet.port,"127.0.0.1",resolve);});
    tunnel=attach(ownedChild(executable,tunnelArgs(root,config.wallet.port),root,tunnelEnvironment(base)),true);
    let connected=false,lastTunnelError=0;
    lines(tunnel,line=>{
      origin ||= parseTunnelOrigin(line)??"";
      if(!connected&&line.includes("Registered tunnel connection")){connected=true;console.info("✓ Cloudflare edge connection registered");}
      if(line.includes("ERR")&&Date.now()-lastTunnelError>15000){lastTunnelError=Date.now();
        const code=/certificate|x509|tls/i.test(line)?"TUNNEL_TLS":/timeout|deadline|dial/i.test(line)?"TUNNEL_NETWORK":"TUNNEL_CONNECT";console.info("WARN "+code+" · Cloudflare connection has not settled; retrying safely");}
    });
    console.info("… Creating the temporary HTTPS tunnel");
    await waitFor(async()=>!!origin,cancel.signal,60000,"TUNNEL_START");
    console.info("✓ HTTPS tunnel created (the address is applied automatically)");
    await new Promise<void>(resolve=>bootstrap!.close(()=>resolve()));bootstrap=undefined;
    const effective=()=>{
      const env=liveEnvironment(base,origin);env.SIGNING_PORT=String(config.wallet.port);
      // Bad/missing owner configuration never reaches the real relay; preflight still reports the original error.
      if(!projectIdValid(env.WALLETCONNECT_PROJECT_ID??""))env.WALLETCONNECT_PROJECT_ID="";
      return env;
    };
    await launch(effective());
    writeState(root,{pid:process.pid,origin,port:config.wallet.port,runId,startedAt:new Date().toISOString()});
    try{if(await syncDevelopmentMenu(config.botToken,origin,cancel.signal))console.info("✓ Existing temporary Telegram menu URL updated automatically");}catch{console.info("WARN TG_READ · optional menu check failed; full preflight will diagnose it");}
    await waitFor(async()=>{try{const r=await fetch(origin+"/api/health",{signal:AbortSignal.any([cancel.signal,AbortSignal.timeout(5000)]),redirect:"error"});const h=await r.json() as Record<string,unknown>;return r.ok&&h.origin===origin&&h.app==="sera-korea-fx-bot"&&h.executionEnabled===false&&h.chainId===11155111;}catch{return false;}},cancel.signal,60000,"HTTPS_READ");
    console.info("✓ Local and public signing page reachable");
    let result=await checks({...effective(),WALLETCONNECT_PROJECT_ID:base.WALLETCONNECT_PROJECT_ID??""});
    if(checkOnly)return result;
    console.info("\nKeep this one window open. Source changes rebuild and reload the bot/page assets automatically. Open a fresh Telegram wallet screen after an update. Ctrl+C stops the bot and tunnel.");
    let previous=base.WALLETCONNECT_PROJECT_ID??"";
    while(!cancel.signal.aborted){
      await pause(1000,undefined,{signal:cancel.signal});
      let next:NodeJS.ProcessEnv;try{next=readEnvironment(root,parent);}catch{continue;}
      const project=next.WALLETCONNECT_PROJECT_ID??"",projectChanged=project!==previous;
      let sourceChanged=false;try{sourceChanged=sourceChanges.poll(sourceFingerprint(root));}catch{continue;}
      if(!projectChanged&&!sourceChanged)continue;previous=project;
      if(project&&!projectIdValid(project))console.info(setupAction("REOWN_PROJECT"));
      console.info("… "+(projectChanged?"Project ID setting":"Source files")+" changed; rebuilding and reloading automatically");
      if(app){expectedStops.add(app);await stopChild(app);}base=next;await build(effective());await launch(effective());
      result=await checks({...effective(),WALLETCONNECT_PROJECT_ID:base.WALLETCONNECT_PROJECT_ID??""});
    }
    return result;
  }catch(error){
    if(cancel.signal.aborted&&!unexpected)return 0;
    const code=error instanceof SetupError?error.code:unexpected?"CHILD_EXIT":"CONFIG_INVALID";
    console.error("FAIL "+code+"\n"+setupAction(code));return 1;
  }finally{
    shutting=true;cancel.abort();
    if(bootstrap)await new Promise<void>(resolve=>bootstrap!.close(()=>resolve()));
    // Close public ingress first, then drain the bot's polling/monitor/database work over private IPC.
    if(tunnel)await stopChild(tunnel);if(app)await stopChild(app);
    for(const child of children)await stopChild(child);
    if(ownsLock){clearState(root,runId);try{if(JSON.parse(readFileSync(lock,"utf8")).runId===runId)rmSync(lock);}catch{}}
    for(const signal of ["SIGINT","SIGTERM"] as const)process.removeListener(signal,stop);
    process.removeListener("message",ipcStop);process.removeListener("disconnect",stop);
    if(interactive){process.stdin.removeListener("data",keypress);process.stdin.setRawMode(Boolean(wasRaw));process.stdin.pause();}
    console.info("✓ Live setup stopped; owned child processes closed; .env unchanged");
  }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");process.chdir(root);
  process.exitCode=await runLive(root,process.argv.includes("--check"));if(process.connected)process.disconnect();
}
