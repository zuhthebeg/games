import test from 'node:test';
import assert from 'node:assert/strict';
import { ENEMIES } from '../js/content/enemies.js';
import { ITEM_BASES, ITEMS } from '../js/content/items.js';
import { isStageUnlocked, STAGE_LIST } from '../js/content/stages.js';
import { BUTTONS, createHubWorld, createStageWorld, rollStageItem, step } from '../js/sim/world.js';
import { SANCTUARY_ARENA } from '../js/sanctuary/arena.js';

function input(seq, buttons = 0, aim = 128) {
  return { seq, moveX: 0, moveZ: 0, aim, buttons };
}

function prepareShieldbearer(playerX) {
  const world = createStageWorld({ seed: 733, stageId: 'K1', playerId: 'hero' });
  const player = world.entities.find((entity) => entity.kind === 'player');
  const shield = world.entities.find((entity) => entity.kind === 'enemy' && entity.enemyKind === 'shieldbearer');
  assert.ok(shield);
  world.entities = [player, shield];
  world.roomEnemyIds = [shield.id];
  player.x = playerX;
  player.z = 0;
  player.facing = playerX > 0 ? Math.PI : 0;
  shield.x = 0;
  shield.z = 0;
  shield.facing = 0;
  shield.currentRoomId = world.arena.rooms[world.roomIndex].id;
  shield.spawnTicksLeft = 0;
  shield.invulnerable = false;
  shield.attackCooldownTicks = 10_000;
  shield.speed = 0;
  return { world, player, shield };
}

test('region three unlocks only after FB and follows K1-KB progression', () => {
  assert.deepEqual(STAGE_LIST.filter((stage) => stage.region === 3).map((stage) => stage.id), ['K1', 'K2', 'K3', 'KB']);
  assert.equal(isStageUnlocked('K1', ['C1', 'C2', 'C3', 'CB']), false);
  assert.equal(isStageUnlocked('K1', ['FB']), true);
  assert.equal(isStageUnlocked('K2', ['FB', 'K1']), true);
  assert.equal(isStageUnlocked('K3', ['FB', 'K1', 'K2']), true);
  assert.equal(isStageUnlocked('KB', ['FB', 'K1', 'K2', 'K3']), true);
  assert.equal(isStageUnlocked('KB', ['FB', 'K1', 'K2']), false);
});

test('region-three loot tiers use the authored L5 multipliers and stage-level pool', () => {
  for (const [requiredLevel, multiplier] of [[11, 2.3], [13, 2.8]]) {
    const tier = ITEM_BASES.filter((item) => item.requiredLevel === requiredLevel);
    assert.equal(tier.length, 7);
    for (const slot of ['weapon', 'head', 'body', 'hands', 'feet']) {
      const bases = ITEM_BASES.filter((item) => item.slot === slot && item.requiredLevel === 5);
      const items = tier.filter((item) => item.slot === slot);
      assert.equal(items.length, slot === 'weapon' ? 3 : 1);
      for (const item of items) {
        const base = bases.find((entry) => entry.family === item.family);
        assert.ok(base, `${item.id} has an L5 base`);
        assert.equal(item.stat, base.stat);
        assert.equal(item.value, Math.round(base.value * multiplier));
      }
    }
  }
  const world = createStageWorld({ seed: 735, stageId: 'K1', playerId: 'hero' });
  for (const stageLevel of [11, 14]) {
    for (let index = 0; index < 64; index += 1) {
      const drop = rollStageItem(world, { stageLevel, forcedRarity: 'rare' });
      assert.ok(ITEMS[drop.itemId].requiredLevel <= stageLevel);
    }
  }
});

test('shieldbearer guard and shield-bash tuning match the region-three definition', () => {
  assert.equal(ENEMIES.shieldbearer.model, 'Skeleton_Warrior');
  assert.equal(ENEMIES.shieldbearer.hp, 140);
  assert.equal(ENEMIES.shieldbearer.speed, 0.85);
  assert.deepEqual(
    {
      length: ENEMIES.shieldbearer.length,
      width: ENEMIES.shieldbearer.width,
      windup: ENEMIES.shieldbearer.windupTicks,
      knockback: ENEMIES.shieldbearer.knockback,
    },
    { length: 1.2, width: 1.6, windup: 22, knockback: 1 },
  );
  for (const [playerX, expectedGuard] of [[1.2, true], [-1.2, false]]) {
    const { world, shield } = prepareShieldbearer(playerX);
    for (let seq = 1; seq <= 22; seq += 1) {
      step(world, { hero: input(seq, seq === 1 ? BUTTONS.ATTACK : 0, playerX > 0 ? 128 : 0) });
    }
    const hit = world.events.find((event) => event.type === 'hit' && event.targetId === shield.id);
    assert.ok(hit, 'sword strike should hit the shieldbearer');
    assert.equal(Boolean(hit.guarded), expectedGuard);
  }
  const turning = prepareShieldbearer(3);
  turning.shield.facing = Math.PI;
  turning.shield.attackCooldownTicks = 0;
  step(turning.world, { hero: input(1) });
  const turn = Math.atan2(
    Math.sin(turning.shield.facing - Math.PI),
    Math.cos(turning.shield.facing - Math.PI),
  );
  assert.ok(Math.abs(turn) <= Math.PI / 90 + 1e-8);

  const guarded = prepareShieldbearer(1.2);
  for (let seq = 1; seq <= 22; seq += 1) {
    step(guarded.world, { hero: input(seq, seq === 1 ? BUTTONS.ATTACK : 0, 128) });
  }
  const guardedHit = guarded.world.events.find((event) => event.type === 'hit' && event.targetId === guarded.shield.id);
  assert.equal(guardedHit.damage, Math.max(1, Math.round(guarded.player.stats.attack * 0.5)));

  const bash = prepareShieldbearer(1.2);
  bash.shield.attackPattern = 'shield-bash';
  bash.shield.attackPhase = 'windup';
  bash.shield.attackRemaining = 22;
  for (let seq = 1; seq <= 22; seq += 1) {
    step(bash.world, { hero: input(seq, seq === 1 ? BUTTONS.ATTACK : 0, 128) });
  }
  const bashHit = bash.world.events.find((event) => event.type === 'hit' && event.targetId === bash.shield.id);
  assert.equal(bashHit.guarded, undefined);

  const afterBash = prepareShieldbearer(1.2);
  afterBash.shield.attackPattern = 'shield-bash';
  afterBash.shield.attackPhase = 'active';
  afterBash.shield.attackRemaining = 1;
  afterBash.shield.attackCooldownTicks = 0;
  step(afterBash.world, { hero: input(1) });
  assert.equal(afterBash.shield.recoverTicks, 1);
  step(afterBash.world, { hero: input(2) });
  assert.equal(afterBash.shield.shieldGuardDownUntilTick, afterBash.world.tick + 45);
});

