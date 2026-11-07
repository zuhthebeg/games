import assert from 'node:assert/strict';
import test from 'node:test';
import { ServerClock } from '../js/net/clock.js';
import { CastTimeline } from '../js/net/cast-timeline.js';
import { InterpolationBuffer } from '../js/net/interp.js';
import { InputQueue } from '../js/net/input-queue.js';
import { NetSession } from '../js/net/net-session.js';
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

test('input queue drops duplicates and old sequences, waits for gaps, and clears held buttons', () => {
  const queue = new InputQueue({ lastAppliedSeq: 0 });
  assert.equal(queue.enqueue({ seq: 2, mx: 22, mz: 0, b: BUTTONS.ATTACK }), true);
  assert.equal(queue.enqueue({ seq: 2, mx: 99 }), false);
  const gap = queue.consume();
  assert.equal(gap.ack, 0);
  assert.equal(gap.repeated, true);
  assert.equal(gap.input.buttons, 0);

  assert.equal(queue.enqueue({ seq: 1, mx: 11, mz: 0, b: 0 }), true);
  assert.equal(queue.consume().input.seq, 1);
  assert.equal(queue.consume().input.seq, 2);
  assert.equal(queue.enqueue({ seq: 2, mx: 0 }), false);
  for (let tick = 0; tick < 4; tick += 1) {
    const repeated = queue.consume();
    assert.equal(repeated.repeated, true);
    assert.equal(repeated.input.moveX, 22);
    assert.equal(repeated.input.buttons, 0);
  }
  const idle = queue.consume();
  assert.equal(idle.idle, true);
  assert.equal(idle.input.moveX, 0);

  const overflow = new InputQueue({ lastAppliedSeq: 0, maxPending: 6 });
  for (let seq = 1; seq <= 7; seq += 1) overflow.enqueue({ seq, mx: seq });
  assert.equal(overflow.pendingCount, 6);
  assert.equal(overflow.skipped, 1);
  assert.equal(overflow.lastAppliedSeq, 1);
  assert.equal(overflow.consume().input.seq, 2);
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
  buffer.addSnapshot({ tick: 0, receivedAt: 0, entities: [{ id: 1, x: 0, z: 0, facing: 3.1 }] });
  buffer.addSnapshot({ tick: 2, receivedAt: 70, entities: [{ id: 1, x: 2, z: 0, facing: -3.1 }] });
  const middle = buffer.sample(5);
  assert.ok(Math.abs(middle.entities[0].x - 1) < 0.1);
  assert.ok(Math.abs(Math.abs(middle.entities[0].facing) - Math.PI) < 0.1);

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

test('net session retains the newest six compact inputs and sends them in sequence order', () => {
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
  session.setEventAck(17);
  assert.equal(session.flushInputs(), true);
  const sent = decodeMessage(socket.sent.at(-1));
  assert.equal(sent.t, 'in');
  assert.equal(sent.ae, 17);
  assert.deepEqual(sent.inputs.map((input) => input.seq), [3, 4, 5, 6, 7, 8]);
  session.close();
});
