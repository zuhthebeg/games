import { predictMovement, movementBlocked } from '../sim/movement.js';

// A display-only local pawn. Never owns a sim world or exposes predicted HUD/combat.
export class LocalPrediction {
  constructor(uid) {
    this.uid = uid; this.pending = []; this.state = null; this.arena = null;
    this.enabled = false; this.offset = { x: 0, y: 0 }; this.smoothLeft = 0;
    this.stats = { corrections: 0, snaps: 0, totalDistance: 0, maxDistance: 0 };
  }
  reconcile(world) {
    const p = world.entities.find(e => e.kind === 'player' && e.pid === this.uid);
    if (!p || !Number.isSafeInteger(p.lastInputSeq) || !Number.isFinite(p.speed) || !p.dodge) {
      this.enabled = false; this.state = null; this.pending = []; this.clearOffset(); return;
    }
    this.enabled = true; this.arena = world.arena;
    this.pending = this.pending.filter(row => row.seq > p.lastInputSeq);
    let next = structuredClone(p);
    const blocked = movementBlocked(p);
    if (blocked) this.pending = [];
    else for (const row of this.pending) next = predictMovement(next, row.input, row.dt / 1000, this.arena, world.tick);
    if (this.state) {
      const dx = this.state.x + this.offset.x - next.x, dy = this.state.y + this.offset.y - next.y;
      const distance = Math.hypot(dx, dy);
      if (distance > .01) {
        this.stats.corrections++; this.stats.totalDistance += distance;
        this.stats.maxDistance = Math.max(this.stats.maxDistance, distance);
        if (distance >= 24 || blocked) {
          this.stats.snaps++;
          this.stats.lastSnap = { distance, blocked, lastInputSeq: p.lastInputSeq,
            authoritative: { x: p.x, y: p.y, dashLeft: p.dodge.dashLeft, hurtInvuln: p.hurtInvuln, kx: p.kx, ky: p.ky,
              act: p.act?.phase ?? null, terminal: p.terminal, channel: p.channel },
            previous: { x: this.state.x, y: this.state.y, dashLeft: this.state.dodge.dashLeft }, replayed: this.pending.length };
          this.clearOffset();
        } else { this.offset = { x: dx, y: dy }; this.smoothLeft = 100; }
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
    const movement = { mx: packet.v[0], my: packet.v[1], aimX: packet.v[2], aimY: packet.v[3], dodgeEdge: !!input.dodgeEdge };
    if (!movementBlocked(this.state)) {
      this.pending.push({ seq: packet.seq, input: movement, dt });
      // Bound memory through an outage. Stop predicting rather than invent lost history.
      if (this.pending.length > 256) { this.enabled = false; this.pending = []; this.clearOffset(); return; }
      this.state = predictMovement(this.state, movement, dt / 1000, this.arena);
    }
  }
  view(world) {
    if (!world || !this.enabled || !this.state) return world;
    const p = this.state;
    return { ...world, entities: world.entities.map(e => e.pid === this.uid && e.kind === 'player'
      ? { ...e, x: p.x + this.offset.x, y: p.y + this.offset.y, facing: p.facing, moving: p.moving } : e) };
  }
  diagnostics() {
    return { ...this.stats, averageDistance: this.stats.corrections ? this.stats.totalDistance / this.stats.corrections : 0,
      enabled: this.enabled, pending: this.pending.length };
  }
}
