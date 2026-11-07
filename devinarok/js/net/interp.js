const DEFAULT_TICK_RATE = 30;
const MIN_DELAY_MS = 100;
const MAX_DELAY_MS = 250;
const MAX_EXTRAPOLATION_MS = 100;

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function cloneEntity(entity) {
  return { ...entity };
}

function entityMap(entities) {
  return new Map(entities.map((entity) => [entity.id, entity]));
}

function percentile95(values) {
  if (!values.length) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * 0.95) - 1)];
}

function interpolateAngle(from, to, amount) {
  let difference = (to - from) % (Math.PI * 2);
  if (difference > Math.PI) difference -= Math.PI * 2;
  if (difference < -Math.PI) difference += Math.PI * 2;
  return from + difference * amount;
}

function interpolateEntity(left, right, amount, teleported) {
  if (teleported) return cloneEntity(right);
  const result = { ...left, ...right };
  for (const key of ['x', 'z', 'hp']) {
    if (Number.isFinite(left[key]) && Number.isFinite(right[key])) {
      result[key] = left[key] + (right[key] - left[key]) * amount;
    }
  }
  if (Number.isFinite(left.facing) && Number.isFinite(right.facing)) {
    result.facing = interpolateAngle(left.facing, right.facing, amount);
  }
  return result;
}

export class InterpolationBuffer {
  constructor({
    tickRate = DEFAULT_TICK_RATE,
    maxSnapshots = 32,
    maxExtrapolationMs = MAX_EXTRAPOLATION_MS,
    delayAdaptation = 0.1,
  } = {}) {
    this.tickRate = tickRate;
    this.baseDelayMs = 4 * 1000 / tickRate;
    this.maxSnapshots = Math.max(2, Math.trunc(maxSnapshots));
    this.maxExtrapolationMs = Math.max(0, maxExtrapolationMs);
    this.delayAdaptation = clamp(delayAdaptation, 0, 1);
    this.snapshots = [];
    this.jitterSamples = [];
    this.delayMs = clamp(this.baseDelayMs, MIN_DELAY_MS, MAX_DELAY_MS);
    this.lastArrivalAt = null;
    this.lastArrivalTick = null;
  }

