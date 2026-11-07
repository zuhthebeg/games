import { stepPlayerMotion } from '../sim/world.js';

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, clone(child)]));
}

function normalizeInput(input) {
  const normalized = {
    seq: Number(input.seq ?? 0),
    moveX: Number(input.moveX ?? input.mx ?? 0),
    moveZ: Number(input.moveZ ?? input.mz ?? 0),
    aim: Number(input.aim ?? 0),
    buttons: Number(input.buttons ?? input.b ?? 0),
  };
  const viewTick = input.viewTick ?? input.vt;
  if (Number.isSafeInteger(viewTick)) normalized.viewTick = viewTick;
  return normalized;
}

function ownPlayerFromSnapshot(snapshot, playerId) {
  if (snapshot.player) return snapshot.player;
  if (snapshot.ownPlayer) return snapshot.ownPlayer;
  const entity = snapshot.ents?.find((entry) => entry.playerId === playerId || entry.id === snapshot.playerEntityId);
  return entity?.motion ? { ...entity, ...entity.motion } : entity;
}

function needsForcedSnap(snapshot, previousPlayer, authoritative) {
  if (
    snapshot.knockback ||
    snapshot.downed ||
    snapshot.revived ||
    snapshot.roomChanged ||
    snapshot.teleport
  ) return true;
  if ((snapshot.events ?? snapshot.ev)?.some((event) => ['knockback', 'downed', 'revived', 'roomEnter'].includes(event.type))) return true;
  if (!previousPlayer) return true;
  return Boolean(previousPlayer.downed) !== Boolean(authoritative.downed);
}

export class Predictor {
  constructor({ player, ctx, playerId = player?.playerId } = {}) {
    if (!player || !ctx?.arena) throw new TypeError('Predictor requires a player and arena context');
    this.playerId = playerId;
    this.ctx = {
      arena: ctx.arena,
      openDoors: clone(ctx.openDoors ?? {}),
      tick: Number.isSafeInteger(ctx.tick) ? ctx.tick : 0,
    };
    this.player = clone(player);
    this.pendingInputs = [];
    this.seenSeqs = new Set();
    this.lastAck = -1;
    this.awaitingFullReset = false;
    this.visualOffset = { x: 0, z: 0 };
    this.visualOffsetStartedAt = null;
    this.metrics = { snaps: 0, correctionsOver03m: 0 };
  }

  simulate(input) {
    this.ctx.tick += 1;
    if (this.player.downed) {
      this.player.previousButtons = 0;
      return null;
    }
    return stepPlayerMotion(this.ctx, this.player, normalizeInput(input));
  }

  applyLocalInput(input) {
    const normalized = normalizeInput(input);
    if (this.player.downed) {
      normalized.moveX = 0;
      normalized.moveZ = 0;
      normalized.buttons = 0;
    }
    if (
      !Number.isSafeInteger(normalized.seq) ||
      normalized.seq <= this.lastAck ||
      this.seenSeqs.has(normalized.seq)
    ) {
      return { motion: null, player: this.getPlayer() };
    }
    this.seenSeqs.add(normalized.seq);
    this.pendingInputs.push(normalized);
    const motion = this.simulate(normalized);
    return { motion, player: this.getPlayer() };
  }

  reconcile(snapshot, nowMs = 0) {
    const authoritative = ownPlayerFromSnapshot(snapshot, this.playerId);
    if (!authoritative) return false;
    const previous = this.player;
    const previousPosition = { x: previous.x, z: previous.z };
    const ack = Number.isSafeInteger(snapshot.ack) ? snapshot.ack : -1;
    this.lastAck = Math.max(this.lastAck, ack);
    const pending = this.pendingInputs.filter((input) => input.seq > ack).sort((a, b) => a.seq - b.seq);
    this.pendingInputs = pending;
    this.seenSeqs = new Set(pending.map((input) => input.seq));
    this.player = clone(authoritative);
    const snapshotTick = snapshot.tick ?? snapshot.serverTick ?? snapshot.t;
    if (Number.isSafeInteger(snapshotTick)) this.ctx.tick = snapshotTick;
    if (snapshot.openDoors) this.ctx.openDoors = clone(snapshot.openDoors);
    for (const input of pending) this.simulate(input);

    const correctionX = previousPosition.x - this.player.x;
    const correctionZ = previousPosition.z - this.player.z;
    const error = Math.hypot(correctionX, correctionZ);
    const forcedSnap = needsForcedSnap(snapshot, previous, authoritative) ||
      (this.awaitingFullReset && Boolean(snapshot.full));
    if (snapshot.full) this.awaitingFullReset = false;
    if (!forcedSnap && error > 0.3 && error <= 2) this.metrics.correctionsOver03m += 1;
    if (forcedSnap || error > 2) {
      this.metrics.snaps += 1;
      this.visualOffset = { x: 0, z: 0 };
      this.visualOffsetStartedAt = null;
    } else if (error > 0) {
      this.visualOffset = { x: correctionX, z: correctionZ };
      this.visualOffsetStartedAt = nowMs;
    }
    return { error, snapped: forcedSnap || error > 2, pending: pending.length };
  }

  setContext({ arena = this.ctx.arena, openDoors = this.ctx.openDoors, tick = this.ctx.tick } = {}) {
    this.ctx = { arena, openDoors: clone(openDoors), tick };
  }

  onVisibilityResume() {
    this.awaitingFullReset = true;
  }

  getVisualPosition(nowMs = 0) {
    const elapsed = this.visualOffsetStartedAt === null ? 120 : Math.max(0, nowMs - this.visualOffsetStartedAt);
    const amount = Math.max(0, 1 - elapsed / 120);
    if (amount === 0) {
      this.visualOffset = { x: 0, z: 0 };
      this.visualOffsetStartedAt = null;
    }
    return {
      x: this.player.x + this.visualOffset.x * amount,
      z: this.player.z + this.visualOffset.z * amount,
    };
  }

  getPlayer() {
    return clone(this.player);
  }
}

export function createPredictor(options) {
  return new Predictor(options);
}
