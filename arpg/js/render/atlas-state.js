// New orc atlas sizing: deployment-safe content-addressed import.
import { DRAGON_CLIPS, dragonFrame } from './dragon-presentation.js';
import { HUNT_DRAGONS, huntDragonFrame } from './dragon-hunt-presentation.js';
import { BALANCE } from '../content/balance.js';
// Pure display decisions. No simulation mutation or combat/telegraph geometry.
export const ATLAS_IDS = Object.freeze({
  ember_dragon:'ember-dragon',frost_dragon:'frost-dragon',venom_dragon:'venom-dragon',
  necropolis_lord: 'skeleton-warrior',
  ghoul: 'ghoul', ghost: 'ghost', bat: 'bat',
  demon: 'demon', goleling: 'goleling', slime: 'slime',
  succubus: 'succubus',
  ash_reaver: 'ash_reaver', veil_stalker: 'veil_stalker', cinder_oracle: 'cinder_oracle',
  orc_raider: 'orc_raider', frost_yeti: 'frost_yeti', stone_giant: 'stone_giant',
  marsh_wasp: 'marsh_wasp', bog_wizard: 'bog_wizard', mire_frog: 'mire_frog',
  dune_cactoro: 'dune_cactoro', sun_totem: 'sun_totem', crown_alpaking: 'crown_alpaking',
  sky_armabee: 'sky_armabee', sky_pigeon: 'sky_pigeon', sky_birb: 'sky_birb',
  orbital_scout: 'orbital_scout', orbital_gunner: 'orbital_gunner', orbital_mech: 'orbital_mech',
  lunar_bunny: 'lunar_bunny', lunar_crab: 'lunar_crab', lunar_ninja: 'lunar_ninja',
  clock_drone: 'clock_drone', clock_walker: 'clock_walker', clock_colossus: 'clock_colossus',
  abyss_glub: 'abyss_glub', drowned_skull: 'drowned_skull', abyss_squidle: 'abyss_squidle',
  spore_mushnub: 'spore_mushnub', gale_hywirl: 'gale_hywirl', spore_king: 'spore_king',
  rune_guardian: 'rune-guardian', spirit: 'spirit', scarecrow: 'scarecrow',
  blade: 'hero-sword',
  death_knight: 'player-death-knight',
  bow: 'hero-bow',
  focus: 'hero-focus',
  goblin_grunt: 'goblin-grunt',
  goblin_slinger: 'goblin-archer',
  goblin_chief: 'goblin-chief',
  wolf: 'wolf',
  poison_spider: 'poison-spider',
  iron_boar: 'iron-boar',
  gargoyle: 'gargoyle',
  training_dragon: 'dragon',
  throne_dragon: 'throne-dragon',
  skeleton_minion: 'skeleton-minion',
  skeleton_warrior: 'warrior-dagger',
  skeleton_rogue: 'skeleton-rogue',
  skeleton_mage: 'skeleton-mage',
});
export const DIRECTIONS = Object.freeze(['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE']);

export function atlasScale(entity) {
  return (entity.type === 'goblin_chief' ? BALANCE.size.bossBase : entity.type === 'orc_raider' || entity.type === 'dune_cactoro' ? 1.3 : entity.type === 'spore_king' ? 1.6 : entity.type === 'abyss_squidle' || entity.type === 'clock_colossus' || entity.type === 'sky_birb' || entity.type === 'orbital_mech' || entity.type === 'lunar_ninja' ? 1.5 : entity.type === 'spore_mushnub' ? .55 : entity.type === 'training_dragon' ? 1.2 : entity.type === 'throne_dragon' ? 1.4650580478478936 : 1) * (entity.sizeScale || 1);
}

export function visualKey(entity) {
  return entity.kind === 'player' ? entity.weapon : entity.type;
}

export function atlasDirection(facing) {
  const index = Math.round(facing / (Math.PI / 4));
  return DIRECTIONS[(index % 8 + 8) % 8];
}

export function atlasAnimation(entity, animation) {
  if (entity.dead) return 'death';
  if (entity.dodge?.dashLeft > 0) return 'dodge';
  if (animation.hurt > 0 || entity.staggerLeft > 0) return 'hit';
  if (entity.act) return entity.type === 'throne_dragon' ? DRAGON_CLIPS[entity.act.id] || 'attack' : 'attack';
  return entity.moving ? 'run' : 'idle';
}

export function atlasFrame(state, count, age, fps, entity, duration) {
  if (HUNT_DRAGONS.has(entity.type) && entity.act && state === 'attack') return huntDragonFrame(entity.act,count);
  if (entity.type === 'throne_dragon' && entity.act && Object.values(DRAGON_CLIPS).includes(state)) return dragonFrame(entity.act, count);
  if ((state === 'attack' || state === 'magic') && entity.act) {
    // These authored eight-frame clips separate anticipation / impact / recovery.
    // Long authoritative recovery must not delay the baked slam or bolt release.
    if (['rune_guardian', 'spirit'].includes(entity.type) && ['windup', 'lock', 'active', 'recovery'].includes(entity.act.phase)) {
      const act = entity.act;
      const ticks = act.phaseTicks || Object.fromEntries(['windup', 'lock', 'active', 'recovery']
        .map(phase => [phase, Math.ceil((act.def[`${phase}Ms`] || 0) / (1000 / 30))]));
      const starts = { windup:0, lock:ticks.windup, active:ticks.windup + ticks.lock,
        recovery:ticks.windup + ticks.lock + ticks.active };
      const progress = Math.max(0, Math.min(.999, (act.elapsed - starts[act.phase]) / Math.max(1, ticks[act.phase])));
      const guardian = entity.type === 'rune_guardian';
      const frame = act.phase === 'windup' ? Math.floor(progress * 4)
        : act.phase === 'lock' ? (guardian ? 4 : 3)
        : act.phase === 'active' ? (guardian ? 5 + Math.floor(progress * 2) : 4)
        : guardian ? 6 + Math.floor(progress * 2) : 5 + Math.floor(progress * 3);
      return Math.min(count - 1, frame);
    }
    const def = entity.act.def;
    const ticks = ['windup', 'lock', 'active', 'recovery']
      .reduce((sum, phase) => sum + Math.ceil((def[`${phase}Ms`] || 0) / (1000 / 30)), 0);
    return Math.min(count - 1, Math.floor(entity.act.elapsed / Math.max(1, ticks) * count));
  }
  // Optional per-kit presentation duration; attack keeps authoritative phase timing.
  const frame = Math.floor(age * (duration > 0 ? count / duration : fps));
  return state === 'idle' || state === 'run' ? frame % count : Math.min(count - 1, frame);
}
