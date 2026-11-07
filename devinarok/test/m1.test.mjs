import assert from 'node:assert/strict';
import test from 'node:test';
import { ENEMIES } from '../js/content/enemies.js';
import { AFFIXES } from '../js/content/affixes.js';
import { ITEM_BASES, RARITIES } from '../js/content/items.js';
import { SKILLS } from '../js/content/skills.js';
import { HUB_ARENA, STAGE_LIST, STAGES } from '../js/content/stages.js';
import { BUTTONS, calculateDamage, calculatePlayerStats, completeStage, createLootUid, createStageWorld, rarityForRoll, rollStageItem, step, xpToNextLevel } from '../js/sim/world.js';
import { applyOperations, rekeySettlementItems } from '../js/save/ops.js';

test('M1 content references valid KayKit models and settled combat ranges', () => {
  assert.deepEqual(Object.keys(ENEMIES).sort(), ['commander', 'mage', 'minion', 'rogue', 'warrior']);
  assert.equal(ENEMIES.minion.model, 'Skeleton_Minion');
  assert.equal(ENEMIES.rogue.model, 'Skeleton_Rogue');
  assert.equal(ENEMIES.mage.model, 'Skeleton_Mage');
  for (const enemy of Object.values(ENEMIES)) {
    if (enemy.windupTicks) assert.ok(enemy.windupTicks >= 12);
  }
  assert.equal(SKILLS.spin.windupTicks, 5);
  assert.equal(SKILLS.dash.dashDistance, 4);
  assert.equal(SKILLS.guard.durationTicks, 45);
  assert.equal(ITEM_BASES.filter((item) => item.slot === 'weapon').length, 3);
  assert.equal(Object.keys(AFFIXES).length, 12);
  assert.deepEqual(Object.values(RARITIES).map((rarity) => rarity.weight), [60, 30, 9, 1]);
  assert.deepEqual(STAGE_LIST.map((stage) => stage.id), ['C1', 'C2', 'C3', 'CB']);
  for (const stage of [...STAGE_LIST.map((entry) => STAGES[entry.id]), HUB_ARENA]) {
    const props = new Map(stage.props.filter((prop) => prop.obstacleId).map((prop) => [prop.obstacleId, prop]));
    for (const obstacle of stage.obstacles) {
      const prop = props.get(obstacle.id);
      assert.ok(prop, `${stage.id}: obstacle ${obstacle.id} has no GLB`);
      assert.equal(prop.x, obstacle.x);
      assert.equal(prop.z, obstacle.z);
    }
  }
  for (const stage of STAGE_LIST.map((entry) => STAGES[entry.id])) {
    for (const room of stage.rooms) {
      const props = stage.props.filter((prop) => prop.roomId === room.id);
      assert.ok(new Set(props.map((prop) => prop.model)).size >= 6, `${stage.id}/${room.id}: room dressing is too repetitive`);
      assert.equal(props.filter((prop) => prop.model === 'assets/env/torch_mounted.glb').length, 2, `${stage.id}/${room.id}: expected two wall torches`);
      assert.ok(props.some((prop) => prop.wallSide), `${stage.id}/${room.id}: side walls are missing`);
      assert.ok(props.some((prop) => prop.z === room.centerZ - stage.depth / stage.rooms.length / 2 - 0.5), `${stage.id}/${room.id}: back wall is missing`);
    }
  }
});

test('M1 damage and level progression match the content contract', () => {
  assert.equal(calculateDamage(10, 1, false, 1.5, 0), 10);
  assert.equal(calculateDamage(10, 2, true, 1.5, 50), 20);
  assert.equal(xpToNextLevel(1), 60);
  assert.equal(xpToNextLevel(2), 182);
});

test('stage settlement preserves potions consumed during the sortie', () => {
  const world = createStageWorld({ seed: 73, stageId: 'C1', playerId: 'a', character: { potions: 3 } });
  step(world, { a: { seq: 1, moveX: 0, moveZ: 0, aim: 192, buttons: BUTTONS.POTION } });
  const result = completeStage(world, 'clear');
  assert.equal(world.entities.find((entity) => entity.kind === 'player').potions, 2);
  assert.equal(result.potions, 2);
});

