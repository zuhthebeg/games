import assert from 'node:assert/strict';
import test from 'node:test';
import { OBJECTIVE_LABELS, objectiveBonusGold, objectiveExtraSpawns } from '../js/content/objectives.js';
import { RARITIES } from '../js/content/items.js';
import { STAGES } from '../js/content/stages.js';
import {
  completeStage, createStageWorld, hashWorld, playerStrike, step,
} from '../js/sim/world.js';

function neutral(seq) {
  return { seq, moveX: 0, moveZ: 0, aim: 0, buttons: 0 };
}

function inputsFor(world) {
  return Object.fromEntries(
    world.entities
      .filter((entity) => entity.kind === 'player')
      .map((player) => [player.playerId, neutral(world.tick + 1)]),
  );
}

function enterObjectiveRoom(stageId, { party = null, seed = 739 } = {}) {
  const stage = STAGES[stageId];
  const lastRoom = stage.rooms.findIndex((room) => room.objective);
  assert.notEqual(lastRoom, -1);
  const world = createStageWorld({
    seed,
    stageId,
    playerId: 'hero',
    character: { level: stage.recommendedLevel, potions: 5 },
    ...(party ? { party } : {}),
  });
  while (world.roomIndex < lastRoom) {
    const room = world.arena.rooms[world.roomIndex];
    for (const enemy of world.entities) {
      if (enemy.kind === 'enemy' && enemy.currentRoomId === room.id) {
        enemy.dead = true;
        enemy.spawnTicksLeft = 0;
      }
    }
    const door = world.arena.doors.find((entry) => entry.fromRoom === room.id);
    assert.ok(door, `missing exit door for ${room.id}`);
    for (const player of world.entities.filter((entity) => entity.kind === 'player')) {
      player.x = door.x;
      player.z = door.z;
    }
    const previousRoom = world.roomIndex;
    step(world, inputsFor(world));
    for (let tick = 0; world.roomIndex === previousRoom && tick < 100; tick += 1) {
      step(world, inputsFor(world));
    }
    assert.equal(world.roomIndex, previousRoom + 1);
  }
  assert.equal(world.objective?.roomIndex, lastRoom);
  return world;
}

function removeNonObjectiveEnemies(world) {
  for (const enemy of world.entities) {
    if (enemy.kind === 'enemy' && !enemy.objectiveTarget) {
      enemy.dead = true;
      enemy.spawnTicksLeft = 0;
    }
  }
}

function keepPlayersSafeAndFarFromWard(world) {
  const objective = world.objective;
  for (const player of world.entities.filter((entity) => entity.kind === 'player')) {
    player.x = 6;
    player.z = objective.z + 5;
    player.hp = 100_000;
    player.maxHp = 100_000;
    player.iFrames = 10_000;
  }
}

function makeObjectiveEnemyAttack(world, enemy, offset = 1.5) {
  const objective = world.objective;
  enemy.dead = false;
  enemy.spawnTicksLeft = 0;
  enemy.currentRoomId = world.arena.rooms[world.roomIndex].id;
  enemy.x = objective.x;
  enemy.z = objective.z - offset;
  enemy.attackCooldownTicks = 0;
  enemy.attackPhase = null;
  enemy.attackShape = null;
  enemy.hp = 100_000;
  enemy.maxHp = 100_000;
  enemy.defense = 0;
  if (!world.roomEnemyIds.includes(enemy.id)) world.roomEnemyIds.push(enemy.id);
}

function advanceUntil(world, predicate, maxTicks = 600) {
  for (let tick = 0; tick < maxTicks && !predicate(); tick += 1) {
    step(world, inputsFor(world));
  }
  return predicate();
}

