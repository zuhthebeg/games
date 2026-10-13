// Host-only, opt-in guest history. Weak storage never changes serialized worlds/snapshots.
import { TICK_MS, ticks } from './core.js';
import { PLAYER_BASE as PB } from '../content/combat.js';
const guests = new WeakMap();
export const DODGE_LAG_CAP_TICKS = Math.floor(250 / TICK_MS);
export function dodgeViewTick(now, viewTick) {
  return Number.isSafeInteger(viewTick) && viewTick >= 0 && viewTick <= now
    && now - viewTick <= DODGE_LAG_CAP_TICKS ? viewTick : now;
}
export function enableGuestDodgeLag(world, pid) {
  const pawn = world.entities.find(e => e.kind === 'player' && e.pid === pid);
  if (pawn) guests.set(pawn, { hits: [], lastDirect: null });
}
export function pruneGuestHits(p, now) {
  const state = guests.get(p);
  if (state) state.hits = state.hits.filter(h => now - h.tick < 10);
}
export function recordGuestHit(world, p, hit, dmg, kx, ky) {
  const state = guests.get(p);
  if (!state || hit.periodic) return;
  const attacker = world.entities.find(e => e.id === hit.srcId);
  const row = { tick: world.tick, hit, dmg, kx, ky, movedX: 0, movedY: 0,
    hurtInvuln: p.hurtInvuln, poison: p.poison ? structuredClone(p.poison) : null };
  state.lastDirect = row;
  if (!hit.counter && (attacker ? attacker.team !== p.team : hit.srcKind !== 'player')) state.hits.push(row);
}
export function trackGuestKnock(p) {
  const state = guests.get(p);
  if (!state) return;
  for (const row of state.hits) {
    row.movedX += row.kx; row.movedY += row.ky;
    row.kx *= .82; row.ky *= .82;
  }
}
export function rewindGuestDodge(world, p, inp, awardPerfect) {
  const state = guests.get(p);
  if (!state || !inp.dodgeEdge || p.dead || p.terminal) return;
  const start = dodgeViewTick(world.tick, inp.viewTick), age = world.tick - start;
  if (!age) return;
  p.dodge.startedTick = start;
  const iframeTicks = ticks(PB.dodge.iframeMs + p.iframeBonusMs);
  p.dodge.iframeLeft = Math.max(0, iframeTicks - age);
  const keep = [];
  for (const row of state.hits) {
    const since = row.tick - start;
    if (since < 0 || since >= iframeTicks) { keep.push(row); continue; }
    p.hp = Math.min(p.maxHp, p.hp + row.dmg);
    p.kx -= row.kx; p.ky -= row.ky;
    p.x -= row.movedX; p.y -= row.movedY;
    if (Math.abs(p.kx) < .05) p.kx = 0;
    if (Math.abs(p.ky) < .05) p.ky = 0;
    if (state.lastDirect === row) p.hurtInvuln = Math.max(0, row.hurtInvuln - (world.tick - row.tick));
    // Undo this contact's status, never refund periodic damage already applied.
    if (row.hit.def.poison && p.poison?.hit.srcId === row.hit.srcId) {
      p.poison = row.poison;
      if (p.poison) {
        const elapsed = world.tick - row.tick;
        p.poison.left -= elapsed;
        p.poison.next = ((p.poison.next - 1 - elapsed) % p.poison.interval + p.poison.interval) % p.poison.interval + 1;
        if (p.poison.left <= 0) p.poison = null;
      }
    }
    world.events.push({ type: 'dodgeRewind', id: p.id, pid: p.pid, srcId: row.hit.srcId,
      hitTick: row.tick, dodgeTick: start, heal: row.dmg });
    awardPerfect(world, p, row.hit, since);
  }
  state.hits = keep;
}
