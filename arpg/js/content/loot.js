// [제안] S5~S7 personal, seeded drops. Wolf hides reuse §10.2 hide instead of a new currency.
export const NEW_MONSTER_DROPS = {
  // Same bounded late guardian materials; ordinary T4 rolls, no chief-only guarantee.
  necropolis_lord: { gold:[18,26], stacks:[{id:'rune_shard',count:2},{id:'scrap',count:4}], items:[] },
  // T4 frontier: reuse guardian, rogue and spirit material budgets.
  ash_reaver: { gold:[18,26], stacks:[{id:'rune_shard',count:2},{id:'scrap',count:4}], items:[] },
  veil_stalker: { gold:[3,6], stacks:[{id:'fang',count:1},{id:'hide',count:1,chance:.3}], items:[] },
  cinder_oracle: { gold:[10,16], stacks:[{id:'frost_shard',count:2},{id:'web',count:2},{id:'mana_potion',count:1,chance:.25}], items:[] },
  // Frost cavern: late T4 guardian/beast budgets, no new loot currency.
  orc_raider: { gold:[12,18], stacks:[{id:'web',count:3},{id:'scrap',count:3},{id:'potion',count:1,chance:.2}], items:[] },
  frost_yeti: { gold:[8,12], stacks:[{id:'hide',count:2},{id:'fang',count:1,chance:.7},{id:'wood',count:2},{id:'potion',count:1,chance:.2}], items:[] },
  stone_giant: { gold:[18,26], stacks:[{id:'rune_shard',count:2},{id:'scrap',count:4}], items:[] },
  // Abyssal trench: existing T4 materials and equipment pools, no new currency.
  abyss_glub: { gold:[10,17], stacks:[{id:'hide',count:2},{id:'frost_shard',count:1},{id:'potion',count:1,chance:.2}], items:[] },
  drowned_skull: { gold:[10,17], stacks:[{id:'web',count:2},{id:'frost_shard',count:1},{id:'mana_potion',count:1,chance:.25}], items:[] },
  abyss_squidle: { gold:[19,27], stacks:[{id:'rune_shard',count:2},{id:'frost_shard',count:2},{id:'scrap',count:3}], items:[] },
  // Spore hollow: existing T4 materials and equipment pools, no new currency.
  spore_mushnub: { gold:[10,16], stacks:[{id:'hide',count:2},{id:'wood',count:2},{id:'potion',count:1,chance:.2}], items:[] },
  gale_hywirl: { gold:[10,16], stacks:[{id:'frost_shard',count:1},{id:'web',count:2},{id:'mana_potion',count:1,chance:.25}], items:[] },
  spore_king: { gold:[18,26], stacks:[{id:'rune_shard',count:2},{id:'wood',count:3},{id:'scrap',count:3}], items:[] },
  // Sun dunes: existing T4 materials and equipment pools, no new currency.
  dune_cactoro: { gold:[12,18], stacks:[{id:'wood',count:3},{id:'fang',count:1,chance:.6},{id:'potion',count:1,chance:.2}], items:[] },
  sun_totem: { gold:[10,16], stacks:[{id:'rune_shard',count:1},{id:'web',count:2},{id:'mana_potion',count:1,chance:.25}], items:[] },
  crown_alpaking: { gold:[18,26], stacks:[{id:'rune_shard',count:2},{id:'hide',count:2},{id:'scrap',count:3}], items:[] },
  // Deep mire: existing T4 materials and equipment pools, no new currency.
  marsh_wasp: { gold:[8,12], stacks:[{id:'hide',count:2},{id:'fang',count:1,chance:.7},{id:'wood',count:2},{id:'potion',count:1,chance:.2}], items:[] },
  bog_wizard: { gold:[10,16], stacks:[{id:'frost_shard',count:2},{id:'web',count:2},{id:'mana_potion',count:1,chance:.25}], items:[] },
  mire_frog: { gold:[12,18], stacks:[{id:'web',count:3},{id:'scrap',count:3},{id:'potion',count:1,chance:.2}], items:[] },
  // Succubus placement: exact slinger draws; unchanged explicit S19 hunt tier.
  succubus: { gold:[2,5], stacks:[{id:'wood',count:1,chance:.5},{id:'hide',count:1,chance:.3},{id:'mana_potion',count:1,chance:.15}], items:[] },
  // Succubus placement end.
  // M2b placement: exact legacy grunt draws, including its side-roll; explicit map hunt tiers stay unchanged.
  demon: { gold:[3,6], stacks:[{id:'scrap',count:1,chance:.6},{id:'fang',count:1,chance:.4},{id:'potion',count:1,chance:.15}], items:[{id:'goblin_cleaver',chance:.06}] },
  goleling: { gold:[3,6], stacks:[{id:'scrap',count:1,chance:.6},{id:'fang',count:1,chance:.4},{id:'potion',count:1,chance:.15}], items:[{id:'goblin_cleaver',chance:.06}] },
  slime: { gold:[3,6], stacks:[{id:'scrap',count:1,chance:.6},{id:'fang',count:1,chance:.4},{id:'potion',count:1,chance:.15}], items:[{id:'goblin_cleaver',chance:.06}] },
  // M2b placement end.
  // U5: reuse existing materials and late guardian/spirit budgets; no legacy gear side-rolls.
  skeleton_minion: { gold:[3,6], stacks:[{id:'scrap',count:1,chance:.6},{id:'fang',count:1,chance:.4},{id:'potion',count:1,chance:.15}], items:[] },
  skeleton_warrior: { gold:[6,10], stacks:[{id:'scrap',count:2},{id:'rune_shard',count:1,chance:.5}], items:[] },
  skeleton_rogue: { gold:[3,6], stacks:[{id:'fang',count:1},{id:'hide',count:1,chance:.3}], items:[] },
  skeleton_mage: { gold:[10,16], stacks:[{id:'rune_shard',count:2},{id:'wood',count:2},{id:'mana_potion',count:1,chance:.25}], items:[] },
  ghoul: { gold:[12,18], stacks:[{id:'web',count:3},{id:'scrap',count:3},{id:'potion',count:1,chance:.2}], items:[] },
  ghost: { gold:[10,16], stacks:[{id:'frost_shard',count:2},{id:'web',count:2},{id:'mana_potion',count:1,chance:.25}], items:[] },
  bat: { gold:[8,12], stacks:[{id:'hide',count:2},{id:'fang',count:1,chance:.7},{id:'wood',count:2},{id:'potion',count:1,chance:.2}], items:[] },
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

// Existing T4 weapon/body pool; U5 uses it through the ordinary quest gear budget.
export const TIER4_GEAR_DROPS = [
  'revenant_blade', 'bone_bow', 'soulfire_wand', 'gravekeeper_staff',
  'ossuary_maul', 'shroud_robe', 'shadow_leather', 'ossuary_plate',
];
