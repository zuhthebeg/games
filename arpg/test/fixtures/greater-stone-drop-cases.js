import { createHash } from 'node:crypto';
// Shared by the legacy-drop fixture generator (run once against the pre-conversion code) and its test.
export const STONE = 'enhance_stone_1', LEGACY_GREATER = 'enhance_stone_3';
export const MONSTERS = [['goblin_slinger', {}], ['goblin_slinger', { elite: true }], ['goblin_chief', {}],
  ['wolf', { boss: true }], ['spirit', { elite: true, materialBonus: 12 }], ['goblin_slinger', { threat: 2, dropLuck: .5 }]];
export const SEEDS = 120;
export function* legacyCases() {
  for (const tier of [1, 2, 3, 4]) for (const [monster, base] of MONSTERS) for (let seed = 0; seed < SEEDS; seed++)
    yield { monster, seed, ctx: { ...base, huntTier: tier } };
}
// [plain stones, legacy greater stones, digest of everything else in the loot]
export function digest(loot) {
  const { stacks, ...rest } = loot;
  const others = Object.fromEntries(Object.entries(stacks).filter(([id]) => id !== STONE && id !== LEGACY_GREATER).sort(([a], [b]) => a < b ? -1 : 1));
  return createHash('sha256').update(JSON.stringify({ rest, others })).digest('hex').slice(0, 12);
}
// Historical baselines retain greater entries: remove only those retired rewards.
export function projectLegacyStones(loot) {
  const stacks = { ...loot.stacks }, greater = stacks[LEGACY_GREATER];
  if (greater === undefined) return loot;
  delete stacks[LEGACY_GREATER];
  return { ...loot, stacks };
}
