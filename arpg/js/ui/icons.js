import { itemArtKey, itemArtPath } from './item-art.js';

// Local art with SVG fallback; labels stay on the containing controls.
const paths = {
  sound: '<path d="M3 9h4l5-5v16l-5-5H3zM16 8q6 4 0 8"/>',
  owner: '<path d="M8 20v-5a4 4 0 0 1 8 0v5M5 20h14"/><circle cx="12" cy="7" r="3"/>',
  potion: '<path d="M9 3h6M10 3v5l-4 6v6h12v-6l-4-6V3M9 15h6m-3-3v6"/>',
  mana_potion: '<path d="M9 3h6M10 3v5l-4 6v6h12v-6l-4-6V3m-2 9-3 4h4l-2 3"/>',
  return_scroll: '<path d="M6 4h12v16H6zM9 12h6m-3-3-3 3 3 3"/>',
  forge: '<path d="m5 4 7 7m-4-9 6 6-4 4-6-6zm4 11 8 8m-5-14 4-4 3 3-4 4M3 21l7-7"/>',
  trainer: '<path d="m12 3 8 9-8 9-8-9zM8 12h8m-4-4v8"/>',
  board: '<path d="M5 3h14v18H5zM8 7h8M8 11h8M8 15h5"/>',
  weapon: '<path d="m6 18 11-11 3-4-4 1L5 15m-2-2 8 8M3 21l4-4"/>',
  bow: '<path d="M5 3q20 9 0 18L5 3m0 9h15m-4-3 4 3-4 3"/>',
  focus: '<path d="m4 21 11-11m0-7 5 5-5 5-5-5z"/>',
  armor: '<path d="m8 3 4 3 4-3 5 6-4 3v9H7v-9L3 9z"/>',
  gold: '<circle cx="12" cy="12" r="8"/><path d="M14 8h-4v8h4v-4h-3"/>',
  scrap: '<path d="m4 8 8-4 8 4-3 12H7zM4 8l8 4 8-4m-8 4v8"/>',
  hide: '<path d="m5 3 7 3 7-3-2 7 3 8-8 3-8-3 3-8z"/>',
  fang: '<path d="M7 3h10q0 13-11 18 7-9 1-18z"/>',
  load: '<path d="M7 7h10l3 13H4z"/><path d="M9 7V5a3 3 0 0 1 6 0v2"/>',
  settings: '<circle cx="12" cy="12" r="4"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4M5 5l3 3m8 8 3 3M5 19l3-3m8-8 3-3"/>',
  depart: '<path d="M3 12h17m-7-7 7 7-7 7"/>',
  dodge: '<path d="m3 16 7-8 3 5 8-9m-5 0h5v5"/>',
  skill: '<path d="m14 2-9 12h6l-1 8 9-13h-6z"/>',
  clear: '<path d="m4 12 5 5L20 5"/>',
  death: '<path d="M5 15v-5a7 7 0 0 1 14 0v5l-3 2v4H8v-4z"/><circle cx="9" cy="11" r="1"/><circle cx="15" cy="11" r="1"/><path d="M12 17v4"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4"/>',
  xp: '<path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3z"/>',
  back: '<path d="M20 12H4m6-6-6 6 6 6"/>',
};

