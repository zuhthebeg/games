import { BOOKS, DEFAULT_SKILLS } from '../meta/skills.js';
const knownSkills = new Set([...Object.keys(BOOKS), ...Object.values(DEFAULT_SKILLS)]);

// Bounded five-level milestones. Counts are design defaults, not save thresholds.
export const GROWTH_LEVELS = Object.freeze([1, 5, 10, 15, 20, 25, 30]);
export function boundedMasteryLevels(levels) {
  if (!levels || typeof levels !== 'object' || Array.isArray(levels)) return {};
  return Object.fromEntries(Object.entries(levels).filter(([id, n]) => knownSkills.has(id) && Number.isSafeInteger(n))
    .map(([id, n]) => [id, Math.max(1, Math.min(30, n))]));
}
export function skillGrowth(id, level = 1) {
  level = Number.isSafeInteger(level) ? Math.max(1, Math.min(30, level)) : 1;
  const tier = GROWTH_LEVELS.filter(n => n <= level).length - 1;
  switch (id) {
    case 'meteor': return { count: 1 + tier, intervalMs: 300 };
    case 'rain_arrow': return { count: 4 + tier, durationMs: (4 + tier) * 300, intervalMs: 300 };
    case 'spinning_shot': return { count: 12 + 2 * tier, durationMs: 1200 };
    case 'firewall': return { count: 8 + tier, durationMs: 4000 + 500 * tier, intervalMs: 500 };
    default: return null;
  }
}
export function growthLabel(id, level = 1) {
  const describe = g => id === 'firewall' ? `${g.durationMs / 1000}초 · ${g.count}회` : id === 'spinning_shot' ? `1.2초 · ${g.count}발` : `${g.count}회`;
  const current = skillGrowth(id, level);
  if (!current) return '';
  const next = GROWTH_LEVELS.find(n => n > level);
  return `현재 ${describe(current)} · ${next ? `다음 Lv${next}: ${describe(skillGrowth(id, next))}` : '최대 성장'}`;
}
