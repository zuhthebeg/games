import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const BASE = process.argv[2] || 'http://127.0.0.1:18768/spudsquad/';
const profile = await mkdtemp(join(tmpdir(), 'spud-ult-'));
const chrome = spawn('/home/cocy/bin/chromium', ['--headless=new', '--no-sandbox', '--disable-gpu', '--remote-debugging-port=19170', '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws;
const results = {};
try {
  let tabs;
  for (let i = 0; i < 80; i++) {
    try { tabs = await (await fetch('http://127.0.0.1:19170/json')).json(); if (tabs[0]?.webSocketDebuggerUrl) break; } catch {}
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
  await cmd('Network.enable');
  await cmd('Network.setBlockedURLs', { urls: ['https://*', 'wss://*'] });
  await cmd('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await cmd('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await cmd('Page.navigate', { url: BASE + '?debug=1' });
  await until("!!document.querySelector('[data-act=solo]')");
  await until("document.getElementById('ultBtn').disabled");
  results.titleVisible = await ev("getComputedStyle(document.getElementById('ultBtn')).display !== 'none'");
  assert.equal(results.titleVisible, true);
  await click('solo'); await click('vampire');
  await until('!!window.SPUD?.main?.session?.world && !document.getElementById("ultBtn").disabled');
  await ev('SPUD.main.session.world.spawnClock = -1e9; SPUD.main.session.world.players.solo.immune = 1e9; SPUD.main.session.world.players.solo.cool = [1e9]');
  const geometry = () => ev(`(() => {
    const b = document.getElementById('ultBtn').getBoundingClientRect(), p = document.getElementById('pad').getBoundingClientRect();
    return { width: innerWidth, height: innerHeight, button: { left: b.left, right: b.right, top: b.top, bottom: b.bottom },
      pad: { left: p.left, right: p.right, top: p.top, bottom: p.bottom },
      overlap: !(b.right <= p.left || b.left >= p.right || b.bottom <= p.top || b.top >= p.bottom),
      hit: document.elementFromPoint((b.left+b.right)/2,(b.top+b.bottom)/2)?.id };
  })()`);
  results.portrait = await geometry(); assert.equal(results.portrait.overlap, false); assert.equal(results.portrait.hit, 'ultBtn');
  assert.ok(results.portrait.button.bottom <= 844 && results.portrait.button.left >= 0);
  results.reviveNoOverlap = await ev(`(() => {
    const revive = document.getElementById('reviveBtn'); revive.hidden = false; revive.textContent = '20회 흔들어 부활';
    const r = revive.getBoundingClientRect(), b = document.getElementById('ultBtn').getBoundingClientRect();
    const clear = b.bottom <= r.top || b.top >= r.bottom || b.right <= r.left || b.left >= r.right;
    revive.hidden = true; return clear;
  })()`);
  assert.equal(results.reviveNoOverlap, true);
  await ev(`(() => {
    const w = SPUD.main.session.world, p = w.players.solo; p.hp = 1; w.enemies = [];
    for (const [type, distance, hp] of [['boss_1', 100, 80], ['blob', 219, 30], ['blob', 221, 60]]) {
      const e = SPUD.sim.spawn(w, type, p.x + distance, p.y); e.hp = hp; e.maxHp = 100;
      e.speed = 0; e.atk = 0;
    }
  })()`);
  // Invoke keyboard and inspect synchronously: exact effect before the next simulation step.
  results.vampire = await ev(`(() => {
    const s = SPUD.main.session, w = s.world; w.enemies.forEach(e => e.speed = 0);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'u', code: 'KeyU' }));
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'u', code: 'KeyU' }));
    return { hp: w.players.solo.hp, maxHp: w.players.solo.maxHp, enemies: w.enemies.map(e => e.hp), used: w.players.solo.ultUsed };
  })()`);
  assert.deepEqual(results.vampire.enemies, [40,15,60]); assert.equal(results.vampire.hp, results.vampire.maxHp);
  assert.equal(results.vampire.used, true);
  await until('document.getElementById("ultBtn").disabled');
  results.usedOpacity = await ev('getComputedStyle(document.getElementById("ultBtn")).opacity'); assert.equal(results.usedOpacity, '0.35');
  await ev("window.dispatchEvent(new Event('pagehide'))"); await cmd('Page.reload');
  await until('!!window.SPUD?.main?.session?.world && SPUD.main.session.world.players.solo.ultUsed');
  assert.equal(await ev('SPUD.main.useUlt()'), false); results.reloadUsed = true;
  await ev('SPUD.main.session.world.players.solo.mats = 1000; SPUD.main.session.world.tm = 0');
  await until("!!document.querySelector('.shop-screen')");
  assert.equal(await ev('document.getElementById("ultBtn").disabled && !SPUD.main.useUlt()'), true); results.shopBlocked = true;
  await click('ready'); await until('SPUD.main.session.wave === 2 && !document.getElementById("ultBtn").disabled');
  results.nextWaveReady = true;
  await cmd('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 1, mobile: true });
  await sleep(200);
  results.landscape = await geometry(); assert.equal(results.landscape.overlap, false); assert.equal(results.landscape.hit, 'ultBtn');
  // Button touch must not capture a floating movement pad.
  await ev('SPUD.main.session.world.players.solo.immune = 1e9; SPUD.main.session.world.players.solo.cool = [1e9]');
  const b = results.landscape.button;
  await cmd('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: (b.left+b.right)/2, y: (b.top+b.bottom)/2, id: 1 }] });
  await cmd('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await until('SPUD.main.session.world.players.solo.ultUsed');
  assert.equal(await ev('document.getElementById("pad").classList.contains("active")'), false); results.touchUsed = true;
  // Synthetic death still blocks; real sensor/hardware behavior is not claimed.
  await ev('SPUD.main.session.start(3); SPUD.main.session.world.players.solo.alive = false; SPUD.main.session.world.players.solo.hp = 0');
  assert.equal(await ev('SPUD.main.useUlt()'), false); results.deadBlocked = true;
  await ev('SPUD.main.session.receive({type:"GAME_OVER",payload:{win:false,wave:3}})'); await click('back');
  await until('SPUD.main.mode === "title"'); await click('solo'); await click('basic');
  await until('!!window.SPUD?.main?.session?.world && !document.getElementById("ultBtn").disabled');
  assert.equal(await ev('SPUD.main.session.world.players.solo.ultUsed'), false); results.newGameReset = true;
  results.localTransport = await ev(`(() => {
    const N = SPUD.net, S = SPUD.sim;
    let h, g; const packets = [];
    h = new N.Session({ uid: 'host', host: 'host', sendRt: data => g.rt('host', JSON.parse(JSON.stringify(data))) });
    g = new N.Session({ uid: 'guest', host: 'host', sendRt: data => { packets.push(data); h.rt('guest', JSON.parse(JSON.stringify(data))); } });
    const roster = { players: [{ user: 'host' }, { user: 'guest' }], hostUser: 'host' };
    h.roster(roster); g.roster(roster);
    const start = { type: 'WAVE_START', payload: { w: 4, players: { host: {char:'basic'}, guest: {char:'vampire'} } } };
    h.receive(start); g.receive(start);
    const p = h.world.players.guest; p.hp = 1;
    const e = S.spawn(h.world, 'boss_1', p.x+100, p.y); e.hp = 80;
    g.rt('host', JSON.parse(JSON.stringify(N.encode(h.world))));
    const ok = g.requestUlt(); const duplicate = g.requestUlt();
    h.world.tick++; g.rt('host', JSON.parse(JSON.stringify(N.encode(h.world))));
    const row = g.buffer.a.at(-1).s.pl.find(p => p[0] === 'guest');
    const view = S.createPlayer('guest','vampire'); view.hp=row[3]; view.alive=row[5]; view.ultUsed=row[11];
    SPUD.ui.ultimate(view,'wave');
    return { ok, duplicate, requests: packets.length, guestWorld: g.world, hp: row[3], maxHp: row[4],
      used: row[11], bossHp: e.hp, buttonDisabled: document.getElementById('ultBtn').disabled };
  })()`);
  assert.deepEqual(results.localTransport, { ok: true, duplicate: false, requests: 1, guestWorld: null, hp: 15, maxHp: 15, used: true, bossHp: 40, buttonDisabled: true });
  assert.deepEqual(errors, []); results.runtimeExceptions = errors;
  console.log(JSON.stringify({ passed: true, ...results }));
} finally {
  ws?.close();
  const exited = new Promise(resolve => chrome.once('exit', resolve));
  chrome.kill(); await exited; await rm(profile, { recursive: true, force: true });
}
