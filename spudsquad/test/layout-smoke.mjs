import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const port = 19094;
const chrome = spawn('/home/cocy/bin/chromium', [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  `--remote-debugging-port=${port}`, '--user-data-dir=/tmp/spud-layout-smoke', 'about:blank'
], { stdio: 'ignore' });
let ws;
let id = 0;
const pending = new Map();
const events = [];
try {
  let targets;
  for (let i = 0; i < 80; i++) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      if (targets[0]?.webSocketDebuggerUrl) break;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(targets?.[0]?.webSocketDebuggerUrl, 'Chromium CDP unavailable');
  ws = new WebSocket(targets[0].webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  ws.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      pending.get(message.id)?.(message);
      pending.delete(message.id);
    } else events.push(message);
  };
  function cmd(method, params = {}) {
    const next = ++id;
    return new Promise((resolve, reject) => {
      pending.set(next, response => response.error ? reject(response.error) : resolve(response.result));
      ws.send(JSON.stringify({ id: next, method, params }));
    });
  }
  const evaluate = async expression => {
    const result = (await cmd('Runtime.evaluate', {
      expression, returnByValue: true, awaitPromise: true
    })).result;
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.value;
  };
  await cmd('Runtime.enable');
  await cmd('Page.enable');
  const results = [];
  for (const [width, height] of [[1280, 800], [390, 844]]) {
    await cmd('Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: 1, mobile: width < 500
    });
    await cmd('Page.navigate', { url: 'http://127.0.0.1:8765/spudsquad/' });
    await new Promise(resolve => setTimeout(resolve, 1000));
    const title = await evaluate(`({
      art: document.querySelector('.key-art')?.naturalWidth || 0,
      hudHidden: getComputedStyle(document.querySelector('#hud')).display === 'none',
      screenOverflow: document.documentElement.scrollWidth > innerWidth,
      buttons: [...document.querySelectorAll('.title-actions .btn')].map(b => b.clientHeight)
    })`);
    assert.ok(title.art > 0, `${width}px key art did not load`);
    assert.equal(title.hudHidden, true);
    assert.equal(title.screenOverflow, false);
    assert.ok(title.buttons.every(n => n >= 48));
    await evaluate("document.querySelector('[data-act=solo]').click()");
    const choose = await evaluate(`({
      cardCount: document.querySelectorAll('.character-card').length,
      artWidth: document.querySelector('.character-art').clientWidth,
      rawStat: [...document.querySelectorAll('.stat-change')].some(n => /maxHp|melee|ranged/.test(n.innerText)),
      fits: document.querySelector('.panel').scrollHeight <= document.querySelector('.panel').clientHeight,
      scroll: document.querySelector('.panel').scrollHeight,
      client: document.querySelector('.panel').clientHeight,
      hudHidden: getComputedStyle(document.querySelector('#hud')).display === 'none'
    })`);
    assert.equal(choose.cardCount, 10);
    assert.ok(choose.artWidth >= 90);
    assert.equal(choose.rawStat, false);
    assert.equal(choose.fits, width >= 600, `${width}px character selection scrolling`);
    assert.equal(choose.hudHidden, true);
    await evaluate("document.querySelector('#lang').click()");
    const zh = await evaluate(`({
      translatedChar: document.querySelector('.character-grid').innerText.includes('科學馬鈴薯'),
      translatedStat: document.querySelector('.character-grid').innerText.includes('最大生命')
    })`);
    assert.equal(zh.translatedChar, true);
    assert.equal(zh.translatedStat, true);
    await evaluate("document.querySelector('#lang').click(); document.querySelector('#lang').click()");
    await evaluate("document.querySelector('[data-act=basic]').click()");
    await evaluate(`(() => {
      const original = SPUD.render.Renderer.prototype.sprite;
      window.__orbitDraws = 0;
      SPUD.render.Renderer.prototype.sprite = function (id, ...args) {
        if (id === 'weapon_pistol') window.__orbitDraws++;
        return original.call(this, id, ...args);
      };
    })()`);
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.ok(await evaluate('window.__orbitDraws > 0'), 'weapon orbit not drawn');
    assert.ok(await evaluate(`document.querySelector('#field').getBoundingClientRect().top >=
      document.querySelector('#hud').getBoundingClientRect().bottom`), 'canvas overlaps HUD');
    await evaluate(`(() => {
      const p = SPUD.main.session.world.players.solo;
      p.levelUps = 1;
      SPUD.ui.upgrades(p, () => {});
    })()`);
    const upgrade = await evaluate(`({
      cards: document.querySelectorAll('.upgrade-card').length,
      arrow: document.querySelector('.upgrade-card').innerText.includes('→'),
      fits: document.querySelector('.panel').scrollHeight <= document.querySelector('.panel').clientHeight
    })`);
    assert.equal(upgrade.cards, 4);
    assert.equal(upgrade.arrow, true);
    assert.equal(upgrade.fits, true);
    await evaluate(`(() => {
      const p = SPUD.main.session.world.players.solo;
      p.mats = 200;
      p.items = Object.keys(SPUD.data.items);
      SPUD.ui.shop(SPUD.main.session, 'solo', () => {});
    })()`);
    const shop = await evaluate(`({
      cards: document.querySelectorAll('.shop-card').length,
      slots: document.querySelectorAll('.slot').length,
      items: document.querySelectorAll('.owned-item').length,
      fits: document.querySelector('.panel').scrollHeight <= document.querySelector('.panel').clientHeight,
      screenOverflow: document.documentElement.scrollWidth > innerWidth,
      icon: document.querySelector('.shop-art')?.naturalWidth || 0
    })`);
    assert.equal(shop.cards, 4);
    assert.equal(shop.slots, 6);
    assert.equal(shop.items, 32);
    assert.ok(shop.icon > 0);
    assert.equal(shop.fits, true, `${width}px shop overflow`);
    assert.equal(shop.screenOverflow, false);
    await evaluate("document.querySelector('[data-act=stats]').click()");
    const stats = await evaluate(`({
      count: document.querySelectorAll('.stat-panel span').length,
      fits: document.querySelector('.panel').scrollHeight <= document.querySelector('.panel').clientHeight,
      scroll: document.querySelector('.panel').scrollHeight,
      client: document.querySelector('.panel').clientHeight
    })`);
    assert.equal(stats.count, 20);
    assert.equal(stats.fits, true, `${width}px expanded stats overflow`);
    results.push({ width, height, title, choose, shop, stats });
  }
  const errors = events.filter(event =>
    event.method === 'Runtime.exceptionThrown' ||
    event.method === 'Runtime.consoleAPICalled' && event.params.type === 'error'
  );
  assert.equal(errors.length, 0, JSON.stringify(errors.slice(0, 3)));
  console.log(JSON.stringify({ ok: true, results, consoleErrors: errors.length }));
} finally {
  ws?.close();
  chrome.kill('SIGTERM');
}
