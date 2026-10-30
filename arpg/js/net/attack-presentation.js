// Guest-only display state. No sim world, events, damage or resource authority.
import { WEAPONS } from '../content/combat.js';

const TICK_MS = 1000 / 30;
const PHASES = ['windup', 'lock', 'active', 'recovery'];
const castKey = act => act ? `${act.id}|${act.step ?? 0}|${!!act.counter}` : null;
const windowTicks = act => Math.max(1, (act?.phaseTicks?.windup || 0)
  + (act?.phaseTicks?.lock || 0) + (act?.phaseTicks?.active || 0));
const startTick = (act, tick) => Number.isFinite(tick) && Number.isFinite(act?.elapsed) ? tick - act.elapsed : NaN;
const cloneAct = act => {
  const snapshot = { ...act, phaseTicks: { ...(act.phaseTicks || {}) }, def: act.def,
    ...(act.growth ? { growth: { ...act.growth } } : {}) };
  delete snapshot.presentationSeq;
  delete snapshot.presentationAuthorityStart;
  return snapshot;
};

export class AttackPresentation {
  constructor() {
    this.now = 0;
    this.timeout = 100;
    this.starts = new Map();
    this.shots = [];
    this.nextId = -1;
    this.authorityShots = new Set();
    this.authorityBinds = [];
    this.lastInputSeq = 0;
    this.lastDisplayed = null;
    this.lastDisplayedCosmeticStartTick = -Infinity;
  }
  alive(row) {
    const total = PHASES.reduce((sum, phase) => sum + (row.phaseTicks[phase] || 0), 0);
    return !row.rejected && !row.completedLive && this.elapsedTicks(row) < total;
  }
  elapsedTicks(row) {
    return Math.max(0, Math.floor((this.now - row.startedAt) / TICK_MS));
  }
  durationTicks(row) {
    return PHASES.reduce((sum, phase) => sum + (row.phaseTicks[phase] || 0), 0);
  }
  recent(row) {
    return this.elapsedTicks(row) < this.durationTicks(row) + 12;
  }
  findAlive(key, predictedStart = NaN) {
    return [...this.starts.values()].filter(row => row.key === key && !row.naturalEnded && this.alive(row))
      .sort((a, b) => Number.isFinite(predictedStart)
        ? Math.abs(a.predictedStartTick - predictedStart) - Math.abs(b.predictedStartTick - predictedStart) || a.seq - b.seq
        : a.seq - b.seq)[0];
  }
  complete(act) {
    if (!act) return;
    const row = this.starts.get(act.presentationSeq);
    if (row) {
      row.completedLive = true;
      row.completed = true;
      row.completedAt = this.now;
    }
  }
  endLive(act) {
    if (!act) return;
    const row = this.starts.get(act.presentationSeq);
    if (row) {
      row.naturalEnded = true;
      row.completed = true;
      row.completedAt = this.now;
    }
  }
  track(before, after, seq, tick, { replay = false } = {}) {
    const beforeAct = before.act, afterAct = after.act;
    const restart = !!beforeAct && !!afterAct && (castKey(beforeAct) !== castKey(afterAct)
      || (afterAct.elapsed ?? 0) < (beforeAct.elapsed ?? 0));
    const start = !!afterAct && (!beforeAct || restart);
    if (!replay && beforeAct && (!afterAct || restart)) {
      if (afterAct && restart) this.complete(beforeAct);
      else this.endLive(beforeAct);
    }
    if (!afterAct) return after;

    const predictedStart = startTick(afterAct, tick);
    let row = this.starts.get(afterAct.presentationSeq);
    if (!row || row.key !== castKey(afterAct) || row.rejected || row.completedLive) row = null;

    if (!row && start) {
      row = this.findAlive(castKey(afterAct), predictedStart);
      if (!row && !replay) {
        const snapshot = cloneAct(afterAct);
        row = {
          seq, key: castKey(afterAct), id: afterAct.id, step: afterAct.step ?? 0, counter: !!afterAct.counter,
          at: this.now, startedAt: this.now - Math.max(0, afterAct.elapsed || 0) * TICK_MS,
          phaseTicks: { ...afterAct.phaseTicks }, def: afterAct.def, facing: afterAct.facing,
          act: snapshot, predictedStartTick: predictedStart, windowTicks: windowTicks(afterAct),
          completedLive: false, completed: false, confirmed: false, rejected: false, bound: null,
          naturalEnded: false, shownActive: false, visible: false, fired: new Set(),
          knownShots: new Set(this.authorityShots)
        };
        this.starts.set(seq, row);
      }
    } else if (!row) {
      row = this.findAlive(castKey(afterAct), predictedStart);
    }

    if (row) {
      afterAct.presentationSeq = row.seq;
      if (!replay) {
        row.act = cloneAct(afterAct);
        row.facing = afterAct.facing;
      }
    } else {
      delete afterAct.presentationSeq;
    }
    return after;
  }
  reconcile(pawn, world) {
    this.authorityShots = new Set(world.projectiles.map(projectile => projectile.id));
    this.lastInputSeq = Math.max(this.lastInputSeq, pawn.lastInputSeq || 0);
    const authorityKey = castKey(pawn.act);
    if (pawn.act) this.bind(pawn.act, this.lastInputSeq, world.tick);
    for (const row of this.starts.values()) {
      const counterpart = world.projectiles.some(projectile => projectile.ownerId === pawn.id
        && projectile.abilityId === row.id && !row.knownShots.has(projectile.id));
      if (counterpart) row.delivered = true;
      if (counterpart || row.rejected) this.shots = this.shots.filter(projectile => projectile.seq !== row.seq);
      if (row.bound === null && this.lastInputSeq >= row.seq + 12 + row.windowTicks && authorityKey !== row.key) {
        if (!row.rejected) row.rejectedAt = this.now;
        row.rejected = true;
        this.shots = this.shots.filter(projectile => projectile.seq !== row.seq);
      }
      if (this.now - row.at > 10_000 && (row.bound !== null || row.completedLive || row.naturalEnded || row.rejected)) {
        this.starts.delete(row.seq);
        this.shots = this.shots.filter(projectile => projectile.seq !== row.seq);
      }
    }
    this.authorityBinds = this.authorityBinds.filter(binding => this.starts.has(binding.seq));
  }
  bind(act, ack, tick) {
    if (!act) return act;
    const key = castKey(act), authorityStart = startTick(act, tick);
    if (Number.isFinite(authorityStart)) {
      let binding = this.authorityBinds.find(row => row.key === key && Math.abs(row.start - authorityStart) <= 1);
      if (!binding) {
        let candidate = [...this.starts.values()].filter(row => row.key === key && row.bound === null
          && row.seq <= ack && !row.completed && !row.naturalEnded && this.alive(row))
          .sort((a, b) => a.seq - b.seq)[0];
        if (!candidate) {
          candidate = [...this.starts.values()].filter(row => row.id === act.id && row.step !== (act.step ?? 0)
            && row.bound === null && row.seq <= ack && !row.completed && !row.naturalEnded
            && this.alive(row))
            .sort((a, b) => a.seq - b.seq)[0];
          // During step divergence the bound cosmetic's trail may show the mispredicted step.
          if (candidate) candidate.mispredictedStep = true;
        }
        if (!candidate) {
          candidate = [...this.starts.values()].filter(row => {
            const recentEvent = Math.max(row.rejectedAt ?? -Infinity, row.supersededAt ?? -Infinity);
            return row.id === act.id && row.bound === null && row.seq <= ack
              && !row.completed && !row.naturalEnded
              && (row.rejected || row.superseded) && this.now - recentEvent <= 1000;
          }).sort((a, b) => a.seq - b.seq)[0];
          if (candidate) {
            candidate.rejected = false;
            candidate.lateConfirmed = true;
            candidate.lateConfirmedAt = this.now;
            this.shots = this.shots.filter(projectile => projectile.seq !== candidate.seq);
          }
        }
        if (candidate) {
          candidate.bound = authorityStart;
          candidate.authorityStart = authorityStart;
          candidate.confirmed = true;
          binding = { key, start: authorityStart, seq: candidate.seq };
          this.authorityBinds.push(binding);
        }
      }
      if (!binding) {
        const completed = [...this.starts.values()].filter(row => row.key === key && row.seq <= ack
          && !row.rejected && (row.completedLive || row.naturalEnded || row.completed)
          && Number.isFinite(row.predictedStartTick)
          && Math.abs(row.predictedStartTick - authorityStart) <= row.windowTicks)
          .sort((a, b) => a.seq - b.seq)[0];
        if (completed) {
          completed.confirmed = true;
          completed.authorityStart = authorityStart;
          completed.lateConfirmed = true;
        }
      }
      if (binding) {
        const bound = this.starts.get(binding.seq);
        if (bound) {
          const elapsed = Math.floor((this.now - bound.startedAt) / TICK_MS);
          if (Number.isFinite(act.elapsed) && act.elapsed > elapsed) {
            const firstActive = (bound.phaseTicks.windup || 0) + (bound.phaseTicks.lock || 0);
            const catchup = bound.shownActive ? act.elapsed : Math.min(act.elapsed, firstActive);
            bound.startedAt = this.now - catchup * TICK_MS;
          }
          return { ...act, presentationSeq: binding.seq };
        }
      }
    }
    if (Number.isFinite(authorityStart)) return { ...act, presentationAuthorityStart: authorityStart };
    return act;
  }
  display(row) {
    let elapsed = this.elapsedTicks(row);
    const identity = `seq:${row.seq}`;
    if (this.lastDisplayed?.identity === identity) elapsed = Math.max(elapsed, this.lastDisplayed.elapsed);
    let remaining = elapsed, phase = 'recovery';
    for (const candidate of PHASES) {
      const length = row.phaseTicks[candidate] || 0;
      if (remaining < length) { phase = candidate; break; }
      remaining -= length;
    }
    const total = PHASES.reduce((sum, candidate) => sum + (row.phaseTicks[candidate] || 0), 0);
    if (elapsed >= total) return null;
    if (phase === 'active') row.shownActive = true;
    const snapshot = row.act;
    const act = { ...snapshot, phase, elapsed, left: Math.max(1, (row.phaseTicks[phase] || 1) - remaining),
      phaseTicks: { ...row.phaseTicks }, presentationSeq: row.seq,
      ...(Number.isFinite(row.bound) ? { presentationAuthorityStart: row.bound } : {}) };
    this.lastDisplayed = { identity, startTick: row.predictedStartTick, elapsed };
    this.lastDisplayedCosmeticStartTick = Math.max(this.lastDisplayedCosmeticStartTick,
      row.predictedStartTick);
    return act;
  }
  act(authorityAct, tick) {
    const authorityStart = Number.isFinite(authorityAct?.presentationAuthorityStart)
      ? authorityAct.presentationAuthorityStart : NaN;
    let alive = [...this.starts.values()].filter(candidate => this.alive(candidate));
    if (Number.isFinite(authorityStart)) {
      alive = alive.filter(candidate => {
        if (!candidate.completed && !candidate.naturalEnded) return true;
        const candidateStart = candidate.bound ?? candidate.predictedStartTick;
        return !Number.isFinite(candidateStart) || authorityStart <= candidateStart;
      });
    }
    const cosmetic = alive.filter(candidate => !candidate.superseded
      && candidate.predictedStartTick >= (this.lastDisplayed?.startTick ?? -Infinity))
      .sort((a, b) => b.startedAt - a.startedAt || b.seq - a.seq)[0];
    if (cosmetic) {
      if (!cosmetic.visible) {
        for (const older of this.starts.values()) {
          const precedes = older.startedAt < cosmetic.startedAt
            || (older.startedAt === cosmetic.startedAt && older.seq < cosmetic.seq);
          if (older !== cosmetic && precedes && !older.superseded) {
            older.superseded = true;
            older.supersededAt = this.now;
          }
        }
      }
      cosmetic.visible = true;
      return this.display(cosmetic);
    }
    if (alive.length) return null;

    if (Number.isSafeInteger(authorityAct?.presentationSeq)) return null;
    if (!Number.isFinite(authorityAct?.presentationAuthorityStart)) return null;

    const completedMatch = [...this.starts.values()].some(candidate => {
      if (candidate.key !== castKey(authorityAct)
        || (!candidate.completed && !candidate.naturalEnded
          && !(candidate.lateConfirmed && this.elapsedTicks(candidate) >= this.durationTicks(candidate)))) return false;
      const candidateStart = candidate.bound ?? candidate.predictedStartTick;
      return Number.isFinite(candidateStart)
        && Math.abs(candidateStart - authorityStart) <= candidate.windowTicks;
    });
    if (completedMatch) return null;

    if (authorityStart <= this.lastDisplayedCosmeticStartTick
      || authorityStart < (this.lastDisplayed?.startTick ?? -Infinity)) return null;

    const identity = `auth:${authorityStart}`;
    let elapsed = authorityAct.elapsed;
    if (this.lastDisplayed?.identity === identity) elapsed = Math.max(elapsed, this.lastDisplayed.elapsed);
    let displayed = authorityAct;
    if (elapsed !== authorityAct.elapsed) {
      let remaining = elapsed, phase = 'recovery';
      for (const candidate of PHASES) {
        const length = authorityAct.phaseTicks?.[candidate] || 0;
        if (remaining < length) { phase = candidate; break; }
        remaining -= length;
      }
      displayed = { ...authorityAct, phase, elapsed,
        left: Math.max(1, (authorityAct.phaseTicks?.[phase] || 1) - remaining) };
    }
    this.lastDisplayed = { identity, startTick: authorityStart, elapsed };
    return displayed;
  }
  advance(pawn, dt) {
    this.now += dt;
    this.shots = this.shots.filter(projectile => {
      projectile.x += projectile.vx * dt / 1000;
      projectile.y += projectile.vy * dt / 1000;
      projectile.travelled += Math.hypot(projectile.vx, projectile.vy) * dt / 1000;
      const row = this.starts.get(projectile.seq);
      return row && !row.rejected && !row.delivered && projectile.travelled < projectile.range;
    });
    const act = pawn.act, row = this.starts.get(act?.presentationSeq);
    if (!row || row.rejected || row.delivered || act.id === WEAPONS[pawn.weapon]?.basic
      || act.phase !== 'active' || act.def.delivery !== 'projectile') return;
    const def = act.def, activeTick = act.phaseTicks.active - act.left;
    const count = act.growth?.count ?? def.burst?.count ?? 1;
    const shot = def.burst
      ? act.growth ? Math.floor(activeTick * count / act.phaseTicks.active)
        : Math.floor(activeTick / Math.max(1, Math.round(def.burst.intervalMs / TICK_MS)))
      : 0;
    if (shot >= count || row.fired.has(shot)) return;
    row.fired.add(shot);
    const projectile = def.projectile;
    for (let i = 0; i < projectile.count; i++) {
      const spread = projectile.count > 1 ? (i / (projectile.count - 1) - .5) * projectile.spreadDeg * Math.PI / 180 : 0;
      const angle = act.facing + spread + (def.spin ? Math.PI * 2 * shot / count : 0);
      this.shots.push({ id: this.nextId--, seq: act.presentationSeq, ownerId: pawn.id, abilityId: act.id,
        ...(act.step ? { step: act.step } : {}),
        x: pawn.x + Math.cos(angle) * (pawn.r + 4), y: pawn.y + Math.sin(angle) * (pawn.r + 4),
        vx: Math.cos(angle) * projectile.speed, vy: Math.sin(angle) * projectile.speed, r: projectile.radius,
        range: act.growth?.range ?? projectile.rangePx, travelled: 0, born: this.now, presentation: true });
    }
  }
  projectiles() {
    return this.shots.flatMap(projectile => {
      const row = this.starts.get(projectile.seq);
      return !row || row.rejected || row.delivered ? [] : [{ ...projectile, presentationAlpha: .55 }];
    });
  }
  clear() {
    this.starts.clear();
    this.shots = [];
    this.authorityBinds = [];
    this.lastInputSeq = 0;
    this.lastDisplayed = null;
    this.lastDisplayedCosmeticStartTick = -Infinity;
  }
}
