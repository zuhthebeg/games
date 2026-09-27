const { test } = require('node:test');
const assert = require('node:assert/strict');
const S = require('../js/sim.js');
const N = require('../js/net.js');
const store = () => {
  const entries = new Map();
  return { getItem: key => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
    removeItem: key => entries.delete(key) };
};
function started() {
  const session = new N.Session({ uid: 'solo', host: 'solo', rng: () => .5 });
  session.roster({ players: [{ user: 'solo' }], hostUser: 'solo' });
  session.local({ type: 'PICK', payload: { uid: 'solo', char: 'basic' } });
  return session;
}
test('SOLO wave checkpoint round-trips live simulation without replaying transient fx', () => {
  const storage = store(), original = started(), w = original.world;
  S.spawn(w, 'blob', 45, 60);
  w.fx.push(['hit', 1]);
  for (let i = 0; i < 3; i++) original.update(1 / 30);
  w.players.solo.x = 123; w.players.solo.hp = 7.5;
  assert.equal(S.soloSave.save(storage, { mode: 'wave', world: w,
    offers: null, cratesRemaining: 0, shopRolls: 0 }, 1000), true);
  const loaded = S.soloSave.load(storage, 1001);
  assert.equal(loaded.world.players.solo.hp, 7.5);
  assert.equal(loaded.world.players.solo.x, 123);
  assert.equal(loaded.world.enemies.length, 1);
  assert.equal(loaded.world.tick, w.tick);
  assert.equal(typeof loaded.world.rng, 'function');
  assert.deepEqual(loaded.world.fx, []);
  const resumed = started();
  resumed.world = loaded.world;
  resumed.wave = loaded.world.wave;
  resumed.update(1 / 30);
  assert.ok(resumed.world.tick > w.tick);
  assert.equal(resumed.world.enemies.length, 1);
});
test('projectile hit Set survives refresh and does not hit the same enemy twice', () => {
  const storage = store(), w = started().world;
  const enemy = S.spawn(w, 'blob', 100, 600);
  w.players.solo.cool = [100];
  w.projectiles.push({ id: 'crossbow', x: 90, y: 600, vx: 700, vy: 0,
    left: 200, power: 10, crit: false, owner: 'solo',
    hit: new Set([enemy.id]), bounces: 0 });
  S.soloSave.save(storage, { mode: 'wave', world: w, offers: [],
    cratesRemaining: 0, shopRolls: 0 }, 1000);
  const saved = JSON.parse(storage.getItem(S.soloSave.key));
  assert.deepEqual(saved.world.projectiles[0].hit, [enemy.id]);
  const restored = S.soloSave.load(storage, 1001).world;
  assert.ok(restored.projectiles[0].hit instanceof Set);
  assert.ok(restored.projectiles[0].hit.has(enemy.id));
  const hp = restored.enemies[0].hp;
  S.step(restored, 1 / 30);
  assert.equal(restored.enemies[0].hp, hp);
});
test('shop snapshot retains purchases, upgrades, offers, crate progress and paid rerolls', () => {
  const storage = store(), session = started(), w = session.world;
  w.ended = true; w.reported = true;
  w.players.solo.mats = 32;
  w.players.solo.stats.armor += 2;
  w.players.solo.levelUps = 1;
  const offers = S.shop(w, w.players.solo);
  offers[0].locked = true;
  assert.equal(S.soloSave.save(storage, { mode: 'shop', world: w,
    offers, cratesRemaining: 2, shopRolls: 3 }, 1000), true);
  const saved = S.soloSave.load(storage, 1001);
  assert.equal(saved.world.players.solo.mats, 32);
  assert.equal(saved.world.players.solo.stats.armor, w.players.solo.stats.armor);
  assert.equal(saved.world.players.solo.levelUps, 1);
  assert.deepEqual(saved.offers, offers);
  assert.equal(saved.cratesRemaining, 2);
  assert.equal(saved.shopRolls, 3);
  assert.equal(S.shopRerollCost(w.players.solo, w.wave, saved.shopRolls), S.rerollCost(w.wave, 3));
  assert.equal(S.shopRerollCost(w.players.solo, w.wave, 0), 0); // no global SOLO offset leaks into multiplayer
});
test('shop checkpoint is valid before crate and upgrade choices generate offers', () => {
  const storage = store(), w = started().world;
  w.ended = w.reported = true;
  w.players.solo.levelUps = 2;
  assert.equal(S.soloSave.save(storage, { mode: 'shop', world: w, offers: [],
    cratesRemaining: 3, shopRolls: 0 }, 1000), true);
  const loaded = S.soloSave.load(storage, 1001);
  assert.equal(loaded.cratesRemaining, 3);
  assert.equal(loaded.world.players.solo.levelUps, 2);
});
test('rejects corrupt, stale, wrong-version, wrong-mode and multiplayer checkpoints', () => {
  const storage = store(), w = started().world, state = { mode: 'wave', world: w,
    cratesRemaining: 0, shopRolls: 0 };
  assert.equal(S.soloSave.save(storage, state, 1000), true);
  storage.setItem(S.soloSave.key, '{oops');
  assert.equal(S.soloSave.load(storage, 1001), null);
  assert.equal(storage.getItem(S.soloSave.key), null);
  S.soloSave.save(storage, state, 1000);
  assert.equal(S.soloSave.load(storage, 1000 + 25 * 3600 * 1000), null);
  S.soloSave.save(storage, state, 1000);
  const invalid = JSON.parse(storage.getItem(S.soloSave.key));
  invalid.version = 2;
  storage.setItem(S.soloSave.key, JSON.stringify(invalid));
  assert.equal(S.soloSave.load(storage, 1001), null);
  assert.equal(S.soloSave.save(storage, { ...state, mode: 'title' }), false);
  w.players.friend = S.createPlayer('friend');
  assert.equal(S.soloSave.save(storage, state), false);
  delete w.players.friend;
  state.mode = 'shop';
  assert.equal(S.soloSave.save(storage, state, 1000), true);
  assert.equal(S.soloSave.load(storage, 1001), null); // shop requires ended + reported
});
test('storage errors never interrupt play; clear retires save', () => {
  const broken = { getItem() { throw Error('denied'); }, setItem() { throw Error('quota'); },
    removeItem() { throw Error('denied'); } };
  assert.equal(S.soloSave.save(broken, { mode: 'wave', world: started().world }), false);
  assert.equal(S.soloSave.load(broken), null);
  assert.doesNotThrow(() => S.soloSave.clear(broken));
  const storage = store();
  S.soloSave.save(storage, { mode: 'wave', world: started().world }, 1000);
  S.soloSave.clear(storage);
  assert.equal(S.soloSave.load(storage, 1001), null);
});
