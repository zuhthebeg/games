import test from 'node:test';
import assert from 'node:assert/strict';
import { arenaPosition } from '../js/sim/movement.js';
import { addPlayer, createWorld, emptyInput, startSanctuary, step } from '../js/sim/world.js';
import { SANCTUARY } from '../js/content/sanctuary.js';
import { movementOnlyInput } from '../js/input.js';
import { SceneAssetState } from '../js/render/scene-asset-state.js';

test('arenaPosition pushes circles and rectangle faces/corners out, but not tangents', () => {
  assert.deepEqual(arenaPosition({ x: 55, y: 50, r: 10 }, { w: 100, h: 100, obstacles: [{ shape: 'circle', x: 50, y: 50, r: 10 }] }), { x: 70, y: 50 });
  assert.deepEqual(arenaPosition({ x: 70, y: 50, r: 10 }, { w: 100, h: 100, obstacles: [{ shape: 'circle', x: 50, y: 50, r: 10 }] }), { x: 70, y: 50 });
  assert.deepEqual(arenaPosition({ x: 35, y: 50, r: 10 }, { w: 100, h: 100, obstacles: [{ shape: 'rect', x: 40, y: 40, w: 20, h: 20 }] }), { x: 30, y: 50 });
  assert.deepEqual(arenaPosition({ x: 30, y: 50, r: 10 }, { w: 100, h: 100, obstacles: [{ shape: 'rect', x: 40, y: 40, w: 20, h: 20 }] }), { x: 30, y: 50 });
  const corner = arenaPosition({ x: 35, y: 35, r: 10 }, { w: 100, h: 100, obstacles: [{ shape: 'rect', x: 40, y: 40, w: 20, h: 20 }] });
  assert.ok(Math.hypot(corner.x - 40, corner.y - 40) >= 10 - 1e-9);
});

test('arenaPosition preserves obstacle-free results and pushes entities outside rectangles', () => {
  assert.deepEqual(arenaPosition({ x: -4, y: 120, r: 10 }, { w: 100, h: 100 }), { x: 10, y: 90 });
  const inside = arenaPosition({ x: 50, y: 50, r: 10 }, { w: 100, h: 100, obstacles: [{ shape: 'rect', x: 40, y: 40, w: 20, h: 20 }] });
  assert.ok(inside.x <= 30 || inside.x >= 70 || inside.y <= 30 || inside.y >= 70);
});

test('sanctuary spawn is clear; its round stays nonterminal for 3000 ticks', () => {
  assert.ok(SANCTUARY.obstacles.every(obstacle => obstacle.shape === 'circle'
    ? Math.hypot(SANCTUARY.spawn.x - obstacle.x, SANCTUARY.spawn.y - obstacle.y) >= obstacle.r
    : SANCTUARY.spawn.x <= obstacle.x || SANCTUARY.spawn.x >= obstacle.x + obstacle.w
      || SANCTUARY.spawn.y <= obstacle.y || SANCTUARY.spawn.y >= obstacle.y + obstacle.h));
  const world = createWorld({ seed: 12, arena: SANCTUARY.arena });
  addPlayer(world, { pid: 'a' });
  startSanctuary(world);
  const events = [];
  for (let i = 0; i < 3000; i++) events.push(...step(world, { a: emptyInput() }));
  assert.equal(world.round.state, 'running');
  assert.equal(world.round.t, 3000);
  assert.ok(!world.entities.some(entity => entity.terminal));
  assert.ok(!events.some(event => event.type === 'roundEnd'));
});

test('movement-only input blocks combat and every consumable edge', () => {
  assert.deepEqual(movementOnlyInput({ mx: 1, my: -1, attack: true, scrollEdge: true, greenEdge: true, skillEdge: true, dodgeHeld: true }), {
    mx: 1, my: -1, aimX: 0, aimY: 0, attack: false, autoAttack: false, skillEdge: false,
    escapeEdge: false, skill2Edge: false, skill3Edge: false, dodgeEdge: false, dodgeHeld: false, potionEdge: false,
    manaEdge: false, greenEdge: false, scrollEdge: false,
  });
});

test('walking into a sanctuary column never overlaps its collision circle', () => {
  const world = createWorld({ seed: 13, arena: SANCTUARY.arena });
  const player = addPlayer(world, { pid: 'a' });
  startSanctuary(world);
  player.x = 280; player.y = SANCTUARY.obstacles[1].y;
  for (let i = 0; i < 100; i++) step(world, { a: { ...emptyInput(), mx: 1 } });
  const column = SANCTUARY.obstacles[1];
  assert.ok(Math.hypot(player.x - column.x, player.y - column.y) >= player.r + column.r - 1e-6);
});

test('late temple asset loads are destroyed after reset', async () => {
  let resolve;
  const destroyed = [], applied = [];
  const state = new SceneAssetState(() => new Promise(done => { resolve = done; }), asset => destroyed.push(asset), asset => applied.push(asset));
  const pending = state.reset(true);
  await Promise.resolve();
  state.reset(false);
  const stale = { id: 'stale' };
  resolve(stale);
  await pending;
  assert.deepEqual(destroyed, [stale]);
  assert.deepEqual(applied, [null, null]);
});
