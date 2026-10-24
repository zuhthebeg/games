// Self-contained raw CDP smoke: own static server and fresh browser profile, cleaned up in finally.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = resolve(process.env.ARPG_ROOT || fileURLToPath(new URL('../../', import.meta.url)));
const port = Number(process.env.ARPG_CDP_PORT || 9368);
const httpPort = Number(process.env.ARPG_HTTP_PORT || 8798);
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

  const states=[];
  for (const [weapon,width,height] of [['bow',390,844],['blade',390,844],['focus',390,844],['bow',1280,800]]) {
    await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});
    await command('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});
    await command('Page.navigate',{url:`http://127.0.0.1:${httpPort}/arpg/`});
    await waitFor('window.__arpg');
    await evaluate(`(async()=>{
      const {createSave,SaveStore}=await import('./js/meta/save.js');
      const s=createSave({name:'W1 검수',answers:[0,0,0,0,0],weapon:${JSON.stringify(weapon)},createdAt:1});
      s.level=10;s.stats={str:52,agi:10,int:34,wis:34,con:10,luk:10,cha:10};s.statPoints=18; // old {12,5,9,9,5} on the 10-12 scale
      s.cleared.S1=true;
      s.items.push({uid:'w1-heavy',id:'boar_hide_armor',enhance:0,affixes:[],rolledAt:0},
        {uid:'w1-same',id:'cloth_tunic',enhance:0,affixes:[],rolledAt:0});
      new SaveStore(localStorage).save(s);
    })()`);
    await command('Page.reload');await waitFor(page('inn'));
    await nativeActivate('[data-action="bag"]');
    await nativeActivate('[data-action="socket"][data-slot="body"]');
    await nativeActivate('[data-action="open-item"][data-uid="w1-same"]');
    assert.equal(await evaluate(`!!document.querySelector('dialog[open] [data-line="attackRate"]')`),false);
    await nativeActivate('[data-action="close-sheet"]');
    await nativeActivate('[data-action="socket"][data-slot="body"]');
    await nativeActivate('[data-action="open-item"][data-uid="w1-heavy"]');
    const compare=await evaluate(`(()=>{const n=document.querySelector('dialog[open] [data-line="attackRate"]');return {from:+n.dataset.from,to:+n.dataset.to,delta:+n.dataset.delta,text:n.textContent,summary:document.querySelector('dialog[open] .compare-summary').textContent}})()`);
    assert.ok(compare.delta<0);assert.match(compare.text,/▼/);assert.match(compare.summary,/공속.*▼/);
    await nativeActivate('[data-action="equip"][data-uid="w1-heavy"]');
    assert.equal(await evaluate('__arpg.save.equipped.body'),'w1-heavy');
    await nativeActivate('[data-action="inn"]');
    await nativeActivate('[data-action="board"]');
    await nativeActivate('[data-action="sortie"][data-stage="S2"]');
    await nativeActivate('[data-action="launch"]');
    await waitFor('document.querySelector("#meta-screen").hidden && __arpg.world?.round.state==="running"');
    assert.equal(await evaluate('__arpg.world.entities.find(e=>e.kind==="player").armorWeight'),12);
    await command('Input.dispatchKeyEvent',{type:'keyDown',code:'KeyJ',key:'j'});
    await waitFor('__arpg.world.entities.find(e=>e.kind==="player").act');
    const basic=await evaluate(`(async()=>{const {attackRate}=await import('./js/content/balance.js');const p=__arpg.world.entities.find(e=>e.kind==='player');return {rate:p.act.rate,expected:attackRate(p.attackSpeedBonus,p.weaponWeight,p.loadRatio,p.armorWeight,p.weapon),armor:p.armorWeight,ability:p.act.id};})()`);
    await command('Input.dispatchKeyEvent',{type:'keyUp',code:'KeyJ',key:'j'});
    assert.ok(Math.abs(basic.rate-basic.expected)<1e-9);assert.ok(Math.abs(basic.rate-compare.to)<1e-9);
    await waitFor('!__arpg.world.entities.find(e=>e.kind==="player").act');
    await command('Input.dispatchKeyEvent',{type:'keyDown',code:'KeyK',key:'k'});
    await waitFor('__arpg.world.entities.find(e=>e.kind==="player").act');
    const skill=await evaluate(`(()=>{const p=__arpg.world.entities.find(e=>e.kind==='player');return {rate:p.act.rate,ability:p.act.id};})()`);
    await command('Input.dispatchKeyEvent',{type:'keyUp',code:'KeyK',key:'k'});
    assert.equal(skill.rate,basic.rate);assert.notEqual(skill.ability,basic.ability);
    states.push({weapon,width,height,compare,basic,skill,unchangedHidden:true,nativeTouch:true});
  }
  const errors=events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Log.entryAdded'&&e.params.entry.level==='error'||e.method==='Runtime.consoleAPICalled'&&e.params.type==='error');
  assert.equal(errors.length,0,JSON.stringify(errors.slice(0,3)));
  console.log(JSON.stringify({ok:true,states,consoleErrors:0}));
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
