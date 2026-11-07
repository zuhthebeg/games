import assert from 'node:assert/strict';
import test from 'node:test';
import { COMBO_TIMELINES, createStageWorld, step } from '../js/sim/world.js';

function nearestEnemy(world, player) {
  return world.entities
    .filter((entity) => entity.kind === 'enemy' && !entity.dead && !entity.invulnerable)
    .sort((a, b) => Math.hypot(a.x - player.x, a.z - player.z) - Math.hypot(b.x - player.x, b.z - player.z))[0];
}

function inTelegraph(player, shape) {
  if (!shape) return false;
  if (shape.type === 'circle') return Math.hypot(player.x - shape.originX, player.z - shape.originZ) <= shape.radius + 0.5;
  if (shape.type === 'circles') return shape.circles.some((circle) => Math.hypot(player.x - circle.x, player.z - circle.z) <= circle.radius + 0.5);
  if (shape.type === 'line' || shape.type === 'sector') {
    const dx = player.x - shape.originX;
    const dz = player.z - shape.originZ;
    const distance = Math.hypot(dx, dz);
    if (distance > (shape.length ?? shape.range) + 0.5) return false;
    if (shape.type === 'line') {
      const forward = dx * Math.cos(shape.angle) + dz * Math.sin(shape.angle);
      const side = Math.abs(-dx * Math.sin(shape.angle) + dz * Math.cos(shape.angle));
      return forward >= 0 && side <= shape.width / 2 + 0.5;
    }
    const angle = Math.atan2(dz, dx) - shape.angle;
    return Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle))) <= shape.halfAngle + 0.15;
  }
  return false;
}

function botTick(world, seq) {
  const player = world.entities.find((entity) => entity.kind === 'player');
  const enemies = world.entities.filter((entity) => entity.kind === 'enemy' && !entity.dead && !entity.invulnerable);
  const imminent = enemies.find((enemy) => enemy.attackPhase === 'windup' && enemy.attackRemaining <= 6 && inTelegraph(player, enemy.attackShape));
  let target = nearestEnemy(world, player);
  let dx = 0;
  let dz = 0;
  if (imminent) {
    const angle = imminent.attackShape.angle ?? Math.atan2(player.z - imminent.z, player.x - imminent.x);
    dx = -Math.sin(angle);
    dz = Math.cos(angle);
  } else if (target) {
    dx = target.x - player.x;
    dz = target.z - player.z;
    const length = Math.hypot(dx, dz) || 1;
    if (length < 1.1) {
      dx = 0;
      dz = 0;
    }
  } else if (world.roomCleared) {
    const door = world.arena.doors.find((entry) => entry.fromRoom === world.arena.rooms[world.roomIndex]?.id);
    if (door) {
      dx = door.x - player.x;
      dz = door.z - player.z;
    }
  }
  const magnitude = Math.hypot(dx, dz) || 1;
  const moveX = Math.round(dx / magnitude * 127);
  const moveZ = Math.round(dz / magnitude * 127);
  let buttons = 0;
  if (imminent && player.dodgeCooldownTicks === 0 && !(player.previousButtons & 2)) buttons |= 2;
  else if (player.hp < player.maxHp * 0.58 && player.potions > 0 && player.potionCooldownTicks === 0) buttons |= 64;
  else if (player.attack) {
    const timeline = COMBO_TIMELINES[player.attack.step - 1];
    if (player.attack.phase === 'recovery' && player.attack.phaseTick >= timeline.recoveryTicks - timeline.chainWindowTicks) buttons |= 1;
  } else if (target) buttons |= 1;
  const aim = Math.round((Math.atan2(dz, dx) / (Math.PI * 2) * 256 + 256) % 256);
  return { seq, moveX, moveZ, aim, buttons };
}

function runBot({ seed, stageId, level, equipment = [], potions = 5, maxTicks = 5400 }) {
  const id = 'bot';
  const world = createStageWorld({ seed, stageId, playerId: id, character: { level, potions, equipment } });
  for (let tick = 1; tick <= maxTicks && !world.outcome; tick += 1) {
    step(world, { [id]: botTick(world, tick) });
  }
  return { outcome: world.outcome, tick: world.tick, seconds: world.tick / 30, hp: world.entities.find((entity) => entity.kind === 'player')?.hp ?? 0 };
}

test('scripted input-record bot keeps C1 level-1 clears within one of the M1 baseline', () => {
  const runs = Array.from({ length: 10 }, (_, index) => runBot({ seed: 101 + index, stageId: 'C1', level: 1 }));
  const clears = runs.filter((run) => run.outcome === 'clear');
  const averageSeconds = clears.length ? clears.reduce((sum, run) => sum + run.seconds, 0) / clears.length : 0;
  console.log(`M1 bot C1 L1: ${clears.length}/10 clears; mean clear time ${averageSeconds.toFixed(1)}s`);
  assert.ok(clears.length >= 9);
  assert.ok(clears.every((run) => run.seconds <= 180));
});

test('scripted input-record bot keeps level-7 boss wins within one of the M1 baseline', () => {
  const equipment = [
    { itemId: 'grave-greatsword', enhance: 0, affixes: [{ id: 'attackPercent', value: 8 }, { id: 'critChance', value: 3 }] },
    { itemId: 'ossuary-helm', enhance: 0, affixes: [{ id: 'defense', value: 3 }, { id: 'maxHp', value: 20 }] },
    { itemId: 'ossuary-plate', enhance: 0, affixes: [{ id: 'maxHp', value: 20 }, { id: 'defense', value: 3 }] },
    { itemId: 'bone-gauntlets', enhance: 0, affixes: [{ id: 'attackPercent', value: 8 }, { id: 'lifesteal', value: 3 }] },
    { itemId: 'ossuary-greaves', enhance: 0, affixes: [{ id: 'moveSpeed', value: 5 }, { id: 'maxHp', value: 20 }] },
  ];
  const runs = Array.from({ length: 10 }, (_, index) => runBot({ seed: 301 + index, stageId: 'CB', level: 7, equipment, potions: 3, maxTicks: 9000 }));
  const wins = runs.filter((run) => run.outcome === 'clear');
  const deaths = runs.filter((run) => run.outcome === 'death');
  console.log(`M1 bot CB L7 rare gear: ${wins.length}/10 wins; ${deaths.length}/10 deaths`);
  assert.ok(wins.length >= 7 && wins.length <= 9);
  assert.ok(deaths.length >= 1 && deaths.length <= 3);
});
