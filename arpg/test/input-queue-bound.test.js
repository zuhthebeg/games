import test from 'node:test';
import assert from 'node:assert/strict';
import { EDGES, TIMED_SKILL_EDGES, InputQueue, InputLatch, InputSender } from '../js/net/protocol.js';
import { CoopSession } from '../js/net/session.js';
import { emptyInput, step, spawnMonster } from '../js/sim/world.js';
import { ABILITIES } from '../js/content/combat.js';
const CAP = 30;
const packet = (seq, n, extra = {}) => ({ t: 'input', seq, v: [1, 0, 1, 0],
  attack: true, autoAttack: true, edges: Object.fromEntries(EDGES.map(k => [k, n])), viewTick: seq, ...extra });
const ticks = (n, count = CAP) => Array.from({ length: count }, (_, i) => [n - count + i + 1, n - count + i + 1]);
const timedPacket = (seq, n) => packet(seq, n, { dodgeViews: ticks(n),
  skillViews: Object.fromEntries(TIMED_SKILL_EDGES.map((k, i) => [k, ticks(n).map(([id, tick]) => [id, tick + 100000 * (i + 1)])])) });
function assertBounded(rx) {
  for (const k of EDGES) assert.ok(rx.pending[k] >= 0 && rx.pending[k] <= CAP, `${k} pending=${rx.pending[k]}`);
  if (rx instanceof InputQueue) {
    assert.equal(rx.dodgeViews.length, rx.pending.dodgeEdge);
    for (const k of TIMED_SKILL_EDGES) assert.equal(rx.skillViews[k].length, rx.pending[k]);
  }
}
for (const Receiver of [InputQueue, InputLatch]) {
  test(`${Receiver.name}: sustained counter jumps bound TOTAL pending, not just each delta`, () => {
    const rx = new Receiver();
    for (let i = 1; i <= 1000; i++) {
      assert.equal(rx.receive(timedPacket(i, i * CAP), i * 34), true);
      rx.consume(i * 34 + 34); assertBounded(rx);
    }
    assert.deepEqual(Object.values(rx.pending), EDGES.map(() => 29));
    assert.deepEqual(Object.values(rx.seen), EDGES.map(() => 30000));
  });
  test(`${Receiver.name}: enormous jumps drain at most 30 without repayment from duplicates/stale counters`, () => {
    const rx = new Receiver(), n = Number.MAX_SAFE_INTEGER;
    rx.receive(packet(1, n), 0);
    const emitted = Object.fromEntries(EDGES.map(k => [k, 0]));
    for (let i = 0; i < 80; i++) {
      const input = rx.consume(1100 + i); assertBounded(rx);
      for (const k of EDGES) emitted[k] += +input[k];
      assert.equal(input.mx, 0); assert.equal(input.attack, false); assert.equal(input.autoAttack, false);
    }
    assert.deepEqual(Object.values(emitted), EDGES.map(() => CAP));
    assert.equal(rx.receive(packet(1, n), 1300), false);
    rx.receive(packet(2, n - 1, { prev: [[1, [1, 0, 1, 0], { edges: { dodgeEdge: n }, viewTick: 0 }]] }), 1300);
    rx.receive(packet(3, n), 1300);
    for (let i = 0; i < 40; i++) for (const k of EDGES) assert.equal(rx.consume(2400 + i)[k], false);
  });
  test(`${Receiver.name}: invalid counters never create edges; next valid press still works`, () => {
    const rx = new Receiver(); let seq = 0;
    for (const n of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '30', undefined]) {
      rx.receive(packet(++seq, n), seq * 34);
      const input = rx.consume(seq * 34 + 34);
      for (const k of EDGES) assert.equal(input[k], false);
      assertBounded(rx);
    }
    rx.receive(packet(++seq, 1), seq * 34);
    const input = rx.consume(seq * 34 + 34);
    for (const k of EDGES) assert.equal(input[k], true);
    assert.equal(input.mx, 1); assert.equal(input.attack, true); assert.equal(input.autoAttack, true);
  });
  test(`${Receiver.name}: normal presses survive loss/reorder once without manufacturing edges`, () => {
    const tx = new InputSender(), rx = new Receiver();
    const p1 = tx.packet({ ...emptyInput(), dodgeEdge: true, skill2Edge: true, viewTick: 10 });
    tx.packet({ ...emptyInput(), dodgeEdge: true, skillEdge: true, viewTick: 11 });
    const p3 = tx.packet({ ...emptyInput(), dodgeEdge: true, skill3Edge: true, viewTick: 12, mx: 1, attack: true });
    rx.receive(p3, 0); assert.equal(rx.receive(p1), false); assert.equal(rx.receive(p3), false);
    const observed = [];
    for (let i = 0; i < 40; i++) observed.push(rx.consume(1100 + i));
    assert.equal(observed.filter(v => v.dodgeEdge).length, 3);
    for (const k of TIMED_SKILL_EDGES) assert.equal(observed.filter(v => v[k]).length, 1);
    for (const k of ['potionEdge', 'manaEdge', 'scrollEdge']) assert.equal(observed.some(v => v[k]), false);
    if (rx instanceof InputQueue) assert.deepEqual(observed.slice(0, 3).map(v => v.viewTick), [10, 11, 12]);
  });
}
test('overflow retains newest presses and EXACT matching per-edge timestamps, without resurrection through prev', () => {
  const rx = new InputQueue();
  rx.receive(timedPacket(1, 30), 0);
  assert.equal(rx.consume(40).viewTick, 1); // 29 older presses remain.
  rx.receive(timedPacket(2, 60), 50);
  let input = rx.consume(90);
  for (let id = 31; id <= 60; id++) {
    if (id > 31) input = rx.consume(1100 + id);
    assert.equal(input.dodgeEdge, true); assert.equal(input.viewTick, id);
    for (const [i, k] of TIMED_SKILL_EDGES.entries()) {
      assert.equal(input[k], true); assert.equal(input.skillViewTicks[k], id + 100000 * (i + 1));
    }
    assertBounded(rx);
  }
  rx.receive(packet(3, 60, { prev: [[1, [1, 0, 1, 0], { edges: packet(1, 30).edges, viewTick: 1 }]] }), 1200);
  for (let i = 0; i < 40; i++) for (const k of EDGES) assert.equal(rx.consume(2300 + i)[k], false);
});
test('legacy timestamps remain only for unambiguous presses, including after overflow', () => {
  const rx = new InputQueue();
  rx.receive(packet(1, 1000), 0); const first = rx.consume(40);
  assert.equal(first.viewTick, undefined);
  for (const k of TIMED_SKILL_EDGES) assert.equal(first.skillViewTicks[k], undefined);
  for (let i = 0; i < 30; i++) rx.consume(1100 + i);
  rx.receive(packet(2, 1001, { viewTick: 7 }), 1200); const next = rx.consume(1240);
  assert.equal(next.viewTick, 7);
  for (const k of TIMED_SKILL_EDGES) assert.equal(next.skillViewTicks[k], 7);
});
test('real CoopSession overflow delivers newest evasion press with original tick, one refund and one shot', () => {
  const profile = { combatVersion:4, level: 1, weapon: 'bow', mods: { skills: ['evasion_shot'], maxMp: 200, mpRegen: 0 } };
  const events = [];
  const s = new CoopSession({ onFrame: (_, ev) => events.push(...ev), uid: 'h', host: 'h', players: ['h', 'g'], profile, config: { stageId: 'S2', threat: 1 } });
  s.begin({ config: s.config, seed: 1, profiles: { h: profile, g: profile } });
  const w = s.world, p = w.entities.find(e => e.pid === 'g');
  w.round.pending = []; w.round.goal = 'timer'; w.round.timerTicks = 1e6;
  const m = spawnMonster(w, 'goblin_grunt', 610, 400); m.spawnLeft = 0; m.staggerLeft = 99999; m.hp = m.maxHp = 10000;
  w.projectiles.push({ id: w.nextId++, ownerId: m.id, ownerKind: 'monster', ownerType: m.type, team: m.team,
    abilityId: 'sling_stone', x: p.x, y: p.y, vx: 0, vy: 0, r: 8, travelled: 0, range: 500, pierce: 0, hit: [], dmgMult: 1, poiseMult: 1 });
  step(w); assert.ok(p.hp < p.maxHp); while (w.tick < 3) step(w);
  // Saturate only the actual evasion edge; the newest 30 all identify view tick zero.
  for (let seq = 1; seq <= 100; seq++) {
    s.rt('g', packet(seq, 0, { edges: { skillEdge: seq * CAP }, viewTick: 2,
      skillViews: { skillEdge: ticks(seq * CAP).map(([id]) => [id, 0]) } }), 0);
    s.latches.g.consume(40);
  }
  assertBounded(s.latches.g);
  s.now = 1100; s.update(34, emptyInput());
  assert.equal(p.hp, p.maxHp); assert.equal(p.dodge.startedTick, 0);
  for (let i = 0; i < 40; i++) s.update(34, emptyInput());
  for (const type of ['dodgeRewind', 'perfectDodge', 'dodge']) assert.equal(events.filter(e => e.type === type).length, 1);
  assert.equal(events.filter(e => e.type === 'projectile' && e.ability === 'evasion_shot').length, 1);
  assert.equal(p.mp, 200 - ABILITIES.evasion_shot.manaCost);
});

