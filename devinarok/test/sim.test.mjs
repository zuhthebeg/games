import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { ARENA } from '../js/sim/arena.js';
import {
  BUTTONS,
  COMBO_TIMELINES,
  addPlayer,
  createWorld,
  hashWorld,
  spawnEnemy,
  step,
} from '../js/sim/world.js';

const projectDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const simDir = resolve(projectDir, 'js/sim');

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : [path];
  }));
  return nested.flat().filter((path) => path.endsWith('.js'));
}

function inputFor(tick) {
  const attack = tick % 24 === 0 ? BUTTONS.ATTACK : 0;
  const dodge = tick % 120 === 48 ? BUTTONS.DODGE : 0;
  return {
    seq: tick + 1,
    moveX: tick % 180 < 90 ? 60 : -60,
    moveZ: tick % 150 < 75 ? -36 : 36,
    aim: (tick * 7) % 256,
    buttons: attack | dodge,
  };
}

function tick(world, playerId, input) {
  step(world, { [playerId]: input });
}

function advanceToChainWindow(world, player, startSeq) {
  let seq = startSeq;
  const timeline = COMBO_TIMELINES[player.attack.step - 1];
  while (
    player.attack &&
    !(player.attack.phase === 'recovery' &&
      player.attack.phaseTick >= timeline.recoveryTicks - timeline.chainWindowTicks)
  ) {
    tick(world, player.playerId, {
      seq: seq++,
      moveX: 0,
      moveZ: 0,
      aim: 192,
      buttons: 0,
    });
  }
  return seq;
}

