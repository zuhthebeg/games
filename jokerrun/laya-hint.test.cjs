const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const sandbox = { module: { exports: {} }, AbortController, setTimeout, clearTimeout };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'laya-hint.js'), 'utf8'), sandbox);
const hint = sandbox.module.exports;
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const card = (id, rank = 8, suit = 'heart') => ({ id, rank, suit, enh: null, hidden: 'secret' });
// 8-card hand: pair of 8s + spread
const hand8 = () => [card(1, 8, 'heart'), card(2, 8, 'spade'), card(3, 2, 'club'), card(4, 5, 'heart'), card(5, 9, 'heart'), card(6, 13, 'diamond'), card(7, 3, 'heart'), card(8, 11, 'spade')];
const state = () => ({ hand: hand8(), jokers: [{ id: 'blueprint', edition: 'foil', counter: 2, chipCounter: 3, secret: 4 }], handLevels: { PAIR: 2 }, handsLeft: 2, discardsLeft: 2, deck: [card(20, 8), card(21, 9)], bossModifier: null, score: 12, target: 100, roundIndex: 1, ante: 2, token: 'never', selected: new Set() });
const okFetch = result => async () => ({ ok: true, json: async () => result });
const ctl = (s, fetcher, extra = {}) => hint.createHintController({ getState: () => s, getComboIds: () => [1, 2], getToken: () => 'a.b.sig', fetcher, ...extra });

test('request carries only visible state and typed A0/Dn candidates', () => {
  const body = JSON.parse(JSON.stringify(hint.buildHintRequest(state(), [1, 2])));
  assert.deepEqual(Object.keys(body), ['state', 'choices']);
  assert.deepEqual(body.state.hand[0], { id: 1, rank: 8, suit: 'heart', enh: null });
  assert.deepEqual(body.state.deckRanks, { '8': 1, '9': 1 });
  assert.ok(!JSON.stringify(body).includes('secret') && !JSON.stringify(body).includes('never'));
  assert.deepEqual(body.choices[0], { id: 'A0', kind: 'PLAY_BEST', cardIds: [1, 2] });
  const disc = body.choices.filter(c => c.kind === 'DISCARD');
  assert.ok(disc.length >= 3 && disc.length <= 15);
  disc.forEach((c, i) => assert.equal(c.id, `D${i}`));
});

test('discard candidates are exact, unique, in-hand subsets of 1–5 cards and include multi-card options', () => {
  const s = state();
  const disc = hint.buildHintRequest(s, [1, 2]).choices.filter(c => c.kind === 'DISCARD');
  const ids = new Set(s.hand.map(c => c.id)); const keys = new Set();
  for (const c of disc) {
    assert.ok(c.cardIds.length >= 1 && c.cardIds.length <= 5);
    assert.ok(c.cardIds.every(id => ids.has(id)));
    const key = [...c.cardIds].sort().join(',');
    assert.ok(!keys.has(key), 'no duplicate subsets'); keys.add(key);
  }
  assert.ok(disc.some(c => c.cardIds.length >= 3), 'offers multi-card discards');
  // "everything outside the pair" (lowest five) comes first
  assert.deepEqual(disc[0].cardIds, [3, 7, 4, 5, 8]);
  // flush draw toward hearts discards non-hearts
  assert.ok(disc.some(c => c.cardIds.every(id => s.hand.find(x => x.id === id).suit !== 'heart')));
});

test('boss and resource constraints shape legal candidates', () => {
  const s = state(); s.bossModifier = { id: 'max3cards' };
  let req = hint.buildHintRequest(s, [1, 2]);
  assert.ok(req.choices.filter(c => c.kind === 'DISCARD').every(c => c.cardIds.length <= 3), 'max3 caps discards');
  assert.ok(!hint.buildHintRequest(s, [1, 2, 3, 4]).choices.some(c => c.kind === 'PLAY_BEST'), 'max3 blocks 4-card attack');
  s.bossModifier = { id: 'min4cards' };
  assert.ok(!hint.buildHintRequest(s, [1, 2]).choices.some(c => c.kind === 'PLAY_BEST'));
  s.bossModifier = { id: 'no_hearts' };
  req = hint.buildHintRequest(s, [1, 2]);
  assert.ok(!req.choices.some(c => c.kind === 'PLAY_BEST'), 'heart in attack blocked');
  assert.ok(req.choices.some(c => c.cardIds.length && c.cardIds.every(id => s.hand.find(x => x.id === id).suit === 'heart')));
  s.bossModifier = { id: 'no_discard' };
  assert.equal(hint.buildHintRequest(s, [1, 2]), null, 'attack alone is not a choice');
  s.bossModifier = null; s.discardsLeft = 0;
  assert.equal(hint.buildHintRequest(s, [1, 2]), null);
});

