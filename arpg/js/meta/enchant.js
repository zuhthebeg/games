// cocy 10-11 enchant: scrolls replace stone+gold upgrades. Stones only become scrolls.
// Outcomes are seeded by (account, item, attempt counter), and the result is part of the
// returned save, so a reload during the animation cannot reroll an attempt.
import { SLOTS, ENCHANT, STONE, GREATER_STONE, SCROLLS, rng } from './economy.js';
import { ITEMS, START_WEAPONS, cloneSave, dismantleStones, uniqueUid } from './items.js';

export const scrollFamily = (item) => (ITEMS[item.id].slot === 'weapon' ? 'weapon' : 'armor');
export const scrollsFor = (item) => SCROLLS[scrollFamily(item)];
export const isRisky = (level) => level >= ENCHANT.safe;

function hash(text) {
  let value = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 0x01000193);
  return value >>> 0;
}
const attemptRandom = (save, salt) =>
  rng((save.createdAt ^ hash(salt) ^ Math.imul((save.enchantCount || 0) + 1, 0x9e3779b9)) >>> 0);

// What the forge shows before a scroll is spent. chance is the chance of keeping the item.
export function enchantPreview(save, uid, scrollId) {
  const item = save.items.find((candidate) => candidate.uid === uid);
  if (!item || !SLOTS.includes(ITEMS[item.id]?.kind)) throw new Error('강화할 장비가 없습니다.');
  const scroll = ITEMS[scrollId];
  if (!scroll?.enchant || scroll.enchant !== scrollFamily(item)) throw new Error('이 장비에 쓸 수 없는 주문서입니다.');
  const level = item.enhance;
  const maxed = level >= ENCHANT.max;
  const risky = isRisky(level);
  const steps = scroll.blessed && !risky ? (level <= 2 ? ENCHANT.blessedLow : ENCHANT.blessedHigh) : [1];
  const refund = Math.floor(dismantleStones(item)[STONE] * ENCHANT.failRefund);
  return {
    item, level, maxed, risky, blessed: !!scroll.blessed,
    chance: maxed ? 0 : risky ? ENCHANT.rates[level] : 1,
    // Blessed jumps inside the safe line stop at the safe line, as in Lineage.
    outcomes: steps.map((step) => Math.min(level + step, risky ? ENCHANT.max : ENCHANT.safe)),
    refund: { [STONE]: refund },
    have: save.stacks[scrollId] || 0,
  };
}

export function enchant(save, uid, scrollId) {
  const preview = enchantPreview(save, uid, scrollId);
  if (preview.maxed) throw new Error(`+${ENCHANT.max}이 최대 강화입니다.`);
  if (preview.have < 1) throw new Error(`${ITEMS[scrollId].name}이 없습니다.`);
  const random = attemptRandom(save, `enchant:${uid}`);
  const next = cloneSave(save);
  next.enchantCount = (save.enchantCount || 0) + 1;
  next.stacks[scrollId] -= 1;
  const from = preview.level;
  if (random() >= preview.chance) {
    // Destroyed: unequip, remove, leave part of the stones it would have dismantled into.
    next.items = next.items.filter((candidate) => candidate.uid !== uid);
    for (const slot of SLOTS) if (next.equipped[slot] === uid) next.equipped[slot] = null;
    // A round cannot start without a weapon: fall back to the strongest owned one, else a fresh starter.
    if (next.equipped.weapon === null) {
      const spare = next.items.filter((candidate) => ITEMS[candidate.id].slot === 'weapon'
        && ITEMS[candidate.id].requiredLevel <= next.level)
        .sort((a, b) => ITEMS[b.id].power - ITEMS[a.id].power || b.enhance - a.enhance)[0];
      if (spare) next.equipped.weapon = spare.uid;
      else {
        const starter = { uid: uniqueUid(next, 'starter:weapon'), id: START_WEAPONS[next.quiz.weapon], enhance: 0, affixes: [], rolledAt: 0 };
        next.items.push(starter);
        next.equipped.weapon = starter.uid;
      }
    }
    const refund = preview.refund[STONE];
    if (refund) next.stacks[STONE] = (next.stacks[STONE] || 0) + refund;
    return { save: next, result: { outcome: 'destroyed', uid, id: preview.item.id, from, to: null, risky: true, refund: preview.refund } };
  }
  const to = preview.outcomes[Math.floor(random() * preview.outcomes.length)];
  next.items.find((candidate) => candidate.uid === uid).enhance = to;
  return { save: next, result: { outcome: 'success', uid, id: preview.item.id, from, to, risky: preview.risky, refund: null } };
}

// 강화석 N → 주문서 1. No gold, no stone grades.
export function craftScroll(save, family, count = 1) {
  const id = SCROLLS[family]?.normal;
  if (!id) throw new Error('없는 주문서입니다.');
  if (!Number.isSafeInteger(count) || count < 1) throw new Error('제작 수량이 올바르지 않습니다.');
  const cost = ENCHANT.stonesPerScroll * count;
  if ((save.stacks[STONE] || 0) < cost) throw new Error(`강화석이 부족합니다. (주문서 1장 = 강화석 ${ENCHANT.stonesPerScroll}개)`);
  const next = cloneSave(save);
  next.stacks[STONE] -= cost;
  next.stacks[id] = (next.stacks[id] || 0) + count;
  return next;
}

// 상급 강화석 1 → 주문서 5~10장 (seeded, same anti-reroll counter as enchanting).
export function crackGreaterStone(save, family) {
  const id = SCROLLS[family]?.normal;
  if (!id) throw new Error('없는 주문서입니다.');
  if ((save.stacks[GREATER_STONE] || 0) < 1) throw new Error('상급 강화석이 없습니다.');
  const [min, max] = ENCHANT.greaterYield;
  const count = min + Math.floor(attemptRandom(save, `greater:${family}`)() * (max - min + 1));
  const next = cloneSave(save);
  next.enchantCount = (save.enchantCount || 0) + 1;
  next.stacks[GREATER_STONE] -= 1;
  next.stacks[id] = (next.stacks[id] || 0) + count;
  return { save: next, result: { id, count } };
}
