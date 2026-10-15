import { createEncounter } from './undead-encounter.js';
import { installEncounterArt } from './undead-art.js';
import { buildRoundMods } from '../meta/run.js';

import { validateSave } from '../meta/save.js';
import { equippedItem, ITEMS } from '../meta/items.js';

export function createKnightSession(provider, profile) {
  if (!validateSave(profile) || profile.lineage !== 'skeleton_knight'
    || ITEMS[equippedItem(profile, 'weapon')?.id]?.family !== 'blade') throw new Error('Invalid saved skeleton knight');
  const save = structuredClone(profile);
  const restoreArt = installEncounterArt(provider);
  let left = false;
  return {
    save,
    persistent: true,
    restart() {
      if (left) throw new Error('이미 종료한 시험 전투');
      return createEncounter({ pid: 'local', mods: buildRoundMods(save) });
    },
    presentation: terminalPresentation,
    state({ player, human }) {
      return player.dead ? 'death' : human.dead ? 'victory' : player.terminal ? 'returned' : 'running';
    },
    leave() { if (!left) { restoreArt(); left = true; } },
  };
}

// Render-only terminal pose. Never tick a concluded encounter to finish presentation:
// atlas death/hurt ages use render delta, but attack uses authoritative act.elapsed.
export function terminalPresentation(world) {
  return { ...world, telegraphs: [], projectiles: [], entities: world.entities.map(entity => ({
    ...entity, act: null, moving: false, staggerLeft: 0,
    dodge: entity.dodge && { ...entity.dodge, dashLeft: 0 },
  })) };
}
