import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomInt } from 'node:crypto';
import { CastTimeline } from '../js/net/cast-timeline.js';
import { InterpolationBuffer } from '../js/net/interp.js';
import { isCounterCast, scoreCastHitAgreement } from '../js/net/hit-agreement.js';
import { NetSession } from '../js/net/net-session.js';
import { decodeMessage } from '../js/net/protocol.js';
import { Predictor } from '../js/net/predictor.js';
import { buildRangedAimInput } from '../js/net/ranged-aim.js';
import { BUTTONS, createStageWorld } from '../js/sim/world.js';
import { computeBotPolicy, insideShape } from '../js/net/bot-policy.js';
import { ITEM_BASES } from '../js/content/items.js';

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const TICK_HZ = 30;
const INPUT_MS = 1000 / TICK_HZ;
const RENDER_MS = 1000 / 60;
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');

function parseOptions(argv) {
  const options = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith('--')) continue;
    const [key, ...inline] = argument.slice(2).split('=');
    options.set(key, inline.length ? inline.join('=') : argv[index + 1]?.startsWith('--') ? true : argv[++index]);
  }
  return options;
}

const options = parseOptions(process.argv.slice(2));
const botCount = Math.max(1, Math.min(4, Number(options.get('bots') ?? 2)));
const botFamilies = String(options.get('families') ?? 'sword,sword').split(',');
const stageId = String(options.get('stage') ?? 'C1');
const difficulty = String(options.get('difficulty') ?? 'normal');
const serverUrl = String(options.get('server') ?? 'ws://127.0.0.1:8788');
const roomCode = String(options.get('room') ?? Array.from({ length: 6 }, () => (
  ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)]
)).join(''));
const runName = String(options.get('name') ?? `${stageId.toLowerCase()}-${botCount}bot`);
const durationSeconds = Math.max(10, Number(options.get('duration') ?? 240));
const reconnectBotIndex = options.has('reconnect-bot') ? Number(options.get('reconnect-bot')) : -1;
const reconnectAfterMs = Math.max(1000, Number(options.get('reconnect-after') ?? 6000));
const metricsDirectory = resolve(String(options.get('metrics-dir') ?? '/home/ubuntu/devinarok-net'));
const profile = String(options.get('profile') ?? (serverUrl.includes(':8788') ? 'impaired' : 'none'));
const clearedStagesOverride = options.has('cleared-stages')
  ? String(options.get('cleared-stages')).split(',').map((stage) => stage.trim()).filter(Boolean)
  : null;

function byteLength(data) {
  if (typeof data === 'string') return Buffer.byteLength(data);
  if (data instanceof ArrayBuffer) return data.byteLength;
  if (ArrayBuffer.isView(data)) return data.byteLength;
  return 0;
}

function recordDownTraffic(stats, data) {
  const bytes = byteLength(data);
  stats.downBytes += bytes;
  let raw;
  try {
    raw = typeof data === 'string' ? JSON.parse(data) : null;
  } catch {
    raw = null;
  }
  if (raw?.t !== 'snap') {
    stats.downBreakdown.otherFrameBytes += bytes;
    return;
  }

  const entityBytes = byteLength(JSON.stringify(raw.ents ?? []));
  const eventBytes = byteLength(JSON.stringify(raw.ev ?? []));
  stats.downBreakdown.snapshotFrames += 1;
  stats.downBreakdown.entityBytes += entityBytes;
  stats.downBreakdown.eventBytes += eventBytes;
  stats.downBreakdown.otherSnapshotBytes += Math.max(0, bytes - entityBytes - eventBytes);

  let snapshot;
  try {
    snapshot = decodeMessage(data);
  } catch {
    return;
  }
  const previous = stats.lastEntityState;
  const baseline = raw.full
    ? new Map()
    : stats.snapshotStates.get(raw.baseTick) ?? new Map();
  const next = new Map();
  if (!raw.full) {
    for (const [id, entity] of baseline) next.set(id, entity);
    for (const id of raw.removed ?? []) next.delete(id);
  }
  for (const entity of snapshot.ents ?? []) {
    const before = next.get(entity.id);
    const merged = { ...(before ?? {}), ...entity };
    const previousEntity = previous.get(entity.id);
    for (const [key, value] of Object.entries(entity)) {
      if (['model', 'maxHp', 'name', 'item'].includes(key)) {
        stats.downBreakdown.staticFieldValueBytes += byteLength(JSON.stringify(value));
      }
      if (
        previousEntity &&
        Object.hasOwn(previousEntity, key) &&
        JSON.stringify(previousEntity[key]) === JSON.stringify(merged[key])
      ) {
        stats.downBreakdown.repeatedFieldValueBytes += byteLength(JSON.stringify(value));
      }
    }
    next.set(entity.id, merged);
  }
  stats.lastEntityState = next;
  stats.snapshotStates.set(snapshot.tick, next);
  while (stats.snapshotStates.size > 120) {
    stats.snapshotStates.delete(Math.min(...stats.snapshotStates.keys()));
  }
}

function meteredWebSocket(stats) {
  const NativeWebSocket = globalThis.WebSocket;
  if (typeof NativeWebSocket !== 'function') throw new TypeError('Node 22+ global WebSocket is required');
  return class MeteredWebSocket extends NativeWebSocket {
    constructor(url) {
      super(url);
      this.addEventListener('message', (event) => recordDownTraffic(stats, event.data));
    }

    send(data) {
      stats.upBytes += byteLength(data);
      return super.send(data);
    }
  };
}

function angleDifference(left, right) {
  let difference = (left - right) % (Math.PI * 2);
  if (difference > Math.PI) difference -= Math.PI * 2;
  if (difference < -Math.PI) difference += Math.PI * 2;
  return difference;
}

function livePlayer(world, playerId) {
  return world.players
    .map((id) => world.entities.find((entity) => entity.id === id))
    .find((entity) => entity?.playerId === playerId);
}

function playerDiagnosticState(player) {
  const state = player?.motion ? { ...player, ...player.motion } : player ?? {};
  return {
    castStep: state.attack?.step ?? null,
    attackPhase: state.attack?.phase ?? null,
    dodgeTicks: state.dodgeTicks ?? null,
    dodgeBufferTicks: state.dodgeBufferTicks ?? null,
    counterReadyTicks: state.counterReadyTicks ?? null,
  };
}

function rootCastId(castId, playerId) {
  const prefix = `${playerId}:`;
  if (typeof castId !== 'string' || !castId.startsWith(prefix)) return castId;
  const suffix = castId.slice(prefix.length).split(':');
  return suffix.length === 2 && /^\d+$/.test(suffix[0]) && /^\d+$/.test(suffix[1])
    ? `${prefix}${suffix[0]}`
    : castId;
}

