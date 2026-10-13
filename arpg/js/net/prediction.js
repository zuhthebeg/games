import { predictPlayerTick, predictionBlocked } from './player-prediction.js';

const TICK_MS = 1000 / 30;
const lerp = (a, b, t) => a + (b - a) * t;

// A display-only local pawn. Never owns a sim world or exposes predicted HUD/combat.
export class LocalPrediction {
  constructor(uid) {
    this.uid = uid; this.pending = []; this.state = null; this.arena = null; this.others = [];
    this.enabled = false; this.offset = { x: 0, y: 0 }; this.smoothLeft = 0; this.preview = null;
    this.stats = { corrections: 0, snaps: 0, totalDistance: 0, maxDistance: 0 };
  }
  reconcile(world) {
    const p = world.entities.find(e => e.kind === 'player' && e.pid === this.uid);
    if (!p || !Number.isSafeInteger(p.lastInputSeq) || !Number.isFinite(p.speed) || !p.dodge) {
      this.enabled = false; this.state = null; this.pending = []; this.clearOffset(); return;
    }
    this.enabled = true; this.arena = world.arena; this.tick = world.tick;
    this.others = world.entities.filter(e => e !== p);
    this.pending = this.pending.filter(row => row.seq > p.lastInputSeq);
    let next = { ...p, dodge: { ...p.dodge }, cds: { ...p.cds }, act: p.act ? { ...p.act } : null };
    const blocked = predictionBlocked(p);
    if (blocked) this.pending = [];
    else for (const row of this.pending) { next = predictPlayerTick(next, row.input, this); this.tick++; }
    if (this.state) {
      const dx = this.state.x + this.offset.x - next.x, dy = this.state.y + this.offset.y - next.y;
      const distance = Math.hypot(dx, dy);
      // Sub-pixel disagreement is not worth a visible correction.
      if (distance > .5) {
        this.stats.corrections++; this.stats.totalDistance += distance;
        this.stats.maxDistance = Math.max(this.stats.maxDistance, distance);
        if (distance >= 24 || blocked) {
          this.stats.snaps++;
          this.stats.lastSnap = { distance, blocked, lastInputSeq: p.lastInputSeq,
            authoritative: { x: p.x, y: p.y, dashLeft: p.dodge.dashLeft, hurtInvuln: p.hurtInvuln, kx: p.kx, ky: p.ky,
              act: p.act?.phase ?? null, terminal: p.terminal, channel: p.channel },
            previous: { x: this.state.x, y: this.state.y, dashLeft: this.state.dodge.dashLeft }, replayed: this.pending.length };
          this.clearOffset();
        } else { this.offset = { x: dx, y: dy }; this.smoothLeft = 150; }
      } else this.clearOffset();
    }
    this.state = next;
  }
  clearOffset() { this.offset = { x: 0, y: 0 }; this.smoothLeft = 0; }
  advance(packet, input, dt) {
    if (!this.enabled || !this.state) return;
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
      this.state = predictPlayerTick(this.state, command, this); this.tick++;
    }
  }
  // Display-only partial tick: the not-yet-committed fraction of the current tick,
  // so the pawn responds on the very next frame while commands stay whole 30Hz ticks.
  setPreview(input, ms) {
    this.preview = ms > 0 ? { ms, input: { ...input } } : null;
  }
  view(world) {
    if (!world || !this.enabled || !this.state) return world;
    let p = this.state;
    if (this.preview && !predictionBlocked(p)) {
      // Blend toward the tick the current input will produce; continuous at tick boundaries.
      const next = predictPlayerTick(p, this.preview.input, this), t = Math.min(1, this.preview.ms / TICK_MS);
      p = { ...p, x: lerp(p.x, next.x, t), y: lerp(p.y, next.y, t), facing: next.facing, moving: next.moving };
    }
    return { ...world, entities: world.entities.map(e => e.pid === this.uid && e.kind === 'player'
      ? { ...e, x: p.x + this.offset.x, y: p.y + this.offset.y, facing: p.facing, moving: p.moving } : e) };
  }
  diagnostics() {
    return { ...this.stats, averageDistance: this.stats.corrections ? this.stats.totalDistance / this.stats.corrections : 0,
      enabled: this.enabled, pending: this.pending.length };
  }
}
