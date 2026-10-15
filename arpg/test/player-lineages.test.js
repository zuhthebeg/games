import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAYER_LINEAGES, playerLineage, playerForm, normalizedWeaponForm, lineageAllowsWeapon } from '../js/content/player-lineages.js';
import { ITEMS, equip, meetsRequirement, instance, capacity, carriedWeight } from '../js/meta/items.js';
import { createSave, validateSave, SaveStore, SAVE_KEY, SAVE_VERSION } from '../js/meta/save.js';
import { addXp } from '../js/meta/progression.js';
import { BOOKS, learnSkill, withFamilyLoadout, weaponLoadoutCandidate } from '../js/meta/skills.js';
import { buyGear, shopStock } from '../js/meta/shop.js';
import { compareItems } from '../js/meta/compare.js';
import { HubUI } from '../js/ui/hub.js';
import { createSlotStorage, SLOT_SAVE_KEYS } from '../js/meta/character-slots.js';
import { trained } from './weapon-loadout-fixture.js';
import { toOldScale } from './fixtures/old-scale.js';

const roles = [
  ['skeleton_mage', 'focus', 'lich', ['wand', 'staff']],
  ['skeleton_knight', 'blade', 'death_knight', ['sword', 'blunt']],
  ['skeleton_archer', 'bow', 'death_archer', ['bow']],
];
const forms = ['sword', 'blunt', 'bow', 'wand', 'staff'];
const fresh = (weapon = 'blade') => createSave({ name: 'Schema', answers: [0, 0, 0, 0, 0], weapon, createdAt: 1 });
function roleSave(lineage, uid) {
  const s = equip(trained(), uid);
  s.lineage = lineage;
  assert.equal(validateSave(s), true, 'registered existing-schema matching fixture');
  return s;
}
function storageFixture(entries = []) {
  const data = new Map(entries), calls = [];
  return { data, calls, storage: {
    getItem(k) { calls.push(['get', k]); return data.get(k) ?? null; },
    setItem(k, v) { calls.push(['set', k]); data.set(k, v); },
    removeItem(k) { calls.push(['remove', k]); data.delete(k); },
  } };
}

test('canonical own-key lineage whitelist and deeply frozen role descriptors', () => {
  assert.deepEqual(Object.keys(PLAYER_LINEAGES), ['human', ...roles.map(r => r[0])]);
  assert.ok(Object.isFrozen(PLAYER_LINEAGES));
  for (const [id, family, evolvedForm, weaponForms] of roles) {
    const def = playerLineage(id);
    assert.equal(def, PLAYER_LINEAGES[id]);
    assert.deepEqual(def, { id, family, baseForm: id, evolvedForm, weaponForms });
    assert.ok(Object.isFrozen(def)); assert.ok(Object.isFrozen(def.weaponForms));
    assert.throws(() => { def.weaponForms.push('bow'); }, TypeError);
  }
  assert.equal(playerLineage().id, 'human');
  assert.equal(playerLineage({ level: 1 }).id, 'human');
  assert.equal(playerLineage('human'), playerLineage({ lineage: 'human' }));
  for (const id of [null, '', 0, false, [], 'lich', 'mage', 'unknown', '__proto__', 'constructor', 'toString']) {
    assert.throws(() => playerLineage(id));
    assert.throws(() => playerLineage({ lineage: id }));
  }
  assert.throws(() => playerLineage({ lineage: undefined }));
});

