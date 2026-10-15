// Bounded actual-main pending-entry regression: no screenshots or authoritative world writes.
import { chromium } from '/home/cocy/.openclaw/workspace/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createSave } from '../js/meta/save.js';
const root=fileURLToPath(new URL('../../',import.meta.url));
const raw=JSON.stringify(createSave({name:'SENTINEL',answers:[0,1,2,3,0],weapon:'blade',createdAt:123}));
const server=spawn('python3',['-m','http.server','8894','--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
const browser=await chromium.launch({executablePath:'/home/cocy/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']});
const results=[];
try {
 for(const mobile of [false,true]) {
  const fixture=mobile?null:raw;
  const ctx=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:800},isMobile:mobile,hasTouch:mobile});
  await ctx.addInitScript(raw=>{if(raw!==null)localStorage.setItem('arpg.save.v1',raw);},fixture);
  const page=await ctx.newPage(),errors=[],storageEvents=[],bound=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const cdp=await ctx.newCDPSession(page);await cdp.send('DOMStorage.enable');
  for(const kind of ['domStorageItemAdded','domStorageItemUpdated','domStorageItemRemoved','domStorageItemsCleared']) cdp.on(`DOMStorage.${kind}`,e=>storageEvents.push({kind,...e}));
  await page.route('**/www.googletagmanager.com/**',r=>r.fulfill({body:''}));
  let release,requested;const gate=new Promise(r=>release=r),importRequested=new Promise(r=>requested=r);
  await page.route('**/js/debug/undead-start.js*',async r=>{requested();await gate;await r.continue();});
  page.on('response',r=>{const path=new URL(r.url()).pathname;if(['/arpg/js/main.js','/arpg/js/debug/index.js','/arpg/js/ui/hub.js'].includes(path))bound.push((async()=>{assert.deepEqual(await r.body(),readFileSync(root+path.slice(1)));return path;})());});
  await page.goto('http://127.0.0.1:8894/arpg/?debug=1');await page.locator('#arpg-debug-toggle').waitFor();
  if(mobile){await page.locator('[data-action="name"]').click();await page.locator('#name-form input').fill('INTRO DRAFT');}
  else {await page.locator('[data-action="board"]').click();await page.locator('[data-action="sortie"][data-stage="S1"]').click();}
  const original=await page.evaluate(()=>{const hub=document.querySelector('#meta-screen');window.__originalHubChild=hub.firstChild;window.__originalDodge=document.querySelector('#dodge');window.__originalHudHTML=document.querySelector('#hud').outerHTML;return {page:hub.dataset.page,text:hub.textContent,raw:localStorage.getItem('arpg.save.v1')};});
  const beforeEvents=storageEvents.length;
  await page.locator('#arpg-debug-toggle').click();await page.locator('[data-debug="undead-start"]').click();await importRequested;
  assert.deepEqual(await page.locator('#meta-screen').evaluate(n=>({hidden:n.hidden,inert:n.inert})),{hidden:true,inert:true});
  await page.locator('[data-debug="gold:1000"]').click();assert.match(await page.locator('#arpg-debug-status').textContent(),/저장/);
  await page.locator('[data-debug-mastery="lunge"]').selectOption('30');assert.match(await page.locator('#arpg-debug-status').textContent(),/수정 불가/);
  await page.locator(mobile?'[data-debug="reset"]':'[data-debug="undead-return"]').click();
  const response=page.waitForResponse(r=>r.url().includes('/js/debug/undead-start.js'));release();await response;
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const restored=await page.evaluate(()=>{const hub=document.querySelector('#meta-screen');return {page:hub.dataset.page,text:hub.textContent,raw:localStorage.getItem('arpg.save.v1'),sameChild:hub.firstChild===window.__originalHubChild,hidden:hub.hidden,inert:hub.inert,mode:__arpg.mode,world:__arpg.world};});
  assert.deepEqual({...restored,page:undefined,text:undefined,raw:undefined},{page:undefined,text:undefined,raw:undefined,sameChild:true,hidden:false,inert:false,mode:'human',world:null});
  assert.equal(restored.raw,fixture);assert.equal(restored.page,original.page);assert.equal(restored.text,original.text);
  assert.deepEqual(storageEvents.slice(beforeEvents).filter(e=>!e.key||e.key.startsWith('arpg.save')),[]);
  // Cancelled import must not poison cached-module reentry; same canvas, actual input and return.
  if(await page.locator('#arpg-debug-panel').isHidden())await page.locator('#arpg-debug-toggle').click();
  await page.locator('[data-debug="undead-start"]').click();await page.waitForFunction(()=>__arpg.mode==='undead-debug'&&__arpg.world.tick>0);
  const x=await page.evaluate(()=>__arpg.world.entities[0].x);await page.keyboard.down('KeyD');await page.waitForTimeout(180);await page.keyboard.up('KeyD');assert.ok(await page.evaluate(x=>__arpg.world.entities[0].x>x,x));
  await page.locator('#arpg-debug-toggle').click();await page.locator('[data-debug="undead-return"]').click();await page.waitForFunction(()=>__arpg.mode==='human');
  assert.equal(await page.evaluate(()=>document.querySelector('#dodge')===window.__originalDodge&&document.querySelector('#hud').outerHTML===window.__originalHudHTML),true);
  if(mobile)assert.equal(await page.locator('#name-form input').inputValue(),'INTRO DRAFT');
  assert.equal(await page.locator('#surface canvas').count(),1);assert.equal(await page.locator('iframe').count(),0);assert.equal(await page.evaluate(()=>localStorage.getItem('arpg.save.v1')),fixture);
  assert.deepEqual(storageEvents.slice(beforeEvents).filter(e=>!e.key||e.key.startsWith('arpg.save')),[], 'no save writes across pending, active reentry and return');
  assert.deepEqual(errors,[]);results.push({width:mobile?390:1280,humanSave:fixture===null?'null':'SENTINEL',cancel:mobile?'reset':'return',pendingSaveMasteryBlocked:true,originalHubChildRetained:true,lateActivation:false,cachedReentry:true,saveStorageEvents:0,errors,bound:await Promise.all(bound)});await ctx.close();
 }
 console.log(JSON.stringify({pass:true,results,screenshots:0,storagePatched:false,worldInjected:false},null,2));
} finally {await browser.close();server.kill();}
