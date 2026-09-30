// 아이템 v3 · 캐릭터 3종 · 근접 쿨다운 규칙 (docs/plans/2026-09-28-items-v3-design.md)
const { test } = require('node:test');
const a = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const D = require('../js/data.js');
const S = require('../js/sim.js');
const N = require('../js/net.js');
// 스폰·보스 없는 고정 월드. rng 기본 .99 = 회피·치명·확률 트리거 없음
const world = (char = 'basic', opts = {}) => {
  const w = S.createWorld({ wave: opts.wave || 1, rng: opts.rng || (() => .99),
    players: { solo: { char, ...(opts.saved || {}) } } });
  w.spawnClock = -1000; w.bossSpawned = true; w.players.solo.cool = [100, 100, 100, 100, 100, 100];
  return w;
};
const give = (p, ...ids) => ids.forEach(id => a.ok(S.grantItem(p, id), id));
const NEW_ITEMS = ['glasses', 'bent_fork', 'beanie', 'whistle', 'ghost_sheet',
  'sunglasses', 'wheelbarrow', 'bait', 'black_belt', 'white_flag', 'vigil_ring', 'robot_arm', 'lightning_rod',
  'statue', 'barricade', 'alien_baby', 'blood_pack', 'handcuffs', 'sad_tomato', 'wisdom_scroll', 'peacock_feather',
  'golden_potato', 'mammoth_fur', 'jetpack', 'ricochet_coil', 'focus_lens', 'anvil'];
const endWave = w => { w.tm = 1e-6; S.step(w); a.ok(w.ended); };
const loadI18n = () => {
  const window = { SPUD: { data: D }, navigator: { language: 'ko' } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/i18n.js'), 'utf8'),
    { window, navigator: window.navigator, document: { documentElement: { lang: 'ko' } } });
  return window.SPUD.i18n;
};

test('v3 catalogue: every spec item/char exists with its tier, T4 legendary tier added', () => {
  for (const id of NEW_ITEMS) a.ok(D.items[id], id);
  a.equal(Object.keys(D.items).filter(id => !['salt_shaker','raincoat','birdseed','ice_pack','seed_potato','smoke_bomb','boomerang_strap','frost_crown','shrapnel','harvest_sickle','potato_crown','phoenix_feather'].includes(id)).length, 36 + NEW_ITEMS.length);
  a.deepEqual(Object.keys(D.chars).slice(-3), ['soldier', 'loud', 'mutant']);
  a.deepEqual(['golden_potato', 'mammoth_fur', 'jetpack', 'ricochet_coil', 'focus_lens', 'anvil']
    .map(id => D.items[id].tier), [4, 4, 4, 4, 4, 4]);
  a.deepEqual(['statue', 'barricade', 'alien_baby', 'blood_pack', 'handcuffs', 'sad_tomato', 'wisdom_scroll',
    'peacock_feather'].map(id => D.items[id].tier), [3, 3, 3, 3, 3, 3, 3, 3]);
  // 기존 아이템 트레이드오프 조정 스팟 체크
  a.deepEqual(D.items.hot_sauce.stats, { dmg: 8, maxHp: -2 });
  a.deepEqual(D.items.bandana.stats, { crit: 6, range: -10 });
  a.deepEqual(D.items.mirror.stats, { projectiles: 1, dmg: -12 });
  a.deepEqual(D.items.rabbit_foot.stats, { luck: 25, dodge: 3, dmg: -4 });
  a.equal(D.items.piggy_bank.unique, true);
  for (const id of ['white_flag', 'vigil_ring', 'handcuffs', 'sad_tomato', 'wisdom_scroll', 'ricochet_coil', 'anvil'])
    a.equal(D.items[id].unique, true, id);
});

test('T4 rolls only from wave 10 at 3% + luck/1000; crates can yield T4', () => {
  const w = world('basic', { rng: () => .025 }), p = w.players.solo;
  w.wave = 9; a.equal(S.rollItemTier(w, p), 3);
  w.wave = 10; a.equal(S.rollItemTier(w, p), 4);
  w.rng = () => .035; a.equal(S.rollItemTier(w, p), 3);
  p.stats.luck = 10; a.equal(S.rollItemTier(w, p), 4);
  w.rng = () => .01;
  a.equal(D.items[S.rollCrateItem(w, p)].tier, 4);
});

