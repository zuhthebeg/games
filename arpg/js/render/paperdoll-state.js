import { ITEMS, equippedItem } from '../meta/items.js';

// B only: fixed clothed Knight; hats/weapons are geometry, other slots colour only.
export function paperdollEnabled(search = globalThis.location?.search || '') {
  return new URLSearchParams(search).get('paperdoll') !== '0';
}
const PALETTES = {
  light: [155, 170, 183], medium: [164, 127, 91], heavy: [127, 150, 170],
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
    colours: ['body', 'hands', 'feet'].map(slot => slotColour(def(slot))),
  };
  return { ...descriptor, key: JSON.stringify(descriptor) };
}
