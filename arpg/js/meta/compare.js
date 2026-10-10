import { ITEMS, equippedItem, enhanceMultiplier, carriedWeight, capacity } from './items.js';
import { deriveMods } from './stats.js';
import { AFFIX_LABELS } from './affixes.js';

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
  const line = (key, label, from, to, lower = false) => {
    const delta = Math.round((to - from) * 1e9) / 1e9;
    lines.push({ key, label, from, to, delta, good: delta === 0 ? null : lower ? delta < 0 : delta > 0 });
  };
  line('attack', '공격력', before.dmgMult[before.family], after.dmgMult[after.family]);
  line('maxHp', '최대 HP', before.maxHp, after.maxHp);
  line('weight', '무게', ITEMS[equipped?.id]?.weight || 0, definition.weight, true);
  const keys = new Set([...(equipped?.affixes || []), ...(candidate.affixes || [])].map(({ k }) => k));
  for (const key of keys) line(key, AFFIX_LABELS[key],
    equipped?.affixes?.find(({ k }) => k === key)?.v || 0,
    candidate.affixes?.find(({ k }) => k === key)?.v || 0);
  const weightAfter = carriedWeight(afterSave);
  const weightLimit = capacity(afterSave);
  const lockReason = save.level < definition.requiredLevel ? `Lv${definition.requiredLevel} 필요`
    : weightAfter > weightLimit * 1.2 ? '무게 120% 초과' : '';
  return { lines, weightAfter, weightLimit, locked: !!lockReason, lockReason };
}
