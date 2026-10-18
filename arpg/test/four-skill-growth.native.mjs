// Production-capable replay: preboot synthetic saves, native controls, readonly observations.
import { chromium } from '/home/cocy/.openclaw/workspace/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { createSave, validateSave } from '../js/meta/save.js';
import { trained } from './fixtures/trained.js';
import { MASTERY_THRESHOLDS } from '../js/meta/skill-mastery.js';
import { skillGrowth, growthLabel } from '../js/content/skill-growth.js';
import { ABILITIES } from '../js/content/combat.js';
const root=fileURLToPath(new URL('../..',import.meta.url)),port=Number(process.env.ARPG_HTTP_PORT||8991);
const base=(process.env.ARPG_BASE_URL||`http://127.0.0.1:${port}`).replace(/\/$/,'');
const output=process.env.ARPG_GROWTH_EVIDENCE||'/home/cocy/.openclaw/workspace/tmp/arpg-four-growth-native.json';
const widths=(process.env.ARPG_GROWTH_WIDTHS||'1280,390').split(',').map(Number);
const levels=(process.env.ARPG_GROWTH_LEVELS||'1,4,5,10,15,20,25,30').split(',').map(Number);
const modes=(process.env.ARPG_GROWTH_MODES||'solo,relay').split(',');
const families=(process.env.ARPG_GROWTH_FAMILIES||'focus,bow').split(',');
const server=process.env.ARPG_BASE_URL?null:spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
const browser=await chromium.launch({executablePath:'/home/cocy/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
const report={status:'RUNNING',base,transport:'REAL deployed WebSocket relay for relay rows; no BroadcastChannel',screenshots:0,worldWrites:0,rows:[],errors:[],sourceBinding:{}};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const contexts=[];
const projectileLine=(await readFile(root+'/arpg/js/sim/world.js','utf8')).split('\n').findIndex(line=>line.includes("world.events.push({ type: 'projectile'"));
const stepReturnLine=(await readFile(root+'/arpg/js/sim/world.js','utf8')).split('\n').findLastIndex(line=>line.trim()==='return world.events;');
async function lossless(c){
 const cdp=await c.ctx.newCDPSession(c.page);await cdp.send('Debugger.enable');c.tickJournal=[];c.createdProjectiles=[];
 c.page.on('console',msg=>{const value=msg.text();if(value.startsWith('__growth_tick__'))c.tickJournal.push(JSON.parse(value.slice('__growth_tick__'.length)));if(value.startsWith('__growth_shots__'))for(const p of JSON.parse(value.slice('__growth_shots__'.length)))if(!c.createdProjectiles.some(row=>row.id===p.id))c.createdProjectiles.push(p);});
 // Read-only DevTools logpoint, not a runtime world/input mutation. Ordinary
 // RAF can step multiple ticks, so frame sampling alone is not an event journal.
 const binding=await cdp.send('Debugger.setBreakpointByUrl',{urlRegex:'/arpg/js/sim/world\\.js(?:\\?|$)',lineNumber:stepReturnLine,condition:'console.debug("__growth_tick__"+JSON.stringify({tick:world.tick,events:world.events})),false'});
 assert.ok(binding.locations.length,'logpoint bound to actual served sim step');
 const shots=await cdp.send('Debugger.setBreakpointByUrl',{urlRegex:'/arpg/js/sim/world\\.js(?:\\?|$)',lineNumber:projectileLine,condition:'console.debug("__growth_shots__"+JSON.stringify(world.projectiles.filter(p=>p.ownerId===ent.id&&p.abilityId===act.id))),false'});
 assert.ok(shots.locations.length,'logpoint bound to real projectile creation before same-tick collision');
}
async function client(width,family,level,ids){
 let save=trained(createSave({name:'Growth',answers:[0,0,0,0,0],weapon:family,createdAt:123}));save.gold=3000;save.autoUse={potion:false,hp:50,mp:50,recall:false};save.skillMastery=Object.fromEntries(ids.map(id=>[id,MASTERY_THRESHOLDS[level-1]]));assert.ok(validateSave(save));
 const ctx=await browser.newContext({viewport:{width,height:844},isMobile:width===390,hasTouch:width===390});contexts.push(ctx);
 await ctx.route('**/www.googletagmanager.com/**',r=>r.fulfill({body:''}));await ctx.route('**/api.qrserver.com/**',r=>r.abort());
 await ctx.addInitScript(save=>{if(location.protocol!=='http:'&&location.protocol!=='https:')return;if(!localStorage.getItem('growth-fixture')){localStorage.setItem('arpg.save.v1',JSON.stringify(save));localStorage.setItem('arpg.autoAttack','0');localStorage.setItem('growth-fixture','1');}},save);
 const page=await ctx.newPage();page.setDefaultTimeout(20000);const wire=[];page.on('pageerror',e=>report.errors.push(e.message));
 page.on('websocket',ws=>{const record={url:ws.url(),events:[],snapshots:[]};wire.push(record);ws.on('framereceived',frame=>{try{const packet=JSON.parse(frame.payload),d=packet.data;if(d?.t!=='snapshot')return;for(const event of d.events||[])if(!record.events.some(e=>e.seq===event.seq))record.events.push(event);record.snapshots.push({tick:d.tick,entities:d.entities.filter(e=>e.kind==='player').map(e=>({pid:e.pid,skillMasteryLevels:e.skillMasteryLevels,mp:e.mp,cds:e.cds})),zones:d.zones,projectiles:d.projectiles});}catch{}});});
 const press=async selector=>{await page.bringToFront();const b=page.locator(selector).first();await b.scrollIntoViewIfNeeded();if(width===390)await b.tap();else{await b.focus();await page.keyboard.press('Enter');}};
 return {ctx,page,press,wire};
}
async function learn(c,ids,level){await c.page.locator('#inn-name').waitFor();await c.press('[data-action="trainer"]');for(let slot=0;slot<ids.length;slot++){const id=ids[slot];assert.equal(await c.page.locator(`[data-growth="${id}"]`).innerText(),growthLabel(id,level));await c.press(`[data-action="learn-skill"][data-id="${id}"]`);await c.press(`[data-action="skill-slot"][data-id="${id}"][data-slot="${slot}"]`);assert.equal(await c.page.locator(`[data-action="skill-slot"][data-id="${id}"][data-slot="${slot}"]`).getAttribute('aria-pressed'),'true');assert.equal(await c.page.locator(`[data-growth="${id}"]`).innerText(),growthLabel(id,level));}await c.press('[data-action="inn"]');}
async function sample(c){await c.page.evaluate(()=>{window.growthObservation={events:[],zones:[],shots:[],pawns:[]};let last=-1;window.growthTimer=setInterval(()=>{const w=window.__arpg?.world;if(!w||w.tick===last)return;last=w.tick;const out=window.growthObservation;for(const e of w.events||[])out.events.push({tick:w.tick,...JSON.parse(JSON.stringify(e))});for(const z of w.zones||[])out.zones.push({tick:w.tick,...JSON.parse(JSON.stringify(z))});for(const p of w.projectiles||[])if(!out.shots.some(s=>s.id===p.id))out.shots.push(JSON.parse(JSON.stringify(p)));out.pawns.push({tick:w.tick,entities:w.entities.filter(p=>p.kind==='player').map(p=>({pid:p.pid,mp:p.mp,cds:JSON.parse(JSON.stringify(p.cds)),skillMasteryLevels:p.skillMasteryLevels,act:p.act?{id:p.act.id,phase:p.act.phase,growth:p.act.growth}:null}))});},5);});}
async function casts(c,host,ids,level,row){
 const uid=host===c?'local':await c.page.evaluate(()=>__arpg.multi.uid);row.uid=uid;
 await lossless(host);await sample(host);if(c!==host)await sample(c);
 // Cast both slots promptly: finite wall must finish before natural enemies can interrupt the caster.
 for(let slot=0;slot<ids.length;slot++){const id=ids[slot];await c.page.waitForFunction(selector=>!document.querySelector(selector)?.disabled,slot===0?'#skill':'#skill2');await c.press(slot===0?'#skill':'#skill2');await host.page.waitForFunction(({id,uid})=>{const w=__arpg.world,p=w.entities.find(p=>p.pid===uid);return p?.act?.id===id||[...(w.zones||[]),...w.projectiles].some(z=>z.abilityId===id&&z.ownerId===p?.id);},{id,uid},{polling:20});await host.page.waitForFunction(({id,uid})=>(__arpg.world.entities.find(p=>p.pid===uid)?.cds[id]||0)>0,{id,uid},{polling:20});}
 await pause(7300);
 const obs=await host.page.evaluate(()=>{clearInterval(window.growthTimer);return window.growthObservation;});row.hostObservation=obs;row.hostTickJournal=host.tickJournal;row.createdProjectiles=host.createdProjectiles;
 if(c!==host)row.guestObservation=await c.page.evaluate(()=>{clearInterval(window.growthTimer);return window.growthObservation;});
 row.casts=[];
 for(const id of ids){const g=skillGrowth(id,level),type=id==='meteor'?'explode':id==='spinning_shot'?'projectile':'zonePulse';const events=host.tickJournal.flatMap(row=>row.events.map(e=>({tick:row.tick,...e}))).filter(e=>e.ability===id&&e.type===type);const zones=obs.zones.filter(z=>z.abilityId===id);const shots=host.createdProjectiles.filter(s=>s.abilityId===id);const zone=zones[0];
 // Lossless read-only logpoints provide actual host events and created shots,
 // including arrows consumed by same-tick collision. Frame-sampled counters
 // remain supplemental evidence, never substituted for the host journal.
 const advances=zone ? Math.max(...zones.map(z=>Math.round((z.nextTick-z.activeTick)/(z.intervalTicks||(id==='firewall'?15:9))))) : 0;
 const lastLanding=id==='meteor'&&zone&&events.length ? Math.max(...events.map(e=>Math.round((e.tick-1-zone.activeTick)/9)+1)) : 0;
 const actual=events.length;
 const result={id,expected:g,actual,sampledEvents:obs.events.filter(e=>e.ability===id&&e.type===type).length,authoritativePulseAdvances:advances,lastLanding,projectiles:shots.length,sampledProjectiles:obs.shots.filter(s=>s.abilityId===id).length,zone,eventTicks:events.map(e=>e.tick)};row.casts.push(result);assert.equal(result.actual,g.count,`${id} natural ${row.mode} count Lv${level}`);if(id==='spinning_shot')assert.equal(shots.length,g.count);else assert.equal(new Set(zones.map(z=>z.id)).size,1,'one bounded zone per cast');
 assert.ok(obs.pawns.some(s=>s.entities.some(p=>p.pid===uid&&p.skillMasteryLevels?.[id]===level)),`${id} host pawn level`);assert.ok(obs.pawns.some(s=>s.entities.some(p=>p.pid===uid&&p.cds[id]>0)),'host cooldown once');
 if(c!==host){const confirmed=c.wire.flatMap(w=>w.events).filter(e=>e.event.ability===id&&e.event.type===type);assert.equal(confirmed.length,g.count,'real relay deduplicated journal count');assert.ok(row.guestObservation.pawns.some(s=>s.entities.some(p=>p.pid===uid&&p.skillMasteryLevels?.[id]===level)),'guest snapshot level');if(id!=='spinning_shot')assert.ok(row.guestObservation.zones.some(z=>z.abilityId===id),'guest rendered grown zone');result.guestJournal=confirmed;}
 }
 assert.equal(await c.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
}
try{
 for(let i=0;i<60;i++){try{if((await fetch(base+'/arpg/')).ok)break;}catch{}await pause(100);}
 const html=await(await fetch(base+'/arpg/')).text(),imports=JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
 for(const f of ['arpg/js/main.js','arpg/js/net/session.js','arpg/js/net/protocol.js','arpg/js/net/player-prediction.js','arpg/js/sim/world.js','arpg/js/sim/spell-zones.js','arpg/js/render/spell-zones.js','arpg/js/ui/skill-view.js','arpg/js/content/skill-growth.js']){
  const key='./'+f.replace(/^arpg\//,''),url=new URL(imports[key]||key,base+'/arpg/').href,served=Buffer.from(await(await fetch(url,{cache:'no-store'})).arrayBuffer()),local=await readFile(root+'/'+f);assert.deepEqual(served,local,f);report.sourceBinding[f]={url,sha256:createHash('sha256').update(local).digest('hex')};
 }
 for(const mode of modes)for(const width of widths)for(const family of families)for(const level of levels){
  const ids=family==='focus'?['meteor','firewall']:['rain_arrow','spinning_shot'],row={mode,width,family,level};report.rows.push(row);
  const c=await client(width,family,level,ids);row.wire=c.wire;await c.page.goto(base+'/arpg/?character=human');await learn(c,ids,level);
  if(mode==='solo'){await c.press('[data-action="board"]');await c.press('[data-action="sortie"][data-stage="S1"]');await c.press('#sortie-confirm');await c.page.waitForSelector('#skill');await casts(c,c,ids,level,row);}
  else{
   const host=await client(width,family,1,ids);await host.page.goto(base+'/arpg/?character=human');await host.page.locator('#inn-name').waitFor();await host.press('[data-action="board"]');await host.press('[data-action="coop"]');await host.press('#mpl-create');await host.page.waitForFunction(()=>document.querySelectorAll('#mpl-list .mpl-pl').length===1);row.room=await host.page.locator('.mpl-room b').innerText();const invite=decodeURIComponent(await host.page.locator('img[alt="입장 QR"]').getAttribute('src')).split('&data=')[1];await c.page.goto(invite);await c.page.waitForFunction(()=>document.querySelectorAll('#mpl-list .mpl-pl').length===2);await c.press('#mpl-ready');await host.page.waitForFunction(()=>!document.querySelector('#mpl-start').disabled);await host.page.locator('#arpg-party-stage').selectOption('S1');await host.press('#mpl-start');await c.page.waitForFunction(()=>__arpg.multi?.phase==='running'&&__arpg.world?.entities.length>=2);assert.equal(await c.page.evaluate(()=>__arpg.multi.ownsSim),false);assert.equal(await host.page.evaluate(()=>__arpg.multi.ownsSim),true);await casts(c,host,ids,level,row);assert.ok(c.wire.every(w=>w.url.startsWith('wss://relay-do-poc.zuhejbeg.workers.dev/')));row.wire=c.wire;await c.page.goto('about:blank');await host.page.goto('about:blank');await host.ctx.close();
  }
  await c.ctx.close();row.status='PASS';await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({mode,width,family,level,status:row.status,counts:row.casts.map(c=>c.actual)}));
 }
 assert.deepEqual(report.errors,[]);report.status='PASS';
}catch(e){report.status='FAIL';report.failure=e.stack;throw e;}finally{await writeFile(output,JSON.stringify(report,null,2)+'\n');await browser.close();server?.kill();}
