import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as economy from '../js/meta/economy.js';
import * as enchantModule from '../js/meta/enchant.js';
import { ENCHANT, GREATER_STONE_EQUIVALENT, STONE } from '../js/meta/economy.js';
import { ITEMS, instance, dismantle, dismantleStones, rollDrops } from '../js/meta/items.js';
import { createSave, SaveStore, SAVE_KEY, validateSave, migrateGreaterStones } from '../js/meta/save.js';
import { settleRound, emptyLoot } from '../js/meta/run.js';
import { readKnight } from '../js/meta/initial-characters.js';
import { createSkeletonSave } from '../js/meta/character-creation.js';
import { SLOT_SAVE_KEYS } from '../js/meta/character-slots.js';
import { legacyCases, digest } from './fixtures/greater-stone-drop-cases.js';

const OLD = 'enhance_stone_3';
const fresh = (createdAt = 7) => createSave({ name: '상급 환산', answers: [0, 0, 0, 0, 0], createdAt });
const memory = (raw) => {
  const data = new Map(raw === undefined ? [] : [[SAVE_KEY, raw]]);
  return { data, storage: { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: (k) => data.delete(k) } };
};
const load = (save) => { const m = memory(JSON.stringify(save)); return { ...m, loaded: new SaveStore(m.storage, () => 99).load() }; };
const withReceipt = (terminal, stacks) => {
  const loot = emptyLoot(); loot.stacks = stacks;
  return settleRound(fresh(), { stageId: 'S1', terminal, tempLoot: loot }).save;
};

test('greater stone constant is retired in favour of the 38-stone equivalent; crack is gone; legacy item definition stays', () => {
  assert.equal(GREATER_STONE_EQUIVALENT, 38);
  assert.equal(Object.hasOwn(economy, 'GREATER_STONE'), false);
  assert.equal(Object.hasOwn(enchantModule, 'crackGreaterStone'), false);
  assert.equal(Object.hasOwn(ENCHANT, 'greaterYield'), false);
  assert.equal(ITEMS[OLD].kind, 'material');
  assert.match(readFileSync(new URL('../js/meta/items.js', import.meta.url), 'utf8'), /Deprecated[^\n]*\n[^\n]*\nITEMS\.enhance_stone_3/);
});

test('exact RNG-stream projection: every legacy drop equals new drop with greater -> 38 plain stones, all else identical', () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/greater-stone-drops-legacy.json', import.meta.url), 'utf8'));
  let index = 0, greaterCases = 0, plainCases = 0;
  for (const { monster, seed, ctx } of legacyCases()) {
    const [plain, greater, rest] = fixture[index++];
    const loot = rollDrops(monster, seed, ctx), label = `${monster} ${seed} ${JSON.stringify(ctx)}`;
    assert.equal(Object.hasOwn(loot.stacks, OLD), false, label);
    assert.equal(loot.stacks[STONE] || 0, plain + greater * 38, label);
    assert.equal(digest(loot), rest, label);
    if (greater) greaterCases++; if (plain) plainCases++;
  }
  assert.equal(index, fixture.length);
  assert.ok(greaterCases > 200 && plainCases > 1000, `coverage ${greaterCases}/${plainCases}`);
});

test('dismantleStones pays only plain stones: old plain table plus old greater table x 38', () => {
  for (let level = 0; level <= ENCHANT.max; level++) {
    const item = { ...instance(`s:${level}`, 'iron_sword', 1, []), enhance: level };
    const expected = ENCHANT.dismantleStones[level] + ENCHANT.dismantleGreater[level] * 38;
    assert.deepEqual(dismantleStones(item), { [STONE]: expected });
    const base = fresh(); base.items.push(item);
    const next = dismantle(base, item.uid);
    assert.equal(next.stacks[STONE] || 0, (base.stacks[STONE] || 0) + expected);
    assert.equal(Object.hasOwn(next.stacks, OLD), false);
    assert.ok(validateSave(next));
  }
});

