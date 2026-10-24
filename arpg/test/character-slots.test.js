import test from 'node:test';
import assert from 'node:assert/strict';
import { createSlotStorage, SLOT_SAVE_KEYS } from '../js/meta/character-slots.js';
import { createSave, SaveStore, SAVE_KEY, SAVE_VERSION, validateSave } from '../js/meta/save.js';
import { addXp, MAX_LEVEL } from '../js/meta/progression.js';
import { BOOKS } from '../js/meta/skills.js';
import { MASTERY_SKILLS, MASTERY_MAX } from '../js/meta/skill-mastery.js';
import { toOldScale } from './fixtures/old-scale.js';

const expectedKeys = {
  human: 'arpg.save.v1',
  skeleton_mage: 'arpg.save.v1.slots.skeleton_mage',
  skeleton_knight: 'arpg.save.v1.slots.skeleton_knight',
  skeleton_archer: 'arpg.save.v1.slots.skeleton_archer',
};
const newSlots = ['skeleton_mage', 'skeleton_knight', 'skeleton_archer'];
const fresh = (weapon = 'blade') => createSave({ name: '원본용사', answers: [0, 0, 0, 0, 0], weapon, createdAt: 123 });
// Browser-like string storage; record every access to prove absence of cross-slot IO.
function storageFixture(entries = []) {
  const data = new Map(entries), calls = [];
  const storage = {
    getItem(key) { key = String(key); calls.push(['get', key]); return data.get(key) ?? null; },
    setItem(key, value) { key = String(key); value = String(value); calls.push(['set', key, value]); data.set(key, value); },
    removeItem(key) { key = String(key); calls.push(['remove', key]); data.delete(key); },
    key(index) { return [...data.keys()][index] ?? null; },
    get length() { return data.size; },
  };
  return { data, calls, storage };
}
const storeFor = (storage, slot, now = () => 999) => new SaveStore(createSlotStorage(storage, slot), now);

// This is storage plumbing, not a character schema: valid existing JSON, no invented race/class fields.
function richSave(weapon) {
  const save = addXp(fresh(weapon), 999999);
  save.learned = Object.keys(BOOKS);
  save.skillMastery = Object.fromEntries(MASTERY_SKILLS.map((id, i) => [id, 1500 + i]));
  save.loadouts = { blade: ['lunge', null, 'whirl'], bow: ['volley', null, 'pierce_shot'], focus: ['ember_bolt', null, 'healing_light'] };
  save.weaponLoadouts = {
    'blade:sword': ['lunge', null, 'whirl'], 'blade:blunt': ['ground_slam', null, 'armor_break'],
    'bow:bow': ['volley', null, 'pierce_shot'], 'focus:wand': ['ember_bolt', null, 'frost_lance'],
    'focus:staff': ['healing_light', 'flame_ring', null],
  };
  save.gold = 4321;
  save.enchantCount = 7;
  save.seenMaterials = ['hide'];
  save.quests = { QF1: { state: 'active', progress: 17, last: 123 } };
  save.lastReceipt = {
    stageId: 'S1', terminal: 'clear', threat: 1, depositedXp: 0, xpForfeited: 0,
    stageXp: 50, levelsGained: 0, statPointsGained: 0, goldGained: 0,
    xpGained: 0, xpLost: 0, xpDiscarded: 50, firstClear: true, pityGranted: false,
    masteryRises: [{ id: 'lunge', level: 30 }],
    used: { potion: 0 }, restored: { potion: 0 },
    lootKept: { gold: 0, stacks: {}, items: [] }, lootLost: { gold: 0, stacks: {}, items: [] },
  };
  save.stash.stacks = { potion: 12 };
  assert.equal(validateSave(save), true, 'fixture must satisfy actual validator');
  return JSON.parse(JSON.stringify(save));
}

test('fixed own-key whitelist and exact namespace/diagnostic collision boundaries', () => {
  assert.deepEqual(SLOT_SAVE_KEYS, expectedKeys);
  assert.equal(Object.isFrozen(SLOT_SAVE_KEYS), true);
  const keys = Object.values(expectedKeys).flatMap(key => [key, `${key}.corrupt.0`, `${key}.corrupt.999`]);
  assert.equal(new Set(keys).size, 12);
  const fixture = storageFixture();
  for (const [slot, key] of Object.entries(expectedKeys)) {
    const adapter = createSlotStorage(fixture.storage, slot);
    adapter.setItem(SAVE_KEY, slot);
    adapter.setItem(`${SAVE_KEY}.corrupt.999`, `${slot} backup`);
    assert.equal(adapter.getItem(SAVE_KEY), slot);
    assert.equal(adapter.getItem(`${SAVE_KEY}.corrupt.999`), `${slot} backup`);
    assert.equal(fixture.data.get(key), slot);
    assert.equal(fixture.data.get(`${key}.corrupt.999`), `${slot} backup`);
    adapter.removeItem(`${SAVE_KEY}.corrupt.999`);
    assert.equal(fixture.data.has(`${key}.corrupt.999`), false);
  }
  assert.deepEqual([...fixture.data.keys()], Object.values(expectedKeys));
});

