// Fresh ephemeral Chromium contexts, native keyboard/touch only; no screenshots.
import { chromium } from '/home/cocy/.openclaw/workspace/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const server=spawn('python3',['-m','http.server','8879','--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
const browser=await chromium.launch({executablePath:'/home/cocy/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']});
const results=[];
try {
for(const mobile of [false,true]){
const ctx=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:800},isMobile:mobile,hasTouch:mobile});
await ctx.addInitScript(()=>{const original={getItem:Storage.prototype.getItem,setItem:Storage.prototype.setItem,removeItem:Storage.prototype.removeItem,clear:Storage.prototype.clear};original.setItem.call(localStorage,'arpg.save.v1','SENTINEL');window.__storageAudit={reads:[],writes:[]};Storage.prototype.getItem=function(k){window.__storageAudit.reads.push(k);return original.getItem.call(this,k);};for(const method of ['setItem','removeItem','clear'])Storage.prototype[method]=function(...args){window.__storageAudit.writes.push({method,args});return original[method].apply(this,args);};window.__sentinel=()=>original.getItem.call(localStorage,'arpg.save.v1');});
const page=await ctx.newPage();const errors=[];const bindings=[];const bound=[];page.on('response',response=>{const path=new URL(response.url()).pathname;if(['/arpg/tools/undead-encounter-lab/lab.js','/arpg/tools/undead-encounter-lab/encounter.js','/arpg/tools/undead-encounter-lab/presentation.js','/arpg/js/sim/world.js','/arpg/js/content/combat.js','/arpg/js/content/monsters.js'].includes(path))bindings.push((async()=>{const body=await response.body();const hash=b=>createHash('sha256').update(b).digest('hex');assert.equal(hash(body),hash(readFileSync(root+path.slice(1))));bound.push({path,sha256:hash(body)});})());});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.goto('http://127.0.0.1:8879/arpg/tools/undead-encounter-lab/');
const cdp=await ctx.newCDPSession(page);
const inspect=()=>page.evaluate(()=>window.__undeadEncounter.inspect());
await page.waitForFunction(()=>window.__undeadEncounter?.inspect().views.length===2&&window.__undeadEncounter.inspect().views.every(v=>v.mode==='atlas'),{},{timeout:20000});
let initial=await inspect();assert.equal(initial.views.find(v=>v.entityId===initial.player.id).id,'skeleton-warrior');assert.ok(initial.views.some(v=>v.key==='blade'&&v.mode==='atlas'));assert.ok(initial.views.some(v=>v.key==='skeleton_warrior'&&v.mode==='atlas'));assert.equal(initial.player.dodgeDisabled,true);
// Native movement right then left: no reversed axes. Restart resets fresh sim only.
await page.getByRole('button',{name:'다시 시작'}).click();await page.waitForFunction(()=>window.__undeadEncounter.inspect().views.every(v=>v.mode==='atlas')&&window.__undeadEncounter.inspect().tick>0);let before=await inspect();
if(!mobile){await page.keyboard.down('KeyD');await page.waitForTimeout(220);await page.keyboard.up('KeyD');}else{await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:80,y:480}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:120,y:480}]});await page.waitForTimeout(220);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
let after=await inspect();assert.ok(after.player.x>before.player.x,JSON.stringify({before:before.player.x,after:after.player.x}));
const rightX=after.player.x;
if(!mobile){await page.keyboard.down('KeyA');await page.waitForTimeout(220);await page.keyboard.up('KeyA');}else{await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:120,y:480}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:80,y:480}]});await page.waitForTimeout(220);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
assert.ok((await inspect()).player.x<rightX);
if(!mobile)await page.keyboard.press('KeyK');else await page.getByRole('button',{name:'돌진 베기 K'}).tap();
await page.waitForFunction(()=>window.__undeadEncounter.inspect().player.act?.id==='lunge');
const skill=await inspect();assert.ok(skill.player.mp<100);
await page.getByRole('button',{name:'다시 시작'}).click();await page.waitForFunction(()=>window.__undeadEncounter.inspect().views.every(v=>v.mode==='atlas')&&window.__undeadEncounter.inspect().tick>0);await page.keyboard.press('Space');await page.keyboard.press('KeyT');await page.keyboard.press('KeyT');assert.equal((await inspect()).player.dodge.dashLeft,0);
// Defeat uses human's real AI, not manually assigned HP or injected ticks.
await page.waitForFunction(()=>window.__undeadEncounter.inspect().player.dead,{},{timeout:65000});const defeat=await inspect();assert.ok(defeat.events.some(e=>e.type==='hit'&&e.src===defeat.human.id));assert.ok(defeat.human.x>308);assert.ok(defeat.seen.some(s=>s.includes(':hero-sword:attack:')));assert.ok(defeat.seen.some(s=>s.includes(':skeleton-warrior:hit:')));await page.waitForTimeout(200);
// Hold actual attack control; AI walks into range. Actual player hit/death of human.
await page.getByRole('button',{name:'다시 시작'}).click();await page.waitForFunction(()=>window.__undeadEncounter.inspect().views.every(v=>v.mode==='atlas')&&window.__undeadEncounter.inspect().tick>0);
if(!mobile){await page.keyboard.down('KeyJ');}else{const r=await page.locator('#attack').boundingBox();await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:r.x+r.width/2,y:r.y+r.height/2}]});}
await page.waitForFunction(()=>window.__undeadEncounter.inspect().human.dead||window.__undeadEncounter.inspect().player.dead,{},{timeout:65000});
const victory=await inspect();if(!mobile)await page.keyboard.up('KeyJ');else{await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
assert.ok(victory.human.dead,'real controls must defeat human');assert.ok(!victory.player.dead);assert.ok(victory.events.some(e=>e.type==='hit'&&e.src===victory.player.id));await page.waitForTimeout(250);const art=await inspect();assert.ok(art.seen.some(s=>s.includes(':hero-sword:death:')));assert.ok(art.seen.some(s=>s.includes(':skeleton-warrior:attack:')));
await Promise.all(bindings);assert.equal(bound.length,6);
const audit=await page.evaluate(()=>({audit:window.__storageAudit,sentinel:window.__sentinel(),overflow:document.documentElement.scrollWidth>innerWidth}));assert.equal(audit.sentinel,'SENTINEL');assert.deepEqual(audit.audit.writes,[]);assert.ok(audit.audit.reads.every(k=>k==='arpg.autoAttack'));assert.equal(audit.overflow,false);assert.deepEqual(errors,[]);results.push({viewport:mobile?'390 mobile native touch':'1280 desktop native keyboard',movementRight:true,movementLeft:true,skill:'lunge via real K/touch',bound,defeatTick:defeat.tick,victoryTick:victory.tick,artStates:art.seen,storage:audit,errors});await ctx.close();
}
const failContext=await browser.newContext();const failPage=await failContext.newPage();const failErrors=[];failPage.on('pageerror',e=>failErrors.push(e.message));failPage.on('console',m=>{if(m.type()==='error')failErrors.push(m.text());});
await failPage.route('**/assets/sprites/manifest.json',async route=>{const response=await route.fetch();const manifest=await response.json();await route.fulfill({json:manifest.filter(entry=>entry.id!=='hero-sword')});});
await failPage.goto('http://127.0.0.1:8879/arpg/tools/undead-encounter-lab/');await failPage.waitForFunction(()=>Object.keys(window.__undeadEncounter?.inspect().assets.failed||{}).length>0);await failPage.waitForTimeout(250);const failState=await failPage.evaluate(()=>({tick:window.__undeadEncounter.inspect().tick,status:document.querySelector('#status').textContent}));assert.equal(failState.tick,0);assert.match(failState.status,/필수 아틀라스 실패/);assert.deepEqual(failErrors,[]);await failContext.close();
console.log(JSON.stringify({pass:true,results,failClosed:{...failState,errors:failErrors},screenshots:0},null,2));
}finally{await browser.close();server.kill();}
