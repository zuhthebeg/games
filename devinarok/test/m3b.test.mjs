import assert from 'node:assert/strict';
import test from 'node:test';
import { ENEMIES } from '../js/content/enemies.js';
import { equipmentLook, ITEM_BASES, ITEMS } from '../js/content/items.js';
import { isStageUnlocked, STAGE_LIST } from '../js/content/stages.js';
import { BUTTONS, completeStage, createStageWorld, step, xpToNextLevel } from '../js/sim/world.js';

function input(seq, buttons = 0, aim = 64) {
  return { seq, moveX: 0, moveZ: 0, aim, buttons };
}

function prepareEnemy(stageId, enemyKind, playerPosition, enemyPosition = { x: 0, z: 0 }) {
  const world = createStageWorld({ seed: 712, stageId, playerId: 'hero' });
  const player = world.entities.find((entity) => entity.kind === 'player');
  const enemy = world.entities.find((entity) => entity.kind === 'enemy' && entity.enemyKind === enemyKind);
  assert.ok(enemy, `${stageId} has a ${enemyKind}`);
  world.entities = [player, enemy];
  world.roomEnemyIds = [enemy.id];
  player.x = playerPosition.x;
  player.z = playerPosition.z;
  enemy.x = enemyPosition.x;
  enemy.z = enemyPosition.z;
  enemy.currentRoomId = world.arena.rooms[world.roomIndex].id;
  enemy.spawnTicksLeft = 0;
  enemy.invulnerable = false;
  enemy.attackCooldownTicks = 0;
  return { world, player, enemy };
}

function prepareBoss(playerIds = ['hero']) {
  const party = playerIds.map((playerId) => ({ playerId }));
  const world = createStageWorld({ seed: 713, stageId: 'FB', playerId: playerIds[0], party });
  const boss = world.entities.find((entity) => entity.kind === 'enemy' && entity.enemyKind === 'ashwarden');
  const players = world.entities.filter((entity) => entity.kind === 'player');
  world.roomEnemyIds = [boss.id];
  boss.x = 0;
  boss.z = world.arena.rooms[world.roomIndex].centerZ;
  boss.currentRoomId = world.arena.rooms[world.roomIndex].id;
  boss.spawnTicksLeft = 0;
  boss.invulnerable = false;
  boss.attackCooldownTicks = 0;
  for (const [index, player] of players.entries()) {
    player.x = 2 + index;
    player.z = boss.z;
  }
  return { world, boss, players };
}

test('forest summoner spawns at most four of its own minions', () => {
  const { world, player, enemy: ashcaller } = prepareEnemy('F1', 'ashcaller', { x: 2, z: 0 });
  const summon = () => {
    ashcaller.attackPhase = 'active';
    ashcaller.attackPattern = 'summon';
    ashcaller.attackRemaining = 1;
    ashcaller.attackHit = false;
    ashcaller.attackCooldownTicks = 0;
    step(world, { hero: input(world.tick + 1) });
  };
  summon();
  summon();
  summon();
  assert.equal(world.entities.filter((entity) => entity.kind === 'enemy' && !entity.dead && entity.summonedBy === ashcaller.id).length, 4);
  assert.equal(world.entities.filter((entity) => entity.kind === 'player').length, 1);
  assert.equal(player.playerId, 'hero');
  assert.equal(ENEMIES.ashcaller.summon.maxAlive, 4);
});

