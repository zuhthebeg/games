import assert from 'node:assert/strict';
import test from 'node:test';
import { ITEMS, equipmentLook } from '../js/content/items.js';
import {
  BODY_STYLES,
  DONOR_PARTS,
  HEAD_STYLES,
  PART_SCALE,
  PART_TINTS,
  playerLookKey,
  resolvePlayerParts,
  SHIELD_BY_WEAPON,
} from '../js/render/player-look.js';

const baseLook = (overrides = {}) => ({
  family: 'sword',
  characterKind: 'knight',
  weapon: '1H_Sword',
  offhand: 'Round_Shield',
  weaponItem: 'rusted-sword',
  weaponRarity: null,
  head: null,
  body: null,
  headRarity: null,
  bodyRarity: null,
  setId: null,
  ...overrides,
});

test('every head and body item resolves to a donor part or family fallback', () => {
  const donorNodes = new Set(DONOR_PARTS.map(({ node }) => node));
  for (const item of Object.values(ITEMS).filter(({ slot }) => ['head', 'body'].includes(slot))) {
    const parts = resolvePlayerParts(baseLook({ [item.slot]: item.id }));
    const node = item.slot === 'head' ? parts.head : parts.cape;
    assert.ok(donorNodes.has(node), `${item.id} resolved to ${node}`);
  }
});

test('head and body style tables map their authored items to the specified donor meshes', () => {
  assert.deepEqual(HEAD_STYLES, {
    'patched-hood': 'Skeleton_Rogue_Hood',
    'ash-hood': 'Skeleton_Rogue_Hood',
    'necromancer-hood': 'Skeleton_Rogue_Hood',
    'shadow-helm': 'Skeleton_Rogue_Hood',
    'guard-helm': 'Knight_Helmet',
    'royal-helm': 'Knight_Helmet',
    'nightmare-helm': 'Knight_Helmet',
    'oath-helm': 'Knight_Helmet',
    'ossuary-helm': 'Skeleton_Warrior_Helmet',
    'king-helm': 'Skeleton_Warrior_Helmet',
    'hell-helm': 'Barbarian_Hat',
    'ember-helm': 'Mage_Hat',
  });
  assert.deepEqual(BODY_STYLES, {
    'patched-coat': 'Rogue_Cape',
    'ash-coat': 'Rogue_Cape',
    'guard-mail': 'Knight_Cape',
    'royal-plate': 'Knight_Cape',
    'nightmare-plate': 'Knight_Cape',
    'oath-plate': 'Knight_Cape',
    'necromancer-robe': 'Mage_Cape',
    'ember-plate': 'Mage_Cape',
    'ossuary-plate': 'Skeleton_Rogue_Cape',
    'king-plate': 'Skeleton_Rogue_Cape',
    'shadow-plate': 'Skeleton_Rogue_Cape',
    'hell-plate': 'Barbarian_Cape',
  });
});

test('rogue hood styles stay baked into the model while non-hood helmets graft normally', () => {
  assert.equal(resolvePlayerParts(baseLook({ family: 'crossbow', head: 'patched-hood' })).head, null);
  assert.equal(resolvePlayerParts(baseLook({ family: 'crossbow', head: 'ash-hood' })).head, null);
  assert.equal(resolvePlayerParts(baseLook({ family: 'crossbow', head: 'guard-helm' })).head, 'Knight_Helmet');
});

test('unknown item IDs use native family parts', () => {
  assert.equal(resolvePlayerParts(baseLook({ family: 'sword', head: 'unknown-head' })).head, 'Knight_Helmet');
  assert.equal(resolvePlayerParts(baseLook({ family: 'staff', head: 'unknown-head' })).head, 'Mage_Hat');
  assert.equal(resolvePlayerParts(baseLook({ family: 'crossbow', head: 'unknown-head' })).head, null);
  assert.equal(resolvePlayerParts(baseLook({ family: 'sword', body: 'unknown-body' })).cape, 'Knight_Cape');
  assert.equal(resolvePlayerParts(baseLook({ family: 'crossbow', body: 'unknown-body' })).cape, 'Rogue_Cape');
  assert.equal(resolvePlayerParts(baseLook({ family: 'staff', body: 'unknown-body' })).cape, 'Mage_Cape');
});

