import { CastTimeline } from '../net/cast-timeline.js';
import { InterpolationBuffer } from '../net/interp.js';
import { NetSession } from '../net/net-session.js';
import { Predictor } from '../net/predictor.js';
import { buildRangedAimInput } from '../net/ranged-aim.js';
import { createStageWorld } from '../sim/world.js';

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const ROOM_CODE_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;

export function makeRoomCode(random = Math.random) {
  return Array.from({ length: 6 }, () => (
    ROOM_CODE_ALPHABET[Math.floor(random() * ROOM_CODE_ALPHABET.length)]
  )).join('');
}

export function partyServerUrl(code, search = globalThis.location?.search ?? '') {
  const override = new URLSearchParams(search).get('server');
  if (!override) return `wss://relay-do-poc.zuhejbeg.workers.dev/devinarok/${code}`;
  const url = new URL(override);
  const path = url.pathname.replace(/\/+$/, '');
  if (path.endsWith(`/devinarok/${code}`)) return url.toString();
  url.pathname = path.endsWith('/devinarok')
    ? `${path}/${code}`
    : `${path}/devinarok/${code}`;
  return url.toString();
}

function playerFromSnapshot(snapshot, playerId) {
  const entity = (snapshot.ents ?? []).find((entry) => entry.playerId === playerId);
  return entity?.motion ? { ...entity, ...entity.motion } : entity;
}

export class PartyClient {
  constructor({
    character,
    equipment = [],
    onLobby = () => {},
    onStatus = () => {},
    onStart = () => {},
    onSnapshot = () => {},
    onEvents = () => {},
    onResult = () => {},
    onRoomGone = () => {},
    onError = () => {},
  } = {}) {
    this.character = character;
    this.equipment = equipment;
    this.onLobby = onLobby;
    this.onStatus = onStatus;
    this.onStart = onStart;
    this.onSnapshot = onSnapshot;
    this.onEvents = onEvents;
    this.onResult = onResult;
    this.onRoomGone = onRoomGone;
    this.onError = onError;
    this.session = null;
    this.roomCode = null;
    this.playerId = null;
    this.lobby = null;
    this.status = 'disconnected';
    this.versionMismatch = false;
    this.inputTerminated = false;
    this.stageWorld = null;
    this.predictor = null;
    this.interpolation = null;
    this.castTimeline = null;
    this.lastSnapshot = null;
    this.runId = null;
    this.runSnapshotReady = false;
    this.result = null;
    this.reviveProgress = new Map();
    this.eventIds = new Set();
    this.seenEventIds = new Set();
    this.viewWorldBuffer = null;
    this.viewLocalPlayer = {};
    this.viewEntityPool = new Map();
  }

  createRoom() {
    return this.joinRoom(makeRoomCode());
  }

  joinRoom(code) {
    const roomCode = String(code ?? '').trim().toUpperCase();
    if (!ROOM_CODE_PATTERN.test(roomCode)) throw new RangeError('방 코드는 영문 대문자와 숫자 6자리여야 합니다.');
    this.close();
    this.inputTerminated = false;
    this.versionMismatch = false;
    this.roomCode = roomCode;
    this.viewWorldBuffer = null;
    this.viewLocalPlayer = {};
    this.viewEntityPool = new Map();
    this.session = new NetSession({
      url: partyServerUrl(roomCode),
      name: this.character.name,
      character: {
        level: this.character.level,
        equipment: this.equipment,
        potions: this.character.potions,
        clearedStages: this.character.clearedStages,
      },
      onMessage: (message) => this.handleMessage(message),
      onStatus: (status) => this.handleStatus(status),
      onError: (error) => this.onError(error),
      onVersionMismatch: () => {
        this.versionMismatch = true;
        this.handleStatus('version');
      },
    });
    this.session.connect();
    return roomCode;
  }

  handleMessage(message) {
    if (message.t === 'welcome') {
      this.playerId = message.playerId;
      this.roomCode = message.roomCode ?? this.roomCode;
      return;
    }
    if (message.t === 'lobby') {
      this.lobby = message;
      this.onLobby(message, this);
      return;
    }
    if (message.t === 'start') {
      this.startRun(message);
      this.onStart(message, this);
      return;
    }
    if (message.t === 'snap') {
      this.handleSnapshot(message);
      return;
    }
    if (message.t === 'result') {
      this.result = message.result;
      this.onResult({
        result: message.result,
        runId: message.runId ?? this.runId,
        roomCode: this.roomCode,
        playerId: this.playerId,
      }, this);
      return;
    }
    if (message.t === 'error') {
      if (message.code === 'room-gone') {
        this.stopInputs();
        this.close();
        this.onRoomGone(message, this);
      } else if (message.code === 'version') {
        this.versionMismatch = true;
        this.handleStatus('version');
      } else {
        this.stopInputs();
        const error = new Error(message.code);
        error.code = message.code;
        this.onError(error);
      }
    }
  }

