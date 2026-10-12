// Self-contained raw CDP smoke: own static server and fresh browser profile, cleaned up in finally.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = resolve(process.env.ARPG_ROOT || fileURLToPath(new URL('../../../../', import.meta.url)));
const port = Number(process.env.ARPG_CDP_PORT || 9379);
const httpPort = Number(process.env.ARPG_HTTP_PORT || 8819);
const width = Number(process.env.ARPG_WIDTH || 390), height = Number(process.env.ARPG_HEIGHT || 844);
const mobile = width < 600;
const profile = await mkdtemp(join(tmpdir(), 'arpg-vfx-'));
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
    }, method === 'Runtime.evaluate' ? 120000 : 15000);
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
  await command('Runtime.enable'); await command('Log.enable');
  const results=[];
  for (const width of [390, 1280]) for (const flag of ['', '?fx=effekseer']) {
    await command('Emulation.setDeviceMetricsOverride', {width,height:844,deviceScaleFactor:1,mobile:width<600});
    await command('Emulation.setTouchEmulationEnabled', {enabled:true,maxTouchPoints:5});
    await command('Page.navigate',{url:`http://127.0.0.1:${httpPort}/arpg/test/feel-fixture.html${flag}`});
    await waitFor('document.readyState==="complete" && document.title==="ARPG render fixture"');
    const ready=await evaluate(`(async()=>{
      const {Application,Graphics,Container}=await import('../vendor/pixi-8.22.0.min.mjs');
      const {SkillVfx}=await import('../js/render/skill-vfx.js');
      const app=new Application();await app.init({width:390,height:400,preference:'webgl',autoStart:false});
      document.body.appendChild(app.canvas);
      const layer=new Container();app.stage.addChild(layer);const vfx=new SkillVfx(Graphics,layer);
      if(vfx.fxLoad) await vfx.fxLoad;
      window.fx1={app,vfx,layer,clicks:0};
      const button=document.createElement('button');button.textContent='FX1';button.id='fx1-fire';
      button.style='position:fixed;left:12px;top:420px;width:120px;height:50px';document.body.appendChild(button);
      button.onclick=()=>{fx1.clicks++;vfx.event({type:'explode',ability:'ember_bolt',x:210,y:230,radius:78},{},false);app.render()};
      return {requested:vfx.fxRequested,ready:vfx.fxReady,error:vfx.fxError,children:layer.children.length};
    })()`);
    assert.equal(ready.requested,!!flag);assert.equal(ready.ready,!!flag,JSON.stringify(ready));
    if(width<600){await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:60,y:445}]});await command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
    else {await command('Input.dispatchMouseEvent',{type:'mousePressed',x:60,y:445,button:'left',clickCount:1});await command('Input.dispatchMouseEvent',{type:'mouseReleased',x:60,y:445,button:'left',clickCount:1});}
    const proof=await evaluate(`(()=>{
      const {vfx,app,layer}=fx1;const world={tick:1,entities:[],projectiles:[{id:7,abilityId:'ember_bolt',x:150,y:200,r:8,vx:300,vy:0}]};
      const before=JSON.stringify(world);vfx.update(world,1,.05,false);app.render();
      const slot=vfx.projectiles[0],impact=vfx.fxImpacts.find(s=>s.left>0);
      const initial=slot.baked?.texture;const firstImpact=impact?.node.texture;
      const visibleBaked=!!slot.baked?.visible,visibleVector=slot.node.visible;
      const activeImpact=!!impact?.node.visible;
      vfx.update(world,1,.05,false);app.render();
      const advanced=!vfx.fxReady||slot.baked.texture!==initial;
      const impactAdvanced=!vfx.fxReady||impact.node.texture!==firstImpact;
      const children=layer.children.length;
      for(let i=0;i<20;i++)vfx.event({type:'explode',ability:'ember_bolt',x:210,y:230,radius:78},world,false);
      const bounded=children===layer.children.length;
      vfx.update(world,1,.01,true);app.render();
      const reducedLegacy=slot.node.visible&&!slot.baked?.visible;
      vfx.reset();app.render();const reset=vfx.fxImpacts.every(s=>!s.node.visible)&&vfx.projectiles.every(s=>!s.baked?.visible);
      vfx.update({tick:2,entities:[],projectiles:[{...world.projectiles[0],abilityId:'blast_arrow'}]},1,.016,false);app.render();
      const unrelatedLegacy=vfx.projectiles[0].node.visible&&!vfx.projectiles[0].baked?.visible;
      return {clicks:fx1.clicks,visibleBaked,visibleVector,activeImpact,advanced,impactAdvanced,bounded,reducedLegacy,reset,unrelatedLegacy,readOnly:before===JSON.stringify(world),sprites:vfx.fxImpacts.length+vfx.projectiles.filter(s=>s.baked).length};
    })()`);
    assert.equal(proof.clicks,1);assert.equal(proof.visibleBaked,!!flag);assert.equal(proof.visibleVector,!flag);
    if(flag)assert.equal(proof.activeImpact,true);
    for(const key of ['advanced','impactAdvanced','bounded','reducedLegacy','reset','unrelatedLegacy','readOnly'])assert.equal(proof[key],true,JSON.stringify(proof));
    results.push({width,flag,nativeInput:width<600?'touch':'mouse',...ready,...proof});
  }
  // Actual game boot with the flag as well, not only the renderer fixture.
  await command('Page.navigate',{url:`http://127.0.0.1:${httpPort}/arpg/?dev=1&fx=effekseer`});
  await waitFor('window.__arpg');
  await waitFor(`performance.getEntriesByType('resource').some(e=>e.name.includes('/assets/vfx/fireball/atlas.json'))`);
  const gameResources = await evaluate(`performance.getEntriesByType('resource').filter(e=>e.name.includes('/assets/vfx/fireball/')).map(e=>e.name)`);
  const errors=events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Log.entryAdded'&&e.params.entry.level==='error'||e.method==='Runtime.consoleAPICalled'&&e.params.type==='error');
  assert.equal(errors.length,0,JSON.stringify(errors));
  console.log(JSON.stringify({ok:true,results,gameResources,gameBoot:true,consoleErrors:0}));
} finally {
  socket?.close();
  await Promise.all([chrome, server].map(async child => {
    if (child.exitCode !== null) return;
    child.kill('SIGTERM');
    await Promise.race([new Promise(resolveExit => child.once('exit', resolveExit)), sleep(2500)]);
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }));
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