test('level 1..29 base and exactly 30 boss form are pure, repeated lookups never stack effects', () => {
  for (const [id, , boss] of roles) {
    const s = roleSave(id, id === 'skeleton_mage' ? 'wand' : id === 'skeleton_knight' ? 'sword' : 'bow');
    const before = structuredClone(s);
    for (let repeat = 0; repeat < 3; repeat++) {
      for (let level = 1; level < 30; level++) assert.equal(playerForm(id, level), id);
      assert.equal(playerForm(id, 30), boss);
      assert.equal(playerForm(s), boss);
      assert.equal(playerForm({ ...s, level: 29 }), id);
    }
    assert.deepEqual(s, before);
  }
  for (const level of [1, 29, 30]) assert.equal(playerForm('human', level), 'human');
  assert.equal(playerForm(fresh()), 'human');
  for (const level of [undefined, null, 0, -1, 1.5, 31, NaN, Infinity, '30']) assert.throws(() => playerForm('skeleton_mage', level));
  assert.throws(() => playerForm('lich', 30));
});

test('actual item definitions normalize only implicit sword/bow, with exact family + form policy', () => {
  assert.equal(ITEMS.training_sword.form, undefined); assert.equal(ITEMS.short_bow.form, undefined);
  assert.equal(normalizedWeaponForm(ITEMS.training_sword), 'sword');
  assert.equal(normalizedWeaponForm(ITEMS.short_bow), 'bow');
  assert.equal(normalizedWeaponForm(ITEMS.apprentice_wand), 'wand');
  for (const [id, family, , allowedForms] of roles) {
    for (const def of Object.values(ITEMS).filter(d => d.kind === 'weapon')) {
      assert.equal(lineageAllowsWeapon(id, def), def.family === family && allowedForms.includes(normalizedWeaponForm(def)));
      assert.equal(lineageAllowsWeapon('human', def), true);
      assert.equal(lineageAllowsWeapon({}, def), true);
    }
    for (const form of forms) assert.equal(lineageAllowsWeapon(id, { kind: 'weapon', family, form }), allowedForms.includes(form));
    assert.equal(lineageAllowsWeapon(id, { kind: 'weapon', family: 'focus' }), false);
    assert.equal(lineageAllowsWeapon(id, { kind: 'weapon', family, form: 'axe' }), false);
    assert.equal(lineageAllowsWeapon(id, ITEMS.cloth_tunic), true);
  }
});

test('missing and explicit human retain all five forms and exact SaveStore bytes', () => {
  assert.equal(SAVE_KEY, 'arpg.save.v1'); assert.equal(SAVE_VERSION, 5);
  assert.equal(Object.hasOwn(fresh(), 'lineage'), false);
  for (const explicit of [false, true]) for (const form of forms) {
    const s = equip(trained(), form); if (explicit) s.lineage = 'human';
    assert.equal(validateSave(s), true);
    const raw = JSON.stringify(s), f = storageFixture([[SAVE_KEY, raw]]), store = new SaveStore(f.storage);
    assert.deepEqual(store.load(), s); assert.equal(f.data.get(SAVE_KEY), raw);
    store.save(s); assert.equal(f.data.get(SAVE_KEY), raw);
    assert.equal(Object.hasOwn(store.load(), 'lineage'), explicit);
  }
});

test('v3/v4 migration remains human and does not rewrite original storage', () => {
  for (const version of [3, 4]) {
    const original = fresh(), old = toOldScale(original, version);
    if (version === 3) { delete old.stash; delete old.learned; delete old.skills; }
    const raw = JSON.stringify(old), f = storageFixture([[SAVE_KEY, raw]]);
    const loaded = new SaveStore(f.storage).load();
    assert.deepEqual(loaded, original); assert.equal(validateSave(loaded), true);
    assert.equal(f.data.get(SAVE_KEY), raw); assert.deepEqual(f.calls, [['get', SAVE_KEY]]);
  }
});

test('unknown/nonstring lineage and valid role with contradictory active weapon reject without mutation/write', () => {
  for (const value of [undefined, null, '', 7, false, [], {}, 'lich', 'death_knight', 'death_archer', 'skeleton_rogue', '__proto__', 'constructor']) {
    const s = { ...fresh(), lineage: value }, before = structuredClone(s);
    const f = storageFixture([[SAVE_KEY, 'human bytes']]);
    assert.equal(validateSave(s), false); assert.throws(() => new SaveStore(f.storage).save(s));
    assert.deepEqual(s, before); assert.deepEqual(f.calls, []); assert.equal(f.data.get(SAVE_KEY), 'human bytes');
  }
  for (const [id, , , allowed] of roles) for (const form of forms) {
    const s = equip(trained(), form); s.lineage = id;
    assert.equal(validateSave(s), allowed.includes(form), `${id}:${form}`);
  }
});

