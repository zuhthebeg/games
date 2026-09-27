import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const port = 19093;
const chrome = spawn('/home/cocy/bin/chromium', [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  `--remote-debugging-port=${port}`, '--user-data-dir=/tmp/spud-browser-smoke', 'about:blank'
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
  await command('Page.navigate', { url: 'http://127.0.0.1:8765/spudsquad/' });
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
  await new Promise(resolve => setTimeout(resolve, 22000));
  const result = await evaluate(`(() => {
    const canvas = document.querySelector('canvas');
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    const unique = new Set();
    for (let i = 0; i < pixels.length; i += Math.max(4, (pixels.length / 1500 | 0) * 4)) {
      unique.add(pixels[i] + ',' + pixels[i + 1] + ',' + pixels[i + 2]);
    }
    return { tick: SPUD.main.session?.world?.tick, timer: SPUD.main.session?.world?.tm,
      unique: unique.size, canvas: [canvas.width, canvas.height] };
  })()`);
  const errors = events.filter(event => event.method === 'Runtime.exceptionThrown' ||
    event.method === 'Runtime.consoleAPICalled' && event.params.type === 'error');
  assert.ok(result.tick > 0, JSON.stringify(result));
  assert.ok(result.unique > 1, JSON.stringify(result));
  assert.equal(errors.length, 0, JSON.stringify(errors.slice(0, 3)));
  console.log(JSON.stringify({ ok: true, ...result, consoleErrors: errors.length }));
} finally {
  ws?.close();
  chrome.kill('SIGTERM');
}
