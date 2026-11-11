import assert from 'node:assert/strict';
import test from 'node:test';
import { POTION, POTION_DROP } from '../js/content/skills.js';
import { debugKillEnemy } from '../js/debug/combat.js';
import { completeStage, createStageWorld, playerStrike, step } from '../js/sim/world.js';

function killBoss({ potions = 0, party = null } = {}) {
  const world = createStageWorld({
    seed: 71129,
    stageId: 'C1',
    playerId: 'hero',
    ...(party ? { party } : { character: { potions } }),
  });
  const enemy = world.entities.find((entity) => entity.kind === 'enemy' && !entity.dead);
  enemy.boss = true;
  enemy.elite = false;
  if (party) {
    const player = world.entities.find((entity) => entity.kind === 'player' && entity.playerId === 'hero');
    enemy.hp = 1;
    enemy.maxHp = 1;
    enemy.defense = 0;
    enemy.invulnerable = false;
    enemy.spawnTicksLeft = 0;
    enemy.x = player.x + 0.5;
    enemy.z = player.z;
    playerStrike(
      world,
      player,
      { type: 'circle', originX: enemy.x, originZ: enemy.z, radius: 1 },
      1,
      'm6g-party-boss-kill',
      [],
      undefined,
      { rewind: false },
    );
    assert.equal(enemy.dead, true);
  } else assert.equal(debugKillEnemy(world, enemy), true);
  return { world, enemy };
}

test('enemy kills auto-collect gold and emit a pickup event without gold loot', () => {
  const { world, enemy } = killBoss();
  const autoPickup = world.events.find((event) => (
    event.type === 'pickup' && event.auto && event.lootType === 'gold'
  ));
  assert.ok(world.rewards.hero.gold > 0);
  assert.equal(world.entities.some((entity) => entity.kind === 'loot' && entity.lootType === 'gold'), false);
  assert.deepEqual(
    {
      entityId: autoPickup?.entityId,
      playerId: autoPickup?.playerId,
      lootId: autoPickup?.lootId,
      lootType: autoPickup?.lootType,
      gold: autoPickup?.gold,
      auto: autoPickup?.auto,
      x: autoPickup?.x,
      z: autoPickup?.z,
    },
    {
      entityId: world.entities.find((entity) => entity.kind === 'player').id,
      playerId: 'hero',
      lootId: null,
      lootType: 'gold',
      gold: world.rewards.hero.gold,
      auto: true,
      x: enemy.x,
      z: enemy.z,
    },
  );
});

test('potion drops are owner-scoped, picked up on contact, and respect carry cap on clear', () => {
  assert.deepEqual(POTION_DROP, { normal: 0.06, elite: 0.25, boss: 1 });
  assert.equal(POTION.maxCarry, 5);
  const { world } = killBoss({ potions: 4 });
  const player = world.entities.find((entity) => entity.kind === 'player');
  const potion = world.entities.find((entity) => entity.kind === 'loot' && entity.lootType === 'potion');
  assert.ok(potion);
  assert.equal(potion.ownerId, player.playerId);
  for (const loot of world.entities.filter((entity) => (
    entity.kind === 'loot' && entity.lootType === 'item'
  ))) {
    loot.x += 10;
    loot.z += 10;
  }
  const itemCount = world.rewards.hero.items.length;
  player.x = potion.x;
  player.z = potion.z;
  step(world, {
    hero: { seq: 1, moveX: 0, moveZ: 0, buttons: 0 },
  });
  assert.equal(player.potions, POTION.maxCarry);
  assert.equal(world.rewards.hero.items.length, itemCount);
  assert.equal(world.entities.some((entity) => entity.id === potion.id), false);
  assert.ok(world.events.some((event) => (
    event.type === 'pickup' && event.playerId === 'hero' && event.lootType === 'potion'
  )));

  const full = killBoss({ potions: POTION.maxCarry }).world;
  const fullPlayer = full.entities.find((entity) => entity.kind === 'player');
  const fullPotion = full.entities.find((entity) => entity.kind === 'loot' && entity.lootType === 'potion');
  assert.ok(fullPotion);
  fullPlayer.x = fullPotion.x;
  fullPlayer.z = fullPotion.z;
  step(full, {
    hero: { seq: 1, moveX: 0, moveZ: 0, buttons: 0 },
  });
  assert.equal(fullPlayer.potions, POTION.maxCarry);
  assert.equal(full.entities.some((entity) => entity.id === fullPotion.id), true);
  completeStage(full, 'clear');
  assert.equal(full.entities.some((entity) => entity.id === fullPotion.id), true);
});

test('boss potion drops are generated once for each party member', () => {
  const { world } = killBoss({
    party: [
      { playerId: 'hero', character: { potions: 0 } },
      { playerId: 'guest', character: { potions: 0 } },
    ],
  });
  const drops = world.entities.filter((entity) => entity.kind === 'loot' && entity.lootType === 'potion');
  assert.deepEqual(new Set(drops.map((entity) => entity.ownerId)), new Set(['hero', 'guest']));
});
