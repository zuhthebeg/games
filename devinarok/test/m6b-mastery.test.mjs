import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MASTERY_MAX_XP,
  MASTERY_MIN_COOLDOWN_TICKS,
  MASTERY_THRESHOLDS,
  masteryBonus,
  masteryRank,
  nextThreshold,
} from '../js/content/mastery.js';
import { applyOperations, normalizeCharacter } from '../js/save/ops.js';
import {
  BUTTONS, completeStage, createStageWorld, playerStrike, step, stepPlayerMotion,
} from '../js/sim/world.js';

test('mastery thresholds, ranks, bonuses, and minimum cooldowns are deterministic', () => {
  assert.deepEqual(MASTERY_THRESHOLDS, [0, 10, 30, 70, 150, 300]);
  for (let rank = 0; rank <= 5; rank += 1) {
    assert.equal(masteryRank(MASTERY_THRESHOLDS[rank]), rank);
    assert.deepEqual(masteryBonus(rank), { damagePct: rank * 5, cooldownPct: rank * 3 });
    assert.equal(nextThreshold(MASTERY_THRESHOLDS[rank]), rank === 5 ? null : MASTERY_THRESHOLDS[rank + 1]);
  }
  assert.equal(masteryRank(-1), 0);
  assert.equal(masteryRank(MASTERY_MAX_XP + 1), 5);
  assert.equal(masteryRank(1.5), 0);
  assert.equal(MASTERY_MIN_COOLDOWN_TICKS('spin'), 61);
});

test('mastery normalization fills known skills and clamps values; save ops gain and set XP', () => {
  const normalized = normalizeCharacter({
    id: 'hero',
    level: 4,
    mastery: { spin: 999, dash: -1, guard: 2.5, unknown: 25 },
  });
  assert.deepEqual(normalized.mastery, {
    spin: 300, dash: 0, guard: 0, quake: 0, pierce: 0, vault: 0,
    volley: 0, rain: 0, flame: 0, frost: 0, blink: 0, meteor: 0,
    deadBurst: 0, poisonArrow: 0, cursedHands: 0,
  });

  const character = {
    ...normalized,
    xp: 0,
    gold: 0,
    potions: 0,
    debugUsed: false,
    rev: 0,
    equipment: { weapon: null, head: null, body: null, hands: null, feet: null },
    clearedStages: [],
    records: {},
    materials: { essence: 0, soul: 0 },
    contracts: { dateKey: null, progress: {}, claimed: [], basis: null },
  };
  const gained = applyOperations(character, {}, [{ type: 'gainMastery', skill: 'dash', amount: 17 }], 'hero');
  assert.equal(gained.character.mastery.dash, 17);
  const set = applyOperations(gained.character, {}, [{ type: 'setMastery', skill: 'dash', xp: 300 }], 'hero');
  assert.equal(set.character.mastery.dash, 300);
  assert.throws(
    () => applyOperations(character, {}, [{ type: 'gainMastery', skill: 'unknown', amount: 1 }], 'hero'),
    /Invalid mastery skill/,
  );
});

test('stage players receive mastery ranks from the saved character', () => {
  const playerId = 'mastery-hud-hero';
  const world = createStageWorld({
    seed: 191,
    stageId: 'C1',
    playerId,
    character: { level: 7, mastery: { spin: 300, dash: 70 } },
  });
  const player = world.entities.find((entity) => entity.kind === 'player' && entity.playerId === playerId);

  assert.equal(player.masteryRanks[1], 5);
  assert.equal(player.masteryRanks[2], 3);
});

function makeSpinWorld(spinXp, enemyDistance = 1.5) {
  const playerId = 'mastery-hero';
  const world = createStageWorld({
    seed: 191,
    stageId: 'C1',
    playerId,
    character: { level: 20, potions: 5, mastery: { spin: spinXp } },
  });
  const player = world.entities.find((entity) => entity.kind === 'player' && entity.playerId === playerId);
  const enemies = world.entities.filter((entity) => entity.kind === 'enemy');
  const target = enemies[0];
  for (const enemy of enemies) {
    enemy.dead = true;
    enemy.spawnTicksLeft = 0;
  }
  target.dead = false;
  target.invulnerable = false;
  target.attackShape = null;
  target.attackPhase = null;
  target.attackCooldownTicks = 9999;
  target.hp = 100_000;
  target.maxHp = target.hp;
  target.defense = 0;
  target.x = player.x + enemyDistance;
  target.z = player.z;
  player.hp = player.maxHp;
  player.iFrames = 9999;
  return { world, player, target, playerId };
}

function input(seq, buttons = 0) {
  return { seq, moveX: 0, moveZ: 0, aim: 0, buttons };
}

test('skill damage and cooldown scale at mastery ranks 0, 3, and 5', () => {
  const values = [0, 70, 300].map((xp) => {
    const { world, player, target, playerId } = makeSpinWorld(xp);
    stepPlayerMotion(world, player, input(1, BUTTONS.SKILL1));
    const cooldownTicks = player.skillCooldowns[1];
    for (let tick = 1; tick <= 18; tick += 1) {
      step(world, { [playerId]: input(tick + 1) });
    }
    return { cooldownTicks, damage: target.maxHp - target.hp };
  });

  assert.deepEqual(values.map(({ cooldownTicks }) => cooldownTicks), [179, 163, 152]);
  assert.ok(values[0].damage > 0);
  assert.ok(values[1].damage > values[0].damage);
  assert.ok(values[2].damage > values[1].damage);
});

test('counter strikes do not inherit mastery from an active skill cast', () => {
  const counterDamage = (spinXp) => {
    const { world, player, target } = makeSpinWorld(spinXp);
    player.skillCast = { id: 1 };
    const previousHp = target.hp;
    playerStrike(
      world,
      player,
      { type: 'circle', originX: target.x, originZ: target.z, radius: 1 },
      1,
      'counter:test',
      [],
      'counter',
      { rewind: false },
    );
    return previousHp - target.hp;
  };

  assert.equal(counterDamage(0), counterDamage(300));
});

test('delayed rain impacts use the mastery rank supplied by their skill slot', () => {
  const rainDamage = (rainXp) => {
    const { world, player, target, playerId } = makeSpinWorld(0);
    player.family = 'crossbow';
    player.masteryRanks = { 4: masteryRank(rainXp) };
    player.skillCooldowns[4] = 0;
    player.level = 20;
    stepPlayerMotion(world, player, input(1, BUTTONS.SKILL4));
    for (let tick = 1; tick <= 30; tick += 1) {
      step(world, { [playerId]: input(tick + 1) });
    }
    return target.maxHp - target.hp;
  };

  assert.ok(rainDamage(300) > rainDamage(0));
});

test('skill uses count only when a living enemy is within eight units and appear in results', () => {
  const near = makeSpinWorld(0, 7.9);
  stepPlayerMotion(near.world, near.player, input(1, BUTTONS.SKILL1));
  assert.deepEqual(near.world.rewards[near.playerId].skillUses, { spin: 1 });
  completeStage(near.world, 'clear');
  assert.deepEqual(near.world.result.skillUses, { spin: 1 });

  const far = makeSpinWorld(0, 12);
  stepPlayerMotion(far.world, far.player, input(1, BUTTONS.SKILL1));
  assert.deepEqual(far.world.rewards[far.playerId].skillUses, {});
  completeStage(far.world, 'clear');
  assert.deepEqual(far.world.result.skillUses, {});
});
