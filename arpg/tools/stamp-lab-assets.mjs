// Keep the published encounter laboratory on the same complete module graph as main.
import {readFileSync,writeFileSync,readdirSync}from'node:fs';import{createHash}from'node:crypto';import{fileURLToPath}from'node:url';
const root=fileURLToPath(new URL('..',import.meta.url)),file=root+'/tools/undead-encounter-lab/index.html';let html=readFileSync(file,'utf8');
const walk=p=>readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(p+'/'+e.name):/\.m?js$/.test(e.name)?[p+'/'+e.name]:[]),hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex').slice(0,10);
const files=[...walk(root+'/js'),...walk(root+'/vendor'),...['lab.js','encounter.js','presentation.js'].map(n=>root+'/tools/undead-encounter-lab/'+n)],imports={};
for(const f of files){const k='/arpg/'+f.slice(root.length+1);imports[k]=k+'?v='+hash(f);}
html=html.replace(/<script type="importmap">[\s\S]*?<\/script>/,'<script type="importmap">'+JSON.stringify({imports},null,2)+'</script>').replace(/(\/arpg\/(?:js\/[^"?]+\.js|css\/game\.css))\?v=[a-f0-9]+/g,(_,p)=>p+'?v='+hash(root+'/'+p.slice(6))).replace(/src="\.\/lab\.js(?:\?v=[a-f0-9]+)?"/,'src="./lab.js?v='+hash(root+'/tools/undead-encounter-lab/lab.js')+'"');
writeFileSync(file,html);
