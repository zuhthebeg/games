import test from 'node:test';
import assert from 'node:assert/strict';
import { createSave, validateSave } from '../js/meta/save.js';
import { createTracker, trackRound, settleRound } from '../js/meta/run.js';
import { CharacterStores } from '../js/meta/selected-character.js';
import { createSkeletonSave } from '../js/meta/character-creation.js';
import { SLOT_SAVE_KEYS } from '../js/meta/character-slots.js';
import { recipeRevealed, noteMaterials } from '../js/meta/recipe-discovery.js';
import { RECIPES, craft } from '../js/meta/items.js';
import { sellStack } from '../js/meta/shop.js';
import { HubUI } from '../js/ui/hub.js';

const fresh = () => createSave({ name: '발견', answers: [0, 0, 0, 0, 0], weapon: 'blade', createdAt: 7 });
function storageFixture() {
  const data = new Map();
  return { data, fail: false,
    getItem(key) { return data.get(key) ?? null; },
    setItem(key, value) { if (this.fail) throw new Error('storage full'); data.set(key, value); },
    removeItem(key) { data.delete(key); },
  };
}
function hubFor(chars, save) {
  return Object.assign(Object.create(HubUI.prototype), {
    save, persist: next => chars.persist(next), forgeTab: 'craft', forgeRecipeMode: 'all',
    forgeRecipeKind: 'all', forgeRecipeSet: 'all', shopTab: 'sell',
    showInnPanel(_title, body) { this.html = body; },
  });
}
function humanHub(save) {
  const storage = storageFixture(), chars = new CharacterStores(storage);
  chars.selectHuman(); chars.persist(save);
  return { storage, chars, hub: hubFor(chars, chars.selectHuman()) };
}
function assertVisible(hub, id) {
  assert.equal(recipeRevealed(hub.save, id), true, 'recipe remains revealed');
  hub.showForge();
  assert.ok(hub.html.includes('data-recipe-id="' + id + '"'), 'all-revealed forge HTML retains recipe');
}
function withoutHistory(save) {
  const { seenMaterials: _history, ...rest } = save;
  return JSON.stringify(rest);
}

// Audit9: real deterministic drop -> settlement -> direct persistence, no prior Hub commit.
test('first full sale after settlement preserves discovery and all-revealed HTML through reload', () => {
  const base = fresh();
  for (const id of ['S1', 'S2', 'S3', 'S4']) base.cleared[id] = true;
  base.flags.chiefPity = true;
  const event = { type: 'kill', id: 100, monster: 'wolf', stageId: 'S5', threat: 1, elite: false, xp: 0, x: 500, y: 400 };
  const { tracker } = trackRound(base, createTracker(41), [event]);
  const result = settleRound(base, { stageId: 'S5', terminal: 'return_scroll', depositedXp: tracker.depositedXp, tempLoot: tracker.tempLoot });
  assert.equal(result.save.seenMaterials, undefined);
  assert.equal(result.save.stacks.hide, 3);
  const { hub, chars } = humanHub(result.save);
  assertVisible(hub, 'leather_vest');
  hub.showShop();
  assert.match(hub.html, /data-id="hide" data-source="bag" data-count="3"/);
  const before = structuredClone(hub.save), count = before.stacks.hide;
  const oldCommitOutput = noteMaterials(sellStack(before, 'hide', count, 'bag'));
  hub.action('sell-stack', { id: 'hide', count: String(count), source: 'bag' });
  assert.equal(hub.save.stacks.hide, 0);
  assert.equal(hub.save.gold, before.gold + count * 2);
  assert.equal(withoutHistory(hub.save), withoutHistory(oldCommitOutput), 'all other save bytes unchanged');
  assertVisible(hub, 'leather_vest');
  hub.save = chars.selectHuman();
  assert.ok(validateSave(hub.save));
  assertVisible(hub, 'leather_vest');
  assert.deepEqual(hub.save.seenMaterials, ['fang', 'hide', 'wood']);
});

for (const history of [undefined, [], ['hide'], ['silver_ingot']]) {
  for (const count of [1, 3]) {
    test('sale records pre-consumption history: history=' + JSON.stringify(history) + ', count=' + count, () => {
      const save = fresh(); save.stacks.hide = 3;
      if (history !== undefined) save.seenMaterials = history;
      const { hub, chars } = humanHub(save), before = structuredClone(hub.save);
      const expected = noteMaterials(sellStack(before, 'hide', count, 'bag'));
      hub.action('sell-stack', { id: 'hide', count: String(count), source: 'bag' });
      assert.equal(withoutHistory(hub.save), withoutHistory(expected));
      assert.deepEqual(hub.save.seenMaterials, [...new Set([...(history || []), 'hide'])].sort());
      assert.deepEqual(save, before, 'input save not mutated');
      hub.save = chars.selectHuman(); assertVisible(hub, 'leather_vest');
    });
  }
}

