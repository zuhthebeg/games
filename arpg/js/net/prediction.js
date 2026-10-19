import { WEAPONS } from '../content/combat.js';
import { AttackPresentation } from './attack-presentation.js';
import { predictPlayerTick, predictionBlocked } from './player-prediction.js';

const TICK_MS = 1000 / 30;
// Two command ticks are the shortest tested whole-tick window with <24px
// correction steps on all six captured traces (including fractional preview).
// Keep normal drift's 24px cutoff; only evidenced hits may use up to twice that budget.
const HIT_WINDOW_MS = 2 * TICK_MS, HIT_LIMIT_PX = 48;
const lerp = (a, b, t) => a + (b - a) * t;

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
      const reason = terminal || this.state.dead || this.state.terminal ? 'terminal'
        : blocked || predictionBlocked(this.state) || predictionBlocked(next) ? 'blocked'
        : Math.max(distance, replayDistance) >= HIT_LIMIT_PX ? 'gross' : hit ? 'authority-hit'
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
          this.smoothLeft = smoothHit ? (continuing ? Math.min(this.smoothLeft, HIT_WINDOW_MS) : HIT_WINDOW_MS) : 150;
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
  view(world) {
    if (!world || !this.enabled || !this.state) return world;
    const p = this.displayPawn(this.state);
    return { ...world, projectiles: [...world.projectiles, ...this.attacks.projectiles()], entities: world.entities.map(e => e.pid === this.uid && e.kind === 'player'
      ? { ...e, act: this.attacks.act(p.act), ...(p.shieldGuard ? {shieldGuard:{...p.shieldGuard}} : {}), ...(p.combo ? { combo: { ...p.combo } } : {}),
        x: p.x + this.offset.x, y: p.y + this.offset.y, facing: p.facing, moving: p.moving } : e) };
  }
  diagnostics() {
    return { ...this.stats, averageDistance: this.stats.corrections ? this.stats.totalDistance / this.stats.corrections : 0,
      enabled: this.enabled, pending: this.pending.length, offset: Math.hypot(this.offset.x, this.offset.y), smoothLeft: this.smoothLeft };
  }
}
