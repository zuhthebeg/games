// Valid SAVE fixtures only; live world is read-only. All equip/remove/launch/dodge inputs native.
import { chromium } from '/home/cocy/.openclaw/workspace/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import { readFileSync,writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createSkeletonSave } from '../js/meta/character-creation.js';
import { createSave,validateSave } from '../js/meta/save.js';
import { addXp,xpSpan } from '../js/meta/progression.js';
import { allocateStats } from '../js/meta/stats.js';
import { instance } from '../js/meta/items.js';
import { skeletonAppearance } from '../js/render/skeleton-equipment-state.js';
const root=fileURLToPath(new URL('../../',import.meta.url)),out='/home/cocy/.openclaw/workspace/tmp/arpg-skeleton-equipment-native.json';
const key='arpg.save.v1.slots.skeleton_knight',hk='arpg.save.v1',human=JSON.stringify(createSave({name:'Human raw',answers:[0,0,0,0,0],createdAt:1}));
const parts={hands:'hands_light_common_t1',feet:'feet_light_common_t1',body:'cloth_tunic',head:'head_light_common_t1'};
function fixture(level){let s=createSkeletonSave({lineage:'skeleton_knight',name:'뼈장비',answers:[0,0,0,0,0],createdAt:1}),xp=0;for(let l=1;l<level;l++)xp+=xpSpan(l);s=addXp(s,xp);if(level>=29)s=allocateStats(s,{str:Math.max(0,52-s.stats.str)});for(const [uid,id] of Object.entries(parts))s.items.push(instance(uid,id,0,[]));s.items.push(instance('maul','chief_maul',0,[]));assert.equal(validateSave(s),true);return s;}
const server=spawn('python3',['-m','http.server','8913','--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
const browser=await chromium.launch({executablePath:'/home/cocy/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']});
const rows=[],bindings=new Set();
try{for(const mobile of [false,true]){
 const ctx=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:800},isMobile:mobile,hasTouch:mobile});const p=await ctx.newPage(),errors=[],writes=[];p.on('pageerror',e=>errors.push(e.message));
 const checks=[];p.on('response',r=>{const path=new URL(r.url()).pathname;if(path.startsWith('/arpg/js/')||path.startsWith('/arpg/assets/sprites/player-skeleton-equipment/'))checks.push((async()=>{assert.equal(r.status(),200,path);assert.deepEqual(await r.body(),readFileSync(root+path.slice(1)));bindings.add(path);})());});
 await p.route('**/www.googletagmanager.com/**',r=>r.fulfill({body:''}));const tap=async s=>{await p.locator(s).scrollIntoViewIfNeeded();await(mobile?p.locator(s).tap():p.locator(s).click());};
 await p.goto('http://127.0.0.1:8913/arpg/');await p.locator('[data-action="choose-skeleton"]').waitFor();
 const cdp=await ctx.newCDPSession(p);await cdp.send('DOMStorage.enable');for(const type of ['domStorageItemAdded','domStorageItemUpdated','domStorageItemRemoved'])cdp.on('DOMStorage.'+type,e=>{if(e.storageId.isLocalStorage)writes.push(e.key);});
 const save=()=>p.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);
 const seed=async s=>{assert.equal(validateSave(s),true);await p.evaluate(f=>{localStorage.setItem(f.key,JSON.stringify(f.s));localStorage.setItem(f.hk,f.human);},{key,s,hk,human});writes.length=0;await p.goto('http://127.0.0.1:8913/arpg/?character=skeleton_knight');await p.locator('#inn-name').waitFor();};
 const portrait=async()=>{await p.waitForFunction(()=>document.querySelector('.p2-hero')?.dataset.paperdollReady);return p.locator('.p2-hero').getAttribute('data-paperdoll');};
 const checkPortrait=async()=>{const s=await save(),d=JSON.parse(await portrait());assert.deepEqual(d,skeletonAppearance(s));return d;};
 const equipSlot=async(slot,uid=slot)=>{await tap('[data-action="bag"]');await tap(`[data-action="socket"][data-slot="${slot}"]`);await tap(`[data-action="open-item"][data-uid="${uid}"]`);await tap(`[data-action="equip"][data-uid="${uid}"]`);if(slot==='weapon')await tap('[data-action="weapon-confirm"].primary');await tap('[data-action="inn"]');return checkPortrait();};
 const removeSlot=async slot=>{await tap('[data-action="bag"]');await tap(`[data-action="socket"][data-slot="${slot}"]`);await tap(`[data-action="unequip"][data-slot="${slot}"]`);await tap('[data-action="inn"]');return checkPortrait();};
 const thresholds=[];
 for(const level of [8,15,22,29]){await seed(fixture(level));const initial=await checkPortrait();assert.deepEqual(initial.layers,['base','sword']);const slot=level===8?'hands':level===15?'feet':'body';const worn=await equipSlot(slot);assert.ok(worn.layers.includes(slot));const raw=await p.evaluate(k=>localStorage.getItem(k),key);await p.reload();await p.locator('#inn-name').waitFor();assert.equal(await p.evaluate(k=>localStorage.getItem(k),key),raw);assert.deepEqual(await checkPortrait(),worn);const removed=await removeSlot(slot);assert.ok(!removed.layers.includes(slot));thresholds.push({level,slot,initial,worn,removed,reloadExact:true});}
 // Actual sword -> actual blunt switch, then normal S1 true six-pose dodges.
 await seed(fixture(29));await equipSlot('weapon','maul');const blunt=await checkPortrait();assert.ok(blunt.layers.includes('blunt'));await equipSlot('hands');await equipSlot('feet');await equipSlot('body');const combatAppearance=await checkPortrait();
 const launch=async()=>{await tap('[data-action="board"]');await tap('[data-action="sortie"][data-stage="S1"]');await tap('#sortie-confirm');await p.waitForFunction(()=>__arpg.world?.tick>0);await p.waitForFunction(()=>__arpg.art.visuals[0]?.id==='player-skeleton-equipment');};await launch();
 assert.deepEqual(await p.evaluate(()=>__arpg.art.visuals[0].equipment),combatAppearance);assert.equal(await p.evaluate(()=>__arpg.art.visuals[0].dodgeFallback),null);
 await p.evaluate(()=>{window.samples=[];function sample(){const v=__arpg.art.visuals[0];if(v)samples.push({tick:__arpg.world.tick,state:v.state,direction:v.direction,frame:v.frame,id:v.id,startedTick:v.startedTick,age:v.age});requestAnimationFrame(sample);}sample();});
 const dodges=[];
 for(const [dir,keys] of [['E',['KeyD']],['SE',['KeyD','KeyS']],['S',['KeyS']],['SW',['KeyS','KeyA']],['W',['KeyA']],['NW',['KeyA','KeyW']],['N',['KeyW']],['NE',['KeyW','KeyD']],['E',['KeyD']]]){
  await p.waitForFunction(()=>__arpg.world.entities[0].dodge.cdLeft===0);for(const k of keys)await p.keyboard.down(k);await p.waitForFunction(()=>__arpg.art.visuals[0].state==='run');const prev=await p.evaluate(()=>__arpg.world.entities[0].dodge.startedTick);if(mobile)await tap('#dodge');else await p.keyboard.press('Space');await p.waitForFunction(x=>__arpg.world.entities[0].dodge.startedTick!==x,prev);await p.waitForFunction(()=>__arpg.art.visuals[0].state==='dodge');await p.waitForFunction(()=>__arpg.art.visuals[0].state!=='dodge');for(const k of keys)await p.keyboard.up(k);
  const s=await p.evaluate(()=>samples.filter(s=>s.state==='dodge'&&s.startedTick===__arpg.world.entities[0].dodge.startedTick));assert.ok(s.every(s=>s.id==='player-skeleton-equipment'&&s.direction===dir),JSON.stringify(s));assert.deepEqual([...new Set(s.map(s=>s.frame))].sort(),[0,1,2,3,4,5],dir);dodges.push({dir,startedTick:s[0].startedTick,frames:[...new Set(s.map(s=>s.frame))]});
 }
 // Valid fresh Lv30 fixture: each actual final slot completes permanence, portrait dedicated.
 await seed(fixture(30));for(const slot of ['hands','feet','body'])await equipSlot(slot);assert.notEqual((await save()).permanentDeathKnight,true);const final=await equipSlot('head');assert.equal((await save()).permanentDeathKnight,true);assert.equal(final.id,'player-death-knight');const afterRemove=await removeSlot('head');assert.equal(afterRemove.id,'player-death-knight');await p.reload();await p.locator('#inn-name').waitFor();assert.equal((await checkPortrait()).id,'player-death-knight');
 // Native switch to original human; no wrong-slot writes and original human art restored.
 assert.equal(await p.evaluate(k=>localStorage.getItem(k),hk),human);assert.ok(writes.filter(k=>k.startsWith('arpg.save')).every(k=>k===key));await tap('[data-action="character-choice"]');await tap('[data-action="choose-human"]');await p.locator('#inn-name').waitFor();await portrait();assert.match(JSON.parse(await portrait()).kit,/blade/);
 assert.equal(await p.evaluate(k=>localStorage.getItem(k),hk),human);const knightRaw=await p.evaluate(k=>localStorage.getItem(k),key);
 await tap('[data-action="board"]');await tap('[data-action="sortie"][data-stage="S1"]');await tap('#sortie-confirm');await p.waitForFunction(()=>__arpg.art.visuals[0]?.id==='paperdoll-blade');assert.equal(await p.evaluate(()=>__arpg.world.round.playerSide),undefined);if(mobile)await tap('#dodge');else await p.keyboard.press('Space');await p.waitForFunction(()=>__arpg.world.entities[0].dodge.cdLeft>0);assert.equal(await p.evaluate(k=>localStorage.getItem(k),key),knightRaw);assert.deepEqual(errors,[]);await Promise.all(checks);
 const budget=await p.evaluate(async()=>{const {paperdolls}=await import('./js/render/paperdoll-library.js');return paperdolls.status();});assert.ok(budget.peakOutputs<=2);rows.push({width:mobile?390:1280,thresholds,combatAppearance,dodges,final,afterRemove,humanExact:true,budget,errors});writeFileSync(out,JSON.stringify({pass:false,inProgress:true,rows,bindings:[...bindings],screenshots:0,liveWorldWrites:0},null,2));console.log('equipment native pass',mobile?390:1280);await ctx.close();
}writeFileSync(out,JSON.stringify({pass:true,rows,bindings:[...bindings],screenshots:0,liveWorldWrites:0},null,2));}finally{await browser.close();server.kill();}