test('one-handed swords select their shield variant and other weapons show no shield', () => {
  for (const [weaponItem, node] of Object.entries(SHIELD_BY_WEAPON)) {
    assert.equal(resolvePlayerParts(baseLook({ weaponItem })).offhand, node);
  }
  assert.equal(resolvePlayerParts(baseLook({ weaponItem: 'unlisted-sword' })).offhand, 'Round_Shield');
  assert.equal(resolvePlayerParts(baseLook({
    weapon: '2H_Sword',
    offhand: 'Round_Shield',
    weaponItem: 'grave-greatsword',
  })).offhand, null);
  assert.equal(resolvePlayerParts(baseLook({ family: 'crossbow' })).offhand, null);
  assert.equal(resolvePlayerParts(baseLook({ family: 'staff' })).offhand, null);
});

test('equipmentLook activates a set only at four pieces', () => {
  const threePieces = equipmentLook([
    { itemId: 'oath-sword', rarity: 'set' },
    { itemId: 'oath-helm', rarity: 'set' },
    { itemId: 'oath-plate', rarity: 'set' },
  ]);
  const fourPieces = equipmentLook([
    { itemId: 'oath-sword', rarity: 'set' },
    { itemId: 'oath-helm', rarity: 'set' },
    { itemId: 'oath-plate', rarity: 'set' },
    { itemId: 'oath-gauntlets', rarity: 'set' },
  ]);
  assert.equal(threePieces.setId, null);
  assert.equal(fourPieces.setId, 'guardian-oath');
});

test('set pieces glow stronger only while their set is active', () => {
  const setPieces = [
    { itemId: 'oath-helm', rarity: 'set' },
    { itemId: 'oath-plate', rarity: 'set' },
    { itemId: 'oath-gauntlets', rarity: 'set' },
    { itemId: 'oath-greaves', rarity: 'set' },
  ];
  const inactiveLook = equipmentLook([
    { itemId: 'oath-sword', rarity: 'set' },
    ...setPieces.slice(0, 2),
  ]);
  const inactiveTints = resolvePlayerParts(inactiveLook).tints;
  assert.equal(inactiveTints.weapon.intensity, 0.35);
  assert.equal(inactiveTints.head.intensity, 0.35);
  assert.equal(inactiveTints.cape.intensity, 0.35);

  const activeLook = equipmentLook([
    { itemId: 'rusted-sword', rarity: 'rare' },
    ...setPieces,
  ]);
  const activeTints = resolvePlayerParts(activeLook).tints;
  assert.equal(activeLook.setId, 'guardian-oath');
  assert.deepEqual(activeTints.weapon, { hex: PART_TINTS.rare, intensity: 0.35 });
  assert.deepEqual(activeTints.offhand, activeTints.weapon);
  assert.deepEqual(activeTints.head, { hex: PART_TINTS.set, intensity: 0.45 });
  assert.deepEqual(activeTints.cape, { hex: PART_TINTS.set, intensity: 0.45 });

  const activeWeaponLook = equipmentLook([
    { itemId: 'oath-sword', rarity: 'set' },
    ...setPieces.slice(0, 3),
  ]);
  const activeWeaponTints = resolvePlayerParts(activeWeaponLook).tints;
  assert.deepEqual(activeWeaponTints.weapon, { hex: PART_TINTS.set, intensity: 0.45 });
  assert.deepEqual(activeWeaponTints.offhand, activeWeaponTints.weapon);
});

test('hood and mage hat have per-part scale corrections', () => {
  assert.equal(PART_SCALE.Skeleton_Rogue_Hood, 1.25);
  assert.equal(PART_SCALE.Mage_Hat, 0.65);
});

test('playerLookKey includes item IDs, rarities, and active set state', () => {
  const look = baseLook();
  for (const field of ['weaponItem', 'head', 'body', 'headRarity', 'bodyRarity', 'setId']) {
    assert.notEqual(playerLookKey(look), playerLookKey({ ...look, [field]: 'changed' }), field);
  }
});
