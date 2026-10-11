import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { movementTraces } from './fixtures/movement-trace.js';
import { createWorld, addPlayer, startStage, emptyInput } from '../js/sim/world.js';
import { SnapshotBuffer, encodeSnapshot } from '../js/net/protocol.js';
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
test('8-frame buffer selects surrounding pair not just oldest/newest; newest state/telegraphs win', () => {
  const b = new SnapshotBuffer('g', 125, { adaptive: false });
  for (let i = 0; i < 10; i++) { const p = frame(i * 3, i * 30); p.entities[0].hp = 100 - i; p.telegraphs = [{ id: i, phase: 'lock' }]; b.push(p, i * 100); }
  assert.equal(b.frames.length, 8);
  const v = b.sample(775); assert.equal(v.entities[0].x, 195); assert.equal(v.entities[0].hp, 91);
  assert.deepEqual(v.telegraphs, [{ id: 9, phase: 'lock' }]);
  assert.equal(b.sample(0).entities[0].x, 60);
});
test('adaptive delay starts at 125, responds slowly to arrival jitter within 100..200ms', () => {
  const b = new SnapshotBuffer('g'); assert.equal(b.delay, 125);
  let at = 0;
  for (let i = 0; i < 100; i++) { const previous = b.delay; b.push(frame(i * 3, i), at); at += i % 2 ? 170 : 30;
    assert.ok(b.delay >= 100 && b.delay <= 200); assert.ok(Math.abs(b.delay - previous) <= 3); }
  assert.ok(b.delay > 170);
});
test('extrapolation uses last velocity at most 60ms, then stops; first frame/stale safe', () => {
  const b = new SnapshotBuffer('g', 100, { adaptive: false });
  assert.equal(b.sample(0), null); b.push(frame(0, 100), 0); assert.equal(b.sample(1000).entities[0].x, 100);
  b.push(frame(3, 130), 100); assert.equal(b.sample(230).entities[0].x, 139);
  assert.equal(b.sample(260).entities[0].x, 148); assert.equal(b.sample(9999).entities[0].x, 148);
  assert.equal(b.push(frame(2, 1), 200), false);
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
test('correction below 24px converges in 100ms, exactly 24px snaps', () => {
  const p = new LocalPrediction('g'), b = new SnapshotBuffer('g'); b.push(frame(0, 300), 0); p.reconcile(b.frames[0].world);
  b.push(frame(1, 310), 33); p.reconcile(b.frames.at(-1).world); assert.equal(p.offset.x, -10); assert.equal(p.stats.snaps, 0);
  p.advance(tx(1, 0), emptyInput(), 50); assert.equal(p.offset.x, -5);
  p.advance(tx(2, 0), emptyInput(), 50); assert.equal(p.offset.x, 0);
  b.push(frame(2, 334, 2), 66); p.reconcile(b.frames.at(-1).world); assert.equal(p.stats.snaps, 1); assert.equal(p.offset.x, 0);
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
  sessions.g.update(34, emptyInput()); sessions.g.update(34, { ...emptyInput(), mx: 1 });
  sessions.host.broadcast(); // same tick ignored, inspect encoder directly for the real ack
  assert.equal(encodeSnapshot(sessions.host.world, sessions.host.appliedInputSeqs).entities[1].lastInputSeq, 0);
  const received = sessions.host.latches.g.seq; sessions.host.update(34, emptyInput());
  assert.equal(encodeSnapshot(sessions.host.world, sessions.host.appliedInputSeqs).entities[1].lastInputSeq, received);
});

test('input history remains bounded through missing host acks, then recovers on a new authoritative snapshot', () => {
  const p = new LocalPrediction('g'), b = new SnapshotBuffer('g'); b.push(frame(0, 300), 0); p.reconcile(b.frames[0].world);
  for (let i = 1; i < 270; i++) p.advance(tx(i), emptyInput(), 16);
  assert.equal(p.enabled, false); assert.equal(p.pending.length, 0);
  b.push(frame(1, 350, 269), 100); p.reconcile(b.frames.at(-1).world); assert.equal(p.enabled, true); assert.equal(p.state.x, 350);
});

test('seeded impaired 60/120ms transports improve latency and interpolation without normal-walk snaps or raising snapshot rate', async () => {
  const { latencyReport } = await import('../tools/net-latency.mjs');
  for (const { before, after } of latencyReport()) {
    assert.equal(after.inputLatencyMs.samples, 7); assert.ok(after.inputLatencyMs.max <= 1000 / 60 + 1e-8);
    assert.ok(before.inputLatencyMs.median > 150); assert.equal(after.correction.snaps, 0);
    assert.ok(after.remote.repeatRatio < before.remote.repeatRatio * .25);
    assert.ok(after.remote.jumpP95Px < before.remote.jumpP95Px);
    assert.equal(after.hostSnapshots, before.hostSnapshots); assert.ok(after.hostSnapshots / after.hostSeconds <= 12.01);
  }
});
