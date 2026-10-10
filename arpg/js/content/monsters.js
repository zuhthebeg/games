// Display/identity metadata, separate from combat numbers (design §11, §25).
// [제안] Minimal orthogonal identity only; no implicit affinity, taming or material rules.
export const DANGER_COLORS = { active: 0xf0655e, preparation: 0xe7ad47 };
export const MONSTER_PALETTES = {
  straw: [0xae8e53], goblin: [0x73934c], slinger: [0x547c50],
  boar: [0x79573f], chief: [0xe58b70],
  wolf: [0x939da2], rune: [0x7e8f94], spirit: [0x9c91c9], spider: [0x657d50],
};
export const MONSTER_MODELS = [
  'scarecrow', 'goblin_grunt', 'goblin_slinger', 'iron_boar', 'goblin_chief',
  'wolf', 'rune_guardian', 'spirit', 'poison_spider',
];
export const MONSTER_NAMES = {
  scarecrow: '허수아비', goblin_grunt: '고블린', goblin_slinger: '고블린 투석병',
  iron_boar: '철갑 멧돼지', goblin_chief: '고블린 대장',
  wolf: '적대 늑대', rune_guardian: '룬 수호자', spirit: '제단 정령', poison_spider: '독거미',
};
const variant = (id, paletteId, speciesTags, lifeState) => ({
  baseArchetypeId: id, baseModelId: id, paletteId, nameKey: id,
  speciesTags, lifeState, disposition: 'hostile',
});
export const MONSTER_VARIANTS = {
  scarecrow: variant('scarecrow', 'straw', ['trainingDummy'], 'construct'),
  goblin_grunt: variant('goblin_grunt', 'goblin', ['goblin', 'humanoid'], 'living'),
  goblin_slinger: variant('goblin_slinger', 'slinger', ['goblin', 'humanoid'], 'living'),
  iron_boar: variant('iron_boar', 'boar', ['boar', 'beast'], 'living'),
  goblin_chief: variant('goblin_chief', 'chief', ['goblin', 'humanoid'], 'living'),
  wolf: variant('wolf', 'wolf', ['wolf', 'beast'], 'living'),
  rune_guardian: variant('rune_guardian', 'rune', ['guardian', 'crafted'], 'construct'),
  spirit: variant('spirit', 'spirit', ['elemental'], 'spirit'),
  poison_spider: variant('poison_spider', 'spider', ['spider', 'beast'], 'living'),
};
