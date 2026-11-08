import assert from 'node:assert/strict';
import test from 'node:test';
import { equipmentLook } from '../js/content/items.js';
import { applyHubEquipmentLook } from '../js/ui/hub-player.js';
import { createHubWorld, createStageWorld } from '../js/sim/world.js';

test('equipmentLook selects the weapon mesh, armor visibility, and weapon rarity', () => {
  assert.deepEqual(equipmentLook([]), {
    family: 'sword',
    characterKind: 'knight',
    weapon: '1H_Sword',
    offhand: 'Round_Shield',
    helmet: false,
    cape: false,
    weaponRarity: null,
  });
  assert.deepEqual(equipmentLook([
    { itemId: 'grave-greatsword', slot: 'weapon', rarity: 'legendary' },
    { itemId: 'ossuary-helm', slot: 'head' },
    { itemId: 'ossuary-plate', slot: 'body' },
  ]), {
    family: 'sword',
    characterKind: 'knight',
    weapon: '2H_Sword',
    offhand: null,
    helmet: true,
    cape: true,
    weaponRarity: 'legendary',
  });
});

test('weapon families select their character and KayKit equipment meshes', () => {
  assert.deepEqual(equipmentLook([{ itemId: 'rusted-crossbow', slot: 'weapon', rarity: 'common' }]), {
    family: 'crossbow',
    characterKind: 'rogue',
    weapon: '1H_Crossbow',
    offhand: null,
    helmet: false,
    cape: false,
    weaponRarity: 'common',
  });
  assert.equal(equipmentLook([{ itemId: 'grave-crossbow', slot: 'weapon' }]).weapon, '2H_Crossbow');
  assert.equal(equipmentLook([{ itemId: 'apprentice-wand', slot: 'weapon' }]).weapon, '1H_Wand');
  assert.deepEqual(equipmentLook([
    { itemId: 'grave-staff', slot: 'weapon' },
    { itemId: 'ossuary-helm', slot: 'head' },
    { itemId: 'ossuary-plate', slot: 'body' },
  ]), {
    family: 'staff',
    characterKind: 'mage',
    weapon: '2H_Staff',
    offhand: null,
    helmet: true,
    cape: true,
    weaponRarity: null,
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
  assert.deepEqual(returned.look, {
    family: 'sword',
    characterKind: 'knight',
    weapon: '1H_Sword',
    offhand: 'Round_Shield',
    helmet: true,
    cape: true,
    weaponRarity: null,
  });
});

test('hub player character follows the equipped weapon on entry and equipment changes', () => {
  const hub = createHubWorld({
    seed: 39,
    playerId: 'hero',
    equipment: [{ itemId: 'rusted-crossbow', slot: 'weapon', rarity: 'common' }],
  });
  const player = hub.entities.find((entity) => entity.kind === 'player');

  assert.equal(player.family, 'crossbow');
  assert.equal(player.characterKind, 'rogue');

  applyHubEquipmentLook(player, [{ itemId: 'apprentice-wand', slot: 'weapon', rarity: 'common' }]);
  assert.equal(player.family, 'staff');
  assert.equal(player.characterKind, 'mage');

  applyHubEquipmentLook(player, []);
  assert.equal(player.family, 'sword');
  assert.equal(player.characterKind, 'knight');
});
