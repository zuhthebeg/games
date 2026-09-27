const { test } = require('node:test');
const a = require('node:assert/strict');
const D = require('../js/data.js');
const S = require('../js/sim.js');
const N = require('../js/net.js');
const world = (wave = 10, rng = () => .5) => {
  const w = S.createWorld({ wave, players: { solo: { char: 'basic' } }, rng });
  w.spawnClock = -1000; w.bossSpawned = true; w.looterRolled = true;
  w.players.solo.cool = [100]; w.players.solo.immune = 999;
  return w;
};
const run = (w, seconds) => { for (let i = 0; i < seconds * 30; i++) S.step(w, 1 / 30); };
test('egg hatches two chargers after 6s unless broken', () => {
  const w = world(); const p = w.players.solo;
  S.spawn(w, 'egg', p.x + 400, p.y);
  run(w, 5.8);
  a.deepEqual(w.enemies.map(e => e.type), ['egg']);
  run(w, .4);
  a.deepEqual(w.enemies.map(e => e.type), ['charger', 'charger']);
});
test('looter never enters the normal pool, flees, escapes at 12s and drops a crate when killed', () => {
  const w = world(20, Math.random);
  for (let i = 0; i < 400; i++) S.step(w, 1 / 30);
  a.ok(!w.shots.some(s => s.type === 'looter') && !w.enemies.some(e => e.type === 'looter'));
  const w2 = world(); const p = w2.players.solo;
  const e = S.spawn(w2, 'looter', p.x + 200, p.y);
  const d0 = Math.hypot(e.x - p.x, e.y - p.y);
  run(w2, 1);
  a.ok(Math.hypot(e.x - p.x, e.y - p.y) > d0 + 50, 'looter should flee');
  a.equal(p.hp, p.maxHp, 'looter is harmless');
  run(w2, 11.2);
  a.equal(w2.enemies.length, 0, 'looter escapes');
  const w3 = world(); const q = w3.players.solo;
  const e3 = S.spawn(w3, 'looter', q.x + 100, q.y); e3.hp = 0; S.kill(w3, e3, 'solo');
  a.equal(w3.crates.length, 1);
  a.equal(w3.drops.length, D.enemies.looter.mats);
});
test('looter spawns at most once per wave from wave 3 and not before', () => {
  const early = S.createWorld({ wave: 2, players: { solo: { char: 'basic' } }, rng: () => .1 });
  early.spawnClock = -1e9; run(early, 8);
  a.ok(!early.enemies.some(e => e.type === 'looter'));
  const w = S.createWorld({ wave: 3, players: { solo: { char: 'basic' } }, rng: () => .1 });
  w.spawnClock = -1e9; w.players.solo.immune = 999; run(w, 8);
  a.equal(w.enemies.filter(e => e.type === 'looter').length, 1);
});
test('cheerleader speeds up nearby enemies and flags them in snapshots', () => {
  const w = world(); const p = w.players.solo;
  const near = S.spawn(w, 'blob', p.x + 500, p.y), far = S.spawn(w, 'blob', p.x, p.y + 500);
  S.spawn(w, 'buffer', p.x + 560, p.y);
  const n0 = near.x, f0 = far.y;
  S.step(w, 1 / 30);
  a.ok(Math.abs(n0 - near.x) > Math.abs(f0 - far.y) * 1.2, 'buffed blob moves faster');
  const snap = N.encode(w);
  if (snap) a.ok(snap.e.find(r => r[0] === near.id)[5] & 16);
});