  handleStatus(status) {
    this.status = status;
    if (status === 'connected' && !this.versionMismatch) this.inputTerminated = false;
    if (status === 'disconnected' || status === 'closed' || status === 'version') this.stopInputs();
    this.onStatus(status, this);
  }

  stopInputs() {
    this.inputTerminated = true;
    this.session?.inputs.clear();
  }

  startRun(message) {
    if (message.runId !== this.runId) {
      this.session?.resetRunEpoch(message.tick ?? 0);
      this.runSnapshotReady = false;
      this.seenEventIds.clear();
      this.eventIds.clear();
    }
    this.runId = message.runId;
    this.result = null;
    this.reviveProgress.clear();
    const party = (message.party ?? []).map((member) => ({
      playerId: member.playerId,
      name: member.name,
      character: member.playerId === this.playerId
        ? {
            level: this.character.level,
            equipment: this.equipment,
            potions: this.character.potions,
          }
        : { level: member.level ?? 1, equipment: [], potions: 3 },
    }));
    this.stageWorld = createStageWorld({
      seed: message.seed,
      stageId: message.stageId,
      difficulty: message.difficulty ?? 'normal',
      inputDriven: true,
      party,
    });
    this.predictor = null;
    this.interpolation = new InterpolationBuffer();
    this.castTimeline = new CastTimeline({ playerId: this.playerId });
    this.lastSnapshot = null;
  }

  handleSnapshot(message) {
    if (!this.runSnapshotReady && message.full) {
      const player = (message.ents ?? []).find((entity) => (
        entity.kind === 'player' && entity.playerId === this.playerId
      ));
      if (player && this.stageWorld) {
        this.session?.resetRunClock(message.tick ?? 0);
        this.predictor = new Predictor({
          player: structuredClone(player),
          playerId: this.playerId,
          ctx: {
            arena: this.stageWorld.arena,
            openDoors: message.openDoors ?? this.stageWorld.openDoors,
            tick: message.tick,
            entities: message.ents ?? [],
          },
        });
        this.interpolation = new InterpolationBuffer();
        this.castTimeline = new CastTimeline({ playerId: this.playerId });
        this.runSnapshotReady = true;
      }
    }
    this.lastSnapshot = message;
    this.interpolation?.addSnapshot({
      tick: message.tick,
      receivedAt: performance.now(),
      entities: message.ents ?? [],
      activeEnemyIds: message.activeEnemyIds ?? null,
      teleport: (message.ents ?? []).some((entity) => entity.teleport || entity.roomChanged),
    });
    if (this.predictor) {
      const estimate = this.session?.clock.getEstimate(performance.now()) ?? message.tick;
      const aimEntities = this.interpolation.sample(estimate).entities;
      this.predictor.setContext({
        arena: this.stageWorld.arena,
        openDoors: message.openDoors ?? this.stageWorld.openDoors,
        tick: message.tick,
        entities: aimEntities,
      });
      this.predictor.reconcile(message, performance.now());
    }
    const events = message.ev ?? [];
    const freshEvents = events.filter((event) => (
      !Number.isSafeInteger(event.eventId) || !this.seenEventIds.has(event.eventId)
    ));
    this.castTimeline?.ingestEvents(freshEvents, performance.now());
    for (const event of freshEvents) {
      if (event.type === 'reviveProgress') {
        this.reviveProgress.set(event.entityId, {
          progress: event.progress,
          required: event.required ?? 60,
        });
      } else if (event.type === 'downed') {
        this.reviveProgress.set(event.entityId, { progress: 0, required: 60 });
      } else if (event.type === 'revived' || event.type === 'roomEnter') {
        if (event.entityId !== undefined) this.reviveProgress.delete(event.entityId);
        else this.reviveProgress.clear();
      }
      if (Number.isSafeInteger(event.eventId) && !this.eventIds.has(event.eventId)) {
        this.eventIds.add(event.eventId);
        this.seenEventIds.add(event.eventId);
      }
    }
    this.onEvents(freshEvents, this);
    for (const eventId of this.eventIds) this.session?.setEventAck(eventId);
    this.eventIds.clear();
    while (this.seenEventIds.size > 512) this.seenEventIds.delete(this.seenEventIds.values().next().value);
    this.onSnapshot(message, this);
  }

