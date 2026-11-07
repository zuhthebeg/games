import assert from 'node:assert/strict';
import test from 'node:test';
import { BUTTONS, completeStage, createStageWorld, hashWorld, leaveStage, setPlayerConnected, step } from '../js/sim/world.js';
import { InputQueue } from '../js/net/input-queue.js';
import { createPredictor } from '../js/net/predictor.js';

function makeParty(count = 2) {
  return Array.from({ length: count }, (_, index) => ({
    playerId: `p${index + 1}`,
    name: `player-${index + 1}`,
    character: { level: index + 1, potions: 5 },
  }));
}

function playersOf(world) {
  return world.entities.filter((entity) => entity.kind === 'player');
}

function enemiesOf(world) {
  return world.entities.filter((entity) => entity.kind === 'enemy');
}

function isolateEnemy(world) {
  const players = playersOf(world);
  const enemy = enemiesOf(world)[0];
  world.entities = [...players, enemy];
  world.roomEnemyIds = [enemy.id];
  enemy.spawnTicksLeft = 0;
  enemy.invulnerable = false;
  enemy.attackCooldownTicks = 10_000;
  return enemy;
}

function neutral(seq, buttons = 0, extra = {}) {
  return { seq, moveX: 0, moveZ: 0, aim: 0, buttons, ...extra };
}

test('party size scales normal and boss HP without changing enemy counts', () => {
  const solo = createStageWorld({ seed: 110, stageId: 'C1' });
  const party = createStageWorld({ seed: 110, stageId: 'C1', party: makeParty(4) });
  const soloEnemies = enemiesOf(solo);
  const partyEnemies = enemiesOf(party);
  assert.equal(partyEnemies.length, soloEnemies.length);
  assert.deepEqual(
    partyEnemies.map((enemy) => enemy.maxHp),
    soloEnemies.map((enemy) => Math.round(enemy.maxHp * 3.25)),
  );

  const soloBoss = createStageWorld({ seed: 111, stageId: 'CB' });
  const partyBoss = createStageWorld({ seed: 111, stageId: 'CB', party: makeParty(2) });
  const bossSolo = enemiesOf(soloBoss).find((enemy) => enemy.boss);
  const bossParty = enemiesOf(partyBoss).find((enemy) => enemy.boss);
  assert.equal(bossParty.maxHp, Math.round(bossSolo.maxHp * 1.75));
});

test('party rewards are per-player and instanced loot is owner-only', () => {
  const world = createStageWorld({ seed: 112, stageId: 'C1', party: makeParty() });
  const [a, b] = playersOf(world);
  const enemy = isolateEnemy(world);
  a.x = 0;
  a.z = 0;
  b.x = 8;
  b.z = 8;
  enemy.x = 1.1;
  enemy.z = 0;
  enemy.hp = 1;
  enemy.maxHp = 1;

  for (let seq = 1; seq <= 20 && !enemy.dead; seq += 1) {
    step(world, { [a.playerId]: neutral(seq, seq === 1 ? BUTTONS.ATTACK : 0) });
  }
  assert.equal(enemy.dead, true);
  assert.ok(world.rewards.p1.xp > 0);
  assert.equal(world.rewards.p1.xp, world.rewards.p2.xp);
  const spawned = world.events.filter((event) => event.type === 'lootSpawn');
  assert.ok(spawned.length >= 2);
  assert.deepEqual(new Set(spawned.map((event) => event.ownerId)), new Set(['p1', 'p2']));
  const otherPlayerLoot = world.entities.filter((entity) => entity.kind === 'loot' && entity.ownerId === b.playerId);
  assert.ok(otherPlayerLoot.length > 0);

  a.x = otherPlayerLoot[0].x;
  a.z = otherPlayerLoot[0].z;
  step(world, { [a.playerId]: neutral(21) });
  assert.ok(world.rewards.p1.gold > 0);
  assert.equal(world.rewards.p2.gold, 0);
  assert.ok(world.entities.some((entity) => entity.kind === 'loot' && entity.ownerId === b.playerId));
});

