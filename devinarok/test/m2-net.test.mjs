import assert from 'node:assert/strict';
import test from 'node:test';
import { ServerClock } from '../js/net/clock.js';
import { CastTimeline } from '../js/net/cast-timeline.js';
import { InterpolationBuffer } from '../js/net/interp.js';
import { scoreCastHitAgreement } from '../js/net/hit-agreement.js';
import { InputQueue } from '../js/net/input-queue.js';
import { NetSession } from '../js/net/net-session.js';
import { partyServerUrl } from '../js/ui/party.js';
import { decodeMessage, encodeMessage, PROTOCOL_VERSION, roundToHundredth } from '../js/net/protocol.js';
import { BUTTONS } from '../js/sim/world.js';

test('protocol round trips compact snapshots and rounds spatial values', () => {
  const message = {
    t: 'snap',
    v: PROTOCOL_VERSION,
    tick: 88,
    ack: 9,
    ents: [{
      id: 12,
      kind: 'player',
      x: 1.234,
      z: -2.345,
      facing: 1.239,
      hp: 75,
      playerId: 'hero',
      motion: { x: 1.235, z: -2.345, facing: -1.236 },
    }],
    events: [{ eventId: 4, type: 'hit', shape: { originX: 0.129, originZ: 1.999, angle: 2.345 } }],
  };
  const result = decodeMessage(encodeMessage(message));
  assert.equal(result.ents[0].x, roundToHundredth(message.ents[0].x));
  assert.equal(result.ents[0].z, roundToHundredth(message.ents[0].z));
  assert.equal(result.ents[0].facing, roundToHundredth(message.ents[0].facing));
  assert.equal(result.ents[0].motion.x, roundToHundredth(message.ents[0].motion.x));
  assert.equal(result.ents[0].playerId, 'hero');
  assert.equal(result.events[0].shape.angle, roundToHundredth(message.events[0].shape.angle));
  assert.equal(result.v, PROTOCOL_VERSION);
});

test('hit agreement excuses client targets dead by the last authoritative strike only', () => {
  const score = scoreCastHitAgreement({
    clientWouldHit: [1, 2, 3],
    serverHitSet: [2, 4],
    serverStrikeTicks: [{ tick: 10 }, { tick: 12 }],
    enemyDeathEvents: [
      { entityId: 1, tick: 12 },
      { entityId: 3, tick: 13 },
      { entityId: 4, tick: 9 },
    ],
  });
  assert.equal(score.lastServerStrikeTick, 12);
  assert.deepEqual(score.rawDisagreementTargets, [1, 3, 4]);
  assert.deepEqual(score.excusedTargets, [1]);
  assert.deepEqual(score.disagreementTargets, [3, 4]);
  assert.equal(score.exactMatch, false);

  const noStrikes = scoreCastHitAgreement({
    clientWouldHit: [1],
    serverHitSet: [],
    enemyDeathEvents: [{ entityId: 1, tick: 1 }],
  });
  assert.deepEqual(noStrikes.excusedTargets, []);
  assert.equal(noStrikes.lastServerStrikeTick, null);
});

test('party server URL appends the room path and honors local overrides', () => {
  assert.equal(
    partyServerUrl('ABC234', ''),
    'wss://relay-do-poc.zuhejbeg.workers.dev/devinarok/ABC234',
  );
  assert.equal(
    partyServerUrl('ABC234', '?server=ws%3A%2F%2F127.0.0.1%3A8788'),
    'ws://127.0.0.1:8788/devinarok/ABC234',
  );
  assert.equal(
    partyServerUrl('ABC234', '?server=ws%3A%2F%2Flocalhost%2Fdevinarok'),
    'ws://localhost/devinarok/ABC234',
  );
});

test('protocol omits default fields in full keyframes and restores them on decode', () => {
  const fullWire = JSON.parse(encodeMessage({
    t: 'snap',
    full: true,
    ents: [{ id: 1, dead: false, attackRemaining: 0, dodge: false }],
  }));
  assert.equal(JSON.stringify(fullWire.ents[0]).includes('false'), false);
  const decodedFull = decodeMessage(JSON.stringify(fullWire));
  assert.equal(decodedFull.ents[0].dead, false);
  assert.equal(decodedFull.ents[0].attackRemaining, 0);

  const delta = decodeMessage(encodeMessage({
    t: 'snap',
    full: false,
    ents: [{ id: 1, dead: false, attackRemaining: 0 }],
  }));
  assert.equal(delta.ents[0].dead, false);
  assert.equal(delta.ents[0].attackRemaining, 0);
});

