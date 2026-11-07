import assert from 'node:assert/strict';
import test from 'node:test';
import { equipmentLook } from '../js/content/items.js';
import { createHubWorld, createStageWorld } from '../js/sim/world.js';

test('equipmentLook selects the weapon mesh, armor visibility, and weapon rarity', () => {
  assert.deepEqual(equipmentLook([]), {
    weapon: '1H_Sword',
    helmet: false,
    cape: false,
    weaponRarity: null,
  });
  assert.deepEqual(equipmentLook([
    { itemId: 'grave-greatsword', slot: 'weapon', rarity: 'legendary' },
    { itemId: 'ossuary-helm', slot: 'head' },
    { itemId: 'ossuary-plate', slot: 'body' },
  ]), {
    weapon: '2H_Sword',
    helmet: true,
    cape: true,
    weaponRarity: 'legendary',
  });
});

test('hub player starts at full gear-scaled HP after leaving an injured stage', () => {
  const equipment = [
    { itemId: 'ossuary-helm', slot: 'head', rarity: 'rare', affixes: [{ id: 'maxHp', value: 20 }] },
    { itemId: 'ossuary-plate', slot: 'body', rarity: 'rare', affixes: [] },
  ];
  const stage = createStageWorld({
    seed: 37,
    stageId: 'C1',
    playerId: 'hero',
    character: { level: 5, equipment, potions: 3 },
  });
  const injured = stage.entities.find((entity) => entity.kind === 'player');
  injured.hp = 1;
  const hub = createHubWorld({ seed: 38, playerId: 'hero', level: 5, equipment });
  const returned = hub.entities.find((entity) => entity.kind === 'player');

  assert.ok(injured.hp < injured.maxHp);
  assert.ok(returned.maxHp > 100);
  assert.equal(returned.hp, returned.maxHp);
  assert.deepEqual(returned.stats, injured.stats);
  assert.deepEqual(returned.look, { weapon: '1H_Sword', helmet: true, cape: true, weaponRarity: null });
});
