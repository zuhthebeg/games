// No dependencies. Start python http.server 8732 at repo root before running.
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const profile = await mkdtemp(join(tmpdir(), 'arpg-spike-cdp-'));
const port = 19094;
const chrome = spawn('/home/cocy/bin/chromium', [
  '--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'
], { stdio: 'ignore' });
const exit = new Promise(resolve => chrome.once('exit', resolve));
let ws, seq = 0;
const pending = new Map(), events = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  let target;
  for (let i = 0; i < 80; i++) {
    try { const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); target = targets.find(t => t.type === 'page'); if (target?.webSocketDebuggerUrl) break; } catch {}
    await sleep(100);
  }
  assert.ok(target?.webSocketDebuggerUrl, 'Chromium CDP unavailable');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  ws.onmessage = event => {
    const m = JSON.parse(event.data);
    if (m.id) { pending.get(m.id)?.(m); pending.delete(m.id); } else events.push(m);
  };
  function command(method, params = {}) {
    const id = ++seq;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timeout`)); }, 60000);
      pending.set(id, response => { clearTimeout(timeout); response.error ? reject(new Error(JSON.stringify(response.error))) : resolve(response.result); });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression) {
    const response = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
    return response.result.value;
  }
  await command('Runtime.enable'); await command('Page.enable'); await command('Network.enable');
  await command('Emulation.setDeviceMetricsOverride', { width: 412, height: 732, deviceScaleFactor: 2, mobile: true });
  await command('Page.navigate', { url: 'http://127.0.0.1:8732/arpg/spike/?quick=1' });
  for (let i = 0; i < 60; i++) { if (await evaluate('!!window.spike')) break; await sleep(100); }
  assert.ok(await evaluate('!!window.spike'), 'Page harness missing');
  assert.equal(await evaluate("document.querySelector('meta[name=robots]').content"), 'noindex,nofollow');
  const invariants = await evaluate(`(async () => {
    const s = await import('./scene.js');
    const a = s.makeScene(), b = s.makeScene(), stress = s.makeScene(2);
    s.updateScene(a, 2.75, 412, 732); s.updateScene(b, 2.75, 412, 732);
    const assets = s.makeAssets(), palettes = s.bakePalettes(assets.atlas);
    const original = assets.atlas.getContext('2d').getImageData(0,96,576,96).data;
    let paletteCorrect = true;
    for (let j = 0; j < 6; j++) {
      const out = palettes[j].getContext('2d').getImageData(0,0,576,96).data, color = s.PALETTE[j], channels = [color>>16, color>>8&255, color&255];
      for (let i = 0; i < original.length; i += 4) {
        for (let ch = 0; ch < 3; ch++) if (out[i+3] === 255 && out[i+ch] !== Math.round(original[i+ch]*channels[ch]/255)) paletteCorrect = false;
        if (out[i+3] !== original[i+3]) paletteCorrect = false;
      }
    }
    const extraBytes = palettes.reduce((sum,c) => sum+c.width*c.height*4,0);
    palettes.forEach(c => c.width=c.height=0); assets.destroy();
    return { deterministic: JSON.stringify(a) === JSON.stringify(b), counts: [stress.entities.length, stress.particles.length, stress.numbers.length, stress.telegraphs.length], paletteCorrect, extraBytes, stats: spike.stats([10,20,40,50]) };
  })()`);
  assert.equal(invariants.deterministic, true); assert.equal(invariants.paletteCorrect, true);
  assert.deepEqual(invariants.counts, [48, 400, 60, 6]); assert.equal(invariants.extraBytes, 1327104);
  assert.deepEqual(invariants.stats.frameMs, { p50: 20, p95: 50, p99: 50 });
  assert.equal(invariants.stats.averageFps, 33.33); assert.equal(invariants.stats.over16_7Pct, 75); assert.equal(invariants.stats.over33_3Pct, 50);
  const first = await evaluate("spike.runSequence(['A','B'])");
  const failures = await evaluate('spike.failures');
  assert.ok(first.some(r => r.variant === 'B'), `B failed: ${JSON.stringify(failures)}`);
  assert.ok(first.some(r => r.variant === 'A'), `Pixi init/render failed (do not substitute libraries): ${JSON.stringify(failures)}`);
  // Repeat A after destruction; stress B checks doubled scene and resource cleanup.
  await evaluate("document.getElementById('stress').checked=true");
  const repeat = await evaluate("spike.runSequence(['A'])");
  const stress = await evaluate("spike.runSequence(['B'])");
  assert.equal(repeat.length, 1); assert.equal(repeat[0].multiplier, 2); assert.equal(stress[0].multiplier, 2);
  const results = await evaluate('spike.results');
  for (const r of results) {
    assert.equal(r.durationMs, 5000); assert.equal(r.warmupMs, 3000); assert.ok(r.frames > 0);
    assert.ok(r.averageFps > 0); assert.ok(r.frameMs.p99 >= r.frameMs.p95); assert.ok(r.measuredElapsedMs >= 5000);
    assert.ok(r.loadInitMs > 0); assert.equal(r.view.dpr, 2); assert.equal(r.view.width, 412);
    assert.equal(r.memory.extraPaletteRgbaBytes, r.variant === 'B' ? 1327104 : 0);
  }
  assert.equal(await evaluate("document.querySelectorAll('#stage canvas').length"), 0);
  // Abort must not create a partial result, and UI must unlock.
  await evaluate("(() => { const p=spike.runSequence(['B']); setTimeout(()=>spike.stop(),250); return p; })()");
  assert.equal(await evaluate('spike.results.length'), 4); assert.equal(await evaluate('spike.busy'), false);
  assert.ok(await evaluate("document.getElementById('export').value.includes('arpg-render-spike-1')"));
  const errors = events.filter(e => e.method === 'Runtime.exceptionThrown' || e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error' || e.method === 'Log.entryAdded' && e.params.entry.level === 'error');
  assert.equal(errors.length, 0, JSON.stringify(errors));
  const remote = events.filter(e => e.method === 'Network.requestWillBeSent').map(e => e.params.request.url).filter(url => !url.startsWith('http://127.0.0.1:8732/') && !url.startsWith('data:'));
  assert.deepEqual(remote, [], 'Unexpected external requests');
  console.log(JSON.stringify({ ok: true, warning: 'HEADLESS SWIFTSHADER SOFTWARE GL: numbers NOT meaningful for device performance', invariants,
    results: results.map(r => ({ variant: r.variant, multiplier: r.multiplier, renderer: r.renderer, averageFps: r.averageFps, frameMs: r.frameMs, loadInitMs: r.loadInitMs })), consoleErrors: errors.length }, null, 2));
} finally {
  ws?.close(); chrome.kill('SIGTERM');
  await Promise.race([exit, sleep(3000)]);
  if (chrome.exitCode === null) { chrome.kill('SIGKILL'); await exit; }
  // Chromium helper processes may finish profile writes just after the parent exits.
  await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