test('first craft consuming all recipe materials preserves discovery, output rolls and reload sequence', () => {
  const save = fresh(), recipe = RECIPES.leather_vest;
  save.stacks = Object.fromEntries(Object.entries(recipe).filter(([id]) => id !== 'gold'));
  save.gold = recipe.gold;
  const { hub, chars } = humanHub(save), before = structuredClone(hub.save);
  const expected = noteMaterials(craft(before, 'leather_vest'));
  assertVisible(hub, 'leather_vest');
  hub.action('craft', { id: 'leather_vest' });
  for (const id of Object.keys(recipe).filter(id => id !== 'gold')) assert.equal(hub.save.stacks[id], 0);
  assert.equal(hub.save.gold, 0);
  assert.equal(withoutHistory(hub.save), withoutHistory(expected), 'resources, items, rolls and craftCount unchanged');
  assert.deepEqual(hub.save.seenMaterials, ['hide', 'scrap']);
  assert.deepEqual(save, before);
  assertVisible(hub, 'leather_vest');
  hub.save = chars.selectHuman(); assertVisible(hub, 'leather_vest');
  const replenish = s => ({ ...s, gold: recipe.gold, stacks: { ...s.stacks, hide: recipe.hide, scrap: recipe.scrap } });
  assert.equal(withoutHistory(craft(replenish(hub.save), 'leather_vest')), withoutHistory(craft(replenish(expected), 'leather_vest')), 'next deterministic craft unchanged');
});

test('commit unions prior inventory/history with next existing history and newly obtained material', () => {
  const save = fresh(); save.stacks.hide = 1; save.seenMaterials = ['fang'];
  const { hub, chars } = humanHub(save), before = structuredClone(hub.save);
  const next = { ...hub.save, stacks: { ...hub.save.stacks, hide: 0, wood: 2, potion: 4 }, seenMaterials: ['silver_ingot'] };
  const nextBytes = JSON.stringify(next), expected = noteMaterials(next);
  hub.commit(next);
  assert.deepEqual(hub.save.seenMaterials, ['fang', 'hide', 'silver_ingot', 'wood']);
  assert.equal(withoutHistory(hub.save), withoutHistory(expected));
  assert.equal(JSON.stringify(next), nextBytes, 'next is not mutated');
  assert.deepEqual(save, before, 'previous is not mutated');
  assert.deepEqual(chars.selectHuman().seenMaterials, hub.save.seenMaterials);
});

test('newly obtained material is recorded without a previous save; empty legacy history stays optional', () => {
  for (const previous of [null, undefined]) {
    let saved;
    const hub = hubFor({ persist(next) { saved = next; } }, previous), save = fresh();
    hub.commit(save);
    assert.equal(saved, save, 'material-free creation keeps existing object and absent history');
    assert.equal(saved.seenMaterials, undefined);
    hub.commit({ ...save, stacks: { ...save.stacks, wood: 1 } });
    assert.deepEqual(saved.seenMaterials, ['wood']);
  }
  const empty = { ...fresh(), seenMaterials: [] }, { hub } = humanHub(empty);
  const next = hub.save; hub.commit(next); assert.equal(hub.save, next);
});

test('human and skeleton selected slots keep independent discoveries across switches', () => {
  const { storage, chars, hub } = humanHub({ ...fresh(), stacks: { hide: 1 } });
  hub.action('sell-stack', { id: 'hide', count: '1', source: 'bag' });
  assert.deepEqual(hub.save.seenMaterials, ['hide']);
  const humanRaw = storage.getItem(SLOT_SAVE_KEYS.human);
  chars.selectKnight();
  const knight = createSkeletonSave({ lineage: 'skeleton_knight', name: '해골', answers: [0, 0, 0, 0, 0], createdAt: 8 });
  knight.stacks.fang = 1; chars.persist(knight);
  hub.save = chars.selectKnight();
  hub.action('sell-stack', { id: 'fang', count: '1', source: 'bag' });
  assert.deepEqual(hub.save.seenMaterials, ['fang']);
  assert.equal(recipeRevealed(hub.save, 'leather_vest'), false);
  assert.equal(storage.getItem(SLOT_SAVE_KEYS.human), humanRaw);
  const knightRaw = storage.getItem(SLOT_SAVE_KEYS.skeleton_knight);
  hub.save = chars.selectHuman(); hub.commit(hub.save);
  assert.deepEqual(hub.save.seenMaterials, ['hide']);
  assert.equal(storage.getItem(SLOT_SAVE_KEYS.skeleton_knight), knightRaw);
  assertVisible(hub, 'leather_vest');
});

test('failed persistence leaves current save, candidate and stored bytes untouched', () => {
  const save = fresh(); save.stacks.hide = 1;
  const { storage, hub } = humanHub(save), current = hub.save;
  const currentBytes = JSON.stringify(current), raw = storage.getItem(SLOT_SAVE_KEYS.human);
  const next = sellStack(current, 'hide', 1, 'bag'), nextBytes = JSON.stringify(next);
  storage.fail = true;
  assert.throws(() => hub.commit(next), /storage full/);
  assert.equal(hub.save, current);
  assert.equal(JSON.stringify(current), currentBytes);
  assert.equal(JSON.stringify(next), nextBytes);
  assert.equal(storage.getItem(SLOT_SAVE_KEYS.human), raw);
  storage.fail = false;
  hub.commit(next);
  assert.deepEqual(hub.save.seenMaterials, ['hide']);
});
