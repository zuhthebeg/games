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
    await cmd('Page.navigate', { url: 'about:blank' });
    await new Promise(resolve => setTimeout(resolve, 300));
    await cmd('Storage.clearDataForOrigin', { origin: 'http://127.0.0.1:8765', storageTypes: 'local_storage' });
    await cmd('Page.navigate', { url: 'http://127.0.0.1:8765/spudsquad/' });
    await new Promise(resolve => setTimeout(resolve, 1000));
    const title = await evaluate(`({
      art: document.querySelector('.key-art')?.naturalWidth || 0,
      hudHidden: getComputedStyle(document.querySelector('#hud')).display === 'none',
      screenOverflow: document.documentElement.scrollWidth > innerWidth,
      buttons: [...document.querySelectorAll('.title-actions .btn')].map(b => b.clientHeight)
    })`);
    for (let i = 0; i < 20 && !title.art; i++) {
      await new Promise(resolve => setTimeout(resolve, 250));
      title.art = await evaluate("document.querySelector('.key-art')?.naturalWidth || 0");
    }
    assert.ok(title.art > 0, `${width}px key art did not load`);
    assert.equal(title.hudHidden, true, `${width}px title HUD visible`);
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
    assert.equal(choose.cardCount, await evaluate('Object.keys(SPUD.data.chars).length'));
    assert.ok(choose.artWidth >= 52);
    assert.equal(choose.rawStat, false);
    assert.equal(choose.fits, width >= 600, `${width}px character selection scrolling ${choose.scroll}/${choose.client}`);
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
    await evaluate("SPUD.main.session.world.players.solo.cool[0] = 999; SPUD.main.session.world.enemies.length = 0");
    await evaluate(`(() => {
      const original = SPUD.render.Renderer.prototype.sprite;
      window.__orbitDraws = 0;
      SPUD.render.Renderer.prototype.sprite = function (id, ...args) {
        if (id === 'weapon_pistol') {
          window.__orbitDraws++;
          const matrix = this.c.getTransform();
          window.__weaponSpriteWorld = {
            x: matrix.e / (this.dpr * this.zoom) + this.cam.x,
            y: matrix.f / (this.dpr * this.zoom) + this.cam.y,
            angle: Math.atan2(matrix.b, matrix.a)
          };
        }
        return original.call(this, id, ...args);
      };
    })()`);
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.ok(await evaluate('window.__orbitDraws > 0'), 'weapon orbit not drawn');
    const spriteMatchesPose = await evaluate(`(() => {
      const p = SPUD.main.session.world.players.solo;
      const pose = SPUD.sim.weaponPose(p, 'pistol', 0, 0);
      return { distance: Math.hypot(window.__weaponSpriteWorld.x - pose.x,
        window.__weaponSpriteWorld.y - pose.y),
        angle: window.__weaponSpriteWorld.angle, expectedAngle: SPUD.data.weapons.pistol.artAngle };
    })()`);
    assert.ok(spriteMatchesPose.distance < 1 &&
      Math.abs(Math.abs(spriteMatchesPose.angle) - Math.PI) < .01,
      `sprite orbit differs from sim.weaponPose: ${JSON.stringify(spriteMatchesPose)}`);
    assert.ok(await evaluate(`document.querySelector('#field').getBoundingClientRect().top >=
      document.querySelector('#hud').getBoundingClientRect().bottom`), 'canvas overlaps HUD');
    // HUD 📊 버튼: 44px 이상, 솔로에선 열려 있는 동안 시뮬 정지 → 닫으면 재개
    const hudBtn = await evaluate("(() => { const b = document.querySelector('#statsBtn').getBoundingClientRect(); return Math.min(b.width, b.height); })()");
    assert.ok(hudBtn >= 44, `${width}px HUD stats button ${hudBtn}px`);
    await evaluate("document.querySelector('#statsBtn').click()");
    const pausedTick = await evaluate('SPUD.main.session.world.tick');
    await new Promise(resolve => setTimeout(resolve, 300));
    assert.equal(await evaluate('SPUD.main.session.world.tick'), pausedTick, 'solo sim ran while stats sheet open');
    await evaluate("document.querySelector('#sheet .sheet-close').click()");
    await new Promise(resolve => setTimeout(resolve, 200));
    assert.ok(await evaluate('SPUD.main.session.world.tick') > pausedTick, 'sim did not resume after closing sheet');
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
      itemDefs: Object.keys(SPUD.data.items).length,
      fits: document.querySelector('.panel').scrollHeight <= document.querySelector('.panel').clientHeight,
      screenOverflow: document.documentElement.scrollWidth > innerWidth,
      icon: document.querySelector('.shop-art')?.naturalWidth || 0
    })`);
    assert.equal(shop.cards, 4);
    assert.equal(shop.slots, 6);
    assert.equal(shop.items, shop.itemDefs);
    assert.ok(shop.icon > 0);
    assert.equal(shop.fits, true, `${width}px shop overflow`);
    assert.equal(shop.screenOverflow, false);
    await evaluate("document.querySelector('[data-act=stats]').click()");
    const stats = await evaluate(`(() => {
      const sheet = document.querySelector('#sheet .stats-sheet');
      const box = sheet?.getBoundingClientRect();
      const rows = [...document.querySelectorAll('#sheet .stat-row')];
      // 텍스트를 직접 가진 요소들의 최소 글자 크기
      const fonts = [...sheet.querySelectorAll('*')].filter(el => [...el.childNodes]
        .some(n => n.nodeType === 3 && n.textContent.trim()) && el.offsetParent !== null)
        .map(el => parseFloat(getComputedStyle(el).fontSize));
      return {
        open: !document.querySelector('#sheet').hidden,
        count: rows.length,
        unique: new Set(rows.map(r => r.dataset.stat)).size,
        keys: Object.keys(SPUD.data.stats).every(k => rows.some(r => r.dataset.stat === k)),
        hp: document.querySelector('#sheet .stat-row[data-stat=maxHp] .v').innerText.includes('/'),
        weapons: document.querySelectorAll('#sheet .weapon-row').length,
        itemTiles: document.querySelectorAll('#sheet .stats-sheet .item-tile').length,
        inView: box.top >= 0 && box.left >= 0 && box.bottom <= innerHeight + 1 && box.right <= innerWidth + 1,
        screenOverflow: document.documentElement.scrollWidth > innerWidth ||
          document.documentElement.scrollHeight > innerHeight,
        minFont: Math.min(...fonts)
      };
    })()`);
    assert.equal(stats.open, true, 'stats sheet did not open');
    assert.equal(stats.count, 20);
    assert.equal(stats.unique, 20);
    assert.equal(stats.keys, true);
    assert.equal(stats.hp, true);
    assert.ok(stats.weapons >= 1);
    assert.equal(stats.itemTiles, shop.itemDefs);
    assert.equal(stats.inView, true, `${width}px stats sheet outside viewport`);
    assert.equal(stats.screenOverflow, false, `${width}px stats sheet page overflow`);
    assert.ok(stats.minFont >= (width < 600 ? 12 : 14), `${width}px stats font ${stats.minFont}px too small`);
    await evaluate("document.querySelector('#sheet .item-tile').click()");
    assert.ok(await evaluate("document.querySelector('#sheet .item-detail b') !== null"), 'item effect not shown');
    await evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))");
    assert.equal(await evaluate("document.querySelector('#sheet').hidden"), true, 'ESC did not close sheet');
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
