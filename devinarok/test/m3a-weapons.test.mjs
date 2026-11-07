import assert from 'node:assert/strict';
import test from 'node:test';
import { ENEMIES } from '../js/content/enemies.js';
import { FAMILY_STARTER_WEAPONS, ITEM_BASES, ITEMS } from '../js/content/items.js';
import { FAMILY_SKILLS, SKILLS } from '../js/content/skills.js';
import { buildRangedAimInput } from '../js/net/ranged-aim.js';
import { Predictor } from '../js/net/predictor.js';
import { BUTTONS, createStageWorld, pickAimTarget, step, stepPlayerMotion } from '../js/sim/world.js';

const FAMILY_WEAPONS = {
  sword: 'rusted-sword',
  crossbow: 'rusted-crossbow',
  staff: 'apprentice-wand',
};

function makeWorld(family, positions = []) {
  const world = createStageWorld({
    seed: 5,
    stageId: 'C1',
    playerId: 'hero',
    inputDriven: true,
    character: { level: 1, equipment: [{ itemId: FAMILY_WEAPONS[family], rarity: 'common' }] },
  });
  const player = world.entities.find((entity) => entity.kind === 'player');
  player.facing = 0;
  const enemies = world.entities.filter((entity) => entity.kind === 'enemy');
  world.entities = world.entities.filter((entity) => entity.kind !== 'enemy');
  world.roomEnemyIds = [];
  positions.forEach(({ x, z, radius = 0.2 }, index) => {
    const enemy = enemies[index];
    enemy.x = player.x + x;
    enemy.z = player.z + z;
    enemy.radius = radius;
    enemy.hp = 1000;
    enemy.maxHp = 1000;
    enemy.spawnTicksLeft = 0;
    enemy.invulnerable = false;
    enemy.stunnedTicks = 1000;
    enemy.attackPhase = null;
    enemy.attackCooldownTicks = 0;
    enemy.slowTicks = 0;
    world.entities.push(enemy);
    world.roomEnemyIds.push(enemy.id);
  });
  world.enemyHistory = [];
  return { world, player, enemies: positions.map((_, index) => world.entities[index + 1]) };
}

function tick(world, seq, buttons = 0, viewTick, extra = {}) {
  const input = { seq, moveX: 0, moveZ: 0, aim: 0, buttons, ...extra };
  if (viewTick !== undefined) input.viewTick = viewTick;
  step(world, { hero: input });
}

function runTicks(world, count, firstButtons = 0, viewTick, extra = {}) {
  for (let index = 0; index < count; index += 1) {
    tick(world, world.tick + 1, index === 0 ? firstButtons : 0, viewTick, extra);
  }
}

function makeCommanderWorld(distance, phaseTwo = false) {
  const world = createStageWorld({ seed: 17, stageId: 'CB', playerId: 'hero', character: { level: 7 } });
  const boss = world.entities.find((entity) => entity.boss);
  const player = world.entities.find((entity) => entity.kind === 'player');
  world.entities = world.entities.filter((entity) => entity.kind !== 'enemy' || entity.boss);
  world.roomEnemyIds = [boss.id];
  boss.x = 0;
  boss.z = 0;
  boss.hp = phaseTwo ? Math.floor(boss.maxHp * 0.45) : boss.maxHp;
  boss.spawnTicksLeft = 0;
  boss.invulnerable = false;
  boss.attackCooldownTicks = 0;
  boss.attackPhase = null;
  boss.attackPatternIndex = 0;
  boss.boneSpearCooldownTicks = 0;
  player.x = distance;
  player.z = 0;
  player.hp = player.maxHp;
  player.dodgeCooldownTicks = 0;
  return { world, boss, player };
}

