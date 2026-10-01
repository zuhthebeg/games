// v5(2026-10-01): 4인 렉 대응 멀티 보정·상한, 고추 총잡이, 흔들어 부활.
const test = require('node:test'), a = require('node:assert/strict');
const D = require('../js/data.js'), S = require('../js/sim.js');
const four = () => ({ a: { char: 'basic' }, b: { char: 'basic' }, c: { char: 'basic' }, d: { char: 'basic' } });

test('multi enemy cap is 150, solo stays 220', () => {
  const m = S.createWorld({ players: four(), rng: () => .5 });
  for (let i = 0; i < 300; i++) S.spawn(m, 'blob', 10, 10);
  a.equal(m.enemies.length, 150);
  const s = S.createWorld({ rng: () => .5 });
  for (let i = 0; i < 300; i++) S.spawn(s, 'blob', 10, 10);
  a.equal(s.enemies.length, 220);
});

test('4 players: fewer spawns per second than before but tougher enemies', () => {
  const k = D.curve;
  a.ok(1 + k.mpCount * 3 < 1 + 0.6 * 3, 'count multiplier lowered');
  const hp4 = S.enemyStats('blob', 1, 4).hp, hp1 = S.enemyStats('blob', 1, 1).hp;
  a.ok(Math.abs(hp4 / hp1 - 2.8) < 1e-9);
  a.ok(Math.abs(S.enemyStats('blob', 1, 4).dmg / S.enemyStats('blob', 1, 1).dmg - 1.6) < 1e-9);
});

test('gunner appears from wave 11, retreats inside 320 and fires a 3-shot spread', () => {
  a.equal(D.enemies.gunner.first, 11);
  const w = S.createWorld({ wave: 11, rng: () => .5 });
  w.spawnClock = -1e9;
  const p = w.players.solo, e = S.spawn(w, 'gunner', p.x + 200, p.y);
  e.clock = 2.79;
  const x0 = e.x;
  S.step(w, 1 / 30);
  a.ok(e.x > x0, 'moves away when closer than 320');
  a.equal(w.bullets.length, 3);
  const angles = w.bullets.map(b => Math.atan2(b.vy, b.vx)).sort((x, y) => x - y);
  a.ok(angles[2] - angles[0] > .4, 'spread');
});

test('ranged enemies get more weight late', () => {
  const share = wave => {
    let seed = 99;
    const w = S.createWorld({ wave, rng: () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32) });
    w.players.solo.x = -5000; // 스폰 위치 제약 해제
    let ranged = 0, n = 0;
    for (let i = 0; i < 600; i++) {
      w.shots.length = 0;
      S.spawnPack(w, 5);
      for (const s of w.shots) if (s.type !== 'elite') { n++; if (s.type === 'spitter' || s.type === 'gunner') ranged++; }
    }
    return ranged / n;
  };
  const early = share(10), late = share(20);
  a.ok(late > early * 1.5, `ranged share ${early.toFixed(3)} -> ${late.toFixed(3)}`);
});

test('shake revive: multi only, once per wave, 50% HP + 2s immune', () => {
  const w = S.createWorld({ players: { a: { char: 'basic' }, b: { char: 'basic' } }, rng: () => .5 });
  const p = w.players.a;
  p.alive = false; p.hp = 0;
  a.equal(S.shakeRevive(w, 'a'), true);
  a.equal(p.alive, true);
  a.equal(p.hp, p.maxHp * .5);
  a.equal(p.immune, 2);
  a.ok(w.fx.some(f => f[0] === 'rv' && f[1] === 'a'));
  p.alive = false;
  a.equal(S.shakeRevive(w, 'a'), false, 'second revive in the same wave is rejected');
  a.equal(S.shakeRevive(w, 'b'), false, 'living player cannot revive');
  const solo = S.createWorld({ rng: () => .5 });
  solo.players.solo.alive = false;
  a.equal(S.shakeRevive(solo, 'solo'), false, 'solo has no revive');
  const next = S.createWorld({ players: { a: { char: 'basic' }, b: { char: 'basic' } }, rng: () => .5 });
  next.players.a.alive = false;
  a.equal(S.shakeRevive(next, 'a'), true, 'resets next wave');
});

test('net: guest rv packet revives on host', () => {
  const N = require('../js/net.js');
  const host = new N.Session({ uid: 'a', host: 'a' });
  host.world = S.createWorld({ players: { a: { char: 'basic' }, b: { char: 'basic' } }, rng: () => .5 });
  host.world.players.b.alive = false;
  host.rt('b', { t: 'rv' });
  a.equal(host.world.players.b.alive, true);
  const sent = [];
  const guest = new N.Session({ uid: 'b', host: 'a', sendRt: d => sent.push(d) });
  guest.requestRevive();
  a.deepEqual(sent, [{ t: 'rv' }]);
});
