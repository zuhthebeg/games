// Pure position-only helpers. No world stepping, combat, events or persistence.
import { DT, ticks } from './core.js';
import { PLAYER_BASE as PB } from '../content/combat.js';

export function loadEffects(ratio) {
  if (ratio < 0.8) return { speed: 1, dodgeCd: 1 };
  if (ratio <= 1) return { speed: 1, dodgeCd: 1.15 };
  return { speed: 1 - 0.25 * Math.min(1, (ratio - 1) / 0.2), dodgeCd: 1.3 };
}
export function movementInput(inp) {
  const mlen = Math.hypot(inp.mx, inp.my);
  return { mlen, mx: mlen > 1 ? inp.mx / mlen : inp.mx, my: mlen > 1 ? inp.my / mlen : inp.my };
}
export function dodgeStart(p, direction, tick) {
  const [dx, dy] = direction, dashTicks = ticks(PB.dodge.dashMs);
  return { facing: Math.atan2(dy, dx), dodge: { ...p.dodge, dashLeft: dashTicks,
    dx: (dx * PB.dodge.distance) / dashTicks, dy: (dy * PB.dodge.distance) / dashTicks,
    iframeLeft: ticks(PB.dodge.iframeMs + p.iframeBonusMs),
    cdLeft: ticks(PB.dodge.cooldownMs * p.dodgeCdMult * loadEffects(p.loadRatio).dodgeCd),
    startedTick: tick, perfectPaid: false } };
}
export function walkingPosition(p, inp, dt = DT) {
  const { mlen, mx, my } = movementInput(inp);
  const phase = p.act ? p.act.phase : null;
  const f = !phase ? 1 : phase === 'recovery' ? 0.55 : p.act.def.delivery === 'dash' ? 0 : 0.3;
  const sp = p.speed * loadEffects(p.loadRatio).speed;
  let facing = p.facing;
  if (!p.act) {
    if (inp.aimX || inp.aimY) facing = Math.atan2(inp.aimY, inp.aimX);
    else if (mlen > 0.15) facing = Math.atan2(my, mx);
  }
  return { x: p.x + mx * sp * f * dt, y: p.y + my * sp * f * dt, moving: mlen > 0.15 && f > 0, facing };
}
export function dashPosition(p, dt = DT) {
  const fraction = dt / DT, used = Math.min(p.dodge.dashLeft, fraction);
  return { x: p.x + p.dodge.dx * used, y: p.y + p.dodge.dy * used,
    moving: true, dodge: { ...p.dodge, dashLeft: Math.max(0, p.dodge.dashLeft - fraction) } };
}
export function knockPosition(e) {
  let kx = e.kx * 0.82, ky = e.ky * 0.82;
  if (Math.abs(kx) < 0.05) kx = 0;
  if (Math.abs(ky) < 0.05) ky = 0;
  return { x: e.x + e.kx, y: e.y + e.ky, kx, ky };
}
export function arenaPosition(e, { w, h }) {
  return { x: Math.max(e.r, Math.min(w - e.r, e.x)), y: Math.max(e.r, Math.min(h - e.r, e.y)) };
}
// Dynamic bodies are resolved by the host's ordered separate() pass, not simulated
// by guests. There are no static walls/obstacles in the current arena sim.
export function movementBlocked(p) {
  return !p || p.dead || p.terminal || p.channel > 0 || p.staggerLeft > 0 || p.hurtInvuln > 0
    || !!p.kx || !!p.ky || (p.act && ['lock', 'active'].includes(p.act.phase));
}
export function predictMovement(p, inp, dt, arena, tick = 0) {
  if (movementBlocked(p)) return p;
  const n = { ...p, dodge: { ...p.dodge } }, fraction = dt / DT;
  n.dodge.cdLeft = Math.max(0, n.dodge.cdLeft - fraction);
  n.dodge.iframeLeft = Math.max(0, n.dodge.iframeLeft - fraction);
  if (inp.dodgeEdge && n.dodge.cdLeft === 0 && n.dodge.dashLeft === 0
    && (!n.act || (n.act.def.cancelInto || []).includes(n.act.phase))) {
    const { mlen, mx, my } = movementInput(inp);
    Object.assign(n, dodgeStart(n, mlen > .2 ? [mx, my] : [Math.cos(n.facing), Math.sin(n.facing)], tick));
    n.act = null; // only the copied movement state; never start/end a sim action
  }
  if (n.dodge.dashLeft > 0) {
    const dashTime = Math.min(dt, n.dodge.dashLeft * DT);
    Object.assign(n, dashPosition(n, dashTime));
    if (dt > dashTime) Object.assign(n, walkingPosition(n, inp, dt - dashTime));
  } else Object.assign(n, walkingPosition(n, inp, dt));
  Object.assign(n, arenaPosition(n, arena));
  return n;
}
