import { existsSync,readFileSync,mkdirSync,writeFileSync,renameSync } from "node:fs";
import { resolve,delimiter } from "node:path";
import { createHash } from "node:crypto";
import { isQuickOrigin } from "./environment.js";
import { SetupError } from "./processes.js";

export function parseTunnelOrigin(line:string):string|undefined {
  for(const match of line.matchAll(/https:\/\/[^\s|"'<>]+/g))if(isQuickOrigin(match[0]))return match[0];
}
export function tunnelEnvironment(env:NodeJS.ProcessEnv):NodeJS.ProcessEnv {
  const allowed=new Set(["path","systemroot","windir","temp","tmp","userprofile","home","appdata","localappdata","comspec","https_proxy","http_proxy","no_proxy"]);
  return Object.fromEntries(Object.entries(env).filter(([key])=>allowed.has(key.toLowerCase())));
}
export function tunnelArgs(root:string,port:number) {
  const config=resolve(root,".dev-live/cloudflared.yml");mkdirSync(resolve(root,".dev-live"),{recursive:true});writeFileSync(config,"{}\n");
  return ["tunnel","--config",config,"--no-autoupdate","--protocol","auto","--loglevel","info","--metrics","127.0.0.1:0","--grace-period","5s","--url",`http://127.0.0.1:${port}`];
}
export async function ensureCloudflared(root:string,env:NodeJS.ProcessEnv,signal:AbortSignal):Promise<string> {
  if(env.CLOUDFLARED_PATH){if(!existsSync(env.CLOUDFLARED_PATH))throw new SetupError("CLOUDFLARED_PATH");return resolve(env.CLOUDFLARED_PATH);}
  const name=process.platform==="win32"?"cloudflared.exe":"cloudflared";
  for(const dir of (env.PATH??env.Path??"").split(delimiter).filter(Boolean)){const path=resolve(dir.replace(/^"|"$/g,""),name);if(existsSync(path))return path;}
  const downloaded=resolve(env.USERPROFILE??env.HOME??root,"Downloads/cloudflared-windows-amd64.exe");
  if(process.platform==="win32"&&process.arch==="x64"&&existsSync(downloaded))return downloaded;
  if(process.platform!=="win32"||!["x64","arm64"].includes(process.arch))throw new SetupError("CLOUDFLARED_INSTALL");
  const dir=resolve(root,".dev-live/bin"),file=resolve(dir,name),record=resolve(dir,"cloudflared.json");
  try{const saved=JSON.parse(readFileSync(record,"utf8")) as {sha256:string};if(/^[a-f0-9]{64}$/.test(saved.sha256)&&createHash("sha256").update(readFileSync(file)).digest("hex")===saved.sha256)return file;}catch{/* Fetch a verified official release. */}
  try {
    const timeout=()=>AbortSignal.any([signal,AbortSignal.timeout(120000)]);
    const release=await fetch("https://api.github.com/repos/cloudflare/cloudflared/releases/latest",{signal:timeout(),headers:{"accept":"application/vnd.github+json","user-agent":"sera-korea-live-setup"}});
    if(!release.ok)throw new Error();
    const data=await release.json() as {assets:{name:string;browser_download_url:string;digest?:string;size:number}[]};
    const asset=data.assets.find(a=>a.name===`cloudflared-windows-${process.arch==="x64"?"amd64":"arm64"}.exe`);
    if(!asset||!/^sha256:[a-f0-9]{64}$/.test(asset.digest??"")||!asset.browser_download_url.startsWith("https://github.com/cloudflare/cloudflared/releases/download/")||asset.size>200_000_000)throw new Error();
    const response=await fetch(asset.browser_download_url,{signal:timeout()});if(!response.ok)throw new Error();
    const bytes=Buffer.from(await response.arrayBuffer()),hash=createHash("sha256").update(bytes).digest("hex");
    if(bytes.length!==asset.size||hash!==asset.digest!.slice(7))throw new Error();
    mkdirSync(dir,{recursive:true});writeFileSync(file+".download",bytes);renameSync(file+".download",file);
    writeFileSync(record,JSON.stringify({sha256:hash,asset:asset.name}));return file;
  }catch{signal.throwIfAborted();throw new SetupError("CLOUDFLARED_DOWNLOAD");}
}
