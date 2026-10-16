import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWorld, addPlayer, startStage, emptyInput } from '../js/sim/world.js';
import { predictPlayerTick } from '../js/net/player-prediction.js';
import { LocalPrediction } from '../js/net/prediction.js';
import { fixtureSave } from './fixtures/multi-round.js';
import { buildRoundMods } from '../js/meta/run.js';
const traces = JSON.parse(readFileSync(new URL('./fixtures/ordinary-hit-traces.json', import.meta.url))).traces;
const T = 1000 / 30;
const packet = seq => ({ seq, v: [0, 0, 0, 0] });
export function fixture(trace, preview = 0) {
  const w = createWorld(); addPlayer(w, { pid: 'g', weapon: 'bow', mods: buildRoundMods(fixtureSave('guest', 'bow')) }); startStage(w, 'S2');
  const p = w.entities.find(e => e.pid === 'g'); Object.assign(p, trace.old, { lastInputSeq: 0 });
  w.tick = trace.tick - 2;
  const prediction = new LocalPrediction('g'); prediction.reconcile(w);
  for (let seq = 1; seq <= trace.pending; seq++) prediction.advance(packet(seq), emptyInput(), T);
  prediction.setPreview(emptyInput(), preview);
  const next = structuredClone(w); next.tick = trace.tick; Object.assign(next.entities.find(e => e.pid === 'g'), trace.authoritative);
  return { prediction, w, next };
}
const own = (p, w) => p.view(w).entities.find(e => e.pid === 'g');
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
for (const [i, trace] of traces.entries()) for (const preview of [0, T / 2]) {
  test(`observed hit ${i + 1}, ${trace.pending} pending, preview ${preview}: exact replay, continuous <=0.5px, converges by 100ms`, () => {
    const { prediction: p, w, next } = fixture(trace, preview), before = own(p, w), bytes = JSON.stringify(next);
    let expected = structuredClone(next.entities.find(e => e.pid === 'g'));
    const ctx = { arena: next.arena, others: next.entities.filter(e => e.pid !== 'g'), tick: next.tick };
    for (const row of p.pending) { expected = predictPlayerTick(expected, row.input, ctx); ctx.tick++; }
    p.reconcile(next);
    assert.deepEqual(p.state, expected, 'authority + pending replay exactly once, including impulse');
    assert.equal(JSON.stringify(next), bytes, 'authority immutable');
    assert.ok(distance(own(p, next), before) <= .5, `boundary jump ${distance(own(p, next), before)}`);
    assert.equal(own(p, next).hp, trace.authoritative.hp, 'damage immediate, not predicted/lerped');
    assert.equal(p.stats.snaps, 0);
    if (!preview) assert.ok(Math.abs(p.stats.lastCorrection.distance - trace.distance) < .01, 'reconstructed observed idle trace distance');
    assert.equal(p.diagnostics().lastCorrection.reason, 'authority-hit');
    // Normal follow-up snapshot mid-window must not restart the correction deadline.
    for (let j = 1; j <= 3; j++) {
      p.advance(packet(trace.pending + j), emptyInput(), T);
      if (j === 1) { const follow = structuredClone(next); follow.tick += 1; Object.assign(follow.entities.find(e => e.pid === 'g'), p.state, { lastInputSeq: trace.pending + j }); p.reconcile(follow); assert.ok(p.smoothLeft <= T + 1e-6, 'follow-up retains remaining deadline'); }
      if (j === 2) assert.ok(Math.hypot(p.offset.x, p.offset.y) <= .5, 'converges at two ticks');
    }
    assert.ok(Math.hypot(p.offset.x, p.offset.y) <= .5, 'finite convergence despite next snapshot');
    assert.equal(p.smoothLeft, 0);
  });
}
for (const [name, override, shift] of [
  ['normal-drift', { hp: traces[0].old.hp, hurtInvuln: 0, kx: 0, ky: 0 }, 30],
  ['gross', {}, 100], ['death', { dead: true, terminal: 'death' }, 0],
  ['channel', { channel: 10 }, 0], ['stagger', { staggerLeft: 4 }, 0]
]) test(`${name} does not borrow ordinary-hit continuity`, () => {
  const { prediction: p, next } = fixture(traces[0]); const a = next.entities.find(e => e.pid === 'g');
  Object.assign(a, override); a.x -= shift; p.reconcile(next);
  assert.equal(p.offset.x, 0); assert.equal(p.offset.y, 0); assert.equal(p.stats.snaps, 1);
  if (['death','channel','stagger'].includes(name)) { assert.equal(p.pending.length, 0); assert.equal(own(p, next).x, a.x); }
});
test('same authority cannot be reused as new hit; disable forgets evidence', () => {
  const { prediction: p, next } = fixture(traces[0]); p.reconcile(next);
  p.clearOffset(); p.state.x += 30; p.reconcile(next);
  assert.equal(p.stats.snaps, 1); assert.equal(p.offset.x, 0);
  const invalid = structuredClone(next); delete invalid.entities.find(e => e.pid === 'g').lastInputSeq; p.reconcile(invalid);
  p.reconcile(next); assert.equal(p.offset.x, 0);
});
test('terminal with active offset takes authority immediately even at subpixel distance', () => {
  const { prediction: p, next } = fixture(traces[0]); p.reconcile(next);
  const end = structuredClone(next), a = end.entities.find(e => e.pid === 'g'); end.tick++; a.dead = true; a.terminal = 'death';
  a.x = p.state.x + p.offset.x + .1; a.y = p.state.y + p.offset.y;
  p.reconcile(end); assert.equal(p.pending.length, 0); assert.equal(p.smoothLeft, 0); assert.equal(own(p, end).x, a.x);
});