test('forest rooms have dense props, solid cover, and two close staggered tree rows', () => {
  const forestStages = STAGE_LIST.filter((stage) => stage.region === 2);
  for (const stage of forestStages) {
    for (const room of stage.rooms) {
      const interior = stage.props.filter((prop) => prop.roomId === room.id && prop.forestInterior);
      const solid = interior.filter((prop) => prop.solid !== false);
      const boundary = stage.props.filter((prop) => prop.roomId === room.id && prop.forestBoundary);
      assert.ok(interior.length >= 12, `${stage.id}/${room.id} has ${interior.length} interior props`);
      assert.ok(solid.length >= 4, `${stage.id}/${room.id} has ${solid.length} solid interior props`);
      assert.ok(boundary.length >= 50, `${stage.id}/${room.id} has ${boundary.length} perimeter trees`);
      for (const row of [0, 1]) {
        for (const axis of ['horizontal', 'vertical']) {
          for (const side of [-1, 1]) {
            const positions = boundary
              .filter((prop) => prop.forestBoundaryRow === row
                && prop.forestBoundaryAxis === axis
                && prop.forestBoundarySide === side)
              .map((prop) => axis === 'horizontal' ? prop.x : prop.z)
              .sort((a, b) => a - b);
            assert.ok(positions.length >= 5, `${stage.id}/${room.id} tree row ${row}/${axis}/${side}`);
            for (let index = 1; index < positions.length; index += 1) {
              assert.ok(positions[index] - positions[index - 1] <= 2.5, `${stage.id}/${room.id} tree spacing`);
            }
          }
        }
      }
    }
  }

  const propsFor = (stageId) => STAGE_LIST.find((stage) => stage.id === stageId).props;
  assert.ok(propsFor('F1').filter((prop) => prop.forestInterior && /log/.test(prop.model)).length >= 6);
  assert.ok(propsFor('F2').filter((prop) => prop.bogPool).length >= 4);
  assert.ok(propsFor('F3').filter((prop) => prop.forestInterior && /fence|campfire/.test(prop.model)).length >= 5);
  assert.ok(propsFor('FB').filter((prop) => prop.forestInterior && /tree_.*fall/.test(prop.model)).length >= 8);
});

test('new enemies use the existing stage-level HP and attack scaling', () => {
  const { enemy: ashcaller } = prepareEnemy('F1', 'ashcaller', { x: 2, z: 0 });
  assert.equal(ashcaller.maxHp, Math.round(ENEMIES.ashcaller.hp * (1 + 0.12 * 6)));
  assert.equal(ashcaller.attack, Math.round(ENEMIES.ashcaller.attack * (1 + 0.12 * 6)));
  const { enemy: brute } = prepareEnemy('F3', 'brute', { x: 2, z: 0 });
  assert.equal(brute.maxHp, Math.round(ENEMIES.brute.hp * (1 + 0.12 * 8)));
  assert.equal(brute.modelScale, 1.3);
});

test('summoned minions award one-quarter XP and gold without item drops', () => {
  const { world, player, enemy: minion } = prepareEnemy('F1', 'minion', { x: 0, z: 0 }, { x: 0, z: 0.8 });
  minion.hp = 1;
  minion.maxHp = 30;
  minion.summoned = true;
  minion.summonedBy = 900;
  for (let seq = 1; seq <= 18 && !minion.dead; seq += 1) {
    step(world, { hero: input(seq, seq === 1 ? BUTTONS.ATTACK : 0) });
  }
  assert.equal(minion.dead, true);
  assert.equal(world.reward.xp, Math.round(ENEMIES.minion.xp * 0.25));
  assert.equal(world.reward.items.length, 0);
  assert.ok(world.reward.gold > 0);
});

test('bone archer telegraphs the configured 10 by 0.6 meter line', () => {
  const { world, player, enemy } = prepareEnemy('F2', 'bonearcher', { x: 6, z: 0 });
  player.z = enemy.z;
  step(world, { hero: input(1) });
  assert.equal(enemy.attackPattern, 'ranged-line');
  assert.equal(enemy.attackRemaining, 20);
  assert.deepEqual(
    { type: enemy.attackShape.type, length: enemy.attackShape.length, width: enemy.attackShape.width },
    { type: 'line', length: 10, width: 0.6 },
  );
  assert.ok(world.events.some((event) => event.type === 'telegraph' && event.pattern === 'ranged-line'));

  enemy.attackPhase = 'active';
  enemy.attackPattern = 'ranged-line';
  enemy.attackRemaining = 1;
  enemy.attackHit = false;
  enemy.attackCooldownTicks = 0;
  enemy.attackShape = { type: 'line', originX: enemy.x, originZ: enemy.z, angle: 0, length: 10, width: 0.6 };
  step(world, { hero: input(2) });
  assert.equal(world.pendingHits[0].targetId, player.id);
  step(world, { hero: input(3) });
  const hit = world.events.find((event) => event.type === 'hit' && event.sourceId === enemy.id && event.targetId === player.id);
  assert.equal(hit.damage, enemy.attack);
});

