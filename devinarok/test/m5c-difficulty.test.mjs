import assert from 'node:assert/strict';
import test from 'node:test';
import { DIFFICULTIES, effectiveStageLevel, HUB_ARENA, isDifficultyUnlocked, isStageUnlocked, latestStage, STAGE_LIST } from '../js/content/stages.js';
import { ENEMIES } from '../js/content/enemies.js';
import { ITEMS } from '../js/content/items.js';
import { createHubWorld, createStageWorld, rarityForRoll, rollStageItem, step } from '../js/sim/world.js';
import { debugKillEnemy } from '../js/debug/combat.js';

function stageEnemies(world) {
  return world.entities.filter((entity) => entity.kind === 'enemy');
}

test('difficulty tiers scale enemy level, health, and attack while capping effective level', () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(DIFFICULTIES).map(([id, tier]) => [id, [
      tier.levelOffset,
      tier.hpMult,
      tier.atkMult,
      tier.xpMult,
      tier.goldMult,
    ]])),
    {
      normal: [0, 1, 1, 1, 1],
      nightmare: [4, 1, 1.5, 1.8, 1.5],
      hell: [6, 1.2, 1.8, 2.6, 2],
    },
  );
  const nightmare = createStageWorld({ seed: 901, stageId: 'C1', difficulty: 'nightmare' });
  const hell = createStageWorld({ seed: 901, stageId: 'C1', difficulty: 'hell' });
  assert.equal(nightmare.effectiveLevel, 5);
  assert.equal(hell.effectiveLevel, 7);
  assert.deepEqual(
    [stageEnemies(nightmare)[0].hp, stageEnemies(nightmare)[0].attack],
    [44, 18],
  );
  assert.deepEqual(
    [stageEnemies(hell)[0].hp, stageEnemies(hell)[0].attack],
    [62, 25],
  );
  assert.equal(effectiveStageLevel(14, 'hell'), 20);
});

test('tier unlocks use namespaced clears and preserve within-tier gates', () => {
  assert.equal(isDifficultyUnlocked('nightmare', []), false);
  assert.equal(isStageUnlocked('C1', [], 'nightmare'), false);
  assert.equal(isStageUnlocked('C1', ['KB'], 'nightmare'), true);
  assert.equal(isStageUnlocked('C2', ['KB'], 'nightmare'), false);
  assert.equal(isStageUnlocked('F1', ['KB', 'N:CB'], 'nightmare'), true);
  assert.equal(isStageUnlocked('F2', ['KB', 'N:CB'], 'nightmare'), false);
  assert.equal(isStageUnlocked('K1', ['KB', 'N:FB'], 'nightmare'), true);
  assert.equal(isDifficultyUnlocked('hell', ['N:KB']), true);
  assert.equal(isStageUnlocked('C1', ['KB', 'N:KB'], 'hell'), true);
  assert.equal(isStageUnlocked('C1', ['KB'], 'hell'), false);
});

test('latest stage prefers the last uncleared unlocked stage for its tier', () => {
  assert.equal(latestStage('normal', []), 'C1');
  assert.equal(latestStage('normal', ['CB']), 'F1');
  assert.equal(latestStage('nightmare', ['KB']), 'C1');
  assert.equal(latestStage('nightmare', ['KB', 'N:C1', 'N:C2']), 'C3');
  assert.equal(latestStage('nightmare', ['KB', 'N:C1', 'N:C2', 'N:C3']), 'CB');
  assert.equal(latestStage('normal', STAGE_LIST.map((stage) => stage.id)), STAGE_LIST.at(-1).id);
});

