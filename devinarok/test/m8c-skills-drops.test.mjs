import assert from 'node:assert/strict';
import test from 'node:test';
import { ITEM_SETS, ITEM_BASES, ITEMS } from '../js/content/items.js';
import { LINEAGE_SKILL_SWAPS, FAMILY_SKILLS, SKILLS, skillsFor } from '../js/content/skills.js';
import { BUTTONS, createStageWorld, playerStrike, rollStageItem, step } from '../js/sim/world.js';

const FAMILY_WEAPONS = {
  sword: 'rusted-sword',
  crossbow: 'rusted-crossbow',
  staff: 'apprentice-wand',
};

function makeWorld(lineage, placements) {
  const family = lineage === 'skeleton_knight' ? 'sword'
    : lineage === 'skeleton_archer' ? 'crossbow'
      : lineage === 'skeleton_mage' ? 'staff' : 'sword';
  const world = createStageWorld({
    seed: 728,
    stageId: 'C1',
    playerId: 'hero',
    inputDriven: true,
    character: {
      level: 10,
      lineage,
      equipment: [{ itemId: FAMILY_WEAPONS[family], rarity: 'common' }],
    },
  });
  const player = world.entities.find((entity) => entity.kind === 'player');
  const availableEnemies = world.entities.filter((entity) => entity.kind === 'enemy');
  const enemies = placements.map((placement, index) => {
    const enemy = availableEnemies[index];
    enemy.x = player.x + placement.x;
    enemy.z = player.z + placement.z;
    enemy.hp = placement.hp ?? 10_000;
    enemy.maxHp = enemy.hp;
    enemy.spawnTicksLeft = 0;
    enemy.invulnerable = false;
    enemy.stunnedTicks = placement.stunnedTicks ?? 1000;
    enemy.attackPhase = null;
    enemy.attackShape = null;
    enemy.attackRemaining = 0;
    enemy.attackCooldownTicks = placement.attackCooldownTicks ?? 0;
    enemy.slowTicks = 0;
    enemy.boss = placement.boss ?? false;
    world.entities.splice(world.entities.indexOf(enemy), 1);
    return enemy;
  });
  world.entities = [player, ...enemies];
  world.roomEnemyIds = enemies.map((enemy) => enemy.id);
  world.enemyHistory = [];
  player.facing = 0;
  return { world, player, enemies };
}

function tick(world, buttons = 0, extra = {}) {
  const player = world.entities.find((entity) => entity.kind === 'player');
  step(world, {
    [player.playerId]: {
      seq: world.tick + 1,
      moveX: 0,
      moveZ: 0,
      aim: 0,
      buttons,
      ...extra,
    },
  });
}

function runTicks(world, count) {
  for (let index = 0; index < count; index += 1) tick(world);
}

function rollWorld(seed, family = 'sword', lineage = 'human') {
  return {
    rngState: seed >>> 0,
    effectiveLevel: 20,
    difficulty: 'normal',
    entities: [{ kind: 'player', family, lineage }],
  };
}

test('lineage skill swaps replace only their specified slots with the settled skill values', () => {
  assert.deepEqual(LINEAGE_SKILL_SWAPS, {
    skeleton_knight: { quake: 'deadBurst' },
    skeleton_archer: { volley: 'poisonArrow' },
    skeleton_mage: { frost: 'cursedHands' },
  });
  assert.deepEqual(skillsFor('sword', 'skeleton_knight'), ['spin', 'dash', 'guard', 'deadBurst']);
  assert.deepEqual(skillsFor('crossbow', 'skeleton_archer'), ['pierce', 'vault', 'poisonArrow', 'rain']);
  assert.deepEqual(skillsFor('staff', 'skeleton_mage'), ['flame', 'cursedHands', 'blink', 'meteor']);
  for (const [family, skills] of Object.entries(FAMILY_SKILLS)) {
    assert.deepEqual(skillsFor(family), skills);
  }
  assert.deepEqual(SKILLS.deadBurst, {
    id: 4, name: '망자의 폭발', windupTicks: 10, radius: 3.4, motionMult: 3.4,
    knockback: 1.0, hpCostFraction: 0.15, cooldownTicks: 450,
  });
  assert.deepEqual(SKILLS.poisonArrow, {
    id: 3, name: '맹독 화살', windupTicks: 6, length: 11, width: 0.6,
    motionMult: 1.0, poisonTicks: 75, poisonEvery: 15, poisonMotionMult: 0.4,
    cooldownTicks: 300,
  });
  assert.deepEqual(SKILLS.cursedHands, {
    id: 2, name: '저주받은 손', windupTicks: 8, range: 8, fallbackDistance: 6,
    radius: 2.6, motionMult: 0.8, rootTicks: 60, bossRootTicks: 20,
    cooldownTicks: 240,
  });
});

