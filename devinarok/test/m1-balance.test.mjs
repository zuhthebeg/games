import assert from 'node:assert/strict';
import test from 'node:test';
import { BUTTONS, COMBO_TIMELINES, createStageWorld, step } from '../js/sim/world.js';

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

function botTick(world, seq, { aimAtTarget = false } = {}) {
  const player = world.entities.find((entity) => entity.kind === 'player');
  const ranged = player.family === 'crossbow' || player.family === 'staff';
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
    if (ranged && length < 5.5) {
      dx = -dx;
      dz = -dz;
    } else if (ranged && length <= 6.5) {
      dx = 0;
      dz = 0;
    } else if (length < 1.1) {
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
  let moveX = Math.round(dx / magnitude * 127);
  let moveZ = Math.round(dz / magnitude * 127);
  const targetDistance = target ? Math.hypot(target.x - player.x, target.z - player.z) : Infinity;
  if (aimAtTarget && !ranged && !imminent && target && targetDistance < 1.1) {
    moveX = Math.round((target.x - player.x) / targetDistance * 16);
    moveZ = Math.round((target.z - player.z) / targetDistance * 16);
  }
  let buttons = 0;
  if (imminent && player.dodgeCooldownTicks === 0 && !(player.previousButtons & 2)) buttons |= 2;
  else if (player.hp < player.maxHp * 0.58 && player.potions > 0 && player.potionCooldownTicks === 0) buttons |= 64;
  else if (ranged && target && !player.skillCast) {
    const availableSkill = [1, 2, 3].find((id) => (player.skillCooldowns?.[id] ?? 0) === 0);
    if (availableSkill) buttons |= [BUTTONS.SKILL1, BUTTONS.SKILL2, BUTTONS.SKILL3][availableSkill - 1];
    else if (!player.attack) buttons |= BUTTONS.ATTACK;
  } else if (!ranged && player.attack) {
    const timeline = COMBO_TIMELINES[player.attack.step - 1];
    if (player.attack.phase === 'recovery' && player.attack.phaseTick >= timeline.recoveryTicks - timeline.chainWindowTicks) buttons |= 1;
  } else if (!ranged && target) buttons |= 1;
  const aimDx = aimAtTarget && target ? target.x - player.x : dx;
  const aimDz = aimAtTarget && target ? target.z - player.z : dz;
  const aim = Math.round((Math.atan2(aimDz, aimDx) / (Math.PI * 2) * 256 + 256) % 256);
  return { seq, moveX, moveZ, aim, buttons };
}

function runBot({ seed, stageId, level, equipment = [], potions = 5, maxTicks = 5400, aimAtTarget = false }) {
  const id = 'bot';
  const world = createStageWorld({ seed, stageId, playerId: id, character: { level, potions, equipment } });
  for (let tick = 1; tick <= maxTicks && !world.outcome; tick += 1) {
    step(world, { [id]: botTick(world, tick, { aimAtTarget }) });
  }
  const player = world.entities.find((entity) => entity.kind === 'player');
  const boss = world.entities.find((entity) => entity.kind === 'enemy' && entity.boss);
  return {
    outcome: world.outcome,
    tick: world.tick,
    seconds: world.tick / 30,
    hp: player?.hp ?? 0,
    maxHp: player?.maxHp ?? 0,
    bossDamage: boss ? boss.maxHp - boss.hp : null,
    roomIndex: world.roomIndex,
    roomCleared: world.roomCleared,
    playerPosition: player ? { x: player.x, z: player.z } : null,
    remainingEnemies: world.entities
      .filter((entity) => entity.kind === 'enemy' && !entity.dead)
      .map((entity) => ({
        kind: entity.enemyKind,
        x: Number(entity.x.toFixed(1)),
        z: Number(entity.z.toFixed(1)),
        hp: entity.hp,
        spawnTicksLeft: entity.spawnTicksLeft,
      })),
  };
}

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2
    ? ordered[middle]
    : (ordered[middle - 1] + ordered[middle]) / 2;
}

