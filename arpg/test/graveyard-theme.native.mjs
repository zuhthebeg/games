// Isolated browser storage fixtures only. All play uses native keyboard/touch;
// readonly __arpg is observation, never a forced tick/kill/clear or live stat edit.
import { chromium } from '/home/cocy/.openclaw/workspace/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createSkeletonSave } from '../js/meta/character-creation.js';
import { addXp,xpSpan } from '../js/meta/progression.js';
import { createSave,validateSave } from '../js/meta/save.js';
const root=fileURLToPath(new URL('../../',import.meta.url));
const humanKey='arpg.save.v1',key='arpg.save.v1.slots.skeleton_knight';
const humanRaw=JSON.stringify(createSave({name:'HUMAN SENT',answers:[0,1,2,3,0],weapon:'blade',createdAt:1}));
const server=spawn('python3',['-m','http.server','8915','--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
const browser=await chromium.launch({executablePath:'/home/cocy/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']});
const rows=[];
try {
for(const mobile of [false,true]){
 const ctx=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:800},isMobile:mobile,hasTouch:mobile});
 const p=await ctx.newPage(),errors=[],writes=[],bound=[];p.on('pageerror',e=>errors.push(e.message));
 p.on('response',r=>{const path=new URL(r.url()).pathname;if(path.startsWith('/arpg/js/')||path==='/arpg/css/game.css')bound.push((async()=>{assert.deepEqual(await r.body(),readFileSync(root+path.slice(1)));return path;})().catch(e=>{errors.push('binding: '+e.message);return path;}));});
 await p.route('**/www.googletagmanager.com/**',r=>r.fulfill({body:''}));
 await p.addInitScript(f=>{if(!sessionStorage.getItem('fixture')){localStorage.setItem(f.key,f.raw);sessionStorage.setItem('fixture','1');}}, {key:humanKey,raw:humanRaw});
 const cdp=await ctx.newCDPSession(p);await cdp.send('DOMStorage.enable');for(const type of ['domStorageItemAdded','domStorageItemUpdated','domStorageItemRemoved'])cdp.on('DOMStorage.'+type,e=>{if(e.storageId.isLocalStorage)writes.push(e.key);});
 const tap=async sel=>{await p.locator(sel).scrollIntoViewIfNeeded();return mobile?p.locator(sel).tap():p.locator(sel).click();};
 const computed=()=>p.evaluate(()=>{const css=s=>{const n=document.querySelector(s),c=getComputedStyle(n);return {color:c.color,background:c.backgroundColor,image:c.backgroundImage,border:c.borderTopColor};};return {theme:document.body.dataset.theme||null,body:css('body'),shell:css('.inn-shell'),header:css('.game-header'),button:css('[data-action="board"]'),hp:css('#hp-fill'),mp:css('#mp-fill'),hpLabel:css('#hp-text'),mpLabel:css('#mp-text'),overflow:document.documentElement.scrollWidth>innerWidth};});
 const state=()=>p.evaluate(()=>JSON.parse(JSON.stringify(__arpg.world)));
 const save=()=>p.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);
 await p.goto('http://127.0.0.1:8915/arpg/');await p.locator('[data-action="choose-skeleton"]').waitFor();writes.length=0;await tap('[data-action="choose-human"]');await p.locator('#inn-name').waitFor();const baseline=await computed();assert.equal(baseline.theme,null);await tap('[data-action="character-choice"]');await tap('[data-action="choose-skeleton"]');assert.equal(await p.evaluate(()=>document.body.dataset.theme||null),null);await tap('[data-action="character-choice"]');assert.equal(await p.evaluate(()=>document.body.dataset.theme||null),null);await tap('[data-action="choose-skeleton"]');
 await p.locator('#hero-name').fill(mobile?'모바일기사':'정상기사');await tap('#name-next');for(const n of [1,2,3,0,2])await tap(`[data-action="answer"][data-choice="${n}"]`);await tap('#quiz-start');
 await p.locator('#inn-name').waitFor();const born=await save();const themed=await computed();assert.equal(themed.theme,'graveyard');assert.equal(themed.overflow,false);assert.equal(born.items.length,1);assert.equal(born.equipped.body,null);assert.equal(await p.locator('[data-action="knight-play"]').count(),0);
 // Existing shop interaction persists only this slot, no alternate trial menu.
 await tap('[data-action="shop"]');assert.equal(await p.locator('#meta-screen').getAttribute('data-page'),'shop');await tap('[data-action="auto-buy"]');assert.ok((await save()).stacks.potion>born.stacks.potion);assert.ok((await save()).gold<born.gold);await tap('[data-action="inn"]');
 const launch=async id=>{await tap('[data-action="board"]');await tap(`[data-action="sortie"][data-stage="${id}"]`);await tap('#sortie-confirm');await p.waitForFunction(id=>__arpg.world?.round?.stageId===id&&__arpg.world.tick>0,id);};
 for(const [action,label] of [['inventory','묘실의 유품함'],['character','영혼의 제단'],['merchant','도굴꾼'],['forge','저주받은 대장장이'],['trainer','아카데미'],['bag','가방'],['board','묘지 밖으로 출정']]){await tap(`[data-action="${action}"]`);assert.equal(await p.locator('#meta-screen h2').first().innerText(),label);assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await tap('[data-action="inn"]');}
 assert.equal(await p.locator('.inn-recovery strong').innerText(),'관에서 안식');
 console.log('created',mobile);await launch('S1');console.log('S1 started',mobile);let w=await state();assert.equal(w.round.goal,'timer');assert.equal(w.round.playerSide,'right');assert.ok(w.entities[0].x>w.arena.w/2);assert.equal(w.entities[0].dodgeDisabled,undefined);
 await p.waitForFunction(()=>__arpg.art.visuals[0]?.id==='player-skeleton-equipment');
 const battle=await computed();assert.equal(battle.theme,'graveyard');assert.match(await p.locator('#hp-text').innerText(),/^HP \d/);assert.match(await p.locator('#mp-text').innerText(),/^MP \d/);assert.notEqual(battle.hp.image,battle.mp.image);assert.equal(battle.overflow,false);assert.match(battle.hp.image,/82, 119, 53/);assert.match(battle.mp.image,/70, 52, 79/);
 if(mobile)await tap('#dodge');else await p.keyboard.press('Space');await p.waitForFunction(()=>__arpg.world.entities[0].dodge.cdLeft>0);
 // Timer is the real 900-tick S1 goal, never advanced by evaluate.
 await p.waitForFunction(()=>__arpg.world.round.state!=='running',null,{timeout:60000});assert.equal((await state()).entities[0].terminal,'clear');
 const s1=await save();assert.ok(s1.lastReceipt.xpGained>0);assert.equal(s1.cleared.S1,true);assert.ok(s1.level>born.level||s1.xp>born.xp);
 const finish=async()=>{
  if(await p.locator('#allocation-confirm').count()){
   assert.ok((await p.locator('#meta-screen h2').first().innerText()).includes('영혼의 제단'));
   let guard=200;while(await p.locator('#allocation-confirm').isDisabled()&&guard--){const plus=p.locator('[data-action="stat-plus"]:not(:disabled)').first();await (mobile?plus.tap():plus.click());}assert.ok(guard>0);await tap('#allocation-confirm');
  }
  assert.equal(await p.locator('#result-back').innerText(),'잊힌 묘지로');
  await tap('[data-action="result-inn"]');await p.locator('#inn-name').waitFor();
 };
 const settled=(await state()).entities[0];assert.equal(settled.terminal,'clear');
 await finish();const recovered=(await state()).entities[0];assert.equal(recovered.hp,recovered.maxHp);assert.equal(recovered.mp,recovered.maxMp);assert.ok(writes.filter(k=>k.startsWith('arpg.save')).every(k=>k===key));assert.equal(await p.locator('#meta-screen h1').innerText(),'잊힌 묘지');
 await tap('[data-action="character-choice"]');assert.equal(await p.evaluate(()=>document.body.dataset.theme||null),null);await tap('[data-action="choose-human"]');
 assert.equal(await p.locator('#meta-screen h1').innerText(),'잿빛 여관');assert.equal(await p.locator('[data-action="inventory"]').innerText(),'창고');
 assert.equal(await p.evaluate(k=>localStorage.getItem(k),humanKey),humanRaw);const restored=await computed();assert.deepEqual(restored,baseline);
 // Validator-valid permanent DK fixture; no live world changes.
 let dk=createSkeletonSave({lineage:'skeleton_knight',name:'DK theme',answers:[0,0,0,0,0],createdAt:1}),xp=0;for(let l=1;l<30;l++)xp+=xpSpan(l);dk=addXp(dk,xp);dk.permanentDeathKnight=true;assert.equal(validateSave(dk),true);
 await p.evaluate(f=>localStorage.setItem(f.key,JSON.stringify(f.dk)),{key,dk});await p.goto('http://127.0.0.1:8915/arpg/?character=skeleton_knight');await p.locator('#inn-name').waitFor();const dkTheme=await computed();assert.deepEqual(dkTheme,themed);await launch('S1');await p.waitForFunction(()=>__arpg.art.visuals[0]?.id==='player-death-knight');assert.equal((await computed()).theme,'graveyard');assert.deepEqual(errors,[]);
 await p.waitForLoadState('networkidle');p.removeAllListeners('response');await Promise.all(bound);assert.deepEqual(errors,[]);rows.push({width:mobile?390:1280,freshCreation:true,baseline,themed,battle,restored,dkTheme,corePanels:true,naturalS1:s1.lastReceipt,graveyardReturn:true,humanExact:true,errors,bound:[...new Set(await Promise.all(bound))]});writeFileSync('/home/cocy/.openclaw/workspace/tmp/arpg-graveyard-theme-partial.json',JSON.stringify({rows},null,2));await ctx.close();
}
const evidence={pass:true,rows,screenshots:0,liveWorldWrites:0};
writeFileSync('/home/cocy/.openclaw/workspace/tmp/'+'arpg-graveyard-theme-native.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
}finally{await browser.close();server.kill();}
