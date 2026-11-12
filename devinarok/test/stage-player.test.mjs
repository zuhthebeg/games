import assert from 'node:assert/strict';
import test from 'node:test';
import { refreshStagePlayerCharacter } from '../js/ui/stage-player.js';

test('refreshing stage character stats preserves sortie potion count', () => {
  const player = { hp: 30, potions: 1 };
  const character = { level: 4, potions: 5 };
  const stats = { maxHp: 60 };

  refreshStagePlayerCharacter(player, character, [], { family: 'sword' }, stats);

  assert.equal(player.hp, 30);
  assert.equal(player.potions, 1);
  assert.equal(player.maxHp, 60);
});

test('refreshing an unarmed skeleton archer preserves the crossbow family', () => {
  const player = { hp: 90, family: 'crossbow' };
  const character = { level: 1, lineage: 'skeleton_archer' };

  refreshStagePlayerCharacter(player, character, [], { family: 'sword' }, { maxHp: 100 });

  assert.equal(player.family, 'crossbow');
});