test('partial overflow drops only oldest entries and leaves retained/new timestamp identities intact', () => {
  const rx = new InputQueue();
  rx.apply(timedPacket(1, 30)); assertBounded(rx);
  rx.apply(timedPacket(2, 32)); assertBounded(rx);
  for (let id = 3; id <= 32; id++) {
    const input = rx.consume(1100);
    assert.equal(input.viewTick, id);
    for (const [i, k] of TIMED_SKILL_EDGES.entries()) assert.equal(input.skillViewTicks[k], id + 100000 * (i + 1));
  }
  for (const k of EDGES) assert.equal(rx.consume(1100)[k], false);
});
for (const Receiver of [InputQueue, InputLatch]) test(`${Receiver.name}: sustained huge jumps remain bounded and equal high counters never add presses`, () => {
  const rx = new Receiver();
  for (let i = 1; i <= 1000; i++) {
    rx.receive(packet(i, i * 1000000000), i * 34); rx.consume(i * 34 + 34); assertBounded(rx);
  }
  // Repeat a safe-integer ceiling while pending: no floating-point counter repayment.
  rx.receive(packet(1001, Number.MAX_SAFE_INTEGER), 35000); rx.consume(35034);
  for (let i = 1002; i < 1035; i++) {
    rx.receive(packet(i, Number.MAX_SAFE_INTEGER), i * 35); rx.consume(i * 35 + 35); assertBounded(rx);
  }
  for (const k of EDGES) assert.equal(rx.pending[k], 0);
});
