// Isolated browser storage fixtures only. All play uses native keyboard/touch;
// readonly __arpg is observation, never a forced tick/kill/clear or live stat edit.
import { chromium } from '/home/cocy/.openclaw/workspace/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createSave } from '../js/meta/save.js';
const root=fileURLToPath(new URL('../../',import.meta.url));
const humanKey='arpg.save.v1',key='arpg.save.v1.slots.skeleton_knight';
const humanRaw=JSON.stringify(createSave({name:'HUMAN SENT',answers:[0,1,2,3,0],weapon:'blade',createdAt:1}));
const server=spawn('python3',['-m','http.server','8897','--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
const browser=await chromium.launch({executablePath:'/home/cocy/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']});
const rows=[],quick=process.env.SKELETON_CHOICE_ONLY==='1';
try {
for(const mobile of (process.env.KNIGHT_MOBILE_ONLY ? [true] : [false,true])){
 const ctx=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:800},isMobile:mobile,hasTouch:mobile});
 const p=await ctx.newPage(),errors=[],writes=[],bound=[];p.on('pageerror',e=>errors.push(e.message));
 p.on('response',r=>{const path=new URL(r.url()).pathname;if(path.startsWith('/arpg/js/'))bound.push((async()=>{assert.deepEqual(await r.body(),readFileSync(root+path.slice(1)));return path;})());});
 await p.route('**/www.googletagmanager.com/**',r=>r.fulfill({body:''}));
 await p.addInitScript(f=>{if(!sessionStorage.getItem('fixture')){localStorage.setItem(f.key,f.raw);sessionStorage.setItem('fixture','1');}}, {key:humanKey,raw:humanRaw});
 const cdp=await ctx.newCDPSession(p);await cdp.send('DOMStorage.enable');for(const type of ['domStorageItemAdded','domStorageItemUpdated','domStorageItemRemoved'])cdp.on('DOMStorage.'+type,e=>{if(e.storageId.isLocalStorage)writes.push(e.key);});
 const tap=async sel=>{await p.locator(sel).scrollIntoViewIfNeeded();return mobile?p.locator(sel).tap():p.locator(sel).click();};
 const state=()=>p.evaluate(()=>JSON.parse(JSON.stringify(__arpg.world)));
 const save=()=>p.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);
 await p.goto('http://127.0.0.1:8897/arpg/');await p.locator('[data-action="choose-skeleton"]').waitFor();writes.length=0;await tap('[data-action="choose-skeleton"]');
 await p.locator('#hero-name').fill(mobile?'모바일기사':'정상기사');await tap('#name-next');for(const n of [1,2,3,0,2])await tap(`[data-action="answer"][data-choice="${n}"]`);await tap('#quiz-start');
 await p.locator('#inn-name').waitFor();const born=await save();assert.equal(born.items.length,1);assert.equal(born.equipped.body,null);assert.equal(await p.locator('[data-action="knight-play"]').count(),0);
 // Existing shop interaction persists only this slot, no alternate trial menu.
 await tap('[data-action="shop"]');assert.equal(await p.locator('#meta-screen').getAttribute('data-page'),'shop');await tap('[data-action="auto-buy"]');assert.ok((await save()).stacks.potion>born.stacks.potion);assert.ok((await save()).gold<born.gold);await tap('[data-action="inn"]');
 const launch=async id=>{await tap('[data-action="board"]');await tap(`[data-action="sortie"][data-stage="${id}"]`);await tap('#sortie-confirm');await p.waitForFunction(id=>__arpg.world?.round?.stageId===id&&__arpg.world.tick>0,id);};
 console.log('created',mobile);await launch('S1');console.log('S1 started',mobile);let w=await state();assert.equal(w.round.goal,'timer');assert.equal(w.round.playerSide,'right');assert.ok(w.entities[0].x>w.arena.w/2);assert.equal(w.entities[0].dodgeDisabled,undefined);
 await p.waitForFunction(()=>__arpg.art.visuals[0]?.id==='skeleton-warrior'&&__arpg.art.visuals[0]?.mode==='atlas');
 if(mobile)await tap('#dodge');else await p.keyboard.press('Space');await p.waitForFunction(()=>__arpg.world.entities[0].dodge.cdLeft>0);
 if(quick){
  assert.equal(await p.locator('[data-action="unavailable"]').count(),0);
  assert.deepEqual(born.quiz.answers,[1,2,3,0,2]);assert.equal(born.lineage,'skeleton_knight');
  assert.equal(await p.evaluate(k=>localStorage.getItem(k),humanKey),humanRaw);assert.deepEqual(errors,[]);
  rows.push({width:mobile?390:1280,singleChoice:true,name:born.name,answers:born.quiz.answers,normalS1:true,rightSide:true,actualDodge:true,humanExact:true,errors,bound:[...new Set(await Promise.all(bound))]});await ctx.close();continue;
 }
 // Timer is the real 900-tick S1 goal, never advanced by evaluate.
 await p.waitForFunction(()=>__arpg.world.round.state!=='running',null,{timeout:60000});assert.equal((await state()).entities[0].terminal,'clear');
 const s1=await save();assert.ok(s1.lastReceipt.xpGained>0);assert.equal(s1.cleared.S1,true);assert.ok(s1.level>born.level||s1.xp>born.xp);
 const finish=async()=>{
  if(await p.locator('#allocation-confirm').count()){
   let guard=200;while(await p.locator('#allocation-confirm').isDisabled()&&guard--){const plus=p.locator('[data-action="stat-plus"]:not(:disabled)').first();await (mobile?plus.tap():plus.click());}assert.ok(guard>0);await tap('#allocation-confirm');
  }
  await tap('[data-action="result-inn"]');await p.locator('#inn-name').waitFor();
 };
 await finish();await launch('S2');
 const beforeS2=await save();let kills=0,dodges=0,skills=0,potions=0;
 // Auto attack is a normal native toggle; steering/potions/skills remain native.
 await tap('[data-battle-settings]');await tap('[data-battle-auto="on"]');await tap('[data-battle-settings]');
 assert.equal(await p.evaluate(()=>localStorage.getItem('arpg.autoAttack')),'1');
 console.log('S2 start',mobile);
 let heldKeys=new Set(),touching=false;const joy={x:70,y:480,id:1};
 const stop=async()=>{for(const k of heldKeys)await p.keyboard.up(k);heldKeys.clear();if(touching){await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});touching=false;}};
 const begun=Date.now();let lastSkill=0,lastDodge=0,lastLog=0;
 while(Date.now()-begun<260000){
  w=await state();if(w.round.state!=='running')break;
  if(Date.now()-lastLog>10000){console.log('combat',mobile,w.tick,w.entities.map(e=>({type:e.type||e.kind,x:e.x,y:e.y,hp:e.hp,dead:e.dead})));lastLog=Date.now();}const a=w.entities[0];assert.ok(!a.dead,'native character survives');
  const enemies=w.entities.filter(e=>e.kind==='monster'&&!e.dead);kills=w.entities.filter(e=>e.kind==='monster'&&e.dead).length;
  const enemy=enemies.sort((a1,b)=>Math.hypot(a1.x-a.x,a1.y-a.y)-Math.hypot(b.x-a.x,b.y-a.y))[0];
  let mx=0,my=0;if(enemy){const dx=enemy.x-a.x,dy=enemy.y-a.y,dist=Math.hypot(dx,dy);if(dist>58){mx=dx/dist;my=dy/dist;}}
  if(mobile){
   if(!touching){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[joy]});touching=true;}
   await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...joy,x:joy.x+mx*42,y:joy.y+my*42}]});
  }else{
   const next=new Set([...(mx<-.2?['KeyA']:mx>.2?['KeyD']:[]),...(my<-.2?['KeyW']:my>.2?['KeyS']:[])]);
   for(const k of heldKeys)if(!next.has(k))await p.keyboard.up(k);for(const k of next)if(!heldKeys.has(k))await p.keyboard.down(k);heldKeys=next;
  }
  if(enemy&&Date.now()-lastSkill>5000&&a.mp>10){if(mobile){await stop();await tap('#skill');}else await p.keyboard.press('KeyK');lastSkill=Date.now();skills++;}
  if(enemy?.act&&Date.now()-lastDodge>1800){if(mobile){await stop();await tap('#dodge');}else await p.keyboard.press('Space');lastDodge=Date.now();dodges++;}
  if(a.hp<a.maxHp*.65&&a.potions>0&&a.potionCd===0){if(mobile){await stop();await tap('#potion');}else await p.keyboard.press('KeyQ');potions++;}
  await p.waitForTimeout(130);
 }
 await stop();w=await state();assert.equal(w.round.state,'clear',JSON.stringify({round:w.round,entities:w.entities,auto:await p.evaluate(()=>localStorage.getItem('arpg.autoAttack')),errors}));assert.equal(w.entities[0].terminal,'clear');
 const afterS2=await save();assert.equal(afterS2.cleared.S2,true);assert.equal(afterS2.lastReceipt.stageId,'S2');assert.ok(afterS2.lastReceipt.xpGained>0);assert.ok(afterS2.lastReceipt.goldGained>0);assert.ok(afterS2.completedRounds>=2);assert.ok(Object.values(afterS2.skillMastery).some(n=>n>0));
 await finish();const final=await save(),raw=await p.evaluate(k=>localStorage.getItem(k),key);await p.reload();await p.locator('#inn-name').waitFor();assert.equal(await p.evaluate(k=>localStorage.getItem(k),key),raw);assert.deepEqual(await p.evaluate(()=>JSON.parse(JSON.stringify(__arpg.save))),final);
 assert.equal(await p.evaluate(k=>localStorage.getItem(k),humanKey),humanRaw);assert.ok(writes.filter(k=>k.startsWith('arpg.save')).every(k=>k===key),JSON.stringify(writes));
 await tap('[data-action="character-choice"]');await tap('[data-action="choose-human"]');await launch('S1');await p.waitForFunction(()=>__arpg.art.visuals[0]?.id==='hero-sword'||__arpg.art.visuals[0]?.mode==='paperdoll');assert.equal((await state()).round.playerSide,undefined);assert.equal((await state()).entities[0].dodgeDisabled,undefined);
 if(mobile)await tap('#dodge');else await p.keyboard.press('Space');await p.waitForFunction(()=>__arpg.world.entities[0].dodge.cdLeft>0);assert.equal(await p.evaluate(k=>localStorage.getItem(k),key),raw);assert.deepEqual(errors,[]);
 rows.push({width:mobile?390:1280,created:born,s1Receipt:s1.lastReceipt,s2Receipt:afterS2.lastReceipt,final,skills,dodges,potions,kills,reloadExact:true,humanRawExactBeforeSelect:true,humanS1NormalAndDodge:true,errors,bound:[...new Set(await Promise.all(bound))]});writeFileSync('/home/cocy/.openclaw/workspace/tmp/arpg-knight-normal-game-native-partial.json',JSON.stringify(rows,null,2));await ctx.close();
}
const evidence={pass:true,rows,screenshots:0,liveWorldWrites:0};
writeFileSync('/home/cocy/.openclaw/workspace/tmp/'+(quick?'arpg-skeleton-single-choice-native.json':'arpg-knight-normal-game-native.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
}finally{await browser.close();server.kill();}
