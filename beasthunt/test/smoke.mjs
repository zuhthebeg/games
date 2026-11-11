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
  if (shot) await page.screenshot({ path: `${shot}/hub-${vp.width}.png` });
  for (const w of ['gs', 'db', 'bow']) {
    await page.evaluate((w) => { localStorage.removeItem('beasthunt_save_v1'); const s = window.__bh.save; s.weapon = w; s.z = 0; s.mats = {}; s.clears = {}; window.__bh.start('q1'); }, w);
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
      // force break + kill to verify reward flow
      if (!h.over) { h.hitMonster('head', 9999 * 0 + h.def.brk.head + 5, h.m.x, h.m.z, 1); out.headBroke = h.m.broke.head; h.hitMonster('tail', h.def.brk.tail + 5, h.m.x, h.m.z, 1); out.tailBroke = h.m.broke.tail; h.hitMonster('body', 99999, h.m.x, h.m.z, 2); }
      for (let i = 0; i < 600 && !h.ended; i++) B.step(1 / 30);
      out.ended = !!h.ended; out.win = h.win; out.z = B.save.z; out.mats = Object.assign({}, B.save.mats); out.cleared = !!B.save.clears.q1;
      out.resultShown = !document.getElementById('result').hidden;
      return out;
    }, w);
    console.log(JSON.stringify(r));
    ok(r.reached && r.roared, `${vp.width} ${w}: reached monster, monster woke`);
    ok(r.dealt > 100, `${vp.width} ${w}: dealt damage by input (${Math.round(r.dealt)})`);
    ok(r.tookHit, `${vp.width} ${w}: monster attacks landed on a passive bot`);
    if (r.win !== false) { ok(r.ended && r.win && r.resultShown, `${vp.width} ${w}: kill -> result shown`); ok(r.z === 400 && r.cleared, `${vp.width} ${w}: reward 400z + clear saved`); ok((r.mats.b_horn || 0) >= 1 && (r.mats.b_tail || 0) >= 1, `${vp.width} ${w}: break rewards (horn+tail)`); }
    else ok(r.ended && r.resultShown, `${vp.width} ${w}: bot fainted out -> fail result shown`);
    if (shot && w === 'gs') await page.screenshot({ path: `${shot}/result-${vp.width}.png`, timeout: 15000 }).catch((e) => console.log('shot skipped', e.message.split('\n')[0]));
    await page.click('#resBack');
    ok(await page.evaluate(() => !document.getElementById('hub').hidden && !window.__bh.hunt), `${vp.width} ${w}: back to hub`);
  }
  // forge: grant mats and upgrade
  const f = await page.evaluate(() => { const s = window.__bh.save; s.z = 5000; s.mats = { b_hide: 9, b_fang: 9, b_horn: 3 }; document.getElementById('tabForge').click(); const b = document.querySelector('[data-up=gs]'); const en = !b.disabled; b.click(); return { en, tier: s.w.gs, z: s.z, unlocked: document.querySelectorAll('#quests .q:not(.lock)').length }; });
  ok(f.en && f.tier === 2 && f.z === 4700, `${vp.width} forge upgrade gs -> T2 (z ${f.z})`);
  ok(f.unlocked === 2, `${vp.width} q2 unlocked after q1 clear`);
  // mid-fight screenshot of q3
  if (shot) {
    await page.evaluate(() => { const B = window.__bh; B.save.clears.q2 = { n: 1, best: 99 }; B.start('q3'); B.input.keys.KeyW = true; for (let i = 0; i < 260; i++) B.step(1 / 60); B.input.keys.KeyW = false; for (let i = 0; i < 90; i++) B.step(1 / 60); });
    await page.waitForTimeout(400); await page.screenshot({ path: `${shot}/hunt-${vp.width}.png`, timeout: 20000 }).catch((e) => console.log('shot skipped', e.message.split('\n')[0]));
    await page.evaluate(() => window.__bh.end());
  }
  await ctx.close();
}
ok(errors.length === 0, 'no page/console errors' + (errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''));
await browser.close();
console.log(fail ? `FAILED ${fail}` : 'ALL PASS'); process.exit(fail ? 1 : 0);
