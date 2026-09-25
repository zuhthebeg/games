const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const sandbox = { module: { exports: {} }, AbortController, setTimeout, clearTimeout };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'laya-hint.js'), 'utf8'), sandbox);
const pilot = sandbox.module.exports;
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const card = (id, rank = 8) => ({ id, rank, suit: 'heart', enh: 'glass', hidden: 'secret' });
const state = () => ({ hand: [card(1), card(2)], jokers: [{ id: 'blueprint', edition: 'foil', counter: 2, chipCounter: 3, secret: 4 }, { id: 'hangingChad' }], handLevels: { PAIR: 2 }, handsLeft: 2, discardsLeft: 1, deck: [card(8), card(9)], bossModifier: null, score: 12, target: 100, roundIndex: 1, ante: 2, token: 'never', selected: new Set() });

test('serializes only allowed fields, preserves visible order and summarizes ranks without deck order', () => {
  const s = state();
  const body = JSON.parse(JSON.stringify(pilot.buildPilotRequest(s, [1, 2])));
  assert.deepEqual(Object.keys(body), ['state', 'choices']);
  assert.deepEqual(body.state.hand, [{ id: 1, rank: 8, suit: 'heart', enh: 'glass' }, { id: 2, rank: 8, suit: 'heart', enh: 'glass' }]);
  assert.deepEqual(body.state.jokers, [{ id: 'blueprint', edition: 'foil', counter: 2, chipCounter: 3 }, { id: 'hangingChad', edition: null, counter: 0, chipCounter: 0 }]);
  assert.deepEqual(body.state.deckRanks, { '8': 2 });
  assert.equal(body.state.deckCount, 2);
  assert.deepEqual(body.state.bestComboIds, [1, 2]);
  assert.equal(body.state.bossModifier, null);
  assert.equal(body.state.handLevels.PAIR, 2);
  assert.equal(body.state.target, 100);
  assert.ok(!JSON.stringify(body).includes('secret'));
  assert.ok(!JSON.stringify(body).includes('never'));
});

test('optional joker desc is bounded plain text without markup or control characters', () => {
  const s = state();
  s.jokers[0].desc = '<b>오른쪽 복사</b>\n' + '효과'.repeat(100);
  const serialized = pilot.buildPilotRequest(s, [1, 2]).state.jokers;
  assert.equal(serialized[0].desc.length, 160);
  assert.ok(serialized[0].desc.startsWith('오른쪽 복사 효과'));
  assert.doesNotMatch(serialized[0].desc, /[<>\r\n]/);
  assert.equal(Object.hasOwn(serialized[1], 'desc'), false);
});

test('legal candidates respect min4, no discard, resources and scoring count', () => {
  const s = state(); s.bossModifier = { id: 'min4cards', label: 'hidden' }; s.jokers.reverse();
  assert.deepEqual(Array.from(pilot.buildPilotRequest(s, [1, 2]).choices), ['DISCARD_ONE', 'SWAP_JOKERS']);
  s.bossModifier = { id: 'no_discard' }; s.handsLeft = 0;
  assert.equal(pilot.buildPilotRequest(s, [1, 2]), null);
  s.handsLeft = 1; s.hand.push(card(3), card(4)); s.bossModifier = { id: 'min4cards' };
  assert.ok(pilot.buildPilotRequest(s, [1, 2, 3, 4]).choices.includes('PLAY_BEST'));
  s.bossModifier = null; s.discardsLeft = 0; s.jokers = [];
  assert.equal(pilot.buildPilotRequest(s, [1]), null);
});

test('max3 boss excludes oversized attack and card-order advice', () => {
  const s = state(); s.bossModifier = { id: 'max3cards' }; s.jokers.reverse();
  s.hand.push(card(3), card(4));
  const request = pilot.buildPilotRequest(s, [1, 2, 3, 4]);
  assert.ok(request);
  assert.deepEqual(Array.from(request.choices), ['DISCARD_ONE', 'SWAP_JOKERS']);
});