test('party door countdown waits 90 ticks and teleports connected members together', () => {
  const world = createStageWorld({ seed: 113, stageId: 'C1', party: makeParty() });
  const [a, b] = playersOf(world);
  world.entities = [a, b];
  world.roomEnemyIds = [];
  step(world, {});
  const door = world.arena.doors.find((entry) => entry.fromRoom === world.arena.rooms[0].id);
  a.x = door.x;
  a.z = door.z;
  step(world, {});
  assert.equal(world.doorCountdown.endsTick, world.tick + 90);
  for (let index = 0; index < 89; index += 1) step(world, {});
  assert.equal(world.roomIndex, 0);
  step(world, {});
  assert.equal(world.roomIndex, 1);
  const orderedPlayers = playersOf(world).sort((left, right) => left.id - right.id);
  assert.equal(orderedPlayers[0].x, door.x - 0.45);
  assert.equal(orderedPlayers[1].x, door.x + 0.45);
  assert.equal(orderedPlayers[0].z, door.z - 1.7);
  assert.equal(orderedPlayers[1].z, door.z - 1.7);
});

test('downed players can be revived, lose progress when abandoned, and all-downed parties die', () => {
  const world = createStageWorld({ seed: 114, stageId: 'C1', party: makeParty() });
  const [a, b] = playersOf(world);
  const enemy = isolateEnemy(world);
  a.x = 0;
  a.z = 0;
  a.hp = 1;
  b.x = 8;
  b.z = 8;
  enemy.x = 1;
  enemy.z = 0;
  enemy.attackPhase = 'active';
  enemy.attackCooldownTicks = 0;
  enemy.attackRemaining = 3;
  enemy.attackHit = false;
  enemy.attackShape = { type: 'circle', originX: 0, originZ: 0, radius: 2 };
  step(world, {});
  assert.equal(a.hp, 1);
  assert.equal(world.pendingHits.length, 1);
  step(world, {});
  assert.equal(a.downed, true);
  assert.equal(a.hp, 0);

  enemy.dead = true;
  world.entities = world.entities.filter((entity) => entity.id !== enemy.id);
  a.reviveProgress = 10;
  step(world, {});
  assert.equal(a.reviveProgress, 8);
  b.x = a.x + 1;
  b.z = a.z;
  a.reviveProgress = 59;
  step(world, {});
  assert.equal(a.downed, false);
  assert.equal(a.hp, Math.round(a.maxHp * 0.3));

  const doomed = createStageWorld({ seed: 115, stageId: 'C1', party: makeParty() });
  for (const player of playersOf(doomed)) {
    player.downed = true;
    player.hp = 0;
  }
  step(doomed, {});
  assert.equal(doomed.outcome, 'death');
  assert.deepEqual(Object.keys(doomed.results).sort(), ['p1', 'p2']);
  assert.ok(Object.values(doomed.results).every((result) => result.outcome === 'death'));
});

test('disconnected players are not targeted or moved by submitted input', () => {
  const world = createStageWorld({ seed: 116, stageId: 'C1', party: makeParty() });
  const [disconnected, connected] = playersOf(world);
  const enemy = isolateEnemy(world);
  enemy.enemyKind = 'minion';
  disconnected.x = enemy.x;
  disconnected.z = enemy.z;
  connected.x = enemy.x + 1;
  connected.z = enemy.z;
  setPlayerConnected(world, disconnected.playerId, false);
  const oldPosition = { x: disconnected.x, z: disconnected.z };
  enemy.attackCooldownTicks = 0;
  enemy.attackPhase = null;
  step(world, { [disconnected.playerId]: { seq: 1, moveX: 127, moveZ: 0, aim: 0, buttons: 0 } });
  assert.equal(enemy.attackTargetId, connected.id);
  assert.deepEqual({ x: disconnected.x, z: disconnected.z }, oldPosition);
});