test('sanctuary hub ticks move the player without spawning combat waves', () => {
  const world = createHubWorld({ seed: 42, playerId: 'hero' });
  world.arena = SANCTUARY_ARENA;
  const player = world.entities.find((entity) => entity.kind === 'player');
  const startX = player.x;

  step(world, { hero: { seq: 1, moveX: 1, moveZ: 0, aim: 0, buttons: 0 } });

  assert.equal(world.tick, 1);
  assert.ok(player.x > startX);
  assert.equal(world.entities.filter((entity) => entity.kind === 'enemy').length, 0);
});

test('Skeleton King has the authored boss patterns and telegraphs their shapes', () => {
  assert.equal(ENEMIES.skeletonking.model, 'Skeleton_Warrior');
  assert.equal(ENEMIES.skeletonking.hp, 1800);
  assert.equal(ENEMIES.skeletonking.scale, 2);
  assert.deepEqual(
    {
      cleave: ENEMIES.skeletonking.patterns.cleave,
      nova: ENEMIES.skeletonking.patterns['royal-nova'],
      graveRise: ENEMIES.skeletonking.patterns['grave-rise'],
    },
    {
      cleave: { range: 4, halfAngle: Math.PI / 3, windupTicks: 26 },
      nova: { innerRadius: 2.2, outerRadius: 7, windupTicks: 32 },
      graveRise: { radius: 1.4, randomCircles: 3, windupTicks: 24 },
    },
  );
  const world = createStageWorld({ seed: 734, stageId: 'KB', playerId: 'hero' });
  const player = world.entities.find((entity) => entity.kind === 'player');
  const boss = world.entities.find((entity) => entity.kind === 'enemy' && entity.enemyKind === 'skeletonking');
  assert.ok(boss);
  world.entities = [player, boss];
  world.roomEnemyIds = [boss.id];
  boss.x = 0;
  boss.z = world.arena.rooms[world.roomIndex].centerZ;
  boss.currentRoomId = world.arena.rooms[world.roomIndex].id;
  boss.spawnTicksLeft = 0;
  boss.invulnerable = false;
  boss.attackCooldownTicks = 0;
  player.x = 0;
  player.z = boss.z + 3;
  step(world, { hero: input(1) });
  assert.equal(boss.attackPattern, 'cleave');
  assert.equal(boss.attackShape.type, 'sector');
  assert.equal(boss.attackRemaining, 26);
  boss.attackPhase = null;
  boss.attackCooldownTicks = 0;
  boss.attackPatternIndex = 1;
  step(world, { hero: input(2) });
  assert.equal(boss.attackPattern, 'royal-nova');
  assert.equal(boss.attackShape.type, 'annulus');
  assert.equal(boss.attackShape.innerRadius, 2.2);
  assert.equal(boss.attackShape.outerRadius, 7);
  assert.equal(boss.attackRemaining, 32);
  boss.attackPhase = null;
  boss.attackCooldownTicks = 0;
  boss.attackPatternIndex = 3;
  boss.hp = boss.maxHp * 0.5;
  step(world, { hero: input(3) });
  assert.equal(boss.attackPattern, 'grave-rise');
  assert.equal(boss.attackShape.circles.length, 4);
  assert.equal(boss.attackRemaining, 19);
  boss.attackPhase = 'active';
  boss.attackPattern = 'summon-wave';
  boss.attackRemaining = 1;
  boss.attackCooldownTicks = 0;
  step(world, { hero: input(4) });
  const wave = world.entities.filter((entity) => entity.kind === 'enemy' && entity.summonedBy === boss.id);
  assert.equal(wave.filter((entity) => entity.enemyKind === 'shieldbearer').length, 1);
  assert.equal(wave.filter((entity) => entity.enemyKind === 'minion').length, 2);
});
