// Pure display decisions. No simulation mutation or combat/telegraph geometry.
export const ATLAS_IDS = Object.freeze({
  blade: 'hero-sword',
  bow: 'hero-bow',
  focus: 'hero-focus',
  goblin_grunt: 'goblin-grunt',
  goblin_slinger: 'goblin-archer',
  goblin_chief: 'goblin-chief',
  // No verified boar artwork yet: keep its distinct procedural silhouette.
});
export const DIRECTIONS = Object.freeze(['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE']);

export function atlasScale(entity) {
  return entity.type === 'goblin_chief' ? 1.3 : 1;
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
  if (entity.act) return 'attack';
  return entity.moving ? 'run' : 'idle';
}

export function atlasFrame(state, count, age, fps, entity) {
  if (state === 'attack' && entity.act) {
    const def = entity.act.def;
    const ticks = ['windup', 'lock', 'active', 'recovery']
      .reduce((sum, phase) => sum + Math.ceil((def[`${phase}Ms`] || 0) / (1000 / 30)), 0);
    return Math.min(count - 1, Math.floor(entity.act.elapsed / Math.max(1, ticks) * count));
  }
  const frame = Math.floor(age * fps);
  return state === 'idle' || state === 'run' ? frame % count : Math.min(count - 1, frame);
}