test('brute slam telegraphs a 2.2 meter circle and applies 0.8 meter knockback', () => {
  const { world, player, enemy } = prepareEnemy('F3', 'brute', { x: 1.5, z: 0 });
  step(world, { hero: input(1) });
  assert.equal(enemy.attackPattern, 'slam');
  assert.equal(enemy.attackRemaining, 28);
  assert.deepEqual(
    { type: enemy.attackShape.type, radius: enemy.attackShape.radius },
    { type: 'circle', radius: 2.2 },
  );

  enemy.attackPhase = 'active';
  enemy.attackPattern = 'slam';
  enemy.attackRemaining = 1;
  enemy.attackHit = false;
  enemy.attackCooldownTicks = 0;
  enemy.attackShape = { type: 'circle', originX: enemy.x, originZ: enemy.z, radius: 2.2 };
  const oldX = player.x;
  const oldHp = player.hp;
  step(world, { hero: input(2) });
  step(world, { hero: input(3) });
  assert.equal(oldHp - player.hp, enemy.attack);
  assert.ok(player.x - oldX >= 0.75);
});

test('ashwarden summon wave creates four minions and never stacks a second live wave', () => {
  const { world, boss } = prepareBoss();
  step(world, { hero: input(1) });
  assert.equal(boss.attackPattern, 'summon-wave');
  assert.equal(boss.attackRemaining, 30);
  for (let seq = 2; seq <= 36; seq += 1) step(world, { hero: input(seq) });
  const summoned = () => world.entities.filter((entity) => (
    entity.kind === 'enemy' && !entity.dead && entity.summonedBy === boss.id
  ));
  assert.equal(summoned().length, 4);

  boss.attackPhase = 'active';
  boss.attackPattern = 'summon-wave';
  boss.attackRemaining = 1;
  boss.attackCooldownTicks = 0;
  step(world, { hero: input(37) });
  assert.equal(summoned().length, 4);
});

test('ashwarden ash-rain marks every player and adds two phase-two circles', () => {
  const { world, boss } = prepareBoss(['hero', 'guest']);
  boss.attackPatternIndex = 1;
  step(world, { hero: input(1), guest: input(1) });
  let telegraph = world.events.find((event) => event.type === 'telegraph' && event.pattern === 'ash-rain');
  assert.ok(telegraph);
  assert.equal(telegraph.shape.circles.length, 4);
  assert.equal(boss.attackRemaining, 24);

  boss.attackPhase = null;
  boss.attackCooldownTicks = 0;
  boss.attackPatternIndex = 1;
  boss.hp = Math.floor(boss.maxHp * 0.5);
  world.events = [];
  step(world, { hero: input(2), guest: input(2) });
  telegraph = world.events.find((event) => event.type === 'telegraph' && event.pattern === 'ash-rain');
  assert.ok(telegraph);
  assert.equal(telegraph.shape.circles.length, 6);
  assert.equal(boss.attackRemaining, 19);

  const party = prepareBoss(['host', 'guest']);
  const [host, guest] = party.players;
  host.x = 2;
  guest.x = 3;
  const hitShape = {
    type: 'circles',
    circles: [host, guest].map((player) => ({ x: player.x, z: player.z, radius: 1.6 })),
  };
  party.boss.attackPhase = 'active';
  party.boss.attackPattern = 'ash-rain';
  party.boss.attackShape = hitShape;
  party.boss.attackRemaining = 1;
  party.boss.attackHit = false;
  const oldHp = new Map(party.players.map((player) => [player.playerId, player.hp]));
  step(party.world, { host: input(1), guest: input(1) });
  step(party.world, { host: input(2), guest: input(2) });
  const hitIds = new Set(party.world.events
    .filter((event) => event.type === 'hit' && event.sourceId === party.boss.id)
    .map((event) => event.targetId));
  assert.deepEqual(hitIds, new Set(party.players.map((player) => player.id)));
  assert.ok(party.players.every((player) => player.hp < oldHp.get(player.playerId)));
});

test('ashwarden bone-spear uses the commander line and phase-two windup', () => {
  const { world, boss, players } = prepareBoss();
  assert.equal(boss.maxHp, Math.round(ENEMIES.ashwarden.hp * (1 + 0.12 * 9)));
  assert.equal(boss.modelScale, ENEMIES.ashwarden.scale);
  players[0].x = 7;
  step(world, { hero: input(1) });
  assert.equal(boss.attackPattern, 'bone-spear');
  assert.deepEqual(
    { type: boss.attackShape.type, length: boss.attackShape.length, width: boss.attackShape.width },
    { type: 'line', length: 14, width: 1 },
  );
  assert.equal(boss.attackRemaining, 24);
  const boundary = prepareBoss();
  boundary.players[0].x = 5.5;
  step(boundary.world, { hero: input(1) });
  assert.notEqual(boundary.boss.attackPattern, 'bone-spear');

  const phaseTwo = prepareBoss();
  phaseTwo.players[0].x = 7;
  phaseTwo.boss.hp = Math.floor(phaseTwo.boss.maxHp * 0.5);
  step(phaseTwo.world, { hero: input(1) });
  assert.equal(phaseTwo.boss.attackPattern, 'bone-spear');
  assert.equal(phaseTwo.boss.attackRemaining, 18);
});