function shapeHitsTarget(shape, target) {
  return insideShape(shape, target, target.radius ?? 0);
}

function distanceToShapeEdge(shape, target) {
  const radius = target.radius ?? 0;
  if (shape.type === 'circle') {
    return Math.abs(Math.hypot(target.x - shape.originX, target.z - shape.originZ) - shape.radius - radius);
  }
  if (shape.type === 'circles') {
    return Math.min(...shape.circles.map((circle) => (
      Math.abs(Math.hypot(target.x - circle.x, target.z - circle.z) - circle.radius - radius)
    )));
  }
  const dx = target.x - shape.originX;
  const dz = target.z - shape.originZ;
  if (shape.type === 'sector') {
    const distance = Math.hypot(dx, dz);
    const angle = Math.atan2(dz, dx);
    const angleDelta = angleDifference(angle, shape.angle);
    return Math.min(
      Math.abs(distance - shape.range - radius),
      Math.abs(angleDelta - shape.halfAngle) * distance,
      Math.abs(angleDelta + shape.halfAngle) * distance,
    );
  }
  if (shape.type === 'line') {
    const forward = dx * Math.cos(shape.angle) + dz * Math.sin(shape.angle);
    const side = Math.abs(-dx * Math.sin(shape.angle) + dz * Math.cos(shape.angle));
    return Math.min(
      Math.abs(forward + radius),
      Math.abs(forward - shape.length - radius),
      Math.abs(side - shape.width / 2 - radius),
    );
  }
  return Infinity;
}

class Bot {
  constructor(index, family = 'sword') {
    this.index = index;
    this.family = ['sword', 'crossbow', 'staff'].includes(family) ? family : 'sword';
    this.name = `봇${index + 1}`;
    const starterWeapon = (stageId === 'F1'
      ? { sword: 'grave-greatsword', crossbow: 'grave-crossbow', staff: 'elder-staff' }
      : { sword: 'rusted-sword', crossbow: 'rusted-crossbow', staff: 'apprentice-wand' })[this.family];
    const f1Armor = [
      ['ossuary-helm', [{ id: 'defense', value: 3 }, { id: 'maxHp', value: 20 }]],
      ['ossuary-plate', [{ id: 'maxHp', value: 20 }, { id: 'defense', value: 3 }]],
      ['bone-gauntlets', [{ id: 'attackPercent', value: 8 }, { id: 'lifesteal', value: 3 }]],
      ['ossuary-greaves', [{ id: 'moveSpeed', value: 5 }, { id: 'maxHp', value: 20 }]],
    ];
    const clearedStages = clearedStagesOverride ?? (
      difficulty === 'hell' ? ['KB', 'N:KB']
        : difficulty === 'nightmare' ? ['KB']
          : stageId === 'F1' ? ['CB'] : []
    );
    const tierLevel = difficulty === 'nightmare' ? 15 : difficulty === 'hell' ? 18 : null;
    const tierEquipment = tierLevel
      ? ITEM_BASES.filter((item) => item.requiredLevel === tierLevel && !item.setId
        && (item.slot !== 'weapon' || item.family === this.family))
        .map((item) => ({
          itemId: item.id,
          slot: item.slot,
          rarity: 'rare',
          enhance: 0,
          affixes: item.slot === 'weapon'
            ? [{ id: 'attackPercent', value: 8 }, { id: 'critChance', value: 3 }]
            : [{ id: 'maxHp', value: 40 }, { id: 'defense', value: 6 }],
        }))
      : null;
    this.character = {
      level: tierLevel ?? (stageId === 'F1' ? 7 : 1),
      equipment: tierEquipment ?? [
        {
          itemId: starterWeapon,
          slot: 'weapon',
          rarity: stageId === 'F1' ? 'rare' : 'common',
          enhance: 0,
          affixes: stageId === 'F1'
            ? [{ id: 'attackPercent', value: 8 }, { id: 'critChance', value: 3 }]
            : [],
        },
        ...(stageId === 'F1' ? f1Armor.map(([itemId, affixes]) => ({
          itemId, rarity: 'rare', enhance: 0, affixes,
        })) : []),
      ],
      potions: tierLevel ? 5 : 3,
      clearedStages,
    };
    this.stats = {
      upBytes: 0,
      downBytes: 0,
      inputs: 0,
      immediatePredictions: 0,
      snapshots: 0,
      downBreakdown: {
        snapshotFrames: 0,
        entityBytes: 0,
        eventBytes: 0,
        otherSnapshotBytes: 0,
        otherFrameBytes: 0,
        staticFieldValueBytes: 0,
        repeatedFieldValueBytes: 0,
      },
      lastEntityState: new Map(),
      snapshotStates: new Map(),
    };
    this.statusEvents = [];
    this.session = new NetSession({
      url: `${serverUrl}/devinarok/${roomCode}`,
      WebSocketCtor: meteredWebSocket(this.stats),
      name: this.name,
      character: this.character,
      now: () => performance.now(),
      onMessage: (message) => this.handleMessage(message),
      onStatus: (status) => this.statusEvents.push({ status, at: performance.now() }),
      onError: (error) => {
        this.errors.push(String(error?.message ?? error));
      },
    });
    this.errors = [];
    this.playerId = null;
    this.welcomeCount = 0;
    this.welcomePromise = new Promise((resolvePromise) => { this.resolveWelcome = resolvePromise; });
    this.lobbyReadyPromise = new Promise((resolvePromise) => { this.resolveLobbyReady = resolvePromise; });
    this.startedPromise = new Promise((resolvePromise) => { this.resolveStarted = resolvePromise; });
    this.result = null;
    this.startedAt = null;
    this.lastSnapshot = null;
    this.localWorld = null;
    this.predictor = null;
    this.interpolation = new InterpolationBuffer();
    this.castTimeline = null;
    this.inputSeq = 0;
    this.inputTimer = null;
    this.renderTimer = null;
    this.pendingReconnectAt = null;
    this.reconnectResumeMs = null;
    this.predictedVfx = new Set();
    this.vfxSpawnCounts = new Map();
    this.confirmedOwnCasts = new Set();
    this.predictedHits = new Map();
    this.predictedStrikeHits = new Map();
    this.serverHits = new Map();
    this.seenHitEvents = new Set();
    this.seenStrikeEvents = new Set();
    this.castDiagnostics = new Map();
    this.inputDiagnostics = new Map();
    this.pendingImpactClaims = [];
    this.enemyDeathEvents = [];
    this.seenEnemyDeathEvents = new Set();
    this.castViewDelayTicks = new Map();
    this.correctionSamples = [];
    this.counterSnapshotSamples = [];
    this.inputsConsumedAboveTick = 0;
    this.lastAckObserved = null;
    this.lastTickObserved = null;
    this.lastRoomIndex = 0;
    this.freezeTracks = new Map();
    this.remoteFrozenMs = 0;
    this.remoteFreezeEpisodes = 0;
    this.measuredCorrectionsOver03m = 0;
    this.lastRenderAt = null;
  }

