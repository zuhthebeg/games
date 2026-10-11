import { ITEMS, carriedWeight, capacity, meetsRequirement, enhanceMultiplier } from './items.js';
import { deriveMods } from './stats.js';
import { attackRate } from '../content/balance.js';
import { loadEffects } from '../sim/world.js';
import { AFFIX_LABELS, AFFIX_UNITS } from './affixes.js';

export function compareItems(equipped, candidate, save) {
  const definition = ITEMS[candidate?.id];
  if (!definition?.slot) throw new Error('비교할 장비가 없습니다.');
  if (equipped && ITEMS[equipped.id].slot !== definition.slot) throw new Error('동일 부위만 비교할 수 있습니다.');
  const beforeSave = structuredClone(save);
  const afterSave = structuredClone(save);
  // Compare exactly the supplied pair, not whichever item happens to be equipped in save.
  const substitute = (target, item, prefix) => {
    if (!item) { target.equipped[definition.slot] = null; return; }
    const gear = { ...item, uid: prefix };
    target.items.push(gear);
    target.equipped[definition.slot] = prefix;
  };
  substitute(beforeSave, equipped, 'compare:from');
  substitute(afterSave, candidate, 'compare:to');
  const before = deriveMods(beforeSave);
  const after = deriveMods(afterSave);
  const lines = [];
  const line = (key, label, from, to, lower = false, display = {}) => {
    const delta = Math.round((to - from) * 1e9) / 1e9;
    lines.push({ key, label, from, to, delta, good: delta === 0 ? null : lower ? delta < 0 : delta > 0, ...display });
  };
  line('attack', '공격력 (실전 배율)', before.dmgMult[before.family], after.dmgMult[after.family], false, { unit:'배율', prefix:'×', section:'derived' });
  line('maxHp', '캐릭터 최대 HP', before.maxHp, after.maxHp, false, { unit:'HP', section:'derived' });
  line('weight', '장비 무게 (가벼울수록 좋음)', ITEMS[equipped?.id]?.weight || 0, definition.weight, true, { unit:'kg', section:'base' });
  const keys = new Set([...(equipped?.affixes || []), ...(candidate.affixes || [])].map(({ k }) => k));
  for (const key of keys) line(key, AFFIX_LABELS[key],
    equipped?.affixes?.find(({ k }) => k === key)?.v || 0,
    candidate.affixes?.find(({ k }) => k === key)?.v || 0, false, { unit:AFFIX_UNITS[key] || '', section:'affix' });
  // Add display-only readings; preserve every old raw line key/value and return field.
  const oldDefinition = ITEMS[equipped?.id];
  const oldEnhance = enhanceMultiplier(equipped?.enhance || 0), newEnhance = enhanceMultiplier(candidate.enhance || 0);
  if (definition.power !== undefined) {
    line('basePower', '무기 기본 공격 배율', oldDefinition?.power || 0, definition.power, false, { unit:'배율', prefix:'×', section:'base' });
    line('enhancePower', '강화 공격 기여', (oldDefinition?.power || 0) * (oldEnhance - 1), definition.power * (newEnhance - 1), false, { unit:'배율', section:'base' });
  } else {
    line('baseHp', '방어구 기본 HP 보호 기여', oldDefinition?.hp || 0, definition.hp || 0, false, { unit:'HP', section:'base' });
    line('enhanceHp', '강화 HP 기여', (oldDefinition?.hp || 0) * (oldEnhance - 1), (definition.hp || 0) * (newEnhance - 1), false, { unit:'HP', section:'base' });
  }
  line('capacity', '최대 휴대 무게 (높을수록 좋음)', before.capacity, after.capacity, false, { unit:'kg', section:'derived' });
  const beforeRatio = carriedWeight(beforeSave) / capacity(beforeSave), afterRatio = carriedWeight(afterSave) / capacity(afterSave);
  line('attackRate', '공격 행동 속도 (현재 보급·소지 적용)', attackRate(before.attackSpeedBonus,before.weaponWeight,beforeRatio), attackRate(after.attackSpeedBonus,after.weaponWeight,afterRatio), false, { unit:'배율', prefix:'×', section:'derived' });
  line('moveSpeed', '이동속도 (현재 소지 적용)', before.speedMult * loadEffects(beforeRatio).speed, after.speedMult * loadEffects(afterRatio).speed, false, { unit:'배율', prefix:'×', section:'derived' });
  line('dodgeCooldown', '회피 재사용 (낮을수록 좋음)', before.dodgeCdMult * loadEffects(beforeRatio).dodgeCd, after.dodgeCdMult * loadEffects(afterRatio).dodgeCd, true, { unit:'배율', prefix:'×', section:'derived' });
  line('potionEfficiency', '물약 회복 배율', before.potionHealMult, after.potionHealMult, false, { unit:'배율', prefix:'×', section:'derived' });
  line('manaRegen', '마나 재생', before.mpRegen, after.mpRegen, false, { unit:'MP/초', section:'derived' });
  line('goldBonus', '적용 골드 획득 보너스 (공유 상한 적용)', before.goldBonus, after.goldBonus, false, { unit:'%', section:'derived' });
  line('materialBonus', '적용 재료 드랍 보너스 (공유 상한 적용)', before.materialBonus, after.materialBonus, false, { unit:'%', section:'derived' });
  const weightAfter = carriedWeight(afterSave);
  const weightLimit = capacity(afterSave);
  const lockReason = !meetsRequirement(save, definition) ? `힘 ${definition.requiredStr} 필요`
    : weightAfter > weightLimit * 1.2 ? '무게 120% 초과' : '';
  return { lines, weightAfter, weightLimit, locked: !!lockReason, lockReason };
}