test('boss kill collects both guaranteed item drops before final-room settlement', () => {
  const world = createStageWorld({ seed: 74, stageId: 'CB', playerId: 'a', character: { level: 7 } });
  const player = world.entities.find((entity) => entity.kind === 'player');
  const boss = world.entities.find((entity) => entity.boss);
  world.entities = world.entities.filter((entity) => entity.kind !== 'enemy' || entity.id === boss.id);
  world.roomEnemyIds = [boss.id];
  player.x = 0;
  player.z = -1.5;
  boss.x = 0;
  boss.z = 0;
  boss.hp = 1;
  boss.spawnTicksLeft = 0;
  boss.invulnerable = false;
  boss.attackCooldownTicks = 10000;
  for (let seq = 1; seq <= 15 && !world.outcome; seq += 1) {
    step(world, { a: { seq, moveX: 0, moveZ: 0, aim: 64, buttons: seq === 1 ? BUTTONS.ATTACK : 0 } });
  }
  assert.equal(world.outcome, 'clear');
  assert.equal(world.result.items.length, 2);
  assert.ok(world.result.items.every((item) => ['rare', 'legendary'].includes(item.rarity)));
  assert.equal(world.events.filter((event) => event.type === 'pickup' && event.lootType === 'item').length, 2);
});

test('rogue line dash moves five meters along its stored attack line', () => {
  const world = createStageWorld({ seed: 75, stageId: 'C1', playerId: 'a' });
  const player = world.entities.find((entity) => entity.kind === 'player');
  const rogue = world.entities.find((entity) => entity.kind === 'enemy');
  world.entities = [player, rogue];
  world.roomEnemyIds = [rogue.id];
  player.x = 0;
  player.z = 4.8;
  player.iFrames = 1000;
  rogue.enemyKind = 'rogue';
  rogue.x = 0;
  rogue.z = 0;
  rogue.spawnTicksLeft = 0;
  rogue.invulnerable = false;
  rogue.attackCooldownTicks = 0;
  const startZ = rogue.z;
  for (let seq = 1; seq <= 40 && rogue.recoverTicks === 0; seq += 1) {
    step(world, { a: { seq, moveX: 0, moveZ: 0, aim: 64, buttons: 0 } });
  }
  assert.equal(rogue.attackPattern, 'line-dash');
  assert.ok(Math.abs(rogue.z - startZ - 5) < 0.01);
  const hit = world.events.find((event) => event.type === 'hit' && event.sourceId === rogue.id);
  assert.equal(hit.shape.type, 'line');
  assert.equal(hit.shape.originZ, startZ);
  assert.equal(hit.shape.length, 5);
});

test('attack speed shortens combo timing without increasing damage', () => {
  const equipment = [{ itemId: 'ossuary-helm', enhance: 0, affixes: [] }];
  const fastEquipment = [{ ...equipment[0], affixes: [{ id: 'attackSpeed', value: 20 }] }];
  const runCombo = (gear) => {
    const world = createStageWorld({ seed: 76, stageId: 'C1', playerId: 'a', character: { equipment: gear } });
    const player = world.entities.find((entity) => entity.kind === 'player');
    const enemy = world.entities.find((entity) => entity.kind === 'enemy');
    world.entities = [player, enemy];
    world.roomEnemyIds = [enemy.id];
    player.x = 0;
    player.z = 0;
    enemy.x = 0;
    enemy.z = 1.2;
    enemy.hp = 100;
    enemy.maxHp = 100;
    enemy.spawnTicksLeft = 0;
    enemy.invulnerable = false;
    enemy.stunnedTicks = 1000;
    for (let seq = 1; seq <= 240; seq += 1) {
      const attack = player.attack;
      const buttons = !attack
        ? seq === 1 ? BUTTONS.ATTACK : 0
        : attack.step < 3 && attack.phase === 'recovery' && !attack.queued && seq % 2 === 0
          ? BUTTONS.ATTACK
          : 0;
      step(world, { a: { seq, moveX: 0, moveZ: 0, aim: 64, buttons } });
      if (seq > 1 && !player.attack) break;
    }
    return {
      ticks: world.tick,
      damage: world.events.filter((event) => event.type === 'hit' && event.sourceId === player.id).map((event) => event.damage),
    };
  };
  const normal = runCombo(equipment);
  const fast = runCombo(fastEquipment);
  assert.deepEqual(fast.damage, normal.damage);
  assert.equal(normal.damage.length, 3);
  assert.ok(fast.ticks < normal.ticks, `${fast.ticks} should be less than ${normal.ticks}`);
});

