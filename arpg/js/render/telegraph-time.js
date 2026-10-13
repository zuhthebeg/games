// Guest display only: advance deterministic monster action clocks, never positions,
// hit geometry, AI decisions or player actions. A stale packet cannot invent a new act.
import { ticks } from '../sim/core.js';
import { getTelegraphs } from '../sim/world.js';
const PHASES = ['windup', 'lock', 'active', 'recovery'];
export function currentTelegraphs(world, currentTick) {
  const advance = Math.max(0, currentTick - world.tick);
  const entities = world.entities.map(e => {
    if (e.kind !== 'monster' || !e.act || e.dead || e.spawnLeft > 0 || e.staggerLeft > 0) return e;
    const act = { ...e.act, elapsed: e.act.elapsed + advance };
    let left = act.elapsed, phase;
    for (const name of PHASES) {
      const ms = act.def[`${name}Ms`] || 0;
      const duration = ms > 0 || name === 'active' ? Math.max(1, ticks(ms)) : 0;
      if (left < duration) { phase = name; break; }
      left -= duration;
    }
    return { ...e, act: phase ? { ...act, phase } : null };
  });
  const view = { ...world, entities, viewTick: currentTick };
  const unknown = (world.telegraphs ?? []).filter(t => !entities.some(e => e.kind === 'monster' && e.id === t.id));
  return { ...view, telegraphs: [...getTelegraphs(view), ...unknown] };
}