test('objective content, labels, bonus gold, and extra-spawn budgets match stage data', () => {
  assert.deepEqual(OBJECTIVE_LABELS, {
    hunt: '현상수배',
    defend: '결계석 방어',
    channel: '봉인 의식',
  });
  const expected = {
    C2: { type: 'hunt', target: 'warrior', timeSec: 40 },
    C3: { type: 'defend', hp: 300, spawns: [[8, 'minion', 3], [16, 'rogue', 2], [24, 'minion', 3]] },
    F2: { type: 'channel', radius: 2.4, channelSec: 12, spawns: [[4, 'minion', 2], [9, 'bonearcher', 1], [14, 'minion', 3]] },
    F3: { type: 'hunt', target: 'brute', timeSec: 45 },
    K2: { type: 'defend', hp: 500, spawns: [[8, 'minion', 3], [16, 'bonearcher', 2], [24, 'shieldbearer', 1], [24, 'minion', 2]] },
    K3: { type: 'channel', radius: 2.4, channelSec: 15, spawns: [[4, 'minion', 3], [10, 'mage', 1], [10, 'minion', 2], [16, 'shieldbearer', 1]] },
  };
  for (const [stageId, wanted] of Object.entries(expected)) {
    const stage = STAGES[stageId];
    const objective = stage.rooms.at(-1).objective;
    assert.equal(objective.type, wanted.type);
    if (wanted.target) assert.deepEqual(
      { target: objective.target, timeSec: objective.timeSec },
      { target: wanted.target, timeSec: wanted.timeSec },
    );
    if (wanted.hp) assert.equal(objective.hp, wanted.hp);
    if (wanted.radius) assert.equal(objective.radius, wanted.radius);
    if (wanted.channelSec) assert.equal(objective.channelSec, wanted.channelSec);
    if (wanted.spawns) {
      assert.deepEqual(
        objective.spawns.map((spawn) => [spawn.atSec, spawn.enemy, spawn.count]),
        wanted.spawns,
      );
    }
    const expectedSpawns = wanted.target
      ? [{ enemy: wanted.target, count: 1 }]
      : wanted.spawns.map(([, enemy, count]) => ({ enemy, count }));
    assert.deepEqual(objectiveExtraSpawns(objective), expectedSpawns);
    assert.equal(objectiveBonusGold(stage), Math.round(15 * stage.stageLevel));
  }
  for (const stageId of ['C1', 'F1', 'K1', 'CB', 'FB', 'KB']) {
    assert.equal(STAGES[stageId].rooms.some((room) => room.objective), false);
  }
});

test('an objective in room zero initializes during stage creation', () => {
  const room = STAGES.C1.rooms[0];
  const previousObjective = room.objective;
  room.objective = { type: 'hunt', target: 'warrior', timeSec: 40 };
  try {
    const world = createStageWorld({ seed: 800, stageId: 'C1', playerId: 'hero' });
    assert.equal(world.objective.type, 'hunt');
    assert.equal(world.objective.roomIndex, 0);
    assert.equal(world.objective.state, 'active');
    assert.equal(world.objective.startTick, world.tick);
    assert.equal(world.entities.find((entity) => entity.id === world.objective.targetId).bounty, true);
  } finally {
    if (previousObjective === undefined) delete room.objective;
    else room.objective = previousObjective;
  }
});

