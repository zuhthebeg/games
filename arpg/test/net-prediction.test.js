import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { movementTraces } from './fixtures/movement-trace.js';
import { createWorld, addPlayer, startStage, emptyInput } from '../js/sim/world.js';
import { SnapshotBuffer, encodeSnapshot, InputSender, InputQueue } from '../js/net/protocol.js';
import { LocalPrediction } from '../js/net/prediction.js';
import { predictMovement, walkingPosition, arenaPosition } from '../js/sim/movement.js';
import { CoopSession } from '../js/net/session.js';
import { createMemoryTransport } from '../js/net/loopback.js';
const make = () => { const w = createWorld(); addPlayer(w, { pid: 'g' }); startStage(w, 'S2'); return w; };
const frame = (tick, x, seq = 0) => { const w = make(); w.tick = tick; w.entities[0].x = x; return encodeSnapshot(w, { g: seq }); };
const tx = (seq, mx = 1) => ({ seq, v: [mx, 0, 0, 0] });

test('host byte-for-byte full world/events equal pre-extraction nine 900-tick traces', () => {
  assert.deepEqual(movementTraces(), JSON.parse(readFileSync(new URL('./fixtures/movement-before.json', import.meta.url))));
});
const T = 1000 / 30;
test('buffer interpolates the surrounding pair by host tick; newest state/telegraphs win', () => {
  const b = new SnapshotBuffer('g', 100, { adaptive: false });
  for (let i = 0; i < 10; i++) { const p = frame(i * 3, i * 30); p.entities[0].hp = 100 - i; p.telegraphs = [{ id: i, phase: 'lock' }]; b.push(p, i * 3 * T); }
  // render clock 100ms behind -> tick (now-100)/T; tick 19.5 sits between frames at ticks 18 and 21.
  const v = b.sample(19.5 * T + 100); assert.ok(Math.abs(v.entities[0].x - 195) < 1e-6); assert.equal(v.entities[0].hp, 91);
  assert.deepEqual(v.telegraphs, [{ id: 9, phase: 'lock' }]);
  assert.equal(new SnapshotBuffer('g').sample(0), null);
});
test('arrival jitter/bursts do not move the playback clock; it advances smoothly at ~real time', () => {
  const b = new SnapshotBuffer('g'); let now = 0, previous = null; const steps = [];
  // Host sends every 2 ticks; arrivals: steady 60ms latency with 0..150ms extra lag and bursts.
  const arrivals = Array.from({ length: 120 }, (_, i) => ({ tick: i * 2, at: i * 2 * T + 60 + ((i * 37) % 7 === 0 ? 150 : (i * 13) % 40) }))
    .sort((x, y) => x.at - y.at);
  let next = 0;
  for (; now < 120 * 2 * T; now += 1000 / 60) {
    while (next < arrivals.length && arrivals[next].at <= now) { const a = arrivals[next++]; b.push(frame(a.tick, a.tick * 4), a.at); }
    const v = b.sample(now); if (!v || now < 1500) continue;
    if (previous !== null) steps.push(v.entities[0].x - previous); previous = v.entities[0].x;
  }
  // 4px per tick = 2px per 60Hz frame; playback-rate nudges stay within 8%, never a freeze/jump.
  assert.ok(steps.every(d => d > 2 * .9 && d < 2 * 1.1), JSON.stringify(steps.filter(d => !(d > 1.8 && d < 2.2)).slice(0, 5)));
  assert.equal(b.stats.resets, 0); assert.ok(b.delay >= 80 && b.delay <= 300);
});
test('extrapolation from tick velocity is capped at 3 ticks, then holds; first frame/stale safe', () => {
  const b = new SnapshotBuffer('g', 100, { adaptive: false });
  assert.equal(b.sample(0), null); b.push(frame(0, 100), 0); assert.equal(b.sample(1000).entities[0].x, 100);
  const c = new SnapshotBuffer('g', 100, { adaptive: false }); c.push(frame(0, 100), 0); c.push(frame(3, 130), 3 * T);
  assert.ok(Math.abs(c.sample(4 * T + 100).entities[0].x - 140) < 1e-6);
  assert.ok(Math.abs(c.sample(6 * T + 100).entities[0].x - 160) < 1e-6);
  assert.ok(Math.abs(c.sample(9 * T + 100).entities[0].x - 160) < 1e-6);
  assert.equal(c.push(frame(2, 1), 200), false);
});
test('latest terminal pawn never interpolates/extrapolates', () => {
  const b = new SnapshotBuffer('g'); b.push(frame(0, 100), 0); const p = frame(3, 140); p.entities[0].terminal = 'death'; b.push(p, 100);
  assert.equal(b.sample(1000).entities[0].x, 140);
});
test('self prediction advances instantly, replays only unacknowledged dt without changing authoritative fields', () => {
  const p = new LocalPrediction('g'), b = new SnapshotBuffer('g'); b.push(frame(0, 300), 0); p.reconcile(b.frames[0].world);
  const authoritative = JSON.stringify(b.frames[0].world);
  p.advance(tx(1), emptyInput(), 16); p.advance(tx(2), emptyInput(), 16);
  assert.ok(p.state.x > 307); assert.equal(p.view(b.frames[0].world).entities[0].hp, 100);
  b.push(frame(1, 303.68, 1), 33); p.reconcile(b.frames.at(-1).world);
  assert.deepEqual(p.pending.map(row => row.seq), [2]); assert.ok(Math.abs(p.state.x - 307.36) < .01);
  assert.equal(JSON.stringify(b.frames[0].world), authoritative);
});
test('correction below 24px converges in 150ms, sub-0.5px ignored, exactly 24px snaps', () => {
  const p = new LocalPrediction('g'), b = new SnapshotBuffer('g'); b.push(frame(0, 300), 0); p.reconcile(b.frames[0].world);
  b.push(frame(1, 300.4), 33); p.reconcile(b.frames.at(-1).world); assert.equal(p.offset.x, 0); assert.equal(p.stats.corrections, 0);
  b.push(frame(2, 310.4), 66); p.reconcile(b.frames.at(-1).world); assert.ok(Math.abs(p.offset.x + 10) < 1e-9); assert.equal(p.stats.snaps, 0);
  p.advance(tx(1, 0), emptyInput(), 75); assert.ok(Math.abs(p.offset.x + 5) < 1e-9);
  p.advance(tx(2, 0), emptyInput(), 75); assert.equal(p.offset.x, 0);
  b.push(frame(3, 334.4, 2), 99); p.reconcile(b.frames.at(-1).world); assert.equal(p.stats.snaps, 1); assert.equal(p.offset.x, 0);
});
for (const [name, override] of Object.entries({ knockback: { kx: 2 }, stagger: { staggerLeft: 4 }, hurt: { hurtInvuln: 3 },
  death: { dead: true, terminal: 'death' }, channel: { channel: 10 }, lock: { act: { id: 'slash', phase: 'lock' } }, active: { act: { id: 'slash', phase: 'active' } } })) {
  test(`authoritative ${name} clears pending movement and takes immediate position priority`, () => {
    const p = new LocalPrediction('g'), b = new SnapshotBuffer('g'); b.push(frame(0, 300), 0); p.reconcile(b.frames[0].world); p.advance(tx(1), emptyInput(), 16);
    const snapshot = frame(1, 280); Object.assign(snapshot.entities[0], override); b.push(snapshot, 33); p.reconcile(b.frames.at(-1).world);
    assert.equal(p.state.x, 280); assert.equal(p.pending.length, 0); assert.equal(p.offset.x, 0);
    p.advance(tx(2), emptyInput(), 16); assert.equal(p.state.x, 280);
  });
}
test('legacy packet without lastInputSeq disables prediction gracefully', () => {
  const p = new LocalPrediction('g'), b = new SnapshotBuffer('g'); b.push(frame(0, 300), 0); p.reconcile(b.frames[0].world);
  const old = frame(1, 320); delete old.entities[0].lastInputSeq; b.push(old, 33); p.reconcile(b.frames.at(-1).world);
  p.advance(tx(1), emptyInput(), 16); assert.equal(p.enabled, false); const view = b.sample(200); assert.equal(p.view(view), view);
});
test('walking, diagonal normalization, load, boundaries and dodge distance use shared pure integration', () => {
  const w = make(), original = structuredClone(w.entities[0]); const input = { ...emptyInput(), mx: 1, my: 1 };
  const walk = walkingPosition(original, input); assert.ok(Math.abs(Math.hypot(walk.x - original.x, walk.y - original.y) - original.speed / 30) < 1e-9);
  const p = { ...original, x: 100, y: 100 }; let n = predictMovement(p, { ...emptyInput(), mx: 1, dodgeEdge: true }, 1 / 60, w.arena);
  for (let i = 0; i < 11; i++) n = predictMovement(n, { ...emptyInput(), mx: 1 }, 1 / 60, w.arena);
  assert.equal(n.x, 250); assert.equal(n.dodge.dashLeft, 0); assert.deepEqual(w.entities[0], original);
  assert.deepEqual(arenaPosition({ x: -100, y: 10000, r: 17 }, w.arena), { x: 17, y: 843 });
});
test('facing follows aim on local render before any host packet', () => {
  const p = new LocalPrediction('g'), b = new SnapshotBuffer('g'); b.push(frame(0, 300), 0); p.reconcile(b.frames[0].world);
  p.advance({ seq: 1, v: [0, 0, 0, 1] }, emptyInput(), 16); assert.equal(p.state.facing, Math.PI / 2);
});
test('lastInputSeq acknowledges the host step, not latch receive', () => {
  const network = createMemoryTransport(), sessions = {};
  for (const uid of ['host', 'g']) {
    const transport = network.connect(uid, (from, data) => data.t === 'action' ? sessions[uid].action(data.action) : sessions[uid].rt(from, data));
    sessions[uid] = new CoopSession({ uid, host: 'host', players: ['host', 'g'], profile: { level: 1, weapon: 'blade', mods: {}, threats: { S2: 1 } }, config: { stageId: 'S2', seed: 1, threat: 1 }, ...transport });
  }
  sessions.g.update(34, emptyInput()); sessions.g.update(34, { ...emptyInput(), mx: 1 }); sessions.g.update(34, { ...emptyInput(), mx: 1 });
  sessions.host.broadcast(); // same tick ignored, inspect encoder directly for the real ack
  assert.equal(encodeSnapshot(sessions.host.world, sessions.host.appliedInputSeqs).entities[1].lastInputSeq, 0);
  // Two commands received, one host tick stepped: the ack is the one command applied, not the newest received.
  const received = sessions.host.latches.g.last; assert.equal(received, 2); sessions.host.update(34, emptyInput());
  assert.equal(encodeSnapshot(sessions.host.world, sessions.host.appliedInputSeqs).entities[1].lastInputSeq, 1);
  assert.equal(sessions.host.latches.g.seq, 1);
});

