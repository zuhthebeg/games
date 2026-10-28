// Presentation only. No inferred stats, rarity, or equipment metadata from pictures.
// These paths are filled only by reviewed, local art; unknown items keep the SVG.
const tier4 = ['revenant_blade','bone_bow','soulfire_wand','gravekeeper_staff','ossuary_maul','shroud_robe','shadow_leather','ossuary_plate','dragonfang_blade','dragon_scale_armor','dragon_scale'];
const shieldArt=['buckler','kite_shield','tower_shield','bone_shield'];
const artwork = {
  ...Object.fromEntries(shieldArt.map(id=>[id,id.replaceAll('_','-')+'.webp'])),
  ...Object.fromEntries(tier4.map(id => [id, id.replaceAll('_', '-') + '.webp'])),
  sword: 'sword.webp', 'sword-t2': 'sword-t2.webp', 'sword-t3': 'sword-t3.webp',
  bow: 'bow.webp', 'bow-t2': 'bow-t2.webp', 'bow-t3': 'bow-t3.webp', cleaver: 'cleaver.webp', maul: 'maul.webp',
  wand: 'wand.webp', 'staff-t2': 'staff-t2.webp', 'staff-t3': 'staff-t3.webp',
  head: 'head-armor-v2.webp', 'head-light': 'head-light-armor-v2.webp', body: 'body.webp',
  'body-cloth': 'body-cloth.webp', 'body-plate': 'body-plate.webp',
  hands: 'hands.webp', 'hands-heavy': 'hands-heavy.webp', feet: 'feet-armor-v2.webp', 'feet-heavy': 'feet-heavy-armor-v2.webp', shield: 'shield-armor-v2.webp',
  'stone-low': 'stone-low.webp', 'stone-mid': 'stone-mid.webp', 'stone-high': 'stone-high.webp',
  green_potion: 'mana-potion.webp', potion: 'potion.webp', mana_potion: 'mana-potion.webp', return_scroll: 'scroll.webp',
  wood: 'wood.webp', scrap: 'scrap.webp', hide: 'leather.webp', fang: 'fang.webp', web: 'web.webp',
  silver_ingot: 'ore.webp', rune_shard: 'ore.webp', frost_shard: 'ore.webp',
};

export function itemArtKey(id, definition = {}) {
  if (shieldArt.includes(definition.baseId || id)) return definition.baseId || id;
  if (tier4.includes(definition.baseId || id)) return definition.baseId || id;
  if (definition.slot === 'weapon') {
    const base = definition.baseId || id;
    if (base === 'goblin_cleaver') return 'cleaver';
    if (base === 'chief_maul' || definition.form === 'blunt') return 'maul';
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
  if (definition.slot === 'offhand' && definition.form === 'shield') return 'shield';
  if (definition.slot === 'head' && (definition.armorClass === 'light' || definition.material === 'leather')) return 'head-light';
  if (['hands', 'feet'].includes(definition.slot) && definition.armorClass === 'heavy') return `${definition.slot}-heavy`;
  if (definition.slot) return Object.hasOwn(artwork, definition.slot) ? definition.slot : null;
  return { enhance_stone_1:'stone-low', enhance_stone_2:'stone-mid', enhance_stone_blessed:'stone-high', enhance_stone_cursed:'stone-mid' }[id]
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
