// Guest-only display state. No sim world, events, damage or resource authority.
import { WEAPONS } from '../content/combat.js';
const TICK_MS = 1000 / 30;
const matches = (row, act) => act && row.id === act.id && row.step === (act.step ?? 0) && row.counter === !!act.counter;
const windowTicks = act => Math.max(1, (act?.phaseTicks?.windup || 0)
  + (act?.phaseTicks?.lock || 0) + (act?.phaseTicks?.active || 0));
const startTick = (act, tick) => Number.isFinite(tick) && Number.isFinite(act?.elapsed) ? tick - act.elapsed : NaN;
export class AttackPresentation {
  constructor() { this.now = 0; this.timeout = 100; this.starts = new Map(); this.shots = []; this.nextId = -1; this.authorityShots = new Set(); }
  track(before, after, seq, tick, { replay = false } = {}) {
    const beforeAct = before.act, afterAct = after.act;
    const restart = !!beforeAct && !!afterAct && (beforeAct.id !== afterAct.id
      || (afterAct.elapsed ?? 0) < (beforeAct.elapsed ?? 0)
      || (beforeAct.step ?? 0) !== (afterAct.step ?? 0)
      || !!beforeAct.counter !== !!afterAct.counter);
    const start = !!afterAct && (!beforeAct || restart);
    if (!replay && beforeAct?.presentationSeq !== undefined && (!afterAct || restart)) {
      const previous = this.starts.get(beforeAct.presentationSeq);
      if (previous) previous.completed = true;
    }
    if (afterAct) {
      const row = this.starts.get(seq);
      if (row && !row.completed && matches(row, afterAct)) afterAct.presentationSeq = seq;
      else if (start) {
        const predictedStart = startTick(afterAct, tick), window = windowTicks(afterAct);
        if (replay) {
          const candidates = [...this.starts].filter(([, candidate]) => !candidate.completed
            && matches(candidate, afterAct) && Number.isFinite(candidate.predictedStartTick)
            && Number.isFinite(predictedStart)
            && Math.abs(candidate.predictedStartTick - predictedStart) <= candidate.windowTicks)
            .map(([candidateSeq, candidate]) => ({ candidateSeq, candidate,
              distance: Math.abs(candidate.predictedStartTick - predictedStart) }))
            .sort((a, b) => a.distance - b.distance || a.candidateSeq - b.candidateSeq);
          const candidate = candidates[0];
          if (candidate) {
            afterAct.presentationSeq = candidate.candidateSeq;
          } else delete afterAct.presentationSeq;
        } else if (!row) {
          this.starts.set(seq, { at: this.now, id: afterAct.id, step: afterAct.step ?? 0,
            counter: !!afterAct.counter, completed: false, visible: false, predictedStartTick: predictedStart,
            windowTicks: window, fired: new Set(), knownShots: new Set(this.authorityShots) });
          afterAct.presentationSeq = seq;
        }
      } else if (!replay && beforeAct?.presentationSeq !== undefined
        && matches(this.starts.get(beforeAct.presentationSeq) || {}, afterAct)) {
        afterAct.presentationSeq = beforeAct.presentationSeq;
      } else if (replay && afterAct.presentationSeq !== undefined) {
        const carried = this.starts.get(afterAct.presentationSeq);
        if (!carried || carried.completed || !matches(carried, afterAct)) delete afterAct.presentationSeq;
      }
    }
    return after;
  }
  reconcile(pawn, world) {
    this.authorityShots = new Set(world.projectiles.map(p => p.id));
    const authorityStart = startTick(pawn.act, world.tick);
    const authorityRow = pawn.act && Number.isFinite(authorityStart)
      ? [...this.starts].filter(([seq, row]) => seq <= pawn.lastInputSeq
        && matches(row, pawn.act) && Number.isFinite(row.predictedStartTick)
        && Math.abs(row.predictedStartTick - authorityStart) <= row.windowTicks)
        .map(([seq, row]) => ({ seq, row, distance: Math.abs(row.predictedStartTick - authorityStart) }))
        .sort((a, b) => a.distance - b.distance || a.seq - b.seq)[0]
      : null;
    for (const [seq, row] of this.starts) {
      if (seq <= pawn.lastInputSeq) {
        row.acknowledged = true;
        if (authorityRow?.seq === seq) {
          row.confirmed = true;
          row.rejected = false;
          row.authorityStart = authorityStart;
        }
        else if (!row.completed) row.rejected = true;
      }
      const counterpart = world.projectiles.some(p => p.ownerId === pawn.id && p.abilityId === row.id && !row.knownShots.has(p.id));
      if (counterpart) row.delivered = true;
      if (counterpart || row.rejected) this.shots = this.shots.filter(p => p.seq !== seq);
      const rejectedExpired = row.rejected && row.acknowledged && Number.isFinite(world.tick)
        && Number.isFinite(row.predictedStartTick) && world.tick - row.predictedStartTick > row.windowTicks;
      if (rejectedExpired || (row.acknowledged && row.completed && !matches(row, pawn.act))
        || this.now - row.at > 3000 + this.timeout) {
        this.starts.delete(seq);
        this.shots = this.shots.filter(p => p.seq !== seq);
      }
    }
  }
  bind(act, ack, tick) {
    const authorityStart = startTick(act, tick);
    let candidates = [...this.starts].filter(([seq, row]) => seq <= ack && row.confirmed
      && !row.completed && matches(row, act));
    if (Number.isFinite(authorityStart)) candidates = candidates.filter(([, row]) => Number.isFinite(row.authorityStart)
      && Math.abs(row.authorityStart - authorityStart) <= row.windowTicks);
    candidates.sort((a, b) => Number.isFinite(authorityStart)
      ? Math.abs(a[1].authorityStart - authorityStart) - Math.abs(b[1].authorityStart - authorityStart)
      : a[0] - b[0]);
    const entry = candidates[0];
    return entry ? { ...act, presentationSeq: entry[0] } : act;
  }
  act(act, tick) {
    if (!act) return null;
    if (act.presentationSeq !== undefined) {
      const row = this.starts.get(act.presentationSeq);
      const age = row ? this.now - row.at : Infinity;
      if (!row || row.rejected || row.completed || age > this.timeout * (row.visible ? 2 : 1)) return null;
      row.visible = true;
      return act;
    }
    const authorityStart = startTick(act, tick);
    if ([...this.starts.values()].some(row => matches(row, act) && row.confirmed && row.completed
      && Number.isFinite(authorityStart) && Number.isFinite(row.authorityStart)
      && Math.abs(authorityStart - row.authorityStart) <= row.windowTicks)) return null;
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
  projectiles() { return this.shots.flatMap(p => {
    const row = this.starts.get(p.seq);
    return !row || row.rejected ? [] : [{ ...p,
      presentationAlpha: .55 * Math.min(1, Math.max(0, (this.timeout
        - (row.confirmed ? this.now - p.born : this.now - row.at)) / 100)) }];
  }); }
  clear() { this.starts.clear(); this.shots = []; }
}
