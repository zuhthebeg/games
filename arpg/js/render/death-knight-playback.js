// Presentation-only clock. No simulation/input writes; hidden/frozen views hold.
// Keep the original atlas clock unchanged for all pre-existing kits.
export function advanceDeathKnightPlayback(clock, entity, state, dt, { frozen = false, hidden = false } = {}) {
  if (frozen || hidden) return clock.age || 0;
  const restart = clock.state !== state || (state === 'attack' || state === 'magic') && clock.act !== entity.act
    || state === 'dodge' && clock.startedTick !== entity.dodge?.startedTick;
  clock.age = restart ? 0 : (clock.age || 0) + dt;
  if (restart) clock.startCdLeft = entity.dodge?.cdLeft;
  // Six authoritative 30Hz dash steps consume the first tick before rendering.
  // A perfect-dodge visual slow must not hide the last source poses. Hit-stop
  // still holds via the caller's frozen guard; resume catches up to the sim.
  if (state === 'dodge' && Number.isFinite(entity.dodge?.dashLeft)) {
    clock.age = Math.max(clock.age, (5 - entity.dodge.dashLeft) / 30);
    if (Number.isFinite(clock.startCdLeft) && Number.isFinite(entity.dodge.cdLeft))
      clock.age = Math.max(clock.age, (clock.startCdLeft - entity.dodge.cdLeft) / 30);
  }
  clock.state = state;
  clock.act = entity.act;
  clock.startedTick = entity.dodge?.startedTick;
  return clock.age;
}

export function deathKnightAnimation(entity, animation, select, clock = {}, duration = .2, casting = false) {
  if (entity.terminal && !entity.dead) return 'idle';
  const selected = select(entity, animation);
  // The sim consumes the first dash tick in its start step. Its last movement
  // step therefore has dashLeft=0. Finish the six-pose display window instead
  // of cutting the endpoint off with run on that step; never mask hit/death/act.
  if ((selected === 'idle' || selected === 'run') && clock.state === 'dodge'
    && clock.startedTick === entity.dodge?.startedTick && clock.age < duration) return 'dodge';
  // Focus-family spells plus explicit dark rituals; bow/steel moves stay physical.
  if (casting && selected === 'attack' && (entity.act?.def?.family === 'focus'
    || ['dead_explosion', 'poison_field', 'curse', 'invisibility', 'berserk'].includes(entity.act?.id))) return 'magic';
  return selected;
}
