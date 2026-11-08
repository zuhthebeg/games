import assert from 'node:assert/strict';
import test from 'node:test';
import { ITEM_BASES, ITEMS, ITEM_SETS, RARITIES } from '../js/content/items.js';
import { BUTTONS, calculatePlayerStats, createStageWorld, rollStageItem, step, stepPlayerMotion } from '../js/sim/world.js';
import { debugKillEnemy } from '../js/debug/combat.js';

const FAMILY_WEAPONS = {
  sword: 'rusted-sword',
  crossbow: 'rusted-crossbow',
  staff: 'apprentice-wand',
};

function equippedSet(setId, count) {
  return ITEM_BASES
    .filter((base) => base.setId === setId)
    .slice(0, count)
    .map((base) => ({ itemId: base.id, setId, rarity: 'set' }));
}

function killKingBoss(seed, difficulty, family) {
  const world = createStageWorld({
    seed,
    stageId: 'KB',
    difficulty,
    character: { equipment: [{ itemId: FAMILY_WEAPONS[family] }] },
  });
  const boss = world.entities.find((entity) => entity.kind === 'enemy' && entity.boss);
  assert.ok(boss);
  assert.equal(debugKillEnemy(world, boss), true);
  return world.result?.items ?? world.entities.filter((entity) => entity.kind === 'loot' && entity.lootType === 'item');
}

test('nightmare and hell bases follow the authored level and slot progression', () => {
  const nightmare = ITEM_BASES.filter((base) => base.requiredLevel === 15 && !base.setId);
  const hell = ITEM_BASES.filter((base) => base.requiredLevel === 18 && !base.setId);
  assert.equal(nightmare.length, 7);
  assert.equal(hell.length, 7);
  for (const tier of [nightmare, hell]) {
    assert.deepEqual(
      Object.fromEntries(['weapon', 'head', 'body', 'hands', 'feet'].map((slot) => [
        slot,
        tier.filter((base) => base.slot === slot).length,
      ])),
      { weapon: 3, head: 1, body: 1, hands: 1, feet: 1 },
    );
  }
  for (const family of ['sword', 'crossbow', 'staff']) {
    const nightmareWeapon = nightmare.find((base) => base.slot === 'weapon' && base.family === family);
    const hellWeapon = hell.find((base) => base.slot === 'weapon' && base.family === family);
    assert.equal(nightmareWeapon.value, 45);
    assert.equal(hellWeapon.value, 51);
  }
  for (const slot of ['head', 'body', 'hands', 'feet']) {
    assert.ok(hell.find((base) => base.slot === slot).value > nightmare.find((base) => base.slot === slot).value);
  }
});

test('loot base eligibility follows effective level and excludes set pieces', () => {
  const normal = createStageWorld({ seed: 1001, stageId: 'KB' });
  const nightmare = createStageWorld({ seed: 1002, stageId: 'K1', difficulty: 'nightmare' });
  const hell = createStageWorld({ seed: 1003, stageId: 'K2', difficulty: 'hell' });
  assert.equal(normal.effectiveLevel, 14);
  assert.equal(nightmare.effectiveLevel, 15);
  assert.equal(hell.effectiveLevel, 18);

  const rollMany = (world, count) => Array.from({ length: count }, () => (
    rollStageItem(world, { forcedRarity: 'rare' })
  ));
  const normalDrops = rollMany(normal, 96);
  const nightmareDrops = rollMany(nightmare, 96);
  const hellDrops = rollMany(hell, 96);
  assert.ok(normalDrops.every((item) => !ITEMS[item.itemId].setId && ITEMS[item.itemId].requiredLevel <= 14));
  assert.ok(nightmareDrops.every((item) => !ITEMS[item.itemId].setId && ITEMS[item.itemId].requiredLevel <= 15));
  assert.ok(hellDrops.every((item) => !ITEMS[item.itemId].setId && ITEMS[item.itemId].requiredLevel <= 18));
  assert.ok(nightmareDrops.some((item) => ITEMS[item.itemId].requiredLevel === 15));
  assert.ok(hellDrops.some((item) => ITEMS[item.itemId].requiredLevel === 18));
});