test('entering a hunt room spawns a bounty target, then success grants owner-scoped rare rewards', () => {
  const stage = STAGES.C2;
  const party = [
    { playerId: 'hero', name: 'hero', character: { level: stage.recommendedLevel, potions: 5 } },
    { playerId: 'guest', name: 'guest', character: { level: stage.recommendedLevel, potions: 5 } },
  ];
  const world = enterObjectiveRoom('C2', { party, seed: 801 });
  const objective = world.objective;
  const target = world.entities.find((entity) => entity.id === objective.targetId);
  assert.equal(objective.type, 'hunt');
  assert.equal(target.bounty, true);
  assert.equal(target.elite, true);
  assert.equal(target.objectiveTarget, undefined);
  assert.equal(objective.endsTick - objective.startTick, 40 * 30);

  const player = world.entities.find((entity) => entity.kind === 'player' && entity.playerId === 'hero');
  target.hp = 1;
  target.defense = 0;
  target.invulnerable = false;
  target.spawnTicksLeft = 0;
  target.x = player.x + 0.5;
  target.z = player.z;
  playerStrike(
    world,
    player,
    { type: 'circle', originX: target.x, originZ: target.z, radius: 1 },
    1,
    'objective-hunt-test',
    [],
    undefined,
    { rewind: false },
  );

  assert.equal(target.dead, true);
  assert.equal(objective.state, 'success');
  for (const memberId of ['hero', 'guest']) {
    const owned = world.entities.filter((entity) => entity.kind === 'loot' && entity.ownerId === memberId);
    assert.ok(owned.some((loot) => loot.lootType === 'gold' && loot.gold === objectiveBonusGold(stage)));
    const items = owned.filter((loot) => loot.lootType === 'item').map((loot) => loot.item);
    assert.ok(items.some((item) => Object.keys(RARITIES).indexOf(item.rarity) >= Object.keys(RARITIES).indexOf('rare')));
  }
  completeStage(world, 'clear');
  for (const memberId of ['hero', 'guest']) {
    assert.deepEqual(world.results[memberId].objective, { type: 'hunt', success: true });
    assert.ok(world.results[memberId].gold >= objectiveBonusGold(stage));
    assert.ok(world.results[memberId].items.some((item) => (
      Object.keys(RARITIES).indexOf(item.rarity) >= Object.keys(RARITIES).indexOf('rare')
    )));
  }
});

test('hunt timeout fails without removing its living target', () => {
  const world = enterObjectiveRoom('C2', { seed: 802 });
  const target = world.entities.find((entity) => entity.id === world.objective.targetId);
  world.objective.endsTick = world.tick + 1;
  step(world, inputsFor(world));
  assert.equal(world.objective.state, 'failed');
  assert.equal(target.dead, false);
  assert.ok(world.roomEnemyIds.includes(target.id));
  assert.equal(world.roomCleared, false);
  assert.ok(world.events.some((event) => (
    event.type === 'objectiveFailed' && event.objectiveType === 'hunt'
  )));
  completeStage(world, 'retreat');
  assert.deepEqual(world.result.objective, { type: 'hunt', success: false });
});

test('defend objective spawns are indexed into the room and objective minions damage the ward', () => {
  const world = enterObjectiveRoom('C3', { seed: 803 });
  const objective = world.objective;
  removeNonObjectiveEnemies(world);
  keepPlayersSafeAndFarFromWard(world);
  const firstSpawnTick = objective.pendingSpawns[0].tick;
  while (world.tick < firstSpawnTick) step(world, inputsFor(world));
  const minions = world.entities.filter((entity) => entity.kind === 'enemy' && entity.objectiveTarget);
  assert.equal(minions.length, 3);
  assert.ok(minions.every((enemy) => world.roomEnemyIds.includes(enemy.id)));
  const minion = minions[0];
  for (const other of minions.slice(1)) other.dead = true;
  makeObjectiveEnemyAttack(world, minion);
  const initialHp = objective.hp;
  assert.equal(advanceUntil(world, () => objective.hp < initialHp, 180), true);
  assert.ok(world.events.some((event) => event.type === 'objectiveWardHit' && event.sourceId === minion.id));
});

