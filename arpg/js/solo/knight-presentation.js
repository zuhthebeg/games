import { playerForm } from '../content/player-lineages.js';
// Presentation only: original enemy type/AI/stats/lifeState/drop identity survives.
// Unique bosses/construct guardians and the two training samples keep their art.
export const HUMAN_PRESENTATIONS = Object.freeze({
  goblin_grunt: 'blade', goblin_slinger: 'bow', iron_boar: 'blade', wolf: 'blade',
  spirit: 'focus', poison_spider: 'blade', skeleton_minion: 'blade',
  skeleton_warrior: 'blade', skeleton_rogue: 'blade', skeleton_mage: 'focus',
  ghoul: 'blade', ghost: 'focus', bat: 'blade', demon: 'blade', goleling: 'blade',
  slime: 'blade', succubus: 'bow',
});
export const ORIGINAL_PRESENTATIONS = Object.freeze(['scarecrow', 'training_dragon', 'goblin_chief', 'rune_guardian', 'gargoyle', 'throne_dragon']);

export function installKnightPresentation(provider, save = { lineage: 'skeleton_knight', level: 1 }) {
  const previous = new Map(provider.factories);
  const skeleton = previous.get('skeleton_warrior');
  if (!skeleton || !['blade', 'bow', 'focus'].every(key => previous.has(key))) throw new Error('Required character factories missing');
  provider.register('blade', (entity, options) => {
    const visual = skeleton({ ...entity, kind: 'monster', type: 'skeleton_warrior' }, { ...options, color: 0xffffff, equipment: null });
    return {
      ...visual,
      get debug() { return { ...visual.debug, presentation: playerForm(save), artFallback: 'existing skeleton-warrior (no dedicated DeathKnight art)', dodgeFallback: 'run (no baked dodge clip)' }; },
      update(state, anim, dt) {
        // Cosmetic locomotion fallback only. Actual dash/iframes/cooldown are untouched.
        const shown = state.dodge?.dashLeft > 0 ? { ...state, moving: true, dodge: { ...state.dodge, dashLeft: 0 } } : state;
        visual.update(shown, anim, dt);
      },
    };
  });
  for (const [type, weapon] of Object.entries(HUMAN_PRESENTATIONS)) {
    const factory = previous.get(weapon);
    provider.register(type, (entity, options) => {
      const visual = factory({ ...entity, kind: 'player', weapon }, { ...options, color: 0xffffff, equipment: null });
      return { ...visual, get debug() { return { ...visual.debug, presentation: `human_${weapon}`, species: 'human', name: `인간 모험가 · ${{blade:'근접',bow:'원거리',focus:'마법'}[weapon]}`, originalType: type }; } };
    });
  }
  let restored = false;
  return () => {
    if (restored) return;
    restored = true;
    for (const key of ['blade', ...Object.keys(HUMAN_PRESENTATIONS)]) {
      if (previous.has(key)) provider.register(key, previous.get(key));
      else provider.factories.delete(key);
    }
  };
}
