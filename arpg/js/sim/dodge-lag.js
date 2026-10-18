// Host-only, opt-in guest history. Weak storage never changes serialized worlds/snapshots.
import { shieldBlocks, shieldDamage } from './movement.js';
import { TICK_MS, ticks } from './core.js';
import { multiplayerDodge, dodgeTiming, MULTIPLAYER_REWIND_TICKS } from './dodge-policy.js';
const guests = new WeakMap();
export const DODGE_LAG_CAP_TICKS = Math.floor(250 / TICK_MS);
export function dodgeViewTick(now, viewTick, multi = false) {
  return Number.isSafeInteger(viewTick) && viewTick >= 0 && viewTick <= now
    && now - viewTick <= (multi ? MULTIPLAYER_REWIND_TICKS : DODGE_LAG_CAP_TICKS) ? viewTick : now;
}
export function enableGuestDodgeLag(world, pid) {
  const pawn = world.entities.find(e => e.kind === 'player' && e.pid === pid);
  if (pawn) guests.set(pawn, { hits: [], lastDirect: null });
}
export function resetGuestDodgeHits(p) {
  const state = guests.get(p);
  if (state) { state.hits = []; state.lastDirect = null; }
}
export function pruneGuestHits(p, now) {
  const state = guests.get(p);
  if (state) state.hits = state.hits.filter(h => now - h.tick < 10);
}
export function recordGuestHit(world, p, hit, dmg, kx, ky) {
  const state = guests.get(p);
  // Zone pulses are dodgeable contacts; poison/burn remain unrewindable DoT.
  if (!state || hit.periodic && !hit.zonePulse) return;
  const attacker = world.entities.find(e => e.id === hit.srcId);
  const row = { x:p.x,y:p.y,tick: world.tick, hit, dmg, kx, ky, movedX: 0, movedY: 0,
    arena: world.arena, hurtInvuln: p.hurtInvuln, poison: p.poison ? structuredClone(p.poison) : null };
  state.lastDirect = row;
  if (!hit.counter && (attacker ? attacker.team !== p.team : hit.srcKind !== 'player')) state.hits.push(row);
}
export function trackGuestKnock(p) {
  const state = guests.get(p);
  if (!state) return;
  for (const row of state.hits) {
    // Attribute only the displacement the arena permits, not clipped off-map knock.
    const bounded = (v, max) => Math.max(p.r, Math.min(max - p.r, v));
    if (p.kx) row.movedX += (bounded(p.x + p.kx, row.arena.w) - bounded(p.x, row.arena.w)) * row.kx / p.kx;
    if (p.ky) row.movedY += (bounded(p.y + p.ky, row.arena.h) - bounded(p.y, row.arena.h)) * row.ky / p.ky;
    row.kx = Math.abs(p.kx * .82) < .05 ? 0 : row.kx * .82;
    row.ky = Math.abs(p.ky * .82) < .05 ? 0 : row.ky * .82;
  }
}
// A timestamp belongs to the pressed edge, not to a newer held/movement frame.
// Missing history is explicit undefined: never substitute a newer render timestamp.
export function dodgeInputViewTick(inp, edge = 'dodgeEdge') {
  return edge !== 'dodgeEdge' && Object.hasOwn(inp.skillViewTicks || {}, edge)
    ? inp.skillViewTicks[edge] : inp.viewTick;
}
export function rewindGuestDodge(world, p, inp, awardPerfect, edge = 'dodgeEdge') {
  const state = guests.get(p);
  if (!state || !inp[edge] || p.dead || p.terminal) return;
  const start = dodgeViewTick(world.tick, dodgeInputViewTick(inp, edge), multiplayerDodge(world)), age = world.tick - start;
  if (!age) return;
  p.dodge.startedTick = start;
  const iframeTicks = dodgeTiming(p, multiplayerDodge(world)).iframeTicks;
  const physical=p.offhand === 'shield';
  if (physical) { p.dodge.iframeLeft=0;p.shieldGuard.left=inp.dodgeHeld?1:0; }
  else p.dodge.iframeLeft = Math.max(0, iframeTicks - age);
  const keep = [], focusRewards = [];
  for (const row of state.hits) {
    const since = row.tick - start;
    if (since < 0 || since >= (physical ? ticks(400) : iframeTicks)) { keep.push(row); continue; }
    if (physical) {
      if (!shieldBlocks({...p,x:row.x,y:row.y},row.hit,{...p.shieldGuard,left:1})) {keep.push(row);continue;}
      const perfect=awardPerfect(world,p,row.hit,since);
      // Newest held can block before its edge exits the jitter queue. That contact
      // can still earn the edge's one perfect reward, but has already paid ×0.3:
      // refund its recorded applied damage on perfect, never mitigate it twice.
      if (row.hit.shieldBlocked && !perfect) {keep.push(row);continue;}
      const refund=perfect?row.dmg:row.dmg-shieldDamage(row.dmg);
      p.hp=Math.min(p.maxHp,p.hp+refund);
      if(perfect)undoContact(world,p,row,state);
      world.events.push({type:'dodgeRewind',id:p.id,pid:p.pid,srcId:row.hit.srcId,hitTick:row.tick,dodgeTick:start,heal:refund,kind:'block'});
      continue;
    }
    p.hp = Math.min(p.maxHp, p.hp + row.dmg);
    undoContact(world,p,row,state);
    world.events.push({ type: 'dodgeRewind', id: p.id, pid: p.pid, srcId: row.hit.srcId,
      hitTick: row.tick, dodgeTick: start, heal: row.dmg });
    if(p.weapon === 'focus') focusRewards.push([row.hit,since]);
    else awardPerfect(world, p, row.hit, since);
  }
  for(const [hit,since] of focusRewards) awardPerfect(world,p,hit,since);
  state.hits = keep;
}

function undoContact(world,p,row,state) {
    p.kx -= row.kx; p.ky -= row.ky;
    p.x -= row.movedX; p.y -= row.movedY;
    if(p.weapon === 'focus') {p.dodge.originX-=row.movedX;p.dodge.originY-=row.movedY;}
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
}