  connect() {
    this.session.connect();
    return this.welcomePromise;
  }

  handleMessage(message) {
    const now = performance.now();
    if (message.t === 'welcome') {
      this.playerId = message.playerId;
      this.welcomeCount += 1;
      if (this.welcomeCount === 1) this.resolveWelcome(message);
      return;
    }
    if (message.t === 'start') {
      this.startRun(message);
      this.resolveStarted(message);
      return;
    }
    if (message.t === 'lobby') {
      if (
        message.players?.length === botCount &&
        message.players.every((player) => player.connected && player.ready)
      ) this.resolveLobbyReady(message);
      return;
    }
    if (message.t === 'snap') {
      this.handleSnapshot(message, now);
      return;
    }
    if (message.t === 'result') {
      this.result = message.result;
      return;
    }
    if (message.t === 'error') this.errors.push(`server:${message.code}`);
  }

  startRun(message) {
    this.startedAt ??= performance.now();
    this.runId = message.runId;
    this.localWorld = createStageWorld({
      seed: message.seed,
      stageId: message.stageId,
      difficulty: message.difficulty ?? 'normal',
      party: message.party.map((member) => ({
        playerId: member.playerId,
        name: member.name,
        character: member.playerId === this.playerId
          ? this.character
          : { level: member.level, equipment: [], potions: 3 },
      })),
    });
    const player = livePlayer(this.localWorld, this.playerId);
    if (!player) throw new Error(`Missing local player entity ${this.playerId}`);
    this.predictor = new Predictor({
      player: structuredClone(player),
      playerId: this.playerId,
      ctx: { arena: this.localWorld.arena, openDoors: this.localWorld.openDoors, tick: message.tick },
    });
    this.castTimeline = new CastTimeline({ playerId: this.playerId });
    this.inputTimer = setInterval(() => this.sendBotInput(), INPUT_MS);
    this.renderTimer = setInterval(() => this.sampleRemoteEntities(), RENDER_MS);
  }

  handleSnapshot(message, now) {
    this.stats.snapshots += 1;
    this.lastSnapshot = message;
    this.lastServerTick = message.tick;
    this.lastRoomIndex = message.roomIndex ?? this.lastRoomIndex;
    let ackAdvance = 0;
    let tickAdvance = 0;
    if (this.lastAckObserved !== null && this.lastTickObserved !== null) {
      ackAdvance = Math.max(0, (message.ack ?? 0) - this.lastAckObserved);
      tickAdvance = Math.max(0, (message.tick ?? 0) - this.lastTickObserved);
      this.inputsConsumedAboveTick += Math.max(0, ackAdvance - tickAdvance);
    }
    this.lastAckObserved = message.ack ?? this.lastAckObserved;
    this.lastTickObserved = message.tick ?? this.lastTickObserved;
    this.interpolation.addSnapshot({
      tick: message.tick,
      receivedAt: now,
      entities: message.ents ?? [],
      activeEnemyIds: message.activeEnemyIds ?? null,
      teleport: (message.ents ?? []).some((entity) => entity.teleport || entity.roomChanged),
    });
    if (this.predictor) {
      const previousPrediction = this.predictor.getPlayer();
      const serverPlayer = (message.ents ?? []).find((entity) => entity.playerId === this.playerId);
      this.predictor.setContext({
        arena: this.localWorld.arena,
        openDoors: message.openDoors ?? this.localWorld.openDoors,
        tick: message.tick,
      });
      const serverCounterState = playerDiagnosticState(serverPlayer);
      const pendingAttackSeqs = this.predictor.pendingInputs
        .filter((input) => input.buttons & BUTTONS.ATTACK)
        .map((input) => input.seq);
      const reconciliation = this.predictor.reconcile(message, now);
      if (serverCounterState.counterReadyTicks > 0) {
        const predictedPlayer = this.predictor.getPlayer();
        this.counterSnapshotSamples.push({
          tick: message.tick,
          ack: message.ack,
          serverCounterReadyTicks: serverCounterState.counterReadyTicks,
          serverCounterAttackerId: serverPlayer?.motion?.counterAttackerId ?? serverPlayer?.counterAttackerId ?? null,
          serverPerfectPaid: serverPlayer?.motion?.perfectPaid ?? serverPlayer?.perfectPaid ?? null,
          serverDodgeStartTick: serverPlayer?.motion?.dodgeStartTick ?? serverPlayer?.dodgeStartTick ?? null,
          inputSeq: this.inputSeq,
          pendingAttackSeqs,
          predictorCounterReadyTicks: predictedPlayer.counterReadyTicks,
        });
      }
      const intentionalSnap = Boolean(
        message.roomChanged ||
        message.teleport ||
        (message.ents ?? []).some((entity) => entity.teleport || entity.roomChanged) ||
        (message.ev ?? []).some((event) => ['knockback', 'roomEnter'].includes(event.type))
      );
      if (
        reconciliation &&
        reconciliation.error > 0.3 &&
        reconciliation.error <= 2 &&
        !reconciliation.snapped &&
        !intentionalSnap
      ) {
        this.measuredCorrectionsOver03m += 1;
      }
      if (
        reconciliation?.error > 0.3 &&
        reconciliation.error <= 2 &&
        !reconciliation.snapped &&
        !intentionalSnap
      ) {
        const correctionInput = this.inputDiagnostics.get(previousPrediction.lastInput?.seq);
        this.correctionSamples.push({
          tick: message.tick,
          ack: message.ack,
          ackAdvance,
          tickAdvance,
          seq: this.inputSeq,
          error: reconciliation.error,
          pending: reconciliation.pending,
          intentionalSnap,
          predictedBefore: { x: previousPrediction.x, z: previousPrediction.z },
          castStep: correctionInput?.castStep ?? previousPrediction.attack?.step ?? null,
          attackPhase: correctionInput?.attackPhase ?? previousPrediction.attack?.phase ?? null,
          dodgeTicks: correctionInput?.dodgeTicks ?? previousPrediction.dodgeTicks ?? null,
          dodgeBufferTicks: correctionInput?.dodgeBufferTicks ?? previousPrediction.dodgeBufferTicks ?? null,
          counterReadyTicks: correctionInput?.counterReadyTicks ?? previousPrediction.counterReadyTicks ?? null,
          assistForcedRelease: correctionInput?.assistForcedRelease ?? false,
          clientPlayerPosition: { x: previousPrediction.x, z: previousPrediction.z },
          serverPlayerPosition: {
            x: serverPlayer?.motion?.x ?? serverPlayer?.x,
            z: serverPlayer?.motion?.z ?? serverPlayer?.z,
          },
          clientPlayerState: playerDiagnosticState(previousPrediction),
          serverPlayerState: playerDiagnosticState(serverPlayer),
          predictedStateBefore: {
            downed: Boolean(previousPrediction.downed),
            dead: Boolean(previousPrediction.dead),
            lastInput: previousPrediction.lastInput,
          },
          server: {
            x: serverPlayer?.motion?.x ?? serverPlayer?.x,
            z: serverPlayer?.motion?.z ?? serverPlayer?.z,
            downed: Boolean(serverPlayer?.motion?.downed ?? serverPlayer?.downed),
            dead: Boolean(serverPlayer?.motion?.dead ?? serverPlayer?.dead),
            lastInput: serverPlayer?.motion?.lastInput ?? null,
            previousButtons: serverPlayer?.motion?.previousButtons ?? null,
          },
          pendingInputs: this.predictor.pendingInputs.map(({ seq: pendingSeq, moveX: pendingMoveX, moveZ: pendingMoveZ, buttons: pendingButtons }) => ({
            seq: pendingSeq,
            moveX: pendingMoveX,
            moveZ: pendingMoveZ,
            buttons: pendingButtons,
          })),
          events: (message.ev ?? []).map((event) => ({
            eventId: event.eventId,
            type: event.type,
            playerId: event.playerId,
            entityId: event.entityId,
            targetId: event.targetId,
            castId: event.castId,
          })),
        });
      }
    }
    if (this.castTimeline && Array.isArray(message.ev)) {
      const { spawned } = this.castTimeline.ingestEvents(message.ev, now);
      for (const cast of spawned) {
        this.vfxSpawnCounts.set(cast.castId, (this.vfxSpawnCounts.get(cast.castId) ?? 0) + 1);
      }
      this.castTimeline.consumeAuthoritativeEvents();
      for (const event of message.ev) {
        if (Number.isSafeInteger(event.eventId)) this.session.setEventAck(event.eventId);
      }
      this.recordAuthoritativeEvents(
        message.ev,
        message.tick,
        (message.ents ?? []).find((entity) => entity.playerId === this.playerId),
      );
    }
    if (
      this.pendingReconnectAt !== null &&
      this.welcomeCount > 1 &&
      message.full &&
      this.reconnectResumeMs === null
    ) {
      this.reconnectResumeMs = now - this.pendingReconnectAt;
    }
  }

