const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const D = require('../js/data.js');
const S = require('../js/sim.js');
const net = require('../js/net.js');
const C = require('../js/collection.js');

test('collection merge unions ids and keeps max best wave / wins per character', () => {
  const a = { v: 1, c: { basic: { b: 7, w: 0 }, muscle: { b: 20, w: 2 } }, w: ['pistol'], i: ['magnet'], e: ['blob'] };
  const b = { v: 1, c: { basic: { b: 12, w: 1 }, ghost: { b: 3, w: 0 } }, w: ['pistol', 'smg'], i: ['clover'], e: ['bug'] };
  const m = C.merge(a, b);
  assert.deepEqual(m.c, { basic: { b: 12, w: 1 }, muscle: { b: 20, w: 2 }, ghost: { b: 3, w: 0 } });
  assert.deepEqual(m.w, ['pistol', 'smg']);
  assert.deepEqual(m.i.sort(), ['clover', 'magnet']);
  assert.deepEqual(m.e.sort(), ['blob', 'bug']);
  // 순서 무관·멱등
  assert.deepEqual(C.merge(b, a).c, m.c);
  assert.deepEqual(C.merge(m, m), m);
  // 깨진 서버 값은 빈 도감으로 취급
  assert.deepEqual(C.merge(null, 'junk'), C.empty());
});

test('collection record: wave 10 adds boss_1, dedupes ids, wins only on win', () => {
  let col = C.record(C.empty(), { char: 'basic', wave: 9, weapons: ['pistol', 'pistol'], items: ['magnet', 'magnet'] });
  assert.deepEqual(col.w, ['pistol']);
  assert.deepEqual(col.i, ['magnet']);
  assert.equal(col.e.includes('boss_1'), false);
  assert.equal(col.e.includes('elite'), true);
  assert.deepEqual(col.c.basic, { b: 9, w: 0 });
  col = C.record(col, { char: 'basic', wave: 10, weapons: [['smg', 2]], items: ['magnet'] });
  assert.equal(col.e.includes('boss_1'), true);
  assert.equal(col.e.includes('boss_2'), false);
  assert.deepEqual(col.w, ['pistol', 'smg']);
  col = C.record(col, { char: 'basic', wave: 3, weapons: [], items: [] }); // 낮은 웨이브는 최고 기록 유지
  assert.deepEqual(col.c.basic, { b: 10, w: 0 });
  col = C.record(col, { char: 'basic', wave: 20, win: true, weapons: [], items: [] });
  assert.deepEqual(col.c.basic, { b: 20, w: 1 });
  assert.equal(col.e.includes('boss_2'), true);
  assert.equal(new Set(col.e).size, col.e.length);
  const p = C.progress(col);
  assert.equal(p.enemies.n, Object.keys(D.enemies).length);
  assert.equal(p.chars.n, 1);
});

test('fully unlocked collection stays under the 2000-char trait limit', () => {
  let col = C.empty();
  for (const char of Object.keys(D.chars)) {
    col = C.record(col, { char, wave: 20, win: true, weapons: Object.keys(D.weapons), items: Object.keys(D.items) });
  }
  const all = C.progress(col);
  assert.equal(all.all.n, all.all.total);
  assert.ok(C.size(col) < C.MAX, `collection is ${C.size(col)} chars`);
  assert.deepEqual(C.progress(C.all()).all, all.all);
});

test('debug flag persists per tab session and ?debug=0 clears it', () => {
  const map = new Map();
  const store = { getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: k => map.delete(k) };
  assert.equal(C.debugFlag('', store), false);
  assert.equal(C.debugFlag('?debug=1', store), true);
  assert.equal(C.debugFlag('?room=1', store), true);
  assert.equal(C.debugFlag('?debug=0', store), false);
  assert.equal(C.debugFlag('', store), false);
  assert.equal(C.allowRewards(true), false);
  assert.equal(C.allowRewards(false), true);
});

test('weaponSummary matches attack formulas without mutating the player', () => {
  const p = S.createPlayer('a', 'basic');
  p.nextCrit = true;
  const w = S.weaponSummary(p, 'pistol', 1);
  assert.equal(w.damage, 12);
  assert.equal(Math.round(w.cooldownMs), 1000);
  assert.equal(w.range, 420);
  assert.equal(p.nextCrit, true);
  p.stats.range = 40;
  assert.equal(S.weaponSummary(p, 'pistol', 1).range, 460);
  assert.equal(S.weaponSummary(p, 'spear', 1).range, 200 + 40 * D.MELEE_RANGE_SCALE);
  const t2 = S.weaponSummary(p, 'pistol', 2);
  assert.ok(Math.abs(t2.damage - 12 * 1.6) < 1e-9);
  assert.ok(Math.abs(t2.cooldownMs - 900) < 1e-6);
  const cyclops = S.createPlayer('c', 'cyclops');
  const cw = S.weaponSummary(cyclops, 'crossbow', 1);
  assert.equal(cw.damage, 40); // 석궁 16 × 2.5
  assert.equal(cw.shots, 1 + cyclops.stats.projectiles);
  // attackPower 경로(치명타 제외)와 같은 값: rng=1이면 치명타 없음
  const world = S.createWorld({ rng: () => 0.999, players: { a: { char: 'basic' } } });
  const hitter = world.players.a;
  const e = S.spawn(world, 'tank', hitter.x + 60, hitter.y);
  const before = e.hp;
  S.weaponHit(world, hitter, 'pistol', 1, e, 0, 0);
  for (let i = 0; i < 20; i++) S.step(world, 1 / 30);
  assert.ok(before - e.hp >= S.weaponSummary(hitter, 'pistol', 1).damage - 1e-6);
});