test('family content keeps sword skills intact and adds equal-tier weapon bases', () => {
  assert.deepEqual(FAMILY_SKILLS, {
    sword: ['spin', 'dash', 'guard'],
    crossbow: ['pierce', 'vault', 'volley'],
    staff: ['flame', 'frost', 'blink'],
  });
  assert.deepEqual(SKILLS.spin, { id: 1, name: '회전베기', windupTicks: 5, activeTicks: 6, recoveryTicks: 10, range: 2.2, motionMult: 1.4, cooldownTicks: 180 });
  assert.deepEqual(SKILLS.dash, { id: 2, name: '돌진 찌르기', dashDistance: 4, dashTicks: 6, length: 4, width: 1, motionMult: 2, cooldownTicks: 240 });
  assert.deepEqual(SKILLS.guard, { id: 3, name: '수호의 자세', durationTicks: 45, halfAngle: Math.PI / 3, damageMultiplier: 0.3, perfectTicks: 6, stunTicks: 30, cooldownTicks: 360 });
  for (const family of ['sword', 'crossbow', 'staff']) {
    for (const [level, value] of [[1, 4], [3, 8], [5, 14]]) {
      assert.equal(ITEM_BASES.filter((base) => base.family === family && base.requiredLevel === level && base.value === value).length, 1);
    }
  }
  assert.deepEqual(FAMILY_STARTER_WEAPONS, [
    { itemId: 'rusted-crossbow', price: 30 },
    { itemId: 'apprentice-wand', price: 30 },
  ]);
  assert.equal(ITEMS['rusted-crossbow'].family, 'crossbow');
  assert.equal(ITEMS['apprentice-wand'].family, 'staff');
});

test('pickAimTarget prefers the narrow cone, falls back to the forward half-plane, and ignores rear targets', () => {
  const player = { x: 0, z: 0, facing: 0, viewLag: 0 };
  const narrow = { id: 1, kind: 'enemy', x: 4.7, z: 1.7, radius: 0.2 };
  const wide = { id: 2, kind: 'enemy', x: 1, z: 1.7, radius: 0.2 };
  const world = { tick: 0, entities: [narrow, wide], roomEnemyIds: [1, 2], enemyHistory: [] };
  assert.equal(pickAimTarget(world, player, 8), narrow);
  world.entities = [{ id: 3, kind: 'enemy', x: 1, z: 2.7, radius: 0.2 }];
  world.roomEnemyIds = [3];
  assert.equal(pickAimTarget(world, player, 8).id, 3);
  world.entities[0].x = -1;
  assert.equal(pickAimTarget(world, player, 8), null);
});

test('ranged aim input follows the rendered target and omits distance when there is no target', () => {
  const { world, player, enemies } = makeWorld('crossbow', [{ x: 6, z: 0 }]);
  const renderedEnemy = { ...enemies[0], x: player.x + 2.36, z: player.z + 1.18 };
  const input = buildRangedAimInput(
    { seq: 1, moveX: 127, moveZ: 0, aim: 0, buttons: 0 },
    player,
    { entities: [renderedEnemy], activeEnemyIds: [renderedEnemy.id] },
  );
  assert.equal(input.ad, 2.6);
  assert.equal(input.aim, Math.round(Math.atan2(1.18, 2.36) / (Math.PI * 2) * 256));

  const noTarget = buildRangedAimInput(
    { seq: 2, moveX: 0, moveZ: 127, aim: 0, ad: 4, buttons: 0 },
    player,
    { entities: [], activeEnemyIds: [] },
  );
  assert.equal(noTarget.aim, 64);
  assert.equal(Object.hasOwn(noTarget, 'ad'), false);
});

test('commander selects bone-spear only beyond 5.5m and telegraphs its configured line', () => {
  assert.equal(ENEMIES.commander.boneSpear.name, '뼈 창 투척');
  const near = makeCommanderWorld(5.5);
  tick(near.world, 1);
  assert.notEqual(near.boss.attackPattern, 'bone-spear');

  const far = makeCommanderWorld(5.6);
  tick(far.world, 1);
  assert.equal(far.boss.attackPattern, 'bone-spear');
  assert.equal(far.boss.attackWindupTicks, 24);
  assert.deepEqual(far.boss.attackShape, {
    type: 'line',
    originX: 0,
    originZ: 0,
    angle: 0,
    length: 14,
    width: 1,
  });
  assert.equal(far.boss.boneSpearCooldownTicks, 150);

  far.boss.attackPhase = null;
  far.boss.attackShape = null;
  far.boss.attackCooldownTicks = 0;
  tick(far.world, 2);
  assert.notEqual(far.boss.attackPattern, 'bone-spear');

  const phaseTwo = makeCommanderWorld(6, true);
  tick(phaseTwo.world, 1);
  assert.equal(phaseTwo.boss.attackPattern, 'bone-spear');
  assert.equal(phaseTwo.boss.attackWindupTicks, 18);
});

