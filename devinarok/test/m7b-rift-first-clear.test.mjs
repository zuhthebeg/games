import assert from 'node:assert/strict';
import test from 'node:test';
import { applyOperations } from '../js/save/ops.js';

function makeCharacter() {
  return applyOperations(null, {}, [
    { type: 'createCharacter', name: '모험가', kind: 'knight' },
  ], 'hero');
}

test('first rift clear awards materials once, leaves campaign clears unchanged, and caps materials', () => {
  const initial = makeCharacter();
  const beforeR5 = {
    ...initial.character,
    clearedStages: ['KB', 'R1', 'R2', 'R3', 'R4'],
  };
  const firstClear = applyOperations(beforeR5, initial.items, [
    { type: 'clearStage', stageId: 'R5' },
  ], 'hero');
  assert.deepEqual(firstClear.character.materials, { essence: 4, soul: 1 });
  assert.ok(firstClear.character.clearedStages.includes('R5'));

  const repeatClear = applyOperations(firstClear.character, firstClear.items, [
    { type: 'clearStage', stageId: 'R5' },
  ], 'hero');
  assert.deepEqual(repeatClear.character.materials, firstClear.character.materials);

  const campaignClear = applyOperations(initial.character, initial.items, [
    { type: 'clearStage', stageId: 'C1' },
  ], 'hero');
  assert.deepEqual(campaignClear.character.materials, { essence: 0, soul: 0 });

  const nearCap = {
    ...beforeR5,
    materials: { essence: 9998, soul: 9999 },
  };
  const capped = applyOperations(nearCap, initial.items, [
    { type: 'clearStage', stageId: 'R5' },
  ], 'hero');
  assert.deepEqual(capped.character.materials, { essence: 9999, soul: 9999 });
});
