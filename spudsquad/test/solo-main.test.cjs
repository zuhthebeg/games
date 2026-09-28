const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const data = require('../js/data.js');
const sim = require('../js/sim.js');
const net = require('../js/net.js');
const source = fs.readFileSync(path.join(__dirname, '../js/main.js'), 'utf8');
function harness(storage, search = '') {
  const events = {}, nodes = new Map(), ui = { title(cb) { ui.titleClick = cb; },
    choose(cb) { ui.pick = cb; }, hide() {}, show() {},
    crates(_session, _player, count, cb) { ui.cratesCount = count; if (!count) cb(); },
    upgrades(_player, cb) { cb(); },
    shop(session, uid, cb) {
      if (!window.SPUD.main.offers?.length) window.SPUD.main.offers =
        sim.shop(session.world, session.world.players[uid]);
      ui.shopReady = cb;
    },
    result() {}, hud() {}, t: x => x };
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { textContent: '', style: {}, classList: { add() {}, remove() {} },
      addEventListener() {}, setPointerCapture() {}, getBoundingClientRect: () => ({ left: 0, top: 0 }) });
    return nodes.get(id);
  };
  const document = { hidden: false, getElementById: node, addEventListener(type, cb) {
    (events[type] ||= []).push(cb);
  } };
  const sfx = Object.assign(() => {}, { settings: () => ({ musicOn: true, volume: .3 }),
    music() {}, mute: () => false, toggleMusic: () => false, volume() {} });
  const window = { addEventListener(type, cb) { (events['window:' + type] ||= []).push(cb); } };
  let frames = 0;
  const timers = [];
  const context = { window, document, localStorage: storage, location: { search },
    URLSearchParams, performance: { now: () => 0 }, Date, Math, console,
    requestAnimationFrame: () => { frames++; }, setInterval: () => 1,
    clearInterval() {}, setTimeout: (fn, ms) => { timers.push(ms); return timers.length; }, clearTimeout() {}, GameRankings: { injectNavButton() {}, submit() {} },
    MultiplayerLobby: class { constructor() {} }, SharedWallet: undefined };
  window.SPUD = { data, sim, net, ui, sfx, render: { Renderer: class {
    constructor() { this.effects = { toggleShake: () => false }; }
    fx() {} draw() {} resize() {}
  } } };
  window.window = window;
  vm.runInNewContext(source, context);
  function emit(type) { for (const cb of events[type] || []) cb(); }
  emit('DOMContentLoaded');
  return { ui, emit, timers, get main() { return window.SPUD.main; }, get frames() { return frames; } };
}
const storage = () => {
  const map = new Map();
  return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value),
    removeItem: key => map.delete(key) };
};
test('refresh restores SOLO world with one game loop and no replayed action handlers', () => {
  const localStorage = storage();
  const first = harness(localStorage);
  first.ui.titleClick('solo');
  first.ui.pick('basic');
  const world = first.main.session.world;
  world.players.solo.x = 314;
  world.players.solo.mats = 42;
  sim.spawn(world, 'blob', 30, 40);
  first.emit('window:pagehide');
  assert.ok(localStorage.getItem(sim.soloSave.key));
  const refreshed = harness(localStorage);
  assert.equal(refreshed.frames, 1);
  assert.equal(refreshed.main.session.world.players.solo.x, 314);
  assert.equal(refreshed.main.session.world.players.solo.mats, 42);
  assert.equal(refreshed.main.session.world.enemies.length, 1);
  const tick = refreshed.main.session.world.tick;
  refreshed.main.session.update(1 / 30);
  assert.ok(refreshed.main.session.world.tick > tick);
  refreshed.ui.titleClick('solo'); // explicit new run retires the checkpoint
  assert.equal(localStorage.getItem(sim.soloSave.key), null);
});
test('room links skip SOLO restore and never write a multiplayer checkpoint', () => {
  const localStorage = storage();
  const first = harness(localStorage);
  first.ui.titleClick('solo'); first.ui.pick('basic'); first.emit('window:pagehide');
  const initial = localStorage.getItem(sim.soloSave.key);
  const room = harness(localStorage, '?room=ABC');
  assert.equal(room.main.session, null);
  room.emit('window:pagehide');
  assert.equal(localStorage.getItem(sim.soloSave.key), initial);
});
test('shop resumes at the saved phase and READY advances once to the next wave', () => {
  const localStorage = storage(), first = harness(localStorage);
  first.ui.titleClick('solo'); first.ui.pick('basic');
  const session = first.main.session, player = session.world.players.solo;
  player.mats = 81;
  session.world.ended = true;
  session.world.reported = true;
  session.receive({ type: 'WAVE_END', payload: { w: 1,
    players: { solo: { mats: 81, levelUps: 0, crates: 0 } } } });
  assert.ok(localStorage.getItem(sim.soloSave.key));
  const resumed = harness(localStorage);
  assert.equal(resumed.main.session.wave, 1);
  assert.equal(resumed.main.session.world.players.solo.mats, 81);
  assert.equal(resumed.ui.cratesCount, 0);
  resumed.ui.shopReady(resumed.main.session.world.players.solo);
  assert.equal(resumed.main.session.wave, 2);
  assert.equal(sim.soloSave.load(localStorage)?.world.wave, 2);
  resumed.main.session.receive({ type: 'GAME_OVER', payload: { win: false, wave: 2 } });
  assert.equal(localStorage.getItem(sim.soloSave.key), null);
});
test('consecutive WAVE_STARTs without opening the shop (45s auto-advance) do not crash on empty offer slots', () => {
  const h = harness(storage());
  h.ui.titleClick('solo'); h.ui.pick('basic');
  const session = h.main.session;
  h.main.offers = [null, { id: 'magnet', weapon: false, tier: 1, price: 1, locked: true }, null, null];
  assert.doesNotThrow(() => session.start(2));
  assert.doesNotThrow(() => session.start(3));
  assert.equal(h.main.mode, 'wave');
  assert.equal(h.main.offers[1]?.id, 'magnet', 'locked offer survives');
});
test('solo shop never auto-starts the next wave (no long timer after WAVE_END)', () => {
  const h = harness(storage());
  h.ui.titleClick('solo'); h.ui.pick('basic');
  const session = h.main.session;
  session.world.ended = true; session.world.reported = true;
  h.timers.length = 0;
  session.receive({ type: 'WAVE_END', payload: { w: 1, players: { solo: { mats: 5, levelUps: 0, crates: 0 } } } });
  assert.equal(h.main.mode, 'shop');
  assert.ok(!h.timers.some(ms => ms >= 10000), `unexpected timers: ${h.timers}`);
  assert.equal(session.wave, 1);
});
test('a bought shop slot stays sold until reroll and survives a refresh', () => {
  const localStorage = storage(), h = harness(localStorage);
  h.ui.titleClick('solo'); h.ui.pick('basic');
  const session = h.main.session;
  h.main.offers = [{ sold: true }, { id: 'magnet', weapon: false, tier: 1, price: 1 }, { sold: true }, { id: 'coffee', weapon: false, tier: 1, price: 1 }];
  session.world.ended = true; session.world.reported = true;
  session.receive({ type: 'WAVE_END', payload: { w: 1, players: { solo: { mats: 5, levelUps: 0, crates: 0 } } } });
  const resumed = harness(localStorage);
  assert.equal(resumed.main.offers?.[0]?.sold, true, 'sold slot kept after refresh');
  resumed.main.session.start(2);
  assert.equal(resumed.main.offers[0], null, 'sold slot cleared for the next wave shop');
});