test('two command ticks are the smallest whole-tick convergence keeping captured correction steps below 24px', () => {
  let maximum = 0;
  for (const trace of traces) for (const preview of [0, T / 2, T - .001]) {
    const { prediction: p, next } = fixture(trace, preview); p.reconcile(next);
    maximum = Math.max(maximum, p.stats.lastCorrection.distance);
    assert.ok(p.smoothLeft <= 2 * T, `selected window ${p.smoothLeft}`);
  }
  assert.ok(maximum > 24 && maximum / 2 < 24, `one tick ${maximum}; two ticks ${maximum / 2}`);
});

test('gross replay divergence cannot hide behind a prior render offset', () => {
  const { prediction: p, next } = fixture(traces[0]);
  // Legitimate prior small correction can oppose a subsequent gross hit divergence.
  p.offset = { x: -23, y: 0 }; p.smoothLeft = 150;
  const a = next.entities.find(e => e.pid === 'g'); a.x = p.state.x - 55; a.y = p.state.y; a.kx = 0; a.ky = 0;
  p.reconcile(next); assert.equal(p.stats.snaps, 1); assert.equal(p.offset.x, 0);
  assert.equal(p.stats.lastCorrection.reason, 'gross');
});
for (const evidence of ['HP','hurt','impulse']) test(`fresh authority ${evidence} evidence alone permits bounded continuity`, () => {
  const { prediction: p, next } = fixture(traces[0]); const a = next.entities.find(e => e.pid === 'g');
  a.hp = evidence === 'HP' ? a.hp : traces[0].old.hp;
  a.hurtInvuln = evidence === 'hurt' ? 7 : 0;
  if (evidence !== 'impulse') { a.kx = 0; a.ky = 0; a.x -= 20; }
  const before = own(p, next); p.reconcile(next);
  assert.equal(p.stats.snaps, 0); assert.equal(p.stats.lastCorrection.reason, 'authority-hit');
  assert.ok(distance(before, own(p, next)) <= .5);
});
test('ordinary decay of existing authority knockback/hurt is not new hit evidence', () => {
  const { prediction: p, next } = fixture(traces[0]); p.reconcile(next);
  p.advance(packet(20), emptyInput(), 100);
  const follow = structuredClone(next), a = follow.entities.find(e => e.pid === 'g'); follow.tick += 3;
  a.x = p.state.x - 30; a.y = p.state.y; a.kx = 0; a.ky = 0; a.hurtInvuln = 4; a.lastInputSeq = 20;
  p.reconcile(follow); assert.equal(p.stats.lastCorrection.reason, 'drift'); assert.equal(p.stats.snaps, 1);
});

test('leaving terminal state does not lerp a living pawn out of its old corpse', () => {
  const { prediction: p, next } = fixture(traces[0]); const dead = structuredClone(next), d = dead.entities.find(e => e.pid === 'g');
  d.dead = true; d.terminal = 'death'; p.reconcile(dead);
  const alive = structuredClone(next), a = alive.entities.find(e => e.pid === 'g'); alive.tick++;
  a.x = d.x + 10; a.y = d.y; a.kx = 0; a.ky = 0; a.hurtInvuln = 0;
  p.reconcile(alive); assert.equal(p.offset.x, 0); assert.equal(p.smoothLeft, 0); assert.equal(own(p, alive).x, a.x);
});

test('final round snapshot drops replay/offset even when the pawn itself is alive', () => {
  const { prediction: p, next } = fixture(traces[0], T / 2); next.round.state = 'success';
  const a = next.entities.find(e => e.pid === 'g'); p.reconcile(next);
  assert.equal(p.pending.length, 0); assert.equal(p.smoothLeft, 0); assert.equal(p.state.x, a.x);
  assert.equal(own(p, next).x, a.x); assert.equal(p.stats.lastCorrection.reason, 'terminal');
});
