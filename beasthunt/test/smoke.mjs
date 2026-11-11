// Headless smoke test: node beasthunt/test/smoke.mjs <baseUrl>
import { createRequire } from 'node:module';
const require = createRequire('/home/cocy/.openclaw/workspace/');
const { chromium } = require('playwright');
const base = process.argv[2] || 'http://127.0.0.1:8791/beasthunt/';
const shot = process.argv[3];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
for (const vp of [{ width: 1280, height: 720 }, { width: 390, height: 780, touch: true }]) {
  const ctx = await browser.newContext({ viewport: vp, hasTouch: !!vp.touch, isMobile: !!vp.touch });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(vp.width + ' pageerror ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_|Failed to load resource|relay|net::/i.test(m.text())) errors.push(vp.width + ' console ' + m.text()); });
  await page.goto(base + '?lowfx=1', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__bh && document.querySelectorAll('#quests .q').length === 6, null, { timeout: 20000 });
  ok(await page.evaluate(() => document.querySelectorAll('#quests .q:not(.lock)').length) === 1, vp.width + ' fresh save: only q1 unlocked');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => typeof SharedWallet !== 'undefined' && SharedWallet._initialized && document.getElementById('sw-bar'), null, { timeout: 20000 });
  ok(await page.evaluate(() => typeof SharedWallet !== 'undefined' && SharedWallet._initialized && document.getElementById('stage').getBoundingClientRect().top >= document.getElementById('sw-bar').getBoundingClientRect().bottom), vp.width + ' wallet initialized and fixed header reserved');
  const hubBox = await page.evaluate(() => {
    const box = id => document.getElementById(id).getBoundingClientRect();
    const l = box('loadout'), d = box('depart'), q = box('panelQuest');
    return l.top >= q.bottom && l.bottom <= d.top && d.bottom <= innerHeight && l.left >= 0 && l.right <= innerWidth && document.getElementById('loadout').parentElement.id === 'body';
  });
  ok(hubBox, vp.width + ' first-screen fixed loadout and depart bounding boxes');
  if (shot) await page.screenshot({ path: `${shot}/hub-${vp.width}.png` });
  for (const lang of ['ko', 'en', 'zh-TW']) {
    while (await page.evaluate(() => document.documentElement.lang) !== (lang === 'zh-TW' ? 'zh-Hant' : lang)) await page.click('#langBtn');
    const hudBox = await page.evaluate(() => {
      const B = window.__bh; B.save.clears.q1 = B.save.clears.q2 = B.save.clears.q3 = { n: 1, best: 99 }; B.start('q4');
      document.getElementById('rage').hidden = false;
      const a = document.querySelector('.pl').getBoundingClientRect(), b = document.querySelector('.mn').getBoundingClientRect();
      return { pass: a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top, player: a.toJSON(), monster: b.toJSON() };
    });
    ok(hudBox.pass, vp.width + ' ' + lang + ' dusk/rage HUD no overlap ' + JSON.stringify(hudBox));
    if (shot) await page.screenshot({ path: `${shot}/hud-${lang}-${vp.width}.png` });
    await page.evaluate(() => { window.__bh.end(); window.__bh.save.clears = {}; });
  }
  for (const w of ['gs', 'db', 'bow']) {
    await page.evaluate((w) => { localStorage.removeItem('beasthunt_save_v1'); const s = window.__bh.save; s.weapon = w; s.shards = 0; s.mats = {}; s.clears = {}; window.__bh.start('q1'); }, w);
    const r = await page.evaluate(async (w) => {
      const B = window.__bh, h = B.hunt, out = { w };
      // walk to monster with lock-on, wait out the roar
      const press = (a) => B.input.press(a), rel = (a) => B.input.release(a);
      B.input.keys.KeyW = true; let guard = 0;
      while (Math.hypot(h.m.x - h.p.x, h.m.z - h.p.z) > (w === 'bow' ? 16 : 5.5) && guard++ < 900) B.step(1 / 60);
      B.input.keys.KeyW = false; out.reached = guard < 900; out.roared = h.m.state !== 'idle';
      const hp0 = h.m.hp; let php = h.p.hp, tookHit = false, rolled = false;
      for (let i = 0; i < 60 * 40 && h.m.hp > 0 && !h.over; i++) {
        if (i % 20 === 0) { press('attack'); rel('attack'); }
        if (i % 300 === 150) { press('heavy'); } if (i % 300 === 250) rel('heavy');
        if (i % 420 === 400) { press('roll'); rolled = true; }
        const d = Math.hypot(h.m.x - h.p.x, h.m.z - h.p.z); B.input.keys.KeyW = w === 'bow' ? d > 18 : d > 4.5;
        B.step(1 / 60); if (h.p.hp < php) tookHit = true; php = h.p.hp;
        if (h.p.hp < 40 && h.p.potions > 0) press('potion');
      }
      B.input.keys.KeyW = false;
      out.dealt = hp0 - h.m.hp; out.php = Math.round(h.p.hp); out.pot = h.p.potions; out.tookHit = tookHit; out.carts = h.carts; out.pstate = h.p.state; out.mstate = h.m.state; out.t = h.time;
      // Input combat verifies damage/AI only; reward breaks are independent below.
      if (!h.over) h.hitMonster('body', 99999, h.m.x, h.m.z, 2);
      for (let i = 0; i < 600 && !h.ended; i++) B.step(1 / 30);
      out.ended = !!h.ended; out.win = h.win; out.shards = B.save.shards; out.mats = Object.assign({}, B.save.mats); out.cleared = !!B.save.clears.q1;
      out.resultShown = !document.getElementById('result').hidden;
      return out;
    }, w);
    console.log(JSON.stringify(r));
    ok(r.reached && r.roared, `${vp.width} ${w}: reached monster, monster woke`);
    ok(r.dealt > 100, `${vp.width} ${w}: dealt damage by input (${Math.round(r.dealt)})`);
    ok(r.tookHit, `${vp.width} ${w}: monster attacks landed on a passive bot`);
    if (r.win !== false) { ok(r.ended && r.win && r.resultShown, `${vp.width} ${w}: kill -> result shown`); ok(r.shards === 400 && r.cleared, `${vp.width} ${w}: reward 400 Luma + clear saved`); }
    else ok(r.ended && r.resultShown, `${vp.width} ${w}: bot fainted out -> fail result shown`);
    if (shot && w === 'gs') await page.screenshot({ path: `${shot}/result-${vp.width}.png`, timeout: 15000 }).catch((e) => console.log('shot skipped', e.message.split('\n')[0]));
    await page.click('#resBack');
    ok(await page.evaluate(() => !document.getElementById('hub').hidden && !window.__bh.hunt), `${vp.width} ${w}: back to hub`);
  }
  // Isolated reward case: no AI time before both breaks, ample remaining HP.
  const breaks = await page.evaluate(() => {
    const B = window.__bh; B.save.shards = 0; B.save.mats = {}; B.start('q1'); const h = B.hunt;
    h.m.hp = h.m.maxHp = 10000;
    for (const part of ['head', 'tail']) h.hitMonster(part, 1000, h.m.x, h.m.z, 1);
    const alive = h.m.hp > 0 && !h.over;
    const horns = h.G.horns.every(h => h.scale.y === .24 && h.material === B.hunt.G.brokenHornMat);
    h.hitMonster('body', 99999, h.m.x, h.m.z, 2);
    for (let i = 0; i < 600 && !h.ended; i++) B.step(1 / 30);
    return { alive, horns, head: h.m.broke.head, tail: h.m.broke.tail, mats: B.save.mats, reward: B.save.shards };
  });
  ok(breaks.alive && breaks.head && breaks.tail && breaks.horns && breaks.mats.b_horn >= 1 && breaks.mats.b_tail >= 1 && breaks.reward === 400, vp.width + ' independent two-part break rewards and bilateral horn damage');
  await page.click('#resBack');
  for (const part of ['head', 'tail', 'legs']) {
    const lethal = await page.evaluate((part) => {
      const B = window.__bh; B.save.mats = {}; B.start('q1'); const h = B.hunt; h.m.hp = 1;
      h.hitMonster(part, 1000, h.m.x, h.m.z, 1);
      const dead = h.m.state === 'dead' && h.over && (part === 'legs' || h.m.broke[part]);
      for (let i = 0; i < 600 && !h.ended; i++) B.step(1 / 30);
      return dead && h.win && (part === 'legs' || B.save.mats[part === 'head' ? 'b_horn' : 'b_tail'] >= 1);
    }, part);
    ok(lethal, vp.width + ' lethal ' + part + ' processes death and break reward');
    await page.click('#resBack');
  }
  const clearedUI = await page.evaluate(() => {
    const B = window.__bh; B.start('q1');
    const walletClean = !Array.from(document.body.children).some(e => /💰.*→/.test(e.textContent) && e.style.position === 'fixed');
    document.getElementById('toast').className = 'show good'; document.getElementById('toast').textContent = 'old'; document.getElementById('dmg').innerHTML = '<span>old</span>';
    B.end(); const clean = !document.getElementById('toast').textContent && !document.getElementById('dmg').childElementCount;
    document.getElementById('toast').textContent = 'old'; B.start('q1');
    const startClean = !document.getElementById('toast').textContent; B.end(); return clean && startClean && walletClean;
  });
  ok(clearedUI, vp.width + ' return/start clears transient combat UI');
  // forge: grant mats and upgrade
  const f = await page.evaluate(() => { const s = window.__bh.save; s.shards = 5000; s.mats = { b_hide: 9, b_fang: 9, b_horn: 3 }; document.getElementById('tabForge').click(); const b = document.querySelector('[data-up=gs]'); const en = !b.disabled; b.click(); return { en, tier: s.w.gs, shards: s.shards, unlocked: document.querySelectorAll('#quests .q:not(.lock)').length }; });
  ok(f.en && f.tier === 2 && f.shards === 4700, `${vp.width} forge upgrade gs -> T2 (Luma ${f.shards})`);
  ok(f.unlocked === 2, `${vp.width} q2 unlocked after q1 clear`);
  // mid-fight screenshot of q3
  if (shot) {
    await page.evaluate(() => { const B = window.__bh; B.save.clears.q2 = { n: 1, best: 99 }; B.start('q3'); B.input.keys.KeyW = true; for (let i = 0; i < 260; i++) B.step(1 / 60); B.input.keys.KeyW = false; for (let i = 0; i < 90; i++) B.step(1 / 60); });
    await page.waitForTimeout(400); await page.screenshot({ path: `${shot}/hunt-${vp.width}.png`, timeout: 20000 }).catch((e) => console.log('shot skipped', e.message.split('\n')[0]));
    await page.evaluate(() => window.__bh.end());
  }
  await page.evaluate(() => localStorage.setItem('beasthunt_save_v1', JSON.stringify({v:1,z:1234,mats:{b_gem:2},w:{gs:3,db:2,bow:1},armor:2,weapon:'db',clears:{q1:{n:4,best:25}}})));
  await page.reload({waitUntil:'load'}); await page.waitForFunction(() => window.__bh);
  ok(await page.evaluate(() => {const s=window.__bh.save;return s.shards===1234 && !('z' in s) && s.mats.b_gem===2 && s.w.gs===3 && s.weapon==='db' && s.armor===2 && s.clears.q1.n===4 && JSON.parse(localStorage.getItem('beasthunt_save_v1')).shards===1234;}), vp.width + ' lossless legacy save migration');
  await ctx.close();
}
ok(errors.length === 0, 'no page/console errors' + (errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''));
await browser.close();
console.log(fail ? `FAILED ${fail}` : 'ALL PASS'); process.exit(fail ? 1 : 0);
