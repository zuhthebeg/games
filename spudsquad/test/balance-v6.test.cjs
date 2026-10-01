const { test } = require('node:test');
const a = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const D = require('../js/data.js'), S = require('../js/sim.js'), N = require('../js/net.js');
const source = id => fs.readFileSync(require.resolve('../js/' + id + '.js'), 'utf8');
const sold = () => Array.from({ length: 4 }, () => ({ sold: true }));
function world(char = 'vampire', multi = false, rng = () => .99) {
  return S.createWorld({ wave: 4, rng, players: { hero: { char }, ...(multi ? { ally: { char: 'basic' } } : {}) } });
}
function uiHarness(session, player, cards, count = 2) {
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { innerHTML: '', style: {}, classList: { toggle() {}, remove() {} }, setAttribute() {} });
    return nodes.get(id);
  };
  const window = { SPUD: { data: D, sim: S, main: { localPlayer: player, offers: cards, shopRolls: count } }, navigator: { language: 'ko' } };
  const document = { getElementById: node, documentElement: {}, body: { classList: { toggle() {}, remove() {} } } };
  vm.runInNewContext(source('i18n'), { window, navigator: window.navigator, document });
  vm.runInNewContext(source('ui'), { window, document, requestAnimationFrame: fn => fn() });
  let ready;
  window.SPUD.ui.shop(session, player.uid, p => { ready = p; });
  const click = act => node('panel').onclick({ target: { closest: selector => selector === '[data-act]' ? { dataset: { act } } : null } });
  return { click, main: window.SPUD.main, panel: node('panel'), I: window.SPUD.i18n, get ready() { return ready; } };
}
const itemCards = () => ['sneakers', 'heart_jar', 'clover', 'dumbbell'].map(id => ({ id, weapon: false, price: 1, tier: 1 }));
test('paid rerolls scale the entire original curve by 1.2 and ceil currency', () => {
  for (const w of [1, 4, 10, 20]) for (const count of [0, 1, 2, 9])
    a.equal(S.rerollCost(w, count), Math.ceil((1 + w + count) * 1.2));
  a.equal(S.shopRerollCost(S.createPlayer('x', 'basic'), 4, 0, itemCards()), 0);
});
test('free refill requires exactly four purchased slots, not empty/partial/locked stock', () => {
  const p = S.createPlayer('x', 'muscle');
  a.equal(S.shopRerollCost(p, 4, 2, sold()), 0);
  for (const offers of [[], [null, null, null, null], sold().slice(1), [...sold().slice(1), { locked: true }], itemCards()])
    a.equal(S.shopRerollCost(p, 4, 2, offers), S.rerollCost(4, 2));
});
for (const mode of ['solo', 'host', 'guest']) test(`${mode} shop purchases, free refill, paid consecutive reroll, locks, repeated refill, READY`, () => {
  const w = world('muscle', mode !== 'solo'), p = w.players.hero;
  p.mats = 100;
  const session = { wave: 4, players: w.players, ready: new Set(), ...(mode === 'guest' ? {} : { world: w }) };
  const ui = uiHarness(session, p, itemCards());
  for (let i = 0; i < 3; i++) ui.click('buy' + i);
  a.match(ui.panel.innerHTML, /다시 뽑기 · 💎9/);
  const stock = ui.main.offers;
  ui.click('buy0'); a.equal(p.mats, 97); a.equal(ui.main.offers, stock);
  ui.click('buy3'); a.equal(p.mats, 96);
  a.ok(ui.main.offers.every(o => o.sold));
  a.match(ui.panel.innerHTML, /다시 뽑기 · 💎0/);
  p.mats = 0;
  ui.click('roll');
  a.equal(p.mats, 0); a.ok(ui.main.offers.every(o => !o.sold));
  a.match(ui.panel.innerHTML, /다시 뽑기 · 💎10/);
  const refilled = ui.main.offers;
  ui.click('roll'); a.equal(ui.main.offers, refilled); // cannot spam with zero money
  p.mats = 1000;
  ui.click('lock1'); const locked = ui.main.offers[1];
  ui.click('roll'); a.equal(p.mats, 990); a.equal(ui.main.offers[1], locked);
  ui.click('lock1');
  for (let i = 0; i < 4; i++) { ui.main.offers[i].weapon = false; ui.main.offers[i].id = 'clover'; ui.main.offers[i].price = 1; ui.click('buy' + i); }
  const before = p.mats;
  ui.click('roll'); a.equal(p.mats, before);
  a.match(ui.panel.innerHTML, /다시 뽑기 · 💎12/);
  ui.click('ready'); a.equal(ui.ready, p);
  if (mode === 'guest') a.equal(session.world, undefined);
});
test('SOLO restored sold stock keeps free refill and restored locks keep paid behavior', () => {
  const w = S.createWorld({ players: { solo: { char: 'muscle', mats: 100 } } });
  w.ended = w.reported = true;
  const map = new Map(), storage = { getItem: k => map.get(k), setItem: (k, v) => map.set(k, v), removeItem: k => map.delete(k) };
  for (const offers of [sold(), itemCards().map((o, i) => ({ ...o, locked: i === 1 }))]) {
    a.equal(S.soloSave.save(storage, { mode: 'shop', world: w, offers, cratesRemaining: 0, shopRolls: 3 }, 1000), true);
    const saved = S.soloSave.load(storage, 1001);
    a.ok(saved); const p = saved.world.players.solo;
    const ui = uiHarness({ world: saved.world, wave: 1, players: saved.world.players, ready: new Set() }, p, saved.offers, saved.shopRolls);
    const cost = offers[0].sold ? 0 : Math.ceil(5 * 1.2);
    const locked = ui.main.offers[1]; ui.click('roll');
    a.equal(p.mats, 100 - cost);
    if (!offers[0].sold) a.equal(ui.main.offers[1], locked);
    a.match(ui.panel.innerHTML, /다시 뽑기 · 💎8/);
  }
});
test('guest shop READY loadout is applied by host, leaves ally unchanged and survives wave recreation', () => {
  const host = new N.Session({ uid: 'host', host: 'host' });
  host.players = { host: {}, guest: {} }; host.wave = 4;
  host.world = S.createWorld({ wave: 4, players: { host: { char: 'basic', mats: 77 }, guest: { char: 'muscle', mats: 100 } } });
  const guest = S.createPlayer('guest', 'muscle'); guest.mats = 100;
  const ui = uiHarness({ wave: 4, players: host.players, ready: new Set() }, guest, itemCards());
  for (let i = 0; i < 4; i++) ui.click('buy' + i);
  ui.click('roll'); a.equal(guest.mats, 96); a.equal(host.world.players.guest.mats, 100);
  ui.click('ready');
  host.receive({ type: 'READY', payload: { uid: 'guest', loadout: { weapons: guest.weapons, items: guest.items, stats: guest.stats, mats: guest.mats } } }, 1);
  a.equal(host.world.players.guest.mats, 96); a.equal(host.world.players.host.mats, 77);
  a.deepEqual(host.world.players.guest.items, guest.items);
  const next = S.createWorld({ wave: 5, players: host.world.players });
  a.equal(next.players.guest.mats, 96); a.deepEqual(next.players.guest.items, guest.items);
});
for (const multi of [false, true]) test(`vampire melee radial hits and bounded single lifesteal roll (${multi ? 'multi' : 'solo'})`, () => {
  const w = world('vampire', multi, () => .99), p = w.players.hero;
  p.hp = 1; p.stats.lifesteal = 100;
  const enemies = [[70, 0], [0, 90], [-90, 0], [101, 0]].map(([x, y]) => { const e = S.spawn(w, 'tank', p.x + x, p.y + y); e.hp = 1000; return e; });
  if (multi) w.players.ally.hp = 2;
  S.weaponHit(w, p, 'dagger', 1, enemies[0], 0);
  for (let i = 0; i < 3; i++) a.equal(enemies[i].hp, 994);
  a.equal(enemies[3].hp, 1000); a.equal(p.hp, 2); a.equal(p.steal, 1);
  if (multi) a.equal(w.players.ally.hp, 2);
  // Existing global lifesteal ceiling still applies.
  p.steal = 10; S.weaponHit(w, p, 'dagger', 1, enemies[0], 0); a.equal(p.hp, 2);
});
test('vampire ranged attacks and other characters melee keep original hit shapes and healing', () => {
  const w = world(), p = w.players.hero; p.hp = 1; p.stats.lifesteal = 100;
  const front = S.spawn(w, 'tank', p.x + 100, p.y), side = S.spawn(w, 'tank', p.x, p.y + 80);
  front.hp = side.hp = 1000;
  S.weaponHit(w, p, 'laser', 1, front, 0);
  a.equal(side.hp, 1000); a.equal(p.hp, 2);
  const normal = world('basic'), q = normal.players.hero;
  const target = S.spawn(normal, 'tank', q.x + 100, q.y), behind = S.spawn(normal, 'tank', q.x - 80, q.y);
  target.hp = behind.hp = 1000; S.weaponHit(normal, q, 'dagger', 1, target, 0); a.equal(behind.hp, 1000);
});
test('vampire area range respects melee range stats and bleed retains existing crit behavior', () => {
  const w = world('vampire', false, () => 0), p = w.players.hero; p.stats.range = 40;
  const inside = S.spawn(w, 'tank', p.x, p.y + 120), outside = S.spawn(w, 'tank', p.x, p.y + 121);
  inside.hp = outside.hp = 1000; S.weaponHit(w, p, 'dagger', 1, inside, 0);
  a.ok(inside.hp < 1000); a.ok(inside.status.bleed); a.equal(outside.hp, 1000);
});
test('laser loses 10% base damage at every actual weapon tier; beam tier survives network and FX draw', () => {
  const colors = [];
  for (const tier of [1, 2, 3, 4]) {
    const w = world('basic'), p = w.players.hero, e = S.spawn(w, 'tank', p.x + 200, p.y); e.hp = 1000;
    p.weapons = [['laser', tier]];
    S.weaponHit(w, p, ...p.weapons[0], e, 0);
    a.ok(Math.abs(1000 - e.hp - 18 * .9 * 1.6 ** (tier - 1)) < 1e-9);
    const packet = N.decode(JSON.parse(JSON.stringify(N.encode(w))));
    const bm = packet.fx.find(e => e[0] === 'bm'); a.equal(bm[6], tier);
    const window = { SPUD: { data: D } };
    vm.runInNewContext(source('fx'), { window, performance: { now: () => 0 }, localStorage: { getItem: () => 'false' } });
    const fx = new window.SPUD.fx.Effects(); fx.add([bm], p.uid);
    const drawn = [];
    const ctx = { save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() { drawn.push(this.strokeStyle); } };
    fx.draw(ctx, 0, 1); colors.push(drawn[0]);
  }
  a.equal(new Set(colors).size, 4);
  a.deepEqual(colors, ['#e8f9ff', '#69b7ff', '#c18aff', '#ffd35a']);
});
test('actual main movement is +20% for solo/host and guest, preserves modifiers, inertia, diagonal and half stick', () => {
  const main = source('main');
  const move = main.slice(main.indexOf('  function move(dt)'), main.indexOf('  function frame(now)'));
  for (const isHost of [true, false]) for (const speed of [-8, 0, 15]) {
    const p = S.createPlayer('x'); p.stats.speed = speed;
    const context = { session: { isHost, world: { players: { x: p } } }, localPlayer: p, uid: 'x', keys: new Set(['d', 's']), stick: null, S, D };
    vm.runInNewContext(move + ';this.move = move;', context);
    const x = p.x, y = p.y; const dt = .1;
    const input = context.move(dt);
    const expected = 240 * (1 + speed / 100) * (1 - Math.exp(-dt / .07));
    a.ok(Math.abs(Math.hypot(p.x - x, p.y - y) / dt - expected) < 1e-9);
    if (!isHost) { a.equal(input.x, p.x); a.equal(input.y, p.y); }
    p.vx = p.vy = 0; context.keys.clear(); context.stick = { dx: .5, dy: 0 };
    context.move(dt); a.ok(Math.abs(p.vx - expected * .5) < 1e-9);
  }
});
test('all three languages explain free refill and vampire melee-only bounded lifesteal', () => {
  const w = world(), ui = uiHarness({ world: w, wave: 4, players: w.players, ready: new Set() }, w.players.hero, itemCards());
  for (let i = 0; i < 3; i++, ui.I.toggle()) {
    a.notEqual(ui.I.t('freeRefill'), 'freeRefill');
    a.match(ui.I.trait('vampire'), /근접|Melee|近戰/);
  }
});
test('vampire simulation auto-acquires melee targets behind the body and never widens ranged acquisition', () => {
  for (const id of ['dagger', 'stick', 'hammer']) {
    const w = world(), p = w.players.hero; w.spawnClock = -1000; w.bossSpawned = true;
    p.weapons = [[id, 1]]; p.cool = [0];
    const e = S.spawn(w, 'tank', p.x - 90, p.y); e.hp = e.maxHp = 1000;
    S.step(w); a.ok(e.hp < 1000, id); a.ok(w.fx.some(e => e[0] === 'va'));
  }
  const w = world(), p = w.players.hero;
  const front = S.spawn(w, 'tank', p.x + 120, p.y), side = S.spawn(w, 'tank', p.x, p.y + 80);
  front.hp = side.hp = 1000; S.weaponHit(w, p, 'pistol', 1, front, 0);
  a.equal(w.projectiles.length, 1); a.equal(side.hp, 1000); a.ok(!w.fx.some(e => e[0] === 'va'));
});
test('vampire melee lifesteal preserves probability, one HP amount, full HP and original global limit', () => {
  for (const random of [.10, .20]) {
    const w = world('vampire', false, () => random), p = w.players.hero; p.hp = 1;
    const one = S.spawn(w, 'tank', p.x + 70, p.y), two = S.spawn(w, 'tank', p.x, p.y + 70);
    one.hp = two.hp = 1000; S.weaponHit(w, p, 'dagger', 1, one, 0);
    a.equal(p.hp, random < .15 ? 2 : 1);
    p.hp = p.maxHp; S.weaponHit(w, p, 'dagger', 1, one, 0); a.equal(p.hp, p.maxHp);
  }
});
test('empty restored shop has paid stock, and basic first free reroll is consumed by refill', () => {
  const w = world('muscle'), p = w.players.hero; p.mats = 100;
  const session = { world: w, wave: 4, players: w.players, ready: new Set() };
  const empty = uiHarness(session, p, [], 3);
  a.ok(empty.main.offers.every(o => !o.sold)); a.match(empty.panel.innerHTML, /다시 뽑기 · 💎10/);
  p.char = 'basic';
  const basic = uiHarness(session, p, sold(), 0); basic.click('roll'); a.equal(p.mats, 100);
  a.match(basic.panel.innerHTML, /다시 뽑기 · 💎8/);
});
test('multiplayer host simulates guest vampire area damage/heal and sends the result without guest simulation', () => {
  let packet;
  const guest = new N.Session({ uid: 'guest', host: 'host' });
  const host = new N.Session({ uid: 'host', host: 'host', rng: () => .99,
    sendRt: data => { packet = JSON.parse(JSON.stringify(data)); guest.rt('host', packet, 1000); } });
  const start = { type: 'WAVE_START', payload: { w: 4, players: { host: { char: 'basic' }, guest: { char: 'vampire' } } } };
  host.receive(start, 1); guest.receive(start, 1);
  const w = host.world, p = w.players.guest;
  w.players.host.x = 100; w.players.host.y = 100; w.players.host.cool = [100];
  w.spawnClock = -1000; w.bossSpawned = true; p.hp = 1; p.stats.lifesteal = 100; p.immune = 100;
  const targets = [[70, 0], [0, 70], [-70, 0]].map(([x, y]) => {
    const e = S.spawn(w, 'tank', p.x + x, p.y + y); e.hp = e.maxHp = 1000; return e;
  });
  host.update(.1);
  a.ok(targets.every(e => e.hp === 994)); a.equal(p.hp, 2);
  a.equal(guest.world, null); a.equal(guest.buffer.sample(1000).pl.find(row => row[0] === 'guest')[3], 2);
  a.ok(packet.fx.some(e => e[0] === 'va')); a.equal(w.players.host.hp, w.players.host.maxHp);
});
