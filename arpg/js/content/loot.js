// [제안] S5~S7 personal, seeded drops. Wolf hides reuse §10.2 hide instead of a new currency.
export const NEW_MONSTER_DROPS = {
  wolf: {
    gold: [8, 12], stacks: [
      { id: 'hide', count: 2 }, { id: 'fang', count: 1, chance: 0.7 },
      { id: 'scrap', count: 2 }, { id: 'potion', count: 1, chance: 0.2 },
    ], items: [{ id: 'pack_bow', chance: 0.08 }],
  },
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
