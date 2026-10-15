import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as debug from '../../js/debug/index.js';
import { previewDrops } from '../../js/debug/actions.js';
import { MONSTERS } from '../../js/content/combat.js';
import { NEW_MONSTER_DROPS } from '../../js/content/loot.js';

const legacy = ['scarecrow', 'goblin_grunt', 'goblin_slinger', 'iron_boar', 'goblin_chief'];
test('drop UI selects only actual supported pools; lab human and old unsupported training dragon are excluded', () => {
  const source = readFileSync(new URL('../../js/debug/index.js', import.meta.url), 'utf8');
  const expression = source.match(/id="dbg-monster">\$\{options\((.*?)\)\}/)[1];
  const selectable = new Function('MONSTERS', 'DROP_PREVIEW_MONSTERS', `return ${expression}`)(MONSTERS, debug.DROP_PREVIEW_MONSTERS);
  const expected = Object.keys(MONSTERS).filter(id => Object.hasOwn(NEW_MONSTER_DROPS, id) || legacy.includes(id));
  assert.deepEqual(selectable, expected);
  assert.deepEqual(debug.DROP_PREVIEW_MONSTERS, selectable);
  assert.equal(debug.DROP_PREVIEW_MONSTERS.length, 22);
  assert.ok(!debug.DROP_PREVIEW_MONSTERS.includes('undead_lab_human_melee'));
  assert.ok(!debug.DROP_PREVIEW_MONSTERS.includes('training_dragon'));
  assert.match(source, /id="dbg-monster">\$\{options\(DROP_PREVIEW_MONSTERS\)\}/);
  for (const id of debug.DROP_PREVIEW_MONSTERS) {
    for (const ctx of [{}, {elite:true,threat:3,huntTier:3}, {boss:true,threat:3,huntTier:3}]) {
      assert.doesNotThrow(() => previewDrops(id, 100, ctx), `${id} must be previewable`);
    }
  }
});
test('unsupported IDs still fail explicitly: no invented reward/drop tables or preview fallback', () => {
  for (const id of ['undead_lab_human_melee', 'training_dragon']) {
    assert.equal(Object.hasOwn(NEW_MONSTER_DROPS, id), false);
    assert.throws(() => previewDrops(id, 100), new RegExp(`unknown drop table: ${id}`));
  }
});
