import { WEAPONS } from '../content/combat.js';
import { AttackPresentation } from './attack-presentation.js';
import { predictPlayerTick, predictionBlocked } from './player-prediction.js';
import { bodyContactEligible, bodyWeight } from '../sim/body-contact.js';

const TICK_MS = 1000 / 30;
// Keep normal drift's 24px cutoff; evidenced hits may smooth up to 96px over four ticks.
const HIT_WINDOW_MS = 2 * TICK_MS, HIT_LIMIT_PX = 48, HIT_GROSS_PX = 96;
const lerp = (a, b, t) => a + (b - a) * t;
// Fraction of last frame's contact displacement kept while easing back to the replayed pawn.
const CONTACT_CARRY = .6, CONTACT_CARRY_DROP_PX = 48;
// Does the segment from the last drawn pawn to (x,y) pass through a body?
function crossesBody(from, x, y, e, min) {
  const sx = x - from.x, sy = y - from.y, len2 = sx * sx + sy * sy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((e.x - from.x) * sx + (e.y - from.y) * sy) / len2)) : 0;
  return Math.hypot(from.x + sx * t - e.x, from.y + sy * t - e.y) < min;
}

// A display-only local pawn. Never owns a sim world or exposes predicted HUD/combat.
export class LocalPrediction {
  constructor(uid, { multiplayerDodge = false } = {}) {
    this.multiplayerDodge = multiplayerDodge;
    this.attacks = new AttackPresentation();
    this.uid = uid; this.pending = []; this.state = null; this.arena = null; this.others = [];
    this.enabled = false; this.offset = { x: 0, y: 0 }; this.smoothLeft = 0; this.preview = null;
    this.authority = null; this.hitSmoothing = false; this.roundEnded = false;
    this.stats = { corrections: 0, snaps: 0, totalDistance: 0, maxDistance: 0, reasons: {} };
  }
  reconcile(world) {
    const displayed = this.state ? this.displayPawn(this.state) : null;
    const p = world.entities.find(e => e.kind === 'player' && e.pid === this.uid);
    if (!p || !Number.isSafeInteger(p.lastInputSeq) || !Number.isFinite(p.speed) || !p.dodge) {
      this.enabled = false; this.state = null; this.pending = []; this.authority = null; this.attacks.clear(); this.clearOffset(); return;
    }
    // Compare fresh authority with previous authority, not replayed HP/impulse decay.
    const previous = this.authority, fresh = previous && world.tick > previous.tick;
    const hpDrop = !!fresh && p.hp < previous.hp;
    const newHurt = !!fresh && (p.hurtInvuln || 0) > previous.hurtInvuln;
    const impulse = Math.hypot(p.kx || 0, p.ky || 0);
    const newImpulse = !!fresh && impulse > previous.impulse + .5;
    const hit = hpDrop || newHurt || newImpulse;
    this.authority = { tick: world.tick, hp: p.hp, hurtInvuln: p.hurtInvuln || 0, impulse };
    this.enabled = true; this.arena = world.arena; this.tick = world.tick;
    this.attacks.reconcile(p, world);
    this.others = world.entities.filter(e => e !== p);
    this.pending = this.pending.filter(row => row.seq > p.lastInputSeq);
    let next = { ...p, dodge: { ...p.dodge }, cds: { ...p.cds }, act: p.act ? { ...p.act } : null, ...(p.combo ? { combo: { ...p.combo } } : {}) };
    next.act = this.attacks.bind(next.act, p.lastInputSeq);
    this.roundEnded = !!(world.round?.state && world.round.state !== 'running');
    const blocked = predictionBlocked(p) || this.roundEnded;
    if (blocked) { this.pending = []; this.attacks.clear(); }
    else for (const row of this.pending) { next = this.attacks.track(next, predictPlayerTick(next, row.input, this), row.seq); this.tick++; }
    if (this.state) {
      const target = this.displayPawn(next);
      const dx = displayed.x + this.offset.x - target.x, dy = displayed.y + this.offset.y - target.y;
      const distance = Math.hypot(dx, dy);
      const replayDistance = Math.hypot(this.state.x - next.x, this.state.y - next.y);
      const terminal = p.dead || p.terminal || (world.round?.state && world.round.state !== 'running');
      const continuing = this.hitSmoothing && this.smoothLeft > 0;
      const correctionDistance = Math.max(distance, replayDistance);
      const evidencedHit = hit && correctionDistance < HIT_GROSS_PX;
      const reason = terminal || this.state.dead || this.state.terminal ? 'terminal'
        : blocked || predictionBlocked(this.state) || predictionBlocked(next) ? 'blocked'
        : evidencedHit ? 'authority-hit' : correctionDistance >= HIT_LIMIT_PX ? 'gross' : hit ? 'authority-hit'
        : continuing && distance < 24 ? 'hit-continuation' : 'drift';
      const smoothHit = reason === 'authority-hit' || reason === 'hit-continuation';
      const snap = reason === 'terminal' || reason === 'blocked' || reason === 'gross' || (!smoothHit && distance >= 24);
      // Sub-pixel disagreement is not worth a visible correction.
      if (distance > .5) {
        this.stats.corrections++; this.stats.totalDistance += distance;
        this.stats.maxDistance = Math.max(this.stats.maxDistance, distance);
        this.stats.reasons[reason] = (this.stats.reasons[reason] || 0) + 1;
        if (snap) {
          this.stats.snaps++;
          this.stats.lastSnap = { distance, blocked, lastInputSeq: p.lastInputSeq,
            authoritative: { x: p.x, y: p.y, dashLeft: p.dodge.dashLeft, hurtInvuln: p.hurtInvuln, kx: p.kx, ky: p.ky,
              act: p.act?.phase ?? null, terminal: p.terminal, channel: p.channel },
            previous: { x: this.state.x, y: this.state.y, dashLeft: this.state.dodge.dashLeft }, replayed: this.pending.length };
          this.clearOffset();
        } else {
          this.offset = { x: dx, y: dy };
          // Follow-up authority must not perpetually restart an active hit's deadline.
          const hitWindow = distance > HIT_LIMIT_PX ? 4 * TICK_MS : HIT_WINDOW_MS;
          this.smoothLeft = smoothHit ? (continuing ? Math.min(this.smoothLeft, hitWindow) : hitWindow) : 150;
          this.hitSmoothing = smoothHit;
        }
        this.stats.lastCorrection = { reason, distance, replayDistance, jump: snap ? distance : 0,
          offset: Math.hypot(this.offset.x, this.offset.y), windowMs: this.smoothLeft,
          hpDrop, newHurt, newImpulse, replayed: this.pending.length };
      } else this.clearOffset();
    }
    this.state = next;
  }
  clearOffset() { this.offset = { x: 0, y: 0 }; this.smoothLeft = 0; this.hitSmoothing = false; }
  advance(packet, input, dt) {
    if (!this.enabled || !this.state || this.roundEnded) return;
    if (this.smoothLeft > 0) {
      const fraction = Math.max(0, 1 - dt / this.smoothLeft);
      this.offset.x *= fraction; this.offset.y *= fraction;
      this.smoothLeft = Math.max(0, this.smoothLeft - dt);
      if (this.smoothLeft === 0) this.clearOffset();
    }
    // The exact command the host will apply for this tick (quantized axes, held buttons, edges).
    const command = { ...input, mx: packet.v[0], my: packet.v[1], aimX: packet.v[2], aimY: packet.v[3],
      attack: !!packet.attack, autoAttack: !!packet.autoAttack, viewTick: packet.viewTick };
    if (!predictionBlocked(this.state)) {
      this.pending.push({ seq: packet.seq, input: command, dt });
      // Bound memory through an outage. Stop predicting rather than invent lost history.
      if (this.pending.length > 256) { this.enabled = false; this.pending = []; this.clearOffset(); return; }
      this.attacks.timeout = this.presentationTimeout ?? 100;
      this.attacks.advance(this.state, dt);
      this.state = this.attacks.track(this.state, predictPlayerTick(this.state, command, this), packet.seq); this.tick++;
    }
  }
  // Display-only partial tick: the not-yet-committed fraction of the current tick,
  // so the pawn responds on the very next frame while commands stay whole 30Hz ticks.
  setPreview(input, ms) {
    this.preview = ms > 0 ? { ms, input: { ...input } } : null;
  }
  displayPawn(state) {
    let p = state;
    if (this.preview && !this.roundEnded && !predictionBlocked(p)) {
      // Blend toward the tick the current input will produce; continuous at tick boundaries.
      const next = predictPlayerTick(p, this.preview.input, this), t = Math.min(1, this.preview.ms / TICK_MS);
      p = { ...p, x: lerp(p.x, next.x, t), y: lerp(p.y, next.y, t), facing: next.facing, moving: next.moving, ...(!p.act && next.act && next.act.id !== WEAPONS[p.weapon]?.basic ? { act: next.act } : {}), ...(next.shieldGuard ? {shieldGuard:{...next.shieldGuard}} : {}) };
    }
    return p;
  }
  // The pawn is drawn ahead (replayed input) while other bodies are drawn at the
  // buffered past, and replay has no body contacts. Draw the pawn outside the bodies
  // the guest actually sees; prediction state, authority and reconciliation are untouched.
  displayContact(pawn, world, dodge = pawn.dodge) {
    if (bodyWeight(pawn, world.tick) === 0) { this.lastContactView = this.lastRawView = null; return pawn; }
    const ref = this.lastContactView, raw = this.lastRawView, contactPawn = dodge === pawn.dodge ? pawn : { ...pawn, dodge };
    const rawStep = raw ? Math.hypot(pawn.x - raw.x, pawn.y - raw.y) : 0;
    let { x, y } = pawn;
    // Ease out of a held contact instead of popping to the replayed pawn; a gross
    // jump (reconcile snap, teleport) drops the carry.
    if (ref && raw && rawStep < CONTACT_CARRY_DROP_PX) {
      let cx = (ref.x - raw.x) * CONTACT_CARRY, cy = (ref.y - raw.y) * CONTACT_CARRY;
      // Never carry the pawn further from its replayed spot than where it was drawn.
      const c = Math.hypot(cx, cy), lim = Math.hypot(ref.x - pawn.x, ref.y - pawn.y);
      if (c > lim) { cx *= lim / c; cy *= lim / c; }
      x += cx; y += cy;
    }
    const slide = rawStep * 1.5 + 2;
    for (const e of world.entities) {
      if (e.kind === 'player' || !bodyContactEligible(contactPawn, e)) continue;
      const min = pawn.r + e.r, dx = x - e.x, dy = y - e.y, d = Math.hypot(dx, dy);
      // Keep the side the pawn was drawn on last frame, so deep replay never pops through.
      const rx = ref ? ref.x - e.x : 0, ry = ref ? ref.y - e.y : 0, rd = Math.hypot(rx, ry);
      // Any path from the last drawn spot through the body (head-on or around the side).
      if (d >= min && !(rd > 1e-6 && crossesBody(ref, x, y, e, min))) continue;
      let nx, ny;
      if (d > 1e-6 && (rd < 1e-6 || dx * rx + dy * ry > 0)) { nx = dx / d; ny = dy / d; }
      else if (rd > 1e-6) { nx = rx / rd; ny = ry / rd; }
      else { nx = Math.cos(pawn.facing || 0); ny = Math.sin(pawn.facing || 0); }
      // Slide around the body no faster than the pawn itself moves, never a jump.
      if (rd > 1e-6) {
        const ux = rx / rd, uy = ry / rd, cross = ux * ny - uy * nx, dot = ux * nx + uy * ny;
        const angle = Math.atan2(cross, dot), max = slide / min;
        if (Math.abs(angle) > max) {
          const t = Math.sign(angle) * max, c = Math.cos(t), s = Math.sin(t);
          nx = ux * c - uy * s; ny = ux * s + uy * c;
        }
      }
      x = e.x + nx * min; y = e.y + ny * min;
      const a = world.arena;
      if (a) {
        const lo = pawn.r, hiX = a.w - lo, hiY = a.h - lo;
        x = Math.max(lo, Math.min(hiX, x)); y = Math.max(lo, Math.min(hiY, y));
        if (Math.hypot(x - e.x, y - e.y) < min - 1e-9) {
          // A wall can erase the radial exit. Choose the nearest feasible circle/
          // arena-edge intersection instead of clamping back into the body.
          const candidates = [];
          for (const edge of [lo, hiX]) {
            const q = min * min - (edge - e.x) ** 2;
            if (q >= 0) for (const sign of [-1, 1]) candidates.push({ x: edge, y: e.y + sign * Math.sqrt(q) });
          }
          for (const edge of [lo, hiY]) {
            const q = min * min - (edge - e.y) ** 2;
            if (q >= 0) for (const sign of [-1, 1]) candidates.push({ x: e.x + sign * Math.sqrt(q), y: edge });
          }
          const origin = ref || pawn;
          const exit = candidates.filter(c => c.x >= lo && c.x <= hiX && c.y >= lo && c.y <= hiY)
            .sort((a, b) => Math.hypot(a.x-origin.x, a.y-origin.y) - Math.hypot(b.x-origin.x, b.y-origin.y))[0];
          if (exit) { x = exit.x; y = exit.y; }
        }
      }
    }
    const a = world.arena;
    if (a) { x = Math.max(pawn.r, Math.min(a.w - pawn.r, x)); y = Math.max(pawn.r, Math.min(a.h - pawn.r, y)); }
    if (Math.abs(x - pawn.x) < .05 && Math.abs(y - pawn.y) < .05) { x = pawn.x; y = pawn.y; }
    this.lastContactView = { x, y }; this.lastRawView = { x: pawn.x, y: pawn.y };
    return x === pawn.x && y === pawn.y ? pawn : { ...pawn, x, y };
  }
  view(world) {
    if (!world || !this.enabled || !this.state) { this.lastContactView = this.lastRawView = null; return world; }
    const p = this.displayPawn(this.state);
    return { ...world, projectiles: [...world.projectiles, ...this.attacks.projectiles()], entities: world.entities.map(e => e.pid === this.uid && e.kind === 'player'
      ? this.displayContact({ ...e, act: this.attacks.act(p.act), ...(p.shieldGuard ? {shieldGuard:{...p.shieldGuard}} : {}), ...(p.combo ? { combo: { ...p.combo } } : {}),
        x: p.x + this.offset.x, y: p.y + this.offset.y, facing: p.facing, moving: p.moving }, world, p.dodge) : e) };
  }
  diagnostics() {
    return { ...this.stats, averageDistance: this.stats.corrections ? this.stats.totalDistance / this.stats.corrections : 0,
      enabled: this.enabled, pending: this.pending.length, offset: Math.hypot(this.offset.x, this.offset.y), smoothLeft: this.smoothLeft };
  }
}
