import { createWorld, addPlayer, spawnMonster } from '../sim/world.js';
import { playerLineage } from '../content/player-lineages.js';
export const HUMAN_ID = 'undead_lab_human_melee';

// Explicit single-encounter setup for debug tools; no campaign/settlement.
// No save, stage, reward, inventory, profile or persistent preference dependency.
export function createEncounter({ lineage = 'skeleton_knight', seed = 23, pid = 'skeleton', mods = {} } = {}) {
  if (playerLineage({ lineage }).id !== 'skeleton_knight') throw new Error('Only skeleton_knight is supported by this encounter');
  const world = createWorld({ seed });
  const player = addPlayer(world, { pid, mods, weapon: 'blade',
    x: world.arena.w * .78, y: world.arena.h * .5, facing: Math.PI, dodgeEnabled: false });
  const human = spawnMonster(world, HUMAN_ID, world.arena.w * .22, world.arena.h * .5, { facing: 0 });
  return { world, player, human };
}