test('blueprint needs a meaningful reorderable right neighbor and hangingChad needs two scoring cards', () => {
  const s = state(); s.jokers = [{ id: 'blueprint' }, { id: 'hangingChad' }];
  assert.ok(!pilot.buildPilotRequest(s, [1, 2]).choices.includes('SWAP_JOKERS'));
  s.jokers.reverse();
  assert.ok(pilot.buildPilotRequest(s, [1, 2]).choices.includes('SWAP_JOKERS'));
  assert.ok(!pilot.buildPilotRequest(s, [1]).choices.includes('SWAP_CARDS'));
});

test('fingerprint invalidates turn, ordered hand/jokers, levels and resource changes', () => {
  const s = state(); const original = pilot.pilotFingerprint(s, [1, 2]);
  for (const change of [x => x.roundIndex++, x => x.hand.reverse(), x => x.jokers.reverse(), x => x.handLevels.PAIR++, x => x.handsLeft--, x => x.deck.pop()]) {
    const next = state(); change(next);
    assert.notEqual(pilot.pilotFingerprint(next, [1, 2]), original);
  }
});

test('request only uses JWT, rejects stale/unknown replies and displays text without actions', async () => {
  const s = state(); const output = { textContent: '' }; const button = { disabled: false };
  let resolveFetch; let request;
  const controller = pilot.createPilotController({ output, button, getState: () => s, getComboIds: () => [1, 2], getToken: () => 'test.user.signature', fetcher: (url, options) => { request = { url, options }; return new Promise(resolve => { resolveFetch = resolve; }); } });
  const pending = controller.request();
  assert.equal(request.url, 'https://llm.cocy.io/api/games/jokerrun/hint');
  assert.equal(request.options.headers.Authorization, 'Bearer test.user.signature');
  assert.ok(!request.options.body.includes('test.user.signature'));
  s.hand.reverse();
  resolveFetch({ ok: true, json: async () => ({ choiceId: 'PLAY_BEST', reason: 'late' }) }); await pending;
  assert.ok(!output.textContent.includes('late'));
  s.hand.reverse();
  const pending2 = controller.request();
  resolveFetch({ ok: true, json: async () => ({ choiceId: 'UNKNOWN', reason: '<img onerror=evil()>' }) }); await pending2;
  assert.ok(!output.textContent.includes('<img'));
  assert.equal(button.disabled, false);
});

test('anonymous unsigned guest token is rejected before network request', async () => {
  const output = { textContent: '' }; let requests = 0;
  const controller = pilot.createPilotController({ output, button: { disabled: false }, getState: state, getComboIds: () => [1, 2], getToken: () => 'header.payload.', fetcher: async () => { requests++; } });
  await controller.request();
  assert.equal(requests, 0);
  assert.match(output.textContent, /게스트 계정은 지원하지 않습니다/);
});

test('valid advice shows candidate and bounded reason without invoking game actions', async () => {
  const s = state(); const output = { textContent: '' };
  const controller = pilot.createPilotController({ output, button: { disabled: false }, getState: () => s, getComboIds: () => [1, 2], getToken: () => 'test.user.signature', fetcher: async () => ({ ok: true, json: async () => ({ choiceId: 'PLAY_BEST', reason: '현재 손패로 공격' }) }) });
  await controller.request();
  assert.match(output.textContent, /공격.*현재 손패로 공격/);
  assert.match(output.textContent, /실험 — 틀릴 수 있음/);
  assert.equal(s.handsLeft, 2);
  assert.equal(s.score, 12);
});

test('HTTP failures stay text-only and do not propagate', async () => {
  for (const status of [401, 429, 503]) {
    const output = { textContent: '' };
    const controller = pilot.createPilotController({ output, button: { disabled: false }, getState: state, getComboIds: () => [1, 2], getToken: () => 'test.user.signature', fetcher: async () => ({ ok: false, status }) });
    await controller.request();
    assert.match(output.textContent, /실험 — 틀릴 수 있음/);
  }
});

test('HTML gates independent button and leaves existing hint handler intact', () => {
  assert.match(html, /id="layaPilotBtn"/);
  assert.match(html, /get\("layaHintPilot"\) === "1"/);
  assert.match(html, /laya-hint\.js/);
  assert.match(html, /\$\("#hintBtn"\)\.addEventListener\("click", showBestHint\)/);
});
