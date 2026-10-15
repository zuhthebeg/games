// Actual main canvas/HUD. Native PC/touch actions; readonly diagnostics only.
import { chromium } from '/home/cocy/.openclaw/workspace/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createSave } from '../js/meta/save.js';
const root=fileURLToPath(new URL('../../',import.meta.url));
const raw=JSON.stringify(createSave({name:'SENTINEL',answers:[0,1,2,3,0],weapon:'blade',createdAt:123}));
const server=spawn('python3',['-m','http.server','8895','--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
const browser=await chromium.launch({executablePath:'/home/cocy/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']});
const results=[];
const state=page=>page.evaluate(()=>({mode:__arpg.mode,world:JSON.parse(JSON.stringify(__arpg.world)),art:JSON.parse(JSON.stringify(__arpg.art)),save:JSON.parse(JSON.stringify(__arpg.save))}));
try {
 for(const mobile of [false,true]) {
  console.error('VIEWPORT',mobile?390:1280);
  const ctx=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:800},isMobile:mobile,hasTouch:mobile});
  await ctx.addInitScript(raw=>localStorage.setItem('arpg.save.v1',raw),raw);
  const page=await ctx.newPage(),errors=[],storage=[],bound=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const cdp=await ctx.newCDPSession(page);await cdp.send('DOMStorage.enable');
  for(const kind of ['domStorageItemAdded','domStorageItemUpdated','domStorageItemRemoved','domStorageItemsCleared'])cdp.on(`DOMStorage.${kind}`,e=>storage.push({kind,...e}));
  await page.route('**/www.googletagmanager.com/**',r=>r.fulfill({body:''}));
  const paths=['/arpg/js/main.js','/arpg/js/ui/hud.js','/arpg/js/debug/undead-start.js','/arpg/css/game.css'];
  page.on('response',r=>{const p=new URL(r.url()).pathname;if(paths.includes(p))bound.push((async()=>{assert.deepEqual(await r.body(),readFileSync(root+p.slice(1)));return p;})());});
  await page.goto('http://127.0.0.1:8895/arpg/?debug=1');await page.locator('#arpg-debug-toggle').waitFor();
  const baseline=storage.length;
  await page.locator('#arpg-debug-toggle').click();await page.locator('[data-debug="undead-start"]').click();
  await page.waitForFunction(()=>__arpg.mode==='undead-debug'&&__arpg.world.tick>0&&__arpg.art.visuals.every(v=>v.mode==='atlas'));
  const initial=await state(page);assert.equal(initial.world.round,null);assert.equal(initial.save.name,'SENTINEL');
  const held=async down=>{if(mobile){if(down){const b=await page.locator('#attack').boundingBox();await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height/2}]});}else await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}else await page.keyboard[down?'down':'up']('KeyJ');};
  const win=async()=>{await held(true);await page.waitForFunction(()=>__arpg.world.entities[1].dead||__arpg.world.entities[0].dead,null,{timeout:90000});console.error('BEFORE_RELEASE',JSON.stringify({mobile,mode:(await state(page)).mode,result:await page.locator('#undead-result').textContent()}));await held(false);console.error('AFTER_RELEASE',(await state(page)).mode);assert.ok((await state(page)).world?.entities[1].dead);};
  const terminal=async expected=>{
   await page.locator('#undead-result').waitFor();assert.equal(await page.locator('#arpg-debug-panel').isHidden(),true);
   assert.equal(await page.locator('#actions').isHidden(),true);assert.equal(await page.locator('#undead-result [data-undead-action="restart"]').isVisible(),true);assert.equal(await page.locator('#undead-result [data-undead-action="leave"]').isVisible(),true);
   const before=await state(page);await page.waitForTimeout(1300);const after=await state(page);assert.deepEqual(after.world,before.world,'terminal sim including HP/tick/act stays exact while render advances');
   for(const e of after.world.entities){const v=after.art.visuals.find(v=>v.id===(e.kind==='player'?'skeleton-warrior':'hero-sword'));assert.equal(v.state,e.dead?'death':'idle');if(e.dead){const dir=v.direction;const sheets=[0,1].map(i=>JSON.parse(readFileSync(`${root}arpg/assets/sprites/${v.id}/atlas-${i}.webp.json`)));const clip=sheets.map(s=>s.animations?.[`death_${dir}`]).find(Boolean);assert.ok(clip);assert.equal(v.frame,clip.length-1,'death animation reached final frame without a sim tick');}}
   assert.match(await page.locator('#undead-result').textContent(),/캠페인 진행·보상·저장 없음/);
   assert.equal(after.world.entities[0].dead,expected==='death');
   const box=await page.locator('#undead-result [data-undead-action="leave"]').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=(mobile?390:1280)&&box.y>=0&&box.y+box.height<=(mobile?844:800));
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   return {tick:after.world.tick,art:after.art.visuals.map(v=>({id:v.id,state:v.state,frame:v.frame}))};
  };
  console.error('FIRST_WIN');await win();const first=await terminal('victory');assert.equal(await page.getByRole('button',{name:'다음 전투',exact:true}).isVisible(),true);
  // Visible result button is the only continuation; no DBG, redirect, state injection or new stage.
  if(mobile)await page.getByRole('button',{name:'다음 전투',exact:true}).tap();else await page.getByRole('button',{name:'다음 전투',exact:true}).click();
  await page.waitForFunction(old=>__arpg.world.tick>0&&__arpg.world.tick<old&&!__arpg.world.entities[1].dead,first.tick);
  assert.equal(await page.locator('#undead-result').count(),0);assert.equal(await page.locator('#actions').isVisible(),true);
  const fresh=await state(page);assert.equal(fresh.world.round,null);assert.equal(fresh.world.entities[0].maxHp,initial.world.entities[0].maxHp);assert.equal(fresh.world.entities[1].maxHp,initial.world.entities[1].maxHp);
  const x=fresh.world.entities[0].x;
  if(mobile){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:70,y:470}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:110,y:470}]});await page.waitForTimeout(200);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
  else{await page.keyboard.down('KeyD');await page.waitForTimeout(200);await page.keyboard.up('KeyD');}
  assert.ok((await state(page)).world.entities[0].x>x);
  if(mobile)await page.locator('#skill').tap();else await page.keyboard.press('KeyK');await page.waitForFunction(()=>__arpg.world.entities[0].act?.id==='lunge');
  // No held attack carries through next; let actual AI kill this fresh encounter.
  await page.waitForFunction(()=>__arpg.world.entities[0].dead,null,{timeout:90000});const death=await terminal('death');assert.equal(await page.locator('[data-undead-action="next"]').count(),0);
  if(mobile)await page.getByRole('button',{name:'다시 시작',exact:true}).tap();else await page.getByRole('button',{name:'다시 시작',exact:true}).click();
  await page.waitForFunction(old=>__arpg.world.tick>0&&__arpg.world.tick<old&&!__arpg.world.entities[0].dead,death.tick);assert.equal(await page.locator('#undead-result').count(),0);
  console.error('RESTART_WIN');await win();const final=await terminal('victory');
  // Victory restart is also visible; actual return scroll gets the same owned result actions.
  await page.locator('[data-undead-action="restart"]').click();await page.waitForFunction(old=>__arpg.world.tick>0&&__arpg.world.tick<old&&!__arpg.world.entities[1].dead,final.tick);
  await page.keyboard.press('KeyR');await page.waitForFunction(()=>__arpg.world.entities[0].terminal==='return_scroll',null,{timeout:15000});await terminal('returned');
  await page.getByRole('button',{name:'인간으로 돌아가기',exact:true}).click();await page.waitForFunction(()=>__arpg.mode==='human'&&!__arpg.world);
  assert.equal(await page.locator('#undead-result').count(),0);assert.equal(await page.locator('#hud').isHidden(),true);assert.equal(await page.locator('#meta-screen').isVisible(),true);
  assert.equal(await page.evaluate(()=>localStorage.getItem('arpg.save.v1')),raw);assert.deepEqual(storage.slice(baseline),[],'zero storage writes, no Storage monkeypatch');
  assert.equal(await page.locator('#surface canvas').count(),1);assert.equal(await page.locator('iframe').count(),0);assert.deepEqual(errors,[]);
  results.push({width:mobile?390:1280,first,death,final,visibleNextClicked:true,nextMovement:true,nextLunge:true,deathRestart:true,victoryRestart:true,terminalHumanReturn:true,humanSaveByteExact:true,storageEvents:0,errors,bound:await Promise.all(bound)});
  await ctx.close();
 }
 console.log(JSON.stringify({pass:true,results,screenshots:0,worldInjected:false,storagePatched:false},null,2));
}finally{await browser.close();server.kill();}