test('input history remains bounded through missing host acks, then recovers on a new authoritative snapshot', () => {
  const p = new LocalPrediction('g'), b = new SnapshotBuffer('g'); b.push(frame(0, 300), 0); p.reconcile(b.frames[0].world);
  for (let i = 1; i < 270; i++) p.advance(tx(i), emptyInput(), 16);
  assert.equal(p.enabled, false); assert.equal(p.pending.length, 0);
  b.push(frame(1, 350, 269), 100); p.reconcile(b.frames.at(-1).world); assert.equal(p.enabled, true); assert.equal(p.state.x, 350);
});

test('seeded impaired 60/120ms transports improve latency and interpolation without normal-walk snaps; even 15Hz snapshots', async () => {
  const { latencyReport } = await import('../tools/net-latency.mjs');
  for (const { before, after } of latencyReport()) {
    assert.equal(after.inputLatencyMs.samples, 7); assert.ok(after.inputLatencyMs.max <= 1000 / 60 + 1e-8);
    assert.ok(before.inputLatencyMs.median > 150); assert.equal(after.correction.snaps, 0);
    assert.ok(after.remote.repeatRatio < before.remote.repeatRatio * .25);
    assert.ok(after.remote.jumpP95Px < before.remote.jumpP95Px);
    assert.equal(after.hostSnapshots, before.hostSnapshots); assert.ok(after.hostSnapshots / after.hostSeconds <= 15.01);
  }
});

