// Save-only fixture, native learn/equip/reload and combat controls; no live sim writes or screenshots.
import {chromium} from '/home/cocy/.openclaw/workspace/node_modules/playwright/index.mjs';
import {spawn} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {createSave,validateSave} from '../js/meta/save.js';
import {trained} from './fixtures/trained.js';
const root=fileURLToPath(new URL('../../',import.meta.url)),port=8907,url=`http://127.0.0.1:${port}/arpg/?character=human`;
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
const browser=await chromium.launch({executablePath:'/home/cocy/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']});
const rows=[];
try { for(const width of [1280,390]){
 const ctx=await browser.newContext({viewport:{width,height:844},isMobile:width===390,hasTouch:width===390});const p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route('**/www.googletagmanager.com/**',r=>r.fulfill({body:''}));
 await p.goto(url);await p.waitForFunction(()=>window.__arpg);
 const fixture=trained({...createSave({name:'궁수검수',answers:[0,0,0,0,0],weapon:'bow',createdAt:1}),gold:10000},30);assert.equal(validateSave(fixture),true);
 await p.evaluate(s=>localStorage.setItem('arpg.save.v1',JSON.stringify(s)),fixture);await p.reload();await p.locator('#inn-name').waitFor();
 const tap=async selector=>{const n=p.locator(selector);await n.scrollIntoViewIfNeeded();return width===390?n.tap():n.click();};
 await tap('[data-action="trainer"]');await tap('[data-action="academy-tab"][data-family="bow"]');
 assert.equal(await p.locator('.academy-panel .skill-card').count(),5);
 for(const [i,id] of ['triple_arrow','evasion_shot'].entries()){
  await tap(`[data-action="learn-skill"][data-id="${id}"]`);
  // Learning fills first free slot. Choose explicit positions through native controls.
  await tap(`[data-action="skill-slot"][data-id="${id}"][data-slot="${i}"]`);
  assert.ok(await p.evaluate(id=>__arpg.save.learned.includes(id),id));
 }
 const saved=await p.evaluate(()=>JSON.parse(localStorage.getItem('arpg.save.v1')));assert.deepEqual(saved.loadout.slice(0,2),['triple_arrow','evasion_shot']);
 await p.reload();await p.locator('#inn-name').waitFor();assert.deepEqual(await p.evaluate(()=>__arpg.save.loadout.slice(0,2)),['triple_arrow','evasion_shot']);
 await tap('[data-action="board"]');await tap('[data-action="sortie"][data-stage="S1"]');await tap('#sortie-confirm');await p.waitForFunction(()=>__arpg.world?.tick>0);
 assert.match(await p.locator('#skill').getAttribute('aria-label'),/트리플 애로우/);assert.match(await p.locator('#skill2').getAttribute('aria-label'),/회피샷/);
 // Read-only per-animation-frame event observation; native HUD button casts.
 await p.evaluate(()=>{window.observed=[];let last=-1;window.observeActive=true;function sample(){const w=__arpg.world;if(w&&w.tick!==last){last=w.tick;observed.push({tick:w.tick,x:w.entities[0].x,dodge:{...w.entities[0].dodge},events:w.events.map(e=>({...e})),shots:w.projectiles.filter(pr=>pr.abilityId==='triple_arrow').map(pr=>pr.id)});}if(observeActive)requestAnimationFrame(sample);}requestAnimationFrame(sample);});
 await tap('#skill');await p.waitForFunction(()=>observed.filter(s=>s.events.some(e=>e.type==='projectile'&&e.ability==='triple_arrow')).length>=3);
 const burst=await p.evaluate(()=>observed.filter(s=>s.events.some(e=>e.type==='projectile'&&e.ability==='triple_arrow')).map(s=>s.tick));assert.equal(burst.length,3);assert.deepEqual(burst.slice(1).map((n,i)=>n-burst[i]),[3,3]);
 await tap('#dodge');await p.waitForFunction(()=>__arpg.world.entities[0].dodge.cdLeft>0);assert.equal(await p.locator('#skill2').isDisabled(),true,'evasion HUD disabled while ordinary dodge cooling down');
 await p.waitForFunction(()=>!document.querySelector('#skill2').disabled);await tap('#skill2');await p.waitForFunction(()=>observed.some(s=>s.events.some(e=>e.type==='projectile'&&e.ability==='evasion_shot')));
 const evasion=await p.evaluate(()=>observed.find(s=>s.events.some(e=>e.type==='projectile'&&e.ability==='evasion_shot')));assert.ok(evasion.dodge.iframeLeft>0);assert.ok(evasion.dodge.dashLeft>0);assert.ok(evasion.events.some(e=>e.type==='dodge'));
 const details=await p.evaluate(()=>({skills:__arpg.world.entities[0].skills,mp:__arpg.world.entities[0].mp,shots:observed.filter(s=>s.events.some(e=>e.type==='projectile')).map(s=>({tick:s.tick,abilities:s.events.filter(e=>e.type==='projectile').map(e=>e.ability)}))}));
 await p.evaluate(()=>window.observeActive=false);assert.deepEqual(errors,[]);rows.push({width,nativeTouch:width===390,learnEquipSaveReload:true,burstTicks:burst,evasionRealDodge:true,details,errors});console.log('knight/archer native PASS',width);await ctx.close();
 }writeFileSync('/home/cocy/.openclaw/workspace/tmp/arpg-knight-archer-native.json',JSON.stringify({pass:true,url,rows,screenshots:0,liveWorldWrites:0},null,2));
}finally{await browser.close();server.kill();}
