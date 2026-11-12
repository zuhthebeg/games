import { ITEMS } from '../content/items.js';
import { LINEAGES } from '../content/lineages.js';

export const DONOR_PARTS = Object.freeze([
  { node: 'Knight_Helmet', donor: 'knight', bone: 'head' },
  { node: 'Knight_Cape', donor: 'knight', bone: 'chest' },
  { node: 'Barbarian_Hat', donor: 'Barbarian', bone: 'head' },
  { node: 'Barbarian_Cape', donor: 'Barbarian', bone: 'chest' },
  { node: 'Mage_Hat', donor: 'Mage', bone: 'head' },
  { node: 'Mage_Cape', donor: 'Mage', bone: 'chest' },
  { node: 'Rogue_Cape', donor: 'Rogue_Hooded', bone: 'chest' },
  { node: 'Skeleton_Warrior_Helmet', donor: 'Skeleton_Warrior', bone: 'head' },
  { node: 'Skeleton_Rogue_Hood', donor: 'Skeleton_Rogue', bone: 'head' },
  { node: 'Skeleton_Rogue_Cape', donor: 'Skeleton_Rogue', bone: 'chest' },
  { node: 'Round_Shield', donor: 'knight', bone: 'handslot.l' },
  { node: 'Badge_Shield', donor: 'knight', bone: 'handslot.l' },
  { node: 'Rectangle_Shield', donor: 'knight', bone: 'handslot.l' },
  { node: 'Spike_Shield', donor: 'knight', bone: 'handslot.l' },
]);

export const HEAD_STYLES = Object.freeze({
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

export const BODY_STYLES = Object.freeze({
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

export const SHIELD_BY_WEAPON = Object.freeze({
  'rusted-sword': 'Round_Shield',
  'knight-sword': 'Badge_Shield',
  'oath-sword': 'Badge_Shield',
  'ash-sword': 'Rectangle_Shield',
  'nightmare-sword': 'Spike_Shield',
  'hell-sword': 'Spike_Shield',
});

export const PART_TINTS = Object.freeze({
  magic: 0x2a4dff,
  rare: 0xb8901a,
  legendary: 0xff6a1a,
  set: 0x3fd68a,
});

export const PART_SCALE = Object.freeze({
  Skeleton_Rogue_Hood: 1.25,
  Mage_Hat: 0.65,
});

const HEAD_FALLBACK = Object.freeze({
  sword: 'Knight_Helmet',
  staff: 'Mage_Hat',
});

const BODY_FALLBACK = Object.freeze({
  sword: 'Knight_Cape',
  crossbow: 'Rogue_Cape',
  staff: 'Mage_Cape',
});

function partTint(itemId, rarity, activeSetId) {
  const activeSetPiece = Boolean(activeSetId && ITEMS[itemId]?.setId === activeSetId);
  const hex = PART_TINTS[activeSetPiece ? 'set' : rarity];
  return hex === undefined ? null : { hex, intensity: activeSetPiece ? 0.45 : 0.35 };
}

export function playerModelKey(entity) {
  return LINEAGES[entity.lineage]?.model ?? entity.characterKind ?? 'knight';
}

export function resolvePlayerParts(look = {}) {
  const family = look.family ?? 'sword';
  const weapon = look.weapon ?? '1H_Sword';
  const offhand = look.offhand && family === 'sword' && weapon === '1H_Sword'
    ? SHIELD_BY_WEAPON[look.weaponItem] ?? 'Round_Shield'
    : null;
  const headStyle = look.head
    ? HEAD_STYLES[look.head] ?? HEAD_FALLBACK[family] ?? null
    : null;
  const head = family === 'crossbow' && headStyle === 'Skeleton_Rogue_Hood' ? null : headStyle;
  const cape = look.body
    ? BODY_STYLES[look.body] ?? BODY_FALLBACK[family] ?? null
    : null;
  const weaponTint = partTint(look.weaponItem, look.weaponRarity, look.setId);

  return {
    weapon,
    offhand,
    head,
    cape,
    tints: {
      weapon: weaponTint,
      head: head ? partTint(look.head, look.headRarity, look.setId) : null,
      offhand: offhand ? weaponTint : null,
      cape: cape ? partTint(look.body, look.bodyRarity, look.setId) : null,
    },
  };
}

export function playerLookKey(look = {}) {
  return [
    look.family ?? 'sword',
    look.weapon ?? '1H_Sword',
    look.offhand ?? '',
    Boolean(look.helmet),
    Boolean(look.cape),
    look.weaponRarity ?? '',
    look.weaponItem ?? '',
    look.head ?? '',
    look.body ?? '',
    look.headRarity ?? '',
    look.bodyRarity ?? '',
    look.setId ?? '',
  ].join(':');
}