test('input queue waits for gaps without repeating or skipping inputs', () => {
  const queue = new InputQueue({ lastAppliedSeq: 0 });
  assert.equal(queue.enqueue({ seq: 2, mx: 22, mz: 0, b: BUTTONS.ATTACK }), true);
  assert.equal(queue.enqueue({ seq: 2, mx: 99 }), false);
  assert.deepEqual(queue.consumeForTick().inputs, []);

  assert.equal(queue.enqueue({ seq: 1, mx: 11, mz: 0, b: 0 }), true);
  assert.deepEqual(queue.consumeForTick().inputs.map((input) => input.seq), [1]);
  assert.deepEqual(queue.consumeForTick().inputs.map((input) => input.seq), [2]);
  assert.equal(queue.enqueue({ seq: 2, mx: 0 }), false);
  assert.deepEqual(queue.consumeForTick().inputs, []);
});

test('input queue drains two inputs per tick while backlog exceeds two', () => {
  const queue = new InputQueue();
  for (let seq = 1; seq <= 5; seq += 1) queue.enqueue({ seq, mx: seq });

  assert.deepEqual(queue.consumeForTick().inputs.map((input) => input.seq), [1, 2]);
  assert.equal(queue.pendingCount, 3);
  assert.deepEqual(queue.consumeForTick().inputs.map((input) => input.seq), [3, 4]);
  assert.equal(queue.pendingCount, 1);
  assert.deepEqual(queue.consumeForTick().inputs.map((input) => input.seq), [5]);
  assert.equal(queue.pendingCount, 0);
});

test('input queue hard cap drops the oldest input and requests a full resync', () => {
  const queue = new InputQueue({ maxPending: 90 });
  for (let seq = 1; seq <= 91; seq += 1) queue.enqueue({ seq, mx: seq });

  assert.equal(queue.pendingCount, 90);
  assert.equal(queue.skipped, 1);
  assert.equal(queue.lastAppliedSeq, 1);
  assert.equal(queue.consumeForTick().fullResync, true);
  assert.equal(queue.takeFullResyncRequest(), true);
  assert.equal(queue.takeFullResyncRequest(), false);
});

test('server clock EWMA tracks RTT and offset, schedules startup pings, and never moves backward', () => {
  const clock = new ServerClock();
  assert.equal(clock.makePing(0).c, 0);
  assert.equal(clock.makePing(249), null);
  assert.equal(clock.makePing(250).c, 250);
  assert.equal(clock.makePing(500).c, 500);
  assert.equal(clock.makePing(750).c, 750);
  assert.equal(clock.makePing(1749), null);
  assert.equal(clock.makePing(1750).c, 1750);

  const measured = new ServerClock();
  measured.observePong({ c: 0, t: 3 }, 100);
  assert.equal(measured.rttMs, 100);
  assert.equal(measured.offsetTicks, 1.5);
  const previousEstimate = measured.estimateTick(200);
  measured.observePong({ c: 100, t: 9 }, 200);
  assert.ok(Math.abs(measured.offsetTicks - 2.1) < 1e-9);
  assert.ok(measured.estimateTick(200) >= previousEstimate);
  const forward = measured.estimateTick(300);
  assert.ok(measured.estimateTick(250) >= forward);
  assert.ok(measured.playbackRate >= 0.95 && measured.playbackRate <= 1.05);
});

test('interpolation adapts to jitter, interpolates facing, extrapolates for at most 100ms, and snaps teleports', () => {
  const buffer = new InterpolationBuffer();
  buffer.addSnapshot({
    tick: 0,
    receivedAt: 0,
    activeEnemyIds: [1],
    entities: [{ id: 1, kind: 'enemy', x: 0, z: 0, facing: 3.1 }],
  });
  buffer.addSnapshot({
    tick: 2,
    receivedAt: 70,
    activeEnemyIds: [2],
    entities: [{ id: 1, kind: 'enemy', x: 2, z: 0, facing: -3.1 }],
  });
  const middle = buffer.sample(5);
  assert.ok(Math.abs(middle.entities[0].x - 1) < 0.1);
  assert.ok(Math.abs(Math.abs(middle.entities[0].facing) - Math.PI) < 0.1);
  assert.deepEqual(middle.activeEnemyIds, [1]);
  assert.deepEqual(buffer.sampleAtRenderTick(2).activeEnemyIds, [2]);
  const atRenderTick = buffer.sampleAtRenderTick(1);
  assert.equal(atRenderTick.renderTick, 1);
  assert.ok(Math.abs(atRenderTick.entities[0].x - 1) < 0.1);

  buffer.addSnapshot({ tick: 4, receivedAt: 180, entities: [{ id: 1, x: 4, z: 0, facing: -3.0 }] });
  buffer.addSnapshot({ tick: 6, receivedAt: 300, entities: [{ id: 1, x: 6, z: 0, facing: -2.9 }] });
  assert.ok(buffer.getDelayMs() > 133);
  const extrapolated = buffer.sample(12).entities[0].x;
  assert.ok(extrapolated > 6 && extrapolated <= 9.01);
  buffer.addSnapshot({ tick: 8, receivedAt: 390, entities: [{ id: 1, x: 8, z: 0, facing: -2.8 }] });
  assert.ok(buffer.sample(14).entities[0].x > extrapolated);

  buffer.addSnapshot({
    tick: 10,
    receivedAt: 460,
    teleport: true,
    entities: [{ id: 1, x: 20, z: 0, facing: 0 }],
  });
  const teleported = buffer.sample(16).entities[0];
  assert.ok(teleported.x >= 20);
});