// main.js를 가짜 DOM에서 돌려 보상/랭킹/도감 호출을 센다
function runMain(search) {
  const calls = { gold: 0, rank: 0, collect: 0 };
  const events = {}, nodes = new Map(), ui = { title(cb) { ui.titleClick = cb; },
    choose(cb) { ui.pick = cb; }, hide() {}, show() {}, closeSheet() {},
    crates(_s, _p, count, cb) { if (!count) cb(); }, upgrades(_p, cb) { cb(); },
    shop() {}, result() {}, hud() {}, t: x => x };
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { textContent: '', style: {}, classList: { add() {}, remove() {} },
      addEventListener() {}, setPointerCapture() {}, getBoundingClientRect: () => ({ left: 0, top: 0 }) });
    return nodes.get(id);
  };
  const document = { hidden: false, getElementById: node,
    addEventListener(type, cb) { (events[type] ||= []).push(cb); } };
  const mem = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null,
    setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };
  const sfx = Object.assign(() => {}, { settings: () => ({ musicOn: true, volume: .3 }),
    music() {}, mute: () => false, toggleMusic: () => false, volume() {} });
  const window = { removeEventListener() {}, addEventListener(type, cb) { (events['window:' + type] ||= []).push(cb); } };
  const collection = { ...C, add() { calls.collect++; return true; }, load: () => Promise.resolve(), flush() {} };
  const context = { window, document, localStorage: mem(), sessionStorage: mem(), location: { search },
    URLSearchParams, performance: { now: () => 0 }, Date, Math, console, Promise,
    requestAnimationFrame() {}, setInterval: () => 1, clearInterval() {}, setTimeout() {},
    GameRankings: { injectNavButton() {}, submit() { calls.rank++; } }, MultiplayerLobby: class {},
    SharedWallet: { init: () => Promise.resolve(), addGold() { calls.gold++; } } };
  window.SPUD = { data: D, sim: S, net, ui, sfx, collection, i18n: { name: (g, id) => id, enemy: id => id },
    render: { Renderer: class { constructor() { this.effects = { toggleShake: () => false }; }
      fx() {} draw() {} resize() {} } } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/main.js'), 'utf8'), context);
  for (const cb of events.DOMContentLoaded || []) cb();
  ui.titleClick('solo');
  ui.pick('basic');
  const main = window.SPUD.main, session = main.session;
  session.world.ended = true; session.world.reported = true;
  session.receive({ type: 'WAVE_END', payload: { w: 1, players: { solo: { mats: 0, levelUps: 0, crates: 0 } } } });
  session.receive({ type: 'GAME_OVER', payload: { win: true, wave: 20, kills: { solo: 3 } } });
  return { calls, main };
}

test('debug mode suppresses gold, ranking and collection recording', () => {
  const normal = runMain('');
  assert.equal(normal.main.debug, false);
  assert.deepEqual(normal.calls, { gold: 1, rank: 1, collect: 2 });
  const debug = runMain('?debug=1');
  assert.equal(debug.main.debug, true);
  assert.deepEqual(debug.calls, { gold: 0, rank: 0, collect: 0 });
});

test('debug actions are solo-only tools: grant, materials, god toggle, jump wave', () => {
  const { main } = runMain('?debug=1');
  main.debugAct('wave', { wave: 1 }); // GAME_OVER 뒤 새 웨이브 시작도 허용
  const p = main.session.world.players.solo;
  assert.match(main.debugAct('weapon', { weapon: 'smg', tier: 3 }), /smg T3/);
  assert.equal(p.weapons.at(-1).join(), 'smg,3');
  main.debugAct('item', { item: 'magnet' });
  assert.ok(p.items.includes('magnet'));
  main.debugAct('mats', { mats: 777 });
  assert.equal(p.mats, 777);
  main.debugAct('god');
  assert.equal(main.debugView.god, true);
  main.debugAct('wave', { wave: 12 });
  assert.equal(main.session.wave, 12);
  assert.equal(main.session.world.players.solo.mats, 777);
  assert.ok(main.session.world.players.solo.items.includes('magnet'));
  const w = main.session.world;
  main.debugAct('spawn', { enemy: 'tank', n: 4 });
  assert.equal(w.enemies.filter(e => e.type === 'tank').length, 4);
  main.debugAct('kill');
  assert.equal(w.enemies.length, 0);
});
