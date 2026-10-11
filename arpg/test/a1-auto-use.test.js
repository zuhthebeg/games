import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, addPlayer, startStage, step, emptyInput } from '../js/sim/world.js';
import { encodeSnapshot, decodeSnapshot } from '../js/net/protocol.js';
import { predictPlayerTick } from '../js/net/player-prediction.js';
import { applyAutoUse, autoUseSettings, validAutoUse, DEFAULT_AUTO_USE } from '../js/meta/auto-use.js';
import { createSave, SaveStore, SAVE_KEY, validateSave } from '../js/meta/save.js';

const pawn = (over = {}) => ({ hp: 100, maxHp: 100, mp: 100, maxMp: 100, potions: 3, manaPotions: 2, potionCd: 0,
  scrolls: 1, scrollRetry: 0, channel: 0, act: null, dead: false, terminal: null, ...over });
const auto = (p, settings = DEFAULT_AUTO_USE, inp = emptyInput()) => applyAutoUse(inp, p, settings);
const edges = (inp) => ['potionEdge', 'manaEdge', 'scrollEdge'].filter(key => inp[key]);

test('HP/MP thresholds trigger strictly below 30/50/70%', () => {
  assert.deepEqual(edges(auto(pawn({ hp: 50 }))), []);
  assert.deepEqual(edges(auto(pawn({ hp: 49 }))), ['potionEdge']);
  assert.deepEqual(edges(auto(pawn({ mp: 50 }))), []);
  assert.deepEqual(edges(auto(pawn({ mp: 49 }))), ['manaEdge']);
  for (const level of [30, 70]) {
    const s = { ...DEFAULT_AUTO_USE, hp: level, mp: level };
    assert.deepEqual(edges(auto(pawn({ hp: level }), s)), []);
    assert.deepEqual(edges(auto(pawn({ hp: level - 1 }), s)), ['potionEdge']);
    assert.deepEqual(edges(auto(pawn({ mp: level - 1 }), s)), ['manaEdge']);
  }
});

test('HP first on the shared cooldown, empty stacks skip, cooldown blocks both', () => {
  assert.deepEqual(edges(auto(pawn({ hp: 10, mp: 10 }))), ['potionEdge']);
  assert.deepEqual(edges(auto(pawn({ hp: 40, mp: 10, potions: 0 }))), ['manaEdge']);
  assert.deepEqual(edges(auto(pawn({ mp: 10, manaPotions: 0 }))), []);
  assert.deepEqual(edges(auto(pawn({ hp: 10, mp: 10, potionCd: 1 }))), []);
  assert.deepEqual(edges(auto(pawn({ hp: 10 }), { ...DEFAULT_AUTO_USE, potion: false })), []);
});

test('emergency return: no HP potion and HP at or below 20%', () => {
  assert.deepEqual(edges(auto(pawn({ hp: 20, potions: 0 }))), ['scrollEdge']);
  assert.deepEqual(edges(auto(pawn({ hp: 21, potions: 0 }))), []);
  assert.deepEqual(edges(auto(pawn({ hp: 20 }))), ['potionEdge']);
  for (const blocked of [{ scrolls: 0 }, { scrollRetry: 5 }, { act: { id: 'swing' } }, { channel: 30 },
    { dead: true }, { terminal: 'death' }]) {
    assert.deepEqual(edges(auto(pawn({ hp: 5, potions: 0, ...blocked }))), [], JSON.stringify(blocked));
  }
  assert.deepEqual(edges(auto(pawn({ hp: 5, potions: 0 }), { ...DEFAULT_AUTO_USE, recall: false })), []);
  // Recall stays independent of the potion switch.
  assert.deepEqual(edges(auto(pawn({ hp: 5, potions: 0 }), { ...DEFAULT_AUTO_USE, potion: false })), ['scrollEdge']);
});

test('manual consumable or dodge input in the same tick wins', () => {
  for (const key of ['potionEdge', 'manaEdge', 'scrollEdge', 'dodgeEdge']) {
    const inp = auto(pawn({ hp: 5, mp: 5, potions: 0 }), DEFAULT_AUTO_USE, { ...emptyInput(), [key]: true });
    assert.deepEqual(Object.keys(inp).filter(k => k.endsWith('Edge') && inp[k]), [key]);
  }
  assert.equal(applyAutoUse(emptyInput(), null, DEFAULT_AUTO_USE).potionEdge, false);
});

