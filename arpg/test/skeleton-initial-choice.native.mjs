// Native button/keyboard/touch only; diagnostics are readonly. No screenshots/world injection.
import { chromium } from '/home/cocy/.openclaw/workspace/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import {createSave} from '../js/meta/save.js';
import {createSkeletonSave} from '../js/meta/character-creation.js';
import {buildRoundMods} from '../js/meta/run.js';
const root=fileURLToPath(new URL('../../',import.meta.url));
const humanRaw=JSON.stringify(createSave({name:'SENTINEL',answers:[0,1,2,3,0],weapon:'blade',createdAt:1}));
const key='arpg.save.v1.slots.skeleton_knight', humanKey='arpg.save.v1';
const server=spawn('python3',['-m','http.server','8896','--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
const browser=await chromium.launch({executablePath:'/home/cocy/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']});
const results=[];
const tap=async(p,selector,mobile)=>mobile?p.locator(selector).tap():p.locator(selector).click();
async function context(mobile,fixture){
 const ctx=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:800},isMobile:mobile,hasTouch:mobile});
 const page=await ctx.newPage(),errors=[],writes=[],bound=[];
 page.on('response',r=>{const p=new URL(r.url()).pathname;if(p.startsWith('/arpg/js/'))bound.push((async()=>{assert.deepEqual(await r.body(),readFileSync(root+p.slice(1)));return p;})());});
 await page.route('**/www.googletagmanager.com/**',r=>r.fulfill({body:''}));
 if(fixture)await page.addInitScript(f=>{if(!sessionStorage.getItem('fixture')){for(const[k,v]of Object.entries(f))localStorage.setItem(k,v);sessionStorage.setItem('fixture','1');}},fixture);
 page.on('pageerror',e=>errors.push(e.message));
 const cdp=await ctx.newCDPSession(page);await cdp.send('DOMStorage.enable');
 for(const type of ['domStorageItemAdded','domStorageItemUpdated','domStorageItemRemoved','domStorageItemsCleared'])cdp.on(`DOMStorage.${type}`,e=>{if(e.storageId.isLocalStorage)writes.push({type,...e});});
 await page.goto('http://127.0.0.1:8896/arpg/');await page.locator('[data-action="choose-skeleton"]').waitFor();
 return{ctx,page,cdp,errors,writes,bound};
}
async function nameQuiz(page,mobile,name){
 await tap(page,'[data-action="choose-skeleton"]',mobile);assert.equal(await page.locator('[data-action="unavailable"]:disabled').count(),2);
 await tap(page,'[data-action="choose-knight"]',mobile);await page.locator('#hero-name').fill(name);await tap(page,'#name-next',mobile);
 for(const n of [1,2,3,0,2])await tap(page,`[data-action="answer"][data-choice="${n}"]`,mobile);
 assert.match(await page.locator('#meta-screen').textContent(),/해골 기사 · 무기: 검/);assert.equal(await page.locator('[data-action="override"]').count(),0);
}
try{
 for(const mobile of [false,true]){
  const {ctx,page,cdp,errors,writes,bound}=await context(mobile,mobile?{[humanKey]:humanRaw}:null);
  const name=mobile?'모바일 문답기사':'시크릿 문답기사';await nameQuiz(page,mobile,name);
  // Cancel before creation: absolutely no character write.
  await tap(page,'[data-action="character-choice"]',mobile);assert.equal(await page.evaluate(k=>localStorage.getItem(k),key),null);
  await nameQuiz(page,mobile,name);const baseline=writes.length;
  await tap(page,'#quiz-start',mobile);
  await page.waitForFunction(()=>__arpg.mode==='skeleton-trial'&&__arpg.world.tick>0&&__arpg.art.visuals.every(v=>v.mode==='atlas'));
  assert.equal(new URL(page.url()).searchParams.has('debug'),false);assert.equal(await page.locator('#arpg-debug-toggle').count(),0);
  const raw=await page.evaluate(k=>localStorage.getItem(k),key),save=JSON.parse(raw),mods=buildRoundMods(save);
  assert.equal(save.name,name);assert.deepEqual(save.quiz.answers,[1,2,3,0,2]);assert.equal(save.level,1);
  const first=await page.evaluate(()=>JSON.parse(JSON.stringify(__arpg.world)));
  assert.ok(first.entities[0].x>first.entities[1].x);assert.equal(first.round,null);assert.equal(first.entities[0].maxMp,mods.maxMp);assert.equal(first.entities[0].poiseMult,mods.poiseMult);assert.equal(first.entities[0].potions,mods.potions);assert.equal(first.entities[0].manaPotions,mods.manaPotions);
  assert.match(await page.locator('#stage-name').textContent(),new RegExp(name));assert.doesNotMatch(await page.locator('#hud').textContent(),/디버그 고정 프리셋/);
  const x=first.entities[0].x;
  if(mobile){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:65,y:470}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:110,y:470}]});await page.waitForTimeout(200);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
  else{await page.keyboard.down('KeyD');await page.waitForTimeout(200);await page.keyboard.up('KeyD');}
  assert.ok(await page.evaluate(x=>__arpg.world.entities[0].x>x,x));
  if(mobile)await tap(page,'#skill',true);else await page.keyboard.press('KeyK');
  await page.waitForFunction(()=>__arpg.world.entities[0].act?.id==='lunge');
  if(mobile){const b=await page.locator('#attack').boundingBox();await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height/2}]});}else await page.keyboard.down('KeyJ');
  await page.waitForFunction(()=>__arpg.world.entities[1].dead||__arpg.world.entities[0].dead,null,{timeout:90000});
  if(mobile)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else await page.keyboard.up('KeyJ');
  assert.ok(await page.evaluate(()=>__arpg.world.entities[1].dead),'actual chosen profile wins using native attack');
  const tick=await page.evaluate(()=>__arpg.world.tick);await tap(page,'[data-undead-action="next"]',mobile);
  await page.waitForFunction(t=>__arpg.world.tick>0&&__arpg.world.tick<t&&!__arpg.world.entities[1].dead,tick);
  // Reload selects the saved profile, never generates or rewrites it.
  await page.reload();await page.locator('[data-action="knight-play"]').waitFor();assert.match(await page.locator('#skeleton-name').textContent(),new RegExp(`${name} · Lv.1`));assert.equal(await page.evaluate(k=>localStorage.getItem(k),key),raw);
  await tap(page,'[data-action="knight-play"]',mobile);await page.waitForFunction(()=>__arpg.mode==='skeleton-trial'&&__arpg.world.tick>0);
  assert.deepEqual(await page.evaluate(()=>JSON.parse(JSON.stringify(__arpg.character))),save);
  await page.keyboard.press('KeyR');await page.waitForFunction(()=>__arpg.world.entities[0].terminal==='return_scroll',null,{timeout:15000});
  await tap(page,'[data-undead-action="leave"]',mobile);await page.locator('#skeleton-name').waitFor();await tap(page,'[data-action="character-choice"]',mobile);
  await tap(page,'[data-action="choose-human"]',mobile);
  if(mobile){assert.match(await page.locator('#inn-name').textContent(),/SENTINEL/);assert.equal(await page.evaluate(k=>localStorage.getItem(k),humanKey),humanRaw);}
  else{await page.locator('[data-action="name"]').waitFor();assert.equal(await page.evaluate(k=>localStorage.getItem(k),humanKey),null);}
  assert.equal(await page.evaluate(k=>localStorage.getItem(k),key),raw);
  assert.deepEqual(writes.slice(baseline).map(e=>e.key),[key]);assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  // The returned human path still uses its original creation/launch and real dodge.
  if(mobile){await tap(page,'[data-action="board"]',mobile);await tap(page,'[data-action="sortie"][data-stage="S1"]',mobile);await tap(page,'#sortie-confirm',mobile);}
  else{
    await tap(page,'[data-action="name"]',false);await page.locator('#hero-name').fill('새 인간');await tap(page,'#name-next',false);
    for(const n of [0,1,2,3,0])await tap(page,`[data-action="answer"][data-choice="${n}"]`,false);
    assert.equal(await page.locator('[data-action="override"]').count(),3);await tap(page,'#quiz-start',false);
    const h=JSON.parse(await page.evaluate(()=>localStorage.getItem('arpg.save.v1')));assert.deepEqual(h.quiz.answers,[0,1,2,3,0]);assert.deepEqual(h.stats,createSave({name:'새 인간',answers:[0,1,2,3,0],createdAt:1}).stats);
  }
  await page.waitForFunction(()=>__arpg.mode==='human'&&__arpg.world?.round?.stageId==='S1'&&__arpg.world.tick>0);
  assert.equal(await page.evaluate(()=>__arpg.world.entities[0].dodgeDisabled),undefined);await page.keyboard.press('Space');await page.waitForFunction(()=>__arpg.world.entities[0].dodge.cdLeft>0);
  assert.equal(await page.evaluate(k=>localStorage.getItem(k),key),raw);assert.deepEqual(errors,[]);
  results.push({width:mobile?390:1280,name,answers:save.quiz.answers,createdAt:save.createdAt,winNext:true,reloadResume:true,returnSwitch:true,humanExact:true,saveWritesDuringSkeleton:[key],humanActualS1Dodge:true,errors,bound:[...new Set(await Promise.all(bound))]});await ctx.close();
 }
 // Occupied and corrupt slots are inspected without SaveStore.load/quarantine/fallback.
 for(const value of ['BROKEN',humanRaw,JSON.stringify(createSkeletonSave({lineage:'skeleton_knight',name:'既存기사',answers:[3,2,1,0,3],createdAt:9}))]){
  const {ctx,page,writes,errors}=await context(false,{[humanKey]:humanRaw,[key]:value});const baseline=writes.length;
  await tap(page,'[data-action="choose-skeleton"]',false);await tap(page,'[data-action="choose-knight"]',false);
  if(value.includes('既存기사')){await page.locator('#skeleton-name').waitFor();assert.match(await page.locator('#skeleton-name').textContent(),/既存기사/);}
  else{assert.match(await page.locator('#meta-error').textContent(),/손상/);assert.equal(await page.locator('#hero-name').count(),0);}
  assert.equal(await page.evaluate(k=>localStorage.getItem(k),key),value);assert.equal(await page.evaluate(k=>localStorage.getItem(k),humanKey),humanRaw);assert.deepEqual(writes.slice(baseline),[]);assert.deepEqual(errors,[]);results.push({occupied:true,corrupt:!value.includes('既存기사'),writes:0});await ctx.close();
 }
 console.log(JSON.stringify({pass:true,results,screenshots:0,worldInjection:false},null,2));
}finally{await browser.close();server.kill();}
