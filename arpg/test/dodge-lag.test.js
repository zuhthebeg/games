import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWorld, addPlayer, spawnMonster, startStage, step, emptyInput } from '../js/sim/world.js';
import { enableGuestDodgeLag, DODGE_LAG_CAP_TICKS } from '../js/sim/dodge-lag.js';
import { InputSender, InputQueue, encodeSnapshot, decodeSnapshot, SnapshotBuffer } from '../js/net/protocol.js';
import { predictPlayerTick } from '../js/net/player-prediction.js';
import { currentTelegraphs } from '../js/render/telegraph-time.js';
import { ABILITIES, PLAYER_BASE } from '../js/content/combat.js';
import { TICK_MS, ticks } from '../js/sim/core.js';
import { trace } from './fixtures/n3/trace.mjs';
import { dodgeLatency } from '../tools/dodge-latency.mjs';
const input = o => ({ ...emptyInput(), ...o });
function fixture(guest = true, mods = {}) {
  const w = createWorld(), p = addPlayer(w, { pid: 'guest', x: 400, y: 400, mods });
  const m = spawnMonster(w, 'goblin_grunt', 610, 400);
  m.spawnLeft = 0; m.staggerLeft = 9999; m.hp = m.maxHp = 10000;
  if (guest) enableGuestDodgeLag(w, p.pid);
  return { w, p, m };
}
function shot(f, friendly = false, counter = false) {
  const owner = friendly ? addPlayer(f.w, { pid: 'ally', weapon: 'bow', x: 850, y: 400 }) : f.m;
  f.w.projectiles.push({ id: f.w.nextId++, ownerId: owner.id, ownerKind: owner.kind,
    ownerType: owner.type || owner.weapon, team: owner.team, abilityId: 'sling_stone',
    x: f.p.x, y: f.p.y, vx: 0, vy: 0, r: 8, travelled: 0, range: 500, pierce: 0,
    hit: [], dmgMult: 1, poiseMult: 1, counter });
}
function delay(f, n = 2) { for (let i = 0; i < n; i++) step(f.w); }

