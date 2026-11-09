import assert from 'node:assert/strict';
import test from 'node:test';
import { AFFIXES } from '../js/content/affixes.js';
import { dailyContracts } from '../js/content/contracts.js';
import { applyOperations, normalizeCharacter } from '../js/save/ops.js';

function makeCharacter() {
  return applyOperations(null, {}, [
    { type: 'createCharacter', name: '모험가', kind: 'knight' },
  ], 'hero');
}

function addItems(state, definitions) {
  return applyOperations(state.character, state.items, definitions.map((item) => ({
    type: 'grantItem',
    uid: item.uid,
    itemId: 'rusted-sword',
    rarity: item.rarity,
    enhance: item.enhance ?? 0,
    ilvl: item.ilvl ?? 5,
    affixes: item.affixes ?? [],
  })), 'hero');
}

test('character normalization clamps materials and supplies contract defaults', () => {
  const normalized = normalizeCharacter({
    materials: { essence: 10000, soul: -3 },
    contracts: { dateKey: '2026-04-01', progress: { '2026-04-01:0': 2, bad: 1.5 }, claimed: ['x', 'x', 4] },
  });
  assert.deepEqual(normalized.materials, { essence: 9999, soul: 0 });
  assert.deepEqual(normalized.contracts, {
    dateKey: '2026-04-01',
    progress: { '2026-04-01:0': 2 },
    claimed: ['x'],
  });
  assert.deepEqual(normalizeCharacter({}).materials, { essence: 0, soul: 0 });
  assert.deepEqual(normalizeCharacter({}).contracts, { dateKey: null, progress: {}, claimed: [] });
});

test('salvage yields rarity materials, enhancement bonus, and rejects equipped items', () => {
  let state = makeCharacter();
  state = addItems(state, [
    { uid: 'magic', rarity: 'magic', enhance: 3 },
    { uid: 'legendary', rarity: 'legendary', enhance: 2 },
    { uid: 'equipped', rarity: 'rare' },
  ]);
  state.items.equipped.slot = 'weapon';
  assert.throws(
    () => applyOperations(state.character, state.items, [{ type: 'salvageItem', uid: 'equipped' }], 'hero'),
    /Equipped items/,
  );
  state = applyOperations(state.character, state.items, [
    { type: 'salvageItem', uid: 'magic' },
    { type: 'salvageItem', uid: 'legendary' },
  ], 'hero');
  assert.deepEqual(state.character.materials, { essence: 14, soul: 1 });
  assert.equal(state.items.magic, undefined);
  assert.equal(state.items.legendary, undefined);
});

test('reforge is deterministic, excludes existing kinds, and charges rarity costs', () => {
  let state = makeCharacter();
  state = applyOperations(state.character, state.items, [
    { type: 'grantGold', amount: 500 },
  ], 'hero');
  state.character.materials = { essence: 20, soul: 3 };
  state = addItems(state, [{
    uid: 'magic',
    rarity: 'magic',
    ilvl: 5,
    affixes: [{ id: 'attackPercent', value: 6 }, { id: 'maxHp', value: 20 }],
  }]);
  const op = { type: 'reforgeAffix', uid: 'magic', index: 0, roll: (3 << 16) | 32768 };
  const first = applyOperations(state.character, state.items, [op], 'hero');
  const second = applyOperations(state.character, state.items, [op], 'hero');
  assert.deepEqual(first.items.magic.affixes[0], second.items.magic.affixes[0]);
  assert.ok(!['attackPercent', 'maxHp'].includes(first.items.magic.affixes[0].id));
  const rule = AFFIXES[first.items.magic.affixes[0].id];
  const expected = Math.round(rule.min + (32768 / 65536) * (rule.max - rule.min) + rule.perIlvl * 5);
  assert.equal(first.items.magic.affixes[0].value, expected);
  assert.equal(first.character.gold, 400);
  assert.equal(first.character.materials.essence, 18);
  assert.equal(first.character.materials.soul, 3);
});

