// Self-contained raw CDP smoke: own static server and fresh browser profile, cleaned up in finally.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = resolve(process.env.ARPG_ROOT || fileURLToPath(new URL('../../', import.meta.url)));
const port = Number(process.env.ARPG_CDP_PORT || 19999);
const httpPort = Number(process.env.ARPG_HTTP_PORT || 8998);
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
let readDiagnostics;
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
  readDiagnostics=()=>evaluate(`JSON.stringify({url:location.href,ready:document.readyState,hasArpg:!!window.__arpg})`);
  const waitFor = async (expression, timeout = 10000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await evaluate(expression)) return;
      await sleep(150);
    }
    throw new Error(`Timed out waiting for ${expression}`);
  };
  // A reload can expose an empty document; require the actual visible target page.
  const page = (name) => `document.querySelector('#meta-screen')?.dataset.page===${JSON.stringify(name)}
    && document.querySelector('#meta-screen')?.hidden===false`;
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
  const width=390,height=844;
  await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});
  await command('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});
  await command('Page.navigate',{url:`http://127.0.0.1:${httpPort}/arpg/?debug=0`});await waitFor('window.__arpg');
  await evaluate(`(async()=>{const {createSave,SaveStore,validateSave}=await import('./js/meta/save.js');const save=createSave({name:'S1-check',answers:[0,0,0,0,0],weapon:'blade',createdAt:11});if(!validateSave(save))throw Error('invalid fresh save');new SaveStore(localStorage).save(save);localStorage.setItem('arpg.autoAttack','0');})()`);
  await command('Page.reload');await waitFor(page('inn'));await nativeActivate('[data-action="board"]');
  await nativeActivate('[data-action="map-region"][data-region="outskirts"]');await nativeActivate('[data-action="sortie"][data-stage="S1"]');await waitFor(page('sortie'));await nativeActivate('[data-action="launch"]');await waitFor('__arpg.world?.round.stageId==="S1"');
  await nativeActivate('[data-battle-settings]');await nativeActivate('#battle-auto-on');await nativeActivate('[data-battle-settings]');
  const initial=await evaluate('JSON.parse(JSON.stringify({monsters:__arpg.world.entities.filter(e=>e.kind==="monster"),round:__arpg.world.round,art:__arpg.art}))');
  assert.deepEqual(initial.monsters.map(e=>e.type),['scarecrow']);assert.equal(initial.round.goal,'timer');assert.equal(initial.round.timerTicks,900);
  await waitFor('__arpg.world?.round.state==="clear"',45000);
  const final=await evaluate('JSON.parse(JSON.stringify({round:__arpg.world.round,monsters:__arpg.world.entities.filter(e=>e.kind==="monster"),tracker:__arpg.tracker,receipt:__arpg.save.lastReceipt,art:__arpg.art}))');
  assert.equal(final.round.t,900);assert.deepEqual(final.monsters.map(e=>e.type),['scarecrow']);assert.equal(final.monsters[0].dead,false);assert.equal(final.tracker.killIndex,0);assert.equal(final.tracker.depositedXp,0);assert.equal(final.receipt.stageId,'S1');assert.equal(final.receipt.terminal,'clear');assert.equal(final.receipt.xpGained,50);assert.equal(final.receipt.stageXp,50);assert.equal(final.receipt.goldGained,0);assert.deepEqual(final.receipt.lootKept,{gold:0,items:[],stacks:{}});assert.ok(!final.art.loaded.includes('training_dragon'));
  if(await evaluate('!!document.querySelector("#allocation-confirm")')){
   for(let i=0;i<12&&await evaluate('Number(document.querySelector("#allocation-left b").textContent)>0');i++)await nativeActivate('[data-action="stat-plus"][data-key="str"]:not([data-step]):not(:disabled)');
   await nativeActivate('#allocation-confirm');
  }
  await waitFor(page('receipt'));
  const persisted=await evaluate(`(async()=>{const {SaveStore,validateSave}=await import('./js/meta/save.js');const s=new SaveStore(localStorage).load();return {valid:validateSave(s),same:JSON.stringify(s)===JSON.stringify(__arpg.save),level:s.level,cleared:s.cleared.S1,receipt:s.lastReceipt};})()`);
  assert.ok(persisted.valid&&persisted.same&&persisted.cleared);assert.equal(persisted.level,2);
  const errors=events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Log.entryAdded'&&e.params.entry.level==='error'||e.method==='Runtime.consoleAPICalled'&&e.params.type==='error');assert.equal(errors.length,0,JSON.stringify(errors));
  console.log(JSON.stringify({ok:true,viewport:[width,height],native:'touch board/map/sortie/AUTO/allocation/receipt',initial,final,persisted,consoleErrors:0,screenshots:0,physicalPhone:false,hostStateWrites:false,baseline:'d38de8f'},null,2));
} catch(error) {
  let documentState;
  try { documentState=await readDiagnostics?.(); } catch(diagnosticError) { documentState={error:String(diagnosticError)}; }
  console.error(JSON.stringify({checkpoint:'smoke-failure',error:String(error),documentState,
    browserEvents:events.filter(e=>['Page.frameNavigated','Runtime.executionContextsCleared','Runtime.exceptionThrown','Inspector.targetCrashed'].includes(e.method)).slice(-16)}));
  throw error; // Diagnostics do not turn a failure into a pass or skip any gate.
} finally {
  socket?.close();
  await Promise.all([chrome,server].map(async child=>{if(child.exitCode!==null)return;child.kill('SIGTERM');await Promise.race([new Promise(r=>child.once('exit',r)),sleep(2500)]);if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');}));
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
