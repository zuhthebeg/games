import test from 'node:test';
import assert from 'node:assert/strict';
import { createSave, SaveStore, SAVE_KEY, validateSave, SAVE_VERSION } from '../js/meta/save.js';
import { ITEMS, CONSUMABLES, buy, carriedWeight, capacity, moveConsumable } from '../js/meta/items.js';
import { ECONOMY } from '../js/meta/economy.js';
import { stackSellPrice, sellStack } from '../js/meta/shop.js';
import { BOOKS, DEFAULT_SKILLS, hasSkill, learnSkill, equipSkill } from '../js/meta/skills.js';
import { buildRoundMods, settleRound } from '../js/meta/run.js';
import { instance, equip } from '../js/meta/items.js';

const fresh = () => createSave({ name: '여관 시험', answers: [0, 0, 0, 0, 0], createdAt: 1 });
const rich = () => ({ ...fresh(), gold: 10000 });

test('all materials have positive integer sell prices; consumables sell at base-price fraction', () => {
  for (const [id, def] of Object.entries(ITEMS).filter(([, d]) => d.kind === 'material')) {
    assert.ok(Number.isSafeInteger(def.sell) && def.sell > 0, id);
    assert.equal(stackSellPrice(id), def.sell);
  }
  for (const id of CONSUMABLES) assert.equal(stackSellPrice(id), Math.floor(ITEMS[id].price * ECONOMY.sellFraction));
  assert.throws(() => stackSellPrice('training_sword'));
  assert.throws(() => stackSellPrice('toString'));
});

test('sell 1/5/all from bag, stash, and materials without mutating the input; invalid counts rejected', () => {
  const base = rich(); base.stacks.scrap = 8; base.stacks.potion = 8; base.stash.stacks.potion = 8;
  for (const [id, source] of [['scrap', 'bag'], ['potion', 'bag'], ['potion', 'stash']]) {
    for (const count of [1, 5, 8]) {
      const next = sellStack(base, id, count, source);
      assert.equal((source === 'stash' ? next.stash.stacks : next.stacks)[id], 8 - count);
      assert.equal(next.gold, base.gold + stackSellPrice(id) * count);
      assert.equal((source === 'stash' ? base.stash.stacks : base.stacks)[id], 8);
    }
    for (const count of [0, -1, 1.5, 9, NaN]) assert.throws(() => sellStack(base, id, count, source));
  }
  assert.throws(() => sellStack(base, 'scrap', 1, 'stash'));
  assert.throws(() => sellStack(base, 'potion', 1, 'other'));
  assert.throws(() => sellStack(base, 'nope', 1));
});

test('buy refuses above 100% capacity, accepts exact capacity, and gear/stash/materials have no carry weight', () => {
  const base = rich(); base.stacks = { potion: 0, mana_potion: 0, return_scroll: 0 };
  const room = Math.floor((capacity(base) - carriedWeight(base)) / ITEMS.potion.weight);
  const filled = buy(base, 'potion', room);
  assert.equal(carriedWeight(filled), capacity(filled));
  assert.throws(() => buy(filled, 'potion'), /100%/);
  assert.throws(() => buy(base, 'potion', room + 1), /100%/);
  filled.stash.stacks.potion = 999; filled.stacks.scrap = 999;
  filled.items.push(instance('stored', 'chief_maul'));
  assert.equal(carriedWeight(filled), capacity(filled));
  assert.equal(base.stacks.potion, 0);
});