test('failure refund keeps the pre-conversion balance: floor(plain dismantle table x failRefund), not the converted total', () => {
  const save = fresh(); save.stacks[STONE] = 10;
  for (let level = 0; level <= ENCHANT.max; level++) {
    const base = { ...save, items: save.items.map((item) => item.uid === 'starter:weapon' ? { ...item, enhance: level } : item) };
    const preview = enchantModule.enchantPreview(base, 'starter:weapon', STONE);
    assert.deepEqual(preview.refund, { [STONE]: Math.floor(ENCHANT.dismantleStones[level] * ENCHANT.failRefund) }, `+${level}`);
  }
  // +9 would refund 47 stones of the new 94-stone dismantle total; it must stay 9.
  const nine = { ...save, items: save.items.map((item) => item.uid === 'starter:weapon' ? { ...item, enhance: 9 } : item) };
  assert.equal(enchantModule.enchantPreview(nine, 'starter:weapon', STONE).refund[STONE], 9);
  assert.equal(dismantleStones({ enhance: 9 })[STONE], 18 + 2 * 38);
});

test('SaveStore.load converts bag stacks and a zero count, deletes the key, and is idempotent', () => {
  const legacy = fresh(); legacy.stacks[STONE] = 5; legacy.stacks[OLD] = 3;
  const { loaded, data } = load(legacy);
  assert.equal(loaded.stacks[STONE], 5 + 3 * 38); assert.equal(Object.hasOwn(loaded.stacks, OLD), false);
  assert.ok(validateSave(loaded));
  assert.deepEqual([...data.keys()], [SAVE_KEY]);
  assert.deepEqual(load(loaded).loaded, loaded);
  assert.equal(migrateGreaterStones(loaded), loaded);

  const zero = fresh(); zero.stacks[OLD] = 0;
  const z = load(zero).loaded;
  assert.equal(Object.hasOwn(z.stacks, OLD), false); assert.equal(z.stacks[STONE] || 0, 0); assert.ok(validateSave(z));

  const noPlain = fresh(); noPlain.stacks[OLD] = 2;
  assert.equal(load(noPlain).loaded.stacks[STONE], 76);
});

test('real persisted receipts (kept and lost) migrate, and legacy mid stones still compose', () => {
  const kept = withReceipt('clear', { [OLD]: 2, [STONE]: 1 });
  assert.equal(kept.lastReceipt.lootKept.stacks[OLD], 2);
  kept.stacks[OLD] = 1; kept.stacks.enhance_stone_2 = 1;
  const k = load(kept).loaded;
  assert.equal(k.lastReceipt.lootKept.stacks[STONE], 1 + 76); assert.equal(Object.hasOwn(k.lastReceipt.lootKept.stacks, OLD), false);
  // 1 plain stone banked by the settled receipt + 38 for the held greater + 2 for the legacy mid stone.
  assert.equal(k.stacks[STONE], 1 + 38 + 2); assert.equal(Object.hasOwn(k.stacks, OLD), false);
  assert.ok(validateSave(k)); assert.deepEqual(load(k).loaded, k);

  const lost = withReceipt('death', { [OLD]: 4 });
  assert.equal(lost.lastReceipt.lootLost.stacks[OLD], 4);
  const l = load(lost).loaded;
  assert.equal(l.lastReceipt.lootLost.stacks[STONE], 152); assert.equal(Object.hasOwn(l.lastReceipt.lootLost.stacks, OLD), false);
  assert.deepEqual(l.lastReceipt.lootKept.stacks, {}); assert.ok(validateSave(l));

  const both = withReceipt('clear', { [OLD]: 1 });
  both.lastReceipt.lootLost.stacks[OLD] = 0;
  const b = load(both).loaded;
  assert.equal(b.lastReceipt.lootKept.stacks[STONE], 38);
  assert.deepEqual(b.lastReceipt.lootLost.stacks, {});
});

test('unrelated save content is untouched by the migration (only the stone stacks differ)', () => {
  const legacy = withReceipt('clear', { [OLD]: 1, scrap: 3 }); legacy.stacks[OLD] = 2;
  const loaded = load(legacy).loaded, expected = structuredClone(legacy);
  expected.stacks[STONE] = (expected.stacks[STONE] || 0) + 76; delete expected.stacks[OLD];
  expected.lastReceipt.lootKept.stacks[STONE] = 38; delete expected.lastReceipt.lootKept.stacks[OLD];
  for (const key of ['autoBuy', 'autoUse', 'skillMastery', 'loadout']) delete loaded[key];
  for (const key of ['autoBuy', 'autoUse', 'skillMastery', 'loadout']) delete expected[key];
  assert.deepEqual(loaded, expected);
});

