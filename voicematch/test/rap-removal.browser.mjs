// VM-RAPX: offline 390px Chromium on the actual pages. Proves the withdrawn
// "Today's 4 Bars" entry is absent and never fetched, and that the retained
// VoiceMatch entry, recording permission, duet, group and invite paths still work.
// Optional argv[2] is a directory containing downloaded voicematch/{locale/}index.html
// for release replay.
import {readFile} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const vmDir = fileURLToPath(new URL('../', import.meta.url));
const htmlDir = process.argv[2] ? join(resolve(process.argv[2]), 'voicematch') : vmDir;
const origin = 'https://fixture.invalid';
const i18n = await readFile(join(vmDir, 'i18n.js'));
const browser = await chromium.launch({headless: true, executablePath: process.env.CHROMIUM_PATH || undefined, args: [
  '--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=<-loopback>',
  '--disable-quic', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
]});
const rows = [];
let checks = 0, clicks = 0, nonGet = 0, sockets = 0, blocked = 0, fulfilled = 0, rapRequests = 0, pageErrors = 0;
const eq = (actual, expected, label) => {assert.deepEqual(actual, expected, label); checks++;};
try {
  for (const lang of ['', 'ko', 'en', 'ja', 'es', 'pt', 'tw', 'id']) {
    const tag = lang || 'root';
    const relative = lang ? `${lang}/` : '';
    const base = `/voicematch/${relative}`;
    const url = `${origin}${base}?utm_source=fixture&ref=kept#invite=abc123`;
    const html = await readFile(join(htmlDir, relative, 'index.html'));
    const ctx = await browser.newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true,
      serviceWorkers: 'block', userAgent: 'Mozilla/5.0 (Linux; Android 13) Chrome/149'});
    const localAssets = new Map([
      [base, {contentType: 'text/html', body: html}],
      ['/lib/shared-wallet.js', {contentType: 'application/javascript', body: '/* synthetic, no wallet/account */'}],
      ['/voicematch/i18n.js', {contentType: 'application/javascript', body: i18n}],
      ['/voicematch/analyzer.js', {contentType: 'application/javascript', body: 'self.onmessage=()=>{};'}],
      ['/voicematch/singers.json', {json: Array.from({length: 6}, (_, i) => ({slug: `fixture-${i}`, name: `Synthetic ${i}`, gk: true}))}],
      ['/voicematch/ecapa_int8.onnx', {body: Buffer.alloc(8)}],
      ['/voicematch/recent.json', {json: []}],
      ['/voicematch/catalog.json', {json: {artists: []}}],
    ]);
    await ctx.addInitScript(() => {
      window.__vm = {denied: 0, unhandled: 0};
      addEventListener('unhandledrejection', () => {__vm.unhandled++;});
      Object.defineProperty(navigator, 'sendBeacon', {value: () => true});
      Object.defineProperty(navigator, 'mediaDevices', {value: {getUserMedia() {
        __vm.denied++; return Promise.reject(new DOMException('fixture denial', 'NotAllowedError'));
      }}});
    });
    await ctx.routeWebSocket('**/*', async socket => {sockets++; await socket.close();});
    await ctx.route('**/*', async route => {
      const req = route.request(), u = new URL(req.url());
      const get = req.method() === 'GET';
      if (!get) nonGet++;
      if (/rap-challenge/.test(u.pathname)) rapRequests++;
      const reply = get && u.origin === origin && localAssets.get(u.pathname);
      if (reply) {fulfilled++; return route.fulfill(reply);}
      blocked++; return route.abort();
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => {errors.push(e.message); pageErrors++;});
    page.setDefaultTimeout(5000);
    const click = async loc => {await loc.click(); clicks++;};

    await page.goto(url, {timeout: 15000});
    await page.waitForFunction(() => document.getElementById('btn-start')?.textContent?.trim().length > 0);

    // 1. Withdrawn feature leaves nothing in the live DOM, CSS or module graph.
    const rap = await page.evaluate(() => ({
      nodes: document.querySelectorAll('[id^="vm-rap"]').length,
      dialogs: document.querySelectorAll('dialog#vm-rap-dialog').length,
      global: typeof window.rapChallenge,
      styleHits: [...document.querySelectorAll('style')].filter(s => /vm-rap/.test(s.textContent)).length,
      bodyText: /오늘의 4마디|오늘의 챌린지/.test(document.body.innerText),
      lyrics: document.querySelectorAll('#vm-rap-lyrics').length,
    }));
    eq(rap.nodes, 0, `${tag} no vm-rap element`);
    eq(rap.dialogs, 0, `${tag} no rap dialog`);
    eq(rap.global, 'undefined', `${tag} no rapChallenge global`);
    eq(rap.styleHits, 0, `${tag} no rap CSS`);
    eq(rap.bodyText, false, `${tag} no rap copy rendered`);
    eq(rap.lyrics, 0, `${tag} no static lyrics textarea`);
    eq(rapRequests, 0, `${tag} rap module never requested`);

    // 2. Retained entry screen still renders localized and fits 390px.
    const start = page.locator('#btn-start');
    await start.waitFor({state: 'visible'});
    const box = await start.boundingBox();
    eq(!!box && box.x >= 0 && box.x + box.width <= 390.01, true, `${tag} start button fits 390`);
    const intro = await page.evaluate(() => ({
      social: !!document.getElementById('intro-social'),
      duet: !!document.getElementById('btn-social-duet'),
      group: !!document.getElementById('btn-social-group'),
      ranking: !!document.getElementById('entry-ranking'),
      lang: document.documentElement.lang,
      hash: location.hash,
      query: location.search,
    }));
    eq(intro.social && intro.duet && intro.group && intro.ranking, true, `${tag} retained entry controls present`);
    eq(intro.hash, '#invite=abc123', `${tag} web invite hash preserved`);
    eq(intro.query, '?utm_source=fixture&ref=kept', `${tag} query preserved`);
    eq(intro.lang.length > 0, true, `${tag} document lang applied`);

    // 3. Retained duet and group intents still record and guide to start.
    for (const intent of ['duet', 'group']) {
      await click(page.locator(`#btn-social-${intent}`));
      const stored = await page.evaluate(() => {
        try {return sessionStorage.getItem('vm_social_intent');} catch (e) {return 'storage-blocked';}
      });
      eq(stored, intent, `${tag} ${intent} intent stored`);
      const notice = await page.evaluate(() =>
        !document.getElementById('social-notice').classList.contains('hidden'));
      eq(notice, true, `${tag} ${intent} notice shown`);
    }

    // 4. Retained recording permission flow still reaches the mic sheet and denial.
    // #mic-copy is the in-app-browser escape control only; this run uses a plain
    // Chrome UA, so the ordinary sheet controls are the ones asserted here. The
    // in-app path stays covered by inapp-copy.browser.mjs.
    await click(start);
    const sheet = page.locator('#mic-go');
    await sheet.waitFor({state: 'visible'});
    eq(await page.locator('#mic-no').isVisible(), true, `${tag} mic sheet decline control present`);
    eq(await page.locator('#mic-copy').isVisible(), false, `${tag} in-app escape hidden for ordinary browser`);
    await click(sheet);
    await page.waitForFunction(() => __vm.denied >= 1);
    await page.locator('#s-err').waitFor({state: 'visible'});
    const after = await page.evaluate(() => ({
      denied: __vm.denied, unhandled: __vm.unhandled,
      errText: document.getElementById('s-err').innerText.trim().length > 0,
      introHidden: document.getElementById('s-intro').classList.contains('hidden'),
    }));
    eq(after.denied >= 1, true, `${tag} real getUserMedia path exercised`);
    eq(after.unhandled, 0, `${tag} no unhandled rejection`);
    eq(after.errText, true, `${tag} localized denial screen rendered`);
    eq(after.introHidden, true, `${tag} intro replaced by denial screen`);

    // 5. Ads: GTM container retained, nothing sticky over the mic or CTA.
    const ads = await page.evaluate(() => {
      const sticky = [...document.querySelectorAll('body *')].filter(el => {
        const s = getComputedStyle(el);
        return (s.position === 'fixed' || s.position === 'sticky') && s.display !== 'none'
          && s.visibility !== 'hidden' && el.getBoundingClientRect().height > 0;
      }).map(el => el.id || el.tagName.toLowerCase());
      return {gtm: /GTM-MV8KQGJF/.test(document.documentElement.innerHTML), sticky};
    });
    eq(ads.gtm, true, `${tag} GTM container retained`);
    eq(ads.sticky.some(id => /vm-rap/.test(id)), false, `${tag} no rap overlay`);

    eq(errors, [], `${tag} no page errors`);
    rows.push({page: tag, checks, clicks, rapRequests, errors: errors.length});
    await ctx.close();
  }
  eq(nonGet, 0, 'no non-GET request');
  eq(sockets, 0, 'no websocket');
  eq(rapRequests, 0, 'rap module never requested across all pages');
  eq(pageErrors, 0, 'zero page errors across all pages');
  console.log(JSON.stringify({result: 'PASS', pages: rows.length, checks, clicks, fulfilled, blocked,
    nonGet, sockets, rapRequests, pageErrors, rows}, null, 1));
} finally {
  await browser.close();
}
