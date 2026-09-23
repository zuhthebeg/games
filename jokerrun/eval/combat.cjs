'use strict';
// Offline, explicit-input projection. Never load/evaluate index.html or access browser state.
const HAND = { HIGH_CARD: [5, 1], PAIR: [10, 2] };
const LEVEL = { HIGH_CARD: [15, 1], PAIR: [15, 1] }; // pluto / mercury in index.html
const RANK = Object.freeze({ 11: 10, 12: 10, 13: 10, 14: 11 });
const ENH = { bonus: { chips: 30 }, mult: { add: 4 }, stone: { chips: 50 }, glass: { factor: 1.5 }, steel: {}, gold: {} };
const EDITION = { foil: { chips: 50 }, holo: { add: 10 }, poly: { factor: 1.5 } };
const round2 = n => Math.round(n * 100) / 100;
const card = c => ({ id: c.id, suit: c.suit, rank: c.rank, enh: c.enh || null });
const joker = j => ({ id: j.id, edition: j.edition || null, negative: !!j.negative,
  counter: j.counter || 0, chipCounter: j.chipCounter || 0 });
function snapshot(s) {
  if (!s || !Array.isArray(s.hand) || !Array.isArray(s.jokers) || !Array.isArray(s.runDeck) || !Array.isArray(s.deck)) throw Error('explicit combat state required');
  const hand = s.hand.map(card);
  const selected = new Set(s.selected instanceof Set ? s.selected : (s.selectedIds || []));
  return {
    schema: 'jokerrun-eval-v1', ante: s.ante, roundIndex: s.roundIndex, score: s.score, target: s.target,
    handsLeft: s.handsLeft, discardsLeft: s.discardsLeft, startHands: s._startHands ?? s.startHands ?? null,
    bossModifier: s.bossModifier ? { id: s.bossModifier.id, label: s.bossModifier.label || null } : null,
    bossDisabledJoker: s.bossDisabledJoker || null,
    handLevels: { ...(s.handLevels || {}) }, handPlays: { ...(s.handPlays || {}) }, lastHandType: s.lastHandType || null,
    hand, selectedIds: hand.filter(c => selected.has(c.id)).map(c => c.id), jokers: s.jokers.map(joker),
    runDeck: s.runDeck.map(card), deckIds: s.deck.map(c => c.id),
    tarotIds: (s.tarotCards || []).map(t => t.id), planetIds: (s.planetCards || []).map(p => p.id)
  };
}
function representative() {
  const a = { id: 1, suit: 'spade', rank: 8, enh: 'mult' };
  const b = { id: 2, suit: 'diamond', rank: 8, enh: 'glass' };
  return snapshot({ ante: 1, roundIndex: 0, score: 0, target: 300, handsLeft: 4, discardsLeft: 3,
    _startHands: 4, handLevels: { HIGH_CARD: 1, PAIR: 1 }, hand: [a, b], selected: new Set([1, 2]),
    jokers: [{ id: 'flat50', edition: 'poly' }, { id: 'pairBoost', edition: 'holo' }], runDeck: [a, b], deck: [] });
}
function counterfactual(input, change = {}) {
  const s = JSON.parse(JSON.stringify(input));
  const invalid = reason => ({ status: 'invalid', estimatedPoints: null, reason });
  const unsupported = reason => ({ status: 'unsupported', estimatedPoints: null, reason });
  if (!s || s.schema !== 'jokerrun-eval-v1') return invalid('snapshot schema');
  const ids = change.cardIds || s.selectedIds;
  const jids = change.jokerIds || s.jokers.map(j => j.id);
  if (!Array.isArray(ids) || !ids.length || ids.length > 5 || new Set(ids).size !== ids.length || ids.some(id => !s.hand.some(c => c.id === id))) return invalid('selected cards');
  if (!Array.isArray(jids) || jids.length !== s.jokers.length || new Set(jids).size !== jids.length || jids.some(id => !s.jokers.some(j => j.id === id))) return invalid('joker permutation');
  const boss = s.bossModifier?.id;
  if (boss === 'max3cards' && ids.length > 3) return invalid('max3cards');
  if (boss === 'min4cards' && ids.length < 4) return invalid('min4cards');
  if (s.handsLeft <= 0) return invalid('no hands left');
  if (boss && !['max3cards', 'min4cards', 'disable_joker'].includes(boss)) return unsupported(`boss effect: ${boss}`);
  const cards = ids.map(id => s.hand.find(c => c.id === id));
  const real = cards.filter(c => c.enh !== 'stone');
  const counts = new Map(); real.forEach(c => counts.set(c.rank, (counts.get(c.rank) || 0) + 1));
  const handType = real.length && [...counts.values()].includes(2) ? 'PAIR' : 'HIGH_CARD';
  if (real.length > 2) return unsupported('hand classification outside high-card/pair subset');
  if (cards.some(c => c.enh && !ENH[c.enh])) return unsupported('unknown enhancement');
  if (s.hand.some(c => c.enh === 'steel' && !ids.includes(c.id))) return unsupported('held steel effect');
  const jokers = jids.map(id => s.jokers.find(j => j.id === id));
  if (jokers.some(j => !['flat50', 'pairBoost'].includes(j.id) || (j.edition && !EDITION[j.edition]))) return unsupported('joker apply/edition outside subset');
  const level = change.levels?.[handType] ?? s.handLevels[handType] ?? 1;
  if (!Number.isInteger(level) || level < 1) return invalid('hand level');
  let [chips, mult] = HAND[handType];
  chips += LEVEL[handType][0] * (level - 1);
  mult += LEVEL[handType][1] * (level - 1);
  const scored = cards.filter(c => c.enh === 'stone' || (handType === 'PAIR' ? counts.get(c.rank) === 2 : c === real.reduce((a, b) => !a || b.rank > a.rank ? b : a, null)));
  const chipOf = c => c.enh === 'stone' ? 50 : (RANK[c.rank] ?? c.rank) + (ENH[c.enh]?.chips || 0);
  chips += scored.reduce((n, c) => n + chipOf(c), 0);
  for (const c of scored) {
    const e = ENH[c.enh];
    if (e?.add) mult += e.add;
    if (e?.factor) mult = round2(mult * e.factor);
  }
  for (const j of jokers) {
    if (boss === 'disable_joker' && s.bossDisabledJoker === j.id) continue;
    if (j.id === 'flat50') chips += 60;
    if (j.id === 'pairBoost' && handType !== 'HIGH_CARD') mult += 2;
    const e = EDITION[j.edition];
    if (e?.chips) chips += e.chips;
    if (e?.add) mult += e.add;
    if (e?.factor) mult = round2(mult * e.factor);
  }
  chips = Math.max(0, Math.floor(chips));
  mult = Math.max(1, Math.floor(mult * 100) / 100);
  return { status: 'approximate', handType, estimatedPoints: Math.floor(chips * mult), chips, mult,
    cardIds: ids, jokerIds: jids, caveat: 'Supported subset only; not a live playSelected score.' };
}
module.exports = { snapshot, representative, counterfactual };
