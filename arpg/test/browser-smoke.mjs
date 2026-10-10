// Start a static server at 8731 before running. No dependencies beyond Node + Chromium.
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const port=19097,profile=await mkdtemp(join(tmpdir(),'arpg-smoke-'));
const chrome=spawn('/home/cocy/bin/chromium',['--headless=new','--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let ws,seq=0;const pending=new Map(),events=[];
try {
  let target;
  for(let i=0;i<80;i++){try{target=await(await fetch(`http://127.0.0.1:${port}/json`)).json();if(target[0]?.webSocketDebuggerUrl)break;}catch{}await sleep(100);}
  assert.ok(target?.[0]?.webSocketDebuggerUrl,'Chromium CDP unavailable');
  ws=new WebSocket(target[0].webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){pending.get(m.id)?.(m);pending.delete(m.id);}else events.push(m);};
  const cmd=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);reject(new Error(`CDP timeout: ${method}`));},15000);pending.set(id,m=>{clearTimeout(timer);m.error?reject(new Error(JSON.stringify(m.error))):resolve(m.result);});ws.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const response=await cmd('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(response.exceptionDetails)throw new Error(response.exceptionDetails.exception?.description||response.exceptionDetails.text);return response.result.value;};
  const waitFor=async(expr,timeout=10000)=>{const start=Date.now();while(Date.now()-start<timeout){if(await evaluate(expr))return;await sleep(150);}throw new Error(`Timed out waiting for ${expr}`);};
  const key=(code,type='keyDown')=>cmd('Input.dispatchKeyEvent',{type,code,key:({KeyD:'d',KeyJ:'j',KeyR:'r',Space:' '})[code]||code,windowsVirtualKeyCode:({KeyD:68,KeyJ:74,KeyR:82,Space:32})[code]||0});
  const start=async (stage,weapon='blade')=>{await evaluate(`document.querySelector('#weapon').value='${weapon}';document.querySelector('#stage').value='${stage}';document.querySelector('#start').click()`);await waitFor('window.__arpg?.world?.tick>0');};
  await cmd('Runtime.enable');await cmd('Page.enable');await cmd('Log.enable');
  await cmd('Page.navigate',{url:'http://127.0.0.1:8731/arpg/'});
  await waitFor("!document.querySelector('#start').disabled || !!document.querySelector('#boot-error').textContent");
  const boot=await evaluate("document.querySelector('#boot-error').textContent");assert.equal(boot,'',`Pixi init failed: ${boot}`);
  assert.ok(await evaluate("!!document.querySelector('canvas')"),'canvas missing');
  await start('S2');
  await evaluate(`window.smokeHits={tick:-1,hits:0,playerHits:0};window.watchHits=()=>{const w=__arpg.world;if(w&&smokeHits.tick!==w.tick){smokeHits.tick=w.tick;for(const e of w.events)if(e.type==='hit'){smokeHits.hits++;if(e.src===w.entities[0].id)smokeHits.playerHits++;}};requestAnimationFrame(watchHits);};requestAnimationFrame(watchHits)`);
  await key('KeyD');await key('KeyJ');await sleep(2200);
  await key('Space');await sleep(5);await key('Space','keyUp');await sleep(2800);
  await key('KeyD','keyUp');await key('KeyJ','keyUp');
  const combat=await evaluate(`(() => {const w=__arpg.world;return {tick:w.tick,hp:w.entities[0].hp,dodgeTick:w.entities[0].dodge.startedTick,hits:smokeHits.hits,playerHits:smokeHits.playerHits,hit:w.entities.some(e=>e.kind==='monster'&&(e.hp<e.maxHp||e.dead))||w.entities[0].hp<100};})()`);
  assert.ok(combat.tick>=100,JSON.stringify(combat));assert.ok(combat.hit&&combat.hits>0,'No combat hit after movement + attack');assert.ok(combat.playerHits>0,'Blade attacks did not connect');assert.ok(combat.dodgeTick>=0,'5ms dodge tap lost');
  assert.ok(await evaluate(`(() => {try {__arpg.world.entities[0].hp=999;return false;}catch{return __arpg.world.entities[0].hp<=100;}})()`),'debug world is writable');
  await cmd('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await cmd('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});await sleep(300);
  const mobile=await evaluate(`(() => {const buttons=[...document.querySelectorAll('#actions button')];const rects=buttons.map(b=>{const r=b.getBoundingClientRect();return {id:b.id,x:r.x,y:r.y,w:r.width,h:r.height};});return {width:innerWidth,height:innerHeight,rects};})()`);
  assert.equal(mobile.width,390);
  for(const r of mobile.rects)assert.ok(r.x>=0&&r.y>=0&&r.x+r.w<=390&&r.y+r.h<=844,`outside viewport: ${r.id}`);
  for(let i=0;i<mobile.rects.length;i++)for(let j=i+1;j<mobile.rects.length;j++){const a=mobile.rects[i],b=mobile.rects[j];assert.ok(a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h<=b.y||b.y+b.h<=a.y,`overlap: ${a.id}, ${b.id}`);}
  // Real touch auto-aim + floating joystick, with simultaneous pointers.
  const attack=mobile.rects.find(r=>r.id==='attack');
  const touch=(type,points)=>cmd('Input.dispatchTouchEvent',{type,touchPoints:points});
  const left={x:65,y:680,id:1},right={x:attack.x+attack.w/2,y:attack.y+attack.h/2,id:2};
  const before=await evaluate('__arpg.world.entities[0].x');
  await touch('touchStart',[left,right]);await touch('touchMove',[{...left,x:100},right]);await sleep(700);await touch('touchEnd',[]);
  assert.ok(await evaluate(`__arpg.world.entities[0].x>${before}`),'touch joystick did not move');
  // Death flows naturally, without mutating the authoritative world.
  await waitFor("__arpg.world.round.state==='failed'",120000);
  assert.ok(await evaluate("!document.querySelector('#result').hidden && document.querySelector('#cause').textContent.includes('회피 가능했던 공격') && !!__arpg.world.entities[0].deathCause?.ability"),'death cause not displayed');
  await evaluate("document.querySelector('#back').click()");await start('S1');
  // Verify the 2s return ring and terminal screen using an actual pointer tap.
  const scroll=mobile.rects.find(r=>r.id==='scroll');
  await touch('touchStart',[{x:scroll.x+scroll.w/2,y:scroll.y+scroll.h/2,id:3}]);await touch('touchEnd',[]);
  await waitFor('__arpg.world.entities[0].channel>0');await sleep(450);
  const progress=await evaluate("parseFloat(document.querySelector('#scroll').style.getPropertyValue('--progress'))");assert.ok(progress>0&&progress<100,'return progress missing');
  await waitFor("__arpg.world.round.state==='returned'",5000);
  assert.equal(await evaluate("document.querySelector('#result-title').textContent"),'귀환 성공');
  await evaluate("document.querySelector('#back').click()");await start('S1');
  await waitFor("__arpg.world.round.state==='clear'",35000);
  assert.equal(await evaluate('__arpg.world.round.t'),900,'S1 must clear on exactly tick 900');
  assert.ok(await evaluate("!document.querySelector('#next').hidden"),'next stage button missing');
  await evaluate("document.querySelector('#back').click()");
  for(const weapon of ['bow','focus']){
    await start('S1',weapon);const hitsBefore=await evaluate('smokeHits.playerHits');
    await key('KeyD');await key('KeyJ');await sleep(1300);await key('KeyD','keyUp');
    await cmd('Input.dispatchKeyEvent',{type:'keyDown',code:'KeyK',key:'k',windowsVirtualKeyCode:75});
    await sleep(5);await cmd('Input.dispatchKeyEvent',{type:'keyUp',code:'KeyK',key:'k',windowsVirtualKeyCode:75});
    await sleep(1800);await key('KeyJ','keyUp');
    assert.ok(await evaluate(`smokeHits.playerHits>${hitsBefore}`),`${weapon} failed to hit scarecrow`);
    if(weapon==='focus')assert.ok(await evaluate('__arpg.world.entities[0].mp<60'),'focus skill did not consume mana');
    await waitFor('!__arpg.world.entities[0].act');await key('KeyR');await key('KeyR','keyUp');await waitFor("__arpg.world.round.state==='returned'",6000);
    await evaluate("document.querySelector('#back').click()");
  }
  await start('S1');
  // Exercise visibilitychange without touching world state or altering the clock.
  await evaluate("Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))");
  const pausedTick=await evaluate('__arpg.world.tick');await sleep(250);
  assert.equal(await evaluate('__arpg.world.tick'),pausedTick,'hidden tab advanced simulation');
  assert.ok(await evaluate("!document.querySelector('#pause').hidden"),'pause overlay missing');
  await evaluate("delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))");
  await waitFor(`__arpg.world.tick>${pausedTick}`);
  const errors=events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Runtime.consoleAPICalled'&&e.params.type==='error'||e.method==='Log.entryAdded'&&e.params.entry.level==='error');
  assert.equal(errors.length,0,JSON.stringify(errors.slice(0,3)));
  console.log(JSON.stringify({ok:true,canvas:true,combat,mobile:{width:mobile.width,height:mobile.height,buttons:mobile.rects.length,inside:true,noOverlap:true},touch:true,edgeLatch:true,readonlyDebug:true,weapons:['blade','bow','focus'],visibilityPause:true,S1:'clear@900',S2:'deathCause shown',scroll:'progress → returned',consoleErrors:errors.length}));
} finally {
  ws?.close();chrome.kill('SIGTERM');await Promise.race([new Promise(r=>chrome.once('exit',r)),sleep(2500)]);await rm(profile,{recursive:true,force:true});
}
