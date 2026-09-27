import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const port = 19094;
const chrome = spawn('/home/cocy/bin/chromium', [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  `--remote-debugging-port=${port}`, '--user-data-dir=/tmp/spud-refresh-smoke', 'about:blank'
], { stdio: 'ignore' });
let ws, seq = 0;
const pending = new Map(), errors = [];
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
    } else if (message.method === 'Runtime.exceptionThrown' ||
      (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error')) {
      errors.push(message);
    }
  };
  function command(method, params = {}) {
    const id = ++seq;
    return new Promise((resolve, reject) => {
      pending.set(id, response => response.error ? reject(response.error) : resolve(response.result));
      ws.send(JSON.stringify({ id, method, params }));
    });
  }
  const evaluate = async expression => {
    const result = (await command('Runtime.evaluate', {
      expression, returnByValue: true, awaitPromise: true
    })).result;
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.value;
  };
  await command('Runtime.enable');
  await command('Page.enable');
  await command('Page.navigate', { url: 'http://127.0.0.1:8765/spudsquad/' });
  await new Promise(resolve => setTimeout(resolve, 800));
  await evaluate("localStorage.removeItem('spudsquad:solo:v1'); document.querySelector('[data-act=solo]').click(); document.querySelector('[data-act=basic]').click()");
  await evaluate("SPUD.main.session.world.players.solo.x = 291; SPUD.main.session.world.players.solo.mats = 41; window.dispatchEvent(new Event('pagehide'))");
  assert.ok(await evaluate("!!localStorage.getItem('spudsquad:solo:v1')"));
  await command('Page.reload', { ignoreCache: true });
  await new Promise(resolve => setTimeout(resolve, 950));
  const state = await evaluate("({x:SPUD.main.session?.world?.players.solo.x, mats:SPUD.main.session?.world?.players.solo.mats, tick:SPUD.main.session?.world?.tick})");
  assert.equal(state.mats, 41, JSON.stringify(state));
  assert.ok(state.x >= 291, JSON.stringify(state));
  assert.ok(state.tick > 0, JSON.stringify(state));
  await evaluate(`(() => {
    const s = SPUD.main.session, p = s.world.players.solo;
    p.mats = 100; p.pendingCrates = []; p.levelUps = 0;
    s.world.ended = true; s.world.reported = true;
    s.local({type:'WAVE_END',payload:{w:s.wave,players:{solo:{mats:100,levelUps:0,crates:0}}}});
    document.querySelector('[data-act="roll"]').click();
    window.dispatchEvent(new Event('pagehide'));
  })()`);
  const rolled = await evaluate("({rolls:SPUD.main.shopRolls, saved:!!localStorage.getItem('spudsquad:solo:v1')})");
  assert.equal(rolled.rolls, 1, JSON.stringify(rolled));
  await command('Page.reload', { ignoreCache: true });
  await new Promise(resolve => setTimeout(resolve, 900));
  const shop = await evaluate("({rolls:SPUD.main.shopRolls, wave:SPUD.main.session?.wave, ready:!!document.querySelector('[data-act=ready]')})");
  assert.equal(shop.rolls, 1, JSON.stringify(shop));
  assert.equal(shop.ready, true, JSON.stringify(shop));
  await evaluate("document.querySelector('[data-act=ready]').click()");
  assert.equal(await evaluate('SPUD.main.session.wave'), shop.wave + 1);
  assert.equal(errors.length, 0, JSON.stringify(errors.slice(0, 2)));
  console.log(JSON.stringify({ ok: true, restored: state, shop, errors: 0 }));
} finally {
  ws?.close();
  chrome.kill('SIGTERM');
}