test('set rarity and two-piece/four-piece bonuses are calculated by family', () => {
  assert.deepEqual(
    { name: RARITIES.set.name, color: RARITIES.set.color, affixes: RARITIES.set.affixes },
    { name: '세트', color: 0x3fd68a, affixes: 2 },
  );

  const swordTwo = calculatePlayerStats(1, equippedSet('guardian-oath', 2));
  const swordFour = calculatePlayerStats(1, equippedSet('guardian-oath', 4));
  assert.equal(swordTwo.setCounts['guardian-oath'], 2);
  assert.equal(swordTwo.maxHp, 161);
  assert.equal(swordFour.counterDamagePct, 40);
  assert.equal(swordFour.counterReadyTicks, 90);

  const crossbowTwo = calculatePlayerStats(1, equippedSet('shadow-hunter', 2));
  const crossbowFour = calculatePlayerStats(1, equippedSet('shadow-hunter', 4));
  assert.equal(crossbowTwo.attackSpeed, 10);
  assert.equal(crossbowFour.pierceShots, 3);

  const staffTwo = calculatePlayerStats(1, equippedSet('ember-sage', 2));
  const staffFour = calculatePlayerStats(1, equippedSet('ember-sage', 4));
  assert.equal(staffTwo.skillCooldownReduction, 15);
  assert.equal(staffFour.counterFireField, true);
});

test('nightmare and hell boss set drops match the player family and deterministic rate', () => {
  let bossItemDrops = 0;
  let setDrops = 0;
  for (const difficulty of ['nightmare', 'hell']) {
    for (const family of ['sword', 'crossbow', 'staff']) {
      for (let seed = 1; seed <= 20; seed += 1) {
        const items = killKingBoss(seed, difficulty, family);
        assert.equal(items.length, 2);
        bossItemDrops += items.length;
        for (const item of items) {
          if (item.rarity !== 'set') continue;
          setDrops += 1;
          assert.equal(item.setId, Object.entries(ITEM_SETS).find(([, set]) => set.family === family)?.[0]);
          assert.equal(ITEMS[item.itemId].setId, item.setId);
          assert.equal(item.affixes.length, 2);
        }
      }
    }
  }
  assert.ok(setDrops / bossItemDrops >= 0.15 && setDrops / bossItemDrops <= 0.35);

  const normalItems = killKingBoss(77, 'normal', 'staff');
  assert.equal(normalItems.some((item) => item.rarity === 'set'), false);
});

test('forced boss set rolls use a matching piece, fixed rarity, and capped ilvl', () => {
  const world = createStageWorld({ seed: 1004, stageId: 'KB', difficulty: 'hell' });
  const item = rollStageItem(world, {
    boss: true,
    forcedRarity: 'set',
    setId: 'ember-sage',
  });
  assert.equal(item.rarity, 'set');
  assert.equal(item.setId, 'ember-sage');
  assert.ok(ITEMS[item.itemId].setId === item.setId);
  assert.equal(item.affixes.length, 2);
  assert.equal(item.ilvl, 20);
});