test('scripted input-record bot keeps C1 level-1 clears within one of the M1 baseline', () => {
  const runs = Array.from({ length: 10 }, (_, index) => runBot({ seed: 101 + index, stageId: 'C1', level: 1 }));
  const clears = runs.filter((run) => run.outcome === 'clear');
  const averageSeconds = clears.length ? clears.reduce((sum, run) => sum + run.seconds, 0) / clears.length : 0;
  console.log(`M1 bot C1 L1: ${clears.length}/10 clears; mean clear time ${averageSeconds.toFixed(1)}s`);
  assert.equal(clears.length, 10);
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
  console.log(`M1 bot CB L7 rare gear: ${wins.length}/10 wins`);
  assert.ok(wins.length >= 8 && wins.length <= 10);
});

test('crossbow and staff bots reach C1 L1 starter clear targets', () => {
  for (const [family, itemId] of [['crossbow', 'rusted-crossbow'], ['staff', 'apprentice-wand']]) {
    const runs = Array.from({ length: 10 }, (_, index) => runBot({
      seed: 101 + index,
      stageId: 'C1',
      level: 1,
      equipment: [{ itemId, rarity: 'common', enhance: 0, affixes: [] }],
    }));
    const clears = runs.filter((run) => run.outcome === 'clear');
    console.log(`M3a ${family} bot C1 L1: ${clears.length}/10 clears`);
    assert.ok(clears.length >= 9, `${family} C1 L1: ${clears.length}/10`);
  }
});

test('crossbow and staff bots keep level-7 boss wins in the target band', () => {
  const armor = [
    { itemId: 'ossuary-helm', enhance: 0, affixes: [{ id: 'defense', value: 3 }, { id: 'maxHp', value: 20 }] },
    { itemId: 'ossuary-plate', enhance: 0, affixes: [{ id: 'maxHp', value: 20 }, { id: 'defense', value: 3 }] },
    { itemId: 'bone-gauntlets', enhance: 0, affixes: [{ id: 'attackPercent', value: 8 }, { id: 'lifesteal', value: 3 }] },
    { itemId: 'ossuary-greaves', enhance: 0, affixes: [{ id: 'moveSpeed', value: 5 }, { id: 'maxHp', value: 20 }] },
  ];
  const results = [];
  for (const [family, itemId] of [['crossbow', 'grave-crossbow'], ['staff', 'elder-staff']]) {
    const equipment = [
      { itemId, enhance: 0, affixes: [{ id: 'attackPercent', value: 8 }, { id: 'critChance', value: 3 }] },
      ...armor,
    ];
    const runs = Array.from({ length: 10 }, (_, index) => runBot({
      seed: 301 + index,
      stageId: 'CB',
      level: 7,
      equipment,
      potions: 3,
      maxTicks: 9000,
    }));
    const wins = runs.filter((run) => run.outcome === 'clear');
    const medianClearSeconds = median(wins.map((run) => run.seconds));
    console.log(`M3a ${family} bot CB L7 rare gear: ${wins.length}/10 wins; median clear ${medianClearSeconds.toFixed(1)}s`);
    console.log(`M3a ${family} CB seeds: ${runs.map((run) => `${run.outcome}@${run.seconds.toFixed(1)}s hp${run.hp}/${run.maxHp} bossDmg${run.bossDamage}`).join(', ')}`);
    results.push({ family, wins: wins.length, medianClearSeconds });
  }
  for (const { family, wins, medianClearSeconds } of results) {
    assert.ok(wins >= 7, `${family} CB L7: ${wins}/10`);
    if (wins < 10) {
      assert.ok(medianClearSeconds >= 45 && medianClearSeconds <= 120, `${family} CB median: ${medianClearSeconds.toFixed(1)}s`);
    }
  }
});