test('ashwarden blink telegraphs for 18 ticks and picks a reachable safe destination', () => {
  const { world, boss, players } = prepareBoss();
  boss.hitCountSinceBlink = 12;
  const from = { x: boss.x, z: boss.z };
  step(world, { hero: input(1) });
  assert.equal(boss.attackPattern, 'blink-away');
  assert.equal(boss.attackRemaining, 18);
  assert.equal(boss.attackShape.type, 'circle');
  assert.equal(boss.attackShape.originX, from.x);
  assert.equal(boss.attackShape.originZ, from.z);
  for (let seq = 2; seq <= 24 && !world.events.some((event) => event.type === 'bossBlink'); seq += 1) {
    step(world, { hero: input(seq) });
  }
  const blink = world.events.find((event) => event.type === 'bossBlink');
  assert.ok(blink);
  const { x, z } = blink.to;
  const room = world.arena.rooms[world.roomIndex];
  assert.ok(x >= -world.arena.width / 2 && x <= world.arena.width / 2);
  assert.ok(z >= room.centerZ - 10 && z <= room.centerZ + 10);
  assert.ok(players.every((player) => Math.hypot(x - player.x, z - player.z) >= 6));
  for (const obstacle of world.arena.obstacles.filter((entry) => entry.roomId === room.id && !entry.doorId)) {
    const blocked = obstacle.type === 'circle'
      ? Math.hypot(x - obstacle.x, z - obstacle.z) < obstacle.radius + boss.radius
      : Math.abs(x - obstacle.x) < obstacle.width / 2 + boss.radius
        && Math.abs(z - obstacle.z) < obstacle.depth / 2 + boss.radius;
    assert.equal(blocked, false, `blink destination intersects ${obstacle.id}`);
  }

  const timer = prepareBoss();
  timer.world.tick = 299;
  step(timer.world, { hero: input(1) });
  assert.equal(timer.boss.attackPattern, 'blink-away');
});

test('stage unlocks chain through region one, require CB, and credit every party member', () => {
  assert.equal(isStageUnlocked('F1', []), false);
  assert.equal(isStageUnlocked('F1', ['CB']), true);
  assert.equal(isStageUnlocked('F2', ['CB']), false);
  assert.equal(isStageUnlocked('F2', ['CB', 'F1']), true);
  assert.equal(isStageUnlocked('FB', ['CB', 'F1', 'F2', 'F3']), true);
  assert.equal(isStageUnlocked('unknown', ['CB']), false);

  const world = createStageWorld({
    seed: 714,
    stageId: 'F1',
    playerId: 'host',
    party: [{ playerId: 'host' }, { playerId: 'guest' }],
  });
  completeStage(world, 'clear');
  assert.deepEqual(Object.keys(world.results).sort(), ['guest', 'host']);
  for (const result of Object.values(world.results)) {
    assert.equal(result.outcome, 'clear');
    assert.equal(result.stageId, 'F1');
  }
});

test('forest item tiers use L5 stat values and the family-specific weapon looks', () => {
  for (const [requiredLevel, multiplier] of [[7, 1.4], [9, 1.85]]) {
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
  assert.equal(ITEMS['ash-sword'].name, '잿빛 장검');
  assert.equal(equipmentLook([{ itemId: 'ash-sword' }]).weapon, '1H_Sword');
  assert.equal(equipmentLook([{ itemId: 'necromancer-sword' }]).weapon, '2H_Sword');
  assert.equal(equipmentLook([{ itemId: 'ash-crossbow' }]).weapon, '2H_Crossbow');
  assert.equal(equipmentLook([{ itemId: 'necromancer-crossbow' }]).weapon, '2H_Crossbow');
  assert.equal(equipmentLook([{ itemId: 'ash-staff' }]).weapon, '2H_Staff');
  assert.equal(equipmentLook([{ itemId: 'necromancer-staff' }]).weapon, '2H_Staff');
});

test('XP progression remains available through level 20', () => {
  for (let level = 1; level <= 20; level += 1) assert.ok(xpToNextLevel(level) > 0);
});
