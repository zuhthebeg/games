import { ServerClock } from './clock.js';
import { decodeMessage, encodeMessage, PROTOCOL_VERSION } from './protocol.js';
import { SIM_HASH } from './sim-version.js';

const INPUT_SEND_INTERVAL_MS = 1000 / 15;
const RECONNECT_START_MS = 250;
const RECONNECT_MAX_MS = 2000;
const TOKEN_RETAIN_MS = 60_000;
const SNAPSHOT_METADATA_FIELDS = [
  'roomIndex',
  'roomCleared',
  'doorCountdown',
  'openDoors',
  'activeEnemyIds',
];

function addListener(socket, type, listener) {
  if (typeof socket.addEventListener === 'function') socket.addEventListener(type, listener);
  else socket[`on${type}`] = listener;
}

function compactInput(input) {
  const result = {
    seq: Number(input.seq),
    mx: Number(input.mx ?? input.moveX ?? 0),
    mz: Number(input.mz ?? input.moveZ ?? 0),
    aim: Number(input.aim ?? 0),
    b: Number(input.b ?? input.buttons ?? 0),
  };
  const viewTick = input.vt ?? input.viewTick;
  if (Number.isSafeInteger(viewTick)) result.vt = viewTick;
  return result;
}

export class NetSession {
  constructor({
    url,
    WebSocketCtor = globalThis.WebSocket,
    WebSocket = WebSocketCtor,
    name = '',
    character = {},
    token = null,
    onMessage = () => {},
    onStatus = () => {},
    onError = () => {},
    onPong = () => {},
    onVersionMismatch = () => {},
    now = () => globalThis.performance?.now?.() ?? Date.now(),
    setTimeoutFn = globalThis.setTimeout?.bind(globalThis),
    clearTimeoutFn = globalThis.clearTimeout?.bind(globalThis),
    setIntervalFn = globalThis.setInterval?.bind(globalThis),
    clearIntervalFn = globalThis.clearInterval?.bind(globalThis),
    autoFlushInputs = true,
    autoPing = true,
    clock = new ServerClock(),
  } = {}) {
    this.url = url;
    this.WebSocketCtor = WebSocket;
    this.name = name;
    this.character = character;
    this.token = token;
    this.onMessage = onMessage;
    this.onStatus = onStatus;
    this.onError = onError;
    this.onPong = onPong;
    this.onVersionMismatch = onVersionMismatch;
    this.now = now;
    this.setTimeoutFn = setTimeoutFn;
    this.clearTimeoutFn = clearTimeoutFn;
    this.setIntervalFn = setIntervalFn;
    this.clearIntervalFn = clearIntervalFn;
    this.autoFlushInputs = autoFlushInputs;
    this.autoPing = autoPing;
    this.clock = clock;
    this.socket = null;
    this.closed = false;
    this.versionRejected = false;
    this.reconnectAttempts = 0;
    this.reconnectSince = null;
    this.reconnectTimer = null;
    this.inputTimer = null;
    this.pingTimer = null;
    this.inputs = new Map();
    this.eventAck = 0;
    this.receivedEventIds = new Set();
    this.snapshotAck = null;
    this.snapshotResyncRequested = false;
    this.snapshotStates = new Map();
    this.snapshotMetadataStates = new Map();
  }

  connect() {
    this.closed = false;
    this.versionRejected = false;
    if (typeof this.WebSocketCtor !== 'function') {
      const error = new TypeError('A WebSocket constructor is required');
      this.onError(error);
      this.onStatus('disconnected');
      return null;
    }
    this.onStatus('connecting');
    let socket;
    try {
      socket = new this.WebSocketCtor(this.url);
    } catch (error) {
      this.onError(error);
      this.scheduleReconnect();
      return null;
    }
    this.socket = socket;
    addListener(socket, 'open', () => this.handleOpen(socket));
    addListener(socket, 'message', (event) => this.handleSocketMessage(socket, event));
    addListener(socket, 'close', (event) => this.handleClose(socket, event));
    addListener(socket, 'error', (event) => this.onError(event));
    return socket;
  }

  handleOpen(socket) {
    if (this.closed || this.socket !== socket) return;
    this.reconnectAttempts = 0;
    this.reconnectSince = null;
    this.onStatus('connected');
    const hello = {
      t: 'hello',
      v: PROTOCOL_VERSION,
      simHash: SIM_HASH,
      name: this.name,
      character: this.character,
      ...(this.token ? { token: this.token } : {}),
    };
    this.send(hello);
    this.startTimers();
  }