test('region-2 balance gates use L5 gear in F1 and L7 gear in FB', () => {
  const armor = {
    5: [
      ['ossuary-helm', 'ossuary-plate', 'bone-gauntlets', 'ossuary-greaves'],
      [
        [{ id: 'defense', value: 3 }, { id: 'maxHp', value: 20 }],
        [{ id: 'maxHp', value: 20 }, { id: 'defense', value: 3 }],
        [{ id: 'attackPercent', value: 8 }, { id: 'lifesteal', value: 3 }],
        [{ id: 'moveSpeed', value: 5 }, { id: 'maxHp', value: 20 }],
      ],
    ],
    7: [
      ['ash-hood', 'ash-coat', 'ash-gloves', 'ash-greaves'],
      [
        [{ id: 'defense', value: 4 }, { id: 'maxHp', value: 28 }],
        [{ id: 'maxHp', value: 28 }, { id: 'defense', value: 4 }],
        [{ id: 'attackPercent', value: 10 }, { id: 'lifesteal', value: 4 }],
        [{ id: 'moveSpeed', value: 6 }, { id: 'maxHp', value: 28 }],
      ],
    ],
  };
  const weaponIds = {
    5: { sword: 'grave-greatsword', crossbow: 'grave-crossbow', staff: 'elder-staff' },
    7: { sword: 'ash-sword', crossbow: 'ash-crossbow', staff: 'ash-staff' },
  };
  const runFamily = (family, stageId, gearLevel, characterLevel) => {
    const [armorIds, armorAffixes] = armor[gearLevel];
    const equipment = [
      {
        itemId: weaponIds[gearLevel][family],
        rarity: 'rare',
        enhance: 0,
        affixes: [{ id: 'attackPercent', value: 8 }, { id: 'critChance', value: 3 }],
      },
      ...armorIds.map((itemId, index) => ({
        itemId,
        rarity: 'rare',
        enhance: 0,
        affixes: armorAffixes[index],
      })),
    ];
    const runs = Array.from({ length: 10 }, (_, index) => runBot({
      seed: (stageId === 'F1' ? 701 : 801) + index,
      stageId,
      level: characterLevel,
      equipment,
      potions: 3,
      maxTicks: 9000,
      aimAtTarget: true,
    }));
    const wins = runs.filter((run) => run.outcome === 'clear');
    const medianClearSeconds = median(wins.map((run) => run.seconds));
    console.log(`M3b ${family} ${stageId} L${characterLevel}/L${gearLevel}: ${wins.length}/10 clears; median ${medianClearSeconds.toFixed(1)}s`);
    console.log(`M3b ${family} ${stageId} seeds: ${runs.map((run) => `${run.outcome}@${run.seconds.toFixed(1)}s hp${run.hp}/${run.maxHp}`).join(', ')}`);
    const stalled = runs.filter((run) => run.outcome !== 'clear');
    if (stalled.length) console.log(`M3b ${family} ${stageId} stalls: ${JSON.stringify(stalled.map(({ tick, roomIndex, roomCleared, playerPosition, remainingEnemies }) => ({ tick, roomIndex, roomCleared, playerPosition, remainingEnemies })))}`);
    return { family, stageId, wins: wins.length, medianClearSeconds };
  };

  const results = ['sword', 'crossbow', 'staff'].flatMap((family) => [
    runFamily(family, 'F1', 5, 7),
    runFamily(family, 'FB', 7, 10),
  ]);
  for (const result of results.filter((entry) => entry.stageId === 'F1')) {
    assert.ok(result.wins >= 9, `${result.family} F1: ${result.wins}/10`);
  }
  const swordBoss = results.find((entry) => entry.family === 'sword' && entry.stageId === 'FB');
  assert.ok(swordBoss.wins >= 7 && swordBoss.wins <= 9, `sword FB: ${swordBoss.wins}/10`);
  for (const result of results.filter((entry) => entry.family !== 'sword' && entry.stageId === 'FB')) {
    assert.ok(result.wins >= 7, `${result.family} FB: ${result.wins}/10`);
  }
});
