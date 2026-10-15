import test from 'node:test';
import assert from 'node:assert/strict';
import { createSkeletonSave, persistSkeletonCharacter } from '../js/meta/character-creation.js';
import { createSave, validateSave, SaveStore, SAVE_KEY } from '../js/meta/save.js';
import { SLOT_SAVE_KEYS, createSlotStorage } from '../js/meta/character-slots.js';
import { playerLineage, playerForm } from '../js/content/player-lineages.js';
import { ITEMS, START_WEAPONS } from '../js/meta/items.js';
import { BOOKS, DEFAULT_SKILLS } from '../js/meta/skills.js';
import { resolve } from '../js/meta/quiz.js';

const roles = [['skeleton_mage', 'focus'], ['skeleton_knight', 'blade'], ['skeleton_archer', 'bow']];
const options = lineage => ({ lineage, name: ' 해골용사 ', answers: [0, 0, 0, 0, 0], createdAt: 123 });
function fixture(entries = []) {
  const data = new Map(entries), calls = [];
  return { data, calls, storage: {
    getItem(key) { calls.push(['get', key]); return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { calls.push(['set', key, value]); data.set(key, String(value)); },
    removeItem(key) { calls.push(['remove', key]); throw new Error('creation must never remove'); },
  } };
}
const baseline = () => {
  const human = createSave({ ...options(), weapon: 'blade' });
  human.gold = 5432;
  human.completedRounds = 8;
  human.shopRefresh = 9;
  human.paidRefreshes = 2;
  human.rarelessRounds = 7;
  human.enchantCount = 4;
  human.stacks.potion = 12;
  human.stash.stacks.potion = 10;
  human.seenMaterials = ['hide'];
  human.learned = Object.keys(BOOKS);
  human.skillMastery = { ember_bolt: 1500 };
  human.weaponLoadouts = { 'blade:sword': ['lunge', null, 'whirl'] };
  assert.equal(validateSave(human), true);
  return [[SAVE_KEY, JSON.stringify(human)], [`${SAVE_KEY}.corrupt.9`, 'original diagnostic'],
    ['settings', 'untouched'], ...roles.slice(1).flatMap(([id]) =>
      [[SLOT_SAVE_KEYS[id], '{broken sibling'], [`${SLOT_SAVE_KEYS[id]}.corrupt.8`, 'sibling diagnostic']])];
};

for (const [lineage, family] of roles) {
  for (const answer of [0, 1, 2, 3]) {
    test(`${lineage}: actual fresh schema, fixed ${family}, quiz ${answer} and normal defaults`, () => {
      const input = { ...options(lineage), answers: Array(5).fill(answer) };
      const before = structuredClone(input);
      const save = createSkeletonSave(input);
      const expected = { ...createSave({ ...input, weapon: family }), lineage };
      assert.deepEqual(save, expected, 'only lineage differs from canonical fresh factory');
      assert.deepEqual(input, before);
      assert.equal(validateSave(save), true);
      assert.equal(validateSave(JSON.parse(JSON.stringify(save))), true);
      assert.equal(playerLineage(save).family, family);
      assert.equal(playerForm(save), lineage);
      assert.equal(save.items[0].id, START_WEAPONS[family]);
      assert.equal(ITEMS[save.items[0].id].family, family);
      assert.deepEqual(save.loadout, [DEFAULT_SKILLS[family], null, null]);
      assert.deepEqual(save.quiz, { answers: input.answers, weapon: family, overridden: family !== resolve(input.answers).weapon });
      assert.equal(save.level, 1); assert.equal(save.gold, 30);
      assert.deepEqual(save.stacks, { potion: 3, mana_potion: 1, return_scroll: 1 });
      assert.deepEqual(save.learned, []); assert.deepEqual(save.skillMastery, {});
      for (const key of ['completedRounds', 'shopRefresh', 'paidRefreshes', 'rarelessRounds']) assert.equal(save[key], 0);
      for (const key of ['lastReceipt', 'weaponLoadouts', 'seenMaterials', 'enchantCount']) assert.equal(Object.hasOwn(save, key), false);
      input.answers[0] = (answer + 1) % 4;
      assert.notDeepEqual(save.quiz.answers, input.answers);
      save.items[0].enhance = 5; save.stacks.potion = 0;
      assert.deepEqual(createSkeletonSave(before), expected, 'factory has no shared mutable profile');
    });
  }
  test(`${lineage}: empty isolated destination succeeds once and roundtrips existing SaveStore`, () => {
    const f = fixture([[SAVE_KEY, 'already corrupt human'], [`${SAVE_KEY}.corrupt.1`, 'keep']]);
    const initial = new Map(f.data);
    const save = persistSkeletonCharacter(f.storage, options(lineage));
    assert.deepEqual(f.calls, [['get', SLOT_SAVE_KEYS[lineage]], ['set', SLOT_SAVE_KEYS[lineage], JSON.stringify(save)]]);
    assert.deepEqual(new SaveStore(createSlotStorage(f.storage, lineage)).load(), save);
    for (const [key, value] of initial) assert.equal(f.data.get(key), value);
    f.calls.length = 0;
    const saved = new Map(f.data);
    assert.throws(() => persistSkeletonCharacter(f.storage, options(lineage)), /occupied/i);
    assert.deepEqual(f.data, saved);
    assert.deepEqual(f.calls, [['get', SLOT_SAVE_KEYS[lineage]]]);
  });
}

const invalid = [
  ...[undefined, null, 'human', '', 'lich', 'unknown', '__proto__', 'constructor', 'toString', {}, { lineage: 'skeleton_mage' }, [], 1].map(lineage => ({ lineage })),
  ...[undefined, null, 1, {}, '', ' ', 'a'.repeat(13)].map(name => ({ name })),
  ...[undefined, null, {}, '00000', [], [0, 0, 0, 0], [0, 0, 0, 0, 4], [0, 0, 0, 0, -1], [0, 0, 0, 0, 0.5], [0, 0, 0, 0, NaN], Array(5)].map(answers => ({ answers })),
  ...[undefined, null, -1, 0.5, NaN, Infinity, '123', Number.MAX_SAFE_INTEGER + 1].map(createdAt => ({ createdAt })),
];
for (const [index, patch] of invalid.entries()) {
  test(`invalid input ${index} rejected by pure and persistence APIs before any storage access`, () => {
    const f = fixture(baseline());
    const before = new Map(f.data);
    const input = { ...options('skeleton_mage'), ...patch };
    assert.throws(() => createSkeletonSave(input));
    assert.throws(() => persistSkeletonCharacter(f.storage, input));
    assert.deepEqual(f.calls, []); assert.deepEqual(f.data, before);
  });
}

test('createdAt zero and maximum safe integer retain existing validator semantics; no implicit clock', () => {
  for (const createdAt of [0, Number.MAX_SAFE_INTEGER]) {
    const save = createSkeletonSave({ ...options('skeleton_mage'), createdAt });
    assert.equal(save.createdAt, createdAt); assert.equal(validateSave(save), true);
  }
});

test('no weapon/slot/profile override and no human inventory, counters or history copied', () => {
  const entries = baseline(), f = fixture(entries), before = new Map(f.data);
  const input = { ...options('skeleton_mage'), weapon: 'bow', slot: 'human', save: JSON.parse(entries[0][1]),
    gold: 99999, items: [], level: 30, stats: {}, learned: ['ember_bolt'], skillMastery: { ember_bolt: 999 } };
  const save = persistSkeletonCharacter(f.storage, input);
  assert.deepEqual(save, createSkeletonSave(options('skeleton_mage')));
  for (const [key, value] of before) assert.equal(f.data.get(key), value);
  assert.deepEqual(f.calls.map(c => c.slice(0, 2)), [['get', SLOT_SAVE_KEYS.skeleton_mage], ['set', SLOT_SAVE_KEYS.skeleton_mage]]);
});

for (const raw of ['null', '', 'undefined', '{trash', '42', '"string"', '{}', JSON.stringify(createSave({ ...options(), weapon: 'blade' }))]) {
  test(`occupied bytes ${JSON.stringify(raw)} are rejected without load/quarantine/reset`, () => {
    const key = SLOT_SAVE_KEYS.skeleton_mage;
    const f = fixture([...baseline(), [key, raw], [`${key}.corrupt.123`, 'preserve diagnostic']]);
    const before = new Map(f.data);
    assert.throws(() => persistSkeletonCharacter(f.storage, options('skeleton_mage')), /occupied/i);
    assert.deepEqual(f.calls, [['get', key]]); assert.deepEqual(f.data, before);
  });
}

test('valid occupied skeleton is rejected byte-exact', () => {
  const key = SLOT_SAVE_KEYS.skeleton_mage, raw = JSON.stringify(createSkeletonSave(options('skeleton_mage')));
  const f = fixture([...baseline(), [key, raw]]), before = new Map(f.data);
  assert.throws(() => persistSkeletonCharacter(f.storage, options('skeleton_mage')), /occupied/i);
  assert.deepEqual(f.calls, [['get', key]]); assert.deepEqual(f.data, before);
});

for (const method of ['getItem', 'setItem']) {
  test(`storage ${method} failure propagates same error; all human/siblings/diagnostics preserved`, () => {
    const f = fixture([...baseline(), ...roles.slice(1).map(([id]) =>
      [SLOT_SAVE_KEYS[id], JSON.stringify(createSkeletonSave(options(id)))])]);
    const before = new Map(f.data);
    const error = new Error(method === 'getItem' ? 'access denied' : 'quota exceeded');
    f.storage[method] = (key) => { f.calls.push([method, key]); throw error; };
    assert.throws(() => persistSkeletonCharacter(f.storage, options('skeleton_mage')), e => e === error);
    assert.deepEqual(f.data, before);
    assert.deepEqual(f.calls.map(c => c[1]), method === 'getItem'
      ? [SLOT_SAVE_KEYS.skeleton_mage] : [SLOT_SAVE_KEYS.skeleton_mage, SLOT_SAVE_KEYS.skeleton_mage]);
  });
}
