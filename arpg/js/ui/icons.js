// One stroke-only icon set; labels stay on the containing control for screen readers.
const paths = {
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

export function icon(name) {
  return `<svg class="icon icon-${name}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths[name] || paths.weapon}</svg>`;
}

export function itemIcon(id, definition) {
  return icon(paths[id] ? id : ['head', 'body', 'hands', 'feet'].includes(definition.kind) ? 'armor'
    : definition.family === 'blade' ? 'weapon' : definition.family);
}