test('settings validation, defaults and old saves', () => {
  assert.ok(validAutoUse(DEFAULT_AUTO_USE));
  assert.ok(validAutoUse({}));
  for (const bad of [null, [], { hp: 40 }, { mp: '50' }, { potion: 1 }, { recall: 'yes' }, { extra: true }]) assert.equal(validAutoUse(bad), false);
  const fresh = createSave({ name: '시험', answers: [0, 0, 0, 0, 0], weapon: 'blade', createdAt: 1 });
  assert.deepEqual(fresh.autoUse, DEFAULT_AUTO_USE);
  assert.ok(validateSave(fresh));
  assert.equal(validateSave({ ...fresh, autoUse: { hp: 45 } }), false);
  const memory = new Map(), storage = { getItem: k => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v), removeItem: k => memory.delete(k) };
  const store = new SaveStore(storage, () => 1);
  const old = structuredClone(fresh); delete old.autoUse;
  memory.set(SAVE_KEY, JSON.stringify(old));
  assert.deepEqual(store.load().autoUse, DEFAULT_AUTO_USE);
  store.save({ ...fresh, autoUse: { potion: false, hp: 70, mp: 30, recall: false } });
  assert.deepEqual(store.load().autoUse, { potion: false, hp: 70, mp: 30, recall: false });
  assert.deepEqual(autoUseSettings({ autoUse: { hp: 30 } }), { ...DEFAULT_AUTO_USE, hp: 30 });
});

function arena(mods) {
  const world = createWorld({ seed: 7 });
  addPlayer(world, { pid: 'g', weapon: 'blade', mods: { potions: 3, manaPotions: 2, scrolls: 1, ...mods } });
  startStage(world, 'S2'); world.entities = world.entities.filter(e => e.kind === 'player');
  world.round.pending = []; world.round.goal = 'timer'; world.round.timerTicks = 1e6;
  return world;
}

test('host sim: one potion per shared cooldown, prediction matches the host every tick', () => {
  const world = arena({});
  const host = world.entities[0];
  host.hp = Math.floor(host.maxHp * .2); host.mp = 0;
  let potions = 0, mana = 0;
  for (let t = 0; t < 400; t++) {
    const view = decodeSnapshot(JSON.parse(JSON.stringify(encodeSnapshot(world, { g: 0 }))), 'g');
    const inp = applyAutoUse({ ...emptyInput(), mx: t % 40 < 20 ? 1 : -1 }, view.entities[0], DEFAULT_AUTO_USE);
    const predicted = predictPlayerTick(view.entities[0], inp, { arena: world.arena, others: view.entities.slice(1) });
    const before = { potions: host.potions, manaPotions: host.manaPotions };
    step(world, { g: inp });
    potions += before.potions - host.potions; mana += before.manaPotions - host.manaPotions;
    assert.ok(before.potions - host.potions + before.manaPotions - host.manaPotions <= 1, `double use at ${t}`);
    for (const key of ['hp', 'mp', 'potions', 'manaPotions', 'potionCd']) assert.equal(predicted[key], host[key], `${key} at ${t}`);
  }
  assert.ok(potions >= 1 && mana >= 1, `potions ${potions} mana ${mana}`);
});

test('host sim: auto return channels, is retried after a break and completes', () => {
  const world = arena({ potions: 0 });
  const host = world.entities[0];
  host.hp = Math.floor(host.maxHp * .15);
  let started = 0;
  for (let t = 0; t < 600 && !host.terminal; t++) {
    const inp = applyAutoUse(emptyInput(), host, DEFAULT_AUTO_USE);
    if (inp.scrollEdge) started++;
    step(world, { g: inp });
    // Break the first channel once, the way a monster hit does.
    if (started === 1 && host.channel > 5 && !host.brokeOnce) {
      host.brokeOnce = true; host.channel = 0; host.scrollRetry = 30;
    }
  }
  assert.equal(host.terminal, 'return_scroll');
  assert.equal(started, 2);
  assert.equal(host.scrolls, 0);
});
