import { BUTTONS, spawnEnemy, step } from '../sim/world.js';
import { ENEMIES } from '../content/enemies.js';

function angleByte(angle) {
  return Math.round((angle / (Math.PI * 2) * 256 + 256) % 256);
}

export function debugKillEnemy(world, enemy, runStep = (inputs) => step(world, inputs)) {
  if (
    world?.mode !== 'stage'
    || world.partySize !== 1
    || !enemy
    || enemy.kind !== 'enemy'
    || enemy.dead
    || !world.entities.includes(enemy)
  ) return false;
  const player = world.entities.find((entity) => (
    entity.kind === 'player' && entity.playerId === world.soloPlayerId && !entity.dead && !entity.downed
  ));
  if (!player) return false;

  const origin = { x: player.x, z: player.z, facing: player.facing, iFrames: player.iFrames };
  const enemySpeed = enemy.moveSpeed;
  const angle = Math.atan2(enemy.z - player.z, enemy.x - player.x);
  const distance = Math.max(0.9, (player.radius ?? 0.35) + (enemy.radius ?? 0.4) + 0.2);
  player.x = enemy.x - Math.cos(angle) * distance;
  player.z = enemy.z - Math.sin(angle) * distance;
  player.facing = angle;
  player.attack = null;
  player.skillCast = null;
  player.previousButtons = 0;
  player.iFrames = 10000;
  player.dodgeTicks = 0;
  player.dodgeBufferTicks = 0;
  player.counterReadyTicks = 0;
  player.counterAttackerId = null;
  enemy.hp = 1;
  enemy.dead = false;
  enemy.invulnerable = false;
  enemy.spawnTicksLeft = 0;
  enemy.moveSpeed = 0;
  enemy.attackShape = null;
  enemy.attackPhase = null;
  enemy.attackCooldownTicks = 10000;

  const aim = angleByte(angle);
  const seq = Math.max(0, player.lastInput?.seq ?? 0);
  for (let tick = 0; tick < 20 && !enemy.dead && !world.outcome; tick += 1) {
    runStep({
      [player.playerId]: {
        seq: seq + tick + 1,
        moveX: 0,
        moveZ: 0,
        aim,
        buttons: tick === 0 ? BUTTONS.ATTACK : 0,
      },
    });
  }

  player.x = origin.x;
  player.z = origin.z;
  player.facing = origin.facing;
  player.iFrames = origin.iFrames;
  player.attack = null;
  player.skillCast = null;
  player.previousButtons = 0;
  player.dodgeTicks = 0;
  player.dodgeBufferTicks = 0;
  if (!enemy.dead) enemy.moveSpeed = enemySpeed;
  return enemy.dead;
}

export function debugSpawnRoomEnemy(world, enemyKind, position = null) {
  if (world?.mode !== 'stage') return null;
  const stageEnemyKind = enemyKind === 'Skeleton_Warrior' ? 'warrior' : 'minion';
  const rule = ENEMIES[stageEnemyKind];
  const enemy = spawnEnemy(world, rule.model, position);
  const scale = 1 + 0.12 * ((world.stageLevel ?? 1) - 1);
  const partyScale = 1 + 0.75 * ((world.partySize ?? 1) - 1);
  const maxHp = Math.max(1, Math.round(rule.hp * scale * partyScale));
  Object.assign(enemy, {
    enemyKind: stageEnemyKind,
    model: rule.model,
    radius: rule.radius,
    hp: maxHp,
    maxHp,
    attack: Math.max(1, Math.round(rule.attack * scale)),
    speed: rule.speed,
    moveSpeed: rule.speed,
    boss: false,
    elite: false,
    summoned: false,
    currentRoomId: world.arena.rooms[world.roomIndex]?.id,
  });
  world.roomEnemyIds ??= [];
  world.roomEnemyIds.push(enemy.id);
  return enemy;
}

export function debugKillRoomEnemies(world, runStep) {
  const enemies = world.entities.filter((entity) => entity.kind === 'enemy' && !entity.dead);
  let killed = 0;
  for (const enemy of enemies) {
    if (world.outcome) break;
    if (debugKillEnemy(world, enemy, runStep)) killed += 1;
  }
  return killed;
}
