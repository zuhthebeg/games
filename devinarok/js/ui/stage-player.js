export function refreshStagePlayerCharacter(player, character, equipment, look, stats) {
  Object.assign(player, {
    ...look,
    level: character.level,
    equipment,
    look,
    family: look.family,
    stats,
    maxHp: stats.maxHp,
    hp: Math.min(player.hp, stats.maxHp),
  });
}