// Approved item silhouettes, embedded locally (no reference-folder dependency).
const silhouettes = {
  "dragon_scale": '<path fill="currentColor" d="m16 2 11 7 3 10-14 12L2 19 5 9z"/><path fill="none" stroke="#141916" stroke-width="2" d="M16 4v25M6 12l10 8 12-8"/>',
  "wood": '<path fill="currentColor" d="m4 15 13-12 9 3 4 9-14 14-9-3z"/><ellipse cx="10" cy="22" rx="7" ry="6" fill="currentColor" stroke="#141916" stroke-width="2"/><ellipse cx="10" cy="22" rx="3" ry="2" fill="none" stroke="#141916" stroke-width="1.5"/><path fill="none" stroke="#141916" stroke-width="2" d="m12 15 12-10m-8 15 12-11"/>',
  "sword": "<path fill=\"currentColor\" d=\"m22 2 6-1-1 7-13 14-4-4zM6 16l12 12 3-3L9 13zM3 26l6-6 3 3-6 6-4 1z\"/>",
  "blunt": '<path fill="currentColor" d="M7 3h20v11H7zm7 11h6v17h-6z"/><path stroke="#141916" stroke-width="2" d="M12 5v7m10-7v7"/>',
  "bow": "<path fill=\"none\" stroke=\"currentColor\" stroke-width=\"3\" d=\"M8 3q27 13 0 26M8 3v26M3 16h26m-5-5 5 5-5 5\"/>",
  "wand": "<path fill=\"currentColor\" d=\"m5 28 15-18 3 3L8 30zM23 1l2 5 6 1-5 4 1 6-5-3-5 3 1-6-5-4 6-1z\"/>",
  "staff": "<path fill=\"none\" stroke=\"currentColor\" stroke-width=\"3\" d=\"M13 30 19 12q-9-2-5-8t11 0q3 5-2 8\"/><path fill=\"currentColor\" d=\"m19 2 5 5-5 4-4-4z\"/>",
  "head": "<path fill=\"currentColor\" d=\"M5 27V14C5-1 27-1 27 14v13l-8 3V19h-6v11z\"/><path stroke=\"#141916\" stroke-width=\"3\" d=\"M9 15h14M16 3v12\"/>",
  "body": "<path fill=\"currentColor\" d=\"m3 7 7-5 6 4 6-4 7 5-4 9-4-2v16H11V14l-4 2z\"/><path fill=\"none\" stroke=\"#141916\" stroke-width=\"2\" d=\"M16 8v18M11 19h10\"/>",
  "hands": "<path fill=\"currentColor\" d=\"M6 29V16L3 9q-1-4 2-4l4 6V4q0-4 3-2l1 8V3q1-4 3-1l1 8 1-5q2-3 3 0l1 10 4-4q4-2 3 2l-7 13v3z\"/>",
  "feet": "<path fill=\"currentColor\" d=\"M9 2h13v15l6 7v5H4v-7l5-7z\"/><path fill=\"none\" stroke=\"#141916\" stroke-width=\"2\" d=\"M10 7h11M10 12h11M5 25h22\"/>",
  "stone-low": "<path fill=\"currentColor\" d=\"m16 2 12 10-4 15-13 3L3 17z\"/><path fill=\"none\" stroke=\"#141916\" stroke-width=\"2\" d=\"m16 8-6 9 9 6 5-10zM14 16h6\"/>",
  "stone-mid": "<path fill=\"currentColor\" d=\"m16 1 12 9-2 17-16 4-8-15z\"/><path fill=\"none\" stroke=\"#141916\" stroke-width=\"2\" d=\"m16 7-7 9 9 9 6-13zM12 15h8m-7 5h6\"/>",
  "stone-high": "<path fill=\"currentColor\" d=\"m16 1 14 13-6 15H8L2 14z\"/><path fill=\"none\" stroke=\"#141916\" stroke-width=\"2\" d=\"m16 6-9 9 9 11 9-11zM12 12h8m-8 5h8m-6 5h4\"/>",
  "scrap": "<path fill=\"currentColor\" d=\"m2 15 10-7 7 5-5 9zM15 3l12 2 3 11-8-3zM18 21l10-5 2 11-9 3z\"/>",
  "leather": "<path fill=\"currentColor\" d=\"m6 2 8 4 11-3 4 8-5 8 2 10-11-3-9 4-4-10 4-9z\"/><path fill=\"none\" stroke=\"#141916\" stroke-width=\"2\" stroke-dasharray=\"2 2\" d=\"m9 8 12 1-2 13-10 1z\"/>",
  "ore": "<path fill=\"currentColor\" d=\"m3 24 4-15 13-6 9 14-5 12H9z\"/><path fill=\"none\" stroke=\"#141916\" stroke-width=\"2\" d=\"m7 9 11 10 11-2M18 19l-3 9\"/>"
};
const aliases = { weapon:'sword', blade:'sword', focus:'wand', armor:'body', hide:'leather', fang:'ore', rune_shard:'ore', frost_shard:'ore', web:'leather', enhance_stone_1:'stone-low', enhance_stone_2:'stone-mid', enhance_stone_3:'stone-high' };
function svgIcon(name) {
  const shape = silhouettes[aliases[name] || name];
  return `<svg class="icon icon-${name} ${shape ? 'silhouette' : ''}" viewBox="0 0 ${shape ? '32 32' : '24 24'}" aria-hidden="true" focusable="false">${shape || paths[name] || paths.load}</svg>`;
}
function pictureIcon(key, fallback) {
  const src = itemArtPath(key);
  if (!src) return fallback;
  return `<span class="icon item-art" aria-hidden="true"><picture><img class="item-art-image" src="${src}" width="96" height="96" alt="" loading="lazy" decoding="async"></picture>${fallback}</span>`;
}
export function icon(name) {
  // Forge stone rows call icon(), not itemIcon(). Empty sockets remain SVG.
  return /^enhance_stone_[123]$/.test(name)
    ? pictureIcon(itemArtKey(name), svgIcon(name)) : svgIcon(name);
}
export function itemIcon(id, definition = {}) {
  const glyph = definition.slot === 'weapon'
    ? (definition.form || (definition.family === 'focus' ? 'wand' : definition.family))
    : definition.slot || id;
  return pictureIcon(itemArtKey(id, definition), svgIcon(glyph));
}