test('enemy count multiplier: whistle +5%, white flag -5%, loud +50% scale the spawn budget', () => {
  const budget = (char, items = []) => {
    const w = S.createWorld({ wave: 3, rng: () => .5, players: { solo: { char, items } } });
    w.bossSpawned = true;
    S.step(w, 1 / 30);
    return w.spawnClock;
  };
  const base = budget('basic');
  a.ok(Math.abs(budget('basic', ['whistle', 'whistle']) / base - 1.10) < 1e-9);
  a.ok(Math.abs(budget('basic', ['white_flag']) / base - .95) < 1e-9);
  a.ok(Math.abs(budget('loud') / base - 1.5) < 1e-9);
});

test('alien baby: +10% enemy HP per copy (including bosses)', () => {
  const w = world('basic', { saved: { items: ['alien_baby', 'alien_baby'] } });
  const plain = world();
  const e = S.spawn(w, 'tank', 10, 10), f = S.spawn(plain, 'tank', 10, 10);
  a.ok(Math.abs(e.maxHp / f.maxHp - 1.2) < 1e-9);
  a.ok(Math.abs(S.spawn(w, 'boss_1', 5, 5).maxHp / S.spawn(plain, 'boss_1', 5, 5).maxHp - 1.2) < 1e-9);
});

test('ghost sheet: bought -> next wave starts at 1 HP once, then back to full', () => {
  const w = world(), p = w.players.solo;
  give(p, 'ghost_sheet');
  a.equal(p.pending.hp1, 1);
  const w2 = world('basic', { saved: { items: p.items, stats: p.stats, pending: p.pending } });
  a.equal(w2.players.solo.hp, 1);
  a.deepEqual(w2.players.solo.pending, {});
  const q = w2.players.solo;
  const w3 = world('basic', { saved: { items: q.items, stats: q.stats, pending: q.pending } });
  a.equal(w3.players.solo.hp, w3.players.solo.maxHp);
});

test('bait: +8% damage and exactly one extra elite at the start of the next wave only', () => {
  const p = world().players.solo;
  give(p, 'bait');
  a.equal(p.stats.dmg, 8);
  const w2 = world('basic', { saved: { items: p.items, pending: p.pending } });
  a.equal(w2.shots.filter(s => s.type === 'elite').length, 1);
  const w3 = world('basic', { saved: { items: p.items, pending: w2.players.solo.pending } });
  a.equal(w3.shots.filter(s => s.type === 'elite').length, 0);
});

test('peacock feather: +25% XP always; next wave x2 XP and x1.5 damage taken (one wave)', () => {
  const w = world(), p = w.players.solo;
  give(p, 'peacock_feather');
  w.drops.push({ id: 900, x: p.x, y: p.y, gold: 1 });
  S.step(w);
  a.ok(Math.abs(p.xp - 1.25) < 1e-9);
  const w2 = world('basic', { saved: { items: p.items, pending: p.pending } }), q = w2.players.solo;
  w2.drops.push({ id: 901, x: q.x, y: q.y, gold: 1 });
  S.step(w2);
  a.ok(Math.abs(q.xp - 2.5) < 1e-9);
  q.immune = 0; const hp = q.hp;
  S.hurtPlayer(w2, q, 2, null);
  a.ok(Math.abs(hp - q.hp - 3) < 1e-9);
});

test('wave-end hooks: vigil ring +2% dmg, robot arm melee+2/maxHp-1, loud harvest -3 (mats never negative)', () => {
  const w = world('loud'), p = w.players.solo;
  give(p, 'vigil_ring', 'robot_arm');
  const before = { ...p.stats };
  p.mats = 1;
  endWave(w);
  a.equal(p.stats.dmg, before.dmg + 2);
  a.equal(p.stats.melee, before.melee + 2);
  a.equal(p.stats.maxHp, before.maxHp - 1);
  a.equal(p.stats.harvest, before.harvest - 3);
  endWave(Object.assign(w, { ended: false }));
  a.equal(p.stats.harvest, before.harvest - 6);
  a.equal(p.mats, 0);
});

