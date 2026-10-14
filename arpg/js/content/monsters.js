// Display/identity metadata, separate from combat numbers (design §11, §25).
// [제안] Minimal orthogonal identity only; no implicit affinity, taming or material rules.
export const DANGER_COLORS = { active: 0xf0655e, preparation: 0xe7ad47 };
export const MONSTER_PALETTES = {
  dragon: [0xeef5e4], straw: [0xae8e53], goblin: [0x73934c], slinger: [0x547c50],
  boar: [0x79573f], chief: [0xe58b70],
  wolf: [0x939da2], rune: [0x7e8f94], spirit: [0x9c91c9], spider: [0x657d50],
  ghoul: [0xffffff], ghost: [0xffffff], bat: [0xffffff],
  demon: [0xffffff], goleling: [0xffffff], slime: [0xffffff],
  skeleton: [0xffffff], // Neutral multiplier preserves KayKit's baked source colors.
};
export const MONSTER_MODELS = [
  'scarecrow', 'training_dragon', 'throne_dragon', 'goblin_grunt', 'goblin_slinger', 'iron_boar', 'goblin_chief',
  'gargoyle', 'wolf', 'rune_guardian', 'spirit', 'poison_spider',
  'skeleton_minion', 'skeleton_warrior', 'skeleton_rogue', 'skeleton_mage',
  'ghoul', 'ghost', 'bat',
  'demon', 'goleling', 'slime',
];
export const MONSTER_NAMES = {
  ghoul: '구울', ghost: '유령', bat: '거대 박쥐',
  demon: '악마', goleling: '고링', slime: '슬라임',
  gargoyle: '석상 가고일',
  throne_dragon: '왕좌의 수호룡', training_dragon: '드래곤', scarecrow: '허수아비', goblin_grunt: '고블린', goblin_slinger: '고블린 투석병',
  iron_boar: '철갑 멧돼지', goblin_chief: '고블린 대장',
  wolf: '적대 늑대', rune_guardian: '룬 수호자', spirit: '제단 정령', poison_spider: '독거미',
  skeleton_minion: '해골 졸개', skeleton_warrior: '해골 전사',
  skeleton_rogue: '해골 도적', skeleton_mage: '해골 마법사',
};
const variant = (id, paletteId, speciesTags, lifeState) => ({
  baseArchetypeId: id, baseModelId: id, paletteId, nameKey: id,
  speciesTags, lifeState, disposition: 'hostile',
});
export const MONSTER_VARIANTS = {
  demon: variant('demon', 'demon', ['demon', 'humanoid'], 'living'),
  goleling: variant('goleling', 'goleling', ['goleling', 'crafted'], 'construct'),
  slime: variant('slime', 'slime', ['slime'], 'living'),
  ghoul: variant('ghoul', 'ghoul', ['ghoul', 'humanoid'], 'undead'),
  ghost: variant('ghost', 'ghost', ['ghost'], 'undead'),
  bat: variant('bat', 'bat', ['bat', 'beast'], 'beast'),
  gargoyle: variant('gargoyle', 'rune', ['guardian', 'crafted', 'gargoyle'], 'construct'),
  throne_dragon: variant('throne_dragon', 'dragon', ['dragon', 'boss'], 'living'),
  training_dragon: variant('training_dragon', 'dragon', ['dragon', 'trainingDummy'], 'living'),
  scarecrow: variant('scarecrow', 'straw', ['trainingDummy'], 'construct'),
  goblin_grunt: variant('goblin_grunt', 'goblin', ['goblin', 'humanoid'], 'living'),
  goblin_slinger: variant('goblin_slinger', 'slinger', ['goblin', 'humanoid'], 'living'),
  iron_boar: variant('iron_boar', 'boar', ['boar', 'beast'], 'living'),
  goblin_chief: variant('goblin_chief', 'chief', ['goblin', 'humanoid'], 'living'),
  wolf: variant('wolf', 'wolf', ['wolf', 'beast'], 'living'),
  rune_guardian: variant('rune_guardian', 'rune', ['guardian', 'crafted'], 'construct'),
  spirit: variant('spirit', 'spirit', ['elemental'], 'spirit'),
  poison_spider: variant('poison_spider', 'spider', ['spider', 'beast'], 'living'),
  skeleton_minion: variant('skeleton_minion', 'skeleton', ['skeleton', 'humanoid'], 'undead'),
  skeleton_warrior: variant('skeleton_warrior', 'skeleton', ['skeleton', 'humanoid'], 'undead'),
  skeleton_rogue: variant('skeleton_rogue', 'skeleton', ['skeleton', 'humanoid'], 'undead'),
  skeleton_mage: variant('skeleton_mage', 'skeleton', ['skeleton', 'humanoid'], 'undead'),
};
