// Guest-only display state. No sim world, events, damage or resource authority.
import { WEAPONS } from '../content/combat.js';
const TICK_MS = 1000 / 30;
const matches = (row, act) => act && row.id === act.id && row.step === (act.step ?? 0) && row.counter === !!act.counter;
export class AttackPresentation {
  constructor() { this.now = 0; this.timeout = 100; this.starts = new Map(); this.shots = []; this.nextId = -1; this.authorityShots = new Set(); }
  track(before, after, seq, tick) {
    if (after.act) {
      const start = !before.act || before.act.id !== after.act.id || after.act.elapsed < before.act.elapsed;
      const row = this.starts.get(seq);
      if (row && matches(row, after.act)) after.act.presentationSeq = seq;
      else if (start) {
        const startTick = Number.isFinite(tick) && Number.isFinite(after.act.elapsed) ? tick - after.act.elapsed : NaN;
        const confirmed = [...this.starts].find(([, candidate]) => candidate.confirmed && !candidate.rejected
          && matches(candidate, after.act) && Number.isFinite(candidate.authorityStart)
          && Number.isFinite(startTick) && Math.abs(candidate.authorityStart - startTick) <= 4);
        const presentationSeq = confirmed?.[0] ?? seq;
        if (!this.starts.has(presentationSeq))
          this.starts.set(presentationSeq, { at: this.now, id: after.act.id, step: after.act.step ?? 0, counter: !!after.act.counter, completed: false, fired: new Set(), knownShots: new Set(this.authorityShots) });
        after.act.presentationSeq = presentationSeq;
      }
    }
    if (before.act?.presentationSeq !== undefined && !after.act) {
      const row = this.starts.get(before.act.presentationSeq); if (row) row.completed = true;
    }
    return after;
  }
  reconcile(pawn, world) {
    this.authorityShots = new Set(world.projectiles.map(p => p.id));
    for (const [seq, row] of this.starts) {
      if (seq <= pawn.lastInputSeq) {
        row.acknowledged = true;
        if (matches(row, pawn.act)) {
          row.confirmed = true;
          if (Number.isFinite(world.tick) && Number.isFinite(pawn.act.elapsed)) {
            const authorityStart = world.tick - pawn.act.elapsed;
            if (!Number.isFinite(row.authorityStart) || Math.abs(row.authorityStart - authorityStart) <= 4)
              row.authorityStart = authorityStart;
          }
        }
        else row.rejected = true;
      }
      const counterpart = world.projectiles.some(p => p.ownerId === pawn.id && p.abilityId === row.id && !row.knownShots.has(p.id));
      if (counterpart) row.delivered = true;
      if (counterpart || row.rejected) this.shots = this.shots.filter(p => p.seq !== seq);
      // Keep a completed confirmed cast until its authoritative action ends, so an
      // old windup cannot replay after the local animation has already finished.
      if ((row.acknowledged && !matches(row, pawn.act)) || this.now - row.at > 3000 + this.timeout) this.starts.delete(seq);
    }
  }
  bind(act, ack) {
    const entry = [...this.starts].find(([seq,row]) => seq <= ack && row.confirmed && !row.completed && matches(row, act));
    return entry ? { ...act, presentationSeq: entry[0] } : act;
  }
  act(act) {
    if (!act) return null;
    if (act.presentationSeq !== undefined) {
      const row = this.starts.get(act.presentationSeq);
      return row && !row.rejected && !(row.confirmed && row.completed)
        && (row.confirmed || this.now - row.at <= this.timeout) ? act : null;
    }
    if ([...this.starts.values()].some(row => matches(row, act) && row.confirmed && row.completed)) return null;
    return act;
  }
  advance(pawn, dt) {
    this.now += dt;
    this.shots = this.shots.filter(p => {
      p.x += p.vx * dt / 1000; p.y += p.vy * dt / 1000; p.travelled += Math.hypot(p.vx,p.vy) * dt / 1000;
      const row = this.starts.get(p.seq);
      return row && !row.rejected && p.travelled < p.range && (row.confirmed ? this.now - p.born : this.now - row.at) <= this.timeout;
    });
    const act = pawn.act, row = this.starts.get(act?.presentationSeq);
    if (!row || row.rejected || row.delivered || (!row.confirmed && this.now - row.at > this.timeout)
      || act.id === WEAPONS[pawn.weapon]?.basic || act.phase !== 'active' || act.def.delivery !== 'projectile') return;
    const def = act.def, activeTick = act.phaseTicks.active - act.left;
    const count = act.growth?.count ?? def.burst?.count ?? 1;
    const shot = def.burst ? act.growth ? Math.floor(activeTick * count / act.phaseTicks.active) : Math.floor(activeTick / Math.max(1,Math.round(def.burst.intervalMs / TICK_MS))) : 0;
    if (shot >= count || row.fired.has(shot)) return;
    row.fired.add(shot);
    const pr = def.projectile;
    for (let i = 0; i < pr.count; i++) {
      const spread = pr.count > 1 ? (i / (pr.count - 1) - .5) * pr.spreadDeg * Math.PI / 180 : 0;
      const a = act.facing + spread + (def.spin ? Math.PI * 2 * shot / count : 0);
      this.shots.push({ id: this.nextId--, seq: act.presentationSeq, ownerId: pawn.id, abilityId: act.id, ...(act.step ? { step: act.step } : {}),
        x: pawn.x + Math.cos(a) * (pawn.r + 4), y: pawn.y + Math.sin(a) * (pawn.r + 4),
        vx: Math.cos(a) * pr.speed, vy: Math.sin(a) * pr.speed, r: pr.radius, range: act.growth?.range ?? pr.rangePx,
        travelled: 0, born: this.now, presentation: true });
    }
  }
  projectiles() { return this.shots.map(p => { const row = this.starts.get(p.seq); return { ...p, presentationAlpha: .55 * Math.min(1, Math.max(0,(this.timeout - (row.confirmed ? this.now - p.born : this.now - row.at)) / 100)) }; }); }
  clear() { this.starts.clear(); this.shots = []; }
}