test('cast timeline deduplicates predicted and server casts and only emits authoritative effects', () => {
  const timeline = new CastTimeline({ playerId: 'hero' });
  const predicted = timeline.predictInput({ seq: 1, buttons: BUTTONS.ATTACK }, 0);
  assert.equal(predicted.castId, 'hero:1');
  assert.equal(timeline.predictInput({ seq: 2, buttons: BUTTONS.ATTACK }, 16), null);
  const events = [
    { eventId: 1, type: 'cast', castId: 'hero:1', playerId: 'hero' },
    { eventId: 2, type: 'damage', targetId: 4, damage: 9 },
    { eventId: 3, type: 'cast', castId: 'other:1', playerId: 'other' },
  ];
  const first = timeline.ingestEvents(events, 32);
  assert.equal(first.attached.length, 1);
  assert.equal(first.spawned.length, 1);
  assert.equal(timeline.ingestEvents(events, 48).spawned.length, 0);
  assert.deepEqual(timeline.consumeAuthoritativeEvents().map((event) => event.type), ['damage']);

  timeline.predictInput({ seq: 3, buttons: 0 }, 50);
  const unconfirmed = timeline.predictInput({ seq: 4, buttons: BUTTONS.ATTACK }, 60);
  assert.ok(unconfirmed);
  assert.equal(timeline.update(510).some((cast) => cast.castId === 'hero:4'), false);
});

class FakeSocket {
  static OPEN = 1;

  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.listeners = new Map();
    this.sent = [];
    FakeSocket.instances.push(this);
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatch(type, event = {}) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  open() {
    this.readyState = FakeSocket.OPEN;
    this.dispatch('open');
  }

  receive(message) {
    this.dispatch('message', { data: encodeMessage(message) });
  }

  end() {
    this.readyState = 3;
    this.dispatch('close', { code: 1006 });
  }

  send(frame) {
    this.sent.push(frame);
  }

  close() {
    this.end();
  }
}

FakeSocket.instances = [];