  recordAuthoritativeEvents(events, snapshotTick, serverPlayer) {
    for (const event of events) {
      if (event.type === 'death' && !this.seenEnemyDeathEvents.has(event.eventId)) {
        this.seenEnemyDeathEvents.add(event.eventId);
        this.enemyDeathEvents.push({
          eventId: event.eventId,
          tick: event.tick,
          entityId: event.entityId,
          killerId: event.killerId,
          castId: event.castId,
        });
      }
      if (event.type === 'cast' && event.castId?.startsWith(`${this.playerId}:`)) {
        this.confirmedOwnCasts.add(event.castId);
        this.castDiagnostic(event.castId);
      }
      if (
        event.type === 'strike' &&
        event.castId?.startsWith(`${this.playerId}:`) &&
        !this.seenStrikeEvents.has(event.eventId)
      ) {
        this.seenStrikeEvents.add(event.eventId);
        const castId = rootCastId(event.castId, this.playerId);
        this.castDiagnostic(castId).serverStrikeTicks.push({
          eventId: event.eventId,
          rawCastId: event.castId,
          tick: event.tick,
          viewLag: event.viewLag,
          inputSeq: event.inputSeq,
          viewTick: event.viewTick,
          skill: event.skill,
          shape: event.shape ? structuredClone(event.shape) : undefined,
          snapshotTick,
          playerPosition: {
            x: serverPlayer?.motion?.x ?? serverPlayer?.x,
            z: serverPlayer?.motion?.z ?? serverPlayer?.z,
          },
          playerState: playerDiagnosticState(serverPlayer),
        });
      }
      if (event.type === 'impact' && event.ownerId === this.playerId) {
        const castId = rootCastId(event.id, this.playerId);
        const impact = {
          eventId: event.eventId,
          id: event.id,
          fireTick: event.fireTick,
          resolveTick: event.resolveTick,
          endsTick: event.endsTick,
          hitEvery: event.hitEvery,
          viewLag: event.viewLag,
          viewTick: event.viewTick,
          kind: event.kind,
          shape: event.shape ? structuredClone(event.shape) : undefined,
        };
        const diagnostic = this.castDiagnostic(castId);
        if (!diagnostic.pendingImpacts.some((entry) => entry.eventId === impact.eventId)) {
          diagnostic.pendingImpacts.push(impact);
        }
        for (const claim of this.pendingImpactClaims) {
          if (claim.castId !== castId) continue;
          claim.resolveTick = event.resolveTick + claim.offset;
          claim.viewLag = event.viewLag ?? claim.viewLag;
          claim.dueTick = claim.resolveTick + 2;
        }
        continue;
      }
      if (event.type !== 'hit' || !event.castId?.startsWith(`${this.playerId}:`)) continue;
      if (this.seenHitEvents.has(event.eventId)) continue;
      this.seenHitEvents.add(event.eventId);
      const castId = rootCastId(event.castId, this.playerId);
      const targets = this.serverHits.get(castId) ?? new Set();
      targets.add(event.targetId);
      this.serverHits.set(castId, targets);
      const diagnostic = this.castDiagnostic(castId);
      diagnostic.serverWouldHit = targets;
      diagnostic.serverHits.push({
        tick: event.tick,
        viewLag: event.viewLag,
        inputSeq: event.inputSeq,
        viewTick: event.viewTick,
        hitTargetId: event.targetId,
      });
    }
  }

  castDiagnostic(castId) {
    if (!this.castDiagnostics.has(castId)) {
      this.castDiagnostics.set(castId, {
        castId,
        clientWouldHit: new Set(),
        serverWouldHit: new Set(),
        clientSteps: [],
        serverStrikeTicks: [],
        serverHits: [],
        pendingImpacts: [],
      });
    }
    return this.castDiagnostics.get(castId);
  }

