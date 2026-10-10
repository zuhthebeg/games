import { AFFIX_RANGES, ECONOMY, rng } from './economy.js';

// grep -Rn crit js/sim js/content: no critical-hit consumer; do not ship inert rolls.
export const DEFERRED_AFFIXES = ['crit_chance', 'crit_damage', 'poise_resist'];
export const AFFIX_LABELS = {
  atk_pct: '공격력 %', hp_flat: '최대 HP', speed_pct: '이동속도 %', dodge_pct: '회피 재사용 감소 %',
  potion_pct: '물약 효율 %', mana_pct: '마나 재생 %', capacity_flat: '소지 한도',
  gold_pct: '골드 획득 %', material_pct: '재료 드랍 %',
};
export function rollAffixes(rarity, huntTier, seed) {
  const random = rng(seed);
  const pool = Object.keys(AFFIX_RANGES);
  const out = [];
  let dropBonus = 0;
  for (let i = 0; i < ECONOMY.affixCount[rarity]; i++) {
    const k = pool.splice(Math.floor(random() * pool.length), 1)[0];
    const [min, max] = affixRange(k, huntTier);
    let v = min + Math.floor(random() * (max - min + 1));
    if (['gold_pct', 'material_pct'].includes(k)) {
      v = Math.min(v, ECONOMY.dropBonusCap - dropBonus);
      dropBonus += v;
    }
    out.push({ k, v });
  }
  return out;
}
export function affixRange(k, huntTier = 1) {
  const [min, max] = AFFIX_RANGES[k];
  const tier = Math.max(1, Math.min(3, huntTier));
  return [min, max * tier];
}
export function affixTotals(items) {
  const totals = Object.fromEntries(Object.keys(AFFIX_RANGES).map((k) => [k, 0]));
  for (const item of items) for (const { k, v } of item?.affixes || []) {
    if (Object.hasOwn(totals, k)) totals[k] += v;
  }
  // One shared cap across equipped items, proportional so neither family silently dominates.
  const drop = totals.gold_pct + totals.material_pct;
  if (drop > ECONOMY.dropBonusCap) {
    totals.gold_pct *= ECONOMY.dropBonusCap / drop;
    totals.material_pct *= ECONOMY.dropBonusCap / drop;
  }
  return totals;
}
export function validAffixes(item, definition) {
  if (!Array.isArray(item.affixes) || item.affixes.length > ECONOMY.affixCount[definition.rarity]) return false;
  const seen = new Set();
  let drop = 0;
  for (const affix of item.affixes) {
    if (!affix || !Object.hasOwn(AFFIX_RANGES, affix.k) || seen.has(affix.k)) return false;
    const [, max] = affixRange(affix.k, definition.huntTier);
    if (!Number.isSafeInteger(affix.v) || affix.v < 0 || affix.v > max) return false;
    seen.add(affix.k);
    if (['gold_pct', 'material_pct'].includes(affix.k)) drop += affix.v;
  }
  return drop <= ECONOMY.dropBonusCap;
}