test('leave and settlement preserve independent per-player results', () => {
  const world = createStageWorld({ seed: 117, stageId: 'C1', party: makeParty() });
  world.rewards.p1 = { xp: 21, gold: 11, items: [{ uid: 'a-item' }] };
  world.rewards.p2 = { xp: 42, gold: 8, items: [{ uid: 'b-item' }] };
  const first = leaveStage(world, 'p1');
  assert.equal(first.gold, 5);
  assert.equal(first.goldLost, 6);
  assert.deepEqual(first.lostItems.map((item) => item.uid), ['a-item']);
  assert.equal(world.outcome, null);
  assert.equal(playersOf(world).length, 1);

  const second = leaveStage(world, 'p2');
  assert.equal(second.gold, 4);
  assert.equal(second.goldLost, 4);
  assert.equal(world.outcome, 'retreat');
  assert.equal(world.results.p1.outcome, 'retreat');
  assert.equal(world.results.p2.outcome, 'retreat');
  assert.equal(world.result, undefined);

  const completed = createStageWorld({ seed: 118, stageId: 'C1', party: makeParty() });
  completed.rewards.p1 = { xp: 3, gold: 7, items: [] };
  completed.rewards.p2 = { xp: 5, gold: 13, items: [] };
  const results = completeStage(completed, 'clear');
  assert.equal(results.p1.gold, 7);
  assert.equal(results.p2.gold, 13);
  assert.equal(completed.result, undefined);
});

test('queued enemy hits allow one tick for dodge i-frames', () => {
  const world = createStageWorld({ seed: 119, stageId: 'C1', party: makeParty(1) });
  const player = playersOf(world)[0];
  const enemy = isolateEnemy(world);
  player.x = 0;
  player.z = 0;
  enemy.x = 1;
  enemy.z = 0;
  enemy.attackPhase = 'active';
  enemy.attackCooldownTicks = 0;
  enemy.attackRemaining = 3;
  enemy.attackHit = false;
  enemy.attackShape = { type: 'circle', originX: 0, originZ: 0, radius: 2 };
  const hp = player.hp;
  step(world, { [player.playerId]: neutral(1) });
  assert.equal(world.pendingHits.length, 1);
  assert.equal(player.hp, hp);
  step(world, { [player.playerId]: neutral(2, BUTTONS.DODGE) });
  assert.equal(player.hp, hp);
  assert.equal(world.pendingHits.length, 0);
});

test('viewLag rewinds each strike to the enemy history at server tick minus lag', () => {
  const world = createStageWorld({ seed: 120, stageId: 'C1', playerId: 'a', inputDriven: true });
  const player = playersOf(world)[0];
  const enemy = isolateEnemy(world);
  player.x = 0;
  player.z = 0;
  player.facing = 0;
  player.attack = {
    step: 1,
    seq: 1,
    castId: 'a:1',
    phase: 'active',
    phaseTick: 0,
    queued: false,
    queuedSeq: null,
    hitTargets: [],
    shape: null,
  };
  enemy.x = 4;
  enemy.z = 0;
  enemy.hp = enemy.maxHp = 20;
  world.tick = 20;
  world.enemyHistory = [{
    tick: 20,
    enemies: [{ id: enemy.id, x: 1.2, z: 0, radius: enemy.radius, dead: false }],
  }];

  step(world, { a: neutral(1, 0, { moveX: 127, viewTick: 20 }) });
  assert.equal(player.viewLag, 1);
  assert.ok(enemy.hp < enemy.maxHp, 'historical position at T - viewLag is hit');
  assert.ok(world.events.some((event) => (
    event.type === 'hit' && event.targetId === enemy.id && event.viewLag === 1 && event.tick === 21
  )));

  const currentOnly = createStageWorld({ seed: 121, stageId: 'C1', playerId: 'a', inputDriven: true });
  const currentPlayer = playersOf(currentOnly)[0];
  const currentEnemy = isolateEnemy(currentOnly);
  currentPlayer.x = 0;
  currentPlayer.z = 0;
  currentPlayer.facing = 0;
  currentPlayer.attack = {
    step: 1,
    seq: 1,
    castId: 'a:1',
    phase: 'active',
    phaseTick: 0,
    queued: false,
    queuedSeq: null,
    hitTargets: [],
    shape: null,
  };
  currentEnemy.x = 4;
  currentEnemy.z = 0;
  currentEnemy.hp = currentEnemy.maxHp = 20;
  currentOnly.tick = 20;
  currentOnly.enemyHistory = [{
    tick: 20,
    enemies: [{ id: currentEnemy.id, x: 1.2, z: 0, radius: currentEnemy.radius, dead: false }],
  }];
  step(currentOnly, { a: neutral(1, 0, { moveX: 127, viewTick: 21 }) });
  assert.equal(currentPlayer.viewLag, 0);
  assert.equal(currentEnemy.hp, currentEnemy.maxHp, 'zero lag tests the current enemy position');
});