test('bone-spear queues its scaled hit so a dodge on the resolve tick avoids damage', () => {
  const { world, boss, player } = makeCommanderWorld(6);
  tick(world, 1);
  assert.equal(boss.attackPattern, 'bone-spear');
  boss.attackRemaining = 1;
  tick(world, 2);
  assert.equal(boss.attackPhase, 'active');
  tick(world, 3);
  assert.equal(world.pendingHits.length, 1);
  assert.equal(world.pendingHits[0].motionMult, 1.2);
  const hp = player.hp;
  step(world, { hero: { seq: 4, moveX: 0, moveZ: 127, aim: 64, buttons: BUTTONS.DODGE } });
  assert.equal(player.hp, hp);
  assert.equal(world.pendingHits.length, 0);
  assert.equal(world.events.some((event) => event.type === 'hit' && event.sourceId === boss.id), false);
});

test('crossbow basic shots stop at the first enemy and miss beyond nine meters', () => {
  const { world, enemies } = makeWorld('crossbow', [
    { x: 3, z: 0 },
    { x: 6, z: 0 },
  ]);
  const [first, second] = enemies;
  const secondHp = second.hp;
  runTicks(world, 5, BUTTONS.ATTACK);
  assert(first.hp < first.maxHp);
  assert.equal(second.hp, secondHp);

  const outside = makeWorld('crossbow', [{ x: 10, z: 0 }]);
  const target = outside.enemies[0];
  runTicks(outside.world, 5, BUTTONS.ATTACK);
  assert.equal(target.hp, target.maxHp);
});

test('crossbow pierce hits every enemy on its 12-meter line', () => {
  const { world, player, enemies } = makeWorld('crossbow', [
    { x: 2, z: 0 },
    { x: 4, z: 0 },
    { x: 6, z: 0 },
  ]);
  runTicks(world, 9, BUTTONS.SKILL1);
  assert(enemies.every((enemy) => enemy.hp < enemy.maxHp));
  assert.equal(world.events.filter((event) => event.type === 'hit' && event.skill === 1).length, 3);
});

test('crossbow volley fans five lines across 50 degrees with isolated per-line hit sets', () => {
  const { world, enemies } = makeWorld('crossbow', [
    { x: 3, z: 0, radius: 0.2 },
    { x: 3 * Math.cos(Math.PI * 25 / 180), z: 3 * Math.sin(Math.PI * 25 / 180), radius: 0.2 },
    { x: 3 * Math.cos(-Math.PI * 25 / 180), z: 3 * Math.sin(-Math.PI * 25 / 180), radius: 0.2 },
  ]);
  const roomEnemyIds = world.roomEnemyIds;
  world.roomEnemyIds = [];
  tick(world, 1, BUTTONS.SKILL3);
  world.roomEnemyIds = roomEnemyIds;
  runTicks(world, 5);
  const shots = world.events.filter((event) => event.type === 'shot');
  assert.equal(shots.length, 5);
  const shotAngles = shots.map((shot) => Math.round(shot.angle * 1e6) / 1e6);
  assert.deepEqual(shotAngles, [
    Math.round(-Math.PI * 25 / 180 * 1e6) / 1e6,
    Math.round(-Math.PI * 12.5 / 180 * 1e6) / 1e6,
    0,
    Math.round(Math.PI * 12.5 / 180 * 1e6) / 1e6,
    Math.round(Math.PI * 25 / 180 * 1e6) / 1e6,
  ]);
  assert(shots.every((shot) => shot.length === 6.5));
  const hits = world.events.filter((event) => event.type === 'hit' && event.skill === 3);
  assert.deepEqual(
    hits.map((event) => event.targetId).sort((a, b) => a - b),
    enemies.map((enemy) => enemy.id).sort((a, b) => a - b),
  );
  const strikeTargetPairs = hits.map((event) => `${event.castId}:${event.targetId}`);
  assert.equal(new Set(strikeTargetPairs).size, strikeTargetPairs.length);
});

