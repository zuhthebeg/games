// Presentation only. No inferred stats, rarity, or equipment metadata from pictures.
// These paths are filled only by reviewed, local art; unknown items keep the SVG.
const artwork = {
  sword: 'sword.webp', 'sword-t2': 'sword-t2.webp', 'sword-t3': 'sword-t3.webp',
  bow: 'bow.webp', 'bow-t2': 'bow-t2.webp', 'bow-t3': 'bow-t3.webp', cleaver: 'cleaver.webp', maul: 'maul.webp',
  wand: 'wand.webp', 'staff-t2': 'staff-t2.webp', 'staff-t3': 'staff-t3.webp',
  head: 'head.webp', 'head-light': 'head-light.webp', body: 'body.webp',
  'body-cloth': 'body-cloth.webp', 'body-plate': 'body-plate.webp',
  hands: 'hands.webp', 'hands-heavy': 'hands-heavy.webp', feet: 'feet.webp', 'feet-heavy': 'feet-heavy.webp',
  'stone-low': 'stone-low.webp', 'stone-mid': 'stone-mid.webp', 'stone-high': 'stone-high.webp',
  potion: 'potion.webp', mana_potion: 'mana-potion.webp', return_scroll: 'scroll.webp',
  scroll_enchant_weapon: 'scroll-enchant-weapon.webp', scroll_enchant_armor: 'scroll-enchant-armor.webp',
  scroll_blessed_weapon: 'scroll-blessed-weapon.webp', scroll_blessed_armor: 'scroll-blessed-armor.webp',
  scrap: 'scrap.webp', hide: 'leather.webp', fang: 'fang.webp', web: 'web.webp',
  rune_shard: 'ore.webp', frost_shard: 'ore.webp',
};

export function itemArtKey(id, definition = {}) {
  if (definition.slot === 'weapon') {
    const base = definition.baseId || id;
    if (base === 'goblin_cleaver') return 'cleaver';
    if (base === 'chief_maul') return 'maul';
    if (definition.family === 'blade' || definition.family === 'bow') {
      const family = definition.family === 'blade' ? 'sword' : 'bow';
      return definition.huntTier === 3 ? `${family}-t3` : definition.huntTier === 2 ? `${family}-t2` : family;
    }
    if (definition.family === 'focus') {
      if (definition.form !== 'staff') return 'wand';
      return definition.huntTier === 3 ? 'staff-t3' : 'staff-t2';
    }
    return null;
  }
  if (definition.slot === 'body') {
    if ((definition.baseId || id) === 'cloth_tunic') return 'body-cloth';
    if ((definition.baseId || id) === 'warden_plate') return 'body-plate';
    return 'body';
  }
  if (definition.slot === 'head' && definition.armorClass === 'light') return 'head-light';
  if (['hands', 'feet'].includes(definition.slot) && definition.armorClass === 'heavy') return `${definition.slot}-heavy`;
  if (definition.slot) return Object.hasOwn(artwork, definition.slot) ? definition.slot : null;
  return { enhance_stone_1:'stone-low', enhance_stone_2:'stone-mid', enhance_stone_3:'stone-high' }[id]
    || (Object.hasOwn(artwork, id) ? id : null);
}

export function itemArtPath(key) {
  return artwork[key] ? `assets/items/${artwork[key]}` : null;
}

// Capture non-bubbling events on dynamically inserted UI. No inline handlers or
// DOM observer; SVG stays visible until a successful image load, also on failure.
if (typeof document !== 'undefined') {
  for (const event of ['load', 'error']) document.addEventListener(event, ({ target }) => {
    if (!target.matches?.('img.item-art-image')) return;
    const ready = event === 'load' && target.naturalWidth > 0;
    target.closest('.item-art').classList.toggle('art-ready', ready);
    target.hidden = !ready;
  }, true);
}
