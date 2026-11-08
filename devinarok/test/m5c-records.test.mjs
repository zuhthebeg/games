import test from 'node:test';
import assert from 'node:assert/strict';
import { applyOperations, normalizeCharacter } from '../js/save/ops.js';

test('records default to an empty object for old and new characters', () => {
  const legacy = { id: 'hero', name: '기사', clearedStages: [] };
  assert.deepEqual(normalizeCharacter(legacy).records, {});
  const created = applyOperations(null, {}, [
    { type: 'createCharacter', name: '기사', kind: 'knight' },
  ], 'hero');
  assert.deepEqual(created.character.records, {});
});

test('recordClear stores only a lower clear time and keeps tier keys', () => {
  let character = applyOperations(null, {}, [
    { type: 'createCharacter', name: '기사', kind: 'knight' },
  ], 'hero').character;
  character = applyOperations(character, {}, [
    { type: 'recordClear', key: 'N:C1', ticks: 120 },
    { type: 'recordClear', key: 'N:C1', ticks: 150 },
    { type: 'recordClear', key: 'N:C1', ticks: 90 },
  ], 'hero').character;
  assert.deepEqual(character.records, { 'N:C1': 90 });
});

test('tier clear keys are persisted without changing other clears', () => {
  let character = applyOperations(null, {}, [
    { type: 'createCharacter', name: '기사', kind: 'knight' },
  ], 'hero').character;
  character = applyOperations(character, {}, [
    { type: 'clearStage', stageId: 'KB' },
    { type: 'clearStage', stageId: 'N:KB' },
  ], 'hero').character;
  assert.deepEqual(character.clearedStages, ['KB', 'N:KB']);
});
