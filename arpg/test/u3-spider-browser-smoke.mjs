// Self-contained raw CDP smoke: own static server and fresh browser profile, cleaned up in finally.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = resolve(process.env.ARPG_ROOT || fileURLToPath(new URL('../../', import.meta.url)));
const port = Number(process.env.ARPG_CDP_PORT || 9381);
const httpPort = Number(process.env.ARPG_HTTP_PORT || 8811);
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
  for (const [width,height] of [[1280,800],[390,844]]) {
    const desktop=width>600;
    await command('Network.enable');
    await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:!desktop});
    await command('Emulation.setTouchEmulationEnabled',{enabled:!desktop,maxTouchPoints:2});
    await command('Page.navigate',{url:`http://127.0.0.1:${httpPort}/arpg/?dev=1`});
    await waitFor('window.__arpg');
    await evaluate(`(async()=>{const {createSave,SaveStore}=await import('./js/meta/save.js');const s=createSave({name:'독거미 검수',answers:[0,0,0,0,0],createdAt:1});s.gold=1000;for(const id of ['S1','S2','S3','S4','S5','S6'])s.cleared[id]=true;s.stacks={potion:5,mana_potion:5,return_scroll:2};new SaveStore(localStorage).save(s);})()`);
    await command('Page.reload');await waitFor(page('inn'));
    await nativeActivate('[data-action="board"]',desktop);
    await nativeActivate('[data-action="sortie"][data-stage="S7"]',desktop);
    await nativeActivate('[data-action="launch"]',desktop);
    await waitFor('__arpg.world?.round.stageId==="S7" && __arpg.world.tick>0');
    await waitFor('__arpg.art.visuals.filter(v=>v.key==="poison_spider" && v.mode==="atlas" && v.textureLoaded).length===1',20000);
    const live=await evaluate('JSON.parse(JSON.stringify(__arpg.art.visuals.filter(v=>v.key==="poison_spider")))');
    assert.ok(live.every(v=>v.id==='poison-spider'&&v.scale>0));
    assert.equal(await evaluate(`__arpg.art.visuals.filter(v=>v.key==='poison_spider').every(v=>__arpg.world.entities.some(e=>e.type==='poison_spider' && (e.sizeScale||1)===v.scale))`),true);
    // Test actual Pixi factory with frozen copies; never edit the authoritative host.
    const proof=await evaluate(`(async()=>{
      const {VisualProvider}=await import('./js/render/visual-provider.js');
      const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
      const entity=JSON.parse(JSON.stringify(__arpg.world.entities.find(v=>v.type==='poison_spider')));
      const provider=new VisualProvider();const view=provider.createVisual(freeze({...entity,act:null,moving:false,dead:false,staggerLeft:0}));
      await provider.atlases.load('poison_spider');await new Promise(resolve=>setTimeout(resolve,0));
      const samples=[];
      for(const [state,patch,animPatch] of [
        ['idle',{},{}],['run',{moving:true},{}],
        ['attack',{act:{elapsed:8,def:{windupMs:400,lockMs:100,activeMs:100,recoveryMs:400}}},{}],
        ['hit',{}, {hurt:.1}],['death',{dead:true},{}]]) {
        for(let octant=0;octant<8;octant++) {
          const model=freeze({...entity,act:null,moving:false,dead:false,staggerLeft:0,facing:octant*Math.PI/4,...patch});
          const before=JSON.stringify(model),anim={age:0,deadAge:0,hurt:0,flash:0,reduced:false,...animPatch};
          view.update(model,anim,1/60);const d=view.debug;
          if(JSON.stringify(model)!==before||d.state!==state||!d.textureLoaded)throw Error('spider readonly/state failure '+state);
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
      const fallback=offline.createVisual(freeze(entity));await offline.atlases.load('poison_spider');
      const procedural=fallback.debug.mode==='procedural';fallback.destroy();
      return {samples,procedural,motion};
    })()`);
    assert.equal(proof.samples.length,40);assert.equal(proof.procedural,true);
    for(const state of ['idle','run','attack','hit','death'])assert.deepEqual(proof.samples.filter(s=>s.state===state).map(s=>s.direction),['E','SE','S','SW','W','NW','N','NE']);
    // Native battle input also reaches the current index UI.
    if(desktop){await command('Input.dispatchKeyEvent',{type:'keyDown',key:'j',code:'KeyJ',windowsVirtualKeyCode:74});await sleep(100);await command('Input.dispatchKeyEvent',{type:'keyUp',key:'j',code:'KeyJ',windowsVirtualKeyCode:74});}
    else await nativeActivate('#attack');
    assert.equal(await evaluate("document.querySelector('#boot-error').textContent"),'');
    const gpu=await evaluate(`(()=>{const canvas=document.querySelector('canvas');const gl=canvas.getContext('webgl2')||canvas.getContext('webgl');if(!gl)throw Error('No active WebGL context');return {maxTextureSize:gl.getParameter(gl.MAX_TEXTURE_SIZE),version:gl.getParameter(gl.VERSION),contextLost:gl.isContextLost()};})()`);
    assert.ok(gpu.maxTextureSize>=2048);assert.equal(gpu.contextLost,false);
    results.push({gpu,viewport:[width,height],native:desktop?'keyboard Enter/J':'touch',spiderCount:live.length,states:proof.samples,motion:proof.motion,fallback:true,frozenHostUnchanged:true});
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