function fakeTimers() {
  let nextId = 0;
  const timers = new Map();
  return {
    timers,
    setTimeoutFn(callback, delay) {
      const id = ++nextId;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeoutFn(id) {
      timers.delete(id);
    },
    runNext() {
      const [id, timer] = [...timers.entries()][0] ?? [];
      if (!timer) return null;
      timers.delete(id);
      timer.callback();
      return timer.delay;
    },
  };
}

test('net session reconnects with exponential backoff and resumes using the same token', () => {
  FakeSocket.instances = [];
  const timers = fakeTimers();
  let now = 0;
  const session = new NetSession({
    url: 'ws://example.invalid/room',
    WebSocketCtor: FakeSocket,
    token: 'resume-token',
    now: () => now,
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
    autoFlushInputs: false,
    autoPing: false,
  });
  const first = session.connect();
  first.open();
  assert.equal(JSON.parse(first.sent[0]).token, 'resume-token');
  first.receive({ t: 'welcome', token: 'server-token' });
  first.end();
  assert.equal([...timers.timers.values()][0].delay, 250);

  now = 250;
  timers.runNext();
  const second = FakeSocket.instances[1];
  second.open();
  assert.equal(JSON.parse(second.sent[0]).token, 'server-token');
  second.end();
  assert.equal([...timers.timers.values()][0].delay, 250);

  session.close();
  assert.equal(timers.timers.size, 0);
});

test('net session reads the authoritative tick from the pong tick field', () => {
  FakeSocket.instances = [];
  let now = 100;
  const session = new NetSession({
    url: 'ws://example.invalid/room',
    WebSocketCtor: FakeSocket,
    now: () => now,
    autoFlushInputs: false,
    autoPing: false,
  });
  const socket = session.connect();
  socket.open();
  now = 200;
  socket.receive({ t: 'pong', c: 100, tick: 6 });
  assert.equal(session.clock.samples, 1);
  assert.equal(session.clock.rttMs, 100);
  session.close();
});

test('net session increases reconnect delay when connection attempts keep failing', () => {
  FakeSocket.instances = [];
  const timers = fakeTimers();
  let now = 0;
  const session = new NetSession({
    url: 'ws://example.invalid/room',
    WebSocketCtor: FakeSocket,
    now: () => now,
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
    autoFlushInputs: false,
    autoPing: false,
  });
  session.connect().end();
  assert.equal([...timers.timers.values()][0].delay, 250);
  for (const delay of [250, 500, 1000, 2000]) {
    now += delay;
    timers.runNext();
    FakeSocket.instances.at(-1).end();
    assert.equal([...timers.timers.values()][0].delay, Math.min(delay * 2, 2000));
  }
  session.close();
});

test('net session retains unacknowledged inputs and sends them in sequence order', () => {
  FakeSocket.instances = [];
  const session = new NetSession({
    url: 'ws://example.invalid/room',
    WebSocketCtor: FakeSocket,
    autoFlushInputs: false,
    autoPing: false,
  });
  const socket = session.connect();
  socket.open();
  for (let seq = 1; seq <= 8; seq += 1) {
    session.queueInput({ seq, moveX: seq, moveZ: -seq, buttons: BUTTONS.ATTACK });
  }
  for (let eventId = 1; eventId <= 17; eventId += 1) session.setEventAck(eventId);
  assert.equal(session.flushInputs(), true);
  const sent = decodeMessage(socket.sent.at(-1));
  assert.equal(sent.t, 'in');
  assert.equal(sent.ae, 17);
  assert.deepEqual(sent.inputs.map((input) => input.seq), [1, 2, 3, 4, 5, 6, 7, 8]);
  socket.receive({ t: 'snap', tick: 0, ack: 4, full: true, ents: [] });
  assert.deepEqual([...session.inputs.keys()].sort((a, b) => a - b), [5, 6, 7, 8]);
  session.close();
});

test('net session acknowledges only contiguous authoritative event ids', () => {
  const session = new NetSession();
  session.setEventAck(1);
  session.setEventAck(3);
  assert.equal(session.eventAck, 1);
  session.setEventAck(2);
  assert.equal(session.eventAck, 3);
  session.setEventAck(3);
  assert.equal(session.eventAck, 3);
});

test('net session reconstructs acknowledged snapshot deltas and requests a full resync without the baseline', () => {
  FakeSocket.instances = [];
  const received = [];
  const session = new NetSession({
    url: 'ws://example.invalid/room',
    WebSocketCtor: FakeSocket,
    autoFlushInputs: false,
    autoPing: false,
    onMessage: (message) => received.push(message),
  });
  const socket = session.connect();
  socket.open();
  socket.receive({
    t: 'snap',
    tick: 0,
    ack: 0,
    full: true,
    roomIndex: 1,
    roomCleared: false,
    doorCountdown: null,
    openDoors: {},
    activeEnemyIds: [4, 5],
    ents: [{ id: 1, kind: 'player', x: 1, z: 2, dead: false }],
  });
  socket.receive({
    t: 'snap',
    tick: 2,
    ack: 0,
    full: false,
    baseTick: 0,
    activeEnemyIds: [6],
    ents: [{ id: 1, x: 3 }],
    removed: [],
  });
  assert.equal(received.at(-1).ents[0].x, 3);
  assert.equal(received.at(-1).ents[0].z, 2);
  assert.equal(received.at(-1).ents[0].dead, false);
  assert.equal(received.at(-1).roomIndex, 1);
  assert.equal(received.at(-1).roomCleared, false);
  assert.deepEqual(received.at(-1).activeEnemyIds, [6]);
  assert.deepEqual(received.at(-1).openDoors, {});
  assert.equal(session.snapshotAck, 2);
  session.snapshotStates.clear();
  session.snapshotMetadataStates.clear();
  const receivedCount = received.length;
  socket.receive({
    t: 'snap',
    tick: 4,
    ack: 0,
    full: false,
    baseTick: 2,
    ents: [{ id: 1, x: 4 }],
    removed: [],
  });
  assert.equal(received.length, receivedCount);
  assert.equal(session.snapshotResyncRequested, true);
  assert.equal(session.flushInputs(), true);
  const resyncRequest = decodeMessage(socket.sent.at(-1));
  assert.equal(resyncRequest.sa, 2);
  assert.equal(resyncRequest.sr, true);
  session.close();
});
