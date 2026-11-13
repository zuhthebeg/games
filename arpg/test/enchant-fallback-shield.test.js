import test from 'node:test';
import assert from 'node:assert/strict';
import { createSave, validateSave, SaveStore, SAVE_KEY } from '../js/meta/save.js';
import { instance, equip, equippedItem, permitsShield, ITEMS, carriedWeight, capacity } from '../js/meta/items.js';
import { addXp } from '../js/meta/progression.js';
import { allocateStats } from '../js/meta/stats.js';
import { enchant, enchantPreview } from '../js/meta/enchant.js';
import { HubUI } from '../js/ui/hub.js';

const STONE = 'enhance_stone_1';
// The audit's real reducer fixture: seed 1, Lv12, STR116, starter +6 destroys.
function fixture(fallback = 'warden_blade', shield = true) {
  let save = addXp(createSave({ name: '강화 시험', answers: [0,0,0,0,0], weapon: 'blade', createdAt: 1 }), 10000);
  save = allocateStats(save, { str: save.statPoints });
  if (fallback) save.items.push(instance('fixture:fallback', fallback, 0, []));
  if (shield) {
    save.items.push(instance('fixture:shield', 'round_shield', 0, []));
    save = equip(save, 'fixture:shield');
  }
  equippedItem(save, 'weapon').enhance = 6;
  save.stacks[STONE] = 5;
  assert.ok(validateSave(save), 'valid fixture before enchanting');
  return save;
}
function memoryStore() {
  const bytes = new Map();
  let writes = 0;
  const store = new SaveStore({ getItem: k => bytes.get(k) ?? null,
    setItem(k, v) { writes++; bytes.set(k, v); }, removeItem: k => bytes.delete(k) });
  return { store, bytes, get writes() { return writes; } };
}
// Presentation-only browser adapter. Reducer, validation, action, commit and store are real.
function presentationDom(t, onAppend) {
  const node = () => ({ focus() {}, setAttribute() {}, textContent: '' });
  const children = new Map();
  const dialog = { dataset: {}, style: { setProperty() {} }, setAttribute() {},
    showModal() {}, close() {}, remove() {}, addEventListener() {},
    querySelector(selector) {
      if (selector === 'canvas') return null;
      if (!children.has(selector)) children.set(selector, node());
      return children.get(selector);
    } };
  for (const [key, value] of Object.entries({ document: { activeElement: null, createElement: () => dialog },
    matchMedia: () => ({ matches: true }), window: { removeEventListener() {} }, cancelAnimationFrame() {} })) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
    t.after(() => previous ? Object.defineProperty(globalThis, key, previous) : delete globalThis[key]);
  }
  return { append: onAppend, querySelector: () => null };
}

test('EF1 audit: destroyed equipped sword -> twohand fallback preserves shield in inventory and commits once before result', t => {
  const save = fixture(), before = structuredClone(save), uid = save.equipped.weapon;
  const attempt = enchant(save, uid, STONE);
  assert.equal(attempt.result.outcome, 'destroyed');
  assert.equal(equippedItem(attempt.save, 'weapon').id, 'warden_blade');
  assert.equal(validateSave(attempt.save), true, 'fallback must be persistable');
  assert.equal(attempt.save.equipped.offhand, null);
  assert.deepEqual(attempt.save.items.find(i => i.uid === 'fixture:shield'), before.items.find(i => i.uid === 'fixture:shield'));
  assert.deepEqual(save, before);
  assert.deepEqual(enchant(save, uid, STONE), attempt, 'retry cannot reroll');

  const memory = memoryStore();
  memory.store.save(save);
  let renders = 0, appends = 0;
  const hub = Object.assign(Object.create(HubUI.prototype), {
    save, persist: next => memory.store.save(next),
    showForge() {
      renders++;
      assert.equal(memory.writes, 2, 'exactly one attempt write before render');
      assert.equal(this.lastEnchant.outcome, 'destroyed');
      assert.deepEqual(this.forgeNotice, attempt.result);
      assert.deepEqual(memory.store.load(), this.save);
    },
  });
  hub.root = presentationDom(t, () => { appends++; assert.equal(renders, 1); assert.equal(memory.writes, 2); });
  try {
    hub.action('enhance', { uid, stone: STONE });
    assert.equal(memory.writes, 2);
    assert.equal(renders, 1);
    assert.equal(appends, 1);
    assert.equal(hub.selectedUid, null);
    // Real commit also records the owned/refunded material as discovered.
    assert.deepEqual(hub.save, { ...attempt.save, seenMaterials: [STONE] });
    assert.deepEqual(JSON.parse(memory.bytes.get(SAVE_KEY)), hub.save);
    assert.deepEqual(memory.store.load(), hub.save);
  } finally { hub.enchantFx?.close(); }
});

