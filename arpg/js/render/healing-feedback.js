// Display-only hooks; actual HP changes and exactly-once delivery belong to the host sim.
export function healingFeedback(renderer, event) {
  if (event.type === 'healCast') {
    renderer.effect(event.x, event.y, event.radius, 0x79dca0, .4);
    return true;
  }
  if (event.type === 'heal') {
    renderer.number(`+${event.heal}`, event.x, event.y, 0x79dca0);
    return true;
  }
  return false;
}