test('a delayed input burst yields the same final player state as on-time inputs', () => {
  const makeInputDrivenWorld = (seed) => {
    const world = createStageWorld({ seed, stageId: 'C1', playerId: 'a', inputDriven: true });
    const player = playersOf(world)[0];
    world.entities = [player];
    world.roomEnemyIds = [];
    world.roomCleared = true;
    world.openDoors = Object.fromEntries(world.arena.doors.map((door) => [door.id, true]));
    return { world, player };
  };
  const inputs = [
    neutral(1, 0, { moveX: 127 }),
    neutral(2, BUTTONS.DODGE, { moveX: 127 }),
    neutral(3, 0, { moveX: 0, moveZ: 127 }),
    neutral(4, BUTTONS.ATTACK, { moveX: 0, moveZ: 0 }),
    neutral(5, 0),
    neutral(6, 0),
    neutral(7, BUTTONS.ATTACK),
    neutral(8, 0),
    neutral(9, 0),
    neutral(10, 0),
  ];
  const onTime = makeInputDrivenWorld(124);
  const delayed = makeInputDrivenWorld(124);
  const startingTimers = {
    dodgeTicks: 2,
    iFrames: 2,
    dodgeCooldownTicks: 3,
    hitFlashTicks: 4,
    skillCooldowns: { 1: 3, 2: 2, 3: 1 },
    potionCooldownTicks: 3,
    potionTicks: 2,
    potionHealRemaining: 8,
    potionHealTicks: 2,
  };
  for (const world of [onTime, delayed]) {
    world.player.hp = 50;
    Object.assign(world.player, structuredClone(startingTimers));
  }
  for (const input of inputs) step(onTime.world, { a: input });

  const queue = new InputQueue();
  for (const input of inputs) queue.enqueue(input);
  const waitingPlayer = structuredClone(delayed.player);
  for (let tick = 0; tick < 4; tick += 1) step(delayed.world, {});
  assert.deepEqual(delayed.player, waitingPlayer, 'player motion and timers pause without an input');
  while (queue.pendingCount) {
    step(delayed.world, { a: queue.consumeForTick().inputs });
  }

  assert.deepEqual(delayed.player, onTime.player);
});

test('two-player simulations produce the same deterministic world hash', () => {
  const makeWorld = () => createStageWorld({ seed: 122, stageId: 'C1', party: makeParty() });
  const left = makeWorld();
  const right = makeWorld();
  for (let tick = 1; tick <= 240; tick += 1) {
    const inputs = {
      p1: { seq: tick, moveX: tick % 80 < 40 ? 100 : -100, moveZ: 20, aim: tick % 256, buttons: tick % 30 === 0 ? BUTTONS.ATTACK : 0 },
      p2: { seq: tick, moveX: 0, moveZ: tick % 60 < 30 ? 75 : -75, aim: (tick * 3) % 256, buttons: tick % 48 === 0 ? BUTTONS.DODGE : 0 },
    };
    step(left, inputs);
    step(right, inputs);
  }
  assert.equal(hashWorld(left), hashWorld(right));
});