test('guest/unsigned token never reaches the network; 401 maps to guest', async () => {
  let calls = 0;
  const r = await ctl(state(), async () => { calls++; }, { getToken: () => 'header.payload.' }).request();
  assert.equal(r.status, 'guest'); assert.equal(calls, 0);
  assert.equal((await ctl(state(), async () => ({ ok: false, status: 401 })).request()).status, 'guest');
  for (const status of [429, 502, 503]) assert.equal((await ctl(state(), async () => ({ ok: false, status })).request()).status, 'failed');
  assert.equal((await ctl(state(), async () => { throw new Error('net'); }).request()).status, 'failed');
});

test('valid discard reply returns the exact candidate cards; no game state changes', async () => {
  const s = state(); let sent;
  const r = await ctl(s, async (url, o) => { sent = { url, o }; return { ok: true, json: async () => ({ choiceId: 'D0', kind: 'DISCARD', cardIds: [5, 8, 3, 7, 4], reason: 'x' }) }; }).request();
  assert.equal(sent.url, 'https://llm.cocy.io/api/games/jokerrun/hint');
  assert.equal(sent.o.headers.Authorization, 'Bearer a.b.sig');
  assert.ok(!sent.o.body.includes('a.b.sig'));
  assert.equal(r.status, 'ok'); assert.equal(r.kind, 'DISCARD');
  assert.deepEqual([...r.cardIds], [3, 7, 4, 5, 8]);
  assert.equal(s.discardsLeft, 2); assert.equal(s.hand.length, 8);
});

test('unknown choice or mismatched card IDs fail closed', async () => {
  assert.equal((await ctl(state(), okFetch({ choiceId: 'D99', cardIds: [1] })).request()).status, 'failed');
  assert.equal((await ctl(state(), okFetch({ choiceId: 'D0', cardIds: [1, 2] })).request()).status, 'failed');
  assert.equal((await ctl(state(), okFetch({ choiceId: 'A0' })).request()).status, 'failed');
});

test('reply for a changed hand is stale and ignored', async () => {
  const s = state(); let resolve;
  const pending = ctl(s, () => new Promise(r => { resolve = r; })).request();
  s.hand.pop();
  resolve({ ok: true, json: async () => ({ choiceId: 'A0', cardIds: [1, 2] }) });
  assert.equal((await pending).status, 'stale');
});

test('hint mode defaults to algorithm and persists explicit AI opt-in', () => {
  const mem = { v: {}, getItem(k) { return this.v[k] ?? null; }, setItem(k, v) { this.v[k] = v; } };
  assert.equal(hint.getHintMode(mem), 'algorithm');
  hint.setHintMode('ai', mem); assert.equal(hint.getHintMode(mem), 'ai');
  hint.setHintMode('bogus', mem); assert.equal(hint.getHintMode(mem), 'algorithm');
  assert.equal(hint.getHintMode({ getItem() { throw new Error('blocked'); } }), 'algorithm');
});

test('page: one hint button, settings row, in-flow advice, no pilot gate or floating overlay', () => {
  assert.doesNotMatch(html, /layaPilot|layaHintPilot/);
  assert.equal((html.match(/id="hintBtn"/g) || []).length, 1);
  assert.match(html, /id="setHintModeRow"/);
  assert.match(html, /\$\("#hintBtn"\)\.addEventListener\("click", onHintClick\)/);
  assert.match(html, /laya-hint\.js\?v=/);
  assert.match(html, /\.card\.hint-discard/);
  // advice is written into the existing in-flow info line, not an absolutely positioned box
  assert.match(html, /function showAiHint[\s\S]*?setInfo\(/);
});
