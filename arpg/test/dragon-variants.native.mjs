// Ordinary board/sortie/combat/receipt/reload. Read-only __arpg, no runtime world writes, no screenshots.
import {chromium} from '/home/cocy/.openclaw/workspace/node_modules/playwright/index.mjs';
import {spawn} from 'node:child_process';
import {writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {preset} from '../tools/balance/botsim.mjs';
import {validateSave} from '../js/meta/save.js';
const root=new URL('../..',import.meta.url).pathname,port=8996,base='http://127.0.0.1:'+port,out='/home/cocy/.openclaw/workspace/tmp/arpg-dragons-logs/native.json';
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
const report={status:'RUNNING',screenshots:0,worldWrites:0,rows:[],errors:[],consoleErrors:[],sourceBinding:{}};
let browser;
try{
 for(let i=0;i<40;i++){try{if((await fetch(base+'/arpg/')).ok)break}catch{}await new Promise(r=>setTimeout(r,100));}
 for(const f of ['js/main.js','js/audio-profile.js','js/content/combat.js','js/content/world-map.js','js/render/dragon-hunt-presentation.js','js/meta/run.js']){const bytes=Buffer.from(await(await fetch(base+'/arpg/'+f)).arrayBuffer());assert.deepEqual(bytes,await readFile(root+'/arpg/'+f));report.sourceBinding[f]=createHash('sha256').update(bytes).digest('hex');}
 browser=await chromium.launch({executablePath:'/home/cocy/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']});
 for(const [width,id,region,type] of [[1280,'D_EMBER','cinder','ember_dragon'],[1280,'D_FROST','frost','frost_dragon'],[1280,'D_VENOM','mire','venom_dragon'],[390,'D_EMBER','cinder','ember_dragon'],[390,'D_FROST','frost','frost_dragon'],[390,'D_VENOM','mire','venom_dragon']]){
  const save=preset(id,{level:id==='D_EMBER'?29:30,rarity:'epic',enhance:4});for(let n=1;n<=36;n++)save.cleared['S'+n]=true;save.stacks.potion=20;save.stacks.mana_potion=10;save.autoUse={potion:true,hp:50,mp:50,recall:false};assert.ok(validateSave(save));
  const ctx=await browser.newContext({viewport:{width,height:844},isMobile:width===390,hasTouch:width===390});
  await ctx.addInitScript(save=>{if(!localStorage.getItem('arpg.save.v1'))localStorage.setItem('arpg.save.v1',JSON.stringify(save));localStorage.setItem('arpg.autoAttack','1');},save);
  await ctx.route('**/www.googletagmanager.com/**',r=>r.fulfill({body:''}));
  const page=await ctx.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.consoleErrors.push(m.text());});
  const press=async sel=>{const l=page.locator(sel+':visible').first();await l.scrollIntoViewIfNeeded();if(width===390)await l.tap();else await l.click();};
  await page.goto(base+'/arpg/');await press('[data-action="choose-human"]');await page.locator('#inn-name').waitFor();
  await press('[data-action="board"]');await press('[data-action="map-region"][data-region="'+region+'"]');await press('[data-action="sortie"][data-stage="'+id+'"]');await press('#sortie-confirm');
  await page.waitForFunction(id=>__arpg.world?.round?.stageId===id,id);
  await page.waitForFunction(type=>{const m=__arpg.world.entities.find(e=>e.type===type);return m&&__arpg.art.visuals.some(v=>v.entityId===m.id&&v.textureLoaded)},type);
  const initial=await page.evaluate(type=>({world:__arpg.world,art:__arpg.art.visuals.find(v=>v.entityId===__arpg.world.entities.find(e=>e.type===type).id)}),type);
  const held=new Set(),cdp=width===390?await ctx.newCDPSession(page):null,seen=new Set();let touch=false,last;
  const start=Date.now();
  try{while(Date.now()-start<60000){
   const w=await page.evaluate(()=>__arpg.world);last=w;const p=w.entities.find(e=>e.kind==='player'),m=w.entities.find(e=>e.type===type&&!e.dead);
   if(w.round.state!=='running')break;if(m?.act)seen.add(m.act.id);assert.ok(!p.dead,'natural character survived');
   let mx=0,my=0;if(m){const dx=m.x-p.x,dy=m.y-p.y,d=Math.hypot(dx,dy);if(d>62){mx=dx/d;my=dy/d;}}
   if(cdp){const origin={id:1,x:60,y:500};if(!touch){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[origin]});touch=true;}await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x:origin.x+mx*42,y:origin.y+my*42}]});}
   else {const next=new Set([...(mx<-.2?['KeyA']:mx>.2?['KeyD']:[]),...(my<-.2?['KeyW']:my>.2?['KeyS']:[])]);for(const k of held)if(!next.has(k))await page.keyboard.up(k);for(const k of next)if(!held.has(k))await page.keyboard.down(k);held.clear();for(const k of next)held.add(k);}
   await page.waitForTimeout(70);
  }}finally{for(const k of held)await page.keyboard.up(k);if(cdp){await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}}
  report.lastState={width,id,last};assert.equal(last.round.state,'clear','natural clear');assert.ok(last.entities.find(e=>e.type===type).dead);
  await page.locator('[data-action="result-inn"]').waitFor({timeout:15000});
  const receipt=await page.locator('.receipt').innerText();await press('[data-action="result-inn"]');await page.locator('#inn-name').waitFor();
  const settled=await page.evaluate(()=>__arpg.save);assert.equal(settled.cleared[id],true);assert.equal(settled.lastReceipt.terminal,'clear');assert.ok(settled.lastReceipt.firstClear);assert.ok(settled.lastReceipt.stageXp>0);if(id==='D_EMBER'){assert.equal(settled.lastReceipt.xpGained,1360);assert.equal(settled.xp,1360);}
  const raw=await page.evaluate(()=>localStorage.getItem('arpg.save.v1'));await page.waitForTimeout(1500);assert.equal(await page.evaluate(()=>localStorage.getItem('arpg.save.v1')),raw,'no duplicate settlement while terminal UI idles');
  await page.reload();await page.waitForFunction(()=>!!window.__arpg);if(await page.locator('[data-action="choose-human"]:visible').count())await press('[data-action="choose-human"]');await page.locator('#inn-name').waitFor();
  const reload=await page.evaluate(()=>__arpg.save);assert.equal(reload.cleared[id],true);assert.deepEqual(reload.lastReceipt,settled.lastReceipt);assert.equal(reload.gold,settled.gold);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  report.rows.push({width,id,input:width===390?'CDP real touch joystick + ordinary autoattack preference':'native keyboard + ordinary autoattack preference',fixture:'validated recommended level'+save.level+' epic+4, original S1-S36 clears, ordinary 20 potions',initialHp:initial.world.entities.find(e=>e.type===type).maxHp,atlas:initial.art,seen:[...seen],clearTick:last.tick,receipt,settledReceipt:settled.lastReceipt,reloadClear:true,duplicateSettle:false,overflow:0});await ctx.close();
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.consoleErrors,[]);delete report.lastState;report.status='PASS';
}catch(e){report.status='BLOCKED';report.failure=e.stack;process.exitCode=1;}finally{await browser?.close();server.kill();await writeFile(out,JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,rows:report.rows.length,failure:report.failure,out}));}