test('stationary: statue +40% atk speed, barricade +6 armor only while standing still', () => {
  const w = world(), p = w.players.solo;
  give(p, 'statue', 'barricade');
  const base = S.effectiveStats(p);
  for (let i = 0; i < 6; i++) S.step(w);
  a.equal(p.still, true);
  a.equal(S.effectiveStats(p).atkSpd, base.atkSpd + 40);
  a.equal(S.effectiveStats(p).armor, base.armor + 6);
  p.x += 5; S.step(w);
  a.equal(p.still, false);
  a.equal(S.effectiveStats(p).armor, base.armor);
});

test('soldier: -50% attack speed while moving, +50% damage and attack speed when still', () => {
  const w = world('soldier'), p = w.players.solo;
  p.cool = [100];
  for (let i = 0; i < 20; i++) { p.x += i % 2 ? 4 : -4; S.step(w); }
  a.equal(p.still, false);
  a.equal(S.effectiveStats(p).atkSpd, -50);
  a.equal(S.effectiveStats(p).dmg, 0);
  for (let i = 0; i < 6; i++) S.step(w);
  a.equal(p.still, true);
  a.equal(S.effectiveStats(p).dmg, 50);
  a.equal(S.effectiveStats(p).atkSpd, 50);
});

test('blood pack: +30 harvest, drains 1 HP every 2s but never below 1', () => {
  const w = world(), p = w.players.solo;
  give(p, 'blood_pack');
  a.equal(p.stats.harvest, 30);
  p.hp = 3;
  for (let i = 0; i < 61; i++) S.step(w);
  a.ok(Math.abs(p.hp - 2) < 1e-6, String(p.hp));
  for (let i = 0; i < 300; i++) S.step(w);
  a.equal(p.hp, 1);
});

test('handcuffs: +8 melee/ranged/elemental, then no max-HP increases (items, level-ups, sets); decreases still apply', () => {
  const w = world(), p = w.players.solo;
  give(p, 'handcuffs');
  a.deepEqual([p.stats.melee, p.stats.ranged, p.stats.elemental], [8, 8, 8]);
  const hp = p.stats.maxHp;
  give(p, 'heart_jar');
  a.equal(p.stats.maxHp, hp);
  a.equal(p.stats.speed, -2);
  for (let i = 0; i < 50; i++) a.ok(S.rollUpgrades(p, Math.random).every(u => u.id !== 'maxHp'));
  for (let i = 0; i < 40; i++) w.drops.push({ id: 1000 + i, x: p.x, y: p.y, gold: 1 });
  S.step(w);
  a.ok(p.lvl > 1);
  a.equal(p.stats.maxHp, hp);
  p.weapons = [['stick', 1], ['stick', 1], ['hammer', 1]];
  a.equal(S.effectiveStats(p).maxHp, hp);
  give(p, 'hot_sauce');
  a.equal(p.stats.maxHp, hp - 2);
});

test('sad tomato: +8 regen, every wave starts at 50% HP', () => {
  const w = world('basic', { saved: { items: ['sad_tomato'], stats: { ...D.stats, maxHp: 20, regen: 8 } } });
  a.equal(w.players.solo.hp, 10);
  const p = world().players.solo;
  give(p, 'sad_tomato');
  a.equal(p.stats.regen, 8);
});

test('wisdom scroll: -15% damage at wave start, +5% per 5s elapsed, not stored in stats', () => {
  const w = world(), p = w.players.solo;
  give(p, 'wisdom_scroll');
  a.equal(S.effectiveStats(p).dmg, -15);
  for (let i = 0; i < 30 * 10 + 1; i++) S.step(w);
  a.equal(S.effectiveStats(p).dmg, -5);
  a.equal(p.stats.dmg, 0);
  const next = world('basic', { saved: { items: p.items, stats: p.stats } });
  a.equal(S.effectiveStats(next.players.solo).dmg, -15);
});