test('deadBurst pays HP without lethal damage or revival and strikes only its radius with knockback', () => {
  const { world, player, enemies } = makeWorld('skeleton_knight', [
    { x: 2.8, z: 0 },
    { x: 4.0, z: 0 },
  ]);
  player.hp = 5;
  player.boneRevivalReady = true;
  const outsideHp = enemies[1].hp;

  tick(world, BUTTONS.SKILL4);
  assert.equal(player.hp, 1);
  assert.equal(player.boneRevivalReady, true);
  runTicks(world, SKILLS.deadBurst.windupTicks - 1);

  assert.ok(enemies[0].hp < enemies[0].maxHp);
  assert.equal(enemies[1].hp, outsideHp);
  assert.ok(Math.hypot(enemies[0].x - player.x, enemies[0].z - player.z) > 3.4);
  assert.equal(player.hp, 1);
  assert.equal(player.boneRevivalReady, true);
  assert.ok(world.events.some((event) => event.type === 'impact' && event.kind === 'deadBurst'));
});

test('poisonArrow hits one target and applies five target-following timed hits with one skill id', () => {
  const { world, player, enemies } = makeWorld('skeleton_archer', [
    { x: 3, z: 0 },
    { x: 5, z: 0 },
  ]);
  const [target, other] = enemies;
  const otherHp = other.hp;
  tick(world, BUTTONS.SKILL3);
  runTicks(world, SKILLS.poisonArrow.windupTicks - 1);

  assert.ok(target.hp < target.maxHp);
  assert.equal(other.hp, otherHp);
  const poison = world.pendingImpacts.find((impact) => impact.kind === 'poison');
  assert.equal(poison.targetEntityId, target.id);
  assert.equal(poison.endsTick, world.tick + 75);
  const castId = poison.id;
  const startTick = world.tick;
  target.x += 1;
  const poisonHp = target.hp;
  for (let hit = 1; hit <= 5; hit += 1) {
    runTicks(world, 15);
    const strikes = world.events.filter((event) => event.type === 'strike' && event.castId === castId);
    assert.equal(strikes.length, hit + 1);
    assert.ok(strikes.at(-1).tick - startTick === hit * 15);
    assert.equal(strikes.at(-1).skill, SKILLS.poisonArrow.id);
    assert.equal(other.hp, otherHp);
  }
  assert.ok(target.hp < poisonHp);
  assert.equal(world.pendingImpacts.some((impact) => impact.kind === 'poison'), false);
});

test('poisonArrow reapplication refreshes one owner-target effect and stops when the target dies', () => {
  const refreshed = makeWorld('skeleton_archer', [{ x: 3, z: 0 }]);
  const [target] = refreshed.enemies;
  tick(refreshed.world, BUTTONS.SKILL3);
  runTicks(refreshed.world, 5);
  refreshed.player.skillCooldowns[3] = 0;
  tick(refreshed.world);
  tick(refreshed.world, BUTTONS.SKILL3);
  runTicks(refreshed.world, 5);
  const effects = refreshed.world.pendingImpacts.filter((impact) => (
    impact.kind === 'poison' && impact.ownerId === refreshed.player.playerId && impact.targetEntityId === target.id
  ));
  assert.equal(effects.length, 1);
  assert.equal(effects[0].resolveTick, refreshed.world.tick);
  assert.equal(effects[0].endsTick, refreshed.world.tick + 75);
  const refreshedCast = effects[0].id;
  runTicks(refreshed.world, 15);
  assert.equal(refreshed.world.events.filter((event) => (
    event.type === 'strike' && event.castId === refreshedCast
  )).length, 2);

  const dying = makeWorld('skeleton_archer', [{ x: 3, z: 0 }]);
  const [doomed] = dying.enemies;
  tick(dying.world, BUTTONS.SKILL3);
  runTicks(dying.world, 5);
  doomed.hp = 1;
  runTicks(dying.world, 15);
  assert.equal(doomed.dead, true);
  assert.equal(dying.world.pendingImpacts.some((impact) => impact.kind === 'poison'), false);
  const strikeCount = dying.world.events.filter((event) => event.type === 'strike').length;
  runTicks(dying.world, 30);
  assert.equal(dying.world.events.filter((event) => event.type === 'strike').length, strikeCount);
});

