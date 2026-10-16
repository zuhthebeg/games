import { skeletonAppearance } from '../render/skeleton-equipment-state.js';
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
  const skeleton = previous.get('blade');
  if (!skeleton || !['blade', 'bow', 'focus'].every(key => previous.has(key))) throw new Error('Required character factories missing');
  const evolved = playerForm(save) === 'death_knight';
  const deathKnight = previous.get('death_knight');
  if (evolved && !deathKnight) throw new Error('Required DeathKnight factory missing');
  provider.register('blade', (entity, options) => {
    const visual = evolved ? deathKnight({ ...entity, kind: 'player', weapon: 'death_knight' }, { ...options, color: 0xffffff, equipment: null }) : skeleton({ ...entity, kind: 'player', weapon: 'blade' }, { ...options, color: 0xffffff, equipment: skeletonAppearance(save) });
    return {
      ...visual,
      get debug() {
        const loaded = evolved ? visual.debug.mode === 'atlas' && visual.debug.id === 'player-death-knight' : visual.debug.mode === 'paperdoll' && visual.debug.id === 'player-skeleton-equipment';
        return { ...visual.debug, presentation: playerForm(save),
          artFallback: loaded ? null : evolved ? 'DeathKnight atlas loading or failed; procedural fallback (not approved art)' : 'skeleton equipment kit loading or failed',
          dodgeFallback: loaded ? null : 'run (no baked dodge clip)' };
      },
      update(state, anim, dt) {
        // Cosmetic locomotion fallback only. Actual dash/iframes/cooldown are untouched.
        const loaded = evolved ? visual.debug.mode === 'atlas' && visual.debug.id === 'player-death-knight' : visual.debug.mode === 'paperdoll' && visual.debug.id === 'player-skeleton-equipment';
        const shown = !loaded && state.dodge?.dashLeft > 0 ? { ...state, moving: true, dodge: { ...state.dodge, dashLeft: 0 } } : state;
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

// Read-only load status: never label a procedural fallback as the delivered kit.
export function showKnightArtStatus(hud, debug) {
  if (debug?.presentation !== 'death_knight') return;
  const loaded = debug.mode === 'atlas' && debug.id === 'player-death-knight';
  hud.nodes['stage-name'].textContent = hud.stage + (loaded ? '' : debug.loadFailure ? ' · 아트 로드 실패' : ' · 아트 로딩');
  if (debug.loadFailure) {
    hud.nodes.notice.textContent = '데스나이트 아트 로드 실패 · 임시 대체 외형/이동 회피 · 새로고침 후 재시도';
    hud.noticeLeft = Infinity;
  }
}
