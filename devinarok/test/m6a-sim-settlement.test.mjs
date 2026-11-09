import assert from 'node:assert/strict';
import test from 'node:test';
import { debugKillEnemy } from '../js/debug/combat.js';
import { BUTTONS, completeStage, createStageWorld, step } from '../js/sim/world.js';

function stageWithPlayers(count) {
  const party = Array.from({ length: count }, (_, index) => ({
    playerId: index === 0 ? 'host' : `guest-${index}`,
    character: { potions: 2 },
  }));
  return createStageWorld({ seed: 61, stageId: 'C1', party });
}

function killOneEnemy(world) {
  const enemy = world.entities.find((entity) => entity.kind === 'enemy' && !entity.dead);
  assert.ok(enemy);
  const partySize = world.partySize;
  const previousSoloPlayerId = world.soloPlayerId;
  world.partySize = 1;
  world.soloPlayerId = 'host';
  const killed = debugKillEnemy(world, enemy);
  world.partySize = partySize;
  if (previousSoloPlayerId === undefined) delete world.soloPlayerId;
  else world.soloPlayerId = previousSoloPlayerId;
  assert.equal(killed, true);
  return enemy.enemyKind;
}

function usePotions(world) {
  const inputs = Object.fromEntries(world.players.map((entityId) => {
    const player = world.entities.find((entity) => entity.id === entityId);
    return [player.playerId, { seq: 100, buttons: BUTTONS.POTION }];
  }));
  step(world, inputs);
}

function awardPerfectDodges(world) {
  const attacker = world.entities.find((entity) => entity.kind === 'enemy' && !entity.dead);
  assert.ok(attacker);
  for (const entityId of world.players) {
    const player = world.entities.find((entity) => entity.id === entityId);
    player.iFrames = 4;
    player.dodgeStartTick = world.tick;
    player.dodgeTicks = 4;
    player.perfectPaid = false;
    world.pendingHits.push({
      resolveTick: world.tick + 1,
      sourceId: attacker.id,
      targetId: player.id,
      shape: { type: 'circle', originX: player.x, originZ: player.z, radius: 1 },
    });
  }
  const inputs = Object.fromEntries(world.players.map((entityId) => {
    const player = world.entities.find((entity) => entity.id === entityId);
    return [player.playerId, { seq: 101, buttons: 0 }];
  }));
  step(world, inputs);
}

test('solo settlement includes per-player kills, perfect dodges, and potions on retreat', () => {
  const world = stageWithPlayers(1);
  const kind = killOneEnemy(world);
  usePotions(world);
  awardPerfectDodges(world);
  const result = completeStage(world, 'retreat');
  assert.equal(result.outcome, 'retreat');
  assert.deepEqual(result.kills, { [kind]: 1 });
  assert.equal(result.perfectDodges, 1);
  assert.equal(result.potionsUsed, 1);
});

test('two-player death settlement keeps each player counters independent', () => {
  const world = stageWithPlayers(2);
  const kind = killOneEnemy(world);
  usePotions(world);
  awardPerfectDodges(world);
  completeStage(world, 'death');
  for (const playerId of ['host', 'guest-1']) {
    assert.equal(world.results[playerId].outcome, 'death');
    assert.deepEqual(world.results[playerId].kills, { [kind]: 1 });
    assert.equal(world.results[playerId].perfectDodges, 1);
    assert.equal(world.results[playerId].potionsUsed, 1);
  }
});
