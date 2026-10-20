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
    case 'poison_arrow': return { damage:22+3*tier, dotDamage:5+tier, durationMs:4000+1000*Math.floor(tier/2), intervalMs:1000 };
    case 'cursed_hands': return { radius:100+5*tier, durationMs:1500+250*tier };
    case 'blood_spear': return { damage:56+6*tier, targets:3+Math.floor(tier/2), range:580+20*tier };
    case 'dead_explosion': return { radius:170+10*tier, damagePerHp:1.6+.2*tier };
    case 'protective_shield': return { charges: level >= 20 ? 3 : level >= 10 ? 2 : 1, durationMs: 8000 + Math.floor((level - 1) * 4000 / 29) };
    case 'poison_field': return { radius:80+10*tier, durationMs:3000+500*tier, count:6+tier, intervalMs:500 };
    case 'curse': return { durationMs:4000+500*tier, damageMult:1-(10+2*tier)/100, armorMult:1-(15+3*tier)/100 };
    case 'invisibility': return { durationMs:2000+500*tier };
    case 'sword_wave': return { range:300+50*tier, targets:2+tier };
    case 'berserk': return { durationMs:4000+500*tier, damageMult:1+(15+2.5*tier)/100, speedMult:1+(15+2.5*tier)/100, incomingMult:1.2 };
    case 'meteor': return { count: 1 + tier, intervalMs: 300 };
    case 'rain_arrow': return { count: 4 + tier, durationMs: (4 + tier) * 300, intervalMs: 300 };
    case 'spinning_shot': return { count: 12 + 2 * tier, durationMs: 1200 };
    case 'firewall': return { count: 8 + tier, durationMs: 4000 + 500 * tier, intervalMs: 500 };
    default: return null;
  }
}
export function growthLabel(id, level = 1) {
  const describe = g => id === 'poison_arrow' ? `직격 ${g.damage} · 독 ${g.dotDamage}/초 · ${g.durationMs/1000}초` : id === 'cursed_hands' ? `반경 ${g.radius} · 속박 ${g.durationMs/1000}초 (보스 ${Math.round(g.durationMs/3/100)/10}초)` : id === 'blood_spear' ? `피해 ${g.damage} · ${g.targets}대상 · ${g.range}px` : id === 'dead_explosion' ? `희생 HP ×${Math.round(g.damagePerHp*10)/10} · 반경 ${g.radius}` : id === 'protective_shield' ? `${g.charges}회 · ${Math.round(g.durationMs / 100) / 10}초` : id === 'poison_field' ? `반경 ${g.radius} · ${g.durationMs/1000}초 · ${g.count}회` : id === 'curse' ? `${g.durationMs/1000}초 · 공격 -${Math.round((1-g.damageMult)*100)}% · 방어 -${Math.round((1-g.armorMult)*100)}%` : id === 'invisibility' ? `${g.durationMs/1000}초` : id === 'sword_wave' ? `${g.range}px · ${g.targets}대상` : id === 'berserk' ? `${g.durationMs/1000}초 · 위력/공속 +${Math.round((g.damageMult-1)*1000)/10}% · 받는 피해 +20%` : id === 'firewall' ? `${g.durationMs / 1000}초 · ${g.count}회` : id === 'spinning_shot' ? `1.2초 · ${g.count}발` : `${g.count}회`;
  const current = skillGrowth(id, level);
  if (!current) return '';
  const next = GROWTH_LEVELS.find(n => n > level);
  return `현재 ${describe(current)} · ${next ? `다음 Lv${next}: ${describe(skillGrowth(id, next))}` : '최대 성장'}`;
}