  handleSocketMessage(socket, event) {
    if (this.socket !== socket || this.closed) return;
    let message;
    try {
      message = decodeMessage(event?.data ?? event);
    } catch (error) {
      this.onError(error);
      return;
    }
    if (message.t === 'welcome' && message.token) this.token = message.token;
    if (message.t === 'snap' && Number.isSafeInteger(message.ack)) {
      for (const seq of this.inputs.keys()) {
        if (seq <= message.ack) this.inputs.delete(seq);
      }
    }
    if (message.t === 'snap') {
      let state;
      let metadata;
      if (message.full) {
        state = new Map((message.ents ?? []).map((entity) => [entity.id, entity]));
        metadata = Object.fromEntries(SNAPSHOT_METADATA_FIELDS.map((key) => [key, message[key]]));
      } else {
        const baseline = this.snapshotStates.get(message.baseTick);
        const metadataBaseline = this.snapshotMetadataStates.get(message.baseTick);
        if (!baseline || !metadataBaseline) {
          this.snapshotResyncRequested = true;
          return;
        }
        state = new Map(baseline);
        for (const id of message.removed ?? []) state.delete(id);
        for (const delta of message.ents ?? []) {
          state.set(delta.id, { ...(state.get(delta.id) ?? {}), ...delta });
        }
        metadata = { ...metadataBaseline };
        for (const key of SNAPSHOT_METADATA_FIELDS) {
          if (Object.hasOwn(message, key)) metadata[key] = message[key];
        }
      }
      this.snapshotAck = message.tick;
      this.snapshotResyncRequested = false;
      this.snapshotStates.set(message.tick, state);
      this.snapshotMetadataStates.set(message.tick, metadata);
      while (this.snapshotStates.size > 120) {
        const oldestTick = Math.min(...this.snapshotStates.keys());
        this.snapshotStates.delete(oldestTick);
        this.snapshotMetadataStates.delete(oldestTick);
      }
      message.ents = [...state.values()];
      for (const key of SNAPSHOT_METADATA_FIELDS) message[key] = metadata[key];
      message.ev ??= [];
    }
    if (message.t === 'pong') {
      const synchronized = this.clock.observePong({
        c: message.c,
        t: message.tick ?? message.serverTick,
      }, this.now());
      if (synchronized) this.onPong(message);
    }
    if (message.t === 'error' && message.code === 'version') {
      this.versionRejected = true;
      this.onVersionMismatch(message);
      this.onStatus('version');
      this.stopTimers();
      try {
        socket.close();
      } catch (error) {
        this.onError(error);
      }
      return;
    }
    this.onMessage(message);
  }

  handleClose(socket, event) {
    if (this.socket !== socket) return;
    this.socket = null;
    this.stopTimers();
    if (this.closed || this.versionRejected) return;
    this.onStatus('reconnecting');
    this.scheduleReconnect();
    return event;
  }

  scheduleReconnect() {
    if (this.closed || this.versionRejected || this.reconnectTimer !== null) return;
    const nowMs = this.now();
    if (this.reconnectSince === null) this.reconnectSince = nowMs;
    if (nowMs - this.reconnectSince >= TOKEN_RETAIN_MS) {
      this.onStatus('disconnected');
      return;
    }
    const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_START_MS * (2 ** this.reconnectAttempts));
    this.reconnectAttempts += 1;
    this.reconnectTimer = this.setTimeoutFn(() => {
      this.reconnectTimer = null;
      if (this.closed || this.versionRejected) return;
      if (this.now() - this.reconnectSince >= TOKEN_RETAIN_MS) {
        this.onStatus('disconnected');
        return;
      }
      this.connect();
    }, delay);
  }

  startTimers() {
    this.stopTimers();
    if (this.autoFlushInputs && this.setIntervalFn) {
      this.inputTimer = this.setIntervalFn(() => this.flushInputs(), INPUT_SEND_INTERVAL_MS);
    }
    if (this.autoPing && this.setIntervalFn) {
      this.pingTimer = this.setIntervalFn(() => {
        const ping = this.clock.makePing(this.now());
        if (ping) this.send(ping);
      }, 50);
    }
  }

  stopTimers() {
    if (this.inputTimer !== null) this.clearIntervalFn?.(this.inputTimer);
    if (this.pingTimer !== null) this.clearIntervalFn?.(this.pingTimer);
    this.inputTimer = null;
    this.pingTimer = null;
  }

  queueInput(input) {
    const compact = compactInput(input);
    if (!Number.isSafeInteger(compact.seq) || compact.seq < 0) return false;
    this.inputs.set(compact.seq, compact);
    return true;
  }

  resetRunEpoch(tick = 0) {
    this.inputs.clear();
    this.eventAck = 0;
    this.receivedEventIds.clear();
    this.snapshotAck = null;
    this.snapshotResyncRequested = false;
    this.snapshotStates.clear();
    this.snapshotMetadataStates.clear();
    this.clock.reset(this.now(), tick);
  }

  resetRunClock(tick = 0) {
    this.clock.reset(this.now(), tick);
  }

  setEventAck(eventId) {
    if (!Number.isSafeInteger(eventId) || eventId <= this.eventAck) return;
    this.receivedEventIds.add(eventId);
    while (this.receivedEventIds.delete(this.eventAck + 1)) this.eventAck += 1;
  }

  flushInputs(ae = this.eventAck) {
    if (!this.inputs.size && this.snapshotAck === null && !this.snapshotResyncRequested) return false;
    const inputs = [...this.inputs.values()].sort((a, b) => a.seq - b.seq);
    const sent = this.send({
      t: 'in',
      ae,
      inputs,
      ...(this.snapshotAck === null ? {} : { sa: this.snapshotAck }),
      ...(this.snapshotResyncRequested ? { sr: true } : {}),
    });
    if (sent) this.snapshotResyncRequested = false;
    return sent;
  }

  sendPing(nowMs = this.now()) {
    const message = this.clock.makePing(nowMs);
    return message ? this.send(message) : false;
  }

  send(message) {
    const socket = this.socket;
    const openState = this.WebSocketCtor?.OPEN ?? 1;
    if (!socket || socket.readyState !== openState) return false;
    try {
      socket.send(encodeMessage(message));
      return true;
    } catch (error) {
      this.onError(error);
      return false;
    }
  }

  close() {
    this.closed = true;
    this.stopTimers();
    if (this.reconnectTimer !== null) this.clearTimeoutFn?.(this.reconnectTimer);
    this.reconnectTimer = null;
    const socket = this.socket;
    this.socket = null;
    try {
      socket?.close();
    } catch (error) {
      this.onError(error);
    }
    this.onStatus('closed');
  }
}

export function createNetSession(options) {
  return new NetSession(options);
}