  get inputReady() {
    return Boolean(
      this.runSnapshotReady &&
      this.session?.clock.samples > 0 &&
      this.status === 'connected' &&
      !this.inputTerminated &&
      !this.versionMismatch &&
      !this.result,
    );
  }

  sendInput(rawInput) {
    if (!this.inputReady || !this.predictor || !this.session || !this.lastSnapshot) return null;
    const estimate = this.session.clock.getEstimate(performance.now());
    const view = this.interpolation.sample(estimate);
    const viewTick = Math.round(view.renderTick);
    const autoAim = Boolean(rawInput.autoAim);
    let input = { ...rawInput, viewTick };
    delete input.autoAim;
    delete input.attackHeld;
    if (this.predictor.getPlayer().downed) {
      input.moveX = 0;
      input.moveZ = 0;
      input.mx = 0;
      input.mz = 0;
      input.buttons = 0;
      input.b = 0;
    }
    if (!autoAim) {
      input = buildRangedAimInput(
        input,
        this.predictor.getPlayer(),
        this.interpolation.sampleAtRenderTick(viewTick),
      );
    }
    this.predictor.applyLocalInput(input);
    this.castTimeline.predictInput(input, performance.now());
    this.session.queueInput(input);
    return input;
  }

  viewWorld(now = performance.now()) {
    if (!this.stageWorld || !this.predictor || !this.session) return this.stageWorld;
    const snapshot = this.lastSnapshot;
    const estimate = this.session.clock.getEstimate(now);
    const sample = this.interpolation.sampleInto?.(estimate) ?? this.interpolation.sample(estimate);
    this.viewLocalPlayer ??= {};
    this.viewEntityPool ??= new Map();
    const local = Object.assign(this.viewLocalPlayer, this.predictor.getPlayer());
    const visualPosition = this.predictor.getVisualPosition(now);
    local.x = visualPosition.x;
    local.z = visualPosition.z;
    local.reviveProgress = this.reviveProgress.get(local.id)?.progress ?? local.reviveProgress ?? 0;
    const output = this.viewWorldBuffer ??= { ...this.stageWorld, entities: [] };
    const entities = output.entities;
    entities.length = 0;
    entities.unshift(local);
    for (const entity of sample.entities) {
      if (entity.playerId === this.playerId || (entity.kind === 'loot' && entity.ownerId !== this.playerId)) continue;
      let view = this.viewEntityPool.get(entity.id);
      if (!view) this.viewEntityPool.set(entity.id, view = {});
      Object.assign(view, entity);
      view.reviveProgress = this.reviveProgress.get(entity.id)?.progress ?? entity.reviveProgress ?? 0;
      entities.push(view);
    }
    return Object.assign(output, this.stageWorld, {
      tick: snapshot?.tick ?? this.stageWorld.tick,
      entities,
      events: snapshot?.ev ?? [],
      roomIndex: snapshot?.roomIndex ?? this.stageWorld.roomIndex,
      roomCleared: snapshot?.roomCleared ?? false,
      doorCountdown: snapshot?.doorCountdown ?? null,
      openDoors: snapshot?.openDoors ?? this.stageWorld.openDoors,
      activeEnemyIds: snapshot?.activeEnemyIds ?? null,
      localPlayerId: this.playerId,
    });
  }

  setReady(ready) {
    return this.session?.send({ t: 'lobby.ready', ready: Boolean(ready) }) ?? false;
  }

  selectStage(stageId, difficulty = this.lobby?.difficulty ?? 'normal') {
    return this.session?.send({ t: 'lobby.stage', stageId, difficulty }) ?? false;
  }

  setPublic(isPublic) {
    return this.session?.send({ t: 'lobby.public', public: Boolean(isPublic) }) ?? false;
  }

  start() {
    return this.session?.send({ t: 'lobby.start' }) ?? false;
  }

  leave() {
    return this.session?.send({ t: 'leave' }) ?? false;
  }

  close() {
    this.stopInputs();
    this.session?.close();
    this.session = null;
  }
}