test('single + registered guest/host full-world traces exactly equal fef289f (3 seeds x 900 ticks each)', () => {
  const before = JSON.parse(readFileSync(new URL('./fixtures/n3/baseline.json', import.meta.url)));
  assert.equal(trace(), before.single);
  assert.equal(trace(true, enableGuestDodgeLag), before.hostParty);
});
test('late guest dodge refunds direct damage, restores invulnerability and cancels spent/residual knock; ONE real counter', () => {
  const f = fixture(); shot(f); step(f.w); const lost = f.p.maxHp - f.p.hp;
  assert.ok(lost > 0); assert.ok(Math.abs(f.p.kx) > 0); delay(f);
  const events = step(f.w, { guest: input({ dodgeEdge: true, mx: 1, viewTick: 0 }) });
  assert.equal(f.p.hp, f.p.maxHp); assert.equal(f.p.hurtInvuln, 0); assert.equal(f.p.kx, 0);
  assert.ok(Math.abs(f.p.x - 425) < .05);
  assert.equal(f.p.dodge.startedTick, 0); assert.equal(f.p.dodge.iframeLeft, ticks(PLAYER_BASE.dodge.iframeMs) - 3);
  assert.equal(events.filter(e => e.type === 'perfectDodge').length, 1);
  assert.equal(events.find(e => e.type === 'dodgeRewind').heal, lost);
  assert.equal(f.p.pendingCounter.attackerId, f.m.id);
  let counter = 0, paid = 0;
  for (let i = 0; i < 50; i++) { const ev = step(f.w); counter += ev.filter(e => e.type === 'counter').length; paid += ev.filter(e => e.type === 'perfectDodge').length; }
  assert.equal(counter, 1); assert.equal(paid, 0);
});
for (const age of [DODGE_LAG_CAP_TICKS, DODGE_LAG_CAP_TICKS + 1, 12]) {
  test(`rewind cap boundary age ${age} ticks`, () => {
    const f = fixture(); shot(f); step(f.w); const hp = f.p.hp; delay(f, age - 1);
    const ev = step(f.w, { guest: input({ dodgeEdge: true, viewTick: 0, mx: 1 }) });
    assert.equal(ev.some(e => e.type === 'dodgeRewind'), age <= DODGE_LAG_CAP_TICKS);
    assert.equal(f.p.hp, age <= DODGE_LAG_CAP_TICKS ? f.p.maxHp : hp);
  });
}
for (const viewTick of [undefined, -1, 100, NaN, 0.5]) {
  test(`invalid/future viewTick ${viewTick} never rewinds`, () => {
    const f = fixture(); shot(f); step(f.w); const hp = f.p.hp;
    const ev = step(f.w, { guest: input({ dodgeEdge: true, viewTick, mx: 1 }) });
    assert.equal(f.p.hp, hp); assert.equal(ev.some(e => e.type === 'dodgeRewind'), false);
  });
}
test('late ordinary iframe contact refunded without perfect reward; pre-dodge contact stays paid', () => {
  const f = fixture(); delay(f, 6); shot(f); step(f.w);
  const ev = step(f.w, { guest: input({ dodgeEdge: true, viewTick: 0, mx: 1 }) });
  assert.equal(f.p.hp, f.p.maxHp); assert.ok(ev.some(e => e.type === 'dodgeRewind'));
  assert.equal(ev.some(e => e.type === 'perfectDodge'), false); assert.equal(f.p.pendingCounter, null);
  const old = fixture(); shot(old); step(old.w); delay(old);
  const hp = old.p.hp; step(old.w, { guest: input({ dodgeEdge: true, viewTick: 1, mx: 1 }) }); assert.equal(old.p.hp, hp);
});
for (const kind of ['friendly', 'counter', 'periodic', 'terminal', 'host']) {
  test(`${kind}: never refund or grant perfect/counter`, () => {
    const f = fixture(kind !== 'host');
    if (kind === 'periodic') f.p.poison = { left: 10, next: 1, interval: 30,
      hit: { periodic: true, srcId: f.m.id, srcKind: 'monster', srcType: f.m.type, abilityId: 'spider_puddle',
        mult: 1, def: { damage: 2 }, fromX: f.m.x, fromY: f.m.y } };
    else shot(f, kind === 'friendly', kind === 'counter');
    step(f.w); if (kind === 'terminal') { f.p.dead = true; f.p.terminal = 'death'; f.p.hp = 0; }
    const hp = f.p.hp;
    const ev = step(f.w, { guest: input({ dodgeEdge: true, viewTick: 0, mx: 1 }) });
    assert.equal(f.p.hp, hp); assert.equal(ev.some(e => ['dodgeRewind','perfectDodge','counter'].includes(e.type)), false);
  });
}
test('real lethal direct hit is terminal and cannot be resurrected', () => {
  const f = fixture(true, { maxHp: 1 }); shot(f); step(f.w);
  assert.equal(f.p.terminal, 'death'); assert.equal(f.p.hp, 0);
  const ev = step(f.w, { guest: input({ dodgeEdge: true, viewTick: 0 }) });
  assert.equal(f.p.hp, 0); assert.equal(f.p.terminal, 'death'); assert.equal(ev.some(e => e.type === 'dodgeRewind'), false);
});
test('a refunded contact does not refund separate periodic damage', () => {
  const f = fixture(); shot(f); step(f.w);
  f.p.poison = { left: 10, next: 1, interval: 30, hit: { periodic: true, srcId: f.m.id,
    abilityId: 'spider_puddle', mult: 1, def: { damage: 2 }, fromX: f.m.x, fromY: f.m.y } };
  step(f.w);
  step(f.w, { guest: input({ dodgeEdge: true, viewTick: 0, mx: 1 }) });
  assert.equal(f.p.hp, f.p.maxHp - 2);
});
test('timestamp sticks to its dodge edge through packet loss, reorder, duplicate and backlog draining', () => {
  const tx = new InputSender(), rx = new InputQueue();
  const one = tx.packet(input({ dodgeEdge: true, viewTick: 11 }));
  tx.packet(input({ viewTick: 12 }));
  const three = tx.packet(input({ viewTick: 13 }));
  assert.equal(rx.receive(three, 0), true); assert.equal(rx.receive(one, 0), false); assert.equal(rx.receive(three, 0), false);
  const ev = rx.consume(40); assert.equal(ev.dodgeEdge, true); assert.equal(ev.viewTick, 11);
  assert.equal(rx.consume(80).dodgeEdge, false); assert.equal(rx.consume(120).dodgeEdge, false);
  const backlog = new InputQueue(), backlogTx = new InputSender();
  for (let i = 0; i < 7; i++) backlog.receive(backlogTx.packet(input({ viewTick: 20 + i, dodgeEdge: i === 0 })), 0);
  const drained = backlog.consume(40); assert.equal(drained.dodgeEdge, true); assert.equal(drained.viewTick, 20);
});
test('prediction == registered guest step for aged dodge including buffered starts (snapshot shape unchanged)', () => {
  const f = fixture(); startStage(f.w, 'S2'); f.w.entities = [f.p]; f.w.round.pending = []; f.w.round.goal = 'timer'; f.w.round.timerTicks = 1e6;
  for (let t = 0; t < 180; t++) {
    const inp = input({ mx: .7, my: .2, attack: t % 20 < 8, dodgeEdge: t % 39 === 3, viewTick: Math.max(0, t - 3) });
    const snapshot = encodeSnapshot(f.w, { guest: 0 });
    assert.equal(JSON.stringify(snapshot).includes('viewTick'), false);
    const before = decodeSnapshot(snapshot, 'guest').entities[0];
    const predicted = predictPlayerTick(before, inp, { arena: f.w.arena, tick: f.w.tick });
    step(f.w, { guest: inp });
    assert.ok(Math.abs(predicted.x - f.p.x) < .0051); assert.ok(Math.abs(predicted.y - f.p.y) < .0051);
    assert.deepEqual(predicted.dodge, f.p.dodge); assert.equal(predicted.bufferDodge, f.p.bufferDodge);
    assert.equal(predicted.act?.phase, f.p.act?.phase);
  }
});
test('guest display advances known action phases without advancing positions or modifying snapshot; stale act ends', () => {
  const f = fixture(), def = ABILITIES.goblin_slash;
  f.m.staggerLeft = 0;
  f.m.act = { id: 'goblin_slash', def, phase: 'windup', elapsed: 14, total: ticks(def.windupMs) + ticks(def.lockMs), facing: Math.PI, ox: 610, oy: 400 };
  f.w.tick = 50; startStage(f.w, 'S2'); const b = new SnapshotBuffer('guest', 125, { adaptive: false });
  const packet = encodeSnapshot(f.w), original = JSON.stringify(packet); b.push(packet, 50 * TICK_MS + 80);
  const view = b.sample(50 * TICK_MS + 80, 160), monster = view.entities.find(e => e.id === f.m.id);
  assert.equal(monster.x, f.m.x); assert.equal(monster.act.phase, 'lock');
  assert.equal(view.viewTick, 52); assert.equal(JSON.stringify(packet), original);
  assert.equal(b.frames[0].world.entities.find(e => e.id === f.m.id).act.phase, 'windup');
  const ended = currentTelegraphs(decodeSnapshot(packet, 'guest'), 100);
  assert.equal(ended.entities.find(e => e.id === f.m.id).act, null); assert.equal(ended.telegraphs.length, 0);
});
for (const latency of [0,40,80,120]) {
  test(`loopback visible-perfect timing: one-way ${latency}ms jitter ±${latency ? 25 : 0}, 80 seeded trials`, () => {
    const result = dodgeLatency({ latency, jitter: latency ? 25 : 0 });
    assert.equal(result.attempted, 80); assert.equal(result.perfect, 80); assert.equal(result.counters, 80);
    if (latency === 120) assert.equal(result.refunds, 80);
  });
}
