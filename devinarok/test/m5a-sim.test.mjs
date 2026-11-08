import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BUTTONS,
  createStageWorld,
  stepPlayerMotion,
  step,
} from '../js/sim/world.js';

const FAMILY_WEAPONS = {
  sword: 'rusted-sword',
  crossbow: 'rusted-crossbow',
  staff: 'apprentice-wand',
};

function makeWorld(family = 'sword', targetDistance = 1.2) {
  const world = createStageWorld({
    seed: 91,
    stageId: 'C1',
    playerId: 'hero',
    inputDriven: true,
    character: {
      level: 1,
      equipment: [{ itemId: FAMILY_WEAPONS[family], rarity: 'common' }],
    },
  });
  const player = world.entities.find((entity) => entity.kind === 'player');
  const enemy = world.entities.find((entity) => entity.kind === 'enemy');
  world.entities = world.entities.filter((entity) => entity.id === player.id || entity.id === enemy.id);
  world.roomEnemyIds = [enemy.id];
  world.pendingHits = [];
  world.pendingImpacts = [];
  world.enemyHistory = [];
  player.facing = 0;
  enemy.x = player.x + targetDistance;
  enemy.z = player.z;
  enemy.radius = 0.2;
  enemy.hp = 1000;
  enemy.maxHp = 1000;
  enemy.defense = 0;
  enemy.spawnTicksLeft = 0;
  enemy.invulnerable = false;
  enemy.dead = false;
  enemy.stunnedTicks = 1000;
  enemy.attackPhase = null;
  enemy.attackCooldownTicks = 1000;
  return { world, player, enemy };
}

function tick(world, buttons = 0, extra = {}) {
  step(world, {
    hero: {
      seq: world.tick + 1,
      moveX: 0,
      moveZ: 0,
      aim: 0,
      buttons,
      ...extra,
    },
  });
}

function addIncomingHit(world, player, sourceId, resolveTick = world.tick + 1) {
  world.pendingHits.push({
    resolveTick,
    sourceId,
    targetId: player.id,
    shape: { type: 'sector', originX: player.x + 1, originZ: player.z, angle: Math.PI, range: 2, halfAngle: 1 },
    motionMult: 1,
    knockback: 0,
  });
}

function perfectAtAge(age, partySize = 1) {
  const { world, player, enemy } = makeWorld();
  world.partySize = partySize;
  tick(world, BUTTONS.DODGE);
  const dodgeStartTick = player.dodgeStartTick;
  const resolveTick = dodgeStartTick + age;
  while (world.tick < resolveTick - 1) tick(world);
  addIncomingHit(world, player, enemy.id, resolveTick);
  tick(world);
  return { world, player, enemy };
}

test('perfect dodge window is five solo ticks and seven party ticks', () => {
  for (const [age, partySize, expected] of [
    [4, 1, true],
    [5, 1, false],
    [6, 2, true],
    [7, 2, false],
  ]) {
    const { world } = perfectAtAge(age, partySize);
    assert.equal(world.events.some((event) => event.type === 'perfectDodge'), expected, `${partySize} players at age ${age}`);
  }
});

test('a dodge pays once, grants readiness, and refunds half its cooldown once', () => {
  const { world, player, enemy } = makeWorld();
  tick(world, BUTTONS.DODGE);
  assert.equal(player.dodgeCooldownTicks, 35);
  addIncomingHit(world, player, enemy.id);
  tick(world);
  assert.equal(player.counterReadyTicks, 60);
  assert.equal(player.dodgeCooldownTicks, 16);
  addIncomingHit(world, player, enemy.id);
  tick(world);
  assert.equal(world.events.filter((event) => event.type === 'perfectDodge').length, 1);
  assert.equal(player.dodgeCooldownTicks, 15);
});