test('simulation source is isolated from browser, clock, and random globals', async () => {
  const files = await sourceFiles(simDir);
  const forbidden = /\b(?:window|document|performance|Date|requestAnimationFrame|localStorage|indexedDB)\b|Math\.random/;
  const importPattern = /\b(?:import|export)\s+(?:[^'"]*?\s+from\s*)?['"]([^'"]+)['"]/g;

  for (const file of files) {
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(source, forbidden, `${relative(projectDir, file)} uses a forbidden global`);
    for (const match of source.matchAll(importPattern)) {
      const specifier = match[1];
      assert.ok(specifier.startsWith('.'), `${relative(projectDir, file)} has non-relative import ${specifier}`);
      const resolved = resolve(dirname(file), specifier);
      const rel = relative(simDir, resolved);
      assert.ok(rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..'), `${specifier} escapes js/sim`);
    }
  }
});

test('every simulation obstacle has a GLB prop at the same position', () => {
  const propsByObstacle = new Map(
    ARENA.props.filter((prop) => prop.obstacleId).map((prop) => [prop.obstacleId, prop]),
  );
  assert.equal(propsByObstacle.size, ARENA.obstacles.length);
  for (const obstacle of ARENA.obstacles) {
    const prop = propsByObstacle.get(obstacle.id);
    assert.ok(prop, `${obstacle.id} has a rendered prop`);
    assert.ok(prop.model.endsWith('.glb'));
    assert.equal(prop.x, obstacle.x);
    assert.equal(prop.z, obstacle.z);
  }
});

test('seeded worlds match after 900 ticks and continue identically after a structured clone', () => {
  const world = createWorld({ seed: 2741 });
  addPlayer(world, { playerId: 'hero', characterKind: 'knight' });
  let replay = null;
  for (let index = 0; index < 900; index += 1) {
    const input = inputFor(index);
    tick(world, 'hero', input);
    if (index === 449) replay = structuredClone(world);
    if (replay && index > 449) tick(replay, 'hero', input);
  }

  const twin = createWorld({ seed: 2741 });
  addPlayer(twin, { playerId: 'hero', characterKind: 'knight' });
  for (let index = 0; index < 900; index += 1) tick(twin, 'hero', inputFor(index));

  assert.equal(hashWorld(world), hashWorld(twin));
  assert.equal(hashWorld(world), hashWorld(replay));
  assert.ok(world.events.length <= 128);
});

test('attack edges start one three-step combo and each step keeps its initiating cast ID', () => {
  const world = createWorld({ seed: 8 });
  const player = addPlayer(world, { playerId: 'hero' });
  const casts = [];
  const send = (seq, buttons) => {
    tick(world, 'hero', { seq, moveX: 0, moveZ: 0, aim: 192, buttons });
    casts.push(...world.events.filter((event) => event.type === 'cast' && !casts.some((seen) => seen.eventId === event.eventId)));
  };

  send(1, BUTTONS.ATTACK);
  send(2, BUTTONS.ATTACK);
  assert.equal(world.events.filter((event) => event.type === 'cast').length, 1);

  let seq = advanceToChainWindow(world, player, 3);
  send(seq, BUTTONS.ATTACK);
  assert.equal(player.attack.queued, true);
  const secondSeq = seq;
  send(++seq, 0);
  while (player.attack?.step !== 2) send(++seq, 0);
  assert.equal(player.attack.castId, `hero:${secondSeq}`);

  seq = advanceToChainWindow(world, player, seq + 1);
  send(seq, BUTTONS.ATTACK);
  const thirdSeq = seq;
  send(++seq, 0);
  while (player.attack?.step !== 3) send(++seq, 0);
  assert.equal(player.attack.castId, `hero:${thirdSeq}`);
  assert.deepEqual(casts.map((event) => event.castId), ['hero:1', `hero:${secondSeq}`, `hero:${thirdSeq}`]);
});

test('a three-step combo kills a Skeleton_Minion', () => {
  const world = createWorld({ seed: 81 });
  const player = addPlayer(world, { playerId: 'hero' });
  const minion = world.entities.find((entity) => entity.kind === 'enemy' && entity.enemyKind === 'Skeleton_Minion');
  player.x = 0;
  player.z = 8;
  player.facing = -Math.PI / 2;
  minion.x = 0;
  minion.z = 6.8;
  minion.spawnTicksLeft = 0;
  minion.invulnerable = false;
  let seq = 1;
  const send = (buttons) => {
    tick(world, 'hero', { seq: seq++, moveX: 0, moveZ: 0, aim: 192, buttons });
  };
  send(BUTTONS.ATTACK);
  for (let step = 1; step < COMBO_TIMELINES.length; step += 1) {
    seq = advanceToChainWindow(world, player, seq);
    send(BUTTONS.ATTACK);
    while (player.attack?.step === step) send(0);
  }
  while (player.attack && !minion.dead) send(0);
  const hits = world.events.filter((event) => event.type === 'hit' && event.targetId === minion.id);
  const death = world.events.find((event) => event.type === 'death' && event.entityId === minion.id);
  assert.equal(hits.length, 3);
  assert.deepEqual(hits.map((event) => event.damage), [1, 1, 2]);
  assert.equal(minion.dead, true);
  assert.equal(death.castId, hits.at(-1).castId);
  for (let count = 0; count < 24; count += 1) tick(world, 'hero', { seq: seq++, moveX: 0, moveZ: 0, aim: 192, buttons: 0 });
  assert.equal(world.entities.some((entity) => entity.id === minion.id), false);
});

test('dodging through an active enemy shape blocks damage during its i-frames', () => {
  const world = createWorld({ seed: 15 });
  const player = addPlayer(world, { playerId: 'hero' });
  const enemy = world.entities.find((entity) => entity.kind === 'enemy');
  player.x = 0;
  player.z = 0;
  enemy.x = 1;
  enemy.z = 0;
  enemy.spawnTicksLeft = 0;
  enemy.invulnerable = false;
  enemy.attackPhase = 'active';
  enemy.attackRemaining = 3;
  enemy.attackHit = false;
  enemy.attackShape = {
    type: 'sector',
    originX: 1,
    originZ: 0,
    angle: Math.PI,
    range: 1.6,
    halfAngle: 0.8,
  };
  const hp = player.hp;

  tick(world, 'hero', { seq: 1, moveX: 0, moveZ: 0, aim: 192, buttons: BUTTONS.DODGE });
  assert.equal(player.hp, hp);
  assert.ok(player.iFrames > 0);
  assert.ok(player.dodgeCooldownTicks > 0);
  assert.ok(world.events.some((event) => event.type === 'hit' && event.blocked));
});

test('enemy telegraph and damage use the same stored attack shape', () => {
  const world = createWorld({ seed: 21 });
  const player = addPlayer(world, { playerId: 'hero' });
  const enemy = world.entities.find((entity) => entity.kind === 'enemy');
  player.x = 0;
  player.z = 0;
  enemy.x = 1;
  enemy.z = 0;
  enemy.spawnTicksLeft = 0;
  enemy.invulnerable = false;

  tick(world, 'hero', { seq: 1, moveX: 0, moveZ: 0, aim: 192, buttons: 0 });
  assert.equal(enemy.attackPhase, 'windup');
  assert.ok(enemy.attackWindupTicks >= 12);
  const telegraph = structuredClone(enemy.attackShape);
  const hitStart = world.events.length;
  for (let index = 0; index < enemy.attackWindupTicks + 8; index += 1) {
    tick(world, 'hero', { seq: index + 2, moveX: 0, moveZ: 0, aim: 192, buttons: 0 });
  }

  const hit = world.events.slice(hitStart).find((event) => event.type === 'hit' && event.sourceId === enemy.id);
  assert.ok(hit);
  assert.deepEqual(hit.shape, telegraph);
  assert.equal(player.hp, player.maxHp - 12);
});

test('events are monotonic, bounded, and casts identify the input sequence', () => {
  const world = createWorld({ seed: 42 });
  addPlayer(world, { playerId: 'hero' });
  tick(world, 'hero', { seq: 73, moveX: 0, moveZ: 0, aim: 192, buttons: BUTTONS.ATTACK });
  assert.ok(world.events.some((event) => event.type === 'cast' && event.castId === 'hero:73'));
  for (let index = 0; index < 140; index += 1) {
    spawnEnemy(world, 'Skeleton_Minion', { x: -6 + (index % 5), z: -2 + (index % 7) });
  }

  const ids = world.events.map((event) => event.eventId);
  assert.equal(ids.length, 128);
  assert.ok(ids.every((id, index) => index === 0 || id > ids[index - 1]));
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(world.nextEventId > ids.at(-1));
});
