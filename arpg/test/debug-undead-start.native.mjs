// Main app only. Fresh native Chromium keyboard/touch, read-only world inspection, no screenshots.
import { chromium } from '/home/cocy/.openclaw/workspace/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createSave } from '../js/meta/save.js';
const root=fileURLToPath(new URL('../../',import.meta.url));
const raw=JSON.stringify(createSave({name:'SENTINEL',answers:[0,1,2,3,0],weapon:'blade',createdAt:123}));
const server=spawn('python3',['-m','http.server','8893','--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
const browser=await chromium.launch({executablePath:'/home/cocy/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']});
const results=[];
async function context(mobile,fixture=raw) {
 const ctx=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:800},isMobile:mobile,hasTouch:mobile});
 await ctx.addInitScript(({raw})=>{if(raw!==null)localStorage.setItem('arpg.save.v1',raw);const get=Storage.prototype.getItem,set=Storage.prototype.setItem,del=Storage.prototype.removeItem,clear=Storage.prototype.clear;window.__writes=[];Storage.prototype.setItem=function(...a){window.__writes.push({method:'set',a,mode:window.__arpg?.mode});return set.apply(this,a)};Storage.prototype.removeItem=function(...a){window.__writes.push({method:'remove',a,mode:window.__arpg?.mode});return del.apply(this,a)};Storage.prototype.clear=function(...a){window.__writes.push({method:'clear',a,mode:window.__arpg?.mode});return clear.apply(this,a)};window.__raw=()=>get.call(localStorage,'arpg.save.v1');},{raw:fixture});
 const page=await ctx.newPage(), errors=[],bound=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.route('**/www.googletagmanager.com/**',r=>r.fulfill({body:''}));
 page.on('response',r=>{const p=new URL(r.url()).pathname;if(['/arpg/js/main.js','/arpg/js/debug/index.js','/arpg/js/debug/undead-start.js','/arpg/js/debug/undead-art.js','/arpg/js/debug/undead-encounter.js','/arpg/js/ui/hud.js'].includes(p))bound.push((async()=>{const hash=b=>createHash('sha256').update(b).digest('hex');assert.equal(hash(await r.body()),hash(readFileSync(root+p.slice(1))));return p})())});
 return {ctx,page,errors,bound};
}
const state=page=>page.evaluate(()=>({mode:__arpg.mode,world:JSON.parse(JSON.stringify(__arpg.world)),art:JSON.parse(JSON.stringify(__arpg.art)),save:JSON.parse(JSON.stringify(__arpg.save)),tracker:__arpg.tracker}));
async function enter(page) {await page.locator('#arpg-debug-toggle').click();await page.getByRole('button',{name:'언데드로 시작',exact:true}).click();await page.waitForFunction(()=>__arpg.mode==='undead-debug'&&__arpg.art.visuals.length===2&&__arpg.art.visuals.every(v=>v.mode==='atlas')&&__arpg.world.tick>0);}
async function restart(page){await enter(page);}
async function leave(page){await page.locator('#arpg-debug-toggle').click();await page.getByRole('button',{name:'인간으로 돌아가기',exact:true}).click();await page.waitForFunction(()=>__arpg.mode==='human'&&!__arpg.world);}
try {
 for(const mobile of [false,true]) {
  const {ctx,page,errors,bound}=await context(mobile);await page.goto('http://127.0.0.1:8893/arpg/?debug=1');await page.locator('#arpg-debug-toggle').waitFor();
  const originalCanvas=await page.locator('#surface canvas').count();assert.equal(originalCanvas,1);
  await enter(page);let s=await state(page);assert.equal(s.world.round,null);assert.equal(s.tracker,null);assert.equal(s.save.name,'SENTINEL');assert.equal(s.world.entities[0].dodgeDisabled,true);assert.ok(s.world.entities[0].x>s.world.entities[1].x);assert.ok(s.art.visuals.some(v=>v.id==='skeleton-warrior'));assert.ok(s.art.visuals.some(v=>v.id==='hero-sword'));assert.equal(await page.locator('iframe').count(),0);assert.equal(await page.locator('#surface canvas').count(),1);assert.match(await page.locator('#stage-name').textContent(),/해골 기사.*저장 안 됨/);assert.equal(await page.locator('#dodge').isDisabled(),true);
  const cdp=await ctx.newCDPSession(page);const touch=async(x,y,dx)=>{await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx,y}]});await page.waitForTimeout(220);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});};
  const x=s.world.entities[0].x;if(mobile)await touch(80,480,40);else {await page.keyboard.down('KeyD');await page.waitForTimeout(220);await page.keyboard.up('KeyD');}assert.ok((await state(page)).world.entities[0].x>x);
  const right=(await state(page)).world.entities[0].x;if(mobile)await touch(120,480,-40);else{await page.keyboard.down('KeyA');await page.waitForTimeout(220);await page.keyboard.up('KeyA');}assert.ok((await state(page)).world.entities[0].x<right);
  if(mobile)await page.locator('#skill').tap();else await page.keyboard.press('KeyK');await page.waitForFunction(()=>__arpg.world.entities[0].act?.id==='lunge');
  // Existing cheats/settlement paths must be refused while debug mode is live.
  await page.locator('#arpg-debug-toggle').click();await page.locator('[data-debug="clear"]').click();assert.match(await page.locator('#arpg-debug-status').textContent(),/정산 불가/);await page.locator('[data-debug="gold:1000"]').click();assert.match(await page.locator('#arpg-debug-status').textContent(),/저장/);await page.locator('[data-debug="close"]').click();
  await restart(page);await page.waitForFunction(()=>__arpg.world.entities[0].dead,{},{timeout:90000});const death=await state(page);assert.ok(death.world.entities[1].x>308);assert.equal(death.tracker,null);await page.waitForTimeout(100);assert.match(await page.locator('#notice').textContent(),/전투 종료/);
  await restart(page);if(mobile){const r=await page.locator('#attack').boundingBox();await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:r.x+r.width/2,y:r.y+r.height/2}]});}else await page.keyboard.down('KeyJ');
  await page.waitForFunction(()=>__arpg.world.entities[1].dead||__arpg.world.entities[0].dead,{},{timeout:90000});const victory=await state(page);if(mobile)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else await page.keyboard.up('KeyJ');assert.ok(victory.world.entities[1].dead);assert.ok(!victory.world.entities[0].dead);await page.waitForTimeout(100);assert.match(await page.locator('#notice').textContent(),/해골 승리/);
  await restart(page);await leave(page);assert.equal(await page.locator('#hud').isHidden(),true);assert.equal(await page.locator('#meta-screen').isVisible(),true);
  const audit=await page.evaluate(()=>({raw:__raw(),writes:__writes,overflow:document.documentElement.scrollWidth>innerWidth}));assert.equal(audit.raw,raw);assert.deepEqual(audit.writes.filter(w=>w.mode==='undead-debug'),[]);assert.deepEqual(audit.writes.filter(w=>w.a[0]?.startsWith('arpg.save')),[]);assert.equal(audit.overflow,false);
  // Same human hub starts a real normal round; original factory/dodge returns.
  await page.locator('[data-action="board"]').click();await page.locator('[data-action="sortie"][data-stage="S1"]').click();await page.locator('#sortie-confirm').click();await page.waitForFunction(()=>__arpg.world?.round?.stageId==='S1'&&__arpg.world.tick>0);s=await state(page);assert.equal(s.mode,'human');assert.equal(s.world.entities[0].dodgeDisabled,undefined);await page.waitForFunction(()=>__arpg.art.visuals.some(v=>v.id==='paperdoll-blade'&&v.mode==='paperdoll'&&v.textureLoaded));await page.keyboard.press('Space');await page.waitForFunction(()=>__arpg.world.entities[0].dodge.cdLeft>0);
  // Mid-human-combat entry is blocked, never silently settled/discarded.
  await page.locator('#arpg-debug-toggle').click();await page.getByRole('button',{name:'언데드로 시작',exact:true}).click();assert.match(await page.locator('#arpg-debug-status').textContent(),/끝내고 여관/);assert.equal((await state(page)).mode,'human');
  assert.deepEqual(errors,[]);results.push({mobile,deathTick:death.world.tick,victoryTick:victory.world.tick,rawSaveByteExact:true,modeWrites:0,normalRoundRestored:true,errors,bound:await Promise.all(bound)});await ctx.close();
 }
 // No existing human: entry never fabricates human quiz/progress; exit restores intro.
 const absent=await context(false,null);await absent.page.goto('http://127.0.0.1:8893/arpg/?debug=1');await absent.page.locator('#arpg-debug-toggle').waitFor();await enter(absent.page);assert.equal((await state(absent.page)).save,null);await leave(absent.page);assert.equal(await absent.page.evaluate(()=>__raw()),null);assert.deepEqual(absent.errors,[]);await absent.ctx.close();
 // Missing required real art fails closed at tick zero in actual main app.
 const fail=await context(false);await fail.page.route('**/assets/sprites/manifest.json',async r=>{const response=await r.fetch();const manifest=await response.json();await r.fulfill({json:manifest.filter(e=>e.id!=='hero-sword')});});await fail.page.goto('http://127.0.0.1:8893/arpg/?debug=1');await fail.page.locator('#arpg-debug-toggle').waitFor();await fail.page.locator('#arpg-debug-toggle').click();await fail.page.getByRole('button',{name:'언데드로 시작',exact:true}).click();await fail.page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('필수 아틀라스 실패'));assert.equal((await state(fail.page)).world.tick,0);await leave(fail.page);assert.equal(await fail.page.evaluate(()=>__raw()),raw);assert.deepEqual(fail.errors,[]);await fail.ctx.close();
 // Disabled path does not fetch the feature or debug modules.
 const off=await context(false);const fetched=[];off.page.on('request',r=>fetched.push(r.url()));await off.page.goto('http://127.0.0.1:8893/arpg/?debug=0');await off.page.waitForFunction(()=>window.__arpg);assert.ok(!fetched.some(u=>u.includes('/debug/')));assert.equal(await off.page.locator('#arpg-debug-toggle').count(),0);await off.ctx.close();
 console.log(JSON.stringify({pass:true,results,noHumanCreation:true,missingArtTick:0,disabledNoFeatureImports:true,screenshots:0},null,2));
}finally{await browser.close();server.kill();}
