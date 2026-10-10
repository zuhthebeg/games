import { SLOTS } from './economy.js';
import { affixTotals } from './affixes.js';
import { ITEMS, equippedItem, enhanceMultiplier, cloneSave } from './items.js';

export const STAT_KEYS = ['str', 'agi', 'int', 'wis', 'cha'];
export const BASE_STATS = Object.fromEntries(STAT_KEYS.map((key) => [key, 5]));
export const STAT_NAMES = { str: '힘', agi: '민첩', int: '지능', wis: '지혜', cha: '카리스마' };
export const cap = (level) => Math.max(20, Math.min(40, 10 + level));

export function eff(value) {
  const delta = Math.max(0, value - 5);
  return delta <= 10 ? delta : 10 + (delta - 10) * 0.7;
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
  const stats = save.stats;
  const weapon = equippedItem(save, 'weapon');
  const gear = SLOTS.map((slot) => equippedItem(save, slot)).filter(Boolean);
  const affixes = affixTotals(gear);
  const family = ITEMS[weapon?.id]?.family || 'blade';
  const damage = (ITEMS[weapon?.id]?.power || 1) * enhanceMultiplier(weapon?.enhance || 0) * (1 + affixes.atk_pct / 100)
    * (1 + 0.03 * (save.level - 1)) * (family === 'focus' ? 1 + 0.02 * eff(stats.int) : 1);
  return {
    maxHp: 100 + 8 * save.level + gear.reduce((sum, item) => sum + (ITEMS[item.id].hp || 0) * enhanceMultiplier(item.enhance), 0) + affixes.hp_flat,
    maxMp: 100 + 4 * eff(stats.int),
    mpRegen: 5 * (1 + 0.03 * eff(stats.wis)) * (1 + affixes.mana_pct / 100),
    speedMult: (1 + Math.min(0.1, 0.005 * eff(stats.agi))) * (1 + affixes.speed_pct / 100),
    dodgeCdMult: Math.max(0.8 / 1.15, 1 - 0.015 * eff(stats.agi)) * (1 - Math.min(50, affixes.dodge_pct) / 100),
    iframeBonusMs: Math.min(60, 3 * eff(stats.agi)),
    potionHealMult: (1 + Math.min(0.25, 0.01 * eff(stats.wis))) * (1 + affixes.potion_pct / 100),
    poiseMult: (1 + 0.02 * eff(stats.str)) * (1 + affixes.poise_pct / 100),
    dmgMult: { blade: 1, bow: 1, focus: 1, [family]: damage },
    cdMult: 1,
    capacity: 100 + stats.str - 5 + affixes.capacity_flat,
    goldBonus: affixes.gold_pct, materialBonus: affixes.material_pct,
    shopDiscount: Math.min(0.1, 0.005 * eff(stats.cha)),
    family,
  };
}