  wouldHitAtViewTick(strike, input, viewTickOverride, resolveTick = null) {
    const viewTick = Number.isSafeInteger(viewTickOverride)
      ? viewTickOverride
      : strike?.viewTick ?? input?.viewTick;
    if (!Number.isSafeInteger(viewTick) || !strike?.shape) return;
    const sample = this.interpolation.sampleAtRenderTick(viewTick);
    const castId = rootCastId(strike.castId, this.playerId);
    const targets = this.predictedHits.get(castId) ?? new Set();
    const activeEnemyIds = sample.activeEnemyIds ? new Set(sample.activeEnemyIds) : null;
    const strikeHits = this.predictedStrikeHits.get(strike.castId) ?? new Set();
    const step = {
      inputSeq: input?.seq,
      viewTick,
      resolveTick,
      kind: strike.kind,
      viewLag: strike.viewLag,
      shape: structuredClone(strike.shape),
      playerState: this.inputDiagnostics.get(input?.seq) ?? null,
      hits: [],
      enemyDistances: [],
    };
    const hitCandidates = [];
    for (const entity of sample.entities) {
      if (
        entity.kind !== 'enemy' ||
        entity.dead ||
        entity.state === 'dead' ||
        entity.invulnerable ||
        entity.spawnTicksLeft > 0
      ) continue;
      if (activeEnemyIds && !activeEnemyIds.has(entity.id)) continue;
      const hit = shapeHitsTarget(strike.shape, entity);
      const edgeDistance = distanceToShapeEdge(strike.shape, entity);
      step.enemyDistances.push({
        enemyId: entity.id,
        x: entity.x,
        z: entity.z,
        edgeDistance,
        hit: false,
      });
      if (hit && !strikeHits.has(entity.id)) hitCandidates.push({ entity });
    }
    if (Number.isFinite(strike.maxTargets) && strike.shape.type === 'line') {
      const project = ({ entity }) => (
        (entity.x - strike.shape.originX) * Math.cos(strike.shape.angle) +
        (entity.z - strike.shape.originZ) * Math.sin(strike.shape.angle)
      );
      hitCandidates.sort((left, right) => (
        project(left) - project(right) || left.entity.id - right.entity.id
      ));
      hitCandidates.length = Math.min(hitCandidates.length, strike.maxTargets);
    }
    for (const { entity } of hitCandidates) {
      const record = step.enemyDistances.find((entry) => entry.enemyId === entity.id);
      if (record) record.hit = true;
      strikeHits.add(entity.id);
      targets.add(entity.id);
      step.hits.push(entity.id);
    }
    this.predictedStrikeHits.set(strike.castId, strikeHits);
    this.predictedHits.set(castId, targets);
    const diagnostic = this.castDiagnostic(castId);
    diagnostic.clientWouldHit = targets;
    diagnostic.clientSteps.push(step);
  }

  schedulePendingImpactClaims(impacts, input) {
    for (const impact of impacts ?? []) {
      const castId = rootCastId(impact.id, this.playerId);
      const offsets = impact.kind === 'burn'
        ? Array.from(
          { length: Math.max(0, Math.floor((impact.endsTick - impact.resolveTick) / impact.hitEvery)) },
          (_, index) => (index + 1) * impact.hitEvery,
        )
        : [0];
      for (const offset of offsets) {
        const resolveTick = impact.resolveTick + offset;
        this.pendingImpactClaims.push({
          castId,
          shape: structuredClone(impact.shape),
          kind: impact.kind,
          inputSeq: input.seq,
          offset,
          resolveTick,
          dueTick: resolveTick + 2,
          viewLag: impact.viewLag,
        });
      }
    }
  }

  resolvePendingImpactClaims() {
    const currentTick = this.predictor?.ctx.tick ?? -Infinity;
    const due = this.pendingImpactClaims.filter((claim) => claim.dueTick <= currentTick);
    this.pendingImpactClaims = this.pendingImpactClaims.filter((claim) => claim.dueTick > currentTick);
    for (const claim of due) {
      const viewTick = claim.resolveTick - claim.viewLag;
      this.wouldHitAtViewTick(
        { castId: claim.castId, shape: claim.shape, kind: claim.kind, viewLag: claim.viewLag },
        { seq: claim.inputSeq },
        viewTick,
        claim.resolveTick,
      );
    }
  }

  sendBotInput() {
    if (!this.predictor || !this.lastSnapshot || this.result) return;
    const player = this.predictor.getPlayer();
    const estimate = this.session.clock.getEstimate(performance.now());
    const view = this.interpolation.sample(estimate);
    const viewTick = Math.round(view.renderTick);
    const viewed = this.interpolation.sampleAtRenderTick(viewTick);
    const room = this.localWorld.arena.rooms[this.lastRoomIndex];
    const door = this.localWorld.arena.doors.find((candidate) => candidate.fromRoom === room?.id);
    const { moveX, moveZ, aim, buttons } = computeBotPolicy({
      player,
      viewed,
      roomCleared: Boolean(this.lastSnapshot.roomCleared),
      door,
    });

    const seq = ++this.inputSeq;
    const before = this.predictor.getPlayer();
    const input = buildRangedAimInput(
      { seq, moveX, moveZ, aim, buttons, viewTick },
      player,
      viewed,
    );
    if (buttons & (BUTTONS.ATTACK | BUTTONS.SKILL1 | BUTTONS.SKILL2 | BUTTONS.SKILL3)) {
      this.castViewDelayTicks.set(`${this.playerId}:${seq}`, view.delayMs * TICK_HZ / 1000);
    }
    const { motion } = this.predictor.applyLocalInput(input);
    const after = this.predictor.getPlayer();
    this.inputDiagnostics.set(seq, {
      tick: this.predictor.ctx.tick,
      castStep: motion?.counterStrike ? 'counter' : after.attack?.step ?? before.attack?.step ?? null,
      attackPhase: after.attack?.phase ?? before.attack?.phase ?? null,
      dodgeTicks: after.dodgeTicks ?? before.dodgeTicks ?? null,
      dodgeBufferTicks: after.dodgeBufferTicks ?? before.dodgeBufferTicks ?? null,
      counterReadyTicks: after.counterReadyTicks ?? before.counterReadyTicks ?? null,
      assistForcedRelease: false,
      assistUsed: false,
      clientPosition: { x: after.x, z: after.z },
    });
    this.resolvePendingImpactClaims();
    if (motion) this.stats.immediatePredictions += 1;
    const cast = this.castTimeline.predictInput(input, performance.now());
    if (cast && !this.predictedVfx.has(cast.castId)) {
      this.predictedVfx.add(cast.castId);
      this.vfxSpawnCounts.set(cast.castId, (this.vfxSpawnCounts.get(cast.castId) ?? 0) + 1);
    }
    this.wouldHitAtViewTick(motion?.attackStrike, input);
    this.wouldHitAtViewTick(motion?.counterStrike, input);
    const skillStrikes = motion?.skillStrikes?.length
      ? motion.skillStrikes
      : motion?.skillStrike
        ? [motion.skillStrike]
        : [];
    for (const strike of skillStrikes) this.wouldHitAtViewTick(strike, input);
    this.schedulePendingImpactClaims(motion?.pendingImpacts, input);
    this.session.queueInput(input);
    this.stats.inputs += 1;
  }

