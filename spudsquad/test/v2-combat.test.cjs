const { test } = require('node:test');
const a = require('node:assert/strict');
const D = require('../js/data.js');
const S = require('../js/sim.js');
const world = (char = 'basic') => {
  const w = S.createWorld({ players: { solo: { char } }, rng: () => .99 });
  w.spawnClock = -1000;
  return w;
};
const enemy = (w, x, y, type = 'blob') => S.spawn(w, type, x, y);
test('14 weapons and 32 items have their exact definitions', () => {
  a.equal(Object.keys(D.weapons).length, 14);
  a.equal(Object.keys(D.items).length, 32);
  a.equal(Object.keys(D.chars).length, 10);
});
test('set bonuses use highest unlocked stage, including duplicate and multiclass weapons', () => {
  const p = S.createPlayer('x');
  p.weapons = [['dagger', 1], ['dagger', 1], ['dagger', 1], ['dagger', 1]];
  a.equal(S.sets(p).blade.stage, 4);
  a.equal(S.sets(p).precise.stats.crit, 9);
  a.equal(S.effectiveStats(p).lifesteal, 6);
  p.weapons.push(['spear', 1], ['spear', 1]);
  a.equal(S.sets(p).blade.stats.lifesteal, 10);
});
for (const [id, v] of Object.entries(D.weapons)) {
  test(`${id} ${v.behavior} hits valid target`, () => {
    const w = world();
    const p = w.players.solo;
    p.weapons = [[id, 1]];
    const e = enemy(w, p.x + Math.min(60, v.range - 10), p.y);
    e.hp = e.maxHp = 1000;
    S.weaponHit(w, p, id, 1, e, 0);
    if (v.behavior === 'projectile') {
      a.ok(w.projectiles.length >= (v.count || 1));
      for (let i = 0; i < 12; i++) S.step(w);
    }
    a.ok(e.hp < 1000, `${id} did not hit`);
  });
}
test('thrust line, sweep 120° arc, slam radius, cone 40° and chain damage decay', () => {
  for (const [id, inside, outside] of [
    ['spear', [100, 0], [100, 80]], ['stick', [80, 70], [-80, 0]],
    ['hammer', [100, 60], [-100, 0]], ['flamethrower', [100, 20], [100, 90]]
  ]) {
    const w = world(), p = w.players.solo;
    p.weapons = [[id, 1]];
    const yes = enemy(w, p.x + inside[0], p.y + inside[1]);
    const no = enemy(w, p.x + outside[0], p.y + outside[1]);
    yes.hp = yes.maxHp = no.hp = no.maxHp = 1000;
    S.weaponHit(w, p, id, 1, yes, 0);
    a.ok(yes.hp < 1000, id + ' inside');
    a.equal(no.hp, 1000, id + ' outside');
  }
  const w = world(), p = w.players.solo;
  const group = [60, 100, 140, 180, 220].map(x => enemy(w, p.x + x, p.y));
  group.forEach(e => { e.hp = e.maxHp = 1000; });
  S.weaponHit(w, p, 'staff', 1, group[0], 0);
  a.deepEqual(group.map(e => Math.round(1000 - e.hp)), [10, 8, 6, 5, 0]);
});
test('burn refreshes (not stacks) and bleed is applied on dagger critical', () => {
  const w = world(), p = w.players.solo, e = enemy(w, p.x + 30, p.y);
  e.hp = e.maxHp = 1000;
  S.weaponHit(w, p, 'flamethrower', 1, e, 0);
  a.equal(e.status.burn.left, 3);
  S.step(w, 1 / 30);
  S.weaponHit(w, p, 'flamethrower', 1, e, 0);
  a.equal(e.status.burn.left, 3);
  a.equal(Object.keys(e.status).length, 1);
  p.stats.crit = 100;
  S.weaponHit(w, p, 'dagger', 1, e, 0);
  a.equal(e.status.bleed.left, 2);
});
test('character rules: two pistols, no melee shop, berserker, vampire, cyclops, ghost', () => {
  const gun = S.createPlayer('x', 'gunslinger');
  a.equal(gun.weapons.length, 2);
  const w = world('gunslinger');
  for (let i = 0; i < 200; i++) {
    const offers = S.shop(w, w.players.solo);
    a.ok(offers.every(v => !v.weapon || D.weapons[v.id].kind !== 'melee'));
  }
  const berserker = S.createPlayer('x', 'berserker');
  berserker.hp = berserker.maxHp / 2;
  berserker.stats.regen = 50;
  a.equal(S.effectiveStats(berserker).dmg, 30);
  a.equal(S.effectiveStats(berserker).regen, 0);
  const vampire = S.createPlayer('x', 'vampire');
  a.equal(vampire.hp, Math.ceil(vampire.maxHp / 2));
  vampire.stats.regen = 9;
  a.equal(S.effectiveStats(vampire).regen, 0);
  const cyclops = S.createPlayer('x', 'cyclops');
  a.equal(S.capacity(cyclops), 1);
  cyclops.mats = 100;
  a.equal(S.buy(cyclops, { weapon: true, id: 'pistol', tier: 1, price: 1 }), false);
  const ghost = world('ghost'), g = ghost.players.solo;
  a.equal(g.maxHp, 5);
  ghost.rng = () => 0;
  S.hurtPlayer(ghost, g, 100, null);
  a.equal(g.immune, .5);
  a.equal(g.nextCrit, true);
});
test('crate cap, exploder friendly fire and shielder damage reduction', () => {
  const w = world(), p = w.players.solo;
  a.ok(S.createCrate(w, 0, 0));
  a.ok(S.createCrate(w, 1, 1));
  a.equal(S.createCrate(w, 2, 2), null);
  const victim = enemy(w, p.x + 20, p.y, 'blob');
  victim.hp = victim.maxHp = 100;
  const shield = enemy(w, p.x + 40, p.y, 'shielder');
  shield.hp = shield.maxHp = 100;
  S.hurtEnemy(w, victim, 20, p.uid);
  a.equal(victim.hp, 90);
  w.enemies.splice(w.enemies.indexOf(shield), 1);
  const exploder = enemy(w, p.x + 20, p.y, 'exploder');
  exploder.hp = 0;
  S.kill(w, exploder, p.uid);
  a.ok(victim.hp < 90);
  a.ok(p.hp < p.maxHp);
});
test('basic, muscle, science, lucky, gunslinger and bomber special hooks', () => {
  a.equal(S.shopRerollCost(S.createPlayer('x', 'basic'), 4, 0), 0);
  a.equal(S.shopRerollCost(S.createPlayer('x', 'basic'), 4, 1), 6);
  const muscle = world('muscle'), m = muscle.players.solo;
  const mTarget = enemy(muscle, m.x + 30, m.y);
  mTarget.hp = mTarget.maxHp = 100;
  S.weaponHit(muscle, m, 'fist', 1, mTarget, 0);
  const normal = world(), n = normal.players.solo;
  const nTarget = enemy(normal, n.x + 30, n.y);
  nTarget.hp = nTarget.maxHp = 100;
  S.weaponHit(normal, n, 'fist', 1, nTarget, 0);
  a.ok(mTarget.kx > nTarget.kx);
  const science = world('science'), sci = science.players.solo;
  const sTarget = enemy(science, sci.x + 30, sci.y);
  sTarget.hp = sTarget.maxHp = 100;
  S.weaponHit(science, sci, 'laser', 1, sTarget, 0);
  const base = enemy(normal, n.x + 30, n.y);
  base.hp = base.maxHp = 100;
  S.weaponHit(normal, n, 'laser', 1, base, 0);
  a.ok(100 - sTarget.hp > 100 - base.hp);
  const lucky = world('lucky'), l = lucky.players.solo;
  lucky.rng = () => 0;
  const luckTarget = enemy(lucky, l.x + 50, l.y);
  luckTarget.hp = 0;
  S.kill(lucky, luckTarget, l.uid);
  a.equal(lucky.crateCount, 2); // lucky 2% and independent base 1.5%
  const gun = world('gunslinger'), g = gun.players.solo;
  const gunTarget = enemy(gun, g.x + 20, g.y);
  gunTarget.hp = gunTarget.maxHp = 100;
  S.weaponHit(gun, g, 'pistol', 1, gunTarget, 0);
  S.weaponHit(normal, n, 'pistol', 1, base, 0);
  a.ok(gun.projectiles[0].power > normal.projectiles[0].power);
  const bomber = world('bomber'), b = bomber.players.solo;
  bomber.rng = () => 0;
  const blast = enemy(bomber, b.x + 30, b.y);
  const adjacent = enemy(bomber, b.x + 45, b.y);
  adjacent.hp = adjacent.maxHp = 100;
  blast.hp = 0;
  S.kill(bomber, blast, b.uid);
  a.ok(adjacent.hp < 100);
  a.equal(b.hp, b.maxHp);
});

test('treasure map raises crate drop chance by 50% for each copy', () => {
  const noMap = S.createWorld({ rng: () => .02 });
  const plain = S.spawn(noMap, 'blob', 100, 100);
  plain.hp = 0;
  S.kill(noMap, plain, 'solo');
  a.equal(noMap.crateCount, 0);
  const withMap = S.createWorld({ rng: () => .02 });
  withMap.players.solo.items.push('treasure_map');
  const target = S.spawn(withMap, 'blob', 100, 100);
  target.hp = 0;
  S.kill(withMap, target, 'solo');
  a.equal(withMap.crateCount, 1);
});