test('lightning rod: 20% on pickup zaps a random enemy for 8 + elemental with a bm trail', () => {
  const w = world('basic', { rng: () => .1 }), p = w.players.solo;
  give(p, 'lightning_rod');
  p.stats.elemental = 3;
  const e = S.spawn(w, 'tank', 100, 100); e.hp = e.maxHp = 1000;
  w.drops.push({ id: 900, x: p.x, y: p.y, gold: 1 });
  S.step(w);
  a.equal(1000 - e.hp, 11);
  a.ok(w.fx.some(f => f[0] === 'bm'));
  const miss = world('basic', { rng: () => .5 }), q = miss.players.solo;
  give(q, 'lightning_rod');
  const f = S.spawn(miss, 'tank', 100, 100); f.hp = f.maxHp = 1000;
  miss.drops.push({ id: 900, x: q.x, y: q.y, gold: 1 });
  S.step(miss);
  a.equal(f.hp, 1000);
});

test('ricochet coil: straight projectiles bounce once more (-25% dmg); slingshot bounces twice', () => {
  const w = world(), p = w.players.solo;
  give(p, 'ricochet_coil');
  a.equal(p.stats.dmg, -25);
  p.weapons = [['pistol', 1]];
  const first = S.spawn(w, 'tank', p.x + 80, p.y), second = S.spawn(w, 'tank', p.x + 80, p.y + 150);
  for (const e of [first, second]) e.hp = e.maxHp = 1000;
  S.weaponHit(w, p, 'pistol', 1, first, 0);
  for (let i = 0; i < 20; i++) S.step(w);
  a.ok(first.hp < 1000 && second.hp < 1000);
  const sw = world(), sp = sw.players.solo;
  give(sp, 'ricochet_coil');
  const t = [[80, 0], [80, 150], [80, 300]].map(([x, y]) => S.spawn(sw, 'tank', sp.x + x, sp.y + y));
  t.forEach(e => { e.hp = e.maxHp = 1000; });
  S.weaponHit(sw, sp, 'slingshot', 1, t[0], 0);
  for (let i = 0; i < 30; i++) S.step(sw);
  a.ok(t.every(e => e.hp < 1000), t.map(e => e.hp).join());
});

test('focus lens: +30% damage, -3% attack speed per distinct weapon type', () => {
  const p = S.createPlayer('x');
  give(p, 'focus_lens');
  p.weapons = [['pistol', 1], ['pistol', 2], ['smg', 1], ['stick', 1]];
  a.equal(S.effectiveStats(p).dmg, 30);
  a.equal(S.effectiveStats(p).atkSpd, -9);
});

test('anvil: entering the shop upgrades one random weapon below T4; nothing without anvil', () => {
  const p = S.createPlayer('x');
  p.weapons = [['pistol', 4], ['smg', 2]];
  a.equal(S.enterShop(p, () => 0), null);
  give(p, 'anvil');
  a.equal(S.enterShop(p, () => 0), 1);
  a.deepEqual(p.weapons, [['pistol', 4], ['smg', 3]]);
  p.weapons = [['pistol', 4]];
  a.equal(S.enterShop(p, () => 0), null);
});

test('mutant: half XP needed per level, 1.5x shop prices for items and weapons', () => {
  a.equal(S.needXp(1, 'mutant'), 8);
  a.equal(S.needXp(1), 16);
  const w = world('mutant', { wave: 3, rng: () => .2 }), p = w.players.solo;
  const b = world('basic', { wave: 3, rng: () => .2 });
  const mo = S.shop(w, p), bo = S.shop(b, b.players.solo);
  mo.forEach((o, i) => { a.equal(o.id, bo[i].id); a.equal(o.price, Math.ceil(bo[i].price * 1.5)); });
  for (let i = 0; i < 8; i++) w.drops.push({ id: 1000 + i, x: p.x, y: p.y, gold: 1 });
  S.step(w);
  a.equal(p.lvl, 2);
});

