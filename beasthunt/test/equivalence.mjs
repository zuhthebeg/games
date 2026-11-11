// Usage: node beasthunt/test/equivalence.mjs <output.json> [--r2 | --compare <baseline.json>]
// R2/R3 browser bot: same loadout, policy and fixed external seed, five hunts/weapon.
import {createRequire} from 'node:module';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const {chromium}=createRequire('/home/cocy/.openclaw/workspace/')('playwright');
const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage();await p.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:8791/')?r.continue():r.abort());
if (process.argv.includes('--r2')) { const body=execFileSync('git',['show','811e375a:beasthunt/js/game.js'],{encoding:'utf8'}); await p.route('**/js/game.js*',r=>r.fulfill({contentType:'text/javascript',body})); }
await p.goto('http://127.0.0.1:8791/beasthunt/?lowfx=1');await p.waitForFunction(()=>window.__bh);
const rows=await p.evaluate(()=>{const B=window.__bh,rows=[];for(const w of ['gs','db','bow'])for(let seed=1;seed<=5;seed++){
let rng=seed, virtualNow=1;const old=Math.random, oldNow=performance.now;performance.now=()=>virtualNow;Math.random=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;};
B.save.weapon=w;B.start('q1');const h=B.hunt;if(h.sim)h.sim.rng=seed;h.lock=true;
for(let i=0;i<36000&&!h.over;i++){virtualNow+=1000/60;h.p.inv=999;const d=Math.hypot(h.m.x-h.p.x,h.m.z-h.p.z);B.input.keys.KeyW=d>(w==='bow'?15:4.5);if(i%20===0){B.input.press('attack');B.input.release('attack');}if(i%300===150)B.input.press('heavy');if(i%300===250)B.input.release('heavy');B.step(1/60);}
rows.push({weapon:w,seed,win:h.win===true,time:h.time,damage:h.dmgDealt});B.end();Math.random=old;performance.now=oldNow;}return rows;});
await b.close();const summary=['gs','db','bow'].map(weapon=>{const r=rows.filter(x=>x.weapon===weapon);return {weapon,wins:r.filter(x=>x.win).length,time:r.reduce((a,x)=>a+x.time,0)/5,damage:r.reduce((a,x)=>a+x.damage,0)/5};});
const out={rows,summary};
if(process.argv.includes('--compare')) {
 const baseline=JSON.parse(fs.readFileSync(process.argv[process.argv.indexOf('--compare')+1],'utf8'));
 out.comparison=summary.map(row=>{const old=baseline.summary.find(r=>r.weapon===row.weapon);return {weapon:row.weapon,timePct:(row.time/old.time-1)*100,damagePct:(row.damage/old.damage-1)*100};});
 const pass=summary.every(row=>row.wins===5) && out.comparison.every(row=>Math.abs(row.timePct)<=15 && Math.abs(row.damagePct)<=15);
 console.log((pass?'PASS':'FAIL')+' R2/R3 solo equivalence '+JSON.stringify(out.comparison));if(!pass)process.exitCode=1;
}
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(out,null,2));console.log(JSON.stringify(summary));
