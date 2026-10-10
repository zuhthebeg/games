import { preset } from '../tools/balance/botsim.mjs';
import { buildRoundMods } from '../js/meta/run.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { shapeHitsCircle, ticks } from '../js/sim/core.js';
import { createWorld, addPlayer, spawnMonster, startStage, step, emptyInput, getTelegraphs } from '../js/sim/world.js';
import { ABILITIES } from '../js/content/combat.js';

const input = (o = {}) => ({ ...emptyInput(), ...o });
const run = (world, n, fn = () => ({})) => {
  const evs = [];
  for (let i = 0; i < n; i++) evs.push(...step(world, fn(world, i)));
  return evs;
};
const monster = (w) => w.entities.find((e) => e.kind === 'monster');

test('shape tests', () => {
  const cone = { type: 'cone', range: 100, arc: 90 };
  assert.ok(shapeHitsCircle(cone, 0, 0, 0, 80, 0, 10));
  assert.ok(!shapeHitsCircle(cone, 0, 0, 0, -50, 0, 10));
  assert.ok(!shapeHitsCircle(cone, 0, 0, 0, 0, 80, 5));
  const rect = { type: 'rect', length: 200, width: 40, offset: 0 };
  assert.ok(shapeHitsCircle(rect, 0, 0, Math.PI / 2, 0, 150, 5));
  assert.ok(!shapeHitsCircle(rect, 0, 0, Math.PI / 2, 60, 150, 5));
  assert.ok(shapeHitsCircle({ type: 'circle', radius: 50, offset: 0 }, 0, 0, 1, 55, 0, 10));
});

function goblinMidAttack(seed = 3) {
  const w = createWorld({ seed });
  const p = addPlayer(w, { pid: 'a', x: 400, y: 400 });
  const g = spawnMonster(w, 'goblin_grunt', 460, 400);
  g.spawnLeft = 0;
  g.thinkLeft = 0;
  g.cds.goblin_hop = 999;
  step(w, { a: input() });
  assert.equal(g.act?.id, 'goblin_slash');
  return { w, p, g };
}

test('telegraph uses the exact hit shape and lock freezes facing', () => {
  const { w, p, g } = goblinMidAttack();
  const def = ABILITIES.goblin_slash;
  run(w, ticks(def.windupMs) + 1, () => ({ a: input() }));
  assert.equal(g.act.phase, 'lock');
  const tg = getTelegraphs(w).find((t) => t.id === g.id);
  assert.equal(tg.shape, def.shape);
  const lockedFacing = g.act.facing;
  // player circles behind the goblin during lock: facing must not follow
  p.x = 520; p.y = 460;
  run(w, ticks(def.lockMs) - 1, () => ({ a: input() }));
  assert.equal(g.act.facing, lockedFacing);
});

test('standing in the locked cone takes damage, stepping out does not', () => {
  const a = goblinMidAttack();
  const hpA = a.p.hp;
  run(a.w, 40, () => ({ a: input() }));
  assert.ok(a.p.hp < hpA, 'player inside telegraph should be hit');

  const b = goblinMidAttack();
  const hpB = b.p.hp;
  run(b.w, ticks(ABILITIES.goblin_slash.windupMs) + 1, () => ({ a: input() }));
  b.p.x = 200; // leave the shape before active
  run(b.w, 12, () => ({ a: input() }));
  assert.equal(b.p.hp, hpB);
});

test('dodge i-frames negate the hit; a fresh dodge counts as perfect', () => {
  const { w, p } = goblinMidAttack();
  const def = ABILITIES.goblin_slash;
  const hp = p.hp;
  run(w, ticks(def.windupMs) + ticks(def.lockMs) - 1, () => ({ a: input() }));
  assert.equal(p.hp, hp);
  // standing still inside the cone, i-frames active as the strike lands
  p.dodge.iframeLeft = 5;
  p.dodge.startedTick = w.tick - 1;
  const evs = run(w, 3, () => ({ a: input() }));
  assert.equal(p.hp, hp);
  assert.ok(evs.some((e) => e.type === 'perfectDodge'));

  const late = goblinMidAttack();
  run(late.w, ticks(def.windupMs) + ticks(def.lockMs) - 1, () => ({ a: input() }));
  late.p.dodge.iframeLeft = 5;
  late.p.dodge.startedTick = late.w.tick - 6;
  const evs2 = run(late.w, 3, () => ({ a: input() }));
  assert.ok(evs2.some((e) => e.type === 'miss'));
});

test('dodge input is buffered through a non-cancelable active phase', () => {
  const w = createWorld({ seed: 1 });
  const p = addPlayer(w, { pid: 'a', x: 300, y: 300 });
  step(w, { a: input({ attack: true }) });
  while (p.act.phase !== 'active') step(w, { a: input() });
  step(w, { a: input({ dodgeEdge: true }) });
  assert.equal(p.dodge.dashLeft, 0, 'cannot dodge during active');
  const evs = run(w, 4, () => ({ a: input() }));
  assert.ok(evs.some((e) => e.type === 'dodge'), 'buffered dodge fires when recovery starts');
});

test('deterministic: same seed + same inputs => identical world', () => {
  const play = () => {
    const w = createWorld({ seed: 42 });
    addPlayer(w, { pid: 'a', weapon: 'bow' });
    startStage(w, 'S2');
    run(w, 900, (_w, i) => ({ a: input({ attack: i % 50 < 30, mx: Math.sin(i / 20), my: Math.cos(i / 31), dodgeEdge: i % 97 === 0, skillEdge: i % 160 === 0 }) }));
    return JSON.stringify(w, (k, v) => (k === 'def' ? undefined : v));
  };
  assert.equal(play(), play());
});