test('old human without lineage fields roundtrips exactly, no automatic reads/writes', () => {
  const original = fresh(), raw = JSON.stringify(original);
  for (const field of ['race', 'classId', 'family', 'weaponLoadouts']) assert.equal(Object.hasOwn(original, field), false);
  const fixture = storageFixture([[SAVE_KEY, raw]]);
  const store = storeFor(fixture.storage, 'human');
  assert.deepEqual(fixture.calls, []);
  assert.deepEqual(store.load(), original);
  assert.equal(fixture.data.get(SAVE_KEY), raw);
  store.save(original);
  assert.equal(fixture.data.get(SAVE_KEY), raw);
  assert.deepEqual([...fixture.data.keys()], [SAVE_KEY]);
  assert.equal(SAVE_VERSION, 5);
});

for (const [i, slot] of newSlots.entries()) {
  test(`${slot}: real SaveStore JSON read/write preserves every field, MAX30/raw counts/five-form history`, () => {
    const human = JSON.stringify(fresh());
    const fixture = storageFixture([[SAVE_KEY, human], ['arpg.activeSlot', 'human'], ['unrelated.setting', 'keep']]);
    const before = new Map(fixture.data), save = richSave(['focus', 'blade', 'bow'][i]);
    const store = storeFor(fixture.storage, slot);
    assert.equal(store.load(), null);
    store.save(save);
    const raw = fixture.data.get(expectedKeys[slot]);
    assert.deepEqual(JSON.parse(raw), save);
    assert.deepEqual(store.load(), save);
    assert.equal(save.level, MAX_LEVEL);
    assert.equal(MAX_LEVEL, 30);
    assert.equal(MASTERY_MAX, 30);
    assert.equal(Object.keys(save.weaponLoadouts).length, 5);
    for (const [key, value] of before) assert.equal(fixture.data.get(key), value);
    assert.ok(fixture.calls.every(([, key]) => key === expectedKeys[slot]));
    assert.equal(Object.hasOwn(save, 'race'), false);
  });

  test(`${slot}: corrupted JSON and invalid data quarantine only their own namespace`, () => {
    for (const raw of ['{broken', JSON.stringify({ ...fresh(), level: 31 })]) {
      const entries = Object.values(expectedKeys).map(key => [key, key === expectedKeys[slot] ? raw : `untouched:${key}`]);
      const fixture = storageFixture([...entries, [`${SAVE_KEY}.corrupt.999`, 'old human diagnostic']]);
      const before = new Map(fixture.data);
      assert.equal(storeFor(fixture.storage, slot).load(), null);
      assert.equal(fixture.data.get(`${expectedKeys[slot]}.corrupt.999`), raw);
      assert.equal(fixture.data.has(expectedKeys[slot]), false);
      for (const [key, value] of before) if (key !== expectedKeys[slot]) assert.equal(fixture.data.get(key), value);
      assert.deepEqual(fixture.calls.map(c => c.slice(0, 2)), [
        ['get', expectedKeys[slot]], ['set', `${expectedKeys[slot]}.corrupt.999`], ['remove', expectedKeys[slot]],
      ]);
    }
  });
}

test('choosing/using new slots never reads or repairs an invalid old human', () => {
  const fixture = storageFixture([[SAVE_KEY, 'human invalid user-owned bytes']]);
  for (const slot of newSlots) {
    const store = storeFor(fixture.storage, slot);
    assert.equal(store.load(), null);
    store.save(fresh());
    assert.equal(validateSave(store.load()), true);
  }
  assert.equal(fixture.data.get(SAVE_KEY), 'human invalid user-owned bytes');
  assert.ok(fixture.calls.every(([, key]) => key !== SAVE_KEY && !key.startsWith(`${SAVE_KEY}.corrupt.`)));
});

test('malformed/unknown slot IDs rejected before touching storage; no coercion/prototype fallback', () => {
  const fixture = storageFixture();
  for (const slot of [undefined, null, '', 'Human', 'mage', 'skeleton_mage ', '../human', '__proto__', 'constructor', 'toString', {}, new String('human'), SAVE_KEY]) {
    assert.throws(() => createSlotStorage(fixture.storage, slot), /slot/i);
  }
  assert.deepEqual(fixture.calls, []);
});

