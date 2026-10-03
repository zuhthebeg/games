const { test } = require('node:test');
const a = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const D = require('../js/data.js'), S = require('../js/sim.js'), N = require('../js/net.js');
function world(char = 'vampire') { return S.createWorld({ wave: 4, rng: () => .99, players: { host: { char: 'basic' }, guest: { char } } }); }
for (const char of Object.keys(D.chars)) test(`ultimate ${char}: definition, actual effect, radius and once`, () => {
  const w = world(char), p = w.players.guest, u = D.ults[char];
  a.ok(u.name && u.effect && u.radius > 0);
  p.hp = 1; p.mats = 100; p.cool = [5];
  const near = S.spawn(w, 'boss_1', p.x + u.radius, p.y), far = S.spawn(w, 'boss_1', p.x + u.radius + 1, p.y);
  near.hp = near.maxHp = far.hp = far.maxHp = 10000;
  a.equal(S.useUlt(w, 'guest', 4), true);
  const damage = char === 'vampire' ? 5000 : char === 'berserker' ? 30 + 60 * (1 - 1 / p.maxHp)
    : char === 'thorn' ? 30 + 3 * S.effectiveStats(p).thorns : u.damage;
  a.ok(Math.abs(near.hp - (10000 - damage)) < 1e-8);
  a.equal(far.hp, 10000); a.equal(p.ultUsed, true);
  if (u.heal) a.equal(p.hp, Math.min(p.maxHp, 1 + p.maxHp * u.heal));
  if (char === 'vampire') a.equal(p.hp, p.maxHp);
  if (u.mats) a.equal(p.mats, 100 + u.mats);
  if (char === 'saver') a.equal(p.mats, 120);
  if (u.immune) a.equal(p.immune, u.immune);
  if (u.chill) a.ok(near.status.chill.left > 0);
  if (u.resetCool) a.deepEqual(p.cool, [0]);
  a.equal(w.players.host.hp, w.players.host.maxHp);
  a.equal(w.fx.filter(v => v[0] === 'ult').length, 1);
  const state = JSON.stringify(w); a.equal(S.useUlt(w, 'guest', 4), false); a.equal(JSON.stringify(w), state);
});
test('vampire halves current HP only, living nearby enemies including shielded bosses, self full heal', () => {
  const w = world(), p = w.players.guest; p.hp = 2; w.players.host.hp = 3;
  for (const [type, x, hp, maxHp] of [['boss_1', 0, 20, 100], ['blob', 30, 1, 99], ['shielder', 50, 80, 100], ['blob', 221, 50, 100], ['blob', 10, 0, 100]]) {
    const e = S.spawn(w, type, p.x + x, p.y); e.hp = hp; e.maxHp = maxHp;
  }
  a.equal(S.useUlt(w, 'guest', 4), true);
  a.deepEqual(w.enemies.map(e => e.hp), [10, .5, 40, 50, 0]);
  a.deepEqual(w.enemies.map(e => e.maxHp), [100, 99, 100, 100, 100]);
  a.equal(p.hp, p.maxHp); a.equal(w.players.host.hp, 3); a.equal(p.totalDamage, 50.5);
});
test('ultimate rejects dead, zeroHP, unknown player, wrong wave, elapsed and ended phase', () => {
  for (const mutate of [w => w.players.guest.alive = false, w => w.players.guest.hp = 0, w => w.tm = 0, w => w.ended = true]) {
    const w = world(); mutate(w); a.equal(S.useUlt(w, 'guest', 4), false); a.equal(w.players.guest.ultUsed, false);
  }
  const w = world(); for (const wave of [3, 5, '4', undefined, NaN]) a.equal(S.useUlt(w, 'guest', wave), false);
  a.equal(S.useUlt(w, 'unknown', 4), false);
});
test('target limit is nearest-first for gunslinger/cyclops, damage kill bookkeeping preserved', () => {
  for (const char of ['gunslinger', 'cyclops']) {
    const w = world(char), p = w.players.guest;
    for (let i = 8; i > 0; i--) S.spawn(w, 'blob', p.x + i * 10, p.y);
    S.useUlt(w, 'guest', 4);
    a.equal(p.kills, D.ults[char].limit); a.equal(w.enemies.length, 8 - D.ults[char].limit);
    a.ok(w.enemies.every(e => e.x > p.x + D.ults[char].limit * 10));
  }
});
test('new wave/newgame reset; item/shake revive and level gain cannot reset; save restore preserves', () => {
  const w = world(); S.useUlt(w, 'guest', 4); const p = w.players.guest;
  p.alive = false; p.hp = 0; a.equal(S.shakeRevive(w, 'guest'), true); a.equal(p.ultUsed, true);
  p.items.push('phoenix_feather'); p.immune = 0; S.hurtPlayer(w, p, 999, null); a.equal(p.alive, true); a.equal(p.ultUsed, true);
  p.lvl++; a.equal(S.useUlt(w, 'guest', 4), false);
  a.equal(S.createWorld({ wave: 5, players: { guest: p } }).players.guest.ultUsed, false);
  a.equal(S.createPlayer('guest', 'vampire').ultUsed, false);
  const solo = S.createWorld(); S.useUlt(solo, 'solo', 1);
  const m = new Map(), store = { setItem: (k, v) => m.set(k, v), getItem: k => m.get(k), removeItem: k => m.delete(k) };
  a.equal(S.soloSave.save(store, { mode: 'wave', world: solo }, 1000), true);
  const loaded = S.soloSave.load(store, 1001); a.equal(loaded.world.players.solo.ultUsed, true); a.equal(S.useUlt(loaded.world, 'solo', 1), false);
});
test('host authoritative RT: bound sender, duplicates/replay/dead/shop rejected, snapshot HP/flag/FX', () => {
  const h = new N.Session({ uid: 'host', host: 'host' }); h.players = { host: {}, guest: {} }; h.world = world(); h.wave = 4; h.phase = 'wave';
  const packets = []; const g = new N.Session({ uid: 'guest', host: 'host', sendRt: p => packets.push(p) }); g.wave = 4; g.phase = 'wave'; g.rt('host', N.encode(h.world));
  a.equal(g.requestUlt(), true); a.equal(g.world, null); a.deepEqual(packets[0], { t: 'ult', w: 4 });
  h.rt('intruder', { t: 'ult', w: 4, uid: 'guest' }); a.equal(h.world.players.guest.ultUsed, false);
  h.rt('guest', { t: 'ult', w: 3 }); a.equal(h.world.players.guest.ultUsed, false);
  h.rt('guest', { ...packets[0], uid: 'host', damage: 999, char: 'bomber' }); a.equal(h.world.players.host.ultUsed, false); a.equal(h.world.players.guest.ultUsed, false);
  h.rt('guest', packets[0]); a.equal(h.world.players.guest.ultUsed, true);
  const before = JSON.stringify(h.world); h.rt('guest', packets[0]); a.equal(JSON.stringify(h.world), before);
  h.world.tick++; const snap = JSON.parse(JSON.stringify(N.encode(h.world))); g.rt('guest', snap); a.equal(g.buffer.a.length, 1);
  g.rt('host', snap); const row = g.buffer.sample(Date.now()).pl.find(v => v[0] === 'guest');
  a.equal(row[3], h.world.players.guest.maxHp); a.equal(row[11], true); a.equal(row[9], 'vampire'); a.ok(snap.fx.some(v => v[0] === 'ult'));
  h.world = S.createWorld({ wave: 5, players: { host: {}, guest: { char: 'vampire' } } }); h.wave = 5;
  h.rt('guest', packets[0]); a.equal(h.world.players.guest.ultUsed, false);
  h.world.players.guest.alive = false; h.rt('guest', { t: 'ult', w: 5 }); a.equal(h.world.players.guest.ultUsed, false);
  h.world.players.guest.alive = true; h.world.ended = true; h.rt('guest', { t: 'ult', w: 5 }); a.equal(h.world.players.guest.ultUsed, false);
  h.world.ended = false; a.equal(h.requestUlt(), true); a.equal(h.world.players.host.ultUsed, true);
});
test('UI combat-only button, real disabled states and synchronized guest state', () => {
  const btn = { style: {}, setAttribute(k, v) { this[k] = v; } }, stub = { classList: { toggle() {} } };
  const window = { SPUD: { data: D, sim: S, i18n: { language: 'ko' } } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/ui.js'), 'utf8'), { window, document: { getElementById: id => id === 'ultBtn' ? btn : stub } });
  const p = S.createPlayer('solo', 'vampire');
  window.SPUD.ui.ultimate(p, 'wave'); a.equal(btn.disabled, false); a.match(btn.title, /220/);
  for (const mode of ['shop', 'ready', 'title', 'select', 'over']) { window.SPUD.ui.ultimate(p, mode); a.equal(btn.disabled, true); a.equal(btn.hidden, true); a.equal(btn.style.display, 'none'); }
  p.ultUsed = true; window.SPUD.ui.ultimate(p, 'wave'); a.equal(btn.disabled, true);
  p.ultUsed = false; p.alive = false; window.SPUD.ui.ultimate(p, 'wave'); a.equal(btn.disabled, true);
  p.alive = true; window.SPUD.ui.ultimate(p, 'wave', true); a.equal(btn.disabled, true);
  window.SPUD.ui.ultimate(null, 'wave'); a.equal(btn.disabled, true);
  const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
  a.match(html, /#ultBtn:disabled\s*\{[^}]*opacity:\s*\.35/);
  a.match(html, /<button[^>]*type="button"[^>]*id="ultBtn"[^>]*disabled/);
});
function pair() {
  const h = new N.Session({ uid: 'host', host: 'host' }), packets = [];
  const g = new N.Session({ uid: 'guest', host: 'host', sendRt: p => packets.push(p) });
  const roster = { players: [{ user: 'host' }, { user: 'guest' }], hostUser: 'host' };
  h.roster(roster); g.roster(roster);
  const start = { type: 'WAVE_START', payload: { w: 4, players: { host: { char: 'basic' }, guest: { char: 'vampire' } } } };
  h.receive(start); g.receive(start); g.rt('host', N.encode(h.world), 1000);
  return { h, g, packets, start, roster };
}
test('one API/once flag; strict sender/payload/wave/phase checks reject forged effects without mutation', () => {
  a.equal(D.specials, undefined); a.equal(S.useSpecial, undefined); a.equal(N.Session.prototype.requestSpecial, undefined);
  const { h, g } = pair(); a.equal(Object.hasOwn(h.world.players.guest, 'specialUsed'), false);
  const before = JSON.stringify(h.world);
  for (const [sender, packet] of [['intruder', { t: 'ult', w: 4 }], ['guest', { t: 'ult', w: '4' }],
    ['guest', { t: 'ult', w: 3 }], ['guest', { t: 'ult', w: 4, uid: 'host' }], ['guest', { t: 'ult', w: 4, radius: 999 }],
    ['guest', { t: 'sp', w: 4 }]]) h.rt(sender, packet);
  a.equal(JSON.stringify(h.world), before);
  h.phase = g.phase = 'shop'; a.equal(h.requestUlt(), false); a.equal(g.requestUlt(), false);
  h.rt('guest', { t: 'ult', w: 4 }); a.equal(JSON.stringify(h.world), before);
});
test('guest pending, dead/used authority snapshots, stale tick and wrong-wave snapshot rejection', () => {
  const { h, g, packets } = pair();
  a.equal(g.requestUlt(), true); a.equal(g.requestUlt(), false); a.equal(packets.length, 1);
  g.rt('host', N.encode(h.world), 1100); a.equal(g.ultPending, true); // duplicate tick cannot release pending
  h.rt('guest', packets[0]); h.world.tick++; g.rt('host', N.encode(h.world), 1200);
  a.equal(g.ultPending, false); a.equal(g.requestUlt(), false);
  const snapshot = g.buffer.a.at(-1).s;
  g.rt('host', { ...snapshot, k: 999, w: 3 }); a.equal(g.buffer.a.at(-1).s, snapshot);
  const unversioned = { ...snapshot, k: 999 }; delete unversioned.w;
  g.rt('host', unversioned); a.equal(g.buffer.a.at(-1).s, snapshot);
  g.rt('guest', { ...snapshot, k: 999 }); a.equal(g.buffer.a.at(-1).s, snapshot);
  h.start(5); g.receive({ type: 'WAVE_START', payload: { w: 5, players: h.lastPlayers } });
  a.equal(g.buffer.a.length, 0); a.equal(g.requestUlt(), false);
  h.world.players.guest.alive = false; h.world.players.guest.hp = 0; g.rt('host', N.encode(h.world), 1300);
  a.equal(g.requestUlt(), false);
  S.shakeRevive(h.world, 'guest'); h.world.tick++; g.rt('host', N.encode(h.world), 1400);
  a.equal(g.requestUlt(), true); // unused revive preserves entitlement
});
test('same/old WAVE_START replay and roster reconnect cannot replenish usage; next wave does', () => {
  const { h, start, roster } = pair();
  h.rt('guest', { t: 'ult', w: 4 }); const w = h.world;
  h.receive(start); a.equal(h.world, w); a.equal(h.world.players.guest.ultUsed, true);
  h.receive({ ...start, payload: { ...start.payload, w: 3 } }); a.equal(h.world, w);
  h.roster({ players: [{ user: 'host' }], hostUser: 'host' }); a.equal(h.world.players.guest, undefined);
  h.roster(roster); a.equal(h.world.players.guest.ultUsed, true);
  a.equal(h.rt('guest', { t: 'ult', w: 4 }), false);
  h.start(5); a.equal(h.world.players.guest.ultUsed, false); a.equal(h.ultSpent.size, 0);
});
test('legacy checkpoints default unused; invalid once flag rejected; unused death/revive stays unused', () => {
  const w = S.createWorld(), p = w.players.solo;
  const multi = world(); multi.players.guest.alive = false; multi.players.guest.hp = 0;
  a.equal(S.shakeRevive(multi, 'guest'), true); a.equal(multi.players.guest.ultUsed, false);
  const map = new Map(), store = { getItem: k => map.get(k), setItem: (k,v) => map.set(k,v), removeItem: k => map.delete(k) };
  delete p.ultUsed; S.soloSave.save(store, { mode: 'wave', world: w }, 1000);
  a.equal(S.soloSave.load(store, 1001).world.players.solo.ultUsed, false);
  p.ultUsed = 'false'; S.soloSave.save(store, { mode: 'wave', world: w }, 1000);
  a.equal(S.soloSave.load(store, 1001), null);
});
test('instant ultimate preserves boss knockback/status and normal shielding; vampire bypasses shielding', () => {
  for (const char of ['muscle', 'science', 'basic']) {
    const w = world(char), p = w.players.guest, u = D.ults[char];
    const e = S.spawn(w, 'boss_1', p.x + 50, p.y); e.hp = 10000;
    const shield = S.spawn(w, 'shielder', p.x + 60, p.y); shield.hp = 10000;
    S.useUlt(w, 'guest', 4); a.equal(e.hp, 10000 - u.damage * .5);
    if (u.kb) a.equal(e.kx, u.kb * 1.5 * .25);
    if (u.chill) a.equal(e.status.chill.left, 2);
  }
});
test('150-target ultimate emits one cosmetic pulse without losing kills/drops and fits wire budget', () => {
  const w = world('basic'), p = w.players.guest;
  for (let i = 0; i < 150; i++) { const e = S.spawn(w, 'blob', p.x + i % 100, p.y); e.hp = 1; }
  S.useUlt(w, 'guest', 4);
  a.equal(p.kills, 150); a.equal(w.enemies.length, 0); a.ok(w.drops.length > 0);
  a.equal(w.fx.filter(e => e[0] === 'ult').length, 1);
  a.equal(w.fx.filter(e => ['hit','die','st','ex','bm'].includes(e[0])).length, 0);
  a.ok(Buffer.byteLength(JSON.stringify(N.encode(w))) < 8192);
});
test('all languages have named ultimate/rule and localized vampire current HP explanation', () => {
  const nodes = new Map(); const node = id => { if (!nodes.has(id)) nodes.set(id, { style: {}, setAttribute(k,v) { this[k]=v; } }); return nodes.get(id); };
  const document = { getElementById: node, documentElement: {} }, window = { SPUD: { data: D, sim: S } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/i18n.js'), 'utf8'), { window, document, navigator: { language: 'ko' } });
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/ui.js'), 'utf8'), { window, document });
  for (const lang of ['ko', 'en', 'zh-TW']) {
    a.equal(window.SPUD.i18n.language, lang);
    for (const char of Object.keys(D.chars)) {
      window.SPUD.ui.ultimate(S.createPlayer('solo', char), 'wave');
      a.equal(node('ultBtn').hidden, false); a.equal(node('ultBtn').disabled, false);
      a.match(node('ultBtn').title, /U/); a.match(node('ultBtn').title, new RegExp(String(D.ults[char].radius)));
    }
    window.SPUD.i18n.toggle();
  }
});
function mainUltHarness(session, localPlayer = null) {
  const source = fs.readFileSync(require.resolve('../js/main.js'), 'utf8');
  const code = source.slice(source.indexOf('  function ultPlayer()'), source.indexOf('  function frame(now)'));
  const context = { session, localPlayer, uid: session.uid, mode: 'wave', U: { sheetOpen: () => false }, checkpoints: 0,
    checkpoint() { context.checkpoints++; } };
  vm.runInNewContext(code + ';this.use = useUlt;this.player = ultPlayer;', context);
  return context;
}
test('main actual guest handler uses newest authoritative HP/alive/used, locks request, never predicts effect', () => {
  const { h, g, packets } = pair(); const local = S.createPlayer('guest', 'vampire'); local.hp = 1;
  const c = mainUltHarness(g, local); const before = JSON.stringify(h.world);
  a.equal(c.use(), true); a.equal(c.use(), false); a.equal(packets.length, 1);
  a.equal(JSON.stringify(h.world), before); a.equal(g.world, null); a.equal(local.ultUsed, false);
  h.rt('guest', packets[0]); h.world.tick++; g.rt('host', N.encode(h.world), 2000);
  a.equal(c.player().hp, h.world.players.guest.maxHp); a.equal(c.player().ultUsed, true); a.equal(c.use(), false);
  h.world.players.guest.alive = false; h.world.players.guest.hp = 0; h.world.tick++; g.rt('host', N.encode(h.world), 2100);
  local.alive = true; local.ultUsed = false; a.equal(c.use(), false); a.equal(c.player().alive, false); a.equal(local.alive, true);
});
test('main actual solo handler blocks sheet/shop/death, forces checkpoint; next wave re-enables', () => {
  const h = new N.Session({ uid: 'solo', host: 'solo' }); h.players = { solo: {} }; h.start(1);
  const c = mainUltHarness(h), p = h.world.players.solo;
  c.U.sheetOpen = () => true; a.equal(c.use(), false); c.U.sheetOpen = () => false;
  c.mode = 'shop'; a.equal(c.use(), false); c.mode = 'wave'; p.alive = false; a.equal(c.use(), false); p.alive = true;
  a.equal(c.use(), true); a.equal(c.checkpoints, 1); a.equal(c.use(), false);
  h.start(2); a.equal(c.use(), true); a.equal(c.checkpoints, 2);
});

test('guest ultimate UI authority view never overwrites shop HP/maxHP upgrades', () => {
  const { g } = pair(), local = S.createPlayer('guest','vampire'), c = mainUltHarness(g, local);
  c.mode = 'shop'; S.grantItem(local, 'heart_jar');
  const hp = local.hp, maxHp = local.maxHp;
  a.notEqual(maxHp, g.buffer.a.at(-1).s.pl.find(p => p[0] === 'guest')[4]);
  c.player(); a.equal(c.use(), false);
  a.equal(local.hp, hp); a.equal(local.maxHp, maxHp);
});