test('10,000 rarity rolls reproduce the declared distribution and boss items are rare+', () => {
  const counts = { common: 0, magic: 0, rare: 0, legendary: 0 };
  for (let index = 0; index < 10000; index += 1) counts[rarityForRoll(index / 10000)] += 1;
  assert.deepEqual(counts, { common: 6000, magic: 3000, rare: 900, legendary: 100 });
  for (let index = 0; index < 1000; index += 1) {
    assert.ok(['rare', 'legendary'].includes(rarityForRoll(index / 1000, { boss: true })));
  }
});

test('M1 stage loot is deterministic and death/retreat settlement retains half gold only', () => {
  const first = createStageWorld({ seed: 77, stageId: 'C1', playerId: 'a' });
  const second = createStageWorld({ seed: 77, stageId: 'C1', playerId: 'a' });
  assert.deepEqual(rollStageItem(first, { stageLevel: 1 }), rollStageItem(second, { stageLevel: 1 }));
  for (let tick = 0; tick < 120; tick += 1) {
    const input = { seq: tick + 1, moveX: 0, moveZ: 0, aim: 192, buttons: 0 };
    step(first, { a: input });
    step(second, { a: input });
  }
  assert.deepEqual(first.entities, second.entities);
  first.reward.gold = 101;
  first.reward.items = [{ itemId: 'rusted-sword', rarity: 'common' }];
  for (const outcome of ['death', 'retreat']) {
    const world = createStageWorld({ seed: 77, stageId: 'C1', playerId: 'a' });
    world.reward.gold = 101;
    world.reward.xp = 27;
    world.reward.items = [{ itemId: 'rusted-sword', rarity: 'common' }];
    const settled = completeStage(world, outcome);
    assert.equal(settled.gold, 50);
    assert.equal(settled.goldLost, 51);
    assert.equal(settled.xp, 27);
    assert.equal(settled.items.length, 0);
    assert.equal(settled.lostItems.length, 1);
  }
});

test('loot ids include stage and settlement deterministically rekeys saved uid collisions', () => {
  assert.equal(createLootUid(77, 'C2', 19), '77:C2:19');
  const items = [{ uid: '77:C2:19' }, { uid: '77:C2:19' }, { uid: '77:C2:19' }];
  const rekeyed = rekeySettlementItems(items, [{ uid: '77:C2:19' }]);
  assert.deepEqual(rekeyed.map((item) => item.uid), ['77:C2:19:1', '77:C2:19:2', '77:C2:19:3']);
});

test('forced rarity dev rolls still generate rarity-appropriate affixes', () => {
  const world = createStageWorld({ seed: 79, stageId: 'C1', playerId: 'a' });
  assert.equal(rollStageItem(world, { stageLevel: 1, forcedRarity: 'rare' }).affixes.length, 2);
  assert.equal(rollStageItem(world, { stageLevel: 1, forcedRarity: 'legendary' }).affixes.length, 4);
});

test('doors stay closed until every enemy in the room is defeated', () => {
  const world = createStageWorld({ seed: 103, stageId: 'C1', playerId: 'a' });
  const door = world.arena.doors.find((entry) => entry.fromRoom === world.arena.rooms[world.roomIndex].id);
  assert.ok(door);
  assert.equal(world.openDoors[door.id], undefined);
  step(world, { a: { seq: 1, moveX: 0, moveZ: 0, aim: 192, buttons: 0 } });
  assert.equal(world.openDoors[door.id], undefined);
  for (const enemy of world.entities.filter((entity) => entity.kind === 'enemy')) enemy.dead = true;
  step(world, { a: { seq: 2, moveX: 0, moveZ: 0, aim: 192, buttons: 0 } });
  assert.equal(world.openDoors[door.id], true);
  assert.ok(world.events.some((event) => event.type === 'doorOpen' && event.doorId === door.id));
});

test('all phase-two boss patterns telegraph for at least 12 ticks', () => {
  const world = createStageWorld({ seed: 101, stageId: 'CB', playerId: 'a', character: { level: 7 } });
  const boss = world.entities.find((entity) => entity.boss);
  boss.hp = Math.floor(boss.maxHp * 0.45);
  boss.spawnTicksLeft = 0;
  boss.invulnerable = false;
  boss.attackCooldownTicks = 0;
  const player = world.entities.find((entity) => entity.kind === 'player');
  player.hp = 100000;
  player.maxHp = 100000;
  const windups = new Map();
  for (let tick = 0; tick < 1800 && windups.size < 4; tick += 1) {
    const firstEventId = world.nextEventId;
    step(world, { a: { seq: tick + 1, moveX: 0, moveZ: 0, aim: 192, buttons: 0 } });
    for (const event of world.events) {
      if (event.eventId >= firstEventId && event.type === 'telegraph' && event.entityId === boss.id) {
        windups.set(event.pattern, boss.attackWindupTicks);
      }
    }
  }
  const telegraphs = world.events.filter((event) => event.type === 'telegraph');
  assert.deepEqual([...windups.keys()].sort(), ['charge', 'circles', 'combo', 'slam']);
  assert.ok([...windups.values()].every((ticks) => ticks >= 12));
  assert.ok(telegraphs.some((event) => event.shape?.type === 'circles'));
});

