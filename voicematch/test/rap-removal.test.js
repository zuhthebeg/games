// VM-RAPX: the optional Korean "Today's 4 Bars" (VM-RAP1) card, dialog and lazy
// wiring were withdrawn because the shipped flow gives no automatic feedback after
// recording and depends on manual lyric entry, so it carried no independent value on
// the VoiceMatch entry screen. These tests pin the removal and pin that every
// retained VoiceMatch feature is untouched.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';

const LOCALES = ['en', 'es', 'id', 'ja', 'ko', 'pt', 'tw'];
const pages = [['root', new URL('../index.html', import.meta.url)]]
  .concat(LOCALES.map(l => [l, new URL(`../${l}/index.html`, import.meta.url)]));
const read = u => readFileSync(u, 'utf8');

for (const [name, url] of pages) {
  test(`${name}: no rap challenge markup, style or wiring remains`, () => {
    const html = read(url);
    assert.doesNotMatch(html, /vm-rap/);
    assert.doesNotMatch(html, /rap-challenge/);
    assert.doesNotMatch(html, /rapChallenge/);
    assert.doesNotMatch(html, /오늘의 4마디/);
    assert.doesNotMatch(html, /오늘의 챌린지/);
  });

  test(`${name}: retained entry, recording, duet, group and invite paths intact`, () => {
    const html = read(url);
    for (const id of ['btn-start', 'intro-social', 'btn-social-duet', 'btn-social-group',
                      's-intro', 's-rec', 's-ana', 's-result', 's-err', 'entry-ranking']) {
      assert.match(html, new RegExp(`id="${id}"`), `${id} present`);
    }
    // Start button still precedes the social card, which still precedes ranking.
    assert.ok(html.indexOf('id="btn-start"') < html.indexOf('id="intro-social"'));
    assert.ok(html.indexOf('id="intro-social"') < html.indexOf('id="entry-ranking"'));
    // Locale bundle and analyzer worker still wired; ad container untouched.
    assert.match(html, /i18n\.js/);
    assert.match(html, /GTM-MV8KQGJF/);
  });
}

test('the rap challenge module and its suites are gone', () => {
  for (const rel of ['../rap-challenge.js', 'rap-challenge.test.js', 'rap-challenge.browser.mjs']) {
    assert.equal(existsSync(new URL(rel, import.meta.url)), false, `${rel} deleted`);
  }
});

test('no page lazily imports a withdrawn module', () => {
  for (const [name, url] of pages) {
    const html = read(url);
    for (const m of html.matchAll(/import\(['"]([^'"]+)['"]\)/g)) {
      const spec = m[1].split('?')[0];
      if (!spec.startsWith('/voicematch/')) continue;
      assert.equal(existsSync(new URL('../' + spec.slice('/voicematch/'.length), import.meta.url)),
        true, `${name} imports existing ${spec}`);
    }
  }
});

test('in-app copy fixture no longer needs a rap lyrics exemption', () => {
  const fixture = read(new URL('inapp-copy.browser.mjs', import.meta.url));
  assert.doesNotMatch(fixture, /vm-rap-lyrics/);
  assert.match(fixture, /querySelectorAll\('textarea'\)/);
});