test('crossbow vault retreats over six ticks with i-frames and fires on the final tick', () => {
  const { world, player } = makeWorld('crossbow');
  const x = player.x;
  let motion;
  for (let index = 0; index < 6; index += 1) {
    world.tick += 1;
    motion = stepPlayerMotion(world, player, { seq: index + 1, aim: 0, buttons: index === 0 ? BUTTONS.SKILL2 : 0 });
    if (index === 0) assert(player.iFrames > 0);
  }
  assert(player.x < x - 3);
  assert.equal(motion.attackStrike.motionMult, 1.4);
  assert.equal(motion.shots.length, 1);
});

test('ranged casts use explicit aim and distance instead of auto-aim', () => {
  const crossbow = makeWorld('crossbow', [{ x: 6, z: 0 }]);
  runTicks(crossbow.world, 12, BUTTONS.ATTACK, undefined, { aim: 64, ad: 3 });
  const shot = crossbow.world.events.find((event) => event.type === 'shot');
  assert.equal(shot.angle, Math.PI / 2);

  const staff = makeWorld('staff', [{ x: 6, z: 0 }]);
  runTicks(staff.world, 6, BUTTONS.ATTACK, undefined, { aim: 64, ad: 3 });
  const impact = staff.world.pendingImpacts[0];
  assert.ok(Math.abs(impact.shape.originX - staff.player.x) < 1e-9);
  assert.ok(Math.abs(impact.shape.originZ - (staff.player.z + 3)) < 1e-9);

  const clamped = stepPlayerMotion(crossbow.world, crossbow.player, {
    seq: crossbow.world.tick + 1,
    aim: 64,
    ad: 20,
    buttons: 0,
  });
  assert.equal(clamped.input.ad, 12);
});

test('staff basic impacts seven ticks after firing at the fire-time target point', () => {
  const { world, player, enemies } = makeWorld('staff', [{ x: 6, z: 0 }]);
  runTicks(world, 6, BUTTONS.ATTACK);
  const impact = world.pendingImpacts[0];
  assert.equal(impact.resolveTick - world.tick, 7);
  assert.deepEqual({ x: impact.shape.originX, z: impact.shape.originZ }, { x: player.x + 6, z: player.z });
  const hp = enemies[0].hp;
  runTicks(world, 6);
  assert.equal(enemies[0].hp, hp);
  tick(world, world.tick + 1);
  assert(enemies[0].hp < hp);
});

test('staff impacts rewind by viewLag, hitting moved-away targets and missing moved-in targets', () => {
  const { world, player, enemies } = makeWorld('staff', [
    { x: 4, z: 0 },
    { x: 10, z: 0 },
    { x: 4, z: 0 },
  ]);
  const [movedAway, movedIn, alreadyDead] = enemies;
  const movedAwayHp = movedAway.hp;
  const movedInHp = movedIn.hp;
  alreadyDead.dead = true;
  alreadyDead.hp = 0;
  world.tick = 10;
  world.enemyHistory = [{
    tick: 9,
    enemies: [
      { id: movedAway.id, x: player.x + 4, z: player.z, radius: movedAway.radius, dead: false },
      { id: movedIn.id, x: player.x + 10, z: player.z, radius: movedIn.radius, dead: false },
      { id: alreadyDead.id, x: player.x + 4, z: player.z, radius: alreadyDead.radius, dead: false },
    ],
  }];
  movedAway.x = player.x + 12;
  movedIn.x = player.x + 4;
  world.pendingImpacts.push({
    id: 'hero:rewound',
    ownerId: 'hero',
    ownerEntityId: player.id,
    resolveTick: 11,
    shape: { type: 'circle', originX: player.x + 4, originZ: player.z, radius: 1 },
    motionMult: 1,
    kind: 'staff-basic',
    viewLag: 2,
    viewTick: 8,
  });

  step(world, { hero: { seq: 1, moveX: 0, moveZ: 0, aim: 0, buttons: 0 } });
  assert(movedAway.hp < movedAwayHp);
  assert.equal(movedIn.hp, movedInHp);
  assert(world.events.some((event) => event.type === 'hit' && event.targetId === movedAway.id && event.viewLag === 2));
  assert.equal(world.events.some((event) => event.type === 'hit' && event.targetId === alreadyDead.id), false);
});