for (const [id, family, boss, allowed] of roles) {
  test(`${id}: common preview/equip restriction, armor/carry/history and valid transition`, () => {
    const s = roleSave(id, allowed[0]), before = structuredClone(s);
    for (const form of forms) {
      const def = ITEMS[s.items.find(i => i.uid === form).id];
      assert.equal(meetsRequirement(s, def), allowed.includes(form));
      assert.equal(compareItems(s.items.find(i => i.uid === s.equipped.weapon), s.items.find(i => i.uid === form), s).locked, !allowed.includes(form));
      if (!allowed.includes(form)) {
        assert.throws(() => equip(s, form), /계보/);
        assert.throws(() => withFamilyLoadout(s, equip(s, form)), /계보/);
        assert.throws(() => weaponLoadoutCandidate(s, equip(s, form)), /계보/);
      } else {
        const next = equip(s, form);
        assert.equal(validateSave(next), true);
        assert.deepEqual(withFamilyLoadout(s, next), next);
        for (const keepCurrent of [false, true]) {
          const c = weaponLoadoutCandidate(s, next, { keepCurrent });
          assert.equal(validateSave(c.save), true); assert.deepEqual(c.save.learned, s.learned);
          assert.deepEqual(c.save.skillMastery, s.skillMastery); assert.equal(c.save.gold, s.gold);
        }
      }
      assert.deepEqual(s, before);
    }
    const armored = equip(s, s.equipped.body);
    assert.equal(validateSave(armored), true); assert.deepEqual(armored, s);
    assert.equal(playerForm(s), boss); assert.equal(ITEMS[s.items.find(i => i.uid === s.equipped.weapon).id].family, family);
  });

  test(`${id}: actual shop buy-only allowed; refused buy/equip and cancelled candidates leave gold/source/storage untouched`, () => {
    const s = roleSave(id, allowed[0]), f = storageFixture(), store = new SaveStore(f.storage);
    // Existing deterministic stock need not contain every family on every refresh.
    s.shopRefresh = Array.from({ length: 20 }, (_, n) => n).find(n => {
      const weapons = shopStock(s.createdAt, n).filter(i => ITEMS[i.id].kind === 'weapon');
      return weapons.some(i => lineageAllowsWeapon(s, ITEMS[i.id])) && weapons.some(i => !lineageAllowsWeapon(s, ITEMS[i.id]));
    });
    assert.ok(Number.isInteger(s.shopRefresh));
    store.save(s); const raw = f.data.get(SAVE_KEY), before = structuredClone(s);
    const stock = shopStock(s.createdAt, s.shopRefresh).filter(i => ITEMS[i.id].kind === 'weapon');
    assert.ok(stock.some(i => lineageAllowsWeapon(s, ITEMS[i.id])));
    assert.ok(stock.some(i => !lineageAllowsWeapon(s, ITEMS[i.id])));
    for (const item of stock) {
      const bought = buyGear(s, item.uid), uid = bought.items.at(-1).uid;
      assert.equal(validateSave(bought), true, 'carrying/buying any family stays allowed');
      if (!lineageAllowsWeapon(s, ITEMS[item.id])) {
        assert.throws(() => weaponLoadoutCandidate(s, equip(bought, uid)), /계보/);
      } else {
        const c = weaponLoadoutCandidate(s, equip(bought, uid));
        assert.equal(validateSave(c.save), true); assert.equal(c.save.gold, s.gold - item.price);
        assert.equal(c.save.equipped.weapon, uid);
      }
      assert.deepEqual(s, before); assert.equal(f.data.get(SAVE_KEY), raw, 'cancel/refusal never commits candidate');
    }
  });

  test(`${id}: isolated JSON roundtrip at 29/30 preserves raw counters, receipt and all family memories`, () => {
    const s = roleSave(id, allowed[0]);
    s.weaponLoadouts = { 'blade:sword': ['lunge', null, 'whirl'], 'blade:blunt': ['ground_slam', null, 'armor_break'],
      'bow:bow': ['volley', null, 'pierce_shot'], 'focus:wand': ['ember_bolt', null, 'frost_lance'], 'focus:staff': ['healing_light', 'flame_ring', null] };
    s.loadouts = { blade: ['lunge', null, 'whirl'], bow: ['volley', null, null], focus: ['healing_light', null, null] };
    s.completedRounds = 17; s.enchantCount = 8; s.quests = { QF1: { state: 'active', progress: 17, last: 123 } };
    s.lastReceipt = { stageId: 'S1', terminal: 'clear', depositedXp: 0, xpForfeited: 0, stageXp: 50,
      levelsGained: 0, statPointsGained: 0, goldGained: 0, xpGained: 0, xpLost: 0, xpDiscarded: 50,
      firstClear: true, pityGranted: false, used: {}, restored: {}, masteryRises: [{ id: 'lunge', level: 30 }],
      lootKept: { gold: 0, stacks: {}, items: [] }, lootLost: { gold: 0, stacks: {}, items: [] } };
    const humanRaw = JSON.stringify(fresh()), f = storageFixture([[SAVE_KEY, humanRaw], [`${SAVE_KEY}.corrupt.9`, 'human diagnostic']]);
    const store = new SaveStore(createSlotStorage(f.storage, id));
    const s29 = addXp({ ...s, level: 29, statPoints: s.statPoints - 8 }, 0);
    assert.equal(validateSave(s29), true); store.save(s29); assert.deepEqual(store.load(), s29); assert.equal(playerForm(store.load()), id);
    store.save(s); const before = structuredClone(s);
    for (let n = 0; n < 3; n++) { const loaded = store.load(); assert.deepEqual(loaded, before); assert.equal(playerForm(loaded), boss); }
    assert.equal(f.data.get(SLOT_SAVE_KEYS[id]), JSON.stringify(s));
    assert.equal(f.data.get(SAVE_KEY), humanRaw); assert.equal(f.data.get(`${SAVE_KEY}.corrupt.9`), 'human diagnostic');
    assert.ok(f.calls.every(([, key]) => key === SLOT_SAVE_KEYS[id]));
  });
}