test('reforge preserves legendary and set identity and rejects invalid or insufficient costs', () => {
  let state = makeCharacter();
  state = applyOperations(state.character, state.items, [{ type: 'grantGold', amount: 1000 }], 'hero');
  state.character.materials = { essence: 40, soul: 4 };
  state = addItems(state, [
    { uid: 'legendary', rarity: 'legendary', ilvl: 3, affixes: [{ id: 'attackPercent', value: 4 }] },
    { uid: 'set', rarity: 'set', ilvl: 4, affixes: [{ id: 'maxHp', value: 12 }] },
    { uid: 'common', rarity: 'common', affixes: [{ id: 'attackPercent', value: 4 }] },
  ]);
  state.items.legendary.legendaryId = 'ember-sigil';
  state.items.set.setId = 'guardian-oath';
  const forged = applyOperations(state.character, state.items, [
    { type: 'reforgeAffix', uid: 'legendary', index: 0, roll: 0 },
    { type: 'reforgeAffix', uid: 'set', index: 0, roll: 0xffffffff },
  ], 'hero');
  assert.equal(forged.items.legendary.legendaryId, 'ember-sigil');
  assert.equal(forged.items.set.setId, 'guardian-oath');
  assert.equal(forged.character.materials.essence, 24);
  assert.equal(forged.character.materials.soul, 2);
  assert.equal(forged.character.gold, 860);
  assert.throws(
    () => applyOperations(state.character, state.items, [{ type: 'reforgeAffix', uid: 'common', index: 0, roll: 0 }], 'hero'),
    RangeError,
  );
  assert.throws(
    () => applyOperations({ ...state.character, materials: { essence: 0, soul: 0 } }, state.items, [
      { type: 'reforgeAffix', uid: 'legendary', index: 0, roll: 0 },
    ], 'hero'),
    RangeError,
  );
  assert.throws(
    () => applyOperations(state.character, state.items, [
      { type: 'reforgeAffix', uid: 'legendary', index: 0, roll: 0x100000000 },
    ], 'hero'),
    TypeError,
  );
});

test('contract progress caps at target, resets on date rollover, and claims once', () => {
  let { character, items } = makeCharacter();
  const dateKey = '2026-05-01';
  const contract = dailyContracts('hero', dateKey, character).find(({ type }) => type === 'kills');
  assert.ok(contract);
  character.contracts = { dateKey, progress: {}, claimed: [] };
  assert.throws(
    () => applyOperations(character, items, [{ type: 'claimContract', dateKey, contractId: contract.id }], 'hero'),
    /target/,
  );
  let updated = applyOperations(character, items, [
    { type: 'contractProgress', dateKey, contractId: contract.id, amount: contract.target + 5 },
  ], 'hero');
  assert.equal(updated.character.contracts.progress[contract.id], contract.target);
  const nextDay = '2026-05-02';
  const nextContract = dailyContracts('hero', nextDay, updated.character)[0];
  updated = applyOperations(updated.character, updated.items, [
    { type: 'contractProgress', dateKey: nextDay, contractId: nextContract.id, amount: 1 },
  ], 'hero');
  assert.equal(updated.character.contracts.dateKey, nextDay);
  assert.deepEqual(updated.character.contracts.progress, { [nextContract.id]: 1 });

  const ready = applyOperations(character, items, [
    { type: 'contractProgress', dateKey, contractId: contract.id, amount: contract.target },
  ], 'hero');
  const claimed = applyOperations(ready.character, ready.items, [
    { type: 'claimContract', dateKey, contractId: contract.id },
  ], 'hero');
  assert.ok(claimed.character.contracts.claimed.includes(contract.id));
  assert.throws(
    () => applyOperations(claimed.character, claimed.items, [{ type: 'claimContract', dateKey, contractId: contract.id }], 'hero'),
    /already claimed/,
  );
});
