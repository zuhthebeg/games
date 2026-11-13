// Existing browser tests retain their original 8791 fixtures. Redirect only in memory.
import fs from 'node:fs';import {spawnSync} from 'node:child_process';
const root=new URL('../../',import.meta.url);let failed=0;
for(const name of ['cadence','boundaries','worker-smoke','equivalence']){
 const source=fs.readFileSync(new URL(name+'.mjs',import.meta.url),'utf8').replaceAll('127.0.0.1:8791','127.0.0.1:8792');
 const f=new URL('.r8b-'+name+'.mjs',import.meta.url);fs.writeFileSync(f,source);
 const args=[f.pathname];if(name==='equivalence')args.push(new URL('../assets/audio/equivalence.json',import.meta.url).pathname);
 const r=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',timeout:180000});fs.unlinkSync(f);fs.writeFileSync(new URL('../assets/audio/'+name+'.log',import.meta.url),r.stdout+r.stderr);console.log((r.status===0?'PASS ':'FAIL ')+name);if(r.status!==0)failed++;
}process.exitCode=failed?1:0;
