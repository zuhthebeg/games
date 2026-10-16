// Native main-game controls; only an isolated, validated save fixture is written.
import {chromium} from '/home/cocy/.openclaw/workspace/node_modules/playwright/index.mjs';
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {preset} from '../tools/balance/botsim.mjs';
import {validateSave} from '../js/meta/save.js';
const root=fileURLToPath(new URL('../../',import.meta.url));
const save=preset('S2',{level:12,rarity:'epic',enhance:5,stats:'agile'});save.cleared.S1=true;assert.ok(validateSave(save));
const port=Number(process.env.ARPG_HTTP_PORT||8979);
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
const browser=await chromium.launch({executablePath:'/home/cocy/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']});
try{
 const ctx=await browser.newContext({viewport:{width:1280,height:800}}),p=await ctx.newPage(),errors=[],bound=[];
 p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{const path=new URL(r.url()).pathname;if(path.startsWith('/arpg/js/'))bound.push((async()=>{assert.deepEqual(await r.body(),readFileSync(root+path.slice(1)));return path;})());});
 await p.route('**/www.googletagmanager.com/**',r=>r.fulfill({body:''}));
 await p.addInitScript(raw=>{localStorage.setItem('arpg.save.v1',raw);localStorage.setItem('arpg.autoAttack','1');},JSON.stringify(save));
 await p.goto(`http://127.0.0.1:${port}/arpg/`);await p.locator('[data-action="choose-human"]').click();await p.locator('#inn-name').waitFor();
 await p.locator('[data-action="board"]').click();await p.locator('[data-action="sortie"][data-stage="S2"]').click();await p.locator('#sortie-confirm').click();
 await p.waitForFunction(()=>__arpg.world?.round?.stageId==='S2'&&__arpg.world.tick>0);
 const observe=()=>p.evaluate(()=>JSON.parse(JSON.stringify(__arpg.world)));
 const initial=await observe(),first=initial.entities.find(e=>e.kind==='monster');assert.ok(first);const originalDue=Math.min(...initial.round.pending.map(s=>s.atTicks));
 let held=new Set(),result,last;
 const start=Date.now();
 while(Date.now()-start<40000){
  const w=await observe();last=w;assert.equal(w.round.state,'running');
  const a=w.entities.find(e=>e.kind==='player');assert.ok(!a.dead);
  const old=w.entities.find(e=>e.id===first.id),newborn=w.entities.filter(e=>e.kind==='monster'&&e.id!==first.id);
  if(newborn.length){assert.ok(old?.dead||!old,'first hostile actually killed');assert.ok(w.round.t<originalDue);assert.equal(newborn.length,3);assert.ok(newborn.some(e=>e.spawnLeft>0));result={firstId:first.id,killTick:w.tick,roundT:w.round.t,originalDue,newborn:newborn.map(e=>({id:e.id,type:e.type,x:e.x,y:e.y,spawnLeft:e.spawnLeft})),pendingNext:Math.min(...w.round.pending.map(s=>s.atTicks))};break;}
  const e=w.entities.filter(e=>e.kind==='monster'&&!e.dead).sort((x,y)=>Math.hypot(x.x-a.x,x.y-a.y)-Math.hypot(y.x-a.x,y.y-a.y))[0];
  let mx=0,my=0;if(e){const dx=e.x-a.x,dy=e.y-a.y,d=Math.hypot(dx,dy);if(d>58){mx=dx/d;my=dy/d;}}
  const next=new Set([...(mx<-.2?['KeyA']:mx>.2?['KeyD']:[]),...(my<-.2?['KeyW']:my>.2?['KeyS']:[])]);
  for(const k of held)if(!next.has(k))await p.keyboard.up(k);for(const k of next)if(!held.has(k))await p.keyboard.down(k);held=next;
  await p.waitForTimeout(35);
 }
 for(const k of held)await p.keyboard.up(k);
 assert.ok(result,JSON.stringify({last,errors}));assert.deepEqual(errors,[]);
 const evidence={pass:true,nativeMainSP:true,fixture:'validated Lv12 epic+5 agile saved character, no live world/stat/timer writes',result,errors,screenshots:0,bound:[...new Set(await Promise.all(bound))]};
 writeFileSync('/home/cocy/.openclaw/workspace/tmp/arpg-empty-wave-native.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));await ctx.close();
}finally{await browser.close();server.kill();}
