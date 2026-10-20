// Host-only positional history. No HP/MP/CD rollback and no serialized-world fields.
import {shapeHitsCircle, TICK_MS} from './core.js';
export const ATTACK_REWIND_TICKS = Math.floor(200 / TICK_MS);
const worlds = new WeakMap(), actions = new WeakMap();
export function enableGuestAttackLag(world, pid) {
  let state = worlds.get(world);
  if (!state) worlds.set(world, state = { guests: new Set(), frames: [] });
  state.guests.add(pid);
}
export function recordAttackPoses(world) {
  const state = worlds.get(world); if (!state) return;
  state.frames.push({tick: world.tick, poses: new Map(world.entities.filter(e => e.kind === 'monster' && !e.dead && !e.spawnLeft)
    .map(e => [e.id, {x:e.x,y:e.y,r:e.r}]))});
  while (state.frames.length > ATTACK_REWIND_TICKS + 2) state.frames.shift();
}
export function bindAttackPose(world, pawn, act, input, edge) {
  if (!worlds.get(world)?.guests.has(pawn.pid) || !act || act.counter || act.def.delivery !== 'shape' || act.def.dash) return;
  const tick = edge && Object.hasOwn(input.skillPoseTicks || {}, edge) ? input.skillPoseTicks[edge] : input.poseTick;
  // Small fractional timestamps are real interpolation times. Far-future or ancient claims
  // are invalid; plausible but older views receive at most 200ms, never an extended window.
  if (!Number.isFinite(tick) || tick < 0 || tick > world.tick || world.tick-tick > 12) return;
  actions.set(act, Math.min(ATTACK_REWIND_TICKS, world.tick-tick));
}
export function attackShapeHits(world, pawn, act, shape, ox, oy, target) {
  if (shapeHitsCircle(shape,ox,oy,act.facing,target.x,target.y,target.r)) return true;
  const lag = actions.get(act), state = worlds.get(world);
  if (!lag || !state || target.kind !== 'monster' || target.dead || target.spawnLeft || target.team === pawn.team) return false;
  const tick = world.tick-lag;
  const a = state.frames.findLast(f => f.tick <= tick), b = state.frames.find(f => f.tick >= tick);
  const from = a?.poses.get(target.id), to = b?.poses.get(target.id);
  if (!from || !to) return false;
  const alpha = a.tick === b.tick ? 0 : (tick-a.tick)/(b.tick-a.tick);
  const x = from.x+(to.x-from.x)*alpha, y = from.y+(to.y-from.y)*alpha;
  // Reject teleports/invalid arena poses; attacker origin and normal shape/range stay current.
  const inside = (x,y,r) => x>=r && y>=r && x<=world.arena.w-r && y<=world.arena.h-r;
  if (!inside(ox,oy,pawn.r) || !inside(x,y,target.r) || !inside(target.x,target.y,target.r)
    || Math.hypot(target.x-x,target.y-y) > 80) return false;
  return shapeHitsCircle(shape,ox,oy,act.facing,x,y,target.r);
}
