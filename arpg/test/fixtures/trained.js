import { statBudget, BASE_STATS, STAT_KEYS } from '../../js/meta/stats.js';

// A level-15 character with 힘/민첩/지능 45, enough for every skill book (skills-v2 §3).
export function trained(save, level = 15) {
  const stats = { ...save.stats, str: 45, agi: 45, int: 45 };
  const spent = STAT_KEYS.reduce((sum, key) => sum + stats[key] - BASE_STATS[key], 0);
  return { ...save, level, xp: 0, stats, statPoints: statBudget(level) - spent };
}
