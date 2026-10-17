import { BALANCE } from '../content/balance.js';
// M1.5 proposal constants: P3 tunes this file, not simulation code.
export const LEGACY_SLOTS = ['weapon', 'head', 'body', 'hands', 'feet'];
export const SLOTS = [...LEGACY_SLOTS, 'offhand'];
// Plain stones cost five per attempt; specials are shared by every equipment slot.
// Normal failures above the safe line destroy gear; rates use the CURRENT level.
export const ENCHANT = {
  safe: 6, max: 12,
  rates: { 6: 0.5, 7: 0.4, 8: 0.3, 9: 0.2, 10: 0.15, 11: 0.10 },
  stonesPerAttempt: 5, greaterYield: [5, 10],
  // Dismantle refund by enhance level (+0..+12); the greater stone is the "cash out" at +7 and above.
  // cocy 10-14: every enhanced item returns stones on dismantle (+1 was 0).
  dismantleStones: [0, 1, 2, 3, 4, 5, 7, 10, 14, 18, 24, 30, 38],
  dismantleGreater: [0, 0, 0, 0, 0, 0, 0, 1, 1, 2, 3, 4, 5],
  // A destroyed item leaves this fraction of its dismantle stones, never the greater stone.
  failRefund: 0.5,
  // Blessed always succeeds; cursed never destroys gear.
  blessedSteps: [1, 2], blessedRiskWeights: [85, 15],
  cursedSteps: [-1, 0, 1, 2, 3], cursedWeights: [15, 20, 30, 25, 10],
  stoneCount: { normal: [1, 2], elite: [2, 3], boss: [3, 5] },
  blessedChance: { normal: 0.002, elite: 0.03, boss: 0.15 },
  cursedChance: { normal: 0.006, elite: 0.06, boss: 0.25 },
};
export const STONE = 'enhance_stone_1';
export const GREATER_STONE = 'enhance_stone_3';
export const BLESSED_STONE = 'enhance_stone_blessed';
export const CURSED_STONE = 'enhance_stone_cursed';
export const ENCHANT_STONES = [STONE, BLESSED_STONE, CURSED_STONE];
export const MATERIAL_STACK = { metal: 'scrap', leather: 'hide', wood: 'wood', cloth: 'web', rune: 'rune_shard' };
export const SALVAGE = { common: 2, fine: 5, rare: 12, epic: 30 };
export const ECONOMY = {
  questExtraGearChance: 0.1, // Per-player quest budget: 90% one slot, 10% two; never scales with threat.
  gearChance: 0.04, eliteGearChance: 0.16, stoneChance: 0.125, eliteStoneChance: 0.4,
  gearTierMultiplier: { 1: 1, 2: 0.85, 3: 0.70, 4: 0.55 },
  gearRarityMultiplier: { common: 1, fine: 1, rare: 0.7, epic: 0.5 },
  dropEnhanceWeights: { normal: [50,25,12,7,4,2,0], elite: [20,25,22,17,10,5,1], boss: [5,15,20,25,20,10,5] },
  normalRarity: BALANCE.threats[0].rarity, bossRarity: BALANCE.threats[0].bossRarity,
  // [강화석, 상급 강화석] weight per stone drop event, by hunting tier.
  stoneWeights: { 1: [97, 3], 2: [92, 8], 3: [82, 18] },
  rarityPrice: { common: 1, fine: 1.6, rare: 3, epic: 5 },
  rarityPower: { common: 1, fine: 1.15, rare: 1.32, epic: 1.5 },
  starterBodyHp: { common: 0, fine: 12, rare: 20, epic: 28 },
  slotPrice: { offhand: 40, weapon: 60, head: 24, body: 50, hands: 22, feet: 22 },
  craftRefundFraction: 0.25, optionPriceFactor: 0.2, bossExtraChance: 0.25, stoneExtraChance: 0.5, sellFraction: 0.25, dropBonusCap: 15, pityRounds: 6, refreshRounds: 3, refreshGold: 20,
  affixCount: { common: 0, fine: 1, rare: 2, epic: 3 },
};
export const AFFIX_RANGES = {
  atk_pct: [2, 6], hp_flat: [4, 12], speed_pct: [1, 4], dodge_pct: [2, 6],
  potion_pct: [3, 8], mana_pct: [3, 8], capacity_flat: [2, 6],
  gold_pct: [2, 7], material_pct: [2, 7],
  // cocy 10-12: gear can raise stats past the allocation cap of 100.
  str_flat: [2, 5], agi_flat: [2, 5], int_flat: [2, 5], wis_flat: [2, 5], con_flat: [2, 5], luk_flat: [2, 5], cha_flat: [2, 5],
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

export const RECIPES = {
  iron_sword: { scrap: 8, fang: 2, gold: 60 },
  hunter_bow: { wood: 8, hide: 2, gold: 60 },
  ember_wand: { wood: 8, fang: 3, gold: 60 },
  boar_hide_armor: { hide: 6, scrap: 4, gold: 50 },
  leather_vest: { hide: 5, scrap: 3, gold: 40 },
  // Primary materials follow the result; craft salvage refunds only 25% of that ingredient.
  rune_blade: { rune_shard: 16, scrap: 2, fang: 2, gold: 140 },
  rune_maul: { rune_shard: 16, scrap: 4, fang: 2, gold: 140 },
  warden_maul: { scrap: 24, rune_shard: 8, frost_shard: 4, gold: 240 },
  pack_bow: { wood: 16, hide: 4, web: 2, gold: 140 },
  altar_staff: { wood: 16, rune_shard: 2, frost_shard: 3, gold: 140 },
  woven_armor: { web: 16, hide: 4, scrap: 4, gold: 140 },
  // T4: 1.5x T3 warden_maul budget (240g / 36 materials) plus one guardian scale.
  // The primary material follows each item's actual metal/wood/cloth/leather tag.
  revenant_blade: { scrap: 36, rune_shard: 12, frost_shard: 6, dragon_scale: 1, gold: 360 },
  bone_bow: { wood: 36, hide: 12, frost_shard: 6, dragon_scale: 1, gold: 360 },
  soulfire_wand: { wood: 36, rune_shard: 12, frost_shard: 6, dragon_scale: 1, gold: 360 },
  gravekeeper_staff: { wood: 36, rune_shard: 12, frost_shard: 6, dragon_scale: 1, gold: 360 },
  ossuary_maul: { scrap: 36, rune_shard: 12, frost_shard: 6, dragon_scale: 1, gold: 360 },
  shroud_robe: { web: 36, rune_shard: 12, frost_shard: 6, dragon_scale: 1, gold: 360 },
  shadow_leather: { hide: 36, rune_shard: 12, frost_shard: 6, dragon_scale: 1, gold: 360 },
  ossuary_plate: { scrap: 36, rune_shard: 12, frost_shard: 6, dragon_scale: 1, gold: 360 },
};
// Above the safe line each risky level adds a further +4% so +7~+12 are worth the gamble.
export const enhanceMultiplier = (level) => 1 + 0.04 * level + 0.002 * level ** 2 + 0.04 * Math.max(0, level - ENCHANT.safe);