test('self and ally sources do not award a perfect dodge', () => {
  for (const source of ['self', 'ally']) {
    const { world, player } = makeWorld();
    const ally = source === 'ally'
      ? world.entities.push({
        ...structuredClone(player),
        id: world.nextEntityId++,
        playerId: 'ally',
      }) && world.entities.at(-1)
      : player;
    tick(world, BUTTONS.DODGE);
    addIncomingHit(world, player, ally.id);
    tick(world);
    assert.equal(world.events.some((event) => event.type === 'perfectDodge'), false, source);
  }
});

test('sword, crossbow, and staff counters guarantee a critical and consume readiness', () => {
  for (const [family, distance, expectedMotion, expectedShape] of [
    ['sword', 2.4, 1.8, { type: 'line', length: 3.5, width: 1.6 }],
    ['crossbow', 4, 2.0, { type: 'line', length: 12, width: 0.8 }],
    ['staff', 2.4, 1.6, { type: 'circle', radius: 2.8 }],
  ]) {
    const { world, player, enemy } = makeWorld(family, distance);
    tick(world);
    enemy.x += 100;
    const positionBeforeCounter = { x: player.x, z: player.z };
    player.counterReadyTicks = 60;
    player.counterAttackerId = enemy.id;
    tick(world, BUTTONS.ATTACK, { viewTick: world.tick });

    assert.deepEqual({ x: player.x, z: player.z }, positionBeforeCounter);
    const cast = world.events.find((event) => event.type === 'cast' && event.skillId === 'counter');
    const strike = world.events.find((event) => event.type === 'strike' && event.skill === 'counter');
    const hit = world.events.find((event) => event.type === 'hit' && event.targetId === enemy.id);
    assert.ok(cast, `${family} emits a counter cast`);
    assert.equal(cast.family, family);
    assert.equal(cast.castId, `hero:${world.tick}`);
    assert.ok(strike, `${family} emits a strike`);
    assert.equal(strike.shape.type, expectedShape.type);
    if (expectedShape.type === 'line') {
      assert.equal(strike.shape.length, expectedShape.length);
      assert.equal(strike.shape.width, expectedShape.width);
    } else assert.equal(strike.shape.radius, expectedShape.radius);
    assert.equal(hit?.critical, true, `${family} counter is a guaranteed critical`);
    assert.equal(player.counterReadyTicks, 0);
    if (family === 'staff') assert.ok(enemy.slowTicks > 0);
  }
});

test('sword counter is an in-place line strike toward the attacker or facing fallback', () => {
  const { world, player, enemy } = makeWorld('sword', 2.4);
  const start = { x: player.x, z: player.z };
  player.counterReadyTicks = 60;
  player.counterAttackerId = enemy.id;
  const strike = stepPlayerMotion(world, player, {
    seq: 1,
    moveX: 0,
    moveZ: 0,
    buttons: BUTTONS.ATTACK,
    viewTick: world.tick,
  }).counterStrike;
  assert.equal(strike.motionMult, 1.8);
  assert.equal(strike.shape.originX, start.x);
  assert.equal(strike.shape.originZ, start.z);
  assert.equal(strike.shape.angle, 0);
  assert.equal(strike.shape.length, 3.5);
  assert.equal(strike.shape.width, 1.6);
  assert.deepEqual({ x: player.x, z: player.z }, start);

  const deadAttacker = makeWorld('sword', 2.4);
  deadAttacker.enemy.dead = true;
  deadAttacker.player.facing = 1.1;
  deadAttacker.player.counterReadyTicks = 60;
  deadAttacker.player.counterAttackerId = deadAttacker.enemy.id;
  const fallback = stepPlayerMotion(deadAttacker.world, deadAttacker.player, {
    seq: 1,
    moveX: 0,
    moveZ: 0,
    buttons: BUTTONS.ATTACK,
    viewTick: deadAttacker.world.tick,
  }).counterStrike;
  assert.equal(fallback.shape.angle, deadAttacker.player.facing);
});

