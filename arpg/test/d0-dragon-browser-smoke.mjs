// Self-contained raw CDP smoke: own static server and fresh browser profile, cleaned up in finally.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = resolve(process.env.ARPG_ROOT || fileURLToPath(new URL('../../', import.meta.url)));
const port = Number(process.env.ARPG_CDP_PORT || 9433);
const httpPort = Number(process.env.ARPG_HTTP_PORT || 8863);
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
  for(const [width,height] of [[1280,800],[390,844]]) {
    const desktop=width>600;
    await command('Network.enable');
    await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:!desktop});
    await command('Emulation.setTouchEmulationEnabled',{enabled:!desktop,maxTouchPoints:2});
    await command('Page.navigate',{url:`http://127.0.0.1:${httpPort}/arpg/?dev=1`});
    await waitFor('window.__arpg');
    await evaluate(`(async()=>{const {createSave,SaveStore}=await import('./js/meta/save.js');const s=createSave({name:'드래곤 표본',answers:[0,0,0,0,0],createdAt:1});new SaveStore(localStorage).save(s);})()`);
    await command('Page.reload');await waitFor(page('inn'));
    await nativeActivate('[data-action="board"]',desktop);
    await nativeActivate('[data-action="map-region"][data-region="outskirts"]',desktop);
    await nativeActivate('[data-action="sortie"][data-stage="S1"]',desktop);
    await nativeActivate('[data-action="launch"]',desktop);
    await waitFor('__arpg.world?.round.stageId==="S1" && __arpg.world.tick>0');
    await waitFor('__arpg.art.visuals.some(v=>v.key==="training_dragon" && v.mode==="atlas" && v.textureLoaded)',20000);
    const live=await evaluate(`JSON.parse(JSON.stringify(__arpg.art.visuals.filter(v=>v.key==='training_dragon')))`);
    const positions=await evaluate(`(()=>{const p=__arpg.world.entities.find(e=>e.kind==='player'),s=__arpg.world.entities.find(e=>e.type==='scarecrow'),d=__arpg.world.entities.find(e=>e.type==='training_dragon');return {player:{x:p.x,y:p.y},scarecrow:{x:s.x,y:s.y},dragon:{x:d.x,y:d.y,r:d.r,sizeScale:d.sizeScale,hp:d.hp},dragonDistance:Math.hypot(d.x-p.x,d.y-p.y),scarecrowDistance:Math.hypot(s.x-p.x,s.y-p.y)};})()`);
    assert.ok(positions.dragonDistance>positions.scarecrowDistance);
    assert.ok(positions.dragon.x>positions.scarecrow.x);assert.equal(positions.dragon.y,positions.scarecrow.y);
    assert.equal(live.length,1);assert.equal(live[0].id,'dragon');assert.ok(live[0].scale>2);assert.equal(live[0].state,'idle');
    // Test actual Pixi factory with frozen copies; never edit the authoritative host.
    const proof=await evaluate(`(async()=>{
      const {VisualProvider}=await import('./js/render/visual-provider.js');
      const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
      const entity=JSON.parse(JSON.stringify(__arpg.world.entities.find(v=>v.type==='training_dragon')));
      const provider=new VisualProvider();const view=provider.createVisual(freeze({...entity,act:null,moving:false,dead:false,staggerLeft:0}));
      await provider.atlases.load('training_dragon');await new Promise(resolve=>setTimeout(resolve,0));
      const samples=[];
      for(const [state,patch,animPatch] of [
        ['idle',{},{}],['run',{moving:true},{}],
        ['attack',{act:{elapsed:8,def:{windupMs:400,lockMs:100,activeMs:100,recoveryMs:400}}},{}],
        ['hit',{}, {hurt:.1}],['death',{dead:true},{}]]) {
        for(let octant=0;octant<8;octant++) {
          const model=freeze({...entity,act:null,moving:false,dead:false,staggerLeft:0,facing:octant*Math.PI/4,...patch});
          const before=JSON.stringify(model),anim={age:0,deadAge:0,hurt:0,flash:0,reduced:false,...animPatch};
          view.update(model,anim,1/60);const d=view.debug;
          if(JSON.stringify(model)!==before||d.state!==state||!d.textureLoaded)throw Error('dragon readonly/state failure '+state);
          samples.push({state,direction:d.direction,frame:d.frame});
        }
      }
      // Prove actual Pixi clip advancement, not only first-frame state labels.
      const motion={};
      for(const [state,patch,animPatch] of [
        ['idle',{},{}],['run',{moving:true},{}],['hit',{}, {hurt:.1}],['death',{dead:true},{}]]) {
        const model=freeze({...entity,act:null,moving:false,dead:false,staggerLeft:0,facing:0,...patch});
        const anim={age:0,deadAge:0,hurt:0,flash:0,reduced:false,...animPatch};
        const frames=[];for(let i=0;i<45;i++){view.update(model,anim,.025);frames.push(view.debug.frame);}
        if(new Set(frames).size<2)throw Error('static Pixi clip '+state);
        motion[state]={uniqueFrames:new Set(frames).size,lastFrame:frames.at(-1)};
      }
      const attackFrames=[];
      for(const elapsed of [0,8,29]) {
        const model=freeze({...entity,dead:false,moving:false,staggerLeft:0,facing:0,
          act:{elapsed,def:{windupMs:400,lockMs:100,activeMs:100,recoveryMs:400}}});
        view.update(model,{age:0,deadAge:0,hurt:0,flash:0,reduced:false},.025);
        attackFrames.push(view.debug.frame);
      }
      if(new Set(attackFrames).size<2)throw Error('static Pixi attack');motion.attack={frames:attackFrames};
      view.destroy();
      const offline=new VisualProvider();offline.atlases.fetchManifest=async()=>{throw Error('intentional offline')};
      const fallback=offline.createVisual(freeze(entity));await offline.atlases.load('training_dragon');
      const procedural=fallback.debug.mode==='procedural';fallback.destroy();
      return {samples,procedural,motion};
    })()`);
    assert.equal(proof.samples.length,40);assert.equal(proof.procedural,true);
    for(const state of ['idle','run','attack','hit','death'])assert.deepEqual(proof.samples.filter(s=>s.state===state).map(s=>s.direction),['E','SE','S','SW','W','NW','N','NE']);
    const player='__arpg.world.entities.find(e=>e.kind==="player")';
    const move=async(dx,dy,condition)=>{
      if(desktop){const key=dx>0?['d','KeyD',68]:dy>0?['s','KeyS',83]:['w','KeyW',87];
        await command('Input.dispatchKeyEvent',{type:'keyDown',key:key[0],code:key[1],windowsVirtualKeyCode:key[2]});
        try{await waitFor(condition,8000);}finally{await command('Input.dispatchKeyEvent',{type:'keyUp',key:key[0],code:key[1],windowsVirtualKeyCode:key[2]});}
      }else{
        await touch('touchStart',[{x:80,y:height*.65}]);await touch('touchMove',[{x:80+dx*42,y:height*.65+dy*42}]);
        try{await waitFor(condition,8000);}finally{await touch('touchEnd',[]);}
      }
    };
    // Route around the scarecrow's actual collision circle, no host position edits.
    await move(0,-1,`${player}.y<${positions.player.y-100}`);
    await move(1,0,`${player}.x>${positions.dragon.x-90}`);
    await move(0,1,`${player}.y>${positions.dragon.y-10}`);
    assert.equal(await evaluate(`${player}.weapon`),'blade');
    if(desktop)await command('Input.dispatchKeyEvent',{type:'keyDown',key:'j',code:'KeyJ',windowsVirtualKeyCode:74});
    else{const p=await evaluate(`(()=>{const r=document.querySelector('#attack').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);await touch('touchStart',[p]);}
    let impact;
    try{await waitFor(`__arpg.art.visuals.some(v=>v.key==='training_dragon' && v.state==='hit')`,5000);
      impact=await evaluate(`JSON.parse(JSON.stringify({visual:__arpg.art.visuals.find(v=>v.key==='training_dragon'),entity:__arpg.world.entities.find(e=>e.type==='training_dragon'),tracker:__arpg.tracker}))`);
    }finally{if(desktop)await command('Input.dispatchKeyEvent',{type:'keyUp',key:'j',code:'KeyJ',windowsVirtualKeyCode:74});else await touch('touchEnd',[]);}
    assert.equal(impact.entity.dead,false);assert.equal(impact.entity.hp,1);assert.equal(impact.entity.act,null);assert.equal(impact.entity.moving,false);
    assert.equal(impact.tracker.killIndex,0);assert.equal(impact.tracker.depositedXp,0);assert.deepEqual(impact.tracker.tempLoot,{gold:0,items:[],stacks:{}});
    // Body separation may nudge a stationary sample by a pixel when the hero walks into it; it never walks or is knocked back.
    assert.ok(Math.hypot(impact.entity.x-positions.dragon.x,impact.entity.y-positions.dragon.y)<4,JSON.stringify([impact.entity.x,impact.entity.y,positions.dragon]));
    await waitFor(`__arpg.art.visuals.some(v=>v.key==='training_dragon' && v.state==='idle')`,5000);
    const gpu=await evaluate(`(()=>{const c=document.querySelector('canvas'),g=c.getContext('webgl2')||c.getContext('webgl');return {maxTextureSize:g.getParameter(g.MAX_TEXTURE_SIZE),contextLost:g.isContextLost()};})()`);
    assert.ok(gpu.maxTextureSize>=2048);assert.equal(gpu.contextLost,false);
    const requests=events.filter(e=>e.method==='Network.responseReceived'&&e.params.response.url.includes('/sprites/dragon/')).map(e=>({url:e.params.response.url,status:e.params.response.status}));
    assert.ok(requests.filter(r=>[200,304].includes(r.status)).length>=1&&requests.every(r=>r.status<400),JSON.stringify(requests)); // Pixi decodes .webp off the page network log; textureLoaded above proves pixels.
    assert.equal(await evaluate("document.querySelector('#boot-error').textContent"),'');
    results.push({viewport:[width,height],native:desktop?'keyboard Enter/WDS/J':'touch UI/joystick/attack',positions,gpu,requests,impactState:impact.visual.state,invulnerable:true,stationaryWithin4px:true,emptyLoot:true,states:proof.samples,motion:proof.motion});
  }
  const errors=events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Log.entryAdded'&&e.params.entry.level==='error'||e.method==='Runtime.consoleAPICalled'&&e.params.type==='error');
  assert.equal(errors.length,0,JSON.stringify(errors));
  console.log(JSON.stringify({ok:true,results,consoleErrors:0,screenshots:0},null,2));
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