test('lineage restriction does not replace strength/capacity validation or book-learning rules', () => {
  const s = fresh(); s.lineage = 'skeleton_knight'; s.items.push(instance('maul', 'chief_maul', 0, []));
  const before = structuredClone(s); assert.throws(() => equip(s, 'maul'), /힘 52/); assert.deepEqual(s, before);
  const strong = roleSave('skeleton_knight', 'sword');
  strong.stacks.potion = Math.floor((capacity(strong) * 1.2 - carriedWeight(strong)) / ITEMS.potion.weight);
  assert.ok(carriedWeight(strong) <= capacity(strong) * 1.2);
  const loaded = structuredClone(strong); assert.throws(() => equip(strong, 'blunt'), /120%/); assert.deepEqual(strong, loaded);
  const human = trained(); human.learned = []; human.stats.int = 30; human.statPoints -= 20;
  const skeleton = { ...structuredClone(human), lineage: 'skeleton_knight' };
  assert.deepEqual(learnSkill(skeleton, 'healing_light'), { ...learnSkill(human, 'healing_light'), lineage: 'skeleton_knight' });
  assert.ok(Object.hasOwn(BOOKS, 'healing_light'));
});

// Existing transaction methods under a minimal in-memory DOM stub; no browser/storage API.
test('actual HubUI entry points reject mismatches before pending/save/purchase; allowed drafts cancel or commit once', () => {
  const oldDocument = globalThis.document;
  globalThis.document = { activeElement: null };
  try {
    for (const [id, , , allowed] of roles) {
      const s = roleSave(id, allowed[0]);
      const h = Object.create(HubUI.prototype);
      h.save = s; h.root = { dataset: { page: 'bag' }, querySelector: () => null };
      h.persisted = []; h.persist = next => { assert.equal(validateSave(next), true); h.persisted.push(next); };
      h.mountSheet = () => null; h.returnToPanel = () => {}; h.showReceipt = () => {}; h.showMerchant = () => {}; h.lootState = {};
      const original = structuredClone(s);
      const denied = forms.find(form => !allowed.includes(form));
      for (const action of ['equip', 'loot-equip']) {
        assert.throws(() => h.action(action, { uid: denied }), /계보/);
        assert.deepEqual(h.save, original); assert.equal(h.pendingEquipment, undefined); assert.deepEqual(h.persisted, []);
      }
      const deniedStock = shopStock(s.createdAt, s.shopRefresh).find(item => ITEMS[item.id].kind === 'weapon' && !lineageAllowsWeapon(s, ITEMS[item.id]));
      assert.ok(deniedStock);
      assert.throws(() => h.action('buy-equip', { uid: deniedStock.uid }), /계보/);
      assert.deepEqual(h.save, original); assert.deepEqual(h.persisted, []); assert.equal(h.pendingEquipment, undefined);
      // Distinct UID even for the archer's single form; exercises the real confirmation path.
      h.save.items.push({ ...h.save.items.find(item => item.uid === allowed.at(-1)), uid: 'allowed-copy' });
      const before = structuredClone(h.save);
      h.action('equip', { uid: 'allowed-copy' }); assert.ok(h.pendingEquipment);
      assert.deepEqual(h.save, before); assert.deepEqual(h.persisted, []);
      h.action('weapon-cancel', {}); assert.deepEqual(h.save, before); assert.deepEqual(h.persisted, []);
      h.action('equip', { uid: 'allowed-copy' }); const token = String(h.pendingEquipment.token);
      h.action('weapon-confirm', { token }); h.action('weapon-confirm', { token });
      assert.equal(h.persisted.length, 1); assert.equal(h.save.equipped.weapon, 'allowed-copy');
      assert.equal(h.save.gold, before.gold); assert.deepEqual(h.save.learned, before.learned);
    }
  } finally {
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
  }
});

