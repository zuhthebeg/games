import test from 'node:test';
import assert from 'node:assert/strict';
import { trained } from './fixtures/trained.js';
import { createSave, validateSave } from '../js/meta/save.js';
import { learnSkill, setSlot, loadoutOf, withFamilyLoadout } from '../js/meta/skills.js';
import { instance, equip } from '../js/meta/items.js';
import { fxPreference, setFxPreference } from '../js/prefs.js';

const fresh = () => ({ ...trained(createSave({ name: '교체', answers: [0, 0, 0, 0, 0], weapon: 'blade', createdAt: 1 })), gold: 100000 });
const withBow = save => ({ ...save, items: [...save.items, instance('b', 'short_bow')] });
const swap = (save, uid) => withFamilyLoadout(save, equip(save, uid));

test('weapon family swap restores the loadout last set for that family', () => {
  let s = withBow(learnSkill(learnSkill(fresh(), 'whirl'), 'pierce_shot'));
  const sword = s.equipped.weapon;
  s = setSlot(s, 'blade', 1, 'whirl');
  const bladeLoadout = loadoutOf(s);
  s = swap(s, 'b');
  assert.deepEqual(loadoutOf(s), bladeLoadout, 'first time on bow keeps the current slots');
  s = setSlot(s, 'bow', 0, 'pierce_shot');
  s = setSlot(s, 'bow', 1, null);
  const bowLoadout = loadoutOf(s);
  s = swap(s, sword);
  assert.deepEqual(loadoutOf(s), bladeLoadout);
  s = swap(s, 'b');
  assert.deepEqual(loadoutOf(s), bowLoadout);
  assert.ok(validateSave(s));
});

test('same-family swap and armor equip leave the loadout alone', () => {
  const s = setSlot(learnSkill(fresh(), 'whirl'), 'blade', 2, 'whirl');
  const extra = { ...s, items: [...s.items, instance('k', 'iron_sword')] };
  const after = swap(extra, 'k');
  assert.deepEqual(loadoutOf(after), loadoutOf(s));
  assert.equal(after.loadouts, undefined);
});

test('saved per-family loadouts are validated', () => {
  const s = fresh();
  assert.ok(validateSave({ ...s, loadouts: { bow: ['arrow_skill_missing', null, null] } }) === false);
  assert.ok(validateSave({ ...s, loadouts: { nope: [null, null, null] } }) === false);
  assert.ok(validateSave({ ...s, loadouts: { blade: [null, null, null] } }));
});

test('effect preference: stored per device, URL overrides', () => {
  const mem = new Map();
  const storage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  assert.equal(fxPreference('', storage), 'new');
  setFxPreference('classic', storage);
  assert.equal(fxPreference('', storage), 'classic');
  assert.equal(fxPreference('?fx=effekseer', storage), 'new');
  setFxPreference('new', storage);
  assert.equal(fxPreference('?fx=classic', storage), 'classic');
  assert.equal(fxPreference('', null), 'new');
});
