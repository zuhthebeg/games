import { createEncounter } from '../solo/undead-encounter.js';
import { installEncounterArt } from '../solo/undead-art.js';
import { createSkeletonSave } from '../meta/character-creation.js';
import { buildRoundMods } from '../meta/run.js';
import { terminalPresentation } from '../solo/undead-session.js';
export { terminalPresentation } from '../solo/undead-session.js';
export const UNDEAD_LABEL = '언데드 · 해골 기사 · 저장 안 됨';
// Ephemeral DBG only. Selected, saved characters never enter this controller.
export function createUndeadSession(provider) {
  const save = createSkeletonSave({ lineage: 'skeleton_knight', name: '디버그 기사', answers: [0, 0, 0, 0, 0], createdAt: 0 });
  const restoreArt = installEncounterArt(provider);
  let left = false;
  return {
    save,
    restart() {
      if (left) throw new Error('이미 종료한 디버그 전투');
      return createEncounter({ pid: 'local', mods: buildRoundMods(save) });
    },
    presentation: terminalPresentation,
    state({ player, human }) { return player.dead ? 'death' : human.dead ? 'victory' : player.terminal ? 'returned' : 'running'; },
    leave() { if (!left) { restoreArt(); left = true; } },
  };
}