test('guest input queue: one command per host tick in order, dropped packet recovered from prev, edges once', () => {
  const tx = new InputSender(), rx = new InputQueue(), packets = [];
  for (let i = 0; i < 5; i++) packets.push(tx.packet({ ...emptyInput(), mx: (i + 1) / 10, dodgeEdge: i === 1 }));
  rx.receive(packets[0], 0); rx.receive(packets[2], 1); // packet 2 (seq 2, the dodge) lost; seq 3 carries it in prev
  assert.equal(rx.consume(2).mx, .1); assert.equal(rx.seq, 1);
  const second = rx.consume(3); assert.equal(second.mx, .2); assert.equal(rx.seq, 2);
  const third = rx.consume(4); assert.equal(third.mx, .3);
  // The lost packet's dodge press is not lost: cumulative counters fire it exactly once.
  assert.equal([second, third].filter(i => i.dodgeEdge).length, 1);
  // Starved: no step, no ack advance; aim/attack held.
  const idle = rx.consume(5); assert.equal(idle.mx, 0); assert.equal(rx.seq, 3); assert.equal(rx.stats.starved, 1);
});
test('guest input queue: lone press applies after one tick; backlog after a burst drains instead of staying late', () => {
  const tx = new InputSender(), rx = new InputQueue();
  rx.receive(tx.packet({ ...emptyInput(), skillEdge: true }), 0);
  assert.equal(rx.consume(10).skillEdge, false); assert.equal(rx.consume(40).skillEdge, true);
  for (let i = 0; i < 10; i++) rx.receive(tx.packet({ ...emptyInput(), mx: 1 }), 50);
  let ticks = 0; while (rx.queue.length > 2 && ticks < 20) { rx.consume(60 + ticks); ticks++; }
  assert.ok(ticks < 10, `backlog drained in ${ticks} ticks`); assert.ok(rx.stats.skipped > 0);
});
test('jittered/lossy link: guest own-pawn prediction matches the host exactly while walking (no corrections/snaps)', () => {
  const network = createMemoryTransport({ latency: 60, jitter: 25, loss: .02, seed: 4242 }), sessions = {};
  for (const uid of ['host', 'g']) {
    const transport = network.connect(uid, (from, data) => data.t === 'action' ? sessions[uid].action(data.action) : sessions[uid].rt(from, data));
    sessions[uid] = new CoopSession({ uid, host: 'host', players: ['host', 'g'], profile: { level: 1, weapon: 'blade', mods: {}, threats: { S2: 1 } }, config: { stageId: 'S2', seed: 1, threat: 1 }, ...transport });
  }
  let hostNext = 0, clean = false;
  for (let now = 0; now < 12000; now += 1000 / 60) {
    network.flush(now);
    while (hostNext <= now) { sessions.host.update(1000 / 30, emptyInput()); hostNext += 1000 / 30;
      if (sessions.host.world && !clean) { const w = sessions.host.world; w.entities = w.entities.filter(e => e.kind === 'player'); w.round.pending = []; w.round.goal = 'timer'; w.round.timerTicks = 1e6; clean = true; } }
    // Walk sideways (no body overlap with the host pawn: host-side separation is not predicted).
    const mx = now < 1000 ? 0 : Math.floor(now / 1500) % 2 ? -1 : 1;
    sessions.g.update(1000 / 60, { ...emptyInput(), mx, aimY: Math.floor(now / 2100) % 2 ? 1 : -1 });
    if (Math.abs(now - 1000) < 1000 / 120) Object.assign(sessions.g.prediction.stats, { corrections: 0, snaps: 0, totalDistance: 0, maxDistance: 0 });
  }
  const d = sessions.g.prediction.diagnostics();
  assert.equal(d.snaps, 0); assert.ok(d.maxDistance < 1, JSON.stringify({ ...d, queue: sessions.host.latches.g.stats }));
});
