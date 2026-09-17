import { createHash } from "node:crypto";
import { existsSync,readdirSync,readFileSync } from "node:fs";
import { join } from "node:path";
/** Watch source/config inputs only: never credentials, databases, node_modules or build output. */
export function sourceFingerprint(root:string) {
  const files:string[]=[];
  const visit=(relative:string)=>{const path=join(root,relative);if(!existsSync(path))return;
    for(const item of readdirSync(path,{withFileTypes:true})){
      const next=join(relative,item.name);
      if(item.isDirectory())visit(next);else if(item.isFile()&&/\.(ts|mjs|html|css)$/.test(item.name))files.push(next);
    }
  };
  for(const dir of ["src","web","scripts","tests"])visit(dir);
  for(const file of ["package.json","package-lock.json","tsconfig.json","tsconfig.build.json"])if(existsSync(join(root,file)))files.push(file);
  const hash=createHash("sha256");for(const file of files.sort()){hash.update(file);hash.update(readFileSync(join(root,file)));}return hash.digest("hex");
}
export class StableSourceChange {
  private candidate="";
  constructor(private accepted:string){}
  poll(value:string) {
    if(value===this.accepted){this.candidate="";return false;}
    if(value!==this.candidate){this.candidate=value;return false;}
    this.accepted=value;this.candidate="";return true;
  }
}