for (const [id, keepsShield] of [
  ['warden_blade', false], ['warden_maul', false], ['iron_sword', true],
  ['chief_maul', true], ['ember_wand', true], ['altar_staff', false], ['hunter_bow', false],
]) {
  test('EF1 fallback shield contract: ' + id, () => {
    const save = fixture(id), before = structuredClone(save), uid = save.equipped.weapon;
    const { save: next, result } = enchant(save, uid, STONE);
    assert.equal(permitsShield(ITEMS[id]), keepsShield);
    assert.equal(result.outcome, 'destroyed');
    assert.equal(next.equipped.weapon, 'fixture:fallback');
    assert.equal(next.equipped.offhand, keepsShield ? 'fixture:shield' : null);
    assert.ok(validateSave(next));
    assert.deepEqual(next.items, before.items.filter(i => i.uid !== uid));
    assert.deepEqual(save, before);
    const withoutShield = structuredClone(save); withoutShield.equipped.offhand = null;
    const control = enchant(withoutShield, uid, STONE);
    assert.deepEqual(result, control.result, 'same seeded outcome and refund');
    assert.deepEqual({ ...next, equipped: { ...next.equipped, offhand: null } }, control.save,
      'only offhand binding differs: seed, counter, cost, refund and all owned resources are identical');
    assert.equal(next.createdAt, 1);
    assert.equal(next.enchantCount, 1);
    assert.equal(next.stacks[STONE], save.stacks[STONE] - enchantPreview(save, uid, STONE).cost + result.refund[STONE]);
    assert.equal(next.gold, save.gold);
  });
}

test('EF1 no shield and only-weapon starter recovery remain valid without resource loss', () => {
  for (const [fallback, shield] of [['warden_blade', false], [null, true], [null, false]]) {
    const save = fixture(fallback, shield), before = structuredClone(save);
    const { save: next, result } = enchant(save, save.equipped.weapon, STONE);
    assert.equal(result.outcome, 'destroyed');
    assert.ok(validateSave(next));
    if (!fallback) {
      const starter = equippedItem(next, 'weapon');
      assert.equal(starter.id, 'training_sword');
      assert.equal(starter.enhance, 0);
      assert.notEqual(starter.uid, save.equipped.weapon);
    }
    assert.equal(next.equipped.offhand, shield ? 'fixture:shield' : null);
    assert.deepEqual(save, before);
  }
});

test('EF1 nonweapon destruction retains equipped onehand weapon and shield', () => {
  const save = fixture();
  const uid = save.equipped.body; equippedItem(save, 'body').enhance = 6;
  let attempt;
  for (let count = 0; count < 100; count++) {
    save.enchantCount = count;
    attempt = enchant(save, uid, STONE);
    if (attempt.result.outcome === 'destroyed') break;
  }
  const before = structuredClone(save);
  assert.equal(attempt.result.outcome, 'destroyed');
  assert.equal(attempt.save.equipped.body, null);
  assert.equal(attempt.save.equipped.weapon, save.equipped.weapon);
  assert.equal(attempt.save.equipped.offhand, 'fixture:shield');
  assert.deepEqual(attempt.save.items, save.items.filter(i => i.uid !== uid));
  assert.ok(validateSave(attempt.save));
  assert.deepEqual(enchant(save, uid, STONE), attempt);
  assert.deepEqual(save, before);
});

test('EF1 successful enhancement does not replace weapon or clear shield', () => {
  const save = fixture(); equippedItem(save, 'weapon').enhance = 0;
  const before = structuredClone(save), uid = save.equipped.weapon;
  const { save: next, result } = enchant(save, uid, STONE);
  assert.equal(result.outcome, 'success');
  assert.equal(result.to, 1);
  assert.deepEqual(next.equipped, save.equipped);
  assert.equal(next.items.length, save.items.length);
  assert.equal(next.stacks[STONE], 0);
  assert.equal(next.enchantCount, 1);
  assert.equal(next.createdAt, save.createdAt);
  assert.equal(next.gold, save.gold);
  assert.ok(validateSave(next));
  assert.deepEqual(save, before);
});

// Deliberate scope limit: offhand compatibility does not introduce a new weight policy.
// SaveStore must still refuse an overfull bag; no consumable is silently deleted/stashed.
for (const key of ['capacity_flat', 'str_flat']) {
  test('EF1 documented boundary: losing shield ' + key + ' can still exceed 120% capacity', () => {
    let save = fixture();
    const shield = save.items.find(i => i.uid === 'fixture:shield');
    shield.id = 'round_shield_fine'; shield.affixes = [{ k: key, v: 5 }];
    const target = structuredClone(save);
    target.equipped.offhand = null; target.equipped.weapon = 'fixture:fallback';
    save.stacks.potion += Math.floor((capacity(target) * 1.2 - carriedWeight(target)) / ITEMS.potion.weight) + 1;
    assert.ok(validateSave(save), 'valid supported bag before losing shield');
    const before = structuredClone(save);
    const attempt = enchant(save, save.equipped.weapon, STONE);
    assert.equal(attempt.result.outcome, 'destroyed');
    assert.equal(attempt.save.equipped.offhand, null, 'compatibility repaired');
    assert.ok(carriedWeight(attempt.save) > capacity(attempt.save) * 1.2, 'weight remains a separate boundary');
    assert.equal(validateSave(attempt.save), false, 'strict weight validator unchanged');
    assert.equal(attempt.save.stacks.potion, save.stacks.potion);
    assert.deepEqual(attempt.save.stash, save.stash);
    assert.deepEqual(attempt.save.items.find(i => i.uid === shield.uid), shield);
    const memory = memoryStore(); memory.store.save(save);
    const raw = memory.bytes.get(SAVE_KEY);
    assert.throws(() => memory.store.save(attempt.save), /저장 데이터 검증에 실패/);
    assert.equal(memory.writes, 1);
    assert.equal(memory.bytes.get(SAVE_KEY), raw, 'original persisted save remains intact');
    assert.deepEqual(save, before);
  });
}
