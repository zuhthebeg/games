import { BOOKS, DEFAULT_SKILLS } from './skills.js';

export const MASTERY_MAX = 30;
// Historical successful-cast anchors are unchanged. Late 25/30 anchors are
// parent-chosen growth defaults, not user-specified counts. Never rewrite saves.
const anchors = [[1,0],[5,30],[10,100],[15,250],[20,500],[25,900],[30,1500]];
export const MASTERY_THRESHOLDS = Object.freeze(Array.from({length: MASTERY_MAX}, (_, i) => {
  const level = i + 1;
  const j = anchors.findIndex(([l]) => l >= level);
  if (!j) return 0;
  const [la, ca] = anchors[j-1], [lb, cb] = anchors[j];
  return ca + Math.ceil((cb-ca)*(level-la)/(lb-la));
}));
export const MASTERY_SKILLS = Object.freeze([...Object.values(DEFAULT_SKILLS), ...Object.keys(BOOKS)]);
export const masteryLevel = (count = 0) => 1 + MASTERY_THRESHOLDS.slice(1).filter(min => count >= min).length;
export const masteryLevels = save => Object.fromEntries(MASTERY_SKILLS.map(id => [id, masteryLevel(save?.skillMastery?.[id])]));
export function masteryLabel(save, id) {
  const count = save.skillMastery?.[id] || 0, level = masteryLevel(count);
  return `숙련: Lv${level} (${level === MASTERY_MAX ? '최대' : `${count}/${MASTERY_THRESHOLDS[level]}`})`;
}
export function validMastery(counts) {
  return counts !== null && typeof counts === 'object' && !Array.isArray(counts)
    && Object.entries(counts).every(([id, count]) => MASTERY_SKILLS.includes(id) && Number.isSafeInteger(count) && count >= 0);
}
export function setMasteryLevel(save, id, level) {
  if (!MASTERY_SKILLS.includes(id) || !Number.isInteger(level) || level < 1 || level > MASTERY_MAX) throw new Error('숙련: Lv1~30');
  return { ...structuredClone(save), skillMastery: { ...save.skillMastery, [id]: MASTERY_THRESHOLDS[level - 1] } };
}

// The host act journal starts a cast; subsequent successful enemy hits count it once.
// Current player projectile flights expire before the next same-skill cooldown. Keep
// each ability separately: a basic/other act must not erase a shot still in flight.
// Guests consume the ordered, deduplicated host journal, never local prediction hits.
export function trackMastery(tracker, events, world, pid) {
  if (!world?.round?.stageId || !pid) return;
  tracker.masteryCasts ??= {};
  tracker.skillMastery ??= {};
  for (const event of events) {
    const source = world.entities.find(e => e.id === (event.type === 'act' ? event.id : event.src));
    const caster = event.masteryPid ?? (source?.kind === 'player' ? source.pid : null);
    if (caster !== pid || !MASTERY_SKILLS.includes(event.ability)) continue;
    if (event.type === 'act') tracker.masteryCasts[event.ability] = { counted: false };
    if (event.type !== 'hit' || !(event.masteryEnemy || world.entities.find(e => e.id === event.dst)?.kind === 'monster')) continue;
    const cast = tracker.masteryCasts[event.ability];
    if (!cast || cast.counted) continue;
    cast.counted = true;
    tracker.skillMastery[event.ability] = (tracker.skillMastery[event.ability] || 0) + 1;
  }
}
export function settleMastery(save, counts = {}) {
  if (!validMastery(counts)) throw new Error('Invalid skill mastery claim');
  const skillMastery = { ...save.skillMastery }, rises = [];
  for (const [id, count] of Object.entries(counts)) {
    const before = skillMastery[id] || 0, after = before + count;
    if (!Number.isSafeInteger(after)) throw new Error('Invalid skill mastery total');
    skillMastery[id] = after;
    const level = masteryLevel(after);
    if (level > masteryLevel(before)) rises.push({ id, level });
  }
  return { skillMastery, rises };
}