test('counter hits use lag-compensated enemy history', () => {
  const { world, player, enemy } = makeWorld('crossbow', 4);
  tick(world, 0, { viewTick: 0 });
  const historicalX = enemy.x;
  enemy.x += 100;
  player.counterReadyTicks = 60;
  player.counterAttackerId = enemy.id;
  tick(world, BUTTONS.ATTACK, { viewTick: world.tick });
  assert.ok(enemy.x !== historicalX);
  assert.ok(world.events.some((event) => event.type === 'hit' && event.targetId === enemy.id && event.critical));
});

test('dodge cancels a basic attack during windup before it can deal damage', () => {
  const { world, player, enemy } = makeWorld();
  const hp = enemy.hp;
  tick(world, BUTTONS.ATTACK);
  assert.equal(player.attack.phase, 'windup');
  tick(world, BUTTONS.DODGE);
  assert.equal(player.attack, null);
  assert.ok(player.dodgeTicks > 0);
  assert.equal(enemy.hp, hp);
});

test('attack pressed during a dodge starts as it does on the pre-M5a simulation', () => {
  const { world, player } = makeWorld();
  tick(world, BUTTONS.DODGE);
  assert.ok(player.dodgeTicks > 0);
  tick(world, BUTTONS.ATTACK);
  assert.equal(player.attack?.phase, 'windup');
});

test('recovery dodge starts immediately without cancelling the attack state', () => {
  const { world, player, enemy } = makeWorld('staff', 2.4);
  tick(world, BUTTONS.ATTACK);
  while (player.attack.phase === 'windup') tick(world);
  tick(world);
  assert.equal(player.attack.phase, 'recovery');
  const hp = enemy.hp;
  tick(world, BUTTONS.DODGE);
  assert.equal(player.attack.phase, 'recovery');
  assert.ok(player.dodgeTicks > 0);
  assert.equal(world.pendingImpacts.length, 1);
  for (let index = 0; index < 10; index += 1) tick(world);
  assert.ok(enemy.hp < hp);
});

test('a recovery dodge preserves the combo chain window', () => {
  const { world, player } = makeWorld();
  tick(world, BUTTONS.ATTACK);
  while (player.attack.phase === 'windup') tick(world);
  while (player.attack.phase === 'active') tick(world);
  while (player.attack.phaseTick < 4) tick(world);
  tick(world, BUTTONS.ATTACK | BUTTONS.DODGE);
  assert.ok(player.dodgeTicks > 0);
  assert.equal(player.attack.phase, 'recovery');
  assert.equal(player.attack.queued, true);
});

test('dodge pressed on an active strike buffers until recovery without cancelling later damage', () => {
  const { world, player, enemy } = makeWorld();
  const hp = enemy.hp;
  tick(world, BUTTONS.ATTACK);
  while (player.attack.phase === 'windup') tick(world);
  assert.equal(player.attack.phase, 'active');
  tick(world, BUTTONS.DODGE);
  assert.ok(enemy.hp < hp);
  while (player.attack?.phase === 'active') tick(world);
  tick(world);
  assert.equal(player.attack?.phase, 'recovery');
  assert.ok(player.dodgeTicks > 0);
  const hpAfterCancel = enemy.hp;
  for (let index = 0; index < 12; index += 1) tick(world);
  assert.equal(enemy.hp, hpAfterCancel);
  assert.equal(world.events.filter((event) => event.type === 'hit' && event.targetId === enemy.id).length, 1);
});

test('dodge pressed during a skill cast is buffered until the cast lock ends', () => {
  const { world, player } = makeWorld('crossbow');
  tick(world, BUTTONS.SKILL3);
  assert.ok(player.skillCast);
  tick(world, BUTTONS.DODGE);
  assert.equal(player.dodgeTicks, 0);
  assert.equal(player.dodgeBufferTicks, 6);
  while (player.skillCast) tick(world);
  tick(world);
  assert.ok(player.dodgeTicks > 0);
  assert.equal(player.dodgeBufferTicks, 0);
});
