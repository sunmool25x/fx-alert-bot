import { build } from 'esbuild';
import { mkdir,copyFile,readFile,writeFile,readdir } from 'node:fs/promises';
await mkdir('dist/web',{recursive:true});
await build({entryPoints:['web/app.ts'],bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:'dist/web/app.js',minify:true,logLevel:'warning',define:{'process.env.NODE_ENV':'"production"'}});
// SDK console helpers include raw connection URLs: remove them from this isolated
// bundle only. Its reporter is disabled at runtime and CSP allows relay traffic only.
await build({entryPoints:['web/okx-bridge.ts'],bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:'dist/web/okx-bridge.js',minify:true,drop:['console'],logLevel:'warning',define:{'process.env.NODE_ENV':'"production"'}});
await Promise.all(['index.html','app.css','okx-bridge.html','wallet-icon.png'].map(file=>copyFile('web/'+file,'dist/web/'+file)));
// Retain bundled dependency licenses, including Reown's required full agreements.
const notices=['Portions © 2025 Reown, Inc. All Rights Reserved'];
async function licenses(dir){
  for(const item of await readdir(dir,{withFileTypes:true})){
    if(!item.isDirectory()||item.name.startsWith('.'))continue;
    const path=dir+'/'+item.name;
    if(item.name.startsWith('@')){await licenses(path);continue;}
    for(const name of await readdir(path))if(/^(license|copying|notice)(\.|$)/i.test(name)){
      try{notices.push(path+' / '+name+'\n'+await readFile(path+'/'+name,'utf8'));}catch{}
    }
    if((await readdir(path)).includes('node_modules'))await licenses(path+'/node_modules');
  }
}
await licenses('node_modules');
for(const name of ['universal-provider','core']){
  const pkg=JSON.parse(await readFile(`node_modules/@okxconnect/${name}/package.json`,'utf8'));
  notices.push(`@okxconnect/${name} ${pkg.version}\nAuthor: ${pkg.author}\nPublished license: ${pkg.license}\nUpstream supplies no top-level LICENSE file; preserve this metadata and the bundled notices.`);
}
notices.push(await readFile('node_modules/@okxconnect/universal-provider/dist/okxconnect_universal.js.LICENSE.txt','utf8'));
await writeFile('dist/web/THIRD_PARTY_LICENSES.txt',notices.join('\n\n---------\n\n'));
