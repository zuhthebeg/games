import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const base = new URL(process.argv[2] || 'http://127.0.0.1:8767/');
const port = 19127;
const chrome = spawn('/home/cocy/bin/chromium', [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  `--remote-debugging-port=${port}`, '--user-data-dir=/tmp/spud-landscape-smoke', 'about:blank'
], { stdio: 'ignore' });
let ws, seq = 0;
const pending = new Map(), errors = [], screenshots = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  let targets;
  for (let i = 0; i < 80; i++) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      if (targets[0]?.webSocketDebuggerUrl) break;
    } catch {}
    await pause(100);
  }
  assert.ok(targets?.[0]?.webSocketDebuggerUrl, 'Chromium CDP unavailable');
  ws = new WebSocket(targets[0].webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  ws.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      pending.get(message.id)?.(message);
      pending.delete(message.id);
    } else if (message.method === 'Runtime.exceptionThrown' ||
      message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push(message);
  };
  function cmd(method, params = {}) {
    const id = ++seq;
    return new Promise((resolve, reject) => {
      pending.set(id, response => response.error ? reject(new Error(JSON.stringify(response.error))) : resolve(response.result));
      ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression) {
    const result = (await cmd('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result;
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.value;
  }
  async function until(expression, label) {
    for (let i = 0; i < 80; i++) {
      if (await evaluate(expression)) return;
      await pause(100);
    }
    throw new Error(`Timed out waiting for ${label}`);
  }
  async function screenshot(width, height, stage) {
    const path = `/tmp/spud-land-${width}x${height}-${stage}.png`;
    const { data } = await cmd('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(path, Buffer.from(data, 'base64'));
    screenshots.push(path);
  }
  await cmd('Runtime.enable');
  await cmd('Page.enable');
  const results = [];
  for (const [width, height] of [[844, 390], [740, 360]]) {
    await cmd('Page.navigate', { url: 'about:blank' });
    await pause(100);
    await cmd('Storage.clearDataForOrigin', { origin: base.origin, storageTypes: 'local_storage' });
    await cmd('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
    await cmd('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await cmd('Page.navigate', { url: new URL('spudsquad/', base).href });
    await until("!!document.querySelector('[data-act=landscape]')", 'title');
    const metrics = await evaluate(`(() => {
      const panel = document.querySelector('.panel'), button = document.querySelector('[data-act=landscape]');
      const wallet = document.querySelector('#sw-bar');
      return { walletHeight: wallet?.getBoundingClientRect().height, reservation: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--wallet-bar-h')),
        titleFits: panel.scrollHeight <= panel.clientHeight + 1, titleScroll: panel.scrollHeight, titleClient: panel.clientHeight,
        buttonVisible: getComputedStyle(button).display !== 'none', buttonHeight: button.getBoundingClientRect().height,
        pageOverflow: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight };
    })()`);
    assert.equal(metrics.buttonVisible, true);
    assert.ok(metrics.buttonHeight >= 44);
    assert.equal(metrics.titleFits, true, `title scrolls ${width}: ${JSON.stringify(metrics)}`);
    assert.equal(metrics.pageOverflow, false);
    assert.ok(metrics.reservation >= 52 && (!metrics.walletHeight || metrics.reservation >= metrics.walletHeight - 1),
      `wallet not reserved ${JSON.stringify(metrics)}`);
    await screenshot(width, height, 'title');
    // Unsupported orientation lock must give an actionable localized hint.
    await evaluate("Object.defineProperty(screen.orientation, 'lock', { value: undefined, configurable: true }); document.querySelector('[data-act=landscape]').click()");
    await until("!!document.querySelector('.landscape-hint')", 'unsupported-lock hint');
    assert.equal(await evaluate("document.querySelector('.landscape-hint').textContent"),
      await evaluate("SPUD.i18n.t('rotateHint')"));
    for (let i = 0; i < 3; i++) {
      await evaluate("document.querySelector('#lang').click()");
      assert.equal(await evaluate("document.querySelector('[data-act=landscape]').textContent"),
        await evaluate("SPUD.i18n.t('landscape')"));
      assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false);
      assert.equal(await evaluate("document.querySelector('.panel').scrollHeight <= document.querySelector('.panel').clientHeight + 1"),
        true, 'localized title does not fit');
    }
    await evaluate("document.querySelector('[data-act=solo]').click()");
    assert.equal(await evaluate("document.querySelectorAll('.character-card').length"), 15);
    assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false);
    await evaluate("document.querySelector('[data-act=basic]').click()");
    await until("SPUD.main.mode === 'wave' && document.querySelector('#overlay').style.display === 'none'", 'wave');
    await pause(150);
    const wave = await evaluate(`(() => {
      const canvas = document.querySelector('#canvas').getBoundingClientRect();
      const hud = document.querySelector('#hud').getBoundingClientRect();
      const pad = document.querySelector('#pad').getBoundingClientRect();
      const controls = ['#statsBtn', '#lang', '#music', '#sound', '#shake'].map(s => document.querySelector(s).getBoundingClientRect());
      return { canvasHeight: canvas.height, canvasRatio: canvas.height / innerHeight,
        canvasPixels: document.querySelector('#canvas').height, hudBottom: hud.bottom, canvasCenter: canvas.top + canvas.height / 2,
        pad: { left: pad.left, top: pad.top, right: pad.right, bottom: pad.bottom },
        minControl: Math.min(...controls.map(r => Math.min(r.width, r.height))),
        controlsSeparated: controls.every((r, i) => controls.every((other, j) => i === j ||
          r.right <= other.left || other.right <= r.left || r.bottom <= other.top || other.bottom <= r.top)),
        pageOverflow: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight };
    })()`);
    assert.ok(wave.canvasRatio >= .7, `canvas too short ${JSON.stringify(wave)}`);
    assert.ok(wave.canvasPixels >= wave.canvasHeight - 1, 'canvas bitmap not resized');
    assert.ok(wave.hudBottom < wave.canvasCenter, 'HUD obstructs canvas center');
    assert.ok(wave.pad.left >= 0 && wave.pad.top >= 0 && wave.pad.right <= width && wave.pad.bottom <= height,
      `pad offscreen ${JSON.stringify(wave.pad)}`);
    assert.ok(wave.minControl >= 44, `touch target ${wave.minControl}`);
    assert.equal(wave.controlsSeparated, true, 'HUD controls overlap');
    assert.equal(wave.pageOverflow, false);
    await screenshot(width, height, 'wave');
    for (const type of ['orientationchange', 'fullscreenchange']) {
      await evaluate(`document.querySelector('#canvas').height = 1; ${type === 'orientationchange' ? 'window' : 'document'}.dispatchEvent(new Event('${type}'))`);
      await until("document.querySelector('#canvas').height > 1", `${type} canvas remeasure`);
    }
    await evaluate('SPUD.main.session.world.tm = 0');
    await until("SPUD.main.mode === 'shop'", 'shop transition');
    for (let i = 0; i < 12 && !(await evaluate("!!document.querySelector('.shop-grid')")); i++) {
      const act = await evaluate("document.querySelector('[data-act=take]') ? 'take' : document.querySelector('[data-act=recycle]') ? 'recycle' : document.querySelector('.upgrade-card')?.dataset.act || ''");
      assert.ok(act, 'could not advance crate/level-up');
      await evaluate(`document.querySelector('[data-act="${act}"]').click()`);
      await pause(80);
    }
    await until("!!document.querySelector('.shop-grid')", 'shop offers');
    const shop = await evaluate(`(() => {
      const panel = document.querySelector('.panel').getBoundingClientRect();
      const cards = [...document.querySelectorAll('.shop-card')].map(c => c.getBoundingClientRect());
      return { cards: cards.length, columns: getComputedStyle(document.querySelector('.shop-grid')).gridTemplateColumns.split(' ').length,
        cardsVisible: cards.every(c => c.left >= panel.left && c.right <= panel.right && c.top >= panel.top && c.bottom <= panel.bottom),
        slots: document.querySelectorAll('.slot').length,
        panelScroll: document.querySelector('.panel').scrollHeight, panelClient: document.querySelector('.panel').clientHeight,
        pageOverflow: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight };
    })()`);
    assert.equal(shop.cards, 4);
    assert.equal(shop.columns, 4);
    assert.equal(shop.cardsVisible, true, `shop offers not visible ${JSON.stringify(shop)}`);
    assert.equal(shop.slots, 6);
    assert.equal(shop.pageOverflow, false);
    await screenshot(width, height, 'shop');
    await evaluate("document.querySelector('[data-act=stats]').click()");
    const stats = await evaluate(`(() => {
      const sheet = document.querySelector('#sheet .stats-sheet'), rect = sheet?.getBoundingClientRect();
      return { open: !document.querySelector('#sheet').hidden, rows: sheet?.querySelectorAll('.stat-row').length,
        inView: rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight,
        bodyScroll: sheet.querySelector('.sheet-body').scrollHeight, bodyClient: sheet.querySelector('.sheet-body').clientHeight,
        pageOverflow: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight };
    })()`);
    assert.equal(stats.open, true);
    assert.equal(stats.rows, 20);
    assert.equal(stats.inView, true);
    assert.equal(stats.pageOverflow, false);
    await screenshot(width, height, 'stats');
    await evaluate("document.querySelector('#sheet .sheet-close').click(); SPUD.ui.collection(() => {})");
    assert.ok(await evaluate("document.querySelectorAll('.col-card').length > 0"), 'collection is empty');
    assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false, 'collection overflows page');
    await evaluate("SPUD.main.session.world.players.solo.levelUps = 1; SPUD.ui.upgrades(SPUD.main.session.world.players.solo, () => {})");
    assert.equal(await evaluate("document.querySelectorAll('.upgrade-card').length"), 4);
    assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false, 'upgrades overflow page');
    await evaluate("SPUD.ui.result({ win: false, wave: 1, kills: {} }, () => {})");
    assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false, 'result overflows page');
    results.push({ viewport: `${width}x${height}`, ...metrics, wave, shop, stats });
  }
  assert.equal(errors.length, 0, JSON.stringify(errors.slice(0, 3)));
  console.log(JSON.stringify({ ok: true, results, screenshots, consoleErrors: errors.length }));
} finally {
  ws?.close();
  chrome.kill('SIGTERM');
}