  addSnapshot(snapshot, entities, receivedAtMs) {
    const value = typeof snapshot === 'number'
      ? { tick: snapshot, entities, receivedAt: receivedAtMs }
      : snapshot;
    const tick = value.tick ?? value.t;
    const list = value.entities ?? value.ents ?? [];
    const receivedAt = value.receivedAt ?? value.receivedAtMs ?? tick * 1000 / this.tickRate;
    if (!Number.isFinite(tick) || !Array.isArray(list)) throw new TypeError('Invalid interpolation snapshot');

    if (this.lastArrivalAt !== null && tick > this.lastArrivalTick) {
      const expected = (tick - this.lastArrivalTick) * 1000 / this.tickRate;
      const actual = receivedAt - this.lastArrivalAt;
      this.jitterSamples.push(Math.abs(actual - expected));
      if (this.jitterSamples.length > 60) this.jitterSamples.shift();
      const jitterP95 = percentile95(this.jitterSamples);
      const targetDelay = clamp(this.baseDelayMs + jitterP95, MIN_DELAY_MS, MAX_DELAY_MS);
      this.delayMs += (targetDelay - this.delayMs) * this.delayAdaptation;
    }
    if (this.lastArrivalAt === null || receivedAt >= this.lastArrivalAt) {
      this.lastArrivalAt = receivedAt;
      this.lastArrivalTick = tick;
    }

    const entry = {
      tick,
      entities: list.map(cloneEntity),
      activeEnemyIds: Array.isArray(value.activeEnemyIds) ? [...value.activeEnemyIds] : null,
      teleport: Boolean(value.teleport || value.roomChanged),
      receivedAt,
    };
    const existing = this.snapshots.findIndex((item) => item.tick === tick);
    if (existing >= 0) this.snapshots[existing] = entry;
    else this.snapshots.push(entry);
    this.snapshots.sort((a, b) => a.tick - b.tick);
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.splice(0, this.snapshots.length - this.maxSnapshots);
    }
    return this.delayMs;
  }

  getDelayMs() {
    return this.delayMs;
  }

  sample(estimatedServerTick) {
    const delayTicks = this.delayMs * this.tickRate / 1000;
    return this.sampleAtRenderTick(estimatedServerTick - delayTicks);
  }

  sampleAtRenderTick(renderTick) {
    if (!this.snapshots.length) {
      return {
        renderTick,
        delayMs: this.delayMs,
        entities: [],
        activeEnemyIds: null,
      };
    }
    if (this.snapshots.length === 1 || renderTick <= this.snapshots[0].tick) {
      return {
        renderTick,
        delayMs: this.delayMs,
        entities: this.snapshots[0].entities.map(cloneEntity),
        activeEnemyIds: this.snapshots[0].activeEnemyIds,
      };
    }

    let rightIndex = this.snapshots.findIndex((snapshot) => snapshot.tick >= renderTick);
    if (rightIndex < 0) {
      const latest = this.snapshots.at(-1);
      const previous = this.snapshots.at(-2);
      return {
        renderTick,
        delayMs: this.delayMs,
        entities: this.extrapolate(previous, latest, renderTick),
        activeEnemyIds: latest.activeEnemyIds,
      };
    }

    const left = this.snapshots[rightIndex - 1];
    const right = this.snapshots[rightIndex];
    const teleportAtRight = renderTick >= right.tick && right.teleport;
    if (teleportAtRight) {
      return {
        renderTick,
        delayMs: this.delayMs,
        entities: right.entities.map(cloneEntity),
        activeEnemyIds: right.activeEnemyIds,
      };
    }
    const amount = clamp((renderTick - left.tick) / Math.max(1e-9, right.tick - left.tick), 0, 1);
    const leftEntities = entityMap(left.entities);
    const rightEntities = entityMap(right.entities);
    const ids = new Set([...leftEntities.keys(), ...rightEntities.keys()]);
    const entities = [];
    for (const id of ids) {
      const before = leftEntities.get(id);
      const after = rightEntities.get(id);
      const entityTeleported = renderTick >= right.tick && Boolean(after?.teleport || after?.roomChanged);
      if (before && after) entities.push(interpolateEntity(before, after, amount, entityTeleported));
      else if (before) entities.push(cloneEntity(before));
      else if (amount >= 1) entities.push(cloneEntity(after));
    }
    return {
      renderTick,
      delayMs: this.delayMs,
      entities,
      activeEnemyIds: amount >= 1 ? right.activeEnemyIds : left.activeEnemyIds,
    };
  }

  extrapolate(previous, latest, renderTick) {
    const elapsedTicks = Math.min(
      Math.max(0, renderTick - latest.tick),
      this.maxExtrapolationMs * this.tickRate / 1000,
    );
    const interval = Math.max(1e-9, latest.tick - previous.tick);
    const amount = elapsedTicks / interval;
    const previousEntities = entityMap(previous.entities);
    return latest.entities.map((entity) => {
      const result = cloneEntity(entity);
      const before = previousEntities.get(entity.id);
      if (!before || entity.teleport || entity.roomChanged || latest.teleport) return result;
      if (Number.isFinite(before.x) && Number.isFinite(entity.x)) {
        result.x += (entity.x - before.x) * amount;
      }
      if (Number.isFinite(before.z) && Number.isFinite(entity.z)) {
        result.z += (entity.z - before.z) * amount;
      }
      if (Number.isFinite(before.facing) && Number.isFinite(entity.facing)) {
        result.facing = interpolateAngle(before.facing, entity.facing, 1 + amount);
      }
      return result;
    });
  }
}

export function createInterpolationBuffer(options) {
  return new InterpolationBuffer(options);
}
