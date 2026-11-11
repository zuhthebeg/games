import assert from 'node:assert/strict';
import test from 'node:test';
import { AFFIXES } from '../js/content/affixes.js';
import { ITEM_BASES } from '../js/content/items.js';
import { ENEMIES } from '../js/content/enemies.js';
import { DIFFICULTIES, effectiveStageLevel, STAGES } from '../js/content/stages.js';
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

function botTick(world, seq, { aimAtTarget = false, perfectDodge = false } = {}) {
  const player = world.entities.find((entity) => entity.kind === 'player');
  const ranged = player.family === 'crossbow' || player.family === 'staff';
  const enemies = world.entities.filter((entity) => entity.kind === 'enemy' && !entity.dead && !entity.invulnerable);
  const dodgeWindow = perfectDodge ? 3 : 6;
  const imminent = enemies.find((enemy) => enemy.attackPhase === 'windup' && enemy.attackRemaining <= dodgeWindow && inTelegraph(player, enemy.attackShape));
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
  if (target && !imminent) {
    const crossingDoor = world.arena.doors.find((door) => (
      world.openDoors?.[door.id] && (player.z - door.z) * (target.z - door.z) < 0
    ));
    const gate = crossingDoor && world.arena.obstacles.find((obstacle) => obstacle.doorId === crossingDoor.id);
    if (crossingDoor && gate) {
      const playerSide = player.z >= crossingDoor.z ? 1 : -1;
      const safeOffset = gate.depth / 2 + player.radius + 0.1;
      if (Math.abs(player.z - crossingDoor.z) <= safeOffset) {
        dx = 0;
        dz = playerSide;
      } else if (Math.abs(player.x - crossingDoor.x) > gate.width / 2 - player.radius) {
        dx = crossingDoor.x - player.x;
        dz = 0;
      }
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
  if (!imminent && player.counterReadyTicks > 0) {
    if (player.previousButtons & BUTTONS.ATTACK) buttons &= ~BUTTONS.ATTACK;
    else buttons |= BUTTONS.ATTACK;
  }
  const aimDx = aimAtTarget && target ? target.x - player.x : dx;
  const aimDz = aimAtTarget && target ? target.z - player.z : dz;
  const aim = Math.round((Math.atan2(aimDz, aimDx) / (Math.PI * 2) * 256 + 256) % 256);
  return { seq, moveX, moveZ, aim, buttons };
}

function runBot({ seed, stageId, level, equipment = [], potions = 5, maxTicks = 5400, aimAtTarget = false, perfectDodge = false, difficulty = 'normal' }) {
  const id = 'bot';
  const world = createStageWorld({ seed, stageId, difficulty, playerId: id, character: { level, potions, equipment } });
  let dodges = 0;
  let perfectDodges = 0;
  let potionsPickedUp = 0;
  let lastEventId = 0;
  let lastDamage = null;
  const playerId = world.entities.find((entity) => entity.kind === 'player')?.id;
  for (let tick = 1; tick <= maxTicks && !world.outcome; tick += 1) {
    step(world, { [id]: botTick(world, tick, { aimAtTarget, perfectDodge }) });
    for (const event of world.events) {
      if (event.eventId <= lastEventId) continue;
      lastEventId = event.eventId;
      if (event.type === 'dodge') dodges += 1;
      if (event.type === 'perfectDodge') perfectDodges += 1;
      if (event.type === 'pickup' && event.lootType === 'potion' && event.playerId === id) potionsPickedUp += 1;
      if (event.type === 'hit' && event.targetId === playerId && event.damage > 0) {
        const source = world.entities.find((entity) => entity.id === event.sourceId);
        lastDamage = { source: source?.enemyKind ?? event.sourceId, damage: event.damage };
      }
    }
  }
  const player = world.entities.find((entity) => entity.kind === 'player');
  const boss = world.entities.find((entity) => entity.kind === 'enemy' && entity.boss);
  return {
    outcome: world.outcome,
    reward: world.result ? structuredClone(world.result) : null,
    tick: world.tick,
    seconds: world.tick / 30,
    hp: player?.hp ?? 0,
    maxHp: player?.maxHp ?? 0,
    bossDamage: boss ? boss.maxHp - boss.hp : null,
    roomIndex: world.roomIndex,
    roomCleared: world.roomCleared,
    dodgeCount: dodges,
    perfectDodgeCount: perfectDodges,
    potionsPickedUp,
    lastDamage,
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

function settlementCaps(stageId, difficulty) {
  const stage = STAGES[stageId];
  const tier = DIFFICULTIES[difficulty];
  let enemyCount = 0;
  let bossCount = 0;
  let baseXp = 0;
  let summonerBudget = 0;
  let maxSummonerAddXp = 0;
  let maxBossAddXp = 0;
  const bossAddBudget = 40;
  for (const room of stage.rooms) {
    for (const wave of room.waves) {
      const rule = ENEMIES[wave.enemy];
      enemyCount += wave.count;
      baseXp += rule.xp * wave.count;
      if (rule.behavior === 'summoner') {
        summonerBudget += 60 * wave.count;
        maxSummonerAddXp = Math.max(maxSummonerAddXp, ENEMIES[rule.summon?.enemy ?? 'minion'].xp);
      }
      if (rule.behavior === 'boss-patterns') {
        bossCount += wave.count;
        const bossAddEnemyIds = Object.keys(rule.patterns?.['summon-wave']?.enemies ?? { minion: 1 });
        for (const enemyId of bossAddEnemyIds) {
          const bossAdd = ENEMIES[enemyId];
          maxBossAddXp = Math.max(maxBossAddXp, bossAdd.xp);
          if (bossAdd.behavior === 'summoner') {
            summonerBudget += 60 * bossAddBudget * wave.count;
            maxSummonerAddXp = Math.max(
              maxSummonerAddXp,
              ENEMIES[bossAdd.summon?.enemy ?? 'minion'].xp,
            );
          }
        }
      }
    }
  }
  const effectiveLevel = effectiveStageLevel(stage, difficulty);
  const goldGainMultiplier = 1 + (5 * (AFFIXES.goldGain.max + AFFIXES.goldGain.perIlvl * 20)) / 100;
  const xpGainMultiplier = 1 + (5 * (AFFIXES.xpGain.max + AFFIXES.xpGain.perIlvl * 20)) / 100;
  return {
    xp: Math.ceil((
      baseXp
      + 0.25 * maxSummonerAddXp * summonerBudget
      + maxBossAddXp * bossAddBudget * bossCount
    ) * tier.xpMult * xpGainMultiplier * 1.25),
    gold: Math.ceil(5 * effectiveLevel * tier.goldMult * goldGainMultiplier * (
      enemyCount + 0.25 * summonerBudget + bossAddBudget * bossCount
    ) * 1.25),
    items: enemyCount + 2 * bossCount + 20 * bossCount,
  };
}

function perfectDodgeSummary(runs) {
  const dodgeCount = runs.reduce((sum, run) => sum + run.dodgeCount, 0);
  const perfectCount = runs.reduce((sum, run) => sum + run.perfectDodgeCount, 0);
  const rate = dodgeCount ? (perfectCount / dodgeCount * 100).toFixed(1) : '0.0';
  const perRun = runs.map((run) => `${run.perfectDodgeCount}/${run.dodgeCount}`).join(',');
  return `${perfectCount}/${dodgeCount} (${rate}%) per-run=${perRun}`;
}

test('scripted input-record bot keeps C1 level-1 clears within one of the M1 baseline', () => {
  const runs = Array.from({ length: 10 }, (_, index) => runBot({ seed: 101 + index, stageId: 'C1', level: 1 }));
  const clears = runs.filter((run) => run.outcome === 'clear');
  const averageSeconds = clears.length ? clears.reduce((sum, run) => sum + run.seconds, 0) / clears.length : 0;
  console.log(`M1 bot C1 L1: ${clears.length}/10 clears; mean clear time ${averageSeconds.toFixed(1)}s`);
  console.log(`M6g solo C1 potion pickups: ${(runs.reduce((sum, run) => sum + run.potionsPickedUp, 0) / runs.length).toFixed(2)} per run`);
  console.log(`M1 bot C1 L1 perfect dodge: ${perfectDodgeSummary(runs)}`);
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
  const medianClearSeconds = wins.length ? median(wins.map((run) => run.seconds)) : null;
  console.log(`M1 bot CB L7 rare gear: ${wins.length}/10 wins; median ${medianClearSeconds?.toFixed(1) ?? '—'}s`);
  console.log(`M6g solo CB potion pickups: ${(runs.reduce((sum, run) => sum + run.potionsPickedUp, 0) / runs.length).toFixed(2)} per run`);
  console.log(`M1 bot CB perfect dodge: ${perfectDodgeSummary(runs)}`);
  assert.ok(wins.length >= 7 && wins.length <= 10);
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
    console.log(`M3a ${family} C1 perfect dodge: ${perfectDodgeSummary(runs)}`);
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
    console.log(`M3a ${family} CB perfect dodge: ${perfectDodgeSummary(runs)}`);
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
    console.log(`M3b ${family} ${stageId} perfect dodge: ${perfectDodgeSummary(runs)}`);
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
  assert.ok(swordBoss.wins >= 7 && swordBoss.wins <= 10, `sword FB: ${swordBoss.wins}/10`);
  for (const result of results.filter((entry) => entry.family !== 'sword' && entry.stageId === 'FB')) {
    assert.ok(result.wins >= 7, `${result.family} FB: ${result.wins}/10`);
  }
});

test('M5a K1 and KB gates include perfect-dodge counter outcomes', () => {
  const priorBossMedian = { sword: 80.4, crossbow: 60.8, staff: 62.8 };
  const armorAffixes = {
    9: [
      [{ id: 'defense', value: 5 }, { id: 'maxHp', value: 36 }],
      [{ id: 'maxHp', value: 36 }, { id: 'defense', value: 5 }],
      [{ id: 'attackPercent', value: 12 }, { id: 'lifesteal', value: 5 }],
      [{ id: 'moveSpeed', value: 7 }, { id: 'maxHp', value: 36 }],
    ],
    11: [
      [{ id: 'defense', value: 6 }, { id: 'maxHp', value: 44 }],
      [{ id: 'maxHp', value: 44 }, { id: 'defense', value: 6 }],
      [{ id: 'attackPercent', value: 14 }, { id: 'lifesteal', value: 6 }],
      [{ id: 'moveSpeed', value: 8 }, { id: 'maxHp', value: 44 }],
    ],
  };
  const gear = (level, family) => {
    const weapon = ITEM_BASES.find((item) => item.slot === 'weapon' && item.family === family && item.requiredLevel === level);
    const slots = ['head', 'body', 'hands', 'feet'];
    const armor = ITEM_BASES.filter((item) => item.slot !== 'weapon' && item.requiredLevel === level)
      .sort((a, b) => slots.indexOf(a.slot) - slots.indexOf(b.slot));
    return [
      { itemId: weapon.id, rarity: 'rare', affixes: [{ id: 'attackPercent', value: 8 }, { id: 'critChance', value: 3 }] },
      ...armor.map((item, index) => ({ itemId: item.id, rarity: 'rare', affixes: armorAffixes[level][index] })),
    ];
  };
  const results = ['sword', 'crossbow', 'staff'].flatMap((family) => ['K1', 'KB'].map((stageId) => {
    const characterLevel = stageId === 'K1' ? 11 : 14;
    const gearLevel = stageId === 'K1' ? 9 : 11;
    const runs = Array.from({ length: 10 }, (_, index) => runBot({
      seed: (stageId === 'K1' ? 901 : 1001) + index,
      stageId,
      level: characterLevel,
      equipment: gear(gearLevel, family),
      potions: 3,
      maxTicks: 9000,
      aimAtTarget: true,
    }));
    const clears = runs.filter((run) => run.outcome === 'clear');
    const medianSeconds = median(clears.map((run) => run.seconds));
    const dodges = runs.reduce((sum, run) => sum + run.dodgeCount, 0);
    const perfect = runs.reduce((sum, run) => sum + run.perfectDodgeCount, 0);
    console.log(`M5a ${family} ${stageId}: ${clears.length}/10, median ${medianSeconds.toFixed(1)}s, perfect dodge ${perfect}/${dodges} (${(dodges ? perfect / dodges * 100 : 0).toFixed(1)}%)`);
    console.log(`M5a ${family} ${stageId} seeds: ${runs.map((run) => `${run.outcome}@${run.seconds.toFixed(1)}s perfect=${run.perfectDodgeCount}/${run.dodgeCount} damage=${run.lastDamage?.source ?? 'none'}:${run.lastDamage?.damage ?? 0}`).join(', ')}`);
    return { family, stageId, wins: clears.length, medianSeconds };
  }));
  for (const result of results.filter((entry) => entry.stageId === 'K1')) {
    assert.ok(result.wins >= 9, `${result.family} K1: ${result.wins}/10`);
  }
  for (const result of results.filter((entry) => entry.stageId === 'KB')) {
    assert.ok(result.wins >= 7 && result.wins <= 10, `${result.family} KB: ${result.wins}/10`);
    if (result.wins) assert.ok(result.medianSeconds >= priorBossMedian[result.family] * 0.7, `${result.family} KB became too fast`);
  }
});

test('M5a perfect-dodge bot reports boss clears, medians, and perfect-dodge rates', () => {
  const weaponIds = {
    5: { sword: 'grave-greatsword', crossbow: 'grave-crossbow', staff: 'elder-staff' },
    7: { sword: 'ash-sword', crossbow: 'ash-crossbow', staff: 'ash-staff' },
    9: { sword: 'necromancer-sword', crossbow: 'necromancer-crossbow', staff: 'necromancer-staff' },
    11: { sword: 'royal-sword', crossbow: 'royal-crossbow', staff: 'royal-staff' },
  };
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
    9: [
      ['necromancer-hood', 'necromancer-robe', 'necromancer-gloves', 'necromancer-greaves'],
      [
        [{ id: 'defense', value: 5 }, { id: 'maxHp', value: 36 }],
        [{ id: 'maxHp', value: 36 }, { id: 'defense', value: 5 }],
        [{ id: 'attackPercent', value: 12 }, { id: 'lifesteal', value: 5 }],
        [{ id: 'moveSpeed', value: 7 }, { id: 'maxHp', value: 36 }],
      ],
    ],
    11: [
      ['royal-helm', 'royal-plate', 'royal-gauntlets', 'royal-greaves'],
      [
        [{ id: 'defense', value: 6 }, { id: 'maxHp', value: 44 }],
        [{ id: 'maxHp', value: 44 }, { id: 'defense', value: 6 }],
        [{ id: 'attackPercent', value: 14 }, { id: 'lifesteal', value: 6 }],
        [{ id: 'moveSpeed', value: 8 }, { id: 'maxHp', value: 44 }],
      ],
    ],
  };
  const equipmentFor = (gearLevel, family) => {
    const [armorIds, affixes] = armor[gearLevel];
    const weapon = ITEM_BASES.find((item) => item.id === weaponIds[gearLevel][family]);
    return [
      { itemId: weapon.id, rarity: 'rare', affixes: [{ id: 'attackPercent', value: 8 }, { id: 'critChance', value: 3 }] },
      ...armorIds.map((itemId, index) => ({ itemId, rarity: 'rare', affixes: affixes[index] })),
    ];
  };
  const stageSettings = {
    CB: { level: 7, gearLevel: 5, seed: 301 },
    FB: { level: 10, gearLevel: 7, seed: 801 },
    KB: { level: 14, gearLevel: 11, seed: 1001 },
  };

  for (const family of ['sword', 'crossbow', 'staff']) {
    for (const stageId of ['CB', 'FB', 'KB']) {
      const { level, gearLevel, seed } = stageSettings[stageId];
      const runs = (perfectDodge) => Array.from({ length: 10 }, (_, index) => runBot({
        seed: seed + index,
        stageId,
        level,
        equipment: equipmentFor(gearLevel, family),
        potions: 3,
        maxTicks: 9000,
        aimAtTarget: true,
        perfectDodge,
      }));
      const normal = runs(false);
      const skilled = runs(true);
      const normalClears = normal.filter((run) => run.outcome === 'clear');
      const skilledClears = skilled.filter((run) => run.outcome === 'clear');
      const normalMedian = normalClears.length ? median(normalClears.map((run) => run.seconds)) : null;
      const skilledMedian = skilledClears.length ? median(skilledClears.map((run) => run.seconds)) : null;
      const dodgeCount = skilled.reduce((sum, run) => sum + run.dodgeCount, 0);
      const perfectCount = skilled.reduce((sum, run) => sum + run.perfectDodgeCount, 0);
      console.log(`M5a skilled ${family} ${stageId}: normal ${normalClears.length}/10 median=${normalMedian?.toFixed(1) ?? '—'}s; perfectDodge ${skilledClears.length}/10 median=${skilledMedian?.toFixed(1) ?? '—'}s; rate=${perfectCount}/${dodgeCount} (${(dodgeCount ? perfectCount / dodgeCount * 100 : 0).toFixed(1)}%)`);
      console.log(`M5a skilled ${family} ${stageId} seeds: ${skilled.map((run) => `${run.outcome}@${run.seconds.toFixed(1)}s perfect=${run.perfectDodgeCount}/${run.dodgeCount}`).join(', ')}`);
      if (normalMedian !== null && skilledMedian !== null) {
        assert.ok(skilledMedian >= normalMedian * 0.7, `${family} ${stageId} skilled bot became too fast`);
      }
    }
  }
});

test('M5c ten-seed nightmare and hell balance gates', { timeout: 300000 }, () => {
  const gear = (level, family) => {
    const weapon = ITEM_BASES.find((base) => base.requiredLevel === level && base.slot === 'weapon' && base.family === family);
    const armor = ITEM_BASES.filter((base) => base.requiredLevel === level && base.slot !== 'weapon' && !base.setId)
      .sort((a, b) => ['head', 'body', 'hands', 'feet'].indexOf(a.slot) - ['head', 'body', 'hands', 'feet'].indexOf(b.slot));
    return [weapon, ...armor].map((base) => ({
      itemId: base.id,
      rarity: 'rare',
      affixes: base.slot === 'weapon'
        ? [{ id: 'attackPercent', value: 8 }, { id: 'critChance', value: 3 }]
        : [{ id: 'maxHp', value: 40 }, { id: 'defense', value: 6 }],
    }));
  };
  const result = [];
  for (const [difficulty, level, gearLevel, c1Minimum, seedBase] of [
    ['nightmare', 15, 15, 9, 1501],
    ['hell', 20, 18, 8, 1701],
  ]) {
    for (const family of ['sword', 'crossbow', 'staff']) {
      for (const stageId of ['C1', 'KB']) {
        const runs = Array.from({ length: 10 }, (_, index) => runBot({
          seed: seedBase + (stageId === 'KB' ? 100 : 0) + index,
          stageId,
          difficulty,
          level,
          equipment: gear(gearLevel, family),
          potions: 5,
          maxTicks: 12000,
          aimAtTarget: true,
        }));
        const clears = runs.filter((run) => run.outcome === 'clear');
        const medianSeconds = clears.length ? median(clears.map((run) => run.seconds)) : null;
        console.log(`M5c ${difficulty} ${family} ${stageId}: ${clears.length}/10, median ${medianSeconds?.toFixed(1) ?? '—'}s`);
        console.log(`M5c ${difficulty} ${family} ${stageId} seeds: ${runs.map((run) => `${run.outcome}@${run.seconds.toFixed(1)}s hp${run.hp}/${run.maxHp} room${run.roomIndex}`).join(', ')}`);
        result.push({ difficulty, family, stageId, clears: clears.length, medianSeconds });
      }
    }
  }
  for (const row of result.filter((entry) => entry.stageId === 'C1')) {
    assert.ok(row.clears >= (row.difficulty === 'nightmare' ? 9 : 8), `${row.difficulty} ${row.family} C1: ${row.clears}/10`);
  }
  for (const row of result.filter((entry) => entry.stageId === 'KB')) {
    const minimum = row.difficulty === 'nightmare' ? 5 : 4;
    assert.ok(row.clears >= minimum, `${row.difficulty} ${row.family} KB: ${row.clears}/10`);
  }

  const setIds = { sword: 'guardian-oath', crossbow: 'shadow-hunter', staff: 'ember-sage' };
  for (const family of ['sword', 'crossbow', 'staff']) {
    const compare = (withSet) => {
      const baseGear = gear(15, family);
      const setPieces = ITEM_BASES.filter((base) => base.setId === setIds[family]).slice(0, 4).map((base) => ({
        itemId: base.id,
        setId: base.setId,
        rarity: 'set',
        affixes: base.slot === 'weapon'
          ? [{ id: 'attackPercent', value: 8 }, { id: 'critChance', value: 3 }]
          : [{ id: 'maxHp', value: 40 }, { id: 'defense', value: 6 }],
      }));
      const equipment = withSet
        ? [...setPieces, baseGear.find((item) => ITEM_BASES.find((base) => base.id === item.itemId)?.slot === 'feet')]
        : baseGear;
      return Array.from({ length: 10 }, (_, index) => runBot({
        seed: 1901 + index,
        stageId: 'KB',
        difficulty: 'nightmare',
        level: 15,
        equipment,
        potions: 5,
        maxTicks: 12000,
        aimAtTarget: true,
        perfectDodge: true,
      })).filter((run) => run.outcome === 'clear');
    };
    const noSet = compare(false);
    const withSet = compare(true);
    assert.ok(noSet.length > 0 && withSet.length > 0, `${family} N:KB set comparison needs clear-time samples`);
    const noSetMedian = noSet.length ? median(noSet.map((run) => run.seconds)) : null;
    const setMedian = withSet.length ? median(withSet.map((run) => run.seconds)) : null;
    console.log(`M5c skilled N:KB ${family} set: ${withSet.length}/10 median ${setMedian?.toFixed(1) ?? '—'}s vs no set ${noSet.length}/10 median ${noSetMedian?.toFixed(1) ?? '—'}s`);
    if (noSetMedian !== null && setMedian !== null) assert.ok(setMedian >= noSetMedian * 0.7, `${family} four-piece set made the skilled bot too fast`);
  }
});

test('M5d settlement caps contain legit C1, KB, and nightmare KB bot rewards', { timeout: 180000 }, () => {
  const gear = (level, family) => {
    const weapon = ITEM_BASES.find((base) => base.requiredLevel === level && base.slot === 'weapon' && base.family === family);
    const armor = ITEM_BASES.filter((base) => base.requiredLevel === level && base.slot !== 'weapon' && !base.setId)
      .sort((a, b) => ['head', 'body', 'hands', 'feet'].indexOf(a.slot) - ['head', 'body', 'hands', 'feet'].indexOf(b.slot));
    return [weapon, ...armor].map((base) => ({
      itemId: base.id,
      rarity: 'rare',
      affixes: base.slot === 'weapon'
        ? [{ id: 'attackPercent', value: 8 }, { id: 'critChance', value: 3 }]
        : [{ id: 'maxHp', value: 40 }, { id: 'defense', value: 6 }],
    }));
  };
  const scenarios = [
    { stageId: 'C1', difficulty: 'normal', level: 1, gearLevel: null, seed: 101 },
    { stageId: 'KB', difficulty: 'normal', level: 14, gearLevel: 11, seed: 1001 },
    { stageId: 'KB', difficulty: 'nightmare', level: 15, gearLevel: 15, seed: 1601 },
  ];
  const summaries = [];
  for (const scenario of scenarios) {
    const equipment = scenario.gearLevel ? gear(scenario.gearLevel, 'sword') : [];
    const run = runBot({
      seed: scenario.seed,
      stageId: scenario.stageId,
      difficulty: scenario.difficulty,
      level: scenario.level,
      equipment,
      potions: scenario.gearLevel ? 5 : 3,
      maxTicks: 12000,
      aimAtTarget: true,
    });
    assert.equal(run.outcome, 'clear', `${scenario.difficulty}:${scenario.stageId} bot must clear`);
    const caps = settlementCaps(scenario.stageId, scenario.difficulty);
    assert.ok(run.reward.xp <= caps.xp, `${scenario.difficulty}:${scenario.stageId} XP ${run.reward.xp}/${caps.xp}`);
    assert.ok(run.reward.gold <= caps.gold, `${scenario.difficulty}:${scenario.stageId} gold ${run.reward.gold}/${caps.gold}`);
    assert.ok(run.reward.items.length <= caps.items, `${scenario.difficulty}:${scenario.stageId} items ${run.reward.items.length}/${caps.items}`);
    summaries.push({
      key: scenario.difficulty === 'normal' ? scenario.stageId : `N:${scenario.stageId}`,
      xp: run.reward.xp, xpCap: caps.xp, gold: run.reward.gold, goldCap: caps.gold,
      items: run.reward.items.length, itemCap: caps.items,
    });
  }
  console.log(`M5d legitimate settlement rewards: ${JSON.stringify(summaries)}`);
});
