// Valid SAVE fixture only; all live gameplay uses native keyboard/touch, readonly observations.
import { chromium } from '/home/cocy/.openclaw/workspace/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import { readFileSync,writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { createSkeletonSave } from '../js/meta/character-creation.js';
import { createSave,validateSave } from '../js/meta/save.js';
import { addXp,xpSpan } from '../js/meta/progression.js';
import { equip,instance } from '../js/meta/items.js';
const root=fileURLToPath(new URL('../../',import.meta.url)),out='/home/cocy/.openclaw/workspace/tmp/arpg-deathknight-runtime-native.json';
const key='arpg.save.v1.slots.skeleton_knight',hk='arpg.save.v1',human=JSON.stringify(createSave({name:'Human raw',answers:[0,0,0,0,0],createdAt:1}));
let fixture=createSkeletonSave({lineage:'skeleton_knight',name:'기사진화',answers:[0,0,0,0,0],createdAt:1});let xp=0;for(let l=1;l<30;l++)xp+=xpSpan(l);fixture=addXp(fixture,xp);
for(const [uid,id] of Object.entries({hands:'hands_light_common_t1',feet:'feet_light_common_t1',body:'cloth_tunic',head:'head_light_common_t1'}))fixture.items.push(instance(uid,id,0,[]));
for(const uid of ['hands','feet','body'])fixture=equip(fixture,uid);assert.equal(validateSave(fixture),true);assert.notEqual(fixture.permanentDeathKnight,true);
const server=spawn('python3',['-m','http.server','8901','--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
const browser=await chromium.launch({executablePath:'/home/cocy/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']});
const rows=[],bindings={},pending=[];
try{for(const mobile of [false,true]){
 const ctx=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:800},isMobile:mobile,hasTouch:mobile});const p=await ctx.newPage(),errors=[],requests=[];
 p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{const path=new URL(r.url()).pathname;if(path.startsWith('/arpg/assets/sprites/')||path.startsWith('/arpg/js/')){requests.push({path,status:r.status()});}});
 await p.route('**/www.googletagmanager.com/**',r=>r.fulfill({body:''}));
 const tap=async s=>{await p.locator(s).scrollIntoViewIfNeeded();await(mobile?p.locator(s).tap():p.locator(s).click());};
 const start=async id=>{await tap('[data-action="board"]');await tap(`[data-action="sortie"][data-stage="${id}"]`);await tap('#sortie-confirm');await p.waitForFunction(()=>__arpg.world?.tick>0);await p.waitForFunction(()=>__arpg.art.visuals[0]?.id==='player-death-knight');assert.equal(await p.evaluate(()=>__arpg.art.visuals[0].scale),.5);assert.equal(await p.evaluate(()=>__arpg.art.visuals[0].tint),0xffffff);};
 await p.goto('http://127.0.0.1:8901/arpg/');await p.locator('[data-action="choose-skeleton"]').waitFor();await p.evaluate(f=>{localStorage.setItem(f.key,JSON.stringify(f.save));localStorage.setItem(f.hk,f.human);},{key,save:fixture,hk,human});
 await p.goto('http://127.0.0.1:8901/arpg/?character=skeleton_knight');await p.locator('#inn-name').waitFor();await tap('[data-action="bag"]');await tap('[data-action="socket"][data-slot="head"]');await tap('[data-action="open-item"][data-uid="head"]');await tap('[data-action="equip"][data-uid="head"]');
 assert.equal(await p.evaluate(k=>JSON.parse(localStorage.getItem(k)).permanentDeathKnight,key),true);await p.reload();await p.locator('#inn-name').waitFor();await start('S1');
 // Passive page-local observer records actual visual factory outputs; never calls world/sim/input APIs.
 const observe=()=>p.evaluate(()=>{window.dkSamples=[];let previous='';window.dkObserve=true;function sample(){if(!window.dkObserve)return;const w=__arpg.world,v=__arpg.art.visuals[0];if(w&&v){const a=w.entities[0],r={tick:w.tick,terminal:a.terminal,dashLeft:a.dodge?.dashLeft,startedTick:a.dodge?.startedTick,id:v.id,state:v.state,direction:v.direction,frame:v.frame,age:v.age,duration:v.duration,masked:v.dodgeFallback,frozen:__arpg.feedback.frozen.includes(a.id)};const sig=JSON.stringify(r);if(sig!==previous){dkSamples.push(r);previous=sig;}}requestAnimationFrame(sample);}sample();});
 await observe();await p.keyboard.down('KeyJ');await p.waitForFunction(()=>__arpg.art.visuals[0].state==='attack');await p.keyboard.up('KeyJ');
 const directions=[['E',['KeyD']],['SE',['KeyD','KeyS']],['S',['KeyS']],['SW',['KeyS','KeyA']],['W',['KeyA']],['NW',['KeyA','KeyW']],['N',['KeyW']],['NE',['KeyW','KeyD']],['E',['KeyD']],['E',['KeyD']]];
 const dodges=[];
 for(const [dir,keys] of directions){await p.waitForFunction(()=>__arpg.world.entities[0].dodge.cdLeft===0);for(const k of keys)await p.keyboard.down(k);await p.waitForFunction(()=>__arpg.art.visuals[0].state==='run');const prev=await p.evaluate(()=>__arpg.world.entities[0].dodge.startedTick);if(mobile)await tap('#dodge');else await p.keyboard.press('Space');await p.waitForFunction(prev=>__arpg.world.entities[0].dodge.startedTick!==prev,prev);await p.waitForFunction(()=>__arpg.world.entities[0].dodge.dashLeft===0);await p.waitForFunction(()=>__arpg.art.visuals[0].state!=='dodge');for(const k of keys)await p.keyboard.up(k);const samples=await p.evaluate(()=>dkSamples.filter(s=>s.state==='dodge'&&s.startedTick===__arpg.world.entities[0].dodge.startedTick));assert.ok(samples.length,dir);assert.ok(samples.every(s=>s.direction===dir&&s.id==='player-death-knight'&&s.masked===null),JSON.stringify(samples));assert.deepEqual([...new Set(samples.map(s=>s.frame))].sort(),[0,1,2,3,4,5],dir);dodges.push({dir,startedTick:samples[0].startedTick,frames:[...new Set(samples.map(s=>s.frame))],firstAge:samples[0].age});}
 assert.equal(new Set(dodges.map(d=>d.startedTick)).size,10);const s1samples=await p.evaluate(()=>dkSamples);assert.ok(s1samples.some(s=>s.state==='idle'));assert.ok(s1samples.some(s=>s.state==='run'));assert.ok(s1samples.some(s=>s.state==='attack'));assert.ok(s1samples.some(s=>s.state==='dodge'&&s.frame===5),'actual endpoint sampled');
 assert.match(await p.locator('#stage-name').innerText(),/데스나이트/);assert.doesNotMatch(await p.locator('#stage-name').innerText(),/기존 해골|로드 실패/);
 await p.waitForFunction(()=>__arpg.world.entities[0].terminal==='clear',null,{timeout:45000});await p.waitForFunction(()=>__arpg.art.visuals[0].state==='idle');const clearRaw=await p.evaluate(()=>JSON.stringify(__arpg.world));await p.waitForTimeout(150);assert.equal(await p.evaluate(()=>JSON.stringify(__arpg.world)),clearRaw);assert.equal(await p.evaluate(k=>JSON.parse(localStorage.getItem(k)).cleared.S1,key),true);
 const s1={dodges,samples:s1samples,actualTimerClear:true,terminalIdle:true,terminalWorldExact:true};await p.reload();await p.locator('#inn-name').waitFor();assert.equal(await p.evaluate(()=>__arpg.save.permanentDeathKnight),true);
 // Retain genuine native-equip persistent flag. A separate validator-valid Lv30 SAVE
 // removes armor for natural hit/death sampling in legitimately unlocked S2;
 // no forged clear flag or live world mutation.
 let death=await p.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);assert.equal(death.cleared.S1,true);death.equipped={...death.equipped,head:null,body:null,hands:null,feet:null};assert.equal(validateSave(death),true);
 await p.evaluate(f=>localStorage.setItem(f.key,JSON.stringify(f.save)),{key,save:death});await p.reload();await p.locator('#inn-name').waitFor();await start('S2');await observe();
 console.log('S2 natural death approach',mobile?390:1280);let held=new Set(),deadline=Date.now()+120000;
 while(Date.now()<deadline){const w=await p.evaluate(()=>__arpg.world),a=w.entities[0];if(a.dead)break;const enemy=w.entities.filter(e=>e.kind==='monster'&&!e.dead).sort((x,y)=>Math.hypot(x.x-a.x,x.y-a.y)-Math.hypot(y.x-a.x,y.y-a.y))[0];assert.ok(enemy,'existing S2 enemy');const dx=enemy.x-a.x,dy=enemy.y-a.y,near=Math.hypot(dx,dy)<40,next=new Set(near?[]:[...(dx < -12?['KeyA']:dx>12?['KeyD']:[]),...(dy < -12?['KeyW']:dy>12?['KeyS']:[])]);for(const k of held)if(!next.has(k))await p.keyboard.up(k);for(const k of next)if(!held.has(k))await p.keyboard.down(k);held=next;await p.waitForTimeout(150);}
 for(const k of held)await p.keyboard.up(k);assert.equal(await p.evaluate(()=>__arpg.world.entities[0].dead),true,'native approach then real enemy kill');const terminalRaw=await p.evaluate(()=>JSON.stringify(__arpg.world));await p.waitForFunction(()=>__arpg.art.visuals[0].state==='death'&&__arpg.art.visuals[0].frame===9);assert.equal(await p.evaluate(()=>JSON.stringify(__arpg.world)),terminalRaw);const s2samples=await p.evaluate(()=>dkSamples);assert.ok(s2samples.some(s=>s.state==='hit'));assert.ok(s2samples.some(s=>s.state==='death'));assert.ok(!s2samples.some(s=>s.terminal&&s.state==='dodge'));const frozen=s2samples.filter(s=>s.frozen);assert.ok(frozen.length,'real hit-stop observed');for(let i=1;i<s2samples.length;i++){const a=s2samples[i-1],b=s2samples[i];if(a.frozen&&b.frozen){assert.equal(b.age,a.age);assert.equal(b.frame,a.frame);}}
 assert.equal(await p.evaluate(k=>localStorage.getItem(k),hk),human);assert.deepEqual(errors,[]);assert.ok(requests.every(r=>r.status===200),JSON.stringify(requests.filter(r=>r.status!==200)));for(const f of ['atlas-0.webp','atlas-0.webp.json'])assert.ok(requests.some(r=>r.path.endsWith('player-death-knight/'+f)));
 rows.push({width:mobile?390:1280,finalNativeEquip:true,reloadPermanent:true,unequippedStillKit:true,sixStates:[...new Set([...s1samples,...s2samples].map(s=>s.state))],s1,s2samples,requests,errors,humanRawExact:true});writeFileSync(out,JSON.stringify({pass:false,inProgress:true,rows,bindings,screenshots:0,liveWorldWrites:0},null,2));console.log('DK actual native PASS',mobile?390:1280);await ctx.close();
}
 for(const path of new Set(rows.flatMap(r=>r.requests.map(r=>r.path)))){const response=await fetch('http://127.0.0.1:8901'+path);assert.equal(response.status,200);const b=Buffer.from(await response.arrayBuffer());assert.deepEqual(b,readFileSync(root+path.slice(1)));bindings[path]=createHash('sha256').update(b).digest('hex');}
 await Promise.all(pending);writeFileSync(out,JSON.stringify({pass:true,rows,bindings,screenshots:0,liveWorldWrites:0},null,2));
}finally{await browser.close();server.kill();}
