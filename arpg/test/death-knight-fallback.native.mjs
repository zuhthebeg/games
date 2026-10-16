// Failure/human-restoration proof; valid Lv30 SAVE only, no world writes.
import { chromium } from '/home/cocy/.openclaw/workspace/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createSkeletonSave } from '../js/meta/character-creation.js';
import { createSave,validateSave } from '../js/meta/save.js';
import { addXp,xpSpan } from '../js/meta/progression.js';
const root=fileURLToPath(new URL('../../',import.meta.url)),key='arpg.save.v1.slots.skeleton_knight',hk='arpg.save.v1';
let save=createSkeletonSave({lineage:'skeleton_knight',name:'실패검증',answers:[0,0,0,0,0],createdAt:1});let xp=0;for(let l=1;l<30;l++)xp+=xpSpan(l);save={...addXp(save,xp),permanentDeathKnight:true};assert.equal(validateSave(save),true);
const human=JSON.stringify(createSave({name:'Human',answers:[0,0,0,0,0],createdAt:1}));
const server=spawn('python3',['-m','http.server','8902','--bind','127.0.0.1'],{cwd:root,stdio:'ignore'}),browser=await chromium.launch({executablePath:'/home/cocy/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']});const rows=[];
try{for(const mobile of [false,true]){
 const ctx=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:800},hasTouch:mobile,isMobile:mobile}),p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.route('**/www.googletagmanager.com/**',r=>r.fulfill({body:''}));
 const tap=async s=>{await p.locator(s).scrollIntoViewIfNeeded();await(mobile?p.locator(s).tap():p.locator(s).click());},launch=async()=>{await tap('[data-action="board"]');await tap('[data-action="sortie"][data-stage="S1"]');await tap('#sortie-confirm');await p.waitForFunction(()=>__arpg.world?.tick>0);};
 await p.goto('http://127.0.0.1:8902/arpg/');await p.locator('[data-action="choose-skeleton"]').waitFor();await p.evaluate(f=>{localStorage.setItem(f.key,JSON.stringify(f.save));localStorage.setItem(f.hk,f.human);},{key,save,hk,human});
 await p.route('**/assets/sprites/player-death-knight/atlas-0.webp.json',r=>r.fulfill({status:404,body:'missing test fixture'}));
 await p.goto('http://127.0.0.1:8902/arpg/?character=skeleton_knight&paperdoll=0');await p.locator('#inn-name').waitFor();await launch();await p.waitForFunction(()=>!!__arpg.art.failed.death_knight);await p.waitForFunction(()=>document.querySelector('#notice').textContent.includes('아트 로드 실패'));
 const failure=await p.evaluate(()=>JSON.parse(JSON.stringify(__arpg.art.visuals[0])));assert.equal(failure.mode,'procedural');assert.ok(failure.artFallback);assert.ok(failure.loadFailure);assert.match(await p.locator('#stage-name').innerText(),/아트 로드 실패/);const tick=await p.evaluate(()=>__arpg.world.tick);await p.waitForFunction(t=>__arpg.world.tick>t+3,tick);assert.equal(await p.evaluate(k=>localStorage.getItem(k),hk),human);
 await p.waitForFunction(()=>__arpg.world.entities[0].terminal==='clear',null,{timeout:45000});await tap('[data-action="result-inn"]');await p.locator('#inn-name').waitFor();await p.unroute('**/assets/sprites/player-death-knight/atlas-0.webp.json');await tap('[data-action="character-choice"]');await tap('[data-action="choose-human"]');await launch();await p.waitForFunction(()=>__arpg.art.visuals[0]?.id==='hero-sword'&&__arpg.art.visuals[0]?.mode==='atlas');
 const humanArt=await p.evaluate(()=>JSON.parse(JSON.stringify(__arpg.art.visuals[0])));assert.equal(humanArt.presentation,undefined);if(mobile)await tap('#dodge');else await p.keyboard.press('Space');await p.waitForFunction(()=>__arpg.world.entities[0].dodge.cdLeft>0);assert.equal(await p.evaluate(k=>JSON.parse(localStorage.getItem(k)).permanentDeathKnight,key),true);assert.deepEqual(errors,[]);
 // Fresh boot clears the deliberately cached failure, then test restoration from
 // the actual LOADED kit to human in the SAME renderer/provider, without reload.
 await p.goto('http://127.0.0.1:8902/arpg/?character=skeleton_knight&paperdoll=0');await p.locator('#inn-name').waitFor();await launch();await p.waitForFunction(()=>__arpg.art.visuals[0]?.id==='player-death-knight'&&__arpg.art.visuals[0].mode==='atlas');
 await p.waitForFunction(()=>__arpg.world.entities[0].terminal==='clear',null,{timeout:45000});const knightRaw=await p.evaluate(k=>localStorage.getItem(k),key);await tap('[data-action="result-inn"]');await p.locator('#inn-name').waitFor();await tap('[data-action="character-choice"]');await tap('[data-action="choose-human"]');await launch();await p.waitForFunction(()=>__arpg.art.visuals[0]?.id==='hero-sword'&&__arpg.art.visuals[0].mode==='atlas');const restored=await p.evaluate(()=>__arpg.art.visuals[0]);assert.equal(restored.presentation,undefined);assert.equal(await p.evaluate(k=>localStorage.getItem(k),key),knightRaw);assert.deepEqual(errors,[]);
 rows.push({width:mobile?390:1280,failure,humanArt,loadedToHumanSameProvider:restored,failureVisible:true,simulationContinuesHandled:true,humanAtlasRestored:true,humanDodge:true,errors});await ctx.close();
}writeFileSync('/home/cocy/.openclaw/workspace/tmp/arpg-deathknight-fallback-native.json',JSON.stringify({pass:true,rows,screenshots:0,liveWorldWrites:0,negative:'intentional single DK sheet404 only'},null,2));}finally{await browser.close();server.kill();}