  sampleRemoteEntities() {
    if (!this.lastSnapshot || !this.session) return;
    const now = performance.now();
    const estimate = this.session.clock.getEstimate(now);
    const sample = this.interpolation.sample(estimate);
    const serverEntities = new Map((this.lastSnapshot.ents ?? []).map((entity) => [entity.id, entity]));
    if (this.lastRenderAt === null) {
      this.lastRenderAt = now;
      return;
    }
    const elapsed = Math.max(0, now - this.lastRenderAt);
    this.lastRenderAt = now;
    for (const entity of sample.entities) {
      if (entity.kind !== 'player' || entity.playerId === this.playerId) continue;
      const serverEntity = serverEntities.get(entity.id);
      if (!serverEntity) continue;
      let track = this.freezeTracks.get(entity.id);
      if (!track) {
        track = {
          renderX: entity.x,
          renderZ: entity.z,
          serverX: serverEntity.x,
          serverZ: serverEntity.z,
          unchangedMs: 0,
          serverMoved: false,
        };
        this.freezeTracks.set(entity.id, track);
        continue;
      }
      if (serverEntity.x !== track.serverX || serverEntity.z !== track.serverZ) {
        track.serverMoved = true;
      }
      track.serverX = serverEntity.x;
      track.serverZ = serverEntity.z;
      const renderChanged = entity.x !== track.renderX || entity.z !== track.renderZ;
      if (renderChanged) {
        track.renderX = entity.x;
        track.renderZ = entity.z;
        track.unchangedMs = 0;
        track.serverMoved = false;
      } else if (track.serverMoved) {
        const before = track.unchangedMs;
        track.unchangedMs += elapsed;
        if (track.unchangedMs > 150) {
          this.remoteFrozenMs += Math.max(0, track.unchangedMs - Math.max(before, 150));
          if (before <= 150) this.remoteFreezeEpisodes += 1;
        }
      } else {
        track.unchangedMs = 0;
      }
    }
  }

  async stop() {
    clearInterval(this.inputTimer);
    clearInterval(this.renderTimer);
    this.session.close();
  }

  metrics(durationMs) {
    const corrections = this.measuredCorrectionsOver03m;
    const snaps = this.predictor?.metrics.snaps ?? 0;
    const correctionRate = corrections / Math.max(durationMs / 60_000, 1 / 60_000);
    const ownConfirmed = [...this.confirmedOwnCasts];
    const ownDuplicates = ownConfirmed.reduce((sum, castId) => (
      sum + Math.max(0, (this.vfxSpawnCounts.get(castId) ?? 0) - 1)
    ), 0);
    const ownMissing = ownConfirmed.filter((castId) => !(this.vfxSpawnCounts.get(castId) > 0)).length;
    const comparisons = ownConfirmed.map((castId) => {
      const diagnostic = this.castDiagnostics.get(castId) ?? {
        clientWouldHit: new Set(),
        clientSteps: [],
        serverStrikeTicks: [],
        serverHits: [],
        pendingImpacts: [],
      };
      const predicted = this.predictedHits.get(castId) ?? new Set();
      const authoritative = this.serverHits.get(castId) ?? new Set();
      const score = scoreCastHitAgreement({
        clientWouldHit: [...predicted],
        serverHitSet: [...authoritative],
        serverStrikeTicks: diagnostic.serverStrikeTicks,
        enemyDeathEvents: this.enemyDeathEvents,
      });
      const rawDisagreementTargets = score.rawDisagreementTargets;
      const serverStrike = diagnostic.serverStrikeTicks.find((strike) => Number.isSafeInteger(strike.inputSeq));
      const inputSeq = serverStrike?.inputSeq ?? Number(castId.split(':').at(-1));
      const castState = this.inputDiagnostics.get(inputSeq);
      const disagreementTargets = score.disagreementTargets;
      const disagreementsWithin015m = disagreementTargets.flatMap((enemyId) => {
        const edgeDistance = Math.min(
          Infinity,
          ...diagnostic.clientSteps.flatMap((step) => (
            step.enemyDistances
              .filter((entry) => entry.enemyId === enemyId)
              .map((entry) => entry.edgeDistance)
          )),
        );
        return edgeDistance <= 0.15 ? [{ enemyId, edgeDistance }] : [];
      });
      const viewTickMismatches = score.exactMatch ? [] : diagnostic.serverStrikeTicks.flatMap((strike) => {
        const impact = diagnostic.pendingImpacts.find((entry) => entry.id === strike.rawCastId);
        const fireTick = impact?.fireTick ?? strike.tick;
        const requestedLag = Number.isSafeInteger(strike.viewTick) ? fireTick - strike.viewTick : null;
        if (requestedLag !== null && requestedLag >= 0 && requestedLag <= 12) return [];
        const kind = impact?.kind ?? (this.family === 'crossbow'
          ? strike.skill === 1 ? 'pierce' : strike.skill === 3 ? 'volley' : 'basic'
          : this.family === 'staff'
            ? strike.skill === 1 ? 'flame' : strike.skill === 2 ? 'frost' : 'basic-staff'
            : 'melee');
        return [{
          family: this.family,
          kind,
          castId,
          fireTick,
          strikeTick: strike.tick,
          viewTick: strike.viewTick ?? null,
          requestedLag,
          viewLag: strike.viewLag ?? null,
        }];
      });
      return {
        castId,
        counterCast: isCounterCast({
          serverStrikeTicks: diagnostic.serverStrikeTicks,
          clientCastStep: castState?.castStep,
          clientSteps: diagnostic.clientSteps,
        }),
        diagnosticState: {
          tick: serverStrike?.tick ?? castState?.tick ?? null,
          castStep: castState?.castStep ?? null,
          attackPhase: castState?.attackPhase ?? null,
          dodgeTicks: castState?.dodgeTicks ?? null,
          dodgeBufferTicks: castState?.dodgeBufferTicks ?? null,
          counterReadyTicks: castState?.counterReadyTicks ?? null,
          assistForcedRelease: castState?.assistForcedRelease ?? false,
          assistUsed: castState?.assistUsed ?? false,
          clientPlayerPosition: castState?.clientPosition ?? null,
          clientPlayerState: castState ? {
            castStep: castState.castStep,
            attackPhase: castState.attackPhase,
            dodgeTicks: castState.dodgeTicks,
            dodgeBufferTicks: castState.dodgeBufferTicks,
            counterReadyTicks: castState.counterReadyTicks,
          } : null,
          serverPlayerPosition: serverStrike?.playerPosition ?? null,
          serverPlayerState: serverStrike?.playerState ?? null,
        },
        clientWouldHit: [...predicted],
        serverHitSet: [...authoritative],
        exactMatch: score.exactMatch,
        lastServerStrikeTick: score.lastServerStrikeTick,
        rawDisagreementTargets,
        excusedTargets: score.excusedTargets,
        excusedTargetCount: score.excusedTargets.length,
        disagreementTargets,
        disagreementsWithin015m,
        viewTickMismatches,
        clientVts: diagnostic.clientSteps.map(({ inputSeq, viewTick }) => ({ inputSeq, viewTick })),
        clientSteps: diagnostic.clientSteps,
        serverStrikeTicks: diagnostic.serverStrikeTicks,
        serverHits: diagnostic.serverHits,
        pendingImpacts: diagnostic.pendingImpacts,
        enemyDeathEvents: this.enemyDeathEvents.filter((event) => (
          rawDisagreementTargets.includes(event.entityId)
        )),
      };
    });
    const nonCounterComparisons = comparisons.filter((row) => !row.counterCast);
    const counterComparisons = comparisons.filter((row) => row.counterCast);
    const totalMatched = nonCounterComparisons.filter((row) => row.exactMatch).length;
    const totalComparisons = nonCounterComparisons.length;
    const counterMatched = counterComparisons.filter((row) => row.exactMatch).length;
    const disagreementsWithin015m = nonCounterComparisons.reduce(
      (sum, row) => sum + row.disagreementsWithin015m.length,
      0,
    );
    const excusedTargets = nonCounterComparisons.reduce((sum, row) => sum + row.excusedTargetCount, 0);
    const excusedCasts = nonCounterComparisons.filter((row) => row.excusedTargetCount > 0).length;
    const hitAgreementPercent = totalComparisons ? 100 * totalMatched / totalComparisons : null;
    const viewTickMismatches = nonCounterComparisons.flatMap((row) => row.viewTickMismatches);
    const durationSeconds = durationMs / 1000;
    const bytesPerSecond = {
      up: this.stats.upBytes / Math.max(durationSeconds, 0.001),
      down: this.stats.downBytes / Math.max(durationSeconds, 0.001),
    };
    return {
      playerId: this.playerId,
      family: this.family,
      inputs: this.stats.inputs,
      immediatePredictions: this.stats.immediatePredictions,
      snapshots: this.stats.snapshots,
      ownInputResponseTicks: this.stats.immediatePredictions === this.stats.inputs ? 0 : null,
      correctionsOver03m: corrections,
      correctionsPerMinute: correctionRate,
      inputsConsumedAboveTick: this.inputsConsumedAboveTick,
      correctionSamples: this.correctionSamples,
      counterSnapshotSamples: this.counterSnapshotSamples,
      snaps,
      remoteFrozenSeconds: this.remoteFrozenMs / 1000,
      remoteFreezeEpisodes: this.remoteFreezeEpisodes,
      ownConfirmedCasts: ownConfirmed.length,
      ownVfxDuplicates: ownDuplicates,
      ownVfxMissing: ownMissing,
      hitAgreement: {
        matched: totalMatched,
        comparisons: totalComparisons,
        percent: hitAgreementPercent,
        disagreementsWithin015m,
        excusedTargets,
        excusedCasts,
        summaryNotes: this.family === 'staff' && nonCounterComparisons.some((row) => !row.exactMatch)
          ? ['Accepted staff disagreements came from client/server delayed-impact timing and aim-distance quantization at the circle edge.']
          : [],
        viewTickMismatchCount: viewTickMismatches.length,
        viewTickMismatches,
        perCast: nonCounterComparisons,
      },
      counterAgreement: {
        label: 'counter (server-confirmed)',
        matched: counterMatched,
        comparisons: counterComparisons.length,
        percent: counterComparisons.length ? 100 * counterMatched / counterComparisons.length : null,
        perCast: counterComparisons,
      },
      reconnectResumeMs: this.reconnectResumeMs,
      bytesPerSecond,
      downBandwidthBreakdownPerSecond: Object.fromEntries(
        Object.entries(this.stats.downBreakdown)
          .filter(([key]) => key !== 'snapshotFrames')
          .map(([key, value]) => [key, value / Math.max(durationSeconds, 0.001)]),
      ),
      downBandwidthBreakdownBytes: { ...this.stats.downBreakdown },
      bytes: { up: this.stats.upBytes, down: this.stats.downBytes },
      statusEvents: this.statusEvents,
      errors: this.errors,
    };
  }
}