test('vault shot uses the viewTick from the firing input', () => {
  const { world } = makeWorld('crossbow');
  for (let index = 0; index < 6; index += 1) {
    step(world, {
      hero: {
        seq: index + 1,
        moveX: 0,
        moveZ: 0,
        aim: 0,
        buttons: index === 0 ? BUTTONS.SKILL2 : 0,
        viewTick: index === 0 ? 0 : index,
      },
    });
  }
  const strike = world.events.find((event) => event.type === 'strike' && event.castId === 'hero:1');
  assert.equal(strike.viewTick, 5);
  assert.equal(strike.viewLag, 1);
});

test('staff flame hits six times and frost applies a 45-tick slow', () => {
  const flame = makeWorld('staff', [{ x: 6, z: 0 }]);
  runTicks(flame.world, 102, BUTTONS.SKILL1);
  assert.equal(flame.world.events.filter((event) => event.type === 'hit' && event.castId === 'hero:1').length, 6);

  const frost = makeWorld('staff', [{ x: 2, z: 0 }]);
  runTicks(frost.world, 10, BUTTONS.SKILL2);
  assert(frost.enemies[0].slowTicks > 0);
  assert(frost.enemies[0].slowTicks <= SKILLS.frost.slowTicks);
});

test('staff blink clamps movement to obstacles and never ends inside one', () => {
  const { world, player } = makeWorld('staff');
  player.x = 0;
  player.z = 0;
  world.arena.obstacles = [{ id: 'wall', type: 'rect', x: 2.5, z: 0, width: 1, depth: 1 }];
  world.tick += 1;
  stepPlayerMotion(world, player, { seq: 1, aim: 0, buttons: BUTTONS.SKILL3 });
  assert(player.x > 0 && player.x <= 2 - player.radius + 0.01);
  const outsideX = Math.max(Math.abs(player.x - 2.5) - 0.5, 0);
  const outsideZ = Math.max(Math.abs(player.z) - 0.5, 0);
  assert(Math.hypot(outsideX, outsideZ) >= player.radius - 0.001);
  assert(player.iFrames > 0);
});

test('predictor motion parity holds for sword, crossbow, and staff', () => {
  for (const family of ['sword', 'crossbow', 'staff']) {
    const { world, player } = makeWorld(family);
    const direct = structuredClone(player);
    const input = { seq: 1, moveX: 80, moveZ: 10, aim: 0, buttons: BUTTONS.SKILL1 };
    const directMotion = stepPlayerMotion({ ...world, tick: 1 }, direct, input);
    const predictor = new Predictor({
      player: structuredClone(player),
      ctx: { arena: world.arena, openDoors: world.openDoors, tick: 0, entities: world.entities },
    });
    const predicted = predictor.applyLocalInput(input);
    assert.deepEqual(predicted.player, direct);
    assert.deepEqual(predicted.motion, directMotion);
  }
});

test('crossbow line hits use the enemy position recorded at the input view tick', () => {
  const { world, player, enemies } = makeWorld('crossbow', [{ x: 12, z: 0 }]);
  const target = enemies[0];
  world.enemyHistory = [{
    tick: 0,
    enemies: [{ id: target.id, x: player.x + 4, z: player.z, radius: target.radius, dead: false }],
  }];
  runTicks(world, 5, BUTTONS.ATTACK, 0);
  assert(target.hp < target.maxHp);
  assert(world.events.some((event) => event.type === 'hit' && event.viewTick === 0));
});
