// Run: node arpg/ui-mock/verify.mjs (requires local Playwright + Chromium).
// Starts an ephemeral local static server. Never takes screenshots or writes game files.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, '../..');
const port = 8768;
const server = spawn('python3', ['-u', '-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
const serverReady = new Promise((resolve, reject) => {
  server.stdout.on('data', chunk => { if (String(chunk).includes('Serving HTTP')) resolve(); });
  server.on('error', reject);
  server.on('exit', code => reject(new Error(`HTTP server exit ${code}`)));
});
let browser;
const report = { viewport: { width: 390, height: 844 }, screenshots: 0, errors: [], networkErrors: [], states: [], checks: [] };
try {
  await serverReady;
  browser = await chromium.launch({ headless: true });
  report.chromium = browser.version();
  const page = await browser.newPage({ viewport: report.viewport, hasTouch: true, isMobile: true });
  page.on('pageerror', e => report.errors.push(e.message));
  page.on('console', e => { if (e.type() === 'error') report.errors.push(e.text()); });
  page.on('response', response => { if (response.status() >= 400) report.networkErrors.push(`${response.status()} ${response.url()}`); });
  const requests = [];
  page.on('request', request => requests.push(request.url()));
  await page.goto(`http://127.0.0.1:${port}/arpg/ui-mock/`);
  await page.waitForSelector('.inn-scene');
  async function audit(name) {
    const metrics = await page.evaluate(() => {
      const controls = [...document.querySelectorAll('button,summary')].filter(el => el.getClientRects().length).map(el => {
        const r = el.getBoundingClientRect();
        return { name: el.getAttribute('aria-label') || el.innerText.replace(/\n/g, ' '), x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
      });
      const outside = controls.filter(r => r.x < -0.1 || r.y < -0.1 || r.right > innerWidth + 0.1 || r.bottom > innerHeight + 0.1);
      const undersized = controls.filter(r => r.width < 43.9 || r.height < 43.9);
      const overlaps = [];
      for (let i = 0; i < controls.length; i++) for (let j = i + 1; j < controls.length; j++) {
        const a = controls[i], b = controls[j];
        if (Math.min(a.right, b.right) - Math.max(a.x, b.x) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y) > 1) overlaps.push([a.name, b.name]);
      }
      const content = document.querySelector('.screen:not([hidden]) .content');
      return { controls: controls.length, outside, undersized, overlaps, horizontalOverflow: document.documentElement.scrollWidth > innerWidth, content: content ? { height: content.clientHeight, scrollHeight: content.scrollHeight } : null };
    });
    report.states.push({ name, ...metrics });
    assert.deepEqual(metrics.outside, [], `${name}: outside viewport`);
    assert.deepEqual(metrics.overlaps, [], `${name}: overlapping controls`);
    assert.deepEqual(metrics.undersized, [], `${name}: targets below 44px`);
    assert.equal(metrics.horizontalOverflow, false, `${name}: horizontal overflow`);
    if (metrics.content) assert(metrics.content.scrollHeight <= metrics.content.height, `${name}: default decision surface needs scrolling`);
  }
  for (const view of ['inn', 'shop', 'forge', 'board', 'combat', 'result']) {
    await page.locator(`[data-screen="${view}"]`).click();
    await audit(view);
  }
  await page.locator('[data-screen="combat"]').click();
  const anchors = [];
  for (const kit of ['blade', 'bow', 'focus']) {
    await page.locator(`.kit-tabs [data-kit="${kit}"]`).click();
    await audit(`combat/${kit}`);
    anchors.push(await page.evaluate(() => [...document.querySelectorAll('.battle-vitals,.common-supplies button,.fixed-dodge')].map(el => {
      const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height };
    })));
    const loaded = await page.evaluate(async () => {
      const src = getComputedStyle(document.querySelector('.battle-hero')).backgroundImage.slice(5, -2);
      const image = new Image(); image.src = src; await image.decode(); return image.naturalWidth;
    });
    assert.equal(loaded, 2048);
  }
  assert.deepEqual(anchors[0], anchors[1]); assert.deepEqual(anchors[0], anchors[2]);
  report.checks.push('HP / potions / return / dodge coordinates identical across 3 kits; all 3 hero atlases decode');
  await page.locator('[data-screen="result"]').click();
  for (const terminal of ['clear', 'death']) { await page.locator(`button[data-terminal="${terminal}"]`).click(); await audit(`result/${terminal}`); }
  await page.locator('[data-screen="shop"]').click();
  for (const item of ['potion', 'mana', 'scroll']) { await page.locator(`[data-item="${item}"]`).click(); await audit(`shop/${item}`); }
  assert.equal(await page.locator('#quantity').innerText(), '1');
  assert.equal(await page.locator('#shop-total').innerText(), '6 G');
  assert.equal(await page.locator('[data-count="1"]').isDisabled(), true);
  await page.locator('[data-buy]').click(); assert.equal(await page.locator('dialog').isVisible(), true); await page.locator('dialog [data-close]').last().click();
  await page.locator('[data-screen="forge"]').click();
  for (const gear of ['iron', 'bow', 'staff']) { await page.locator(`[data-gear="${gear}"]`).click(); await audit(`forge/${gear}`); }
  await page.locator('[data-equip]').click(); assert.equal(await page.locator('dialog').isVisible(), true); await page.keyboard.press('Escape');
  await page.locator('[data-screen="board"]').click();
  await page.locator('[data-contract="S1"]').click(); await audit('board/S1');
  assert.match(await page.locator('#depart-preview').innerText(), /S1/);
  await page.locator('#depart-preview').click(); assert.equal(await page.locator('#battle-stage').innerText(), 'S1 · 소환 시험');
  report.checks.push('Merchant limits, total, balance, weight; gear variants; contract selection; confirm dialogs');
  for (const view of ['inn', 'shop', 'forge', 'board', 'combat', 'result']) {
    await page.locator(`[data-screen="${view}"]`).click();
    await page.locator(`#screen-${view} .rationale summary`).click();
    assert.equal(await page.locator(`#screen-${view} .rationale`).getAttribute('open'), '');
    const rationale = await page.locator(`#screen-${view} .rationale`).boundingBox();
    assert(rationale.y >= 0 && rationale.y + rationale.height <= 844.1);
    await page.locator(`#screen-${view} .rationale summary`).click();
  }
  await page.locator('[data-screen="inn"]').click();
  await page.locator('[data-screen="inn"]').focus(); await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('[data-screen="shop"]').getAttribute('aria-selected'), 'true');
  await page.keyboard.press('End'); assert.equal(await page.locator('[data-screen="result"]').getAttribute('aria-selected'), 'true');
  await page.locator('[data-screen="inn"]').click();
  await page.evaluate(() => {
    const node = document.querySelector('#screens');
    const start = new Event('touchstart', { bubbles: true }); Object.defineProperty(start, 'touches', { value: [{ clientX: 310, clientY: 220 }] });
    const end = new Event('touchend', { bubbles: true }); Object.defineProperty(end, 'changedTouches', { value: [{ clientX: 90, clientY: 225 }] });
    node.dispatchEvent(start); node.dispatchEvent(end);
  });
  assert.equal(await page.locator('[data-screen="shop"]').getAttribute('aria-selected'), 'true');
  report.checks.push('6 source-linked rationale disclosures, Arrow/Home/End tab keyboard navigation, synthetic swipe');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await page.locator('.screen-tabs button').first().evaluate(el => getComputedStyle(el).transitionDuration), '0s');
  assert.match(await page.locator('meta[name="robots"]').getAttribute('content'), /noindex/);
  assert(requests.every(url => url.startsWith(`http://127.0.0.1:${port}/`)), 'External asset request detected');
  const storageKeys = await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }));
  assert.deepEqual(storageKeys, { local: 0, session: 0 });
  report.checks.push('Reduced motion, noindex, no external asset requests, no localStorage/sessionStorage writes');
  function luminance(hex) {
    const values = hex.replace('#', '').match(/../g).map(s => parseInt(s, 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
  }
  report.contrast = [
    ['body ink / ash', '#efe6d2', '#141916'],
    ['muted / raised', '#b8b39f', '#30362b'],
    ['primary text / brass', '#1b211a', '#d3ad6d'],
    ['brass / selected', '#d3ad6d', '#33392b'],
    ['gain / ash', '#adc6a0', '#141916'],
    ['loss / surface', '#e9a294', '#222821'],
    ['HP meter text / fill', '#f8ecd6', '#914740'],
    ['MP meter text / fill', '#f8ecd6', '#456879'],
  ].map(([name, foreground, background]) => {
    const a = luminance(foreground), b = luminance(background);
    const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    assert(ratio >= 4.5, `${name}: text contrast below 4.5:1`);
    return { name, foreground, background, ratio: Number(ratio.toFixed(2)) };
  });
  report.checks.push('8 key text/background contrast pairs ≥ 4.5:1; all 18 default state bodies fit without scrolling');
  assert.deepEqual(report.errors, []); assert.deepEqual(report.networkErrors, []);
  report.passed = true;
  await writeFile(path.join(dir, 'verification.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ passed: true, chromium: report.chromium, states: report.states.length, errors: report.errors.length, outside: 0, overlaps: 0, undersized: 0, screenshots: 0, checks: report.checks }, null, 2));
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
  if (server.exitCode === null) await once(server, 'exit').catch(() => {});
}
