'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { snapshot, counterfactual, representative } = require('./combat.cjs');

const state = () => ({
  ante: 4, roundIndex: 2, score: 125, target: 2458, handsLeft: 2, discardsLeft: 1,
  _startHands: 4, bossModifier: { id: 'disable_joker' }, bossDisabledJoker: 'x',
  handLevels: { HIGH_CARD: 1, PAIR: 2 }, handPlays: { PAIR: 3 }, lastHandType: 'PAIR',
  selected: new Set([1, 2]),
  hand: [{ id: 2, suit: 'spade', rank: 8, enh: 'glass' }, { id: 1, suit: 'heart', rank: 8, enh: 'mult' }],
  jokers: [{ id: 'x', edition: 'poly', counter: 2, chipCounter: 17 }, { id: 'y', edition: 'holo', counter: 0 }],
  runDeck: [{ id: 1, suit: 'heart', rank: 8, enh: 'mult' }, { id: 2, suit: 'spade', rank: 8, enh: 'glass' }],
  deck: [{ id: 1, suit: 'heart', rank: 8, enh: 'mult' }], tarotCards: [{ id: 'star' }], planetCards: []
});

test('snapshot preserves hand/deck/joker order, counters and isolation through JSON', () => {
  const live = state();
  const out = snapshot(live);
  assert.deepEqual(out.hand.map(c => c.id), [2, 1]);
  assert.deepEqual(out.selectedIds, [2, 1]);
  assert.deepEqual(out.deckIds, [1]);
  assert.deepEqual(out.jokers.map(j => [j.id, j.edition, j.counter, j.chipCounter]), [['x','poly',2,17],['y','holo',0,0]]);
  assert.equal(out.target, 2458);
  assert.equal(out.bossModifier.id, 'disable_joker');
  live.hand[0].rank = 14;
  assert.equal(JSON.parse(JSON.stringify(out)).hand[0].rank, 8);
});

test('pair card order changes rounded card-phase multiplier; input remains untouched', () => {
  const fixture = representative();
  const before = JSON.stringify(fixture);
  const a = counterfactual(fixture, { cardIds: [1, 2] });
  const b = counterfactual(fixture, { cardIds: [2, 1] });
  assert.equal(a.status, 'approximate');
  assert.equal(a.handType, 'PAIR');
  assert.notEqual(a.estimatedPoints, b.estimatedPoints);
  assert.equal(JSON.stringify(fixture), before);
});

test('joker edition order and hand level affect approximate counterfactuals', () => {
  const fixture = representative();
  const a = counterfactual(fixture, { jokerIds: ['flat50', 'pairBoost'] });
  const b = counterfactual(fixture, { jokerIds: ['pairBoost', 'flat50'] });
  assert.notEqual(a.estimatedPoints, b.estimatedPoints);
  const higher = counterfactual(fixture, { levels: { PAIR: 3 } });
  assert.ok(higher.estimatedPoints > a.estimatedPoints);
});

test('invalid selection and unsupported joker effects do not emit an exact estimate', () => {
  const fixture = representative();
  assert.equal(counterfactual(fixture, { cardIds: [999] }).status, 'invalid');
  fixture.jokers.push({ id: 'goldDice', edition: null, counter: 0 });
  const result = counterfactual(fixture);
  assert.equal(result.status, 'unsupported');
  assert.equal(result.estimatedPoints, null);
});

test('boss card limits and hearts restriction are explicit', () => {
  const fixture = representative();
  fixture.bossModifier = { id: 'min4cards' };
  assert.equal(counterfactual(fixture).status, 'invalid');
  fixture.bossModifier = { id: 'no_hearts' };
  assert.equal(counterfactual(fixture).status, 'unsupported');
});

test('high card excludes kicker chips and uses pluto level bonus', () => {
  const fixture = representative();
  fixture.hand[0].enh = null;
  fixture.hand[1].rank = 3;
  fixture.hand[1].enh = null;
  fixture.jokers = [];
  assert.equal(counterfactual(fixture).estimatedPoints, 13); // (5 + rank 8) × 1
  assert.equal(counterfactual(fixture, { levels: { HIGH_CARD: 2 } }).estimatedPoints, 56); // (5+8+15) × 2
});

test('source anchors still match the deliberately narrow emulation', () => {
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(source, /HIGH_CARD:\s*\{ name: [^\n]*chips: 5, mult: 1 \}/);
  assert.match(source, /PAIR:\s*\{ name: [^\n]*chips: 10, mult: 2 \}/);
  assert.match(source, /hand:"HIGH_CARD",\s*chipsBonus:15, multBonus:1/);
  assert.match(source, /hand:"PAIR",\s*chipsBonus:15, multBonus:1/);
  assert.match(source, /function selectedCards\(\)\s*\{\s*return state\.hand\.filter/);
  assert.ok(source.indexOf('for (let ci = 0; ci < scoreCards.length; ci++)') < source.indexOf('for (const joker of state.jokers) {\n        if (isJokerBossDisabled(joker)) continue;   // 조커 봉인: 효과'));
});
