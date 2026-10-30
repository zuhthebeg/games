import test from 'node:test';
import assert from 'node:assert/strict';
import { Container } from '../vendor/pixi-8.22.0.min.mjs';
import { ArenaRenderer } from '../js/render/renderer.js';
import { VisualProvider } from '../js/render/visual-provider.js';
import { createWorld, addPlayer, startStage, emptyInput } from '../js/sim/world.js';
import { encodeSnapshot, decodeSnapshot } from '../js/net/protocol.js';
import { comboDef } from '../js/sim/basic-combo.js';
import { predictPlayerTick } from '../js/net/player-prediction.js';

const makeRenderer = (world, reduced = false) => {
  const renderer = new ArenaRenderer({ stage: new Container(), screen: { width: 390, height: 844 } },
    new VisualProvider({ atlases: false }));
  renderer.reset(world, reduced);
  return renderer;
};

const renderAct = (renderer, world, { tick, elapsed = 1, step = 1, pid = 'local', active = true, castTick } = {}) => {
  const snapshot = structuredClone(world);
  snapshot.tick = tick;
  snapshot.entities[0].pid = pid;
  snapshot.entities[0].act = active ? {
    id: 'slash', step, phase: 'active', elapsed, total: 3, left: 2, facing: 0,
    ...(castTick === undefined ? {} : { castTick }),
    def: comboDef('slash', step, 'sword')
  } : null;
  renderer.render(decodeSnapshot(encodeSnapshot(snapshot), pid), 1, 1 / 60);
};

const activeEffects = renderer => renderer.effects.filter(effect => effect.left > 0).length;

test('slash trail fires once per active combo step across copied attack objects', () => {
  const world = createWorld({ seed: 11 });
  addPlayer(world, { pid: 'local', weapon: 'blade' });
  startStage(world, 'S2');
  const renderer = makeRenderer(world);
  for (let frame = 1; frame <= 4; frame++) renderAct(renderer, world, { tick: frame, elapsed: frame });
  assert.equal(activeEffects(renderer), 1);
  renderAct(renderer, world, { tick: 5, elapsed: 1, step: 2 });
  assert.equal(activeEffects(renderer), 2);
});

test('same id and combo step after skipped inactive frames starts a fresh cast', () => {
  const world = createWorld({ seed: 12 });
  addPlayer(world, { pid: 'local', weapon: 'blade' });
  startStage(world, 'S2');
  const renderer = makeRenderer(world);
  renderAct(renderer, world, { tick: 10, elapsed: 1 });
  renderAct(renderer, world, { tick: 40, elapsed: 1 });
  assert.equal(activeEffects(renderer), 2);
});

test('cancel then recast same id and step starts a fresh cast', () => {
  const world = createWorld({ seed: 13 });
  addPlayer(world, { pid: 'local', weapon: 'blade' });
  startStage(world, 'S2');
  const renderer = makeRenderer(world);
  renderAct(renderer, world, { tick: 10, elapsed: 1 });
  renderAct(renderer, world, { tick: 11, active: false });
  renderAct(renderer, world, { tick: 30, elapsed: 1 });
  assert.equal(activeEffects(renderer), 2);
});

test('entity replacement and renderer reset each permit a fresh cast', () => {
  const world = createWorld({ seed: 14 });
  addPlayer(world, { pid: 'local', weapon: 'blade' });
  startStage(world, 'S2');
  const renderer = makeRenderer(world);
  renderAct(renderer, world, { tick: 10, elapsed: 1 });
  renderAct(renderer, world, { tick: 11, elapsed: 2, pid: 'replacement' });
  assert.equal(activeEffects(renderer), 2);
  renderer.reset(world);
  renderAct(renderer, world, { tick: 12, elapsed: 1 });
  assert.equal(activeEffects(renderer), 1);
});

test('predicted own-pawn tick skew remains one cast within the four-tick tolerance', () => {
  const world = createWorld({ seed: 15 });
  addPlayer(world, { pid: 'local', weapon: 'blade' });
  startStage(world, 'S2');
  const renderer = makeRenderer(world);
  for (let i = 0; i < 6; i++) renderAct(renderer, world, { tick: i + Math.floor(i / 2), elapsed: i + 1 });
  assert.equal(activeEffects(renderer), 1);
});

test('reduced motion uses the same cast identity', () => {
  const world = createWorld({ seed: 16 });
  addPlayer(world, { pid: 'local', weapon: 'blade' });
  startStage(world, 'S2');
  const renderer = makeRenderer(world, true);
  renderAct(renderer, world, { tick: 1, elapsed: 1 });
  renderAct(renderer, world, { tick: 2, elapsed: 2 });
  assert.equal(activeEffects(renderer), 1);
});

test('cast elapsed is present in decoded and predicted own acts', () => {
  const world = createWorld({ seed: 17 });
  const player = addPlayer(world, { pid: 'local', weapon: 'blade' });
  startStage(world, 'S2');
  player.act = { id: 'slash', step: 1, phase: 'active', elapsed: 2, total: 3, left: 1, facing: 0,
    def: comboDef('slash', 1, 'sword') };
  const decoded = decodeSnapshot(encodeSnapshot(world), 'local');
  assert.equal(decoded.entities[0].act.elapsed, 2);
  const predicted = predictPlayerTick({ ...player, act: null }, { ...emptyInput(), attack: true },
    { arena: world.arena, others: [], tick: world.tick });
  assert.ok(Number.isFinite(predicted.act?.elapsed));
});
