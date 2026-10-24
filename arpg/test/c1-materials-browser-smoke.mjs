// Self-contained raw CDP smoke: own static server and fresh browser profile, cleaned up in finally.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = resolve(process.env.ARPG_ROOT || fileURLToPath(new URL('../../', import.meta.url)));
const port = Number(process.env.ARPG_CDP_PORT || 19251);
const httpPort = Number(process.env.ARPG_HTTP_PORT || 8851);
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
  const page = (name) => `document.querySelector('#meta-screen')?.dataset.page===${JSON.stringify(name)}
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
  for(const [width,height] of [[390,844],[1280,800]]) {
    await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});
    await command('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
    await command('Page.navigate',{url:`http://127.0.0.1:${httpPort}/arpg/?dev=1`}); await waitFor('window.__arpg');
    await evaluate(`(async()=>{const {createSave,SaveStore}=await import('./js/meta/save.js');const {instance}=await import('./js/meta/items.js');const s=createSave({name:'C1',answers:[0,0,0,0,0],createdAt:123});s.gold=10000;Object.assign(s.stacks,{scrap:1000,hide:1000,wood:1000,web:1000,rune_shard:1000,fang:1000,frost_shard:1000,dragon_scale:1000});for(const id of ['short_bow','leather_vest','cloth_tunic','rune_blade','iron_sword'])s.items.push(instance('smoke:'+id,id));s.items.find(i=>i.id==='leather_vest').enhance=7;new SaveStore(localStorage).save(s);})()`);
    await command('Page.reload'); await waitFor(page('inn'));
    await nativeActivate('[data-action="forge"]',true);await waitFor(page('forge'));
    await nativeActivate('[data-action="forge-tab"][data-tab="craft"]');
    assert.match(await evaluate('document.querySelector(".craft-list").textContent'),/목재: 8/);
    assert.match(await evaluate('document.querySelector(".craft-list").textContent'),/룬 조각: 16/);
    assert.match(await evaluate('document.querySelector(".craft-list").textContent'),/거미줄: 16/);
    await nativeActivate('[data-action="forge-tab"][data-tab="salvage"]');
    const snapshot=()=>evaluate('JSON.parse(JSON.stringify(__arpg.save))');
    const refunds=[];
    for(const [id,key,label,amount] of [['short_bow','wood','목재',2],['leather_vest','hide','가죽',5],['cloth_tunic','web','거미줄',2],['rune_blade','rune_shard','룬 조각',5],['iron_sword','scrap','고철',5]]) {
      await nativeActivate(`[data-action="select-gear"][data-uid="smoke:${id}"]`);
      const text=await evaluate('document.querySelector(".forge-salvage [data-action=dismantle]").textContent');
      assert.match(text,new RegExp(`${label}: ${amount}`));
      if(id==='leather_vest'){assert.match(text,/강화석: 48/);assert.doesNotMatch(text,/상급/);}
      const before=await snapshot();
      await nativeActivate('.forge-salvage [data-action="dismantle"]');
      assert.match(await evaluate('document.querySelector("[data-action=confirm-dismantle]").textContent'),new RegExp(`${label}: ${amount}`));
      await nativeActivate('[data-action="confirm-dismantle"]',true);
      const after=await snapshot();assert.equal(after.stacks[key],before.stacks[key]+amount);
      assert.equal(after.items.some(i=>i.uid===`smoke:${id}`),false);assert.equal(after.gold,before.gold);
      if(id==='leather_vest'){assert.equal(after.stacks.enhance_stone_1,48);assert.equal(after.stacks.enhance_stone_3,undefined);}
      refunds.push({id,key,amount});
    }
    const crafted=[];
    const recipes=await evaluate(`(async()=>{const {RECIPES}=await import('./js/meta/items.js');return RECIPES;})()`);
    for(const [id,recipe] of Object.entries(recipes)) {
      await nativeActivate('[data-action="forge-tab"][data-tab="craft"]');const piece='[data-action="forge-piece"][data-id="'+id+'"]';if(await evaluate('!!document.querySelector('+JSON.stringify(piece)+')'))await nativeActivate(piece);const before=await snapshot();await nativeActivate(`[data-action="craft"][data-id="${id}"]`,true);
      const made=await snapshot(), item=made.items.at(-1);assert.equal(item.id,id);assert.ok(item.uid.startsWith('craft:'));
      assert.equal(made.gold,before.gold-recipe.gold);
      for(const [key,n] of Object.entries(recipe)) if(key!=='gold') assert.equal(made.stacks[key],before.stacks[key]-n);
      await waitFor('!document.querySelector(".craft-fx")');await nativeActivate('[data-action="forge-tab"][data-tab="salvage"]');
      const primary=await evaluate(`(async()=>{const {dismantleMaterial}=await import('./js/meta/items.js');return dismantleMaterial(__arpg.save.items.at(-1));})()`);
      const refund=Math.floor(recipe[primary]/4);
      await nativeActivate('.forge-salvage [data-action="dismantle"]');await nativeActivate('[data-action="confirm-dismantle"]');
      const after=await snapshot();assert.equal(after.stacks[primary],made.stacks[primary]+refund);
      assert.equal(after.items.some(i=>i.uid===item.uid),false);crafted.push({id,primary,refund,gold:recipe.gold});
    }
    await nativeActivate(`[data-action="select-gear"][data-uid="starter:weapon"]`);
    assert.equal(await evaluate('document.querySelector(".forge-salvage [data-action=dismantle]").disabled'),true);
    const beforeReload=await snapshot();await command('Page.reload');await waitFor(page('inn'));
    assert.deepEqual(await snapshot(),beforeReload);
    // Remove wood only in fixture, then verify actual native UI cannot offer a material-free craft.
    await evaluate(`(async()=>{const {SaveStore}=await import('./js/meta/save.js');const store=new SaveStore(localStorage),s=store.load();s.stacks.wood=0;store.save(s);})()`);
    await command('Page.reload');await waitFor(page('inn'));
    await nativeActivate('[data-action="forge"]');await nativeActivate('[data-action="forge-tab"][data-tab="craft"]');
    assert.equal(await evaluate('document.querySelector("[data-action=craft][data-id=hunter_bow]").disabled'),true);
    assert.equal(await evaluate('document.querySelector("[data-action=craft][data-id=altar_staff]").disabled'),true);
    assert.doesNotMatch(await evaluate('document.querySelector("#meta-screen").textContent'),/undefined|NaN/);
    states.push({width,height,refunds,crafted,missingWoodDisabled:true,wornDisabled:true,reload:true});
  }
  const errors=events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Log.entryAdded'&&e.params.entry.level==='error'||e.method==='Runtime.consoleAPICalled'&&e.params.type==='error');
  assert.equal(errors.length,0,JSON.stringify(errors.slice(0,3)));console.log(JSON.stringify({ok:true,states,consoleErrors:0}));

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
