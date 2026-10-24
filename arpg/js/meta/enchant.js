import { deriveMods } from './stats.js';
// Direct stone enchanting, shared by weapons and armor.
// Outcomes are seeded by (account, item, attempt counter), and the result is part of the
// returned save, so a reload during the animation cannot reroll an attempt.
import { SLOTS, ENCHANT, STONE, ENCHANT_STONES, rng, weighted } from './economy.js';
import { ITEMS, START_WEAPONS, cloneSave, uniqueUid, meetsRequirement } from './items.js';

export const isRisky = (level) => level >= ENCHANT.safe;

function hash(text) {
  let value = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 0x01000193);
  return value >>> 0;
}
const attemptRandom = (save, salt) =>
  rng((save.createdAt ^ hash(salt) ^ Math.imul((save.enchantCount || 0) + 1, 0x9e3779b9)) >>> 0);

// chance is the chance of keeping the item, not necessarily increasing its level.
// Cursed no-gain outcomes (-1/0) stay rarer than destruction; with no destruction risk they vanish.
const cursedWeights = (risky) => risky ? ENCHANT.cursedWeights : ENCHANT.cursedSafeWeights;
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
  // Failure refund stays tied to the plain-stone table, not the converted greater share.
  const refund = Math.floor((ENCHANT.dismantleStones[level] || 0) * ENCHANT.failRefund);
  const high = Math.max(0, level - 11);
  const ordinaryChance = isRisky(level) ? Math.min(1, ENCHANT.rates[level] + deriveMods(save).enchantLuck * (high ? ENCHANT.rates[level] / ENCHANT.rates[11] : 1)) : 1;
  // cocy 10-24: blessed/cursed stones share the ordinary destroy odds; only their survival steps differ.
  const stoneChance = ordinaryChance;
  // Bone gear retains its stricter all-stone risk; no blessed/cursed branch bypasses it.
  const boneChance = level < 6 ? .8 - level * .05 : ENCHANT.rates[level];
  const chance = maxed ? 0 : bone ? Math.min(stoneChance, boneChance) : stoneChance;
  const weights = stone.cursed ? cursedWeights(risky) : stone.blessed ? risky ? ENCHANT.blessedRiskWeights : [50, 50] : [100];
  const probabilities = [];
  for (const [i, step] of steps.entries()) {
    const to = Math.max(0, Math.min(level + step, ENCHANT.max));
    const row = probabilities.find(row => row.to === to);
    const p = maxed ? 0 : chance * weights[i] / 100;
    if (row) row.chance += p; else probabilities.push({to, chance: p});
  }
  if (!maxed && chance < 1) probabilities.push({to: null, chance: 1 - chance});
  return {
    item, level, maxed, risky, bone, blessed: !!stone.blessed, cursed: !!stone.cursed,
    cost: (stoneId === STONE ? ENCHANT.stonesPerAttempt : 1) * (1 + high),
    chance, destroyChance: maxed ? 0 : 1 - chance, probabilities,
    outcomes: [...new Set(steps.filter((_, i) => weights[i] > 0).map((step) => Math.max(0, Math.min(level + step, ENCHANT.max))))],
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
    ? weighted(steps.map((step, i) => [step, cursedWeights(preview.risky)[i]]), random)
    : preview.blessed && preview.risky
      ? weighted(steps.map((step, i) => [step, ENCHANT.blessedRiskWeights[i]]), random)
      : steps[Math.floor(random() * steps.length)];
  const to = Math.max(0, Math.min(from + step, ENCHANT.max));
  next.items.find((candidate) => candidate.uid === uid).enhance = to;
  return { save: next, result: { outcome: 'success', uid, id: preview.item.id, from, to, risky: preview.risky, refund: null } };
}