test('invalid new-lineage read uses only the existing slot quarantine; no human reset/repair or added migration', () => {
  for (const [id, , , allowed] of roles) {
    const invalid = roleSave(id, allowed[0]);
    invalid.equipped.weapon = forms.find(form => !allowed.includes(form));
    const raw = JSON.stringify(invalid);
    const entries = Object.values(SLOT_SAVE_KEYS).map(key => [key, key === SLOT_SAVE_KEYS[id] ? raw : `preserved:${key}`]);
    entries.push([`${SAVE_KEY}.corrupt.99`, 'human diagnostic']);
    const f = storageFixture(entries), before = new Map(f.data);
    assert.equal(new SaveStore(createSlotStorage(f.storage, id), () => 99).load(), null);
    assert.equal(f.data.get(`${SLOT_SAVE_KEYS[id]}.corrupt.99`), raw);
    assert.equal(f.data.has(SLOT_SAVE_KEYS[id]), false);
    for (const [key, value] of before) if (key !== SLOT_SAVE_KEYS[id]) assert.equal(f.data.get(key), value);
    assert.deepEqual(f.calls, [['get', SLOT_SAVE_KEYS[id]], ['set', `${SLOT_SAVE_KEYS[id]}.corrupt.99`], ['remove', SLOT_SAVE_KEYS[id]]]);
  }
});