test('stagger interrupts a windup and frees the major-attack token', () => {
  const w = createWorld({ seed: 5 });
  addPlayer(w, { pid: 'a', x: 300, y: 400 });
  const c = spawnMonster(w, 'goblin_chief', 520, 400);
  c.spawnLeft = 0; c.thinkLeft = 0;
  c.cds.chief_cleave = 999; c.cds.chief_slam = 999;
  step(w, { a: input() });
  assert.equal(c.act?.id, 'chief_charge');
  assert.equal(w.majorBusyBy, c.id);
  c.poise = 1;
  const p = w.entities.find((e) => e.kind === 'player');
  p.x = 450; // in range for a slash
  const evs = run(w, 10, () => ({ a: input({ attack: true }) }));
  assert.ok(evs.some((e) => e.type === 'stagger'));
  assert.equal(c.act, null);
  assert.equal(w.majorBusyBy, 0);
});

test('return scroll: hit breaks the channel without consuming the scroll', () => {
  const { w, p } = goblinMidAttack();
  step(w, { a: input({ scrollEdge: true }) });
  assert.ok(p.channel > 0);
  const evs = run(w, 40, () => ({ a: input() }));
  assert.ok(evs.some((e) => e.type === 'channelBroken'));
  assert.equal(p.scrolls, 1);
  assert.ok(p.scrollRetry >= 0);
  assert.equal(p.terminal, null);
});

test('return scroll completes after 2s when undisturbed', () => {
  const w = createWorld({ seed: 2 });
  const p = addPlayer(w, { pid: 'a' });
  startStage(w, 'S1');
  step(w, { a: input({ scrollEdge: true }) });
  run(w, ticks(2000) + 2, () => ({ a: input() }));
  assert.equal(p.terminal, 'return_scroll');
  assert.equal(p.scrolls, 0);
  assert.equal(w.round.state, 'returned');
});

test('S1: scarecrow takes hits but never dies; clears on the 30s timer', () => {
  const w = createWorld({ seed: 9 });
  addPlayer(w, { pid: 'a', x: 760, y: 430 });
  startStage(w, 'S1');
  const evs = run(w, ticks(30000) + 2, () => ({ a: input({ attack: true }) }));
  const sc = monster(w);
  assert.ok(evs.filter((e) => e.type === 'hit' && e.dst === sc.id).length > 20);
  assert.equal(sc.dead, false);
  assert.equal(w.round.state, 'clear');
});

// A crude bot: approach nearest monster, attack, dodge away from a locked telegraph that covers us.
function bot(world) {
  const p = world.entities.find((e) => e.kind === 'player');
  if (!p || p.terminal) return {};
  const tgs = getTelegraphs(world);
  const danger = tgs.find((t) => (t.phase === 'lock' || t.progress > 0.7) && shapeCovers(t, p));
  const ms = world.entities.filter((e) => e.kind === 'monster' && !e.dead && !(e.spawnLeft > 0));
  ms.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
  const m = ms[0];
  if (!m) return { a: input() };
  const dx = m.x - p.x, dy = m.y - p.y, d = Math.hypot(dx, dy) || 1;
  if (danger) {
    const ax = -Math.sin(danger.facing), ay = Math.cos(danger.facing);
    return { a: input({ mx: ax, my: ay, dodgeEdge: true }) };
  }
  const want = 70;
  const mv = d > want ? 1 : 0;
  return { a: input({ mx: (dx / d) * mv, my: (dy / d) * mv, attack: d < 110, potionEdge: p.hp < p.maxHp * 0.4 }) };
}
function shapeCovers(t, p) { return shapeHitsCircle(t.shape, t.ox, t.oy, t.facing, p.x, p.y, p.r + 12); }

test('S2 is clearable with valid overgeared blade by a simple dodging bot and idling dies', () => {
  const w = createWorld({ seed: 11 });
  addPlayer(w, { pid: 'a', mods:buildRoundMods(preset('S2',{level:12,rarity:'epic',enhance:5,stats:'agile'})) });
  startStage(w, 'S2');
  run(w, ticks(600000), (ww) => (ww.round.state === 'running' ? bot(ww) : {}));
  assert.equal(w.round.state, 'clear', `bot failed S2 (hp ${w.entities[0].hp})`);

  const idle = createWorld({ seed: 11 });
  addPlayer(idle, { pid: 'a', mods:buildRoundMods(preset('S2',{level:12,rarity:'epic',enhance:5,stats:'agile'})) });
  startStage(idle, 'S2');
  run(idle, ticks(600000), () => ({ a: input() }));
  assert.equal(idle.round.state, 'failed');
  assert.ok(idle.entities[0].deathCause?.ability, 'death records the pattern that killed (design §7.2)');
});

test('weight tiers and stat mods reach the sim', async () => {
  const { loadEffects, setLoad } = await import('../js/sim/world.js');
  assert.deepEqual(loadEffects(0.5), { speed: 1, dodgeCd: 1 });
  assert.equal(loadEffects(0.9).dodgeCd, 1.15);
  assert.equal(loadEffects(1.2).speed, 0.75);
  const w = createWorld({ seed: 1 });
  const p = addPlayer(w, { pid: 'a', mods: { manaPotions: 1, dodgeCdMult: 0.8 } });
  setLoad(w, 'a', 1.1);
  p.mp = 10;
  const evs = run(w, 1, () => ({ a: input({ manaEdge: true }) }));
  assert.ok(evs.some((e) => e.type === 'manaPotion'));
  assert.equal(p.manaPotions, 0);
  step(w, { a: input({ dodgeEdge: true }) });
  assert.equal(p.dodge.cdLeft, ticks(1150 * 0.8 * 1.3));
});
