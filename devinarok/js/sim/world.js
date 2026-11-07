import { ARENA } from './arena.js';
import { AFFIXES } from '../content/affixes.js';
import { ENEMIES } from '../content/enemies.js';
import { ITEM_BASES, ITEMS, LEGENDARIES, RARITIES, BOSS_RARITIES, ELITE_RARITIES } from '../content/items.js';
import { POTION, SKILLS } from '../content/skills.js';
import { STAGES } from '../content/stages.js';
import { HUB_ARENA } from '../content/stages.js';

export const TICK_HZ = 30;
export const BUTTONS = {
  ATTACK: 1,
  DODGE: 2,
  SKILL1: 4,
  SKILL2: 8,
  SKILL3: 16,
  INTERACT: 32,
  POTION: 64,
};

export const COMBO_TIMELINES = [
  { windupTicks: 6, activeTicks: 4, recoveryTicks: 9, chainWindowTicks: 5, range: 1.65, halfAngle: 0.78, damage: 1, knockback: 0.3 },
  { windupTicks: 6, activeTicks: 4, recoveryTicks: 10, chainWindowTicks: 5, range: 1.8, halfAngle: 0.9, damage: 1, knockback: 0.38 },
  { windupTicks: 8, activeTicks: 5, recoveryTicks: 12, chainWindowTicks: 6, range: 2.05, halfAngle: 1.12, damage: 2, knockback: 0.62 },
];

const MAX_EVENTS = 128;
const PLAYER_SPEED = 4.5;
const PLAYER_RADIUS = 0.32;
const PLAYER_MAX_HP = 100;
const DODGE_DURATION_TICKS = 9;
const DODGE_IFRAME_TICKS = 8;
const DODGE_COOLDOWN_TICKS = 36;
const PLAYER_RESPAWN_TICKS = 90;

const ENEMY_RULES = {
  Skeleton_Minion: {
    maxHp: 3,
    radius: 0.38,
    speed: 1.65,
    attackRange: 1.42,
    attackWindupTicks: 15,
    attackDurationTicks: 3,
    attackCooldownTicks: 30,
    attackHalfAngle: 0.68,
    damage: 12,
  },
  Skeleton_Warrior: {
    maxHp: 6,
    radius: 0.48,
    speed: 1.05,
    attackRange: 1.9,
    attackWindupTicks: 21,
    attackDurationTicks: 4,
    attackCooldownTicks: 40,
    attackHalfAngle: 0.82,
    damage: 18,
  },
};

function copyArena(arena) {
  const spawnPoints = arena.spawnPoints ?? [];
  return {
    id: arena.id,
    name: arena.name ?? arena.id ?? '시험의 방',
    stageLevel: arena.stageLevel ?? 1,
    recommendedLevel: arena.recommendedLevel ?? 1,
    boss: Boolean(arena.boss),
    width: arena.width,
    depth: arena.depth,
    bounds: { ...arena.bounds },
    playerSpawn: { ...arena.playerSpawn },
    spawnPoints: Array.isArray(spawnPoints[0])
      ? spawnPoints.map((room) => room.map((point) => ({ ...point })))
      : spawnPoints.map((point) => ({ ...point })),
    obstacles: arena.obstacles.map((obstacle) => ({ ...obstacle })),
    props: (arena.props ?? []).map((prop) => ({ ...prop })),
    doors: (arena.doors ?? []).map((door) => ({ ...door })),
    rooms: (arena.rooms ?? []).map((room) => ({ ...room, waves: room.waves.map((wave) => ({ ...wave })) })),
  };
}

