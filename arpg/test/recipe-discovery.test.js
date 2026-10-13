import test from 'node:test';
import assert from 'node:assert/strict';
import { createSave, validateSave } from '../js/meta/save.js';
import { RECIPES } from '../js/meta/items.js';
import { seenMaterials, noteMaterials, recipeRevealed } from '../js/meta/recipe-discovery.js';

const fresh = () => createSave({ name: '레시피', answers: [0, 0, 0, 0, 0], createdAt: 1 });

test('recipe is hidden until any of its materials is obtained, and stays revealed after spending it', () => {
  const s = fresh();
  assert.ok(Object.keys(RECIPES).every(id => !recipeRevealed({ ...s, stacks: {} }, id)));
  const got = noteMaterials({ ...s, stacks: { ...s.stacks, fang: 1 } });
  assert.ok(recipeRevealed(got, 'iron_sword'));
  assert.ok(recipeRevealed(got, 'ember_wand'));
  assert.ok(!recipeRevealed(got, 'leather_vest'));
  const spent = noteMaterials({ ...got, stacks: { ...got.stacks, fang: 0 } });
  assert.ok(recipeRevealed(spent, 'iron_sword'), 'spending does not re-hide');
  assert.deepEqual(spent.seenMaterials, ['fang']);
  assert.ok(validateSave(spent));
  assert.ok(!validateSave({ ...spent, seenMaterials: ['fang', 'fang'] }));
  assert.ok(!validateSave({ ...spent, seenMaterials: ['potion'] }));
  assert.equal(noteMaterials(spent), spent, 'no change -> same object');
  assert.ok(seenMaterials({ ...s, stacks: { gold: 5 } }).size === 0);
});