test('poisonArrow skill strike resolves while a basic crossbow attack is active', () => {
  const { world, player, enemies } = makeWorld('skeleton_archer', [{ x: 3, z: 0 }]);
  const [target] = enemies;
  tick(world, BUTTONS.ATTACK);
  runTicks(world, 7);
  tick(world, BUTTONS.ATTACK);
  runTicks(world, 3);
  tick(world, BUTTONS.SKILL3);
  runTicks(world, SKILLS.poisonArrow.windupTicks - 2);
  assert.equal(player.attack.phase, 'active');
  assert.equal(player.skillCast.tick, SKILLS.poisonArrow.windupTicks - 1);
  const castId = player.skillCast.castId;
  const hpBeforeRelease = target.hp;

  tick(world);

  const skillHit = world.events.find((event) => (
    event.type === 'hit'
    && event.targetId === target.id
    && event.skill === SKILLS.poisonArrow.id
    && event.castId === castId
  ));
  assert.ok(skillHit);
  assert.ok(skillHit.damage > 0);
  assert.ok(target.hp < hpBeforeRelease);
  assert.ok(world.pendingImpacts.some((impact) => (
    impact.kind === 'poison' && impact.id === castId && impact.targetEntityId === target.id
  )));
});

test('cursedHands resolves while a basic staff attack is active', () => {
  const { world, player, enemies } = makeWorld('skeleton_mage', [{ x: 5, z: 0 }]);
  const [target] = enemies;
  tick(world, BUTTONS.ATTACK);
  runTicks(world, 10);
  tick(world, BUTTONS.ATTACK);
  runTicks(world, 2);
  tick(world, BUTTONS.SKILL2);
  runTicks(world, SKILLS.cursedHands.windupTicks - 2);
  assert.equal(player.attack.phase, 'active');
  assert.equal(player.skillCast.tick, SKILLS.cursedHands.windupTicks - 1);
  const castId = player.skillCast.castId;

  tick(world);

  assert.ok(target.rootedTicks > 0);
  assert.ok(world.events.some((event) => (
    event.type === 'hit'
    && event.targetId === target.id
    && event.skill === SKILLS.cursedHands.id
    && event.castId === castId
  )));
});

test('cursedHands roots ordinary and boss enemies for their exact durations without stopping attacks', () => {
  const rooted = makeWorld('skeleton_mage', [
    { x: 5, z: 0, stunnedTicks: 0 },
  ]);
  const [enemy] = rooted.enemies;
  const before = { x: enemy.x, z: enemy.z };
  tick(rooted.world, BUTTONS.SKILL2);
  runTicks(rooted.world, SKILLS.cursedHands.windupTicks - 1);
  assert.equal(enemy.rootedTicks, SKILLS.cursedHands.rootTicks - 1);
  const rootedPosition = { x: enemy.x, z: enemy.z };
  runTicks(rooted.world, 8);
  assert.deepEqual({ x: enemy.x, z: enemy.z }, rootedPosition);

  const attacking = makeWorld('skeleton_mage', [
    { x: 1.1, z: 0, stunnedTicks: 0 },
  ]);
  const [attacker] = attacking.enemies;
  tick(attacking.world, BUTTONS.SKILL2);
  runTicks(attacking.world, SKILLS.cursedHands.windupTicks - 1);
  runTicks(attacking.world, 40);
  assert.equal(attacker.rootedTicks > 0, true);
  assert.ok(attacking.world.events.some((event) => (
    event.type === 'hit' && event.sourceId === attacker.id && event.targetId === attacking.player.id
  )));

  const bossWorld = makeWorld('skeleton_mage', [
    { x: 5, z: 0, boss: true, stunnedTicks: 0 },
  ]);
  const [boss] = bossWorld.enemies;
  tick(bossWorld.world, BUTTONS.SKILL2);
  runTicks(bossWorld.world, SKILLS.cursedHands.windupTicks - 1);
  assert.equal(boss.rootedTicks, SKILLS.cursedHands.bossRootTicks - 1);
});

