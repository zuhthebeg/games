import { ITEMS, equippedItem } from '../meta/items.js';

// B only: fixed clothed Knight; hats/weapons are geometry, other slots colour only.
export function paperdollEnabled(search = globalThis.location?.search || '') {
  return new URLSearchParams(search).get('paperdoll') !== '0';
}
const PALETTES = {
  light: [155, 170, 183], medium: [164, 127, 91], heavy: [127, 150, 170],
};
const WEAPON_COLOURS = {
  training_sword:[201,155,105], iron_sword:[218,234,244], goblin_cleaver:[190,209,155],
  rune_blade:[135,212,232], warden_blade:[174,184,244], chief_maul:[216,205,178],
  short_bow:[219,176,119], hunter_bow:[179,216,148], pack_bow:[229,205,146], frost_bow:[149,209,244],
  apprentice_wand:[218,184,143], ember_wand:[245,166,119], altar_staff:[186,149,235], seal_staff:[131,231,217],
};
const GRADE = { common: 0, fine: 8, rare: 18, epic: 28 };
function slotColour(def) {
  if (!def) return null;
  const base = PALETTES[def.armorClass || 'light'];
  const boost = GRADE[def.rarity] + (def.huntTier - 1) * 5;
  return base.map((v, i) => Math.min(235, v + boost + (def.rarity === 'epic' && i === 2 ? 22 : 0)));
}
export function equipmentVisual(save, overrideKit) {
  const def = slot => ITEMS[equippedItem(save, slot)?.id];
  const weapon = def('weapon'), head = def('head');
  const kit = overrideKit || weapon?.family || 'blade';
  const base = weapon?.baseId || '';
  const alternate = kit === 'blade' ? base === 'chief_maul'
    : kit === 'bow' ? base === 'short_bow' : weapon?.form === 'wand';
  const descriptor = {
    kit, head: !head ? 'none' : { light: 'mage', medium: 'barbarian', heavy: 'knight' }[head.armorClass],
    weapon: alternate ? 'alternate' : 'standard',
    weaponColour: weapon?.family === kit ? WEAPON_COLOURS[base] || [255,255,255] : [255,255,255],
    colours: ['body', 'hands', 'feet'].map(slot => slotColour(def(slot))),
  };
  // Enhancement is presentation metadata, not a baked atlas/cache-key variant.
  return { ...descriptor, key: JSON.stringify(descriptor), enhance: equippedItem(save, 'weapon')?.enhance || 0 };
}