test('melee cooldown: +5% per 100 range stat for melee only', () => {
  const run = (id, range) => {
    const w = world(), p = w.players.solo;
    p.stats.range = range; p.weapons = [[id, 1]]; p.cool = [0];
    const e = S.spawn(w, 'tank', p.x + 60, p.y); e.hp = e.maxHp = 1e6;
    S.step(w);
    return p.cool[0];
  };
  a.ok(Math.abs(run('stick', 100) / run('stick', 0) - 1.05) < 1e-9);
  a.ok(Math.abs(run('pistol', 100) / run('pistol', 0) - 1) < 1e-9);
});

test('new player fields survive solo save and multiplayer loadout/wave payloads', () => {
  const w = world(), p = w.players.solo;
  give(p, 'ghost_sheet', 'bait');
  const map = new Map();
  const storage = { setItem: (k, v) => map.set(k, v), getItem: k => map.get(k) ?? null, removeItem: k => map.delete(k) };
  a.equal(S.soloSave.save(storage, { mode: 'wave', world: w, offers: [], cratesRemaining: 0, shopRolls: 0 }, 1000), true);
  a.deepEqual(S.soloSave.load(storage, 1001).world.players.solo.pending, { hp1: 1, elite: 1 });
  // host+guest: 게스트가 상점에서 산 1회성 효과가 READY 로드아웃 → 다음 WAVE_START로 전달된다
  let host, guest; const actions = [];
  const mk = uid => new N.Session({ uid, host: 'host', rng: () => .5, sendAction: act => {
    actions.push(act); host.receive(act, actions.length); guest.receive(act, actions.length); } });
  host = mk('host'); guest = mk('guest');
  host.sendAction.echo = guest.sendAction.echo = true;
  const users = { players: [{ user: 'host' }, { user: 'guest' }], hostUser: 'host' };
  host.roster(users); guest.roster(users);
  guest.local({ type: 'PICK', payload: { uid: 'guest', char: 'basic' } });
  host.local({ type: 'PICK', payload: { uid: 'host', char: 'basic' } });
  host.world.tm = 1e-6; host.world.spawnClock = -1000;
  host.update(1 / 30);
  const end = actions.find(v => v.type === 'WAVE_END');
  a.ok(end.payload.players.guest.stats, 'wave end carries authoritative stats');
  guest.local({ type: 'READY', payload: { uid: 'guest', loadout: { items: ['ghost_sheet'],
    stats: { ...D.stats, maxHp: 13 }, pending: { hp1: 1 } } } });
  host.local({ type: 'READY', payload: { uid: 'host', loadout: {} } });
  const start = actions.filter(v => v.type === 'WAVE_START').at(-1);
  a.deepEqual(start.payload.players.guest.pending, { hp1: 1 });
  a.equal(host.world.players.guest.hp, 1);
  a.equal(S.createPlayer('guest', 'basic', start.payload.players.guest).hp, 1);
});

test('i18n: every item and char has 3-language name + description; rule items explain their rule', () => {
  const I = loadI18n();
  for (let l = 0; l < 3; l++, I.toggle()) {
    for (const [id, item] of Object.entries(D.items)) {
      const name = I.name('items', id), text = I.itemEffect(id);
      a.ok(name && name !== id, `${I.language} name ${id}`);
      a.ok(text.length > 0, `${I.language} effect ${id}`);
      a.notEqual(text, name, `${I.language} ${id} description is just its name`);
      const statOnly = Object.keys(item).every(k => ['name', 'tier', 'price', 'stats'].includes(k));
      if (!statOnly) a.notEqual(text, I.effect(item.stats).join(' · '), `${I.language} ${id} needs rule text`);
    }
    for (const id of Object.keys(D.chars)) {
      a.ok(I.name('chars', id) && I.name('chars', id) !== id, `${I.language} char ${id}`);
      a.ok(I.trait(id) && I.trait(id) !== id, `${I.language} trait ${id}`);
    }
  }
  a.match(I.name('items', 'anvil'), /모루/);
  I.toggle(); a.equal(I.name('items', 'anvil'), 'Anvil'); a.equal(I.name('chars', 'soldier'), 'Soldier Spud');
  I.toggle(); a.equal(I.name('items', 'cactus'), '仙人掌');
});