test('K2 objective bonearchers damage the ward, while ordinary enemies do not', () => {
  const world = enterObjectiveRoom('K2', { seed: 804 });
  removeNonObjectiveEnemies(world);
  keepPlayersSafeAndFarFromWard(world);
  const objective = world.objective;
  const roomId = world.arena.rooms[world.roomIndex].id;
  const ordinary = world.entities.find((entity) => entity.kind === 'enemy'
    && entity.currentRoomId === roomId && entity.enemyKind === 'minion' && !entity.objectiveTarget);
  assert.ok(ordinary);
  ordinary.objectiveTarget = false;
  makeObjectiveEnemyAttack(world, ordinary);
  world.pendingHits.push({
    resolveTick: world.tick + 1,
    sourceId: ordinary.id,
    targetId: -1,
    shape: { type: 'circle', originX: objective.x, originZ: objective.z, radius: 1 },
    motionMult: 1,
  });
  const beforeOrdinaryHit = objective.hp;
  step(world, inputsFor(world));
  assert.equal(objective.hp, beforeOrdinaryHit);
  const ordinaryWardHp = objective.hp;
  assert.equal(advanceUntil(world, () => objective.hp < ordinaryWardHp, 90), false);

  const archerTick = objective.pendingSpawns.find((spawn) => spawn.enemy === 'bonearcher').tick;
  while (world.tick < archerTick - 1) {
    for (const enemy of world.entities) {
      if (enemy.kind === 'enemy' && enemy.objectiveTarget) enemy.dead = true;
    }
    step(world, inputsFor(world));
  }

  while (world.tick < archerTick) step(world, inputsFor(world));
  const archer = world.entities.find((entity) => entity.kind === 'enemy' && entity.enemyKind === 'bonearcher'
    && entity.objectiveTarget && !entity.dead);
  assert.ok(archer);
  for (const enemy of world.entities) {
    if (enemy.kind === 'enemy' && enemy.objectiveTarget && enemy.id !== archer.id) enemy.dead = true;
  }
  makeObjectiveEnemyAttack(world, archer, 4.5);
  const before = objective.hp;
  assert.equal(advanceUntil(world, () => objective.hp < before, 240), true);
  assert.ok(world.events.some((event) => event.type === 'objectiveWardHit' && event.sourceId === archer.id));

  const queuedHit = {
    resolveTick: world.tick + 1,
    sourceId: archer.id,
    targetId: -1,
    shape: { type: 'circle', originX: objective.x, originZ: objective.z, radius: 1 },
  };
  const beforeDeadHit = objective.hp;
  archer.dead = true;
  world.pendingHits.push({ ...queuedHit });
  step(world, inputsFor(world));
  assert.equal(objective.hp, beforeDeadHit);

  const beforeMissingHit = objective.hp;
  world.entities = world.entities.filter((entity) => entity.id !== archer.id);
  world.pendingHits.push({ ...queuedHit, resolveTick: world.tick + 1 });
  step(world, inputsFor(world));
  assert.equal(objective.hp, beforeMissingHit);
});

test('ward failure and pending-spawn room-clear gating are deterministic', () => {
  const world = enterObjectiveRoom('C3', { seed: 805 });
  const objective = world.objective;
  removeNonObjectiveEnemies(world);
  keepPlayersSafeAndFarFromWard(world);
  const firstSpawnTick = objective.pendingSpawns[0].tick;
  while (world.tick < firstSpawnTick) step(world, inputsFor(world));
  const minion = world.entities.find((entity) => entity.kind === 'enemy' && entity.objectiveTarget);
  assert.ok(minion);
  makeObjectiveEnemyAttack(world, minion);
  objective.hp = 1;
  assert.equal(advanceUntil(world, () => objective.state === 'failed', 180), true);
  assert.equal(objective.hp, 0);
  assert.equal(world.roomCleared, false);
  assert.ok(world.events.some((event) => event.type === 'objectiveWardHit' && event.hp === 0));
});

