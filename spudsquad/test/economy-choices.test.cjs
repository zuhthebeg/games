const { test } = require('node:test');
const a = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const D = require('../js/data.js');
const S = require('../js/sim.js');
const world = (wave = 10, char = 'basic', rng = () => .5) => {
  const w = S.createWorld({ wave, players: { solo: { char } }, rng });
  w.spawnClock = -1000; w.bossSpawned = true; w.players.solo.cool = [100];
  return w;
};
test('new IDs append to existing choices and prism keeps its definition', () => {
  a.deepEqual(Object.keys(D.chars).slice(10, 12), ['saver', 'thorn']);
  a.deepEqual(Object.keys(D.items).slice(33, 36), ['fracture_round', 'bounty_badge', 'thorn_coil']);
  a.deepEqual(D.items.piercing_prism.stats, { dmg: -8 });
  a.equal(D.items.piercing_prism.pierce, 1);
});
test('saver earns bounded wave-start interest, sacrificing early damage', () => {
  const p = S.createPlayer('solo', 'saver');
  a.ok(p.stats.dmg < 0);
  for (const mats of [0, 100, 10000]) {
    const w = S.createWorld({ wave: 2, players: { solo: { char: 'saver', mats } } });
    a.equal(w.players.solo.mats - mats, Math.min(15, Math.floor(mats * .1)));
  }
  const w = S.createWorld({ wave: 2, players: { solo: { char: 'saver', mats: 1000, items: ['piggy_bank', 'piggy_bank'] } } });
  a.equal(w.players.solo.mats, 1035);
});
test('thorn retaliates on hit but loses mobility and dodge', () => {
  const w = world(1, 'thorn', () => .99), p = w.players.solo;
  a.ok(p.stats.speed < 0 && p.stats.dodge < 0);
  const e = S.spawn(w, 'tank', p.x, p.y); e.hp = 100;
  S.hurtPlayer(w, p, 1, e);
  a.equal(e.hp, 100 - p.stats.thorns);
});
test('prism stacks to two copies only, so a third copy cannot add damage cost without pierce', () => {
  const w = world(), p = w.players.solo;
  const granted = [];
  for (let i = 0; i < 5; i++) granted.push(S.grantItem(p, 'piercing_prism'));
  a.deepEqual(granted, [true, true, false, false, false]);
  a.equal(p.stats.dmg, -16);
  a.equal(S.canBuy({ ...p, mats: 100 }, { id: 'piercing_prism', price: 1, weapon: false }), false);
  for (let i = 0; i < 30; i++) a.ok(S.shop(w, p).every(o => o.weapon || o.id !== 'piercing_prism'));
  S.weaponHit(w, p, 'pistol', 1, S.spawn(w, 'tank', p.x + 80, p.y), 0);
  a.equal(w.projectiles[0].pierce, 2);
});
test('fracture round retains 90% rather than 75% power after piercing but costs armor', () => {
  const w = world(), p = w.players.solo;
  S.grantItem(p, 'piercing_prism'); S.grantItem(p, 'fracture_round');
  a.equal(p.stats.armor, -2);
  const e = S.spawn(w, 'tank', p.x + 60, p.y); e.hp = e.maxHp = 1000;
  S.weaponHit(w, p, 'pistol', 1, e, 0);
  const initial = w.projectiles[0].power;
  S.step(w);
  a.ok(Math.abs(w.projectiles[0].power - initial * .9) < 1e-9);
});
test('bounty badge adds bounded kill currency chance, not XP or a new drop; unique duplicates blocked', () => {
  const w = world(20, 'basic', () => .4), p = w.players.solo;
  a.equal(S.grantItem(p, 'bounty_badge'), true);
  a.equal(S.grantItem(p, 'bounty_badge'), false);
  a.equal(p.stats.maxHp, 7);
  const e = S.spawn(w, 'blob', 100, 100); e.hp = 0; S.kill(w, e, p.uid);
  a.equal(w.drops.length, 2);
  a.ok(w.drops.every(d => d.gold === 1)); // wave 20 base .36, +.12 => .48
  a.equal(S.canBuy({ ...p, mats: 100 }, { id: 'bounty_badge', price: 1, weapon: false }), false);
  const capped = world(1, 'basic', () => .99), cp = capped.players.solo;
  S.grantItem(cp, 'bounty_badge');
  const target = S.spawn(capped, 'blob', 100, 100); target.hp = 0;
  S.kill(capped, target, cp.uid);
  a.ok(capped.drops.every(d => d.gold === 1));
});
test('thorn coil adds retaliation at the cost of movement and cannot be stacked', () => {
  const w = world(1, 'thorn', () => .99), p = w.players.solo;
  a.equal(S.grantItem(p, 'thorn_coil'), true);
  a.equal(S.grantItem(p, 'thorn_coil'), false);
  a.equal(p.stats.speed, D.chars.thorn.stats.speed - 6);
  const e = S.spawn(w, 'tank', p.x, p.y); e.hp = 100;
  S.hurtPlayer(w, p, 1, e);
  a.equal(e.hp, 100 - D.chars.thorn.stats.thorns - 5);
});
test('unique effects are not rerolled when owned; new pierce and item IDs survive solo checkpoint', () => {
  const w = world(4, 'saver'), p = w.players.solo;
  for (const id of ['fracture_round', 'bounty_badge', 'thorn_coil']) S.grantItem(p, id);
  // Force item slots and tier 2, and sample the same tier for a crate.
  let rolls = 0;
  w.rng = () => (++rolls % 2 ? .5 : 0);
  const choices = S.shop(w, p);
  a.ok(choices.some(o => !o.weapon && o.tier === 2));
  a.ok(choices.every(o => o.weapon || !p.items.includes(o.id)));
  w.rng = () => 0;
  a.ok(!p.items.includes(S.rollCrateItem(w, p)));
  p.items.push('piercing_prism');
  const e = S.spawn(w, 'tank', p.x + 60, p.y); e.hp = e.maxHp = 1000;
  S.weaponHit(w, p, 'pistol', 1, e, 0);
  const storage = new Map();
  const adapter = { setItem: (key, value) => storage.set(key, value),
    getItem: key => storage.get(key), removeItem: key => storage.delete(key) };
  a.equal(S.soloSave.save(adapter, { mode: 'wave', world: w, offers: [],
    cratesRemaining: 0, shopRolls: 0 }, 1000), true);
  const resumed = S.soloSave.load(adapter, 1001).world;
  a.deepEqual(resumed.players.solo.items, p.items);
  a.equal(resumed.projectiles[0].pierce, 1);
  a.equal(resumed.players.solo.char, 'saver');
});
test('every existing and new ID has correctly aligned 3-language names, traits, item descriptions', () => {
  const window = { SPUD: { data: D }, navigator: { language: 'ko' } };
  const document = { documentElement: { lang: 'ko' } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/i18n.js'), 'utf8'), { window, navigator: window.navigator, document });
  const I = window.SPUD.i18n;
  for (let l = 0; l < 3; l++, I.toggle()) {
    for (const id of Object.keys(D.chars)) {
      a.notEqual(I.name('chars', id), id, `${I.language} ${id}`);
      a.notEqual(I.trait(id), id, `${I.language} trait ${id}`);
    }
    for (const id of Object.keys(D.items)) a.notEqual(I.name('items', id), id, `${I.language} ${id}`);
    for (const id of ['piercing_prism', 'fracture_round', 'bounty_badge', 'thorn_coil'])
      a.ok(I.itemEffect(id).length > 0, `${I.language} effect ${id}`);
    a.match(I.name('items', 'cactus'), /선인장|Cactus|仙人掌/);
    a.notEqual(I.name('items', 'piercing_prism'), D.items.cactus.name);
    a.match(I.name('items', 'treasure_map'), /보물 지도|Treasure Map|藏寶圖/);
    a.match(I.name('items', 'fracture_round'), /균열 탄심|Fracture Core|裂痕彈芯/);
  }
});