function random(world) {
  world.rngState = (world.rngState + 0x6d2b79f5) >>> 0;
  let value = world.rngState;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

function emit(world, type, data = {}) {
  const event = {
    eventId: world.nextEventId,
    tick: world.tick,
    type,
    ...data,
  };
  world.nextEventId += 1;
  world.events.push(event);
  if (world.events.length > MAX_EVENTS) world.events.splice(0, world.events.length - MAX_EVENTS);
  return event;
}

function nextEntityId(world) {
  const id = world.nextEntityId;
  world.nextEntityId += 1;
  return id;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clampInput(value, min, max, fallback = 0) {
  return Number.isFinite(value) ? clamp(Math.trunc(value), min, max) : fallback;
}

function normalizeInput(player, rawInput) {
  const previous = player.lastInput;
  if (!rawInput) {
    return {
      seq: previous.seq,
      moveX: previous.moveX,
      moveZ: previous.moveZ,
      aim: previous.aim,
      buttons: 0,
    };
  }
  return {
    seq: clampInput(rawInput.seq, 0, 2147483647, previous.seq + 1),
    moveX: clampInput(rawInput.moveX, -127, 127, previous.moveX),
    moveZ: clampInput(rawInput.moveZ, -127, 127, previous.moveZ),
    aim: clampInput(rawInput.aim, 0, 255, previous.aim),
    buttons: clampInput(rawInput.buttons, 0, 127, 0),
  };
}

function angleFromAim(aim) {
  return (aim / 256) * Math.PI * 2;
}

function clampToArena(world, entity) {
  const bounds = world.arena.bounds;
  entity.x = clamp(entity.x, bounds.minX + entity.radius, bounds.maxX - entity.radius);
  entity.z = clamp(entity.z, bounds.minZ + entity.radius, bounds.maxZ - entity.radius);
}

function resolveObstacle(entity, obstacle) {
  if (obstacle.type === 'circle') {
    const dx = entity.x - obstacle.x;
    const dz = entity.z - obstacle.z;
    const minimum = entity.radius + obstacle.radius;
    const distanceSquared = dx * dx + dz * dz;
    if (distanceSquared >= minimum * minimum) return;
    const distance = Math.sqrt(distanceSquared) || 0.0001;
    const overlap = minimum - distance;
    entity.x += (dx / distance) * overlap;
    entity.z += (dz / distance) * overlap;
    return;
  }

  if (obstacle.type !== 'rect') return;
  const halfWidth = obstacle.width / 2;
  const halfDepth = obstacle.depth / 2;
  const closestX = clamp(entity.x, obstacle.x - halfWidth, obstacle.x + halfWidth);
  const closestZ = clamp(entity.z, obstacle.z - halfDepth, obstacle.z + halfDepth);
  let dx = entity.x - closestX;
  let dz = entity.z - closestZ;
  const distanceSquared = dx * dx + dz * dz;
  if (distanceSquared >= entity.radius * entity.radius) return;
  if (distanceSquared > 0) {
    const distance = Math.sqrt(distanceSquared);
    const overlap = entity.radius - distance;
    entity.x += (dx / distance) * overlap;
    entity.z += (dz / distance) * overlap;
    return;
  }

  const penetrationX = halfWidth + entity.radius - Math.abs(entity.x - obstacle.x);
  const penetrationZ = halfDepth + entity.radius - Math.abs(entity.z - obstacle.z);
  if (penetrationX < penetrationZ) {
    dx = entity.x < obstacle.x ? -1 : 1;
    entity.x += dx * penetrationX;
  } else {
    dz = entity.z < obstacle.z ? -1 : 1;
    entity.z += dz * penetrationZ;
  }
}

function moveEntity(world, entity, dx, dz) {
  entity.x += dx;
  entity.z += dz;
  for (let pass = 0; pass < 2; pass += 1) {
    clampToArena(world, entity);
    for (const obstacle of world.arena.obstacles) {
      if (obstacle.doorId && world.openDoors?.[obstacle.doorId]) continue;
      resolveObstacle(entity, obstacle);
    }
  }
  clampToArena(world, entity);
}

function angleDifference(a, b) {
  let difference = (a - b) % (Math.PI * 2);
  if (difference > Math.PI) difference -= Math.PI * 2;
  if (difference < -Math.PI) difference += Math.PI * 2;
  return difference;
}

function inSector(shape, target, targetRadius = 0) {
  const dx = target.x - shape.originX;
  const dz = target.z - shape.originZ;
  const distance = Math.hypot(dx, dz);
  if (distance > shape.range + targetRadius || distance < 0.0001) return false;
  const targetAngle = Math.atan2(dz, dx);
  return Math.abs(angleDifference(targetAngle, shape.angle)) <= shape.halfAngle;
}

function createAttackShape(entity, angle, range, halfAngle) {
  return {
    type: 'sector',
    originX: entity.x,
    originZ: entity.z,
    angle,
    range,
    halfAngle,
  };
}

function copyShape(shape) {
  return {
    type: shape.type,
    originX: shape.originX,
    originZ: shape.originZ,
    angle: shape.angle,
    range: shape.range,
    halfAngle: shape.halfAngle,
  };
}

function activeEnemies(world) {
  return world.entities.filter((entity) => entity.kind === 'enemy' && !entity.dead);
}

function activePlayers(world) {
  return world.entities.filter((entity) => entity.kind === 'player' && !entity.dead);
}

function chooseSpawnPoint(world) {
  const points = world.arena.spawnPoints;
  return points[Math.floor(random(world) * points.length)];
}

export function spawnEnemy(world, enemyKind = 'Skeleton_Minion', position = null) {
  const kind = Object.hasOwn(ENEMY_RULES, enemyKind) ? enemyKind : 'Skeleton_Minion';
  const rules = ENEMY_RULES[kind];
  const point = position ?? chooseSpawnPoint(world);
  const enemy = {
    id: nextEntityId(world),
    kind: 'enemy',
    enemyKind: kind,
    x: point.x,
    z: point.z,
    facing: Math.PI / 2,
    radius: rules.radius,
    hp: rules.maxHp,
    maxHp: rules.maxHp,
    dead: false,
    deathTicks: 0,
    spawnTicksLeft: 30,
    invulnerable: true,
    hitFlashTicks: 0,
    attackShape: null,
    attackPhase: null,
    attackRemaining: 0,
    attackWindupTicks: rules.attackWindupTicks,
    attackCooldownTicks: 0,
    attackHit: false,
    attackTargetId: null,
    moveSpeed: rules.speed,
    attackRange: rules.attackRange,
  };
  moveEntity(world, enemy, 0, 0);
  world.entities.push(enemy);
  world.wave.spawned += 1;
  emit(world, 'spawn', {
    entityId: enemy.id,
    enemyKind: enemy.enemyKind,
    x: enemy.x,
    z: enemy.z,
  });
  return enemy;
}

function desiredEnemyCount(world) {
  return Math.min(6, 3 + Math.floor(world.wave.spawned / 12));
}

function ensureWave(world) {
  if (!world.players.length) return;
  const living = activeEnemies(world).length;
  if (!world.wave.initialized) {
    world.wave.initialized = true;
    world.wave.nextSpawnTick = world.tick + 30;
    while (activeEnemies(world).length < 3) {
      const nextKind = world.wave.spawned > 0 && world.wave.spawned % 5 === 4
        ? 'Skeleton_Warrior'
        : 'Skeleton_Minion';
      spawnEnemy(world, nextKind);
    }
    return;
  }
  const target = desiredEnemyCount(world);
  if (living >= target || world.tick < world.wave.nextSpawnTick) return;
  while (activeEnemies(world).length < target) {
    const nextKind = world.wave.spawned > 0 && world.wave.spawned % 5 === 4
      ? 'Skeleton_Warrior'
      : 'Skeleton_Minion';
    spawnEnemy(world, nextKind);
  }
  world.wave.nextSpawnTick = world.tick + 30;
}

export function createWorld({ seed = 1, arena = ARENA } = {}) {
  return {
    version: 1,
    mode: 'sandbox',
    tick: 0,
    seed: Number.isFinite(seed) ? Math.trunc(seed) >>> 0 : 1,
    rngState: Number.isFinite(seed) ? Math.trunc(seed) >>> 0 : 1,
    arena: copyArena(arena),
    entities: [],
    players: [],
    events: [],
    nextEntityId: 1,
    nextEventId: 1,
    wave: { initialized: false, nextSpawnTick: 0, spawned: 0 },
  };
}

export function addPlayer(world, { playerId, characterKind = 'knight' } = {}) {
  const id = String(playerId ?? '').trim();
  if (!id) throw new TypeError('playerId is required');
  if (world.players.some((entityId) => world.entities.find((entity) => entity.id === entityId)?.playerId === id)) {
    throw new Error(`Player already exists: ${id}`);
  }

  const spawn = world.arena.playerSpawn;
  const level = world.mode === 'stage' ? world.characterLevel : 1;
  const stats = world.mode === 'stage' ? calculatePlayerStats(level, world.equipment ?? []) : null;
  const player = {
    id: nextEntityId(world),
    kind: 'player',
    playerId: id,
    characterKind,
    x: spawn.x,
    z: spawn.z,
    facing: -Math.PI / 2,
    radius: PLAYER_RADIUS,
    hp: stats?.maxHp ?? PLAYER_MAX_HP,
    maxHp: stats?.maxHp ?? PLAYER_MAX_HP,
    level,
    stats,
    dead: false,
    respawnTick: 0,
    previousButtons: 0,
    lastInput: { seq: 0, moveX: 0, moveZ: 0, aim: 192, buttons: 0 },
    attack: null,
    dodgeTicks: 0,
    dodgeVectorX: 0,
    dodgeVectorZ: 0,
    iFrames: 0,
    dodgeCooldownTicks: 0,
    hitFlashTicks: 0,
    moving: false,
    skillCooldowns: { 1: 0, 2: 0, 3: 0 },
    skillCast: null,
    guardTicks: 0,
    potions: world.mode === 'stage' ? world.potions : 0,
    potionTicks: 0,
    potionCooldownTicks: 0,
    potionHealRemaining: 0,
    potionHealTicks: 0,
    attackSeq: 0,
  };
  moveEntity(world, player, 0, 0);
  world.entities.push(player);
  world.players.push(player.id);
  if (world.mode !== 'stage' && world.mode !== 'hub') ensureWave(world);
  return player;
}

function beginPlayerAttack(world, player, step, seq) {
  const castId = `${player.playerId}:${seq}`;
  player.attack = {
    step,
    seq,
    castId,
    phase: 'windup',
    phaseTick: 0,
    queued: false,
    queuedSeq: null,
    hitTargets: [],
    shape: null,
  };
  emit(world, 'cast', {
    entityId: player.id,
    playerId: player.playerId,
    castId,
    step,
  });
}

function queueCombo(player, seq) {
  const attack = player.attack;
  if (!attack || attack.step >= COMBO_TIMELINES.length || attack.queued) return;
  const timeline = COMBO_TIMELINES[attack.step - 1];
  if (
    attack.phase === 'recovery' &&
    attack.phaseTick >= timeline.recoveryTicks - timeline.chainWindowTicks
  ) {
    attack.queued = true;
    attack.queuedSeq = seq;
  }
}

function damageEnemy(world, player, enemy, shape, timeline, castId) {
  enemy.hp = Math.max(0, enemy.hp - timeline.damage);
  enemy.hitFlashTicks = 7;
  const dx = enemy.x - player.x;
  const dz = enemy.z - player.z;
  const distance = Math.hypot(dx, dz) || 1;
  moveEntity(world, enemy, (dx / distance) * timeline.knockback, (dz / distance) * timeline.knockback);
  emit(world, 'hit', {
    sourceId: player.id,
    targetId: enemy.id,
    damage: timeline.damage,
    castId,
    shape: copyShape(shape),
  });
  if (enemy.hp === 0) {
    enemy.dead = true;
    enemy.deathTicks = 24;
    enemy.attackShape = null;
    enemy.attackPhase = null;
    world.wave.nextSpawnTick = Math.max(world.wave.nextSpawnTick, world.tick + 45);
    emit(world, 'death', { entityId: enemy.id, killerId: player.id, castId });
  }
}

function advancePlayerAttack(world, player) {
  const attack = player.attack;
  if (!attack) return;
  const timeline = COMBO_TIMELINES[attack.step - 1];
  if (attack.phase === 'active' && world.mode !== 'stage') {
    const shape = createAttackShape(player, player.facing, timeline.range, timeline.halfAngle);
    attack.shape = shape;
    for (const enemy of activeEnemies(world)) {
      if (attack.hitTargets.includes(enemy.id) || enemy.invulnerable || enemy.spawnTicksLeft > 0) continue;
      if (!inSector(shape, enemy, enemy.radius)) continue;
      attack.hitTargets.push(enemy.id);
      damageEnemy(world, player, enemy, shape, timeline, attack.castId);
    }
  }

  attack.phaseTick += 1;
  const phaseLength = attack.phase === 'windup'
    ? timeline.windupTicks
    : attack.phase === 'active'
      ? timeline.activeTicks
      : timeline.recoveryTicks;
  if (attack.phaseTick < phaseLength) return;

  if (attack.phase === 'windup') {
    attack.phase = 'active';
    attack.phaseTick = 0;
    return;
  }
  if (attack.phase === 'active') {
    attack.phase = 'recovery';
    attack.phaseTick = 0;
    attack.shape = null;
    return;
  }
  if (attack.queued && attack.step < COMBO_TIMELINES.length) {
    beginPlayerAttack(world, player, attack.step + 1, attack.queuedSeq);
  } else {
    player.attack = null;
  }
}

function stepPlayer(world, player, rawInput) {
  if (player.dead) {
    if (world.tick >= player.respawnTick) {
      const spawn = world.arena.playerSpawn;
      player.x = spawn.x;
      player.z = spawn.z;
      player.hp = player.maxHp;
      player.dead = false;
      player.attack = null;
      player.dodgeTicks = 0;
      player.iFrames = 0;
      player.hitFlashTicks = 0;
    }
    player.previousButtons = 0;
    player.lastInput = normalizeInput(player, rawInput);
    return;
  }

  const input = normalizeInput(player, rawInput);
  const pressed = input.buttons & ~player.previousButtons;
  player.previousButtons = input.buttons;
  player.lastInput = input;

  const moveX = input.moveX / 127;
  const moveZ = input.moveZ / 127;
  const magnitude = Math.hypot(moveX, moveZ);
  const directionX = magnitude > 1 ? moveX / magnitude : moveX;
  const directionZ = magnitude > 1 ? moveZ / magnitude : moveZ;
  player.moving = Math.abs(directionX) + Math.abs(directionZ) > 0.01;
  if (player.moving) player.facing = Math.atan2(directionZ, directionX);
  else player.facing = angleFromAim(input.aim);

  if ((pressed & BUTTONS.DODGE) && player.dodgeCooldownTicks === 0) {
    const facingX = Math.cos(player.facing);
    const facingZ = Math.sin(player.facing);
    player.dodgeVectorX = player.moving ? directionX : facingX;
    player.dodgeVectorZ = player.moving ? directionZ : facingZ;
    player.dodgeTicks = DODGE_DURATION_TICKS;
    player.iFrames = DODGE_IFRAME_TICKS;
    player.dodgeCooldownTicks = DODGE_COOLDOWN_TICKS;
    emit(world, 'dodge', { entityId: player.id, playerId: player.playerId });
  }

  if (player.dodgeTicks > 0) {
    const dashSpeed = 8.5 / TICK_HZ;
    moveEntity(world, player, player.dodgeVectorX * dashSpeed, player.dodgeVectorZ * dashSpeed);
  } else {
    moveEntity(world, player, directionX * PLAYER_SPEED / TICK_HZ, directionZ * PLAYER_SPEED / TICK_HZ);
  }

  if (pressed & BUTTONS.ATTACK) {
    if (!player.attack) beginPlayerAttack(world, player, 1, input.seq);
    else queueCombo(player, input.seq);
  }
  advancePlayerAttack(world, player);
}

function nearestPlayer(enemy, players) {
  let nearest = null;
  let nearestDistance = Infinity;
  for (const player of players) {
    const dx = player.x - enemy.x;
    const dz = player.z - enemy.z;
    const distance = dx * dx + dz * dz;
    if (distance < nearestDistance || (distance === nearestDistance && player.id < nearest?.id)) {
      nearest = player;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function damagePlayer(world, enemy, player, shape, damage) {
  const blocked = player.dead || player.iFrames > 0;
  if (!blocked) {
    player.hp = Math.max(0, player.hp - damage);
    player.hitFlashTicks = 8;
    if (player.hp === 0) {
      player.dead = true;
      player.respawnTick = world.tick + PLAYER_RESPAWN_TICKS;
      player.attack = null;
      player.dodgeTicks = 0;
      emit(world, 'death', { entityId: player.id, playerId: player.playerId, respawnTick: player.respawnTick });
    }
  }
  emit(world, 'hit', {
    sourceId: enemy.id,
    targetId: player.id,
    damage: blocked ? 0 : damage,
    blocked,
    shape: copyShape(shape),
  });
}

function clearEnemyAttack(enemy, rules) {
  enemy.attackShape = null;
  enemy.attackPhase = null;
  enemy.attackRemaining = 0;
  enemy.attackTargetId = null;
  enemy.attackCooldownTicks = rules.attackCooldownTicks;
}

function stepEnemy(world, enemy, players) {
  if (enemy.spawnTicksLeft > 0) {
    enemy.spawnTicksLeft -= 1;
    enemy.invulnerable = enemy.spawnTicksLeft > 0;
    return;
  }

  const rules = ENEMY_RULES[enemy.enemyKind];
  if (enemy.attackCooldownTicks > 0) enemy.attackCooldownTicks -= 1;
  const target = nearestPlayer(enemy, players);
  if (!target) return;

  if (enemy.attackPhase === 'windup') {
    if (enemy.attackRemaining > 1) {
      enemy.attackRemaining -= 1;
      return;
    }
    enemy.attackPhase = 'active';
    enemy.attackRemaining = rules.attackDurationTicks;
    enemy.attackHit = false;
    return;
  }
  if (enemy.attackPhase === 'active') {
    if (!enemy.attackHit) {
      enemy.attackHit = true;
      if (inSector(enemy.attackShape, target, target.radius)) {
        damagePlayer(world, enemy, target, enemy.attackShape, rules.damage);
      }
    }
    enemy.attackRemaining -= 1;
    if (enemy.attackRemaining <= 0) clearEnemyAttack(enemy, rules);
    return;
  }

  const dx = target.x - enemy.x;
  const dz = target.z - enemy.z;
  const distance = Math.hypot(dx, dz);
  if (distance < 0.0001) return;
  enemy.facing = Math.atan2(dz, dx);
  if (distance <= rules.attackRange) {
    if (enemy.attackCooldownTicks > 0) return;
    enemy.attackShape = createAttackShape(enemy, enemy.facing, rules.attackRange, rules.attackHalfAngle);
    enemy.attackPhase = 'windup';
    enemy.attackRemaining = rules.attackWindupTicks;
    enemy.attackWindupTicks = rules.attackWindupTicks;
    enemy.attackHit = false;
    enemy.attackTargetId = target.id;
    return;
  }
  if (enemy.attackCooldownTicks === 0) {
    moveEntity(world, enemy, (dx / distance) * rules.speed / TICK_HZ, (dz / distance) * rules.speed / TICK_HZ);
  }
}

function separateEnemies(world) {
  const enemies = activeEnemies(world);
  for (let left = 0; left < enemies.length; left += 1) {
    for (let right = left + 1; right < enemies.length; right += 1) {
      const a = enemies[left];
      const b = enemies[right];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const distance = Math.hypot(dx, dz);
      const minimum = a.radius + b.radius;
      if (distance >= minimum) continue;
      const directionX = distance > 0 ? dx / distance : 1;
      const directionZ = distance > 0 ? dz / distance : 0;
      const push = (minimum - distance) * 0.25;
      moveEntity(world, a, -directionX * push, -directionZ * push);
      moveEntity(world, b, directionX * push, directionZ * push);
    }
  }
}

function cleanupEntities(world) {
  world.entities = world.entities.filter((entity) => entity.kind !== 'enemy' || !entity.dead || entity.deathTicks > 0);
}

export function xpToNextLevel(level) {
  return Math.round(60 * Math.pow(level, 1.6));
}

export function calculateDamage(atk, motionMult, crit, critDmg, defense) {
  return Math.max(1, Math.round(atk * motionMult * (crit ? critDmg : 1) * 100 / (100 + defense)));
}

export function calculatePlayerStats(level = 1, equipment = []) {
  let maxHp = 100 + 12 * (level - 1);
  let attack = 10 + 2 * (level - 1);
  let defense = 0;
  let critChance = 5;
  let critDamage = 150;
  let attackSpeed = 0;
  let moveSpeed = PLAYER_SPEED;
  let dodgeCooldownReduction = 0;
  let skillCooldownReduction = 0;
  let lifesteal = 0;
  let goldGain = 0;
  let xpGain = 0;
  let spinCooldownSeconds = 0;
  for (const item of equipment) {
    const base = ITEMS[item.itemId];
    if (base) {
      const bonus = item.enhance ? item.enhance * Math.max(1, Math.round(base.value * 0.08)) : 0;
      const value = base.value + bonus;
      if (base.stat === 'maxHp') maxHp += value;
      if (base.stat === 'attack') attack += value;
      if (base.stat === 'defense') defense += value;
    }
    for (const affix of item.affixes ?? []) {
      const key = affix.id;
      const value = Number(affix.value) || 0;
      if (key === 'attackPercent') attack += Math.round(attack * value / 100);
      if (key === 'maxHp') maxHp += value;
      if (key === 'defense') defense += value;
      if (key === 'critChance') critChance += value;
      if (key === 'critDamage') critDamage += value;
      if (key === 'attackSpeed') attackSpeed += value;
      if (key === 'moveSpeed') moveSpeed *= 1 + value / 100;
      if (key === 'dodgeCooldownReduction') dodgeCooldownReduction += value;
      if (key === 'skillCooldownReduction') skillCooldownReduction += value;
      if (key === 'lifesteal') lifesteal += value;
      if (key === 'goldGain') goldGain += value;
      if (key === 'xpGain') xpGain += value;
      if (key === 'spinCooldownSeconds') spinCooldownSeconds += value;
    }
  }
  return {
    maxHp: Math.max(1, maxHp),
    attack: Math.max(1, attack),
    defense: Math.max(0, defense),
    critChance: Math.max(0, Math.min(75, critChance)),
    critDamage: Math.max(100, critDamage) / 100,
    attackSpeed,
    moveSpeed,
    dodgeCooldownReduction,
    skillCooldownReduction,
    lifesteal,
    goldGain,
    xpGain,
    spinCooldownSeconds,
  };
}

export function rarityForRoll(value, { elite = false, boss = false } = {}) {
  const table = boss ? BOSS_RARITIES : elite ? ELITE_RARITIES : Object.entries(RARITIES).map(([rarity, entry]) => ({ rarity, weight: entry.weight }));
  let cursor = value * table.reduce((sum, row) => sum + row.weight, 0);
  for (const entry of table) {
    cursor -= entry.weight;
    if (cursor < 0) return entry.rarity;
  }
  return table.at(-1).rarity;
}

function rollAffix(world, ilvl) {
  const ids = Object.keys(AFFIXES);
  const id = ids[Math.floor(random(world) * ids.length)];
  const range = AFFIXES[id];
  const value = Math.round(range.min + random(world) * (range.max - range.min) + range.perIlvl * ilvl);
  return { id, value };
}

export function rollStageItem(world, { stageLevel = 1, elite = false, boss = false } = {}) {
  const rarity = rarityForRoll(random(world), { elite, boss });
  const ilvl = stageLevel + (boss ? 2 : 0);
  const bases = ITEM_BASES.filter((item) => item.requiredLevel <= stageLevel);
  const base = bases[Math.floor(random(world) * bases.length)];
  const affixCount = RARITIES[rarity].affixes;
  const affixes = [];
  while (affixes.length < affixCount) {
    const affix = rollAffix(world, ilvl);
    if (!affixes.some((item) => item.id === affix.id)) affixes.push(affix);
  }
  const legendary = rarity === 'legendary'
    ? LEGENDARIES[Math.floor(random(world) * LEGENDARIES.length)]
    : null;
  if (legendary) affixes.push({ id: legendary.stat, value: legendary.value, unique: legendary.id });
  return {
    itemId: base.id,
    rarity,
    ilvl,
    enhance: 0,
    affixes,
    legendaryId: legendary?.id ?? null,
  };
}

export function createStageWorld({ seed = 1, stageId = 'C1', playerId = 'hero', character = {} } = {}) {
  const stage = STAGES[stageId];
  if (!stage) throw new TypeError(`Unknown stage: ${stageId}`);
  const world = createWorld({ seed, arena: stage });
  world.mode = 'stage';
  world.stageId = stageId;
  world.stageLevel = stage.stageLevel;
  world.characterLevel = Math.max(1, Math.min(15, character.level ?? 1));
  world.equipment = (character.equipment ?? []).map((item) => ({ ...item, affixes: [...(item.affixes ?? [])] }));
  world.potions = Math.max(0, Math.min(POTION.maxCarry, character.potions ?? 0));
  world.roomIndex = 0;
  world.roomEnemyIds = [];
  world.roomCleared = false;
  world.openDoors = {};
  world.outcome = null;
  world.result = null;
  world.reward = { xp: 0, gold: 0, items: [] };
  world.bossThresholds = {};
  addPlayer(world, { playerId, characterKind: 'knight' });
  spawnRoom(world);
  return world;
}

export function createHubWorld({ seed = 1, playerId = 'hero' } = {}) {
  const world = createWorld({ seed, arena: HUB_ARENA });
  world.mode = 'hub';
  addPlayer(world, { playerId, characterKind: 'knight' });
  return world;
}

function stagePoint(world, index) {
  const points = world.arena.spawnPoints[world.roomIndex] ?? [];
  return points[index % Math.max(1, points.length)] ?? world.arena.playerSpawn;
}

function spawnStageEnemy(world, enemyType, index, elite = false) {
  const rule = ENEMIES[enemyType];
  if (!rule) throw new TypeError(`Unknown enemy type: ${enemyType}`);
  const point = stagePoint(world, index);
  const scale = 1 + 0.12 * (world.stageLevel - 1);
  const maxHp = Math.max(1, Math.round(rule.hp * scale * (elite ? 2.5 : 1)));
  const enemy = {
    id: nextEntityId(world),
    kind: 'enemy',
    enemyKind: enemyType,
    model: rule.model,
    x: point.x,
    z: point.z,
    facing: Math.PI / 2,
    radius: rule.radius,
    hp: maxHp,
    maxHp,
    attack: Math.max(1, Math.round(rule.attack * scale * (elite ? 1.3 : 1))),
    speed: rule.speed,
    dead: false,
    deathTicks: 0,
    spawnTicksLeft: 30,
    invulnerable: true,
    hitFlashTicks: 0,
    attackShape: null,
    attackPhase: null,
    attackRemaining: 0,
    attackWindupTicks: rule.windupTicks ?? 0,
    attackCooldownTicks: 0,
    attackHit: false,
    attackTargetId: null,
    attackPattern: null,
    attackPatternIndex: 0,
    stunnedTicks: 0,
    elite,
    boss: enemyType === 'commander',
    recoverTicks: 0,
    lineTravelTicks: 0,
    lineTravelled: 0,
    currentRoomId: world.arena.rooms[world.roomIndex]?.id,
  };
  if (enemy.boss) enemy.modelScale = rule.scale;
  moveEntity(world, enemy, 0, 0);
  world.entities.push(enemy);
  world.roomEnemyIds.push(enemy.id);
  emit(world, 'spawn', { entityId: enemy.id, enemyKind: enemyType, x: enemy.x, z: enemy.z, elite, boss: enemy.boss });
  return enemy;
}

function spawnRoom(world) {
  const room = world.arena.rooms[world.roomIndex];
  if (!room) return;
  world.roomEnemyIds = [];
  world.roomCleared = false;
  const modifiers = ['C2', 'C3'].includes(world.stageId) ? room.waves.length : 0;
  let eliteIndex = -1;
  if (modifiers && random(world) < 0.15) {
    const total = room.waves.reduce((sum, wave) => sum + wave.count, 0);
    eliteIndex = Math.floor(random(world) * total);
  }
  let index = 0;
  for (const wave of room.waves) {
    for (let count = 0; count < wave.count; count += 1) {
      spawnStageEnemy(world, wave.enemy, index, index === eliteIndex);
      index += 1;
    }
  }
}

function stageActiveEnemies(world) {
  const activeIds = new Set(world.roomEnemyIds);
  return world.entities.filter((entity) => entity.kind === 'enemy' && !entity.dead && activeIds.has(entity.id));
}

function attackShapeHit(shape, target, targetRadius = 0) {
  if (!shape) return false;
  if (shape.type === 'sector') return inSector(shape, target, targetRadius);
  if (shape.type === 'circle') return Math.hypot(target.x - shape.originX, target.z - shape.originZ) <= shape.radius + targetRadius;
  if (shape.type === 'circles') return shape.circles.some((circle) => Math.hypot(target.x - circle.x, target.z - circle.z) <= circle.radius + targetRadius);
  if (shape.type === 'line') {
    const dx = target.x - shape.originX;
    const dz = target.z - shape.originZ;
    const forward = dx * Math.cos(shape.angle) + dz * Math.sin(shape.angle);
    const side = Math.abs(-dx * Math.sin(shape.angle) + dz * Math.cos(shape.angle));
    return forward >= -targetRadius && forward <= shape.length + targetRadius && side <= shape.width / 2 + targetRadius;
  }
  return false;
}

function makeLineShape(x, z, angle, length, width) {
  return { type: 'line', originX: x, originZ: z, angle, length, width };
}

function randomGold(world, stageLevel) {
  const rule = { min: 2, max: 5 };
  const amount = (rule.min + Math.floor(random(world) * (rule.max - rule.min + 1))) * stageLevel;
  const player = world.entities.find((entity) => entity.kind === 'player');
  return Math.max(1, Math.round(amount * (1 + (player?.stats.goldGain ?? 0) / 100)));
}

function spawnLoot(world, x, z, loot) {
  const entity = {
    id: nextEntityId(world),
    kind: 'loot',
    x,
    z,
    radius: 0.18,
    ...loot,
  };
  world.entities.push(entity);
  emit(world, 'lootSpawn', { lootId: entity.id, x, z, rarity: entity.item?.rarity ?? null, gold: entity.gold ?? 0 });
  if (entity.item) entity.item.uid = `${world.seed}:${world.nextEventId - 1}`;
  return entity;
}

function dropRewards(world, enemy) {
  const rule = ENEMIES[enemy.enemyKind];
  const player = world.entities.find((entity) => entity.kind === 'player');
  const xp = Math.round(rule.xp * (1 + (player?.stats.xpGain ?? 0) / 100));
  world.reward.xp += xp;
  emit(world, 'xp', { amount: xp, entityId: enemy.id });
  spawnLoot(world, enemy.x, enemy.z, { lootType: 'gold', gold: randomGold(world, world.stageLevel) });

  const guaranteedCount = enemy.boss ? 2 : enemy.elite ? 1 : 0;
  const chance = enemy.elite || enemy.boss ? 1 : rule.dropChance;
  if (guaranteedCount) {
    for (let index = 0; index < guaranteedCount; index += 1) {
      const item = rollStageItem(world, { stageLevel: world.stageLevel, elite: enemy.elite, boss: enemy.boss });
      spawnLoot(world, enemy.x + (index ? 0.3 : -0.3), enemy.z, { lootType: 'item', item });
    }
  } else if (random(world) < chance) {
    const item = rollStageItem(world, { stageLevel: world.stageLevel, elite: enemy.elite });
    spawnLoot(world, enemy.x + (random(world) - 0.5) * 0.5, enemy.z + (random(world) - 0.5) * 0.5, { lootType: 'item', item });
  }
}

function killStageEnemy(world, source, enemy, damage, castId, critical = false) {
  if (enemy.dead) return;
  enemy.hp = Math.max(0, enemy.hp - damage);
  enemy.hitFlashTicks = 9;
  if (source.kind === 'player') {
    const dx = enemy.x - source.x;
    const dz = enemy.z - source.z;
    const distance = Math.hypot(dx, dz) || 1;
    moveEntity(world, enemy, dx / distance * 0.18, dz / distance * 0.18);
  }
  emit(world, 'hit', { sourceId: source.id, targetId: enemy.id, damage, castId, critical, skill: source.skillCast?.id ?? 0 });
  if (enemy.hp > 0) return;
  enemy.dead = true;
  enemy.deathTicks = 24;
  enemy.attackShape = null;
  enemy.attackPhase = null;
  emit(world, 'death', { entityId: enemy.id, killerId: source.id, castId });
  dropRewards(world, enemy);
  if (enemy.boss) emit(world, 'bossDefeated', { entityId: enemy.id });
}

function playerStrike(world, player, shape, motionMult, castId, hitTargets) {
  for (const enemy of stageActiveEnemies(world)) {
    if (hitTargets.includes(enemy.id) || enemy.invulnerable || enemy.spawnTicksLeft > 0) continue;
    if (!attackShapeHit(shape, enemy, enemy.radius)) continue;
    hitTargets.push(enemy.id);
    const critical = random(world) * 100 < player.stats.critChance;
    const damage = calculateDamage(player.stats.attack, motionMult, critical, player.stats.critDamage, enemy.defense ?? 0);
    killStageEnemy(world, player, enemy, damage, castId, critical);
    const heal = Math.floor(damage * player.stats.lifesteal / 100);
    if (heal) player.hp = Math.min(player.maxHp, player.hp + heal);
  }
}

function beginSkill(world, player, id, seq) {
  const skill = Object.values(SKILLS).find((entry) => entry.id === id);
  if (!skill || player.skillCooldowns[id] > 0 || player.skillCast) return false;
  const cooldown = Math.max(1, Math.round(skill.cooldownTicks * (1 - Math.min(60, player.stats.skillCooldownReduction) / 100)));
  player.skillCooldowns[id] = cooldown;
  const castId = `${player.playerId}:${seq}`;
  player.skillCast = { id, castId, startedTick: world.tick, ticks: id === 1 ? skill.windupTicks : id === 2 ? skill.dashTicks : skill.durationTicks, tick: 0, hitTargets: [], originX: player.x, originZ: player.z, angle: player.facing };
  emit(world, 'cast', { entityId: player.id, playerId: player.playerId, castId, skill: id, skillName: skill.name });
  return true;
}

function applyPotion(world, player, seq) {
  if (player.potions <= 0 || player.potionCooldownTicks > 0 || player.potionTicks > 0) return;
  player.potions -= 1;
  player.potionTicks = POTION.durationTicks;
  player.potionHealTicks = POTION.durationTicks;
  player.potionHealRemaining = Math.round(player.maxHp * POTION.healFraction);
  player.potionCooldownTicks = POTION.cooldownTicks;
  emit(world, 'potion', { entityId: player.id, playerId: player.playerId, seq });
}

function advanceStagePlayer(world, player, rawInput) {
  const input = normalizeInput(player, rawInput);
  const pressed = input.buttons & ~player.previousButtons;
  player.previousButtons = input.buttons;
  player.lastInput = input;
  const moveX = input.moveX / 127;
  const moveZ = input.moveZ / 127;
  const magnitude = Math.hypot(moveX, moveZ);
  const directionX = magnitude > 1 ? moveX / magnitude : moveX;
  const directionZ = magnitude > 1 ? moveZ / magnitude : moveZ;
  player.moving = Math.abs(directionX) + Math.abs(directionZ) > 0.01;
  if (player.moving && player.guardTicks <= 0) player.facing = Math.atan2(directionZ, directionX);
  else if (!player.moving) player.facing = angleFromAim(input.aim);

  if (pressed & BUTTONS.POTION) applyPotion(world, player, input.seq);
  if (pressed & BUTTONS.SKILL1) beginSkill(world, player, 1, input.seq);
  else if (pressed & BUTTONS.SKILL2) beginSkill(world, player, 2, input.seq);
  else if (pressed & BUTTONS.SKILL3) beginSkill(world, player, 3, input.seq);

  const moveSpeed = player.stats.moveSpeed / TICK_HZ;
  if (player.guardTicks > 0) {
    player.guardTicks -= 1;
    player.moving = false;
  } else if (player.skillCast?.id === 2) {
    const cast = player.skillCast;
    const stepDistance = SKILLS.dash.dashDistance / SKILLS.dash.dashTicks;
    moveEntity(world, player, Math.cos(cast.angle) * stepDistance, Math.sin(cast.angle) * stepDistance);
    playerStrike(world, player, makeLineShape(cast.originX, cast.originZ, cast.angle, SKILLS.dash.length, SKILLS.dash.width), SKILLS.dash.motionMult, cast.castId, cast.hitTargets);
  } else if (!player.skillCast) {
    if ((pressed & BUTTONS.DODGE) && player.dodgeCooldownTicks === 0) {
      player.dodgeVectorX = player.moving ? directionX : Math.cos(player.facing);
      player.dodgeVectorZ = player.moving ? directionZ : Math.sin(player.facing);
      player.dodgeTicks = DODGE_DURATION_TICKS;
      player.iFrames = DODGE_IFRAME_TICKS;
      player.dodgeCooldownTicks = Math.round(DODGE_COOLDOWN_TICKS * (1 - player.stats.dodgeCooldownReduction / 100));
      emit(world, 'dodge', { entityId: player.id, playerId: player.playerId });
    }
    if (player.dodgeTicks > 0) moveEntity(world, player, player.dodgeVectorX * 8.5 / TICK_HZ, player.dodgeVectorZ * 8.5 / TICK_HZ);
    else moveEntity(world, player, directionX * moveSpeed, directionZ * moveSpeed);
  }

  if (player.skillCast) {
    const cast = player.skillCast;
    cast.tick += 1;
    if (cast.id === 1 && cast.tick >= SKILLS.spin.windupTicks) {
      const spin = { type: 'circle', originX: cast.originX, originZ: cast.originZ, radius: SKILLS.spin.range };
      playerStrike(world, player, spin, SKILLS.spin.motionMult, cast.castId, cast.hitTargets);
    }
    if (cast.id === 3 && cast.tick === 1) player.guardTicks = SKILLS.guard.durationTicks;
    if (cast.tick >= (cast.id === 1 ? SKILLS.spin.windupTicks + SKILLS.spin.activeTicks + SKILLS.spin.recoveryTicks : cast.id === 2 ? SKILLS.dash.dashTicks : SKILLS.guard.durationTicks)) {
      player.skillCast = null;
    }
  }

  if (pressed & BUTTONS.ATTACK) {
    if (!player.attack) beginPlayerAttack(world, player, 1, input.seq);
    else queueCombo(player, input.seq);
  }
  if (player.attack) {
    const before = player.attack;
    const timeline = COMBO_TIMELINES[before.step - 1];
    if (before.phase === 'active') {
      const shape = createAttackShape(player, player.facing, timeline.range, timeline.halfAngle);
      const motion = [1, 1.1, 1.8][before.step - 1] * (1 + player.stats.attackSpeed / 100);
      playerStrike(world, player, { ...shape, type: 'sector' }, motion, before.castId, before.hitTargets);
    }
    advancePlayerAttack(world, player);
  }

  if (player.potionTicks > 0) {
    const heal = Math.ceil(player.potionHealRemaining / player.potionHealTicks);
    const applied = Math.min(heal, player.maxHp - player.hp);
    player.hp += applied;
    player.potionHealRemaining = Math.max(0, player.potionHealRemaining - heal);
    player.potionHealTicks -= 1;
    player.potionTicks -= 1;
  }
}

function damagePlayerM1(world, enemy, player, shape) {
  if (player.dead || player.iFrames > 0) return false;
  const incomingAngle = Math.atan2(shape.originZ - player.z, shape.originX - player.x);
  const facingAngle = angleDifference(incomingAngle, player.facing);
  const guarding = player.guardTicks > 0 && Math.abs(facingAngle) <= SKILLS.guard.halfAngle;
  const perfect = guarding && player.guardTicks >= SKILLS.guard.durationTicks - SKILLS.guard.perfectTicks + 1;
  let damage = calculateDamage(enemy.attack, 1, false, 1, player.stats.defense);
  if (guarding) {
    damage = Math.max(1, Math.round(damage * SKILLS.guard.damageMultiplier));
    if (perfect) {
      enemy.stunnedTicks = SKILLS.guard.stunTicks;
      enemy.attackPhase = null;
      enemy.attackShape = null;
      enemy.attackCooldownTicks = SKILLS.guard.stunTicks;
      emit(world, 'perfectBlock', { entityId: player.id, attackerId: enemy.id });
    }
  }
  player.hp = Math.max(0, player.hp - damage);
  player.hitFlashTicks = 8;
  emit(world, 'hit', { sourceId: enemy.id, targetId: player.id, damage, blocked: guarding, shape });
  if (player.hp === 0) {
    player.dead = true;
    world.outcome = 'death';
    world.result = settlementResult(world, 'death');
    emit(world, 'death', { entityId: player.id, playerId: player.playerId });
    emit(world, 'stageEnd', { outcome: 'death' });
  }
  return true;
}

function beginEnemyTelegraph(world, enemy, target, shape, pattern, windupTicks) {
  enemy.attackPhase = 'windup';
  enemy.attackRemaining = windupTicks;
  enemy.attackWindupTicks = windupTicks;
  enemy.attackShape = shape;
  enemy.attackPattern = pattern;
  enemy.attackTargetId = target.id;
  enemy.attackHit = false;
  emit(world, 'telegraph', { entityId: enemy.id, shape, pattern });
}

function bossWindup(base, phaseTwo) {
  return phaseTwo ? Math.max(12, Math.floor(base * 0.8)) : base;
}

function maybeBossSummon(world, boss) {
  for (const [threshold, name] of [[0.66, '66'], [0.33, '33']]) {
    if (boss.hp / boss.maxHp > threshold || world.bossThresholds[name]) continue;
    world.bossThresholds[name] = true;
    for (let index = 0; index < 3; index += 1) {
      const angle = index * Math.PI * 2 / 3;
      const summon = spawnStageEnemy(world, 'minion', index, false);
      summon.x = boss.x + Math.cos(angle) * 2.1;
      summon.z = boss.z + Math.sin(angle) * 2.1;
      summon.currentRoomId = boss.currentRoomId;
    }
    emit(world, 'bossSummon', { entityId: boss.id, count: 3, threshold: Number(threshold) });
  }
}

function startBossPattern(world, boss, target) {
  const phaseTwo = boss.hp / boss.maxHp < 0.5;
  const patterns = phaseTwo ? ['combo', 'charge', 'slam', 'circles'] : ['combo', 'charge', 'slam'];
  const pattern = patterns[boss.attackPatternIndex % patterns.length];
  boss.attackPatternIndex += 1;
  const angle = Math.atan2(target.z - boss.z, target.x - boss.x);
  boss.facing = angle;
  if (pattern === 'combo') {
    boss.comboSwing = 0;
    beginEnemyTelegraph(world, boss, target, { type: 'sector', originX: boss.x, originZ: boss.z, angle, range: 2.6, halfAngle: 0.82 }, pattern, bossWindup([18, 12, 12][0], phaseTwo));
  } else if (pattern === 'charge') {
    boss.chargeStartX = boss.x;
    boss.chargeStartZ = boss.z;
    boss.chargeAngle = angle;
    beginEnemyTelegraph(world, boss, target, makeLineShape(boss.x, boss.z, angle, 9, 1.6), pattern, bossWindup(27, phaseTwo));
  } else if (pattern === 'slam') {
    beginEnemyTelegraph(world, boss, target, { type: 'circle', originX: boss.x, originZ: boss.z, radius: 3.5 }, pattern, bossWindup(30, phaseTwo));
  } else {
    const circles = [];
    for (let index = 0; index < 5; index += 1) {
      const angleOffset = Math.PI * 2 * index / 5;
      circles.push({
        x: target.x + Math.cos(angleOffset) * (index ? 1.9 : 0),
        z: target.z + Math.sin(angleOffset) * (index ? 1.9 : 0),
        radius: 1.3,
      });
    }
    beginEnemyTelegraph(world, boss, target, { type: 'circles', circles }, pattern, bossWindup(24, phaseTwo));
  }
}

function activeEnemyAttack(world, enemy, target) {
  if (enemy.attackHit || !attackShapeHit(enemy.attackShape, target, target.radius)) return;
  enemy.attackHit = true;
  damagePlayerM1(world, enemy, target, enemy.attackShape);
}

function stepStageEnemy(world, enemy, players) {
  if (enemy.spawnTicksLeft > 0) {
    enemy.spawnTicksLeft -= 1;
    enemy.invulnerable = enemy.spawnTicksLeft > 0;
    return;
  }
  if (enemy.stunnedTicks > 0) {
    enemy.stunnedTicks -= 1;
    return;
  }
  if (enemy.recoverTicks > 0) {
    enemy.recoverTicks -= 1;
    if (!enemy.recoverTicks) enemy.attackCooldownTicks = 30;
    return;
  }
  if (enemy.attackCooldownTicks > 0) {
    enemy.attackCooldownTicks -= 1;
    return;
  }
  const target = nearestPlayer(enemy, players);
  if (!target) return;
  if (enemy.boss) maybeBossSummon(world, enemy);
  if (enemy.attackPhase === 'windup') {
    if (enemy.attackRemaining > 1) {
      enemy.attackRemaining -= 1;
      return;
    }
    enemy.attackPhase = 'active';
    enemy.attackRemaining = enemy.attackPattern === 'charge' ? 9 : enemy.attackPattern === 'combo' ? 3 : 3;
    enemy.attackHit = false;
    return;
  }
  if (enemy.attackPhase === 'active') {
    if (enemy.attackPattern === 'charge') {
      moveEntity(world, enemy, Math.cos(enemy.chargeAngle) * 1, Math.sin(enemy.chargeAngle) * 1);
      enemy.lineTravelled += 1;
    }
    activeEnemyAttack(world, enemy, target);
    enemy.attackRemaining -= 1;
    if (enemy.attackRemaining <= 0) {
      if (enemy.boss && enemy.attackPattern === 'combo' && enemy.comboSwing < 2) {
        enemy.comboSwing += 1;
        const phaseTwo = enemy.hp / enemy.maxHp < 0.5;
        const nextTarget = nearestPlayer(enemy, players);
        const angle = Math.atan2(nextTarget.z - enemy.z, nextTarget.x - enemy.x);
        beginEnemyTelegraph(world, enemy, nextTarget, { type: 'sector', originX: enemy.x, originZ: enemy.z, angle, range: 2.6, halfAngle: 0.82 }, 'combo', bossWindup([18, 12, 12][enemy.comboSwing], phaseTwo));
      } else {
        if (enemy.attackPattern === 'line-dash') enemy.recoverTicks = 30;
        else if (enemy.attackPattern === 'charge') enemy.recoverTicks = 18;
        else enemy.attackCooldownTicks = enemy.boss ? 30 : ENEMIES[enemy.enemyKind].cooldownTicks;
        enemy.attackPhase = null;
        enemy.attackShape = null;
      }
    }
    return;
  }

  if (enemy.boss) {
    startBossPattern(world, enemy, target);
    return;
  }
  const rule = ENEMIES[enemy.enemyKind];
  const dx = target.x - enemy.x;
  const dz = target.z - enemy.z;
  const distance = Math.hypot(dx, dz);
  if (distance > 0.001) enemy.facing = Math.atan2(dz, dx);
  if (rule.behavior === 'ground-circle') {
    if (distance > rule.keepDistance + 0.8) {
      moveEntity(world, enemy, dx / distance * rule.speed / TICK_HZ, dz / distance * rule.speed / TICK_HZ);
    } else if (distance < rule.keepDistance - 1.1) {
      moveEntity(world, enemy, -dx / distance * rule.speed / TICK_HZ, -dz / distance * rule.speed / TICK_HZ);
    } else {
      beginEnemyTelegraph(world, enemy, target, { type: 'circle', originX: target.x, originZ: target.z, radius: rule.circleRadius }, rule.behavior, rule.windupTicks);
    }
    return;
  }
  if (rule.behavior === 'line-dash') {
    if (distance <= 6.5) {
      beginEnemyTelegraph(world, enemy, target, makeLineShape(enemy.x, enemy.z, enemy.facing, rule.length, rule.width), rule.behavior, rule.windupTicks);
      enemy.lineTravelled = 0;
    } else if (distance > 0.001) {
      moveEntity(world, enemy, dx / distance * rule.speed / TICK_HZ, dz / distance * rule.speed / TICK_HZ);
    }
    return;
  }
  if (distance <= rule.range) {
    const shape = { type: 'sector', originX: enemy.x, originZ: enemy.z, angle: enemy.facing, range: rule.range, halfAngle: rule.halfAngle };
    beginEnemyTelegraph(world, enemy, target, shape, rule.behavior, rule.windupTicks);
  } else if (distance > 0.001) {
    moveEntity(world, enemy, dx / distance * rule.speed / TICK_HZ, dz / distance * rule.speed / TICK_HZ);
  }
}

function settlementResult(world, outcome) {
  const retainedGold = outcome === 'clear' ? world.reward.gold : Math.floor(world.reward.gold / 2);
  return {
    outcome,
    xp: world.reward.xp,
    gold: retainedGold,
    goldLost: world.reward.gold - retainedGold,
    items: outcome === 'clear' ? world.reward.items.map((item) => ({ ...item })) : [],
    lostItems: outcome === 'clear' ? [] : world.reward.items.map((item) => ({ ...item })),
    stageId: world.stageId,
    potions: world.potions,
  };
}

function finishStage(world, outcome) {
  if (world.outcome) return;
  world.outcome = outcome;
  world.result = settlementResult(world, outcome);
  emit(world, 'stageEnd', { outcome, stageId: world.stageId, result: world.result });
}

function updateStageProgress(world) {
  if (world.outcome) return;
  const living = stageActiveEnemies(world);
  if (!living.length && !world.roomCleared) {
    world.roomCleared = true;
    const door = world.arena.doors.find((entry) => entry.fromRoom === world.arena.rooms[world.roomIndex]?.id);
    if (door) {
      world.openDoors[door.id] = true;
      emit(world, 'doorOpen', { doorId: door.id, roomIndex: world.roomIndex });
    } else {
      finishStage(world, 'clear');
      return;
    }
  }
  if (!world.roomCleared) return;
  const door = world.arena.doors.find((entry) => entry.fromRoom === world.arena.rooms[world.roomIndex]?.id);
  const player = world.entities.find((entity) => entity.kind === 'player');
  if (!door || !player || Math.hypot(player.x - door.x, player.z - door.z) > 1.7) return;
  const nextIndex = world.roomIndex + 1;
  if (nextIndex >= world.arena.rooms.length) {
    finishStage(world, 'clear');
    return;
  }
  world.roomIndex = nextIndex;
  player.x = door.x;
  player.z = door.z - 1.7;
  player.hp = Math.max(1, player.hp);
  emit(world, 'roomEnter', { roomIndex: nextIndex, roomId: world.arena.rooms[nextIndex].id });
  spawnRoom(world);
}

function pickupLoot(world, player) {
  for (const loot of [...world.entities]) {
    if (loot.kind !== 'loot' || Math.hypot(player.x - loot.x, player.z - loot.z) > 1) continue;
    world.entities = world.entities.filter((entity) => entity.id !== loot.id);
    if (loot.lootType === 'gold') world.reward.gold += loot.gold;
    else world.reward.items.push({ ...loot.item, lootId: loot.id });
    emit(world, 'pickup', {
      entityId: player.id,
      lootId: loot.id,
      lootType: loot.lootType,
      gold: loot.gold ?? 0,
      item: loot.item ?? null,
    });
  }
}

function stageStep(world, inputsByPlayerId) {
  for (const entity of world.entities) {
    if (entity.kind === 'enemy' && entity.dead) entity.deathTicks = Math.max(0, entity.deathTicks - 1);
  }
  const players = activePlayers(world).sort((a, b) => a.id - b.id);
  for (const player of players) advanceStagePlayer(world, player, inputsByPlayerId[player.playerId] ?? null);
  for (const player of players) {
    player.dodgeTicks = Math.max(0, player.dodgeTicks - 1);
    player.iFrames = Math.max(0, player.iFrames - 1);
    player.dodgeCooldownTicks = Math.max(0, player.dodgeCooldownTicks - 1);
    player.potionCooldownTicks = Math.max(0, player.potionCooldownTicks - 1);
    for (const id of [1, 2, 3]) player.skillCooldowns[id] = Math.max(0, player.skillCooldowns[id] - 1);
    player.hitFlashTicks = Math.max(0, player.hitFlashTicks - 1);
    pickupLoot(world, player);
  }
  for (const enemy of stageActiveEnemies(world)) stepStageEnemy(world, enemy, players);
  for (const enemy of world.entities) {
    if (enemy.kind === 'enemy') enemy.hitFlashTicks = Math.max(0, enemy.hitFlashTicks - 1);
  }
  cleanupEntities(world);
  updateStageProgress(world);
  return world;
}

export function retreatStage(world) {
  if (world.mode !== 'stage') throw new Error('Retreat is only available during a sortie');
  finishStage(world, 'retreat');
  return world.result;
}

export function completeStage(world, outcome = 'clear') {
  if (world.mode !== 'stage' || !['clear', 'death', 'retreat'].includes(outcome)) {
    throw new TypeError('Invalid stage outcome');
  }
  finishStage(world, outcome);
  return world.result;
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function step(world, inputsByPlayerId = {}) {
  world.tick += 1;
  if (world.mode === 'stage') return stageStep(world, inputsByPlayerId);
  for (const entity of world.entities) {
    if (entity.kind === 'enemy' && entity.dead) entity.deathTicks = Math.max(0, entity.deathTicks - 1);
  }
  const playerEntities = world.players
    .map((entityId) => world.entities.find((entity) => entity.id === entityId))
    .filter(Boolean)
    .sort((a, b) => a.id - b.id);
  for (const player of playerEntities) {
    const hasInput = Object.hasOwn(inputsByPlayerId, player.playerId);
    stepPlayer(world, player, hasInput ? inputsByPlayerId[player.playerId] : null);
  }

  const players = activePlayers(world).sort((a, b) => a.id - b.id);
  const enemies = activeEnemies(world).sort((a, b) => a.id - b.id);
  for (const enemy of enemies) stepEnemy(world, enemy, players);
  separateEnemies(world);

  for (const player of playerEntities) {
    player.dodgeTicks = Math.max(0, player.dodgeTicks - 1);
    player.iFrames = Math.max(0, player.iFrames - 1);
    player.dodgeCooldownTicks = Math.max(0, player.dodgeCooldownTicks - 1);
    player.hitFlashTicks = Math.max(0, player.hitFlashTicks - 1);
  }
  for (const enemy of world.entities) {
    if (enemy.kind === 'enemy') enemy.hitFlashTicks = Math.max(0, enemy.hitFlashTicks - 1);
  }
  cleanupEntities(world);
  ensureWave(world);
  return world;
}

export function hashWorld(world) {
  const serialized = stableStringify(world);
  let hash = 2166136261;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
