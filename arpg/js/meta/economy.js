import { BALANCE } from '../content/balance.js';
// M1.5 proposal constants: P3 tunes this file, not simulation code.
export const SLOTS = ['weapon', 'head', 'body', 'hands', 'feet'];
export const ENHANCE_GOLD = [45, 71, 101, 138, 180];
export const ENHANCE_STONES = [1, 1, 1, 2, 2];
export const ENHANCE_STONE_IDS = ['enhance_stone_1', 'enhance_stone_1', 'enhance_stone_2', 'enhance_stone_2', 'enhance_stone_3'];
export const SALVAGE = { common: 2, fine: 5, rare: 12, epic: 30 };
export const ECONOMY = {
  gearChance: 0.1, eliteGearChance: 0.35, stoneChance: 0.125, eliteStoneChance: 0.4,
  normalRarity: BALANCE.threats[0].rarity, bossRarity: BALANCE.threats[0].bossRarity,
  stoneWeights: { 1: [85, 14, 1], 2: [45, 45, 10], 3: [20, 45, 35] },
  rarityPrice: { common: 1, fine: 1.6, rare: 3, epic: 5 },
  rarityPower: { common: 1, fine: 1.15, rare: 1.32, epic: 1.5 },
  starterBodyHp: { common: 0, fine: 12, rare: 20, epic: 28 },
  slotPrice: { weapon: 60, head: 24, body: 50, hands: 22, feet: 22 },
  craftRefundFraction: 0.25, optionPriceFactor: 0.2, bossExtraChance: 0.5, sellFraction: 0.25, dropBonusCap: 15, pityRounds: 6, refreshRounds: 3, refreshGold: 20,
  affixCount: { common: 0, fine: 1, rare: 2, epic: 3 },
};
export const AFFIX_RANGES = {
  atk_pct: [2, 6], hp_flat: [4, 12], speed_pct: [1, 4], dodge_pct: [2, 6],
  potion_pct: [3, 8], mana_pct: [3, 8], capacity_flat: [2, 6],
  gold_pct: [2, 7], material_pct: [2, 7],
};
export const SLOT_BIASES = {
  wolf: { feet: 2, hands: 2, body: 0.5 },
  iron_boar: { body: 2, feet: 1.5, weapon: 0.5 },
  rune_guardian: { body: 2, head: 2, hands: 0.5 },
  spirit: { weapon: 2, head: 1.5, body: 0.5 },
  poison_spider: { hands: 2, feet: 2, body: 0.5 },
};
export function rng(seed) {
  let state = seed >>> 0;
  return () => {
    let value = state = (state + 0x6d2b79f5) >>> 0;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
export function weighted(entries, random) {
  let value = random() * entries.reduce((sum, [, weight]) => sum + weight, 0);
  for (const [key, weight] of entries) { value -= weight; if (value < 0) return key; }
  return entries.at(-1)[0];
}
export const enhanceCost = (level) => ({ gold: ENHANCE_GOLD[level], [ENHANCE_STONE_IDS[level]]: ENHANCE_STONES[level] });

export const RECIPES = {
  iron_sword: { scrap: 8, fang: 2, gold: 60 },
  hunter_bow: { scrap: 8, hide: 2, gold: 60 },
  ember_wand: { scrap: 8, fang: 3, gold: 60 },
  boar_hide_armor: { scrap: 6, hide: 4, gold: 50 },
  leather_vest: { scrap: 5, hide: 3, gold: 40 },
  // [제안] Scrap remains the common sink; craft salvage refunds only 25% of scrap.
  rune_blade: { scrap: 16, rune_shard: 2, fang: 2, gold: 140 },
  pack_bow: { scrap: 16, hide: 4, web: 2, gold: 140 },
  altar_staff: { scrap: 16, rune_shard: 2, frost_shard: 3, gold: 140 },
  woven_armor: { scrap: 16, hide: 4, web: 4, gold: 140 },
};
export const enhanceMultiplier = (level) => 1 + 0.04 * level + 0.002 * level ** 2;
