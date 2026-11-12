import { playerFamily } from '../content/lineages.js';

export function refreshStagePlayerCharacter(player, character, equipment, look, stats) {
  Object.assign(player, {
    ...look,
    level: character.level,
    equipment,
    look,
    family: playerFamily(character, look),
    stats,
    maxHp: stats.maxHp,
    hp: Math.min(player.hp, stats.maxHp),
  });
}