test('reject arbitrary keys/prefixes/cross-slot diagnostics; expose only SaveStore used storage subset', () => {
  const fixture = storageFixture();
  for (const slot of Object.keys(expectedKeys)) {
    const adapter = createSlotStorage(fixture.storage, slot);
    assert.deepEqual(Object.keys(adapter).sort(), ['getItem', 'keys', 'removeItem', 'setItem']);
    for (const key of [undefined, null, {}, new String(SAVE_KEY), 'settings', `${SAVE_KEY}.backup.999`, `${SAVE_KEY}.corrupt.`, `${SAVE_KEY}.corrupt.-1`, `${SAVE_KEY}.corrupt.01`, `${SAVE_KEY}.corrupt.1.2`, `${SAVE_KEY}.corrupt.999.extra`, `${SAVE_KEY}.corrupt.9007199254740992`, ...newSlots.map(s => `${expectedKeys[s]}.corrupt.999`)]) {
      for (const method of ['getItem', 'setItem', 'removeItem']) assert.throws(() => adapter[method](key, 'bad'), /key/i);
    }
    assert.equal(adapter.clear, undefined);
    assert.equal(adapter.key, undefined);
  }
  assert.deepEqual(fixture.calls, []);
});

test('mapped methods keep browser storage receiver and string value semantics', () => {
  const fixture = storageFixture();
  const backing = {
    getItem(key) { assert.equal(this, backing); return fixture.storage.getItem(key); },
    setItem(key, value) { assert.equal(this, backing); fixture.storage.setItem(key, value); },
    removeItem(key) { assert.equal(this, backing); fixture.storage.removeItem(key); },
  };
  const adapter = createSlotStorage(backing, 'skeleton_mage');
  adapter.setItem(SAVE_KEY, 42);
  assert.equal(adapter.getItem(SAVE_KEY), '42');
  adapter.removeItem(SAVE_KEY);
  assert.equal(adapter.getItem(SAVE_KEY), null);
});

test('unavailable storage errors propagate unchanged, never fallback to human/active', () => {
  const error = new Error('SecurityError'), fixture = storageFixture([[SAVE_KEY, 'keep'], ['arpg.activeSlot', 'human']]);
  const before = new Map(fixture.data);
  const blocked = { ...fixture.storage, getItem() { throw error; }, setItem() { throw error; } };
  for (const slot of newSlots) {
    const store = storeFor(blocked, slot);
    assert.throws(() => store.load(), e => e === error);
    assert.throws(() => store.save(fresh()), e => e === error);
    const unavailable = storeFor(null, slot);
    assert.throws(() => unavailable.load(), TypeError);
    assert.throws(() => unavailable.save(fresh()), TypeError);
  }
  assert.deepEqual(fixture.data, before);
  assert.deepEqual(fixture.calls, []);
});

test('quota/write and quarantine/remove failures retain originals, siblings and active value', () => {
  for (const slot of newSlots) {
    for (const failure of ['save', 'backup', 'remove']) {
      const key = expectedKeys[slot], raw = failure === 'save' ? JSON.stringify(fresh()) : '{bad';
      const fixture = storageFixture(Object.values(expectedKeys).map(k => [k, k === key ? raw : `keep:${k}`]).concat([['arpg.activeSlot', 'human']]));
      const before = new Map(fixture.data), error = new Error(failure === 'remove' ? 'SecurityError' : 'QuotaExceededError');
      const blocked = {
        getItem: k => fixture.storage.getItem(k),
        setItem(k, v) { if (failure !== 'remove') throw error; fixture.storage.setItem(k, v); },
        removeItem() { throw error; },
      };
      const store = storeFor(blocked, slot);
      assert.throws(() => failure === 'save' ? store.save({ ...fresh(), gold: 99 }) : store.load(), e => e === error);
      for (const [k, value] of before) assert.equal(fixture.data.get(k), value);
      if (failure === 'remove') assert.equal(fixture.data.get(`${key}.corrupt.999`), raw);
      else assert.deepEqual(fixture.data, before);
      assert.ok(fixture.calls.every(([, k]) => k === key || k === `${key}.corrupt.999`));
    }
  }
});

test('invalid save rejected by existing validator without storage mutation', () => {
  const fixture = storageFixture([[SAVE_KEY, 'keep']]);
  for (const slot of newSlots) assert.throws(() => storeFor(fixture.storage, slot).save({ ...fresh(), level: 31 }), /검증/);
  assert.deepEqual(fixture.calls, []);
  assert.deepEqual([...fixture.data], [[SAVE_KEY, 'keep']]);
});

test('v3/v4 migrations reuse SaveStore unchanged in all namespaces without rewriting original bytes', () => {
  for (const version of [3, 4]) {
    const original = fresh();
    const raw = JSON.stringify(toOldScale(original, version));
    const fixture = storageFixture(Object.values(expectedKeys).map(key => [key, raw]));
    for (const slot of Object.keys(expectedKeys)) {
      assert.deepEqual(storeFor(fixture.storage, slot).load(), original);
    }
    assert.deepEqual(fixture.calls, Object.values(expectedKeys).map(key => ['get', key]));
    for (const key of Object.values(expectedKeys)) assert.equal(fixture.data.get(key), raw);
  }
});
