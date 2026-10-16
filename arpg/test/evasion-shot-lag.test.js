import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, addPlayer, spawnMonster, startStage, step, emptyInput } from '../js/sim/world.js';
import { enableGuestDodgeLag } from '../js/sim/dodge-lag.js';
import { InputSender, InputQueue, encodeSnapshot, decodeSnapshot } from '../js/net/protocol.js';
import { predictPlayerTick } from '../js/net/player-prediction.js';
import { CoopSession } from '../js/net/session.js';
import { ABILITIES } from '../js/content/combat.js';
const input = o => ({ ...emptyInput(), ...o });
const keys = ['skillEdge', 'skill2Edge', 'skill3Edge'];
function fixture({ multi = true, guest = true, slot = 0 } = {}) {
  const w = createWorld({ multiplayerDodge: multi });
  const skills = [null, null, null]; skills[slot] = 'evasion_shot';
  const p = addPlayer(w, { pid: 'g', weapon: 'bow', x: 400, y: 400, mods: { skills, maxMp: 200, mpRegen: 0 } });
  startStage(w, 'S2'); w.round.pending = []; w.round.goal = 'timer'; w.round.timerTicks = 1e6;
  const m = spawnMonster(w, 'goblin_grunt', 610, 400); m.spawnLeft = 0; m.staggerLeft = 99999; m.hp = m.maxHp = 10000;
  if (guest) enableGuestDodgeLag(w, 'g');
  return { w, p, m };
}
function shot({ w, p, m }) {
  w.projectiles.push({ id: w.nextId++, ownerId: m.id, ownerKind: 'monster', ownerType: m.type, team: m.team,
    abilityId: 'sling_stone', x: p.x, y: p.y, vx: 0, vy: 0, r: 8, travelled: 0, range: 500, pierce: 0, hit: [], dmgMult: 1, poiseMult: 1 });
}
function advance(f, tick) { while (f.w.tick < tick) step(f.w); }
for (const [slot, edge] of keys.entries()) test(`delayed ${edge} evasion refunds real contact and pays once without a second dodge/cost`, () => {
  const f = fixture({ slot }); shot(f); step(f.w); assert.ok(f.p.hp < f.p.maxHp); advance(f, 3);
  const ev = step(f.w, { g: input({ [edge]: true, viewTick: 2, skillViewTicks: { [edge]: 0 }, mx: 1, aimX: 1 }) });
  assert.equal(f.p.hp, f.p.maxHp); assert.equal(f.p.dodge.startedTick, 0); assert.equal(f.p.dodge.iframeLeft, 9);
  assert.equal(ev.filter(e => e.type === 'dodgeRewind').length, 1);
  assert.equal(ev.filter(e => e.type === 'perfectDodge').length, 1);
  assert.equal(ev.filter(e => e.type === 'dodge').length, 1);
  assert.equal(ev.filter(e => e.type === 'projectile' && e.ability === 'evasion_shot').length, 1);
  assert.equal(f.p.mp, 200 - ABILITIES.evasion_shot.manaCost);
  const events = []; for (let t = 0; t < 40; t++) events.push(...step(f.w));
  assert.equal(events.filter(e => e.type === 'perfectDodge' || e.type === 'dodgeRewind').length, 0);
  assert.equal(events.filter(e => e.type === 'counter').length, 1);
  assert.equal(f.p.mp, 200 - ABILITIES.evasion_shot.manaCost);
});
for (const [age, viewTick, refund] of [[9, 0, true], [10, 0, false], [3, 4, false], [3, -1, false], [3, .5, false], [3, undefined, false]]) test(`evasion timestamp safety age ${age}, view ${viewTick}`, () => {
  const f = fixture(); advance(f, age - 1); shot(f); step(f.w); const hp = f.p.hp;
  const ev = step(f.w, { g: input({ skillEdge: true, viewTick: 0, skillViewTicks: { skillEdge: viewTick }, mx: 1, aimX: 1 }) });
  assert.equal(ev.some(e => e.type === 'dodgeRewind'), refund); assert.equal(f.p.hp, refund ? f.p.maxHp : hp);
  assert.equal(f.p.dodge.startedTick, refund ? viewTick : age);
});
for (const gate of ['disabled', 'mana', 'cooldown', 'unlearned', 'weapon', 'act']) test(`rejected ${gate} skill never rewinds damage or grants reward`, () => {
  const f = fixture(); shot(f); step(f.w); advance(f, 3); const hp = f.p.hp;
  if (gate === 'disabled') f.p.dodgeDisabled = true;
  if (gate === 'mana') f.p.mp = 0;
  if (gate === 'cooldown') f.p.cds.evasion_shot = 10;
  if (gate === 'unlearned') f.p.skills = [];
  if (gate === 'weapon') f.p.weapon = 'blade';
  if (gate === 'act') f.p.act = { id: 'bow_shot', def: { cancelInto: [] }, phase: 'lock', left: 100, elapsed: 0, phaseTicks: {}, facing: 0 };
  const ev = step(f.w, { g: input({ skillEdge: true, viewTick: 0, mx: 1, aimX: 1 }) });
  assert.equal(f.p.hp, hp); assert.equal(ev.some(e => ['dodgeRewind', 'perfectDodge', 'dodge'].includes(e.type)), false);
});
for (const multi of [false, true]) test(`aged evasion prediction agrees with registered guest host, multi=${multi}`, () => {
  const f = fixture({ multi }); f.w.entities = [f.p]; advance(f, 3);
  let predicted = decodeSnapshot(encodeSnapshot(f.w), 'g').entities[0];
  for (let i = 0; i < 35; i++) {
    const inp = input(i ? {} : { skillEdge: true, viewTick: 2, skillViewTicks: { skillEdge: 0 }, mx: 1, aimX: 1 });
    predicted = predictPlayerTick(predicted, inp, { arena: f.w.arena, tick: f.w.tick, multiplayerDodge: multi }); step(f.w, { g: inp });
    if (!i) assert.equal(predicted.dodge.startedTick, 0);
    assert.deepEqual(predicted.dodge, f.p.dodge); assert.equal(predicted.mp, f.p.mp); assert.deepEqual(predicted.cds, f.p.cds);
    assert.ok(Math.abs(predicted.x - f.p.x) < .006); assert.equal(predicted.act?.phase, f.p.act?.phase);
  }
});
for (const edge of keys) test(`${edge} timestamps survive packet loss, reorder, duplicate and backlog`, () => {
  const tx = new InputSender(), rx = new InputQueue();
  const first = tx.packet(input({ [edge]: true, viewTick: 21, skillViewTicks: { [edge]: 11 } }));
  tx.packet(input({ viewTick: 22 })); const third = tx.packet(input({ viewTick: 23 }));
  assert.equal(rx.receive(third, 0), true); assert.equal(rx.receive(first, 0), false); assert.equal(rx.receive(third, 0), false);
  const ev = rx.consume(40); assert.equal(ev[edge], true); assert.equal(ev.skillViewTicks?.[edge], 11); assert.equal(ev.dodgeEdge, false);
  assert.equal(rx.consume(80)[edge], false); assert.equal(rx.consume(120)[edge], false);
  const backlog = new InputQueue(), sender = new InputSender();
  for (let i = 0; i < 7; i++) backlog.receive(sender.packet(input({ viewTick: 30 + i, [edge]: i < 2 })), 0);
  assert.equal(backlog.consume(40).skillViewTicks?.[edge], 30); assert.equal(backlog.consume(80).skillViewTicks?.[edge], 31);
});
test('concurrent skill and dodge edges keep separate timestamps through queue', () => {
  const tx = new InputSender(), rx = new InputQueue();
  rx.receive(tx.packet(input({ skillEdge: true, skill2Edge: true, dodgeEdge: true, viewTick: 17, skillViewTicks: { skillEdge: 11, skill2Edge: 13 } })), 0);
  const ev = rx.consume(40); assert.equal(ev.viewTick, 17); assert.deepEqual(ev.skillViewTicks, { skillEdge: 11, skill2Edge: 13 });
});
test('guest frame merging preserves each actual skill press view tick, not newest render tick', () => {
  const sent = [], profile = { weapon: 'bow', mods: { skills: ['evasion_shot'] } };
  const s = new CoopSession({ uid: 'g', host: 'h', players: ['h', 'g'], profile, config: { stageId: 'S2', threat: 1 }, sendRt: p => sent.push(p) });
  s.phase = 'running'; s.renderTick = 10; s.update(10, input({ skillEdge: true }));
  s.renderTick = 12; s.update(10, input({ skill2Edge: true }));
  s.renderTick = 14; s.update(14, input({}));
  const packet = sent.find(p => p.t === 'input'); assert.ok(packet);
  const rx = new InputQueue(); rx.receive(packet, 0); const ev = rx.consume(40);
  assert.equal(ev.skillViewTicks?.skillEdge, 10); assert.equal(ev.skillViewTicks?.skill2Edge, 12);
});
test('missing per-edge history never substitutes a newer movement timestamp', () => {
  const rx = new InputQueue();
  rx.receive({ t: 'input', seq: 1, v: [1, 0, 1, 0], edges: { skillEdge: 1 }, viewTick: 2, skillViews: { skillEdge: [] } }, 0);
  const inp = rx.consume(40); assert.equal(inp.skillEdge, true); assert.equal(inp.skillViewTicks.skillEdge, undefined);
  const f = fixture(); shot(f); step(f.w); advance(f, 3); const hp = f.p.hp;
  const ev = step(f.w, { g: inp }); assert.equal(f.p.hp, hp); assert.equal(ev.some(e => e.type === 'dodgeRewind'), false);
});
test('legacy single skill edge timestamp remains usable; ambiguous counter jumps are bounded and untimed', () => {
  const legacy = new InputQueue();
  legacy.receive({ t: 'input', seq: 1, v: [1, 0, 1, 0], edges: { skillEdge: 1 }, viewTick: 0 }, 0);
  assert.equal(legacy.consume(40).skillViewTicks.skillEdge, 0);
  const rx = new InputQueue();
  rx.receive({ t: 'input', seq: 1, v: [0, 0, 1, 0], edges: { skillEdge: 1000000 }, viewTick: 0 }, 0);
  const inp = rx.consume(40); assert.equal(inp.skillViewTicks.skillEdge, undefined); assert.equal(rx.pending.skillEdge, 29);
});
test('queue delivers delayed skill edge to real host once: original tick, refund and single host projectile', () => {
  const f = fixture(); shot(f); step(f.w); advance(f, 3);
  const tx = new InputSender(), rx = new InputQueue();
  tx.packet(input({ skillEdge: true, viewTick: 0, mx: 1, aimX: 1 }));
  tx.packet(input({ viewTick: 1, mx: 1, aimX: 1 }));
  rx.receive(tx.packet(input({ viewTick: 2, mx: 1, aimX: 1 })), 0);
  const events = [...step(f.w, { g: rx.consume(40) })];
  assert.equal(f.p.hp, f.p.maxHp); assert.equal(f.p.dodge.startedTick, 0);
  for (let i = 0; i < 6; i++) events.push(...step(f.w, { g: rx.consume(80 + i * 40) }));
  assert.equal(events.filter(e => e.type === 'perfectDodge').length, 1);
  assert.equal(events.filter(e => e.type === 'dodgeRewind').length, 1);
  assert.equal(events.filter(e => e.type === 'dodge').length, 1);
  assert.equal(events.filter(e => e.type === 'projectile' && e.ability === 'evasion_shot').length, 1);
  assert.equal(f.p.mp, 200 - ABILITIES.evasion_shot.manaCost);
});
for (const multi of [false, true]) test(`unregistered host/solo does not rewind a supplied historical skill timestamp, multi=${multi}`, () => {
  const f = fixture({ multi, guest: false }); shot(f); step(f.w); advance(f, 3); const hp = f.p.hp;
  const ev = step(f.w, { g: input({ skillEdge: true, viewTick: 0, mx: 1, aimX: 1 }) });
  assert.equal(f.p.hp, hp); assert.equal(f.p.dodge.startedTick, 3); assert.equal(f.p.dodge.iframeLeft, multi ? 12 : 7);
  assert.equal(ev.some(e => e.type === 'perfectDodge' || e.type === 'dodgeRewind'), false);
});
