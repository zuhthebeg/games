import test from 'node:test';
import { trained } from './fixtures/trained.js';
import assert from 'node:assert/strict';
import { createSave, SaveStore, SAVE_KEY, validateSave } from '../js/meta/save.js';
import { learnSkill, equipSkill, setSlot, loadoutOf, migrateLoadout, slotOf } from '../js/meta/skills.js';
import { buildRoundMods } from '../js/meta/run.js';
import { createWorld, addPlayer } from '../js/sim/world.js';
import { instance } from '../js/meta/items.js';

const fresh = (weapon = 'blade') => ({ ...trained(createSave({ name: '슬롯', answers: [0, 0, 0, 0, 0], weapon, createdAt: 1 })), gold: 100000 });
const learnAll = (s, ids) => ids.reduce((save, id) => learnSkill(save, id), s);
const memoryStore = () => {
  const memory = new Map();
  return { memory, store: new SaveStore({ getItem: k => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v), removeItem: k => memory.delete(k) }, () => 1) };
};

test('new characters start with the kit skill in slot 1', () => {
  for (const [weapon, kit] of [['blade', 'lunge'], ['bow', 'volley'], ['focus', 'ember_bolt']]) {
    assert.deepEqual(fresh(weapon).loadout, [kit, null, null]);
  }
});

test('old saves keep their family pick in slot 1 and fill slots with learned same-family skills', () => {
  let s = learnAll(fresh(), ['whirl', 'heavy_cleave', 'frost_lance']);
  delete s.loadout; s.skills = { blade: 'whirl' };
  assert.deepEqual(migrateLoadout(s, 'blade'), ['whirl', 'heavy_cleave', 'lunge']);
  const { memory, store } = memoryStore();
  memory.set(SAVE_KEY, JSON.stringify(s));
  const loaded = store.load();
  assert.deepEqual(loaded.loadout, ['whirl', 'heavy_cleave', 'lunge']);
  assert.ok(validateSave(loaded));
  // Without a family pick the kit skill leads.
  const plain = fresh(); delete plain.loadout;
  assert.deepEqual(loadoutOf(plain), ['lunge', null, null]);
});

test('setSlot moves, swaps and clears; equipSkill fills the first empty slot then slot 1', () => {
  let s = learnAll(fresh(), ['whirl', 'frost_lance', 'pierce_shot']);
  s = setSlot(s, 'blade', 1, 'whirl');
  assert.deepEqual(s.loadout, ['lunge', 'whirl', null]);
  s = setSlot(s, 'blade', 0, 'whirl'); // move into an occupied slot = swap
  assert.deepEqual(s.loadout, ['whirl', 'lunge', null]);
  s = setSlot(s, 'blade', 1, null);
  assert.deepEqual(s.loadout, ['whirl', null, null]);
  s = equipSkill(s, 'focus', 'frost_lance');
  s = equipSkill(s, 'bow', 'pierce_shot');
  assert.deepEqual(s.loadout, ['whirl', 'frost_lance', 'pierce_shot']);
  assert.equal(equipSkill(s, 'blade', 'whirl'), s, 'already slotted stays put');
  s = equipSkill(s, 'blade', 'lunge');
  assert.deepEqual(s.loadout, ['lunge', 'frost_lance', 'pierce_shot']);
  assert.equal(slotOf(s, 'pierce_shot'), 2);
  assert.throws(() => setSlot(s, 'blade', 3, 'whirl'), /슬롯/);
  assert.throws(() => setSlot(fresh(), 'blade', 0, 'whirl'), /배우지/);
});

test('validation rejects malformed loadouts', () => {
  const s = learnAll(fresh(), ['whirl']);
  for (const loadout of [['whirl'], ['whirl', 'whirl', null], ['whirl', 'flame_ring', null], ['nope', null, null], 'whirl', [null, null, null, null]]) {
    assert.equal(validateSave({ ...s, loadout }), false, JSON.stringify(loadout));
  }
  assert.ok(validateSave({ ...s, loadout: [null, null, null] }));
  assert.ok(validateSave({ ...s, loadout: ['ember_bolt', 'whirl', 'volley'] }));
});

test('round mods carry the loadout; the sim keeps usable slots and falls back in slot 1', () => {
  let s = learnAll(fresh(), ['whirl', 'frost_lance', 'pierce_shot']);
  s = { ...s, loadout: ['whirl', 'frost_lance', 'pierce_shot'] };
  const sim = (save, weapon) => {
    const world = createWorld({ seed: 1 });
    addPlayer(world, { pid: 'p', weapon, mods: buildRoundMods(save) });
    return world.entities[0].skills;
  };
  assert.deepEqual(buildRoundMods(s).skills, ['whirl', 'frost_lance', 'pierce_shot']);
  assert.deepEqual(sim(s, 'blade'), ['whirl', 'frost_lance', null]);
  assert.deepEqual(sim(s, 'bow'), ['volley', 'frost_lance', 'pierce_shot']);
  assert.deepEqual(sim(s, 'focus'), ['whirl', 'frost_lance', null]);
  // A weapon swap in the inn keeps the loadout untouched.
  const bow = { ...s, items: [...s.items, instance('b', 'short_bow')], equipped: { ...s.equipped, weapon: 'b' } };
  assert.deepEqual(loadoutOf(bow), s.loadout);
  const { store } = memoryStore();
  store.save(s); assert.deepEqual(store.load().loadout, s.loadout);
});