test('a frontal perfect guard stuns an enemy and reduces its incoming damage', () => {
  const world = createStageWorld({ seed: 107, stageId: 'C1', playerId: 'a' });
  const player = world.entities.find((entity) => entity.kind === 'player');
  const enemy = world.entities.find((entity) => entity.kind === 'enemy');
  player.x = 0;
  player.z = 0;
  player.guardTicks = 45;
  enemy.x = 0;
  enemy.z = 1;
  enemy.spawnTicksLeft = 0;
  enemy.invulnerable = false;
  enemy.attackPhase = 'active';
  enemy.attackPattern = 'melee';
  enemy.attackRemaining = 3;
  enemy.attackShape = { type: 'sector', originX: 0, originZ: 1, angle: -Math.PI / 2, range: 1.5, halfAngle: 0.8 };
  enemy.attackHit = false;
  step(world, { a: { seq: 1, moveX: 0, moveZ: 0, aim: 64, buttons: 0 } });
  assert.equal(player.hp, player.maxHp - 2);
  assert.equal(enemy.stunnedTicks, 30);
  assert.ok(world.events.some((event) => event.type === 'perfectBlock' && event.attackerId === enemy.id));
});

test('dodge i-frames avoid the active line of a boss charge', () => {
  const world = createStageWorld({ seed: 109, stageId: 'CB', playerId: 'a', character: { level: 7 } });
  const player = world.entities.find((entity) => entity.kind === 'player');
  const boss = world.entities.find((entity) => entity.boss);
  player.x = 0;
  player.z = 0;
  player.hp = player.maxHp;
  boss.x = 0;
  boss.z = -3;
  boss.spawnTicksLeft = 0;
  boss.invulnerable = false;
  boss.attackPhase = 'active';
  boss.attackPattern = 'charge';
  boss.attackRemaining = 9;
  boss.attackHit = false;
  boss.chargeAngle = Math.PI / 2;
  boss.attackShape = { type: 'line', originX: 0, originZ: -3, angle: Math.PI / 2, length: 9, width: 1.6 };
  const hp = player.hp;
  step(world, { a: { seq: 1, moveX: 0, moveZ: 127, aim: 64, buttons: BUTTONS.DODGE } });
  assert.equal(player.hp, hp);
  assert.ok(player.iFrames > 0);
  assert.ok(world.events.some((event) => event.type === 'dodge' && event.playerId === 'a'));
});

test('clear-settlement operations can be applied as one valid save change set', () => {
  const created = applyOperations(null, {}, [{ type: 'createCharacter', name: '정산자', kind: 'knight' }], 'hero');
  const world = createStageWorld({ seed: 113, stageId: 'C1', playerId: 'hero' });
  world.reward.xp = 85;
  world.reward.gold = 125;
  world.reward.items = [{ uid: 'loot-1', itemId: 'rusted-sword', rarity: 'rare', ilvl: 1, enhance: 0, affixes: [] }];
  const result = completeStage(world, 'clear');
  const settled = applyOperations(created.character, created.items, [
    { type: 'gainXp', amount: result.xp },
    { type: 'grantGold', amount: result.gold },
    ...result.items.map((item) => ({ type: 'grantItem', ...item })),
    { type: 'clearStage', stageId: result.stageId },
    { type: 'setPotions', count: result.potions },
  ], 'hero');
  assert.equal(settled.character.gold, 125);
  assert.equal(settled.character.level, 2);
  assert.ok(settled.character.clearedStages.includes('C1'));
  assert.ok(settled.items['loot-1']);
});

test('enhancement adds rounded 8% of base stat per successful rank', () => {
  const plain = calculatePlayerStats(1, [{ itemId: 'rusted-sword', enhance: 0 }]);
  const enhanced = calculatePlayerStats(1, [{ itemId: 'rusted-sword', enhance: 1 }]);
  assert.equal(enhanced.attack - plain.attack, 1);
});
