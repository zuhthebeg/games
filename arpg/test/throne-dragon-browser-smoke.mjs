// Self-contained raw CDP smoke: own static server and fresh browser profile, cleaned up in finally.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = resolve(process.env.ARPG_ROOT || fileURLToPath(new URL('../../', import.meta.url)));
const port = Number(process.env.ARPG_CDP_PORT || 9457);
const httpPort = Number(process.env.ARPG_HTTP_PORT || 8887);
const profile = await mkdtemp(join(tmpdir(), 'arpg-smoke-'));
const server = spawn('python3', ['-m', 'http.server', String(httpPort), '--bind', '127.0.0.1'], {
  cwd: root, stdio: 'ignore',
});
const chrome = spawn('/home/cocy/bin/chromium', [
  '--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader',
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
let socket;
let sequence = 0;
const pending = new Map();
const events = [];

try {
  let targets;
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      if (targets[0]?.webSocketDebuggerUrl) break;
    } catch {
      // Chromium is still starting.
    }
    await sleep(100);
  }
  assert.ok(targets?.[0]?.webSocketDebuggerUrl, 'Chromium CDP unavailable');
  assert.equal(server.exitCode, null, `static server could not bind (${httpPort} already occupied?)`);
  socket = new WebSocket(targets[0].webSocketDebuggerUrl);
  await new Promise((resolveOpen, reject) => {
    socket.onopen = resolveOpen;
    socket.onerror = reject;
  });
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id) {
      pending.get(message.id)?.(message);
      pending.delete(message.id);
    } else events.push(message);
  };
  const command = (method, params = {}) => new Promise((resolveCommand, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP timeout: ${method}`));
    }, 15000);
    pending.set(id, (message) => {
      clearTimeout(timer);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolveCommand(message.result);
    });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const response = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    }
    return response.result.value;
  };
  const waitFor = async (expression, timeout = 10000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await evaluate(expression)) return;
      await sleep(150);
    }
    throw new Error(`Timed out waiting for ${expression}`);
  };
  const page = (name) => `document.querySelector('#meta-screen').dataset.page===${JSON.stringify(name)}
    && !document.querySelector('#meta-screen').hidden`;
  const touch = (type, points) => command('Input.dispatchTouchEvent', { type, touchPoints: points });
  await command('Runtime.enable'); await command('Page.enable'); await command('Log.enable');
  const nativeActivate = async (selector, keyboard = false) => {
    const point = await evaluate(`(() => {const n=document.querySelector(${JSON.stringify(selector)});if(!n||n.disabled||!n.checkVisibility())throw Error('not actionable: '+${JSON.stringify(selector)});n.scrollIntoView({block:'center'});n.focus({preventScroll:true});const r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    if(keyboard) {
      await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'});
      await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
    } else {
      assert.equal(await evaluate(`document.elementFromPoint(${point.x},${point.y})?.closest(${JSON.stringify(selector)})!==null`),true,selector);
      await touch('touchStart',[{x:point.x,y:point.y}]);await sleep(60);await touch('touchEnd',[]);
    }
    await sleep(350);
  };
  const results=[];
  const sample=()=>evaluate(`JSON.parse(JSON.stringify((()=>{const w=__arpg.world,p=w?.entities.find(e=>e.kind==='player'),d=w?.entities.find(e=>e.type==='throne_dragon');return w&&p&&d?{tick:w.tick,state:w.round.state,p:{x:p.x,y:p.y,hp:p.hp,maxHp:p.maxHp,dodge:p.dodge,terminal:p.terminal},d:{x:d.x,y:d.y,hp:d.hp,dead:d.dead,act:d.act},visual:__arpg.art.visuals.find(v=>v.key==='throne_dragon'),feedback:__arpg.feedback}:null;})()))`);
  for(const [width,height] of [[1280,800],[390,844]]) {
    const desktop=width>600;
    await command('Network.enable');
    await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:!desktop});
    await command('Emulation.setTouchEmulationEnabled',{enabled:!desktop,maxTouchPoints:2});
    await command('Page.navigate',{url:`http://127.0.0.1:${httpPort}/arpg/`});
    await waitFor('window.__arpg');
    // Persisted valid meta fixture only. No host entity writes / debug launch / fake attacks.
    await evaluate(`(async()=>{const {fixtureSave}=await import('./test/fixtures/multi-round.js');const {SaveStore}=await import('./js/meta/save.js');const s=fixtureSave('host');localStorage.setItem('arpg.autoAttack','0');s.cleared.S1=false;s.stageThreat.S1=0;new SaveStore(localStorage).save(s);})()`);
    await command('Page.reload');await waitFor(page('inn'));
    await nativeActivate('[data-action="board"]',desktop);
    await nativeActivate('[data-action="map-region"][data-region="throne"]',desktop);
    const board=await evaluate(`document.querySelector('[data-stage="TD1"]').textContent`);
    assert.match(board,/왕좌의 수호룡/);assert.match(board,/시험: 도전/);
    assert.equal(await evaluate(`document.querySelector('[data-stage="S20"]').disabled`),true);
    await nativeActivate('[data-action="sortie"][data-stage="TD1"]',desktop);
    await nativeActivate('[data-action="launch"]',desktop);
    await waitFor('__arpg.world?.round.stageId==="TD1" && __arpg.world.tick>0');
    await waitFor('__arpg.art.visuals.some(v=>v.key==="throne_dragon" && v.mode==="atlas" && v.textureLoaded)',20000);
    const geometry=await evaluate(`JSON.parse(JSON.stringify({arena:__arpg.world.arena,visual:__arpg.art.visuals.find(v=>v.key==='throne_dragon'),overflow:document.documentElement.scrollWidth>innerWidth}))`);
    assert.deepEqual(geometry.arena,{w:1680,h:1000});assert.equal(geometry.visual.id,'throne-dragon');assert.equal(geometry.overflow,false);
    const key=async(type,code)=>command('Input.dispatchKeyEvent',{type,key:code==='KeyD'?'d':code==='KeyA'?'a':code==='KeyW'?'w':code==='KeyS'?'s':code==='ShiftLeft'?'Shift':'j',code,windowsVirtualKeyCode:{KeyD:68,KeyA:65,KeyW:87,KeyS:83,ShiftLeft:16,KeyJ:74}[code]});
    let held=[];let joystick=false;
    const steer=async(dx,dy)=>{
      if(desktop){const want=[...(dx>.25?['KeyD']:dx<-.25?['KeyA']:[]),...(dy>.25?['KeyS']:dy<-.25?['KeyW']:[])];for(const k of held)if(!want.includes(k))await key('keyUp',k);for(const k of want)if(!held.includes(k))await key('keyDown',k);held=want;}
      else {if(!dx&&!dy){if(joystick)await touch('touchEnd',[]);joystick=false;return;}
        if(!joystick){await touch('touchStart',[{x:70,y:height*.65,id:1}]);joystick=true;}
        await touch('touchMove',[{x:70+dx*42,y:height*.65+dy*42,id:1}]);}
    };
    let s=await sample();const beforeHp=s.p.hp;
    // Approach the live boss through native movement, outside the front body collider.
    const deadline=Date.now()+15000;
    while(Date.now()<deadline){s=await sample();const dx=s.d.x-s.p.x,dy=s.d.y-s.p.y,dist=Math.hypot(dx,dy);if(dist<190)break;await steer(dx/dist,dy/dist);await sleep(100);}
    await steer(0,0);s=await sample();assert.ok(Math.hypot(s.d.x-s.p.x,s.d.y-s.p.y)<205);
    const clips=new Set(),phases=new Set(),damage=new Set();let prev=s;
    const observe=Date.now()+45000;
    while(Date.now()<observe&&(clips.size<3||damage.size<3)){
      s=await sample();assert.ok(s.p.hp>0,'survive test fixture');
      if(s.d.act){clips.add(s.d.act.id);phases.add(s.d.act.phase);assert.equal(s.visual.state,{dragon_flame:'breath',dragon_stomp:'stomp',dragon_tail:'tail'}[s.d.act.id]);}
      if(s.p.hp<prev.p.hp-.5)damage.add(prev.d.act?.id||s.d.act?.id);
      prev=s;await sleep(80);
    }
    assert.deepEqual([...clips].sort(),['dragon_flame','dragon_stomp','dragon_tail']);
    assert.deepEqual([...damage].sort(),['dragon_flame','dragon_stomp','dragon_tail']);
    assert.ok(phases.has('windup')&&phases.has('lock')&&phases.has('active')&&phases.has('recovery'));
    // Native dodge in the final locked ticks: real iframe and host perfectDodge marker.
    const evadeEnd=Date.now()+18000;let evade=null;
    while(Date.now()<evadeEnd){s=await sample();const a=s.d.act;
      if(a?.phase==='lock'&&a.left<=4&&s.p.dodge.cdLeft===0){
        const hp=s.p.hp;
        if(desktop){await key('keyDown','ShiftLeft');await key('keyUp','ShiftLeft');}
        else await nativeActivate('#dodge',false);
        await sleep(400);const after=await sample();
        if(after.p.dodge.perfectPaid){assert.ok(after.p.hp>=hp-.1);evade={ability:a.id,beforeHp:hp,afterHp:after.p.hp,perfectPaid:true};break;}
      }
      await sleep(35);
    }
    assert.ok(evade,'real native evade must produce host perfectDodge');
    // Native AUTO toggle + movement + normal skill/potion buttons, no debug damage.
    await nativeActivate('[data-auto-toggle]',desktop);
    const clearEnd=Date.now()+60000;
    while(Date.now()<clearEnd){s=await sample();if(s.state==='clear'||s.p.terminal==='clear')break;
      assert.ok(!s.p.terminal,'battle failed before clear');const dx=s.d.x-s.p.x,dy=s.d.y-s.p.y,dist=Math.hypot(dx,dy);
      if(dist>95)await steer(dx/dist,dy/dist);else await steer(0,0);
      await sleep(90);
    }
    await steer(0,0);s=await sample();assert.equal(s.state,'clear',JSON.stringify({viewport:[width,height],s,auto:await evaluate(`document.querySelector('[data-auto-toggle]').getAttribute('aria-pressed')`)}));assert.equal(s.d.dead,true);
    await waitFor(`document.querySelector('#meta-screen').dataset.page==='receipt'`,10000);
    const receipt=await evaluate(`JSON.parse(JSON.stringify(__arpg.save.lastReceipt))`);assert.equal(receipt.stageId,'TD1');assert.equal(receipt.terminal,'clear');
    assert.equal(await evaluate(`__arpg.save.cleared.S20`),false);
    console.error('NATIVE_VIEWPORT_PASS',width,height);
    results.push({viewport:[width,height],native:desktop?'keyboard Enter/WASD/Shift + AUTO':'touch UI/joystick/dodge + AUTO',board,geometry,clips:[...clips],phases:[...phases],damage:[...damage],beforeHp,evade,clear:{tick:s.tick,dragonHp:s.d.hp,receipt}});
  }
  const errors=events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Log.entryAdded'&&e.params.entry.level==='error'||e.method==='Runtime.consoleAPICalled'&&e.params.type==='error');
  assert.equal(errors.length,0,JSON.stringify(errors));
  console.log(JSON.stringify({ok:true,results,consoleErrors:0,screenshots:0,hostWrites:0,debugLaunch:false},null,2));
} finally {
  socket?.close();
  const stopped = [chrome, server].map(async (child) => {
    if (child.exitCode !== null) return;
    child.kill('SIGTERM');
    await Promise.race([new Promise((resolveExit) => child.once('exit', resolveExit)), sleep(2500)]);
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  });
  await Promise.all(stopped);
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
