import { readFileSync,existsSync,mkdirSync,writeFileSync,renameSync,rmSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";

export const isQuickOrigin=(value:unknown):value is string=>typeof value==="string"&&/^https:\/\/[a-z0-9]+(?:-[a-z0-9]+)*\.trycloudflare\.com$/.test(value)&&new URL(value).hostname.length<=253;
export const projectIdValid=(value:string)=>/^[a-f0-9]{32}$/i.test(value);
export function readEnvironment(root:string,parent:NodeJS.ProcessEnv=process.env):NodeJS.ProcessEnv {
  const file=resolve(root,".env");
  return {...(existsSync(file)?parseEnv(readFileSync(file,"utf8")):{}),...parent};
}
export function liveEnvironment(base:NodeJS.ProcessEnv,origin:string):NodeJS.ProcessEnv {
  if(!isQuickOrigin(origin))throw new Error("TUNNEL_ORIGIN_INVALID");
  return {...base,SIGNING_ORIGIN:origin,SERA_NETWORK:"sepolia",ENABLE_MAINNET:"false",ENABLE_TESTNET_EXECUTION:"false"};
}
export interface LiveState {pid:number;origin:string;port:number;runId:string;startedAt:string}
const statePath=(root:string)=>resolve(root,".dev-live/session.json");
export function writeState(root:string,state:LiveState) {
  mkdirSync(resolve(root,".dev-live"),{recursive:true});
  // Persist only public runtime coordinates. Never serialize the environment.
  const value={pid:state.pid,origin:state.origin,port:state.port,runId:state.runId,startedAt:state.startedAt};
  writeFileSync(statePath(root)+".tmp",JSON.stringify(value),{mode:0o600});renameSync(statePath(root)+".tmp",statePath(root));
}
export const alive=(pid:number)=>{try{process.kill(pid,0);return true;}catch{return false;}};
export function readState(root:string,isAlive=alive):LiveState|undefined {
  try {
    const s=JSON.parse(readFileSync(statePath(root),"utf8")) as LiveState;
    if(!Number.isInteger(s.pid)||s.pid<=0||!isAlive(s.pid)||!isQuickOrigin(s.origin)||!Number.isInteger(s.port)||s.port<1024||s.port>65535||!/^[a-f0-9]{32}$/.test(s.runId))return;
    return s;
  }catch{return;}
}
export function clearState(root:string,runId:string) {
  try{const s=JSON.parse(readFileSync(statePath(root),"utf8")) as LiveState;if(s.runId===runId)rmSync(statePath(root));}catch{/* Never remove another launcher's state. */}
}
export function preflightEnvironment(root:string,parent:NodeJS.ProcessEnv=process.env) {
  const base=readEnvironment(root,parent),state=readState(root);
  return state?{...liveEnvironment(base,state.origin),SIGNING_PORT:String(state.port)}:base;
}
