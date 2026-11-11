import assert from 'node:assert/strict';
import test from 'node:test';
import { ENEMIES } from '../js/content/enemies.js';
import {
  ALL_STAGE_LIST, DIFFICULTIES, isStageUnlocked, latestStage, RIFT_MAX_FLOOR,
  RIFT_STAGE_LIST, riftFirstClearReward, riftFloorOf, riftStageId, STAGE_LIST, STAGES,
} from '../js/content/stages.js';
import { debugKillEnemy } from '../js/debug/combat.js';
import { createStageWorld, hashWorld } from '../js/sim/world.js';

const REGION_CONTENT = {
  1: {
    themes: ['entrance', 'collapsed', 'corridor', 'ossuary'],
    enemies: ['minion', 'warrior', 'rogue', 'mage'],
  },
  2: {
    themes: ['forest-path', 'forest-clearing', 'forest-bog'],
    enemies: ['minion', 'bonearcher', 'ashcaller', 'rogue'],
  },
  3: {
    themes: ['castle-corridor', 'castle-courtyard', 'castle-crypt'],
    enemies: ['warrior', 'shieldbearer', 'mage', 'bonearcher', 'brute'],
  },
};

const RIFT_BOSSES = [
  { enemy: 'commander', theme: 'hall', region: 1 },
  { enemy: 'ashwarden', theme: 'forest-boss', region: 2 },
  { enemy: 'skeletonking', theme: 'castle-throne', region: 3 },
];

test('rift floors are a separate deterministic ladder with the specified composition', async () => {
  const regenerated = await import(new URL('../js/content/stages.js?m7-repeat=1', import.meta.url));
  assert.equal(STAGE_LIST.length, 12);
  assert.equal(RIFT_MAX_FLOOR, 30);
  assert.equal(RIFT_STAGE_LIST.length, 30);
  assert.equal(ALL_STAGE_LIST.length, 42);
  assert.deepEqual(
    RIFT_STAGE_LIST.map((stage) => stage.id),
    Array.from({ length: RIFT_MAX_FLOOR }, (_, index) => `R${index + 1}`),
  );
  assert.equal(JSON.stringify(RIFT_STAGE_LIST), JSON.stringify(regenerated.RIFT_STAGE_LIST));
  assert.equal(riftStageId(12), 'R12');
  assert.equal(riftFloorOf('R12'), 12);
  for (const invalid of ['R0', 'R01', 'R31', 'C1']) assert.equal(riftFloorOf(invalid), null);

  for (const [index, stage] of RIFT_STAGE_LIST.entries()) {
    const floor = index + 1;
    const expectedPower = Math.round((1 + 0.08 * Math.max(0, floor - 6)) * 100) / 100;
    assert.equal(stage.rift, true, stage.id);
    assert.equal(stage.name, `심연 균열 ${floor}층`, stage.id);
    assert.equal(stage.stageLevel, Math.min(20, 14 + floor), stage.id);
    assert.equal(stage.recommendedLevel, Math.min(20, 14 + floor), stage.id);
    assert.equal(stage.powerMult, expectedPower, stage.id);
    assert.equal(stage.rewardMult, expectedPower, stage.id);
    assert.equal(STAGES[stage.id], stage);
    if (floor % 5 === 0) {
      const boss = RIFT_BOSSES[(floor / 5 - 1) % RIFT_BOSSES.length];
      assert.equal(stage.boss, true, stage.id);
      assert.equal(stage.region, boss.region, stage.id);
      assert.equal(stage.rooms.length, 1, stage.id);
      assert.equal(stage.rooms[0].theme, boss.theme, stage.id);
      assert.deepEqual(stage.rooms[0].waves, [{ enemy: boss.enemy, count: 1 }], stage.id);
      continue;
    }

    const region = ((floor - 1) % 3) + 1;
    const pool = REGION_CONTENT[region];
    const expectedCount = Math.min(9, 5 + Math.floor(floor / 4));
    assert.equal(stage.boss, false, stage.id);
    assert.equal(stage.region, region, stage.id);
    assert.equal(stage.rooms.length, 3, stage.id);
    for (const [roomIndex, room] of stage.rooms.entries()) {
      assert.ok(pool.themes.includes(room.theme), `${stage.id} ${room.id} theme`);
      const waves = roomIndex === 2 ? room.waves.slice(0, -1) : room.waves;
      assert.ok(waves.length >= 2 && waves.length <= 3, `${stage.id} ${room.id} uses 2–3 kinds`);
      assert.ok(waves.every((wave) => pool.enemies.includes(wave.enemy)), `${stage.id} ${room.id} enemy pool`);
      assert.equal(
        waves.reduce((total, wave) => total + wave.count, 0),
        expectedCount,
        `${stage.id} ${room.id} enemy count`,
      );
      if (roomIndex === 2) assert.deepEqual(room.waves.at(-1), { enemy: 'brute', count: 1 });
    }
  }

  const first = createStageWorld({ seed: 728, stageId: 'R10', character: { level: 20 } });
  const second = createStageWorld({ seed: 728, stageId: 'R10', character: { level: 20 } });
  assert.deepEqual(first.arena, second.arena);
  assert.equal(hashWorld(first), hashWorld(second));
  const changedPower = structuredClone(first);
  changedPower.powerMult += 0.01;
  assert.notEqual(hashWorld(first), hashWorld(changedPower));
  const changedReward = structuredClone(first);
  changedReward.rewardMult += 0.01;
  assert.notEqual(hashWorld(first), hashWorld(changedReward));
});