test('stash moves 1/5/all, bag weight/cap are enforced only on withdrawal; scrolls have no count cap', () => {
  const base = rich(); base.stacks.potion = 8;
  for (const count of [1, 5, 8]) {
    const stored = moveConsumable(base, 'potion', count, 'stash');
    assert.equal(stored.stacks.potion, 8 - count); assert.equal(stored.stash.stacks.potion, count);
    assert.equal(carriedWeight(stored), Math.round((carriedWeight(base) - count * ITEMS.potion.weight) * 1000) / 1000);
    assert.deepEqual(moveConsumable(stored, 'potion', count, 'bag'), { ...base, stash: { stacks: { potion: 0 } } });
  }
  const empty = { ...base, stacks: { potion: 0, mana_potion: 0, return_scroll: 0 } };
  const full = buy(empty, 'potion', Math.floor((capacity(empty) - carriedWeight(empty)) / ITEMS.potion.weight));
  full.stash.stacks.potion = 10;
  assert.throws(() => moveConsumable(full, 'potion', 1, 'bag'), /100%/);
  assert.doesNotThrow(() => moveConsumable(full, 'potion', 5, 'stash'));
  base.stash.stacks.return_scroll = 5;
  const scrolls = moveConsumable(base, 'return_scroll', 1, 'bag');
  assert.equal(moveConsumable(scrolls, 'return_scroll', 4, 'bag').stacks.return_scroll, 6);
  for (const count of [0, -1, 1.5, 9]) assert.throws(() => moveConsumable(base, 'potion', count, 'stash'));
  assert.throws(() => moveConsumable(base, 'scrap', 1, 'stash'));
  assert.throws(() => moveConsumable(base, 'potion', 1, 'other'));
  assert.equal(buildRoundMods(full).potions, full.stacks.potion);
  const settled = settleRound(full, { stageId: 'S2', terminal: 'return_scroll', tempLoot: { gold: 0, stacks: {}, items: [] } });
  assert.deepEqual(settled.save.stash, full.stash);
});

test('books permanently learn at exact prices, defaults always known, equip per family with no level gate', () => {
  let base = rich();
  assert.deepEqual(Object.fromEntries(Object.entries(BOOKS).map(([id, b]) => [id, b.price])), { whirl:150, heavy_cleave:250, pierce_shot:150, blast_arrow:250, healing_light:200, frost_lance:180, flame_ring:280 });
  for (const [family, id] of Object.entries(DEFAULT_SKILLS)) {
    assert.equal(hasSkill(base, id), true); assert.equal(equipSkill(base, family, id).skills[family], id);
  }
  for (const [id, book] of Object.entries(BOOKS)) {
    const next = learnSkill(base, id);
    assert.equal(next.gold, base.gold - book.price); assert.ok(next.learned.includes(id));
    assert.equal(base.learned.includes(id), false); assert.equal(carriedWeight(next), carriedWeight(base));
    assert.deepEqual(next.stacks, base.stacks); assert.deepEqual(next.items, base.items);
    assert.throws(() => learnSkill(next, id), /이미/);
    base = equipSkill(next, book.family, id); assert.equal(base.skills[book.family], id);
    assert.ok(validateSave(base));
  }
  assert.throws(() => learnSkill(fresh(), 'whirl'), /골드/);
  assert.throws(() => learnSkill(base, 'nope'));
  assert.throws(() => learnSkill(base, 'lunge'));
  assert.throws(() => equipSkill(fresh(), 'blade', 'whirl'), /배우지/);
  assert.throws(() => equipSkill(base, 'blade', 'frost_lance'));
  assert.throws(() => equipSkill(base, 'other', 'whirl'));
  assert.throws(() => equipSkill(base, 'blade', 'slash'));
  assert.equal(buildRoundMods(base).skills[0], base.skills.blade);
  for (const [family, weapon] of [['bow','short_bow'], ['focus','apprentice_wand']]) {
    base.items.push(instance(family, weapon)); base = equip(base, family);
    assert.equal(buildRoundMods(base).skills[0], base.skills[family]);
  }
});

test('v3 migrates to v4 preserving all old fields; malformed new fields and invalid learned/equipped skills fail validation', () => {
  const old = rich(); old.version = 3; delete old.stash; delete old.learned; delete old.skills;
  const data = new Map([[SAVE_KEY, JSON.stringify(old)]]);
  const store = new SaveStore({ getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k) });
  const loaded = store.load();
  assert.equal(SAVE_VERSION, 4);
  assert.deepEqual(loaded, { ...old, version: 4, stash: { stacks: {} }, learned: [], skills: {} });
  assert.ok(validateSave(loaded)); store.save(loaded); assert.equal(JSON.parse(data.get(SAVE_KEY)).version, 4);
  for (const change of [
    s => s.stash.stacks.scrap = 1, s => s.stash.stacks.potion = -1,
    s => s.learned = ['nope'], s => s.learned = ['lunge'], s => s.learned = ['whirl','whirl'],
    s => s.skills.blade = 'whirl', s => s.skills.bow = 'lunge', s => s.skills.other = 'lunge',
  ]) { const bad = structuredClone(loaded); change(bad); assert.equal(validateSave(bad), false); }
  loaded.stash.stacks.return_scroll = 1000; loaded.skills.blade = 'lunge'; assert.ok(validateSave(loaded));
});
