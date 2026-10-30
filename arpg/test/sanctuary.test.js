import test from 'node:test';
import assert from 'node:assert/strict';
import { arenaPosition } from '../js/sim/movement.js';
import { addPlayer, createWorld, emptyInput, startSanctuary, startStage, step } from '../js/sim/world.js';
import { SANCTUARY } from '../js/content/sanctuary.js';
import { movementOnlyInput } from '../js/input.js';
import { SceneAssetState } from '../js/render/scene-asset-state.js';
import { validParty, partyConfig } from '../js/net/invasion.js';
import { CoopSession } from '../js/net/session.js';
import { encodeSnapshot, decodeSnapshot } from '../js/net/protocol.js';
import { predictPlayerTick } from '../js/net/player-prediction.js';
import { createSave } from '../js/meta/save.js';
import { STAGES } from '../js/content/combat.js';

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

test('sanctuary admission accepts 2-4 human hunters and rejects combat parties without changing STAGES', () => {
  const human = { lineage: 'human', role: 'hunter' };
  const config = { stageId: 'SANCTUARY', threat: 1, invasion: false };
  assert.equal(STAGES.SANCTUARY, undefined);
  for (const count of [2, 3, 4])
    assert.equal(validParty(config, Object.fromEntries(Array.from({ length: count }, (_, i) => [`p${i}`, human]))), true);
  assert.equal(validParty(config, { a: human }), false);
  assert.equal(validParty({ ...config, threat: 2 }, { a: human, b: human }), false);
  const skeleton = { lineage: 'skeleton_knight', role: 'invader' };
  assert.equal(partyConfig(config, { a: human, b: skeleton }).invasion, true);
  assert.equal(validParty(partyConfig(config, { a: human, b: skeleton }), { a: human, b: skeleton }), false);
  assert.equal(validParty({ ...config, invasion: true }, { a: human, b: human }), false);
  assert.equal(validParty(config, { a: human, b: { ...human, team: 0 } }), false);
  const save = createSave({ name: 'Test', answers: [0, 0, 0, 0, 0], createdAt: 1 });
  assert.equal(validParty(config, { a: { ...human, rewardSave: save }, b: { ...human, rewardSave: structuredClone(save) } }), true);
  assert.equal(validParty(config, { a: { ...human, rewardSave: {} }, b: human }), false);
});

test('sanctuary co-op starts 2-4 players evenly spaced at clear spawn positions', () => {
  for (const count of [2, 3, 4]) {
    const world = createWorld({ seed: 21, arena: SANCTUARY.arena });
    for (let i = 0; i < count; i++) addPlayer(world, { pid: `p${i}` });
    startSanctuary(world);
    const players = world.entities.filter(entity => entity.kind === 'player');
    assert.equal(players.reduce((sum, player) => sum + player.x, 0) / count, SANCTUARY.spawn.x);
    assert.ok(players.every(player => player.y === SANCTUARY.spawn.y));
    assert.ok(players.slice(1).every((player, i) => player.x - players[i].x === 44));
    assert.ok(players.every(player => SANCTUARY.obstacles.every(obstacle => {
      if (obstacle.shape === 'circle')
        return Math.hypot(player.x - obstacle.x, player.y - obstacle.y) >= player.r + obstacle.r;
      const dx = Math.max(obstacle.x - player.x, 0, player.x - obstacle.x - obstacle.w);
      const dy = Math.max(obstacle.y - player.y, 0, player.y - obstacle.y - obstacle.h);
      return Math.hypot(dx, dy) >= player.r;
    })));
  }
});

test('sanctuary host start uses the noncombat round and filters every guest input', () => {
  const profile = name => ({ lineage: 'human', role: 'hunter', weapon: 'blade',
    rewardSave: createSave({ name, answers: [0, 0, 0, 0, 0], createdAt: 1 }) });
  const guestProfile = profile('Guest');
  const host = new CoopSession({ uid: 'host', host: 'host', players: ['host', 'guest'],
    profile: profile('Host'), config: { stageId: 'SANCTUARY', threat: 1 } });
  const guest = new CoopSession({ uid: 'guest', host: 'host', players: ['host', 'guest'],
    profile: guestProfile, config: { stageId: 'SANCTUARY', threat: 1 } });
  host.rt('guest', { t: 'profile', profile: guest.profile });
  assert.equal(host.phase, 'running');
  assert.equal(host.world.round.goal, 'sanctuary');
  const player = host.world.entities.find(entity => entity.pid === 'guest');
  const x = player.x;
  step(host.world, { guest: { ...emptyInput(), mx: 1, attack: true, autoAttack: true, skillEdge: true,
    skill2Edge: true, skill3Edge: true, dodgeEdge: true, dodgeHeld: true, potionEdge: true, manaEdge: true,
    greenEdge: true, scrollEdge: true } });
  assert.ok(player.x > x);
  assert.equal(player.act, null);
  assert.equal(player.dodge.dashLeft, 0);
  assert.equal(player.terminal, null);
});

test('sanctuary snapshots strip repeated obstacles and guest prediction collides with columns', () => {
  const world = createWorld({ seed: 22, arena: SANCTUARY.arena });
  addPlayer(world, { pid: 'guest' });
  startSanctuary(world);
  const packet = encodeSnapshot(world);
  assert.deepEqual(packet.arena, SANCTUARY.arena);
  const decoded = decodeSnapshot(packet, 'guest');
  assert.ok(decoded);
  assert.equal(decoded.arena.obstacles.length, SANCTUARY.obstacles.length);
  assert.ok(Object.isFrozen(decoded.arena.obstacles));
  assert.ok(Object.isFrozen(decoded.arena.obstacles[0]));
  const column = SANCTUARY.obstacles.find(obstacle => obstacle.shape === 'circle');
  let player = decoded.entities[0];
  player.x = column.x - player.r - 35;
  player.y = column.y;
  for (let i = 0; i < 30; i++)
    player = predictPlayerTick(player, { ...emptyInput(), mx: 1 }, { arena: decoded.arena, tick: i });
  assert.ok(Math.hypot(player.x - column.x, player.y - column.y) >= player.r + column.r - 1e-6);

  const ordinary = createWorld({ seed: 23 });
  addPlayer(ordinary, { pid: 'p' });
  startStage(ordinary, 'S1');
  assert.equal(encodeSnapshot(ordinary).arena, ordinary.arena);
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
