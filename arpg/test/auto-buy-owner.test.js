import test from 'node:test';
import assert from 'node:assert/strict';
import { HubUI } from '../js/ui/hub.js';
import { createSave, validateSave } from '../js/meta/save.js';
import { createSkeletonSave } from '../js/meta/character-creation.js';
import { CharacterStores } from '../js/meta/selected-character.js';
import { SLOT_SAVE_KEYS } from '../js/meta/character-slots.js';

const options = { name: '구매 시험', answers: [0, 0, 0, 0, 0], weapon: 'blade', createdAt: 1 };
function fixture(slot = 'human') {
  const human = createSave(options);
  // Same timestamp deliberately: lineage, not timestamp alone, separates slots.
  const knight = createSkeletonSave({ ...options, lineage: 'skeleton_knight' });
  for (const save of [human, knight]) {
    save.gold = 1000;
    save.autoBuy = { potion: save.stacks.potion + 2, mana_potion: 0, return_scroll: 0, green_potion: 0 };
    assert.ok(validateSave(save));
  }
  const data = new Map([[SLOT_SAVE_KEYS.human, JSON.stringify(human)], [SLOT_SAVE_KEYS.skeleton_knight, JSON.stringify(knight)]]);
  const writes = [];
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => { writes.push(key); data.set(key, value); }, removeItem: key => data.delete(key) };
  const characters = new CharacterStores(storage);
  const hub = Object.assign(Object.create(HubUI.prototype), {
    save: slot === 'human' ? characters.selectHuman() : characters.selectKnight(),
    initialCharacters: { human: () => characters.selectHuman(), read: () => characters.selectKnight(), create: opts => characters.createKnight(opts) },
    persist: save => characters.persist(save), resetSave: () => characters.reset(), recoverVitals() {},
    root: { dataset: {}, querySelector: selector => selector === 'input' ? { focus() {} } : null },
    show(html, page) { this.html = html; this.root.dataset.page = page; },
  });
  return { hub, data, writes, characters };
}
function status(hub) {
  hub.action('shop', {});
  return hub.html.split('<p role="status" aria-live="polite">')[1].split('</p>')[0];
}
function purchase(hub) {
  const before = structuredClone(hub.save);
  hub.action('auto-buy', {});
  assert.equal(hub.save.gold, before.gold - 6);
  assert.equal(hub.save.stacks.potion, before.stacks.potion + 2);
  assert.ok(validateSave(hub.save));
  assert.match(status(hub), /구매 · 6 G/);
  return status(hub);
}

for (const [from, choose, other] of [['human', 'choose-skeleton', 'skeleton_knight'], ['skeleton_knight', 'choose-human', 'human']]) {
  test(`auto-buy result clears on ${from} to ${other} selection without transactions`, () => {
    const { hub, data, writes } = fixture(from);
    purchase(hub);
    const bytes = new Map(data), writeCount = writes.length;
    assert.equal(writeCount, 1);
    assert.equal(writes[0], SLOT_SAVE_KEYS[from]);
    hub.action('inn', {});
    hub.action('character-choice', {});
    hub.action(choose, {});
    assert.equal(hub.save.lineage || 'human', other);
    const actual = status(hub);
    assert.deepEqual(data, bytes);
    assert.equal(writes.length, writeCount);
    assert.ok(validateSave(hub.save));
    assert.equal(actual, '');
  });
}

test('same-character inn revisit, immutable commits and same-slot reload preserve the result', () => {
  const { hub, characters } = fixture();
  const result = purchase(hub);
  hub.action('inn', {});
  assert.equal(status(hub), result);
  const before = structuredClone(hub.save);
  hub.commit(structuredClone(hub.save));
  assert.deepEqual(hub.save, before);
  assert.equal(status(hub), result);
  hub.action('choose-human', {});
  assert.equal(status(hub), result);
  // Cloud restore assigns a selected save directly, just as main.js does.
  hub.save = characters.selectHuman();
  hub.showInn();
  assert.equal(status(hub), result);
});

for (const slot of ['human', 'skeleton_knight']) {
  test(`auto-buy result clears across ${slot} reset and creation`, () => {
    const { hub } = fixture(slot);
    purchase(hub);
    hub.resetStep = 2;
    hub.action('reset-final', {});
    assert.equal(hub.save, null);
    if (slot === 'skeleton_knight') hub.action('choose-skeleton', {});
    hub.name = options.name; hub.answers = [...options.answers]; hub.chosenWeapon = 'blade';
    // Human creation normally launches S1; keep this test at the inn boundary.
    hub.roomInvite = true;
    hub.action('create', {});
    assert.ok(validateSave(hub.save));
    const before = structuredClone(hub.save);
    assert.equal(status(hub), '');
    assert.deepEqual(hub.save, before);
  });
}

test('direct cloud-restore save assignment clears result for another slot', () => {
  const { hub, characters, data, writes } = fixture();
  purchase(hub);
  const bytes = new Map(data), writeCount = writes.length;
  hub.save = characters.selectKnight(); hub.receipt = null; hub.showInn();
  const actual = status(hub);
  assert.deepEqual(data, bytes);
  assert.equal(writes.length, writeCount);
  assert.equal(actual, '');
});

test('direct restore of a replacement character in the same slot clears the result', () => {
  const { hub } = fixture('skeleton_knight');
  purchase(hub);
  const replacement = createSkeletonSave({ ...options, createdAt: 2, lineage: 'skeleton_knight' });
  assert.ok(validateSave(replacement));
  const before = structuredClone(replacement);
  hub.save = replacement; hub.receipt = null; hub.showInn();
  assert.equal(status(hub), '');
  assert.deepEqual(replacement, before);
});
