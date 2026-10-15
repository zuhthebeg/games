import { chromium } from '/home/cocy/.openclaw/workspace/node_modules/playwright/index.mjs';
import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';import assert from 'node:assert/strict';
import {createSave} from '../js/meta/save.js';import {createSkeletonSave} from '../js/meta/character-creation.js';
const root=fileURLToPath(new URL('../../',import.meta.url)),key='arpg.save.v1.slots.skeleton_knight';
const raw=JSON.stringify(createSave({name:'SENTINEL',answers:[0,1,2,3,0],createdAt:1}));
const knight=JSON.stringify(createSkeletonSave({lineage:'skeleton_knight',name:'보존 기사',answers:[2,3,1,0,2],createdAt:8}));
const server=spawn('python3',['-m','http.server','8897','--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
const browser=await chromium.launch({executablePath:'/home/cocy/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']});const results=[];
async function setup(withKnight=true,quota=false,{humanRaw=raw,missingArt=false}={}){const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 await ctx.addInitScript(({raw,knight,key,withKnight,quota})=>{localStorage.setItem('arpg.save.v1',raw);if(withKnight)localStorage.setItem(key,knight);
 // Actual native storage capacity, not monkeypatched methods or fake throwing adapters.
 if(quota){let lo=0,hi=6*1024*1024;while(lo+1<hi){const n=Math.floor((lo+hi)/2);try{localStorage.setItem('test-quota-padding','x'.repeat(n));lo=n;}catch{hi=n;}}localStorage.setItem('test-quota-padding','x'.repeat(Math.max(0,lo-128)));}
 },{raw:humanRaw,knight,key,withKnight,quota});const page=await ctx.newPage(),writes=[],errors=[];
 await page.route('**/www.googletagmanager.com/**',r=>r.fulfill({body:''}));page.on('pageerror',e=>errors.push(e.message));
 if(missingArt)await page.route('**/assets/sprites/manifest.json',async r=>{const response=await r.fetch();const manifest=await response.json();await r.fulfill({json:manifest.filter(e=>e.id!=='hero-sword')});});
 const cdp=await ctx.newCDPSession(page);await cdp.send('DOMStorage.enable');for(const t of ['domStorageItemAdded','domStorageItemUpdated','domStorageItemRemoved'])cdp.on(`DOMStorage.${t}`,e=>{if(e.storageId.isLocalStorage)writes.push(e.key);});
 await page.goto('http://127.0.0.1:8897/arpg/');await page.locator('[data-action="choose-skeleton"]').waitFor();return{ctx,page,writes,errors};}
async function choose(page){await page.locator('[data-action="choose-skeleton"]').tap();await page.locator('[data-action="choose-knight"]').tap();}
try{
 // Native cancel while the production import is unresolved, followed by safe cached reentry.
 const a=await setup();await choose(a.page);let release,requested;const gate=new Promise(r=>release=r),asked=new Promise(r=>requested=r);
 await a.page.route('**/js/solo/undead-session.js*',async r=>{requested();await gate;await r.continue();});const baseline=a.writes.length;
 await a.page.locator('[data-action="knight-play"]').tap();await asked;
 await a.page.locator('#knight-return').waitFor({timeout:2000});await a.page.locator('#knight-return').tap();release();
 await a.page.locator('#skeleton-name').waitFor();await a.page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 assert.equal(await a.page.evaluate(()=>__arpg.world),null);assert.equal(await a.page.evaluate(k=>localStorage.getItem(k),key),knight);
 await a.page.locator('[data-action="knight-play"]').tap();await a.page.waitForFunction(()=>__arpg.mode==='skeleton-trial'&&__arpg.world.tick>0);
 await a.page.locator('#knight-return').tap();await a.page.locator('#skeleton-name').waitFor();assert.equal(await a.page.evaluate(()=>localStorage.getItem('arpg.save.v1')),raw);assert.deepEqual(a.writes.slice(baseline),[]);assert.deepEqual(a.errors,[]);await a.ctx.close();results.push({pendingCancelReentry:true,writes:0});
 // Change only this isolated fixture's storage while the real production import is pending.
 for(const change of ['corrupt','remove','replace']){
  const f=await setup();await choose(f.page);let release,requested;
  const gate=new Promise(r=>release=r),asked=new Promise(r=>requested=r);
  await f.page.route('**/js/solo/undead-session.js*',async r=>{requested();await gate;await r.continue();});
  const before=f.writes.length;await f.page.locator('[data-action="knight-play"]').tap();await asked;
  const changed=change==='remove'?null:change==='corrupt'?'CORRUPTED-WHILE-IMPORT-PENDING':JSON.stringify({...JSON.parse(knight),name:'Replacement'});
  await f.page.evaluate(({key,changed})=>{if(changed===null)localStorage.removeItem(key);else localStorage.setItem(key,changed);},{key,changed});
  release();await f.page.waitForFunction(()=>document.querySelector('#meta-error')?.textContent.length>0);
  assert.match(await f.page.locator('#meta-error').textContent(),/손상|슬롯이 변경/);
  assert.equal(await f.page.evaluate(()=>__arpg.world),null);assert.notEqual(await f.page.evaluate(()=>__arpg.mode),'skeleton-trial');
  assert.equal(await f.page.locator('#meta-screen').isVisible(),true);assert.equal(await f.page.locator('#knight-return').count(),0);
  assert.equal(await f.page.evaluate(k=>localStorage.getItem(k),key),changed);assert.equal(await f.page.evaluate(()=>localStorage.getItem('arpg.save.v1')),raw);
  assert.deepEqual(f.writes.slice(before),[key],'only the explicit fixture change, no application storage writes');assert.deepEqual(f.errors,[]);
  // A fresh native selection of a valid replacement remains playable, using the now-cached module.
  if(change==='replace'){
   await f.page.locator('[data-action="character-choice"]').tap();await choose(f.page);
   await f.page.locator('[data-action="knight-play"]').tap();await f.page.waitForFunction(()=>__arpg.mode==='skeleton-trial'&&__arpg.world.tick>0);
   assert.match(await f.page.locator('#stage-name').textContent(),/Replacement/);
   await f.page.locator('#knight-return').tap();assert.equal(await f.page.evaluate(k=>localStorage.getItem(k),key),changed);
   assert.equal(await f.page.evaluate(()=>localStorage.getItem('arpg.save.v1')),raw);assert.deepEqual(f.writes.slice(before),[key]);
  }
  await f.ctx.close();results.push({pendingSlotChange:change,refused:true,applicationWrites:0,cachedReplacement:change==='replace'});
 }
 // Production module init failure must restore profile and preserve both slots.
 const b=await setup();await choose(b.page);await b.page.route('**/js/solo/undead-session.js*',r=>r.fulfill({contentType:'text/javascript',body:'throw new Error("native init fault");'}));const before=b.writes.length;
 await b.page.locator('[data-action="knight-play"]').tap();await b.page.waitForFunction(()=>document.querySelector('#meta-error')?.textContent.includes('native init fault'));
 assert.equal(await b.page.evaluate(()=>__arpg.world),null);assert.equal(await b.page.locator('#meta-screen').isVisible(),true);assert.equal(await b.page.locator('#knight-return').count(),0);assert.equal(await b.page.evaluate(k=>localStorage.getItem(k),key),knight);assert.equal(await b.page.evaluate(()=>localStorage.getItem('arpg.save.v1')),raw);assert.deepEqual(b.writes.slice(before),[]);assert.deepEqual(b.errors,[]);await b.ctx.close();results.push({initRollback:true,writes:0});
 // Corrupt human bytes are not even quarantined when selecting or playing skeleton.
 const c=await setup(true,false,{humanRaw:'CORRUPT-HUMAN-SENTINEL'});const cb=c.writes.length;await choose(c.page);await c.page.locator('[data-action="knight-play"]').tap();await c.page.waitForFunction(()=>__arpg.mode==='skeleton-trial'&&__arpg.world.tick>0);await c.page.locator('#knight-return').tap();assert.equal(await c.page.evaluate(()=>localStorage.getItem('arpg.save.v1')),'CORRUPT-HUMAN-SENTINEL');assert.deepEqual(c.writes.slice(cb),[]);await c.ctx.close();results.push({corruptHumanUntouched:true,writes:0});
 // Empty-slot write failure uses actual Chromium quota; UI remains cancellable, no fallback.
 const q=await setup(false,true);await choose(q.page);await q.page.locator('#hero-name').fill('용량 기사');await q.page.locator('#name-next').tap();for(let i=0;i<5;i++)await q.page.locator('[data-action="answer"][data-choice="0"]').tap();const qb=q.writes.length;
 await q.page.locator('#quiz-start').tap();await q.page.waitForFunction(()=>document.querySelector('#meta-error')?.textContent.length>0);
 assert.equal(await q.page.evaluate(k=>localStorage.getItem(k),key),null);assert.equal(await q.page.evaluate(()=>localStorage.getItem('arpg.save.v1')),raw);assert.equal(await q.page.evaluate(()=>__arpg.world),null);assert.deepEqual(q.writes.slice(qb),[]);await q.page.locator('[data-action="character-choice"]').tap();await q.page.locator('[data-action="choose-human"]').tap();assert.match(await q.page.locator('#inn-name').textContent(),/SENTINEL/);assert.deepEqual(q.errors,[]);results.push({realQuotaWriteFailure:true,humanExact:true,writes:0});await q.ctx.close();
 // Required art is refused before a single simulation tick; native return remains usable.
 const m=await setup(true,false,{missingArt:true});await choose(m.page);const mb=m.writes.length;
 await m.page.locator('[data-action="knight-play"]').tap();await m.page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('필수 아틀라스 실패'));
 assert.equal(await m.page.evaluate(()=>__arpg.world.tick),0);await m.page.locator('#knight-return').tap();await m.page.locator('#skeleton-name').waitFor();
 assert.equal(await m.page.evaluate(k=>localStorage.getItem(k),key),knight);assert.equal(await m.page.evaluate(()=>localStorage.getItem('arpg.save.v1')),raw);assert.deepEqual(m.writes.slice(mb),[]);assert.deepEqual(m.errors,[]);await m.ctx.close();results.push({missingArtTick:0,returnRestored:true,writes:0});
 // Another tab occupying the slot after quiz cannot be overwritten by Create.
 const o=await setup(false);await choose(o.page);await o.page.locator('#hero-name').fill('경쟁 기사');await o.page.locator('#name-next').tap();for(let i=0;i<5;i++)await o.page.locator('[data-action="answer"][data-choice="0"]').tap();
 await o.page.evaluate(({key,knight})=>localStorage.setItem(key,knight),{key,knight});await o.page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));const ob=o.writes.length;
 await o.page.locator('#quiz-start').tap();await o.page.waitForFunction(()=>document.querySelector('#meta-error')?.textContent.includes('occupied'));
 assert.equal(await o.page.evaluate(()=>__arpg.world),null);assert.equal(await o.page.evaluate(k=>localStorage.getItem(k),key),knight);assert.equal(await o.page.evaluate(()=>localStorage.getItem('arpg.save.v1')),raw);assert.deepEqual(o.writes.slice(ob),[]);assert.deepEqual(o.errors,[]);await o.ctx.close();results.push({occupiedAtCreateRefused:true,writes:0});
 console.log(JSON.stringify({pass:true,results,screenshots:0,worldInjection:false,storagePatched:false},null,2));
}finally{await browser.close();server.kill();}
