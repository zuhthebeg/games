// Pre-10-12 save shape (v3/v4): five stats on the old scale (base 5, one point per level).
// Inverse of migrateStatScale, for building realistic legacy saves from fresh test saves.
const OLD = ['str', 'agi', 'int', 'wis', 'cha'];
export function toOldScale(save, version = 4) {
  const stats = Object.fromEntries(OLD.map((key) => [key, 5 + (save.stats[key] - 10) / 6]));
  const statPoints = (save.statPoints - 2 * (save.level - 1)) / 6;
  if (![...Object.values(stats), statPoints].every(Number.isInteger)) throw new Error('not representable on the old scale');
  return { ...structuredClone(save), version, stats, statPoints };
}