test('predictor matches 600 authoritative motion steps without knockback', () => {
  const world = createStageWorld({ seed: 123, stageId: 'C1', playerId: 'a' });
  const player = playersOf(world)[0];
  world.entities = [player];
  world.roomEnemyIds = [];
  world.openDoors = Object.fromEntries(world.arena.doors.map((door) => [door.id, true]));
  const predictor = createPredictor({
    player: structuredClone(player),
    playerId: player.playerId,
    ctx: { arena: world.arena, openDoors: world.openDoors, tick: world.tick },
  });
  let randomState = 12345;
  const random = () => {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 0x1_0000_0000;
  };
  let previousButtons = 0;
  for (let seq = 1; seq <= 600; seq += 1) {
    const action = random() < 0.18 ? [BUTTONS.ATTACK, BUTTONS.DODGE, BUTTONS.SKILL1, BUTTONS.SKILL2][Math.floor(random() * 4)] : 0;
    const buttons = action && action !== previousButtons ? action : 0;
    previousButtons = buttons;
    const input = {
      seq,
      moveX: Math.round(random() * 254 - 127),
      moveZ: Math.round(random() * 254 - 127),
      aim: Math.floor(random() * 256),
      buttons,
    };
    step(world, { a: input });
    predictor.applyLocalInput(input);
  }
  const predicted = predictor.getPlayer();
  const authoritative = playersOf(world)[0];
  assert.equal(predicted.x, authoritative.x);
  assert.equal(predicted.z, authoritative.z);
  assert.equal(predictor.pendingInputs.length, 600);
  assert.equal(predictor.metrics.correctionsOver03m, 0);
  assert.equal(predictor.metrics.snaps, 0);
});

test('predictor fades small corrections and resets from the next full snapshot after visibility resumes', () => {
  const world = createStageWorld({ seed: 124, stageId: 'C1', playerId: 'a' });
  const player = playersOf(world)[0];
  const predictor = createPredictor({
    player: structuredClone(player),
    playerId: 'a',
    ctx: { arena: world.arena, openDoors: world.openDoors, tick: world.tick },
  });
  const corrected = structuredClone(player);
  corrected.x += 0.4;
  const correction = predictor.reconcile({ player: corrected, ack: -1, tick: 30 }, 0);
  assert.equal(predictor.ctx.tick, 30);
  assert.equal(correction.snapped, false);
  assert.equal(predictor.metrics.correctionsOver03m, 1);
  assert.equal(predictor.getVisualPosition(0).x, player.x);
  assert.equal(predictor.getVisualPosition(120).x, corrected.x);

  predictor.onVisibilityResume();
  corrected.x += 0.1;
  const full = predictor.reconcile({ player: corrected, ack: -1, tick: 32, full: true }, 130);
  assert.equal(full.snapped, true);
  assert.equal(predictor.metrics.snaps, 1);
});

test('predictor snaps errors above two meters without counting them as small corrections', () => {
  const world = createStageWorld({ seed: 125, stageId: 'C1', playerId: 'a' });
  const player = playersOf(world)[0];
  const predictor = createPredictor({
    player: structuredClone(player),
    playerId: 'a',
    ctx: { arena: world.arena, openDoors: world.openDoors, tick: world.tick },
  });
  const authoritative = structuredClone(player);
  authoritative.x += 2.1;
  const correction = predictor.reconcile({ player: authoritative, ack: -1, tick: 30 }, 0);
  assert.equal(correction.snapped, true);
  assert.equal(predictor.metrics.snaps, 1);
  assert.equal(predictor.metrics.correctionsOver03m, 0);
});