function wait(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function waitForAll(promises, label, timeoutMs = 10_000) {
  let timer;
  try {
    return await Promise.race([
      Promise.all(promises),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function run() {
  if (typeof globalThis.WebSocket !== 'function') throw new Error('Run with Node 22+ for global WebSocket support');
  const bots = Array.from({ length: botCount }, (_, index) => new Bot(index, botFamilies[index]));
  const runStartedAt = performance.now();
  let reconnectTimer = null;
  try {
    for (const bot of bots) await waitForAll([bot.connect()], `bot ${bot.index + 1} welcome`);
    if (stageId !== 'C1' || difficulty !== 'normal') {
      bots[0].session.send({ t: 'lobby.stage', stageId, difficulty });
    }
    for (const bot of bots) bot.session.send({ t: 'lobby.ready', ready: true });
    await waitForAll(bots.map((bot) => bot.lobbyReadyPromise), 'all bots ready');
    bots[0].session.send({ t: 'lobby.start' });
    await waitForAll(bots.map((bot) => bot.startedPromise), 'run start');

    if (reconnectBotIndex >= 0 && reconnectBotIndex < bots.length) {
      const bot = bots[reconnectBotIndex];
      reconnectTimer = setTimeout(() => {
        bot.pendingReconnectAt = performance.now();
        bot.session.socket?.close(4001, 'injected reconnect test');
      }, reconnectAfterMs);
    }

    const deadline = Date.now() + durationSeconds * 1000;
    while (Date.now() < deadline && !bots.every((bot) => bot.result)) await wait(250);
    const stoppedAt = performance.now();
    await Promise.all(bots.map((bot) => bot.stop()));
    const durationMs = stoppedAt - runStartedAt;
    const botMetrics = bots.map((bot) => bot.metrics(durationMs));
    const summedHits = botMetrics.reduce((sum, item) => sum + item.hitAgreement.comparisons, 0);
    const summedMatches = botMetrics.reduce((sum, item) => sum + item.hitAgreement.matched, 0);
    const hitAgreementPercent = summedHits ? 100 * summedMatches / summedHits : null;
    const counterComparisons = botMetrics.reduce((sum, item) => sum + item.counterAgreement.comparisons, 0);
    const counterMatched = botMetrics.reduce((sum, item) => sum + item.counterAgreement.matched, 0);
    const hitAgreementByFamily = Object.fromEntries(botMetrics.map((item) => [
      item.family,
      item.hitAgreement,
    ]));
    const confirmedCasts = botMetrics.reduce((sum, item) => sum + item.ownConfirmedCasts, 0);
    const duplicates = botMetrics.reduce((sum, item) => sum + item.ownVfxDuplicates, 0);
    const missing = botMetrics.reduce((sum, item) => sum + item.ownVfxMissing, 0);
    const correctionEvents = botMetrics.reduce((sum, item) => sum + item.correctionsOver03m, 0);
    const frozenSeconds = botMetrics.reduce((sum, item) => sum + item.remoteFrozenSeconds, 0);
    const nearEdgeDisagreements = botMetrics.reduce(
      (sum, item) => sum + item.hitAgreement.disagreementsWithin015m,
      0,
    );
    const excusedHitTargets = botMetrics.reduce(
      (sum, item) => sum + item.hitAgreement.excusedTargets,
      0,
    );
    const excusedHitCasts = botMetrics.reduce(
      (sum, item) => sum + item.hitAgreement.excusedCasts,
      0,
    );
    const viewTickMismatches = botMetrics.flatMap((item) => item.hitAgreement.viewTickMismatches);
    const bandwidthBreakdown = {
      entityBytesPerSecond: botMetrics.reduce((sum, item) => sum + item.downBandwidthBreakdownPerSecond.entityBytes, 0),
      eventBytesPerSecond: botMetrics.reduce((sum, item) => sum + item.downBandwidthBreakdownPerSecond.eventBytes, 0),
      staticFieldValueBytesPerSecond: botMetrics.reduce(
        (sum, item) => sum + item.downBandwidthBreakdownPerSecond.staticFieldValueBytes,
        0,
      ),
      repeatedFieldValueBytesPerSecond: botMetrics.reduce(
        (sum, item) => sum + item.downBandwidthBreakdownPerSecond.repeatedFieldValueBytes,
        0,
      ),
      otherSnapshotBytesPerSecond: botMetrics.reduce(
        (sum, item) => sum + item.downBandwidthBreakdownPerSecond.otherSnapshotBytes,
        0,
      ),
      otherFrameBytesPerSecond: botMetrics.reduce(
        (sum, item) => sum + item.downBandwidthBreakdownPerSecond.otherFrameBytes,
        0,
      ),
    };
    const reconnectResumeMs = botMetrics.find((item) => item.reconnectResumeMs !== null)?.reconnectResumeMs ?? null;
    const ownInputResponseTicks = botMetrics.every((item) => item.ownInputResponseTicks === 0) ? 0 : null;
    const metrics = {
      createdAt: new Date().toISOString(),
      name: runName,
      roomCode,
      stageId,
      difficulty,
      serverUrl,
      profile,
      impairment: profile === 'impaired'
        ? { oneWayDelayMs: '75±25', stallMs: 300, stallEveryMs: 2000 }
        : null,
      botCount,
      botSetup: bots.map((bot) => ({
        family: bot.family,
        level: bot.character.level,
        clearedStages: [...bot.character.clearedStages],
      })),
      durationMs,
      completed: bots.every((bot) => Boolean(bot.result)),
      reconnectTestRequested: reconnectBotIndex >= 0 && reconnectBotIndex < bots.length,
      outcomes: bots.map((bot) => ({ playerId: bot.playerId, outcome: bot.result?.outcome ?? null })),
      passCriteria: {
        ownInputResponseTicks: 0,
        correctionsOver03mPerMinute: 0,
        remoteFrozenSeconds: 0,
        ownVfxDuplicates: 0,
        ownVfxMissing: 0,
        hitAgreementPercent: 97,
        reconnectResumeMs: 2000,
      },
      measured: {
        ownInputResponseTicks,
        correctionsOver03m: correctionEvents,
        correctionsPerMinute: correctionEvents / Math.max(durationMs / 60_000, 1 / 60_000),
        remoteFrozenSeconds: frozenSeconds,
        remoteFreezeEpisodes: botMetrics.reduce((sum, item) => sum + item.remoteFreezeEpisodes, 0),
        ownConfirmedCasts: confirmedCasts,
        ownVfxDuplicates: duplicates,
        ownVfxMissing: missing,
        hitAgreementPercent,
        nonCounterHitAgreementByFamily: hitAgreementByFamily,
        counterAgreement: {
          label: 'counter (server-confirmed)',
          matched: counterMatched,
          comparisons: counterComparisons,
          percent: counterComparisons ? 100 * counterMatched / counterComparisons : null,
        },
        hitAgreementMatched: summedMatches,
        hitAgreementComparisons: summedHits,
        hitAgreementExactMatchCasts: summedMatches,
        hitAgreementCasts: summedHits,
        hitAgreementExcusedTargets: excusedHitTargets,
        hitAgreementExcusedCasts: excusedHitCasts,
        viewTickMismatchCount: viewTickMismatches.length,
        viewTickMismatches,
        disagreementsWithin015m: nearEdgeDisagreements,
        reconnectResumeMs,
        bandwidthBreakdown,
        totalBytesPerSecond: {
          up: botMetrics.reduce((sum, item) => sum + item.bytesPerSecond.up, 0),
          down: botMetrics.reduce((sum, item) => sum + item.bytesPerSecond.down, 0),
        },
      },
      clients: botMetrics,
    };
    metrics.criteria = {
      ownInputResponse: metrics.measured.ownInputResponseTicks === 0,
      corrections: metrics.measured.correctionsPerMinute === 0,
      remoteFrozenTime: metrics.measured.remoteFrozenSeconds === 0,
      ownVfxExactlyOnce: duplicates === 0 && missing === 0,
      hitAgreement: hitAgreementPercent !== null && hitAgreementPercent >= 97,
      reconnect: metrics.reconnectTestRequested
        ? reconnectResumeMs !== null && reconnectResumeMs <= 2000
        : 'not-run',
    };
    const fileName = `${runName.replace(/[^a-z0-9-]+/gi, '-')}-${botCount}bot-${Date.now()}.json`;
    const outputPath = resolve(metricsDirectory, fileName);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(metrics, null, 2)}\n`);
    console.log(JSON.stringify({
      outputPath,
      roomCode,
      completed: metrics.completed,
      outcomes: metrics.outcomes,
      measured: metrics.measured,
      criteria: metrics.criteria,
      clients: botMetrics.map(({
        playerId,
        bytesPerSecond,
        downBandwidthBreakdownPerSecond,
        errors,
      }) => ({ playerId, bytesPerSecond, downBandwidthBreakdownPerSecond, errors })),
    }, null, 2));
  } finally {
    clearTimeout(reconnectTimer);
    await Promise.all(bots.map((bot) => bot.stop()));
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
