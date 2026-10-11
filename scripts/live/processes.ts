import { spawn,type ChildProcess } from "node:child_process";
import { setTimeout as pause } from "node:timers/promises";
import { safeWalletCode } from "../../src/i18n/wallet.js";

export class SetupError extends Error {constructor(readonly code:string){super(code);}}
const exits=new WeakMap<ChildProcess,Promise<number>>(),closed=new WeakSet<ChildProcess>(),stops=new WeakMap<ChildProcess,Promise<void>>();
export function ownedChild(command:string,args:string[],cwd:string,env:NodeJS.ProcessEnv,ipc=false) {
  const child=spawn(command,args,{cwd,env,shell:false,windowsHide:true,stdio:ipc?["ignore","pipe","pipe","ipc"]:["ignore","pipe","pipe"]});
  void finished(child);return child;
}
/** Consume validation output without exposing test/provider logs or filling OS pipe buffers. */
export function discardOutput(child:ChildProcess) {child.stdout?.resume();child.stderr?.resume();}
export function lines(child:ChildProcess,receive:(line:string)=>void) {
  for(const stream of [child.stdout,child.stderr]) {
    let buffer="";stream?.setEncoding("utf8");stream?.on("data",(chunk:string)=>{
      buffer+=chunk;let end:number;while((end=buffer.indexOf("\n"))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);receive(line.slice(0,16000));}
      if(buffer.length>32000)buffer=buffer.slice(-16000);
    });
  }
}
export function finished(child:ChildProcess):Promise<number> {
  const existing=exits.get(child);if(existing)return existing;
  if(child.exitCode!==null||child.signalCode!==null)return Promise.resolve(child.exitCode??1);
  const result=new Promise<number>(resolve=>{child.once("error",()=>{closed.add(child);resolve(1);});child.once("exit",code=>{closed.add(child);resolve(code??1);});});exits.set(child,result);return result;
}
export function stopChild(child:ChildProcess,graceMs=20000):Promise<void> {
  const existing=stops.get(child);if(existing)return existing;const result=stop(child,graceMs);stops.set(child,result);return result;
}
async function stop(child:ChildProcess,graceMs:number) {
  if(closed.has(child)||child.exitCode!==null||child.signalCode!==null)return;
  const end=finished(child);let ended=false;void end.then(()=>{ended=true;});
  if(child.connected) {try{child.send({type:"dev:shutdown"},()=>{});}catch{/* fallback below */}}
  else if(process.platform==="win32"&&child.pid){const killer=spawn("taskkill.exe",["/PID",String(child.pid),"/T","/F"],{windowsHide:true,shell:false,stdio:"ignore"});await finished(killer);}
  else child.kill("SIGTERM");
  for(let waited=0;!ended&&waited<graceMs;waited+=50)await pause(50);
  if(!ended&&child.pid) {
    // Only this spawned child's tree; never kill by executable name or guessed PID.
    if(process.platform==="win32") {
      const killer=spawn("taskkill.exe",["/PID",String(child.pid),"/T","/F"],{windowsHide:true,shell:false,stdio:"ignore"});await finished(killer);
    }else child.kill("SIGKILL");
  }
  await end;
}
export function safeChildLine(line:string):string|undefined {
  try{
    const row=JSON.parse(line) as Record<string,unknown>;
    if(row.event==="wallet_acceptance"){
      const operation=["auth","challenge","verify","disconnect","balance","preview","prepare","confirm","cancel","submit","state","refresh","diagnostic","request"].includes(String(row.operation))?String(row.operation):"request";
      return JSON.stringify({at:new Date().toISOString(),event:"wallet_acceptance",operation,code:safeWalletCode(String(row.code)),
        ...(typeof row.user_ref==="string"&&/^[a-f0-9]{12}$/.test(row.user_ref)?{user_ref:row.user_ref}:{}),
        ...(typeof row.wallet_ref==="string"&&/^[a-f0-9]{12}$/.test(row.wallet_ref)?{wallet_ref:row.wallet_ref}:{})});
    }
    if(["startup_failed","shutdown_failed","telegram_failed","settlement_read_failed"].includes(String(row.event)))
      return JSON.stringify({at:new Date().toISOString(),event:row.event,code:safeWalletCode(String(row.code))});
  }catch{/* Raw process/provider output is intentionally not forwarded. */}
}
export async function waitFor(check:()=>Promise<boolean>,signal:AbortSignal,ms:number,code:string) {
  const deadline=Date.now()+ms;
  while(Date.now()<deadline){signal.throwIfAborted();try{if(await check())return;}catch{/* Retry only safe readiness reads. */}await pause(500,undefined,{signal});}
  throw new SetupError(code);
}