test('channel success advances in-zone, cancels future additions, and settles rewards', () => {
  const stage = STAGES.F2;
  const party = [
    { playerId: 'hero', name: 'hero', character: { level: stage.recommendedLevel, potions: 5 } },
    { playerId: 'guest', name: 'guest', character: { level: stage.recommendedLevel, potions: 5 } },
  ];
  const world = enterObjectiveRoom('F2', { party, seed: 806 });
  const objective = world.objective;
  removeNonObjectiveEnemies(world);
  for (const player of world.entities.filter((entity) => entity.kind === 'player')) {
    player.x = objective.x;
    player.z = objective.z;
    player.hp = 100_000;
    player.maxHp = 100_000;
    player.iFrames = 10_000;
  }
  while (world.tick < objective.startTick + objective.required) {
    for (const player of world.entities.filter((entity) => entity.kind === 'player')) {
      player.x = objective.x;
      player.z = objective.z;
    }
    step(world, inputsFor(world));
  }
  assert.equal(objective.state, 'success');
  assert.equal(objective.progress, objective.required);
  assert.equal(objective.nextSpawnIndex, objective.pendingSpawns.length);
  assert.ok(world.events.some((event) => (
    event.type === 'objectiveComplete' && event.objectiveType === 'channel'
  )));
  const roomEnemyCountAtSuccess = world.roomEnemyIds.length;
  while (world.tick <= objective.startTick + 14 * 30) step(world, inputsFor(world));
  assert.equal(world.roomEnemyIds.length, roomEnemyCountAtSuccess);
  completeStage(world, 'clear');
  for (const memberId of ['hero', 'guest']) {
    assert.deepEqual(world.results[memberId].objective, { type: 'channel', success: true });
    assert.equal(world.results[memberId].gold, objectiveBonusGold(stage));
    assert.equal(world.results[memberId].items.length, 1);
    assert.ok(Object.keys(RARITIES).indexOf(world.results[memberId].items[0].rarity)
      >= Object.keys(RARITIES).indexOf('rare'));
  }
});

test('channel progress requires a living connected player in its zone', () => {
  const world = enterObjectiveRoom('F2', { seed: 807 });
  const player = world.entities.find((entity) => entity.kind === 'player');
  player.x = world.objective.x + world.objective.radius + 1;
  player.z = world.objective.z;
  const startingProgress = world.objective.progress;
  step(world, inputsFor(world));
  assert.equal(world.objective.progress, startingProgress);
  player.x = world.objective.x;
  player.z = world.objective.z;
  player.connected = false;
  step(world, inputsFor(world));
  assert.equal(world.objective.progress, startingProgress);
});

test('channel fails after all additions fire and the room is empty before completion', () => {
  const world = enterObjectiveRoom('F2', { seed: 810 });
  const objective = world.objective;
  removeNonObjectiveEnemies(world);
  keepPlayersSafeAndFarFromWard(world);
  const lastSpawnTick = objective.pendingSpawns.at(-1).tick;
  while (world.tick < lastSpawnTick) step(world, inputsFor(world));
  assert.equal(objective.nextSpawnIndex, objective.pendingSpawns.length);
  for (const enemy of world.entities) {
    if (enemy.kind === 'enemy') enemy.dead = true;
  }
  step(world, inputsFor(world));
  assert.equal(objective.progress, 0);
  assert.equal(objective.state, 'failed');
});

test('objective active additions hold room clear; failed objectives release the gate', () => {
  const world = enterObjectiveRoom('C3', { seed: 808 });
  const objective = world.objective;
  removeNonObjectiveEnemies(world);
  for (const enemy of world.entities) {
    if (enemy.kind === 'enemy') enemy.dead = true;
  }
  world.roomCleared = false;
  while (world.tick < objective.pendingSpawns[0].tick - 1) step(world, inputsFor(world));
  assert.equal(world.roomCleared, false);
  objective.state = 'failed';
  step(world, inputsFor(world));
  assert.equal(world.roomCleared, true);
});

test('same-seed objective clears produce identical world hashes', () => {
  const run = () => {
    const world = enterObjectiveRoom('F2', { seed: 809 });
    const objective = world.objective;
    for (const player of world.entities.filter((entity) => entity.kind === 'player')) {
      player.x = objective.x;
      player.z = objective.z;
      player.hp = 100_000;
      player.maxHp = 100_000;
      player.iFrames = 10_000;
    }
    while (world.objective.state === 'active') {
      for (const player of world.entities.filter((entity) => entity.kind === 'player')) {
        player.x = objective.x;
        player.z = objective.z;
      }
      step(world, inputsFor(world));
    }
    completeStage(world, 'clear');
    return hashWorld(world);
  };
  assert.equal(run(), run());
});
