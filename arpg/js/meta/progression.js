import { BALANCE } from '../content/balance.js';
export const MAX_LEVEL = 30;
// [제안] S8~S20: +12%/stage first-clear XP; boss stages (S10/S15/S20) ×1.5.
export const STAGE_XP = { S1: 50, S2: 100, S3: 180, S4: 260, S5: 340, S6: 480, S7: 520,
  S8: 580, S9: 650, S10: 1090, S11: 820, S12: 910, S13: 1020, S14: 1150, S15: 1930,
  S16: 1440, S17: 1610, S18: 1800, S19: 2020, S20: 3390, S21: 2020, S22: 2020, S23: 910, S24: 2120, S25: 2220, S26: 2320, S27: 2420, S28: 2520, S29: 2620, S30: 2720, S31: 2820, S32: 2920, S33: 3020, S34: 3120, S35: 3220, S36: 3320, S37: 3420, S38: 3520, S39: 3620, TD1: 2020, M_MINE_CART: 910, M_MARSH_MARKERS: 510, M_THRONE_GARGOYLE: 2020 };
export const xpSpan = (level) => Math.round(50 * level ** 1.5);
// Objective contracts (M_*) pay first-clear XP only: the gargoyle bounty ends on one kill, far cheaper than S19 (cocy 10-13 review).
const repeatXpFactor = (stageId) => String(stageId).startsWith('M_') ? 0 : 0.25;
export const stageXp = (save, stageId) => Math.round(STAGE_XP[stageId] * (save.cleared[stageId] ? repeatXpFactor(stageId) : 1));

export function addXp(save, amount) {
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error('XP must be a nonnegative integer');
  const next = structuredClone(save);
  if (next.level === MAX_LEVEL) {
    next.xp = 0;
    return next;
  }
  next.xp += amount;
  while (next.level < MAX_LEVEL && next.xp >= xpSpan(next.level)) {
    next.xp -= xpSpan(next.level);
    next.level++;
    next.statPoints += BALANCE.stats.pointsPerLevel;
  }
  if (next.level === MAX_LEVEL) next.xp = 0;
  return next;
}

export function deathLoss(save, stageId) {
  const factor = stageId === 'M_THRONE_GARGOYLE' || stageId === 'TD1' || stageId === 'M_MINE_CART' || stageId === 'M_MARSH_MARKERS' || Number(String(stageId).slice(1)) >= 4 ? 0.5 : 0;
  // Keep the specified round-before-factor order (a half-XP loss is possible).
  return Math.min(save.xp, Math.round(0.2 * xpSpan(save.level)) * factor);
}