test('set bonuses are consumed by perfect-dodge and counter simulation', () => {
  const perfectDodge = (setId, family) => {
    const world = createStageWorld({
      seed: 1005,
      stageId: 'C1',
      character: { equipment: equippedSet(setId, 4) },
    });
    const player = world.entities.find((entity) => entity.kind === 'player');
    const enemy = world.entities.find((entity) => entity.kind === 'enemy');
    world.pendingHits.push({
      resolveTick: world.tick + 1,
      sourceId: enemy.id,
      targetId: player.id,
      shape: null,
      damage: 1,
      motionMult: 1,
      knockback: 0,
    });
    player.dodgeStartTick = world.tick;
    player.dodgeTicks = 2;
    player.iFrames = 2;
    player.perfectPaid = false;
    step(world, { hero: { seq: 1, moveX: 0, moveZ: 0, aim: 64, buttons: 0 } });
    assert.equal(player.family, family);
    return { world, player, enemy };
  };

  const swordDodge = perfectDodge('guardian-oath', 'sword');
  assert.equal(swordDodge.player.counterReadyTicks, 90);

  const crossbowDodge = perfectDodge('shadow-hunter', 'crossbow');
  assert.equal(crossbowDodge.player.pierceShotsRemaining, 3);
  crossbowDodge.player.counterReadyTicks = 0;
  stepPlayerMotion(crossbowDodge.world, crossbowDodge.player, {
    seq: 2,
    moveX: 0,
    moveZ: 0,
    aim: 0,
    ad: 12,
    buttons: BUTTONS.ATTACK,
  });
  crossbowDodge.player.attack.phase = 'active';
  crossbowDodge.player.attack.phaseTick = 0;
  crossbowDodge.player.attack.fired = false;
  const piercingShot = stepPlayerMotion(crossbowDodge.world, crossbowDodge.player, {
    seq: 3,
    moveX: 0,
    moveZ: 0,
    aim: 0,
    ad: 12,
    buttons: 0,
  });
  assert.equal(piercingShot.attackStrike.maxTargets, Infinity);
  assert.equal(crossbowDodge.player.pierceShotsRemaining, 2);

  const counterDamage = (setCount) => {
    const world = createStageWorld({
      seed: 1006,
      stageId: 'C1',
      character: { equipment: equippedSet('guardian-oath', setCount) },
    });
    const player = world.entities.find((entity) => entity.kind === 'player');
    const enemy = world.entities.find((entity) => entity.kind === 'enemy');
    world.entities = [player, enemy];
    world.roomEnemyIds = [enemy.id];
    world.enemyHistory = [];
    enemy.x = player.x + 1;
    enemy.z = player.z;
    enemy.hp = 10_000;
    enemy.maxHp = 10_000;
    enemy.spawnTicksLeft = 0;
    enemy.invulnerable = false;
    enemy.currentRoomId = world.arena.rooms[world.roomIndex].id;
    player.counterReadyTicks = 60;
    player.counterAttackerId = enemy.id;
    step(world, { hero: { seq: 1, moveX: 0, moveZ: 0, aim: 0, buttons: BUTTONS.ATTACK } });
    return world.events.find((event) => event.type === 'hit' && event.sourceId === player.id && event.skill === 'counter')?.damage;
  };
  assert.ok(counterDamage(4) > counterDamage(2));

  const staffWorld = createStageWorld({
    seed: 1007,
    stageId: 'C1',
    character: { equipment: equippedSet('ember-sage', 4) },
  });
  const staffPlayer = staffWorld.entities.find((entity) => entity.kind === 'player');
  const staffEnemy = staffWorld.entities.find((entity) => entity.kind === 'enemy');
  staffPlayer.counterReadyTicks = 60;
  staffPlayer.counterAttackerId = staffEnemy.id;
  step(staffWorld, { hero: { seq: 1, moveX: 0, moveZ: 0, aim: 64, buttons: BUTTONS.ATTACK } });
  const fireField = staffWorld.pendingImpacts.find((impact) => impact.kind === 'burn' && impact.id.endsWith(':fire'));
  assert.ok(fireField);
  assert.equal(fireField.motionMult, 0.2);
  assert.equal(fireField.endsTick - fireField.resolveTick, 60);
});

test('forged set IDs on non-set items do not count or grant bonuses', () => {
  const bases = ITEM_BASES.filter((base) => !base.setId).slice(0, 4);
  const equipment = bases.map((base) => ({ itemId: base.id }));
  const forgedEquipment = bases.map((base) => ({ itemId: base.id, setId: 'guardian-oath' }));
  const ordinaryStats = calculatePlayerStats(1, equipment);
  const forgedStats = calculatePlayerStats(1, forgedEquipment);

  assert.deepEqual(forgedStats.setCounts, {});
  assert.equal(forgedStats.counterDamagePct, 0);
  assert.equal(forgedStats.counterReadyTicks, 60);
  assert.equal(forgedStats.maxHp, ordinaryStats.maxHp);
  assert.equal(forgedStats.attack, ordinaryStats.attack);
});
