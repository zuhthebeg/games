// Render-only terminal pose. Never tick a concluded encounter to finish presentation:
// atlas death/hurt ages use render delta, but attack uses authoritative act.elapsed.
export function terminalPresentation(world) {
  return { ...world, telegraphs: [], projectiles: [], entities: world.entities.map(entity => ({
    ...entity, act: null, moving: false, staggerLeft: 0,
    dodge: entity.dodge && { ...entity.dodge, dashLeft: 0 },
  })) };
}
