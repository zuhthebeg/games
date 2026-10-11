import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS, equip, instance, meetsRequirement, strRequirement } from '../js/meta/items.js';
import { compareItems } from '../js/meta/compare.js';

const SLOTS = ['weapon', 'head', 'body', 'hands', 'feet'];
const gear = Object.entries(ITEMS).filter(([, def]) => SLOTS.includes(def.kind));

test('no equipment keeps a level gate (cocy 10-11)', () => {
  for (const [id, def] of gear) assert.equal(def.requiredLevel, 1, id);
});

test('strength gates only heavy weapons and heavy armor, within the stat cap', () => {
  for (const [id, def] of gear) {
    const heavy = def.kind === 'weapon' ? def.weight >= 12 : def.armorClass === 'heavy';
    assert.equal(def.requiredStr > 0, heavy, id);
    assert.ok(def.requiredStr <= 19, id);
    assert.equal(def.requiredStr, strRequirement(def), id);
  }
  for (const id of ['short_bow', 'apprentice_wand', 'training_sword', 'frost_bow', 'seal_staff', 'leather_vest', 'cloth_tunic'])
    assert.equal(ITEMS[id].requiredStr, 0, id);
  assert.equal(ITEMS.chief_maul.requiredStr, 12);
  assert.equal(ITEMS.chief_maul_epic.requiredStr, 12); // rarity never changes weight or requirement
  assert.ok(ITEMS.warden_blade.requiredStr > ITEMS.rune_blade.requiredStr);
});

test('equip refuses heavy gear below its strength and allows it at the threshold', () => {
  const item = instance('t:maul', 'chief_maul', 1, []);
  const base = { level: 1, stats: { str: 11, agi: 5, int: 5, wis: 5, cha: 5 }, items: [item],
    equipped: { weapon: null, head: null, body: null, hands: null, feet: null }, stacks: {} };
  assert.equal(meetsRequirement(base, ITEMS.chief_maul), false);
  assert.throws(() => equip(base, item.uid), /힘 12/);
  const strong = { ...base, stats: { ...base.stats, str: 12 } };
  assert.equal(meetsRequirement(strong, ITEMS.chief_maul), true);
  assert.equal(equip(strong, item.uid).equipped.weapon, item.uid);
  assert.equal(compareItems(null, item, base).lockReason, '힘 12 필요');
});