test('skeleton weapon rolls stay in family while human RNG and mixed-party owner bias remain deterministic', () => {
  let nonCrossbowWeapons = 0;
  for (let seed = 1; seed <= 500; seed += 1) {
    const world = rollWorld(seed);
    const drop = rollStageItem(world, {
      stageLevel: 20,
      forcedRarity: 'rare',
      family: 'crossbow',
      lineage: 'skeleton_archer',
    });
    const base = ITEMS[drop.itemId];
    if (base.slot === 'weapon' && base.family !== 'crossbow') nonCrossbowWeapons += 1;
  }
  assert.equal(nonCrossbowWeapons, 0);

  for (let seed = 1; seed <= 40; seed += 1) {
    const baseline = rollWorld(seed);
    const human = rollWorld(seed);
    assert.deepEqual(
      rollStageItem(baseline, { stageLevel: 20 }),
      rollStageItem(human, { stageLevel: 20, family: 'sword', lineage: 'human' }),
    );
    assert.equal(baseline.rngState, human.rngState);
  }

  for (let seed = 101; seed <= 140; seed += 1) {
    const world = {
      ...rollWorld(seed),
      entities: [
        { kind: 'player', family: 'crossbow', lineage: 'skeleton_archer' },
        { kind: 'player', family: 'staff', lineage: 'skeleton_mage' },
      ],
    };
    for (const [family, lineage] of [
      ['crossbow', 'skeleton_archer'],
      ['staff', 'skeleton_mage'],
    ]) {
      const drop = rollStageItem(world, { stageLevel: 20, forcedRarity: 'rare', family, lineage });
      const base = ITEMS[drop.itemId];
      if (base.slot === 'weapon') assert.equal(base.family, family);
    }
  }

  const setDrop = rollStageItem(rollWorld(777), {
    stageLevel: 20,
    forcedRarity: 'set',
    family: 'staff',
    lineage: 'skeleton_mage',
  });
  assert.equal(ITEMS[setDrop.itemId].setId, Object.keys(ITEM_SETS).find((id) => ITEM_SETS[id].family === 'staff'));
  assert.equal(ITEM_BASES.some((base) => base.id === setDrop.itemId), true);
});

test('mixed-party objective rewards use each skeleton owner family for weapon drops', () => {
  const world = createStageWorld({
    seed: 932,
    stageId: 'C1',
    party: [
      {
        playerId: 'archer',
        character: { level: 10, lineage: 'skeleton_archer', equipment: [{ itemId: 'rusted-crossbow' }] },
      },
      {
        playerId: 'mage',
        character: { level: 10, lineage: 'skeleton_mage', equipment: [{ itemId: 'apprentice-wand' }] },
      },
    ],
  });
  const archer = world.entities.find((entity) => entity.kind === 'player' && entity.playerId === 'archer');
  const mage = world.entities.find((entity) => entity.kind === 'player' && entity.playerId === 'mage');
  const enemy = world.entities.find((entity) => entity.kind === 'enemy');
  enemy.x = archer.x + 1;
  enemy.z = archer.z;
  enemy.hp = 1;
  enemy.spawnTicksLeft = 0;
  enemy.invulnerable = false;
  world.roomEnemyIds = [enemy.id];
  world.objective = {
    type: 'hunt',
    targetId: enemy.id,
    state: 'active',
    roomIndex: world.roomIndex,
    endsTick: 60,
  };
  playerStrike(
    world,
    archer,
    { type: 'circle', originX: enemy.x, originZ: enemy.z, radius: 1 },
    100,
    'archer:1',
    [],
    1,
    { rewind: false },
  );
  const drops = world.entities.filter((entity) => entity.kind === 'loot' && entity.lootType === 'item');
  assert.ok(drops.some((drop) => drop.ownerId === archer.playerId));
  assert.ok(drops.some((drop) => drop.ownerId === mage.playerId));
  for (const drop of drops) {
    const base = ITEMS[drop.item.itemId];
    if (base.slot !== 'weapon') continue;
    assert.equal(base.family, drop.ownerId === archer.playerId ? 'crossbow' : 'staff');
  }
});
