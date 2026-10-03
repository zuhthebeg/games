// 가상 패드 방향 전환: 왼쪽으로 멀리 민 뒤 손 떼지 않고 오른쪽으로 꺾으면 바로 오른쪽 이동(2026-10-01 버그 회귀).
// 사용: node test/pad-smoke.mjs [URL] (기본 http://127.0.0.1:8765/spudsquad/)
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const port = 19098;
const chrome = spawn('/home/cocy/bin/chromium', [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  `--remote-debugging-port=${port}`, '--user-data-dir=/tmp/spud-pad-smoke-' + Date.now(), 'about:blank'
], { stdio: 'ignore' });
let ws, seq = 0;
const pending = new Map(), events = [];
try {
  let target;
  for (let i = 0; i < 80; i++) {
    try {
      target = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      if (target[0]?.webSocketDebuggerUrl) break;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(target?.[0]?.webSocketDebuggerUrl, 'Chromium CDP unavailable');
  ws = new WebSocket(target[0].webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  ws.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      pending.get(message.id)?.(message);
      pending.delete(message.id);
    } else events.push(message);
  };
  function command(method, params = {}) {
    const id = ++seq;
    return new Promise((resolve, reject) => {
      pending.set(id, response => response.error ? reject(response.error) : resolve(response.result));
      ws.send(JSON.stringify({ id, method, params }));
    });
  }
  await command('Runtime.enable');
  await command('Page.enable');
  await command('Network.enable');
  await command('Network.setBlockedURLs', { urls: ['https://*', 'wss://*'] }); // local-only smoke
  await command('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 1, mobile: true });
  await command('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await command('Page.navigate', { url: process.argv[2] || 'http://127.0.0.1:8765/spudsquad/' });
  await new Promise(resolve => setTimeout(resolve, 1400));
  const evaluate = async expression => {
    const result = (await command('Runtime.evaluate', {
      expression, returnByValue: true, awaitPromise: true
    })).result;
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.value;
  };
  assert.ok(await evaluate("document.querySelector('h1')?.textContent.length > 0"));
  await evaluate("document.querySelector('[data-act=solo]').click()");
  await evaluate("document.querySelector('[data-act=basic]').click()");
  await new Promise(resolve => setTimeout(resolve, 1500));
  await evaluate("(() => { const w = SPUD.main.session.world; w.players.solo.immune = 1e9; w.spawnClock = -1e9; w.enemies.length = 0; return 1; })()");
  const touch = (type, x, y) => command('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const vx = () => evaluate('Math.round(SPUD.main.session.world.players.solo.vx || 0)');
  await touch('touchStart', 500, 250); await sleep(100);
  for (let x = 500; x >= 300; x -= 20) { await touch('touchMove', x, 250); await sleep(30); }
  await sleep(400);
  const left = await vx();
  for (let x = 300; x <= 380; x += 10) { await touch('touchMove', x, 250); await sleep(30); }
  await sleep(400);
  const back80 = await vx();
  for (let x = 380; x <= 440; x += 10) { await touch('touchMove', x, 250); await sleep(30); }
  await sleep(400);
  const back140 = await vx();
  await touch('touchEnd', 440, 250);
  const errors = events.filter(event => event.method === 'Runtime.exceptionThrown');
  const result = { left, back80, back140, errors: errors.length };
  assert.ok(left < -150, JSON.stringify(result));
  assert.ok(back80 > 0, 'reverses without lifting the finger ' + JSON.stringify(result));
  assert.ok(back140 > 150, 'full speed right ' + JSON.stringify(result));
  assert.equal(errors.length, 0);
  console.log(JSON.stringify({ ok: true, ...result }));
} finally {
  ws?.close();
  chrome.kill('SIGTERM');
}
