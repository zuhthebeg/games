import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const BASE = process.argv[2] || 'http://127.0.0.1:18768/spudsquad/';
const profile = await mkdtemp(join(tmpdir(), 'spud-balance-'));
const chrome = spawn('/home/cocy/bin/chromium', ['--headless=new', '--no-sandbox', '--disable-gpu', '--remote-debugging-port=19169', '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws;
const results = {};
try {
  let tabs;
  for (let i = 0; i < 80; i++) {
    try { tabs = await (await fetch('http://127.0.0.1:19169/json')).json(); if (tabs[0]?.webSocketDebuggerUrl) break; } catch {}
    await sleep(100);
  }
  assert.ok(tabs?.[0]?.webSocketDebuggerUrl, 'headless Chrome ready');
  ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  let id = 0; const pending = new Map(), errors = [];
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id) { pending.get(m.id)?.(m); pending.delete(m.id); }
    else if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  };
  const cmd = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id;
    const timer = setTimeout(() => { pending.delete(n); reject(new Error('CDP timeout: ' + method)); }, 10000);
    pending.set(n, m => { clearTimeout(timer); m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m); });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  const ev = async expression => {
    const m = await cmd('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (m.result.exceptionDetails) throw new Error(JSON.stringify(m.result.exceptionDetails));
    return m.result.result?.value;
  };
  const until = async expression => {
    for (let i = 0; i < 60; i++) { if (await ev(expression)) return; await sleep(100); }
    throw new Error('UI condition timeout: ' + expression);
  };
  const click = act => ev(`document.querySelector('[data-act="${act}"]').click()`);
  await cmd('Runtime.enable');
  await cmd('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await cmd('Page.navigate', { url: BASE });
  await until("!!document.querySelector('[data-act=solo]')"); await click('solo'); await click('muscle');
  await until('!!SPUD.main.session?.world');
  await ev('SPUD.main.session.world.players.solo.immune = 1e9');
  await cmd('Input.dispatchKeyEvent', { type: 'keyDown', key: 'd', code: 'KeyD', windowsVirtualKeyCode: 68 });
  await sleep(650);
  const speed = await ev('SPUD.main.session.world.players.solo.vx');
  assert.ok(Math.abs(speed - 232.8) < 1, 'real keyboard speed 240 × 0.97'); results.speed = speed;
  await cmd('Input.dispatchKeyEvent', { type: 'keyUp', key: 'd', code: 'KeyD', windowsVirtualKeyCode: 68 });
  await ev('SPUD.main.session.world.tm = 0; SPUD.main.session.world.players.solo.mats = 1000');
  await until("!!document.querySelector('.shop-screen')");
  const setStock = () => ev(`SPUD.main.offers.forEach(o => Object.assign(o, { sold: false, weapon: false, id: 'clover', tier: 1, price: 1 })); SPUD.ui.toggle(); SPUD.ui.toggle(); SPUD.ui.toggle()`);
  const state = () => ev(`({ mats: SPUD.main.session.world.players.solo.mats, count: SPUD.main.shopRolls, sold: SPUD.main.offers.filter(o => o.sold).length, rollCost: Number(document.querySelector('[data-act=roll]').textContent.split('💎')[1]) })`);
  await setStock();
  for (let i = 0; i < 4; i++) await click('buy' + i);
  assert.deepEqual(await state(), { mats: 996, count: 0, sold: 4, rollCost: 0 });
  // Save by the actual pagehide hook; reload restores the four sold slots.
  await ev("window.dispatchEvent(new Event('pagehide'))"); await cmd('Page.reload');
  await until("!!document.querySelector('.shop-screen')");
  assert.deepEqual(await state(), { mats: 996, count: 0, sold: 4, rollCost: 0 });
  await click('roll');
  assert.deepEqual(await state(), { mats: 996, count: 1, sold: 0, rollCost: 4 });
  await click('lock1'); const locked = await ev('JSON.stringify(SPUD.main.offers[1])');
  await ev("window.dispatchEvent(new Event('pagehide'))"); await cmd('Page.reload');
  await until("!!document.querySelector('.shop-screen')");
  assert.equal(await ev('JSON.stringify(SPUD.main.offers[1])'), locked);
  await click('roll');
  assert.equal(await ev('JSON.stringify(SPUD.main.offers[1])'), locked);
  assert.deepEqual(await state(), { mats: 992, count: 2, sold: 0, rollCost: 5 });
  await click('lock1'); await setStock();
  for (let i = 0; i < 4; i++) await click('buy' + i);
  await click('roll');
  assert.deepEqual(await state(), { mats: 988, count: 3, sold: 0, rollCost: 6 });
  results.shop = await state();
  await click('ready'); await until('SPUD.main.session.wave === 2');
  assert.equal(await ev('SPUD.main.session.world.players.solo.mats'), 988); results.readyWave = 2;
  assert.deepEqual(errors, []); results.runtimeExceptions = errors;
  console.log(JSON.stringify({ passed: true, ...results }));
} finally {
  ws?.close();
  const exited = new Promise(resolve => chrome.once('exit', resolve));
  chrome.kill(); await exited; await rm(profile, { recursive: true, force: true });
}
