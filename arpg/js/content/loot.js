// [제안] S5~S7 personal, seeded drops. Wolf hides reuse §10.2 hide instead of a new currency.
export const NEW_MONSTER_DROPS = {
  // Existing late guardian rewards; ordinary T3 gear rolls, no chief guarantee or new currency.
  throne_dragon: { gold: [18, 26], stacks: [{ id: 'rune_shard', count: 2 }, { id: 'scrap', count: 4 }, { id: 'fang', count: 2 }, { id: 'dragon_scale', count: 1 }], items: [{ id: 'dragonfang_blade', chance: 0.04, exclusive: true }, { id: 'dragon_scale_armor', chance: 0.04, exclusive: true }] },
  wolf: {
    gold: [8, 12], stacks: [
      { id: 'hide', count: 2 }, { id: 'fang', count: 1, chance: 0.7 },
      { id: 'wood', count: 2 }, { id: 'potion', count: 1, chance: 0.2 },
    ], items: [{ id: 'pack_bow', chance: 0.08 }],
  },
  gargoyle: { gold:[18,26], stacks:[{id:'rune_shard',count:2},{id:'scrap',count:4}], items:[{id:'rune_blade',chance:0.12}] },
  rune_guardian: {
    gold: [18, 26], stacks: [
      { id: 'rune_shard', count: 2 }, { id: 'scrap', count: 4 },
    ], items: [{ id: 'rune_blade', chance: 0.12 }],
  },
  spirit: {
    gold: [10, 16], stacks: [
      { id: 'frost_shard', count: 2 }, { id: 'scrap', count: 2 },
      { id: 'mana_potion', count: 1, chance: 0.25 },
    ], items: [{ id: 'altar_staff', chance: 0.1 }],
  },
  poison_spider: {
    gold: [12, 18], stacks: [
      { id: 'web', count: 3 }, { id: 'scrap', count: 3 },
      { id: 'potion', count: 1, chance: 0.2 },
    ], items: [{ id: 'woven_armor', chance: 0.1 }],
  },
};

// Definition only: no T4 stage or live generic T4 roll path is enabled yet.
export const TIER4_GEAR_DROPS = [
  'revenant_blade', 'bone_bow', 'soulfire_wand', 'gravekeeper_staff',
  'ossuary_maul', 'shroud_robe', 'shadow_leather', 'ossuary_plate',
];