test('hub simulation advances movement through the relocated NPC approach', () => {
  const world = createHubWorld({ seed: 42, playerId: 'hero', level: 7 });
  const player = world.entities.find((entity) => entity.kind === 'player');
  assert.deepEqual(world.arena.playerSpawn, { x: 0, z: 1 });
  assert.deepEqual(HUB_ARENA.npcs.map(({ x, z }) => [x, z]), [
    [-3, -2.6], [3, -2.6], [0, -5.4], [3.2, -5.6],
  ]);
  let closestNpcDistance = Infinity;
  for (let seq = 1; seq <= 100; seq += 1) {
    step(world, { hero: { seq, moveX: -127, moveZ: -127, aim: 160, buttons: 0 } });
    closestNpcDistance = Math.min(closestNpcDistance, Math.hypot(player.x + 3, player.z + 2.6));
    if (closestNpcDistance <= 1.6) break;
  }
  assert(world.tick > 0);
  assert(closestNpcDistance <= 1.6);

  const collisionWorld = createHubWorld({ seed: 43, playerId: 'hero', level: 7 });
  const collisionPlayer = collisionWorld.entities.find((entity) => entity.kind === 'player');
  for (let seq = 1; seq <= 120; seq += 1) {
    step(collisionWorld, { hero: { seq, moveX: 127, moveZ: 0, aim: 0, buttons: 0 } });
  }
  assert(collisionPlayer.x < 5);
});

test('difficulty loot uses effective item level, boss cap, and rarity tables', () => {
  const nightmare = createStageWorld({ seed: 902, stageId: 'C1', difficulty: 'nightmare' });
  const nightmareBossDrop = rollStageItem(nightmare, { boss: true, forcedRarity: 'rare' });
  assert.equal(nightmareBossDrop.ilvl, 7);
  assert.ok(ITEMS[nightmareBossDrop.itemId].requiredLevel <= nightmare.effectiveLevel);

  const hell = createStageWorld({ seed: 903, stageId: 'KB', difficulty: 'hell' });
  const hellBossDrop = rollStageItem(hell, { boss: true, forcedRarity: 'rare' });
  assert.equal(hell.effectiveLevel, 20);
  assert.equal(hellBossDrop.ilvl, 20);
  assert.ok(ITEMS[hellBossDrop.itemId].requiredLevel <= hell.effectiveLevel);

  for (const value of [0, 0.72, 0.99]) {
    assert.equal(
      rarityForRoll(value, { difficulty: 'nightmare' }),
      rarityForRoll(value, { elite: true }),
    );
  }
  assert.equal(rarityForRoll(0.59, { difficulty: 'nightmare', boss: true }), 'rare');
  assert.equal(rarityForRoll(0.6, { difficulty: 'nightmare', boss: true }), 'legendary');
  assert.equal(rarityForRoll(0.39, { difficulty: 'hell', boss: true }), 'rare');
  assert.equal(rarityForRoll(0.4, { difficulty: 'hell', boss: true }), 'legendary');
});

test('normal C1 enemy health remains at its original snapshot', () => {
  const world = createStageWorld({ seed: 904, stageId: 'C1' });
  const enemies = stageEnemies(world);
  assert.equal(world.difficulty, 'normal');
  assert.equal(world.effectiveLevel, 1);
  assert.deepEqual(enemies.map((enemy) => enemy.hp), [30, 30, 30, 30, 30, 30]);
  assert.deepEqual(enemies.map((enemy) => enemy.attack), [8, 8, 8, 8, 8, 8]);
});

test('difficulty tiers multiply enemy XP and gold rewards', () => {
  const results = ['normal', 'nightmare', 'hell'].map((difficulty) => {
    const world = createStageWorld({ seed: 905, stageId: 'C1', difficulty });
    const enemy = stageEnemies(world)[0];
    assert.equal(debugKillEnemy(world, enemy), true);
    assert.equal(world.entities.some((entity) => entity.kind === 'loot' && entity.lootType === 'gold'), false);
    return { xp: world.rewards.hero.xp, gold: world.rewards.hero.gold };
  });
  assert.deepEqual(results.map(({ xp }) => xp), [
    ENEMIES.minion.xp,
    Math.round(ENEMIES.minion.xp * 1.8),
    Math.round(ENEMIES.minion.xp * 2.6),
  ]);
  assert.ok(results[1].gold > results[0].gold);
  assert.ok(results[2].gold > results[1].gold);
});
