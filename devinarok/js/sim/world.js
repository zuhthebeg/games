import { ARENA } from './arena.js';

export const TICK_HZ = 30;
export const BUTTONS = {
  ATTACK: 1,
  DODGE: 2,
  SKILL1: 4,
  SKILL2: 8,
  SKILL3: 16,
  INTERACT: 32,
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
  return {
    id: arena.id,
    width: arena.width,
    depth: arena.depth,
    bounds: { ...arena.bounds },
    playerSpawn: { ...arena.playerSpawn },
    spawnPoints: arena.spawnPoints.map((point) => ({ ...point })),
    obstacles: arena.obstacles.map((obstacle) => ({ ...obstacle })),
    props: (arena.props ?? []).map((prop) => ({ ...prop })),
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
    buttons: clampInput(rawInput.buttons, 0, 63, 0),
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
    for (const obstacle of world.arena.obstacles) resolveObstacle(entity, obstacle);
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
    tick: 0,
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
  const player = {
    id: nextEntityId(world),
    kind: 'player',
    playerId: id,
    characterKind,
    x: spawn.x,
    z: spawn.z,
    facing: -Math.PI / 2,
    radius: PLAYER_RADIUS,
    hp: PLAYER_MAX_HP,
    maxHp: PLAYER_MAX_HP,
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
  };
  moveEntity(world, player, 0, 0);
  world.entities.push(player);
  world.players.push(player.id);
  ensureWave(world);
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
  if (attack.phase === 'active') {
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

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function step(world, inputsByPlayerId = {}) {
  world.tick += 1;
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
