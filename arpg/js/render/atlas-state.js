import { DRAGON_CLIPS, dragonFrame } from './dragon-presentation.js';
import { BALANCE } from '../content/balance.js';
// Pure display decisions. No simulation mutation or combat/telegraph geometry.
export const ATLAS_IDS = Object.freeze({
  ghoul: 'ghoul', ghost: 'ghost', bat: 'bat',
  demon: 'demon', goleling: 'goleling', slime: 'slime',
  succubus: 'succubus',
  blade: 'hero-sword',
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
  skeleton_warrior: 'skeleton-warrior',
  skeleton_rogue: 'skeleton-rogue',
  skeleton_mage: 'skeleton-mage',
});
export const DIRECTIONS = Object.freeze(['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE']);

export function atlasScale(entity) {
  return (entity.type === 'goblin_chief' ? BALANCE.size.bossBase : entity.type === 'training_dragon' ? 1.2 : entity.type === 'throne_dragon' ? 1.4650580478478936 : 1) * (entity.sizeScale || 1);
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
  if (entity.type === 'throne_dragon' && entity.act && Object.values(DRAGON_CLIPS).includes(state)) return dragonFrame(entity.act, count);
  if (state === 'attack' && entity.act) {
    const def = entity.act.def;
    const ticks = ['windup', 'lock', 'active', 'recovery']
      .reduce((sum, phase) => sum + Math.ceil((def[`${phase}Ms`] || 0) / (1000 / 30)), 0);
    return Math.min(count - 1, Math.floor(entity.act.elapsed / Math.max(1, ticks) * count));
  }
  // Optional per-kit presentation duration; attack keeps authoritative phase timing.
  const frame = Math.floor(age * (duration > 0 ? count / duration : fps));
  return state === 'idle' || state === 'run' ? frame % count : Math.min(count - 1, frame);
}
