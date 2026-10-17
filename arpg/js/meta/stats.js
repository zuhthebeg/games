import { BALANCE, statEffect } from '../content/balance.js';
import { SKILL_USE } from '../content/combat.js';
const S = BALANCE.stats;
import { SLOTS } from './economy.js';
import { affixTotals } from './affixes.js';
import { ITEMS, equippedItem, enhanceMultiplier, cloneSave, armorAc, effectiveWeight } from './items.js';

export const STAT_KEYS = ['str', 'agi', 'int', 'wis', 'con', 'luk', 'cha'];
export const BASE_STATS = Object.fromEntries(STAT_KEYS.map((key) => [key, S.base]));
export const STAT_NAMES = { str: '힘', agi: '민첩', int: '지능', wis: '지혜', con: '체력', luk: '행운', cha: '카리스마' };
export const cap = (level) => Math.min(S.capMax, S.capBase + S.capPerLevel * level);
// Total points a level grants (allocated above base + unspent).
export const statBudget = (level) => S.startPoints + S.pointsPerLevel * (level - 1);

export const eff = statEffect;
// 0 at base, 1 at 100, keeps rising past 100 (gear).
export const norm = (value) => Math.max(0, value - S.base) / (S.capMax - S.base);

// Allocated stats + flat stat affixes on equipped gear (gear is not capped).
export function effectiveStats(save) {
  const gear = SLOTS.map((slot) => equippedItem(save, slot)).filter(Boolean);
  const affixes = affixTotals(gear);
  return Object.fromEntries(STAT_KEYS.map((key) => [key, (save.stats[key] ?? S.base) + (affixes[`${key}_flat`] || 0)
    + gear.reduce((sum, item) => sum + (ITEMS[item.id].innateStats?.[key] || 0), 0)]));
}

export function allocateStats(save, allocation) {
  if (Object.keys(allocation).some((key) => !STAT_KEYS.includes(key))) throw new Error('알 수 없는 능력치입니다.');
  let spent = 0;
  for (const key of STAT_KEYS) {
    const points = allocation[key] ?? 0;
    if (!Number.isSafeInteger(points) || points < 0 || save.stats[key] + points > cap(save.level)) {
      throw new Error('능력치 상한 또는 배분 수량을 확인하세요.');
    }
    spent += points;
  }
  if (spent > save.statPoints) throw new Error('배분할 포인트가 부족합니다.');
  const next = cloneSave(save);
  for (const key of STAT_KEYS) next.stats[key] += allocation[key] ?? 0;
  next.statPoints -= spent;
  return next;
}

export function deriveMods(save) {
  const stats = effectiveStats(save);
  const weapon = equippedItem(save, 'weapon');
  const gear = SLOTS.map((slot) => equippedItem(save, slot)).filter(Boolean);
  const affixes = affixTotals(gear);
  const family = ITEMS[weapon?.id]?.family || 'blade';
  const weaponDamage = (ITEMS[weapon?.id]?.power || 1) * enhanceMultiplier(weapon?.enhance || 0) * (1 + affixes.atk_pct / 100)
    * (1 + 0.03 * (save.level - 1));
  // Skills-v2 §4: every family the held weapon may fire gets weapon damage × its share; magic always scales with INT.
  const familyDamage = (skillFamily) => {
    const share = SKILL_USE[skillFamily][family];
    return share === undefined ? 1 : weaponDamage * share * (skillFamily === 'focus' ? 1 + S.focusDamage * eff(stats.int) : 1);
  };
  return {
    maxHp: 100 + 8 * save.level + affixes.hp_flat,
    ac: gear.reduce((sum, item) => sum + armorAc(item), 0),
    effectiveInt: stats.int,
    ...(ITEMS[weapon?.id]?.affinity ? { staffAffinity: ITEMS[weapon.id].affinity } : {}),
    maxMp: 100 + S.mp * eff(stats.int),
    mpRegen: S.mpRegenAt100 * (S.mpRegenFloor + (1 - S.mpRegenFloor) * stats.wis / 100) * (1 + affixes.mana_pct / 100),
    hpRegen: S.hpRegenAt100 * stats.con / 100,
    critChance: S.luckCrit * norm(stats.luk), critMult: S.critMult,
    dropLuck: S.luckDrop * norm(stats.luk), enchantLuck: S.luckEnchant * norm(stats.luk),
    speedMult: (1 + Math.min(S.speedCap, S.speed * eff(stats.agi))) * (1 + affixes.speed_pct / 100),
    dodgeCdMult: Math.max(S.dodgeFloor, 1 - S.dodge * eff(stats.agi)) * (1 - Math.min(50, affixes.dodge_pct) / 100),
    iframeBonusMs: Math.min(S.iframeCap, S.iframe * eff(stats.agi)),
    potionHealMult: (1 + Math.min(S.potionCap, S.potion * eff(stats.wis))) * (1 + affixes.potion_pct / 100),
    poiseMult: 1 + S.poise * eff(stats.str),
    dmgMult: Object.fromEntries(Object.keys(SKILL_USE).map((f) => [f, familyDamage(f)])),
    attackSpeedBonus: Math.min(BALANCE.attackSpeed.agiCap, BALANCE.attackSpeed.agiPerEff * eff(stats.agi)),
    armorWeight: effectiveWeight(equippedItem(save, 'body')),
    ...(ITEMS[weapon?.id]?.form ? { weaponForm: ITEMS[weapon.id].form } : {}),
    weaponWeight: weapon ? effectiveWeight(weapon) : BALANCE.attackSpeed.weightReference,
    cdMult: 1,
    capacity: 100 + S.capacity * eff(stats.str) + affixes.capacity_flat,
    goldBonus: affixes.gold_pct, materialBonus: affixes.material_pct,
    shopDiscount: Math.min(S.discountCap, S.discount * eff(stats.cha)),
    family,
  };
}
