import { BALANCE } from '../content/balance.js';
export const MAX_LEVEL = 30;
// [제안] S8~S20: +12%/stage first-clear XP; boss stages (S10/S15/S20) ×1.5.
export const STAGE_XP = { S1: 50, S2: 100, S3: 180, S4: 260, S5: 340, S6: 480, S7: 520,
  S8: 580, S9: 650, S10: 1090, S11: 820, S12: 910, S13: 1020, S14: 1150, S15: 1930,
  S16: 1440, S17: 1610, S18: 1800, S19: 2020, S20: 3390 };
export const xpSpan = (level) => Math.round(50 * level ** 1.5);
export const stageXp = (save, stageId) => Math.round(STAGE_XP[stageId] * (save.cleared[stageId] ? 0.25 : 1));

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
  const factor = Number(String(stageId).slice(1)) >= 4 ? 0.5 : 0;
  // Keep the specified round-before-factor order (a half-XP loss is possible).
  return Math.min(save.xp, Math.round(0.2 * xpSpan(save.level)) * factor);
}
