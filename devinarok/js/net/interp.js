const DEFAULT_TICK_RATE = 30;
const MIN_DELAY_MS = 100;
const MAX_DELAY_MS = 250;
const MAX_EXTRAPOLATION_MS = 100;
const INTERPOLATED_FIELDS = ['x', 'z', 'hp'];

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
    this.sampleOutput = { renderTick: 0, delayMs: this.delayMs, entities: [], activeEnemyIds: null };
    this.sampleEntityPool = new Map();
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
      roomIndex: value.roomIndex,
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

  getRenderTick(estimatedServerTick) {
    return estimatedServerTick - this.delayMs * this.tickRate / 1000;
  }

  sample(estimatedServerTick) {
    return this.sampleAtRenderTick(this.getRenderTick(estimatedServerTick));
  }

  sampleIntoEstimate(estimatedServerTick) {
    return this.sampleInto(this.getRenderTick(estimatedServerTick));
  }

  writeSampleEntity(output, source, left = null, amount = 1, teleported = false) {
    let target = this.sampleEntityPool.get(source.id);
    if (!target) {
      target = {};
      this.sampleEntityPool.set(source.id, target);
    }
    const base = teleported || !left ? source : left;
    for (const key in target) if (!Object.hasOwn(source, key) && !Object.hasOwn(base, key)) delete target[key];
    Object.assign(target, base);
    if (left && !teleported) {
      Object.assign(target, source);
      for (const key of INTERPOLATED_FIELDS) {
        if (Number.isFinite(left[key]) && Number.isFinite(source[key])) {
          target[key] = left[key] + (source[key] - left[key]) * amount;
        }
      }
      if (Number.isFinite(left.facing) && Number.isFinite(source.facing)) {
        target.facing = interpolateAngle(left.facing, source.facing, amount);
      }
    }
    output.entities.push(target);
    return target;
  }

  sampleInto(renderTick) {
    const output = this.sampleOutput;
    const entities = output.entities;
    entities.length = 0;
    output.renderTick = renderTick;
    output.delayMs = this.delayMs;
    const snapshots = this.snapshots;
    if (!snapshots.length) {
      output.activeEnemyIds = null;
      return output;
    }
    if (snapshots.length === 1 || renderTick <= snapshots[0].tick) {
      for (const entity of snapshots[0].entities) this.writeSampleEntity(output, entity);
      output.activeEnemyIds = snapshots[0].activeEnemyIds;
      return output;
    }
    let rightIndex = 0;
    while (rightIndex < snapshots.length && snapshots[rightIndex].tick < renderTick) rightIndex += 1;
    if (rightIndex === snapshots.length) {
      const latest = snapshots[rightIndex - 1];
      const previous = snapshots[rightIndex - 2];
      const elapsedTicks = Math.min(
        Math.max(0, renderTick - latest.tick),
        this.maxExtrapolationMs * this.tickRate / 1000,
      );
      const amount = elapsedTicks / Math.max(1e-9, latest.tick - previous.tick);
      for (const entity of latest.entities) {
        let before = null;
        for (const candidate of previous.entities) {
          if (candidate.id === entity.id) {
            before = candidate;
            break;
          }
        }
        const target = this.writeSampleEntity(output, entity);
        if (!before || entity.teleport || entity.roomChanged || latest.teleport) continue;
        if (Number.isFinite(before.x) && Number.isFinite(entity.x)) target.x += (entity.x - before.x) * amount;
        if (Number.isFinite(before.z) && Number.isFinite(entity.z)) target.z += (entity.z - before.z) * amount;
        if (Number.isFinite(before.facing) && Number.isFinite(entity.facing)) {
          target.facing = interpolateAngle(before.facing, entity.facing, 1 + amount);
        }
      }
      output.activeEnemyIds = latest.activeEnemyIds;
      return output;
    }
    const left = snapshots[rightIndex - 1];
    const right = snapshots[rightIndex];
    const teleportAtRight = right.teleport ||
      (left.roomIndex !== undefined && right.roomIndex !== undefined && left.roomIndex !== right.roomIndex);
    if (teleportAtRight) {
      for (const entity of right.entities) this.writeSampleEntity(output, entity);
      output.activeEnemyIds = right.activeEnemyIds;
      return output;
    }
    const amount = clamp((renderTick - left.tick) / Math.max(1e-9, right.tick - left.tick), 0, 1);
    for (const before of left.entities) {
      let after = null;
      for (const entity of right.entities) {
        if (entity.id === before.id) {
          after = entity;
          break;
        }
      }
      if (!after) {
        this.writeSampleEntity(output, before);
        continue;
      }
      const roomChanged = (before.room !== undefined && after.room !== undefined && before.room !== after.room)
        || (before.roomId !== undefined && after.roomId !== undefined && before.roomId !== after.roomId)
        || (before.roomIndex !== undefined && after.roomIndex !== undefined && before.roomIndex !== after.roomIndex);
      const jumped = Number.isFinite(before.x) && Number.isFinite(before.z) &&
        Number.isFinite(after.x) && Number.isFinite(after.z) &&
        Math.hypot(after.x - before.x, after.z - before.z) > 3;
      const entityTeleported = Boolean(after.teleport || after.roomChanged || roomChanged || jumped);
      this.writeSampleEntity(output, after, before, amount, entityTeleported);
    }
    if (amount >= 1) {
      for (const after of right.entities) {
        let found = false;
        for (const before of left.entities) {
          if (before.id === after.id) {
            found = true;
            break;
          }
        }
        if (!found) this.writeSampleEntity(output, after);
      }
    }
    output.activeEnemyIds = amount >= 1 ? right.activeEnemyIds : left.activeEnemyIds;
    return output;
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
    const teleportAtRight = right.teleport ||
      (left.roomIndex !== undefined && right.roomIndex !== undefined && left.roomIndex !== right.roomIndex);
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
      const roomChanged = before && after && ['room', 'roomId', 'roomIndex'].some((key) => (
        before[key] !== undefined && after[key] !== undefined && before[key] !== after[key]
      ));
      const jumped = before && after && Number.isFinite(before.x) && Number.isFinite(before.z) &&
        Number.isFinite(after.x) && Number.isFinite(after.z) &&
        Math.hypot(after.x - before.x, after.z - before.z) > 3;
      const entityTeleported = Boolean(after?.teleport || after?.roomChanged || roomChanged || jumped);
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
