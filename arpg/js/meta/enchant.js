import { deriveMods } from './stats.js';
// Direct stone enchanting, shared by weapons and armor.
// Outcomes are seeded by (account, item, attempt counter), and the result is part of the
// returned save, so a reload during the animation cannot reroll an attempt.
import { SLOTS, ENCHANT, STONE, GREATER_STONE, ENCHANT_STONES, rng, weighted } from './economy.js';
import { ITEMS, START_WEAPONS, cloneSave, dismantleStones, uniqueUid, meetsRequirement } from './items.js';

export const isRisky = (level) => level >= ENCHANT.safe;

function hash(text) {
  let value = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 0x01000193);
  return value >>> 0;
}
const attemptRandom = (save, salt) =>
  rng((save.createdAt ^ hash(salt) ^ Math.imul((save.enchantCount || 0) + 1, 0x9e3779b9)) >>> 0);

// chance is the chance of keeping the item, not necessarily increasing its level.
export function enchantPreview(save, uid, stoneId) {
  const item = save.items.find((candidate) => candidate.uid === uid);
  if (!item || !SLOTS.includes(ITEMS[item.id]?.kind)) throw new Error('강화할 장비가 없습니다.');
  const stone = ITEMS[stoneId];
  if (!ENCHANT_STONES.includes(stoneId)) throw new Error('쓸 수 없는 강화석입니다.');
  const level = item.enhance;
  const maxed = level >= ENCHANT.max;
  const bone = ITEMS[item.id].boneSet === true;
  const risky = bone || isRisky(level);
  const steps = stone.cursed ? ENCHANT.cursedSteps : stone.blessed ? ENCHANT.blessedSteps : [1];
  const refund = Math.floor(dismantleStones(item)[STONE] * ENCHANT.failRefund);
  return {
    item, level, maxed, risky, bone, blessed: !!stone.blessed, cursed: !!stone.cursed,
    cost: stoneId === STONE ? ENCHANT.stonesPerAttempt : 1,
    // LUK adds up to +8 points on risky steps (cocy 10-12).
    chance: maxed ? 0 : bone ? (level < 6 ? 0.8 - level * 0.05 : ENCHANT.rates[level]) : stone.blessed || stone.cursed ? 1 : risky ? Math.min(1, ENCHANT.rates[level] + deriveMods(save).enchantLuck) : 1,
    outcomes: [...new Set(steps.map((step) => Math.max(0, Math.min(level + step, ENCHANT.max))))],
    refund: { [STONE]: refund },
    have: save.stacks[stoneId] || 0,
  };
}

export function enchant(save, uid, stoneId) {
  const preview = enchantPreview(save, uid, stoneId);
  if (preview.maxed) throw new Error(`+${ENCHANT.max}이 최대 강화입니다.`);
  if (preview.have < preview.cost) throw new Error(`${ITEMS[stoneId].name}이 부족합니다. (${preview.cost}개 필요)`);
  const random = attemptRandom(save, `enchant:${uid}`);
  const next = cloneSave(save);
  next.enchantCount = (save.enchantCount || 0) + 1;
  next.stacks[stoneId] -= preview.cost;
  const from = preview.level;
  if (random() >= preview.chance) {
    // Destroyed: unequip, remove, leave part of the stones it would have dismantled into.
    next.items = next.items.filter((candidate) => candidate.uid !== uid);
    for (const slot of SLOTS) if (next.equipped[slot] === uid) next.equipped[slot] = null;
    // A round cannot start without a weapon: fall back to the strongest owned one, else a fresh starter.
    if (next.equipped.weapon === null) {
      const spare = next.items.filter((candidate) => ITEMS[candidate.id].slot === 'weapon'
        && meetsRequirement(next, ITEMS[candidate.id]))
        .sort((a, b) => ITEMS[b.id].power - ITEMS[a.id].power || b.enhance - a.enhance)[0];
      if (spare) next.equipped.weapon = spare.uid;
      else {
        const starter = { uid: uniqueUid(next, 'starter:weapon'), id: START_WEAPONS[next.quiz.weapon], enhance: 0, affixes: [], rolledAt: 0 };
        next.items.push(starter);
        next.equipped.weapon = starter.uid;
      }
    }
    if (next.equipped.offhand && ITEMS[next.items.find(i=>i.uid===next.equipped.weapon)?.id]?.family !== 'blade') next.equipped.offhand=null;
    const refund = preview.refund[STONE];
    if (refund) next.stacks[STONE] = (next.stacks[STONE] || 0) + refund;
    return { save: next, result: { outcome: 'destroyed', uid, id: preview.item.id, from, to: null, risky: true, refund: preview.refund } };
  }
  const steps = preview.cursed ? ENCHANT.cursedSteps : preview.blessed ? ENCHANT.blessedSteps : [1];
  const step = preview.cursed
    ? weighted(steps.map((step, i) => [step, ENCHANT.cursedWeights[i]]), random)
    : preview.blessed && preview.risky
      ? weighted(steps.map((step, i) => [step, ENCHANT.blessedRiskWeights[i]]), random)
      : steps[Math.floor(random() * steps.length)];
  const to = Math.max(0, Math.min(from + step, ENCHANT.max));
  next.items.find((candidate) => candidate.uid === uid).enhance = to;
  return { save: next, result: { outcome: 'success', uid, id: preview.item.id, from, to, risky: preview.risky, refund: null } };
}

// One greater stone retains 5~10 attempts of value as 25~50 plain stones.
export function crackGreaterStone(save) {
  if ((save.stacks[GREATER_STONE] || 0) < 1) throw new Error('상급 강화석이 없습니다.');
  const [min, max] = ENCHANT.greaterYield;
  const count = (min + Math.floor(attemptRandom(save, 'greater')() * (max - min + 1))) * ENCHANT.stonesPerAttempt;
  const next = cloneSave(save);
  next.enchantCount = (save.enchantCount || 0) + 1;
  next.stacks[GREATER_STONE] -= 1;
  next.stacks[STONE] = (next.stacks[STONE] || 0) + count;
  return { save: next, result: { id: STONE, count } };
}