test('rift floors unlock sequentially after the normal Skeleton King clear only', () => {
  assert.equal(isStageUnlocked('R1', [], 'normal'), false);
  assert.equal(isStageUnlocked('R1', ['N:KB'], 'normal'), false);
  assert.equal(isStageUnlocked('R1', ['KB'], 'normal'), true);
  assert.equal(isStageUnlocked('R2', ['KB'], 'normal'), false);
  assert.equal(isStageUnlocked('R2', ['KB', 'R1'], 'normal'), true);
  assert.equal(isStageUnlocked('R3', ['KB', 'R1'], 'normal'), false);
  for (let floor = 1; floor < RIFT_MAX_FLOOR; floor += 1) {
    assert.equal(
      isStageUnlocked(`R${floor + 1}`, ['KB', ...Array.from({ length: floor }, (_, index) => `R${index + 1}`)], 'normal'),
      true,
    );
  }
  assert.equal(isStageUnlocked('R30', ['KB', ...Array.from({ length: 28 }, (_, index) => `R${index + 1}`)], 'normal'), false);
  assert.equal(isStageUnlocked('R2', ['KB', 'R1'], 'nightmare'), false);
  assert.equal(isStageUnlocked('R2', ['KB', 'R1', 'N:KB'], 'hell'), false);
  assert.equal(isStageUnlocked('C1', [], 'normal'), true);
  assert.equal(latestStage('normal', ['KB', 'R1', 'R2']), 'C1');
});

test('rift first-clear material rewards match the specified floor milestones', () => {
  assert.deepEqual(riftFirstClearReward(1), { essence: 3, soul: 0 });
  assert.deepEqual(riftFirstClearReward(5), { essence: 4, soul: 1 });
  assert.deepEqual(riftFirstClearReward(20), { essence: 9, soul: 2 });
  assert.deepEqual(riftFirstClearReward(30), { essence: 12, soul: 2 });
  const total = RIFT_STAGE_LIST.reduce((sum, stage) => {
    const reward = riftFirstClearReward(riftFloorOf(stage.id));
    return { essence: sum.essence + reward.essence, soul: sum.soul + reward.soul };
  }, { essence: 0, soul: 0 });
  assert.deepEqual(total, { essence: 225, soul: 9 });
});

test('R10 enemy power and gold use the R6 baseline multiplied by 1.32', () => {
  const baselineFloor = createStageWorld({ seed: 910, stageId: 'R6', character: { level: 20 } });
  const boostedFloor = createStageWorld({ seed: 910, stageId: 'R10', character: { level: 20 } });
  const enemy = boostedFloor.entities.find((entity) => entity.kind === 'enemy');
  const rule = ENEMIES[enemy.enemyKind];
  const stageScale = 1 + 0.12 * (boostedFloor.effectiveLevel - 1);
  const baselineHp = Math.round(rule.hp * stageScale * DIFFICULTIES.normal.hpMult);
  const baselineAttack = Math.round(rule.attack * stageScale * DIFFICULTIES.normal.atkMult);
  assert.equal(baselineFloor.powerMult, 1);
  assert.equal(boostedFloor.powerMult, 1.32);
  assert.equal(boostedFloor.rewardMult, 1.32);
  assert.equal(enemy.maxHp, Math.round(rule.hp * stageScale * DIFFICULTIES.normal.hpMult * 1.32));
  assert.equal(enemy.maxHp, Math.round(rule.hp * stageScale * DIFFICULTIES.normal.hpMult * boostedFloor.powerMult));
  assert.equal(enemy.attack, Math.round(rule.attack * stageScale * DIFFICULTIES.normal.atkMult * 1.32));
  assert.equal(enemy.attack, Math.round(rule.attack * stageScale * DIFFICULTIES.normal.atkMult * boostedFloor.powerMult));
  assert.equal(baselineHp, Math.round(rule.hp * stageScale * DIFFICULTIES.normal.hpMult * baselineFloor.powerMult));
  assert.equal(baselineAttack, Math.round(rule.attack * stageScale * DIFFICULTIES.normal.atkMult * baselineFloor.powerMult));

  const boostedRewardWorld = createStageWorld({ seed: 1210, stageId: 'R10', character: { level: 20 } });
  const baselineRewardWorld = structuredClone(boostedRewardWorld);
  baselineRewardWorld.rewardMult = 1;
  const boostedBoss = boostedRewardWorld.entities.find((entity) => entity.kind === 'enemy');
  const baselineBoss = baselineRewardWorld.entities.find((entity) => entity.id === boostedBoss.id);
  assert.equal(debugKillEnemy(baselineRewardWorld, baselineBoss), true);
  assert.equal(debugKillEnemy(boostedRewardWorld, boostedBoss), true);
  assert.ok(baselineRewardWorld.rewards.hero.gold > 0);
  assert.equal(
    boostedRewardWorld.rewards.hero.gold,
    Math.round(baselineRewardWorld.rewards.hero.gold * 1.32),
  );
  assert.equal(boostedRewardWorld.rngState, baselineRewardWorld.rngState);
});