test('malformed or overflowing counts are never accepted: original bytes are backed up and the slot is cleared', () => {
  const cases = [];
  const mutate = (label, edit) => { const save = fresh(); edit(save); cases.push([label, save]); };
  mutate('negative', (s) => { s.stacks[OLD] = -1; });
  mutate('fraction', (s) => { s.stacks[OLD] = 1.5; });
  mutate('string', (s) => { s.stacks[OLD] = '2'; });
  mutate('stack overflow', (s) => { s.stacks[STONE] = Number.MAX_SAFE_INTEGER - 10; s.stacks[OLD] = 1; });
  mutate('huge greater', (s) => { s.stacks[OLD] = Number.MAX_SAFE_INTEGER; });
  mutate('plain malformed', (s) => { s.stacks[STONE] = -3; s.stacks[OLD] = 1; });
  for (const [label, kind] of [['kept', 'lootKept'], ['lost', 'lootLost']]) {
    mutate(`receipt ${label} overflow`, (s) => { Object.assign(s, withReceipt('clear', {})); s.lastReceipt[kind].stacks[STONE] = Number.MAX_SAFE_INTEGER; s.lastReceipt[kind].stacks[OLD] = 1; });
    mutate(`receipt ${label} negative`, (s) => { Object.assign(s, withReceipt('clear', {})); s.lastReceipt[kind].stacks[OLD] = -2; });
  }
  mutate('stash (consumables only)', (s) => { s.stash.stacks[OLD] = 1; });
  for (const [label, save] of cases) {
    const raw = JSON.stringify(save), { data, storage } = memory(raw);
    assert.equal(validateSave(migrateGreaterStones(save)), false, label);
    assert.equal(new SaveStore(storage, () => 99).load(), null, label);
    assert.equal(data.get(`${SAVE_KEY}.corrupt.99`), raw, label);
    assert.equal(data.has(SAVE_KEY), false, label);
  }
});

test('migration clones: the input object is never mutated', () => {
  const legacy = withReceipt('clear', { [OLD]: 2 }); legacy.stacks[OLD] = 1;
  const before = JSON.stringify(legacy);
  const next = migrateGreaterStones(legacy);
  assert.equal(JSON.stringify(legacy), before); assert.notEqual(next, legacy);
});

test('skeleton knight slot also converts stacks and receipts when read, leaving the human slot alone', () => {
  const options = { lineage: 'skeleton_knight', name: '상급 기사', answers: [1, 2, 3, 0, 2], createdAt: 123 };
  const base = createSkeletonSave(options);
  const legacy = structuredClone(base); legacy.stacks[OLD] = 2;
  const receipt = settleRound(base, { stageId: 'S1', terminal: 'clear', tempLoot: { ...emptyLoot(), stacks: { [OLD]: 3 } } }).save;
  legacy.lastReceipt = receipt.lastReceipt;
  const data = new Map([[SLOT_SAVE_KEYS.skeleton_knight, JSON.stringify(legacy)]]);
  const writes = [];
  const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { writes.push(k); data.set(k, v); }, removeItem() { assert.fail('remove'); } };
  const knight = readKnight(storage);
  assert.equal(knight.stacks[STONE], 76); assert.equal(Object.hasOwn(knight.stacks, OLD), false);
  assert.equal(knight.lastReceipt.lootKept.stacks[STONE], 114); assert.equal(Object.hasOwn(knight.lastReceipt.lootKept.stacks, OLD), false);
  assert.ok(validateSave(knight)); assert.deepEqual(writes, []);
  const overflow = structuredClone(legacy); overflow.stacks[STONE] = Number.MAX_SAFE_INTEGER; overflow.stacks[OLD] = 1;
  const bytes = JSON.stringify(overflow); data.set(SLOT_SAVE_KEYS.skeleton_knight, bytes);
  assert.throws(() => readKnight(storage), /검증/); assert.equal(data.get(SLOT_SAVE_KEYS.skeleton_knight), bytes);
});

test('migration never repairs explicit null plain-stone counts in bag or receipt locations', () => {
  for (const where of ['bag','kept','lost']) {
    const save = where === 'bag' ? fresh() : withReceipt(where === 'kept' ? 'clear' : 'death', { [OLD]: 1 });
    const stacks = where === 'bag' ? save.stacks : save.lastReceipt[where === 'kept' ? 'lootKept' : 'lootLost'].stacks;
    stacks[OLD] = 1; stacks[STONE] = null;
    assert.equal(validateSave(save), false, where);
    const migrated = migrateGreaterStones(save);
    assert.equal(validateSave(migrated), false, where + ' null must stay invalid');
    assert.equal(load(save).loaded, null, where + ' corrupt-save path retained');
  }
});
