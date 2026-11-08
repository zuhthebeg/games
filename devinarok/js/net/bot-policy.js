import { BUTTONS } from '../sim/world.js';

function wrapAngle(angle) {
  return ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
}

function angleDifference(left, right) {
  let difference = (left - right) % (Math.PI * 2);
  if (difference > Math.PI) difference -= Math.PI * 2;
  if (difference < -Math.PI) difference += Math.PI * 2;
  return difference;
}

export function aimByte(dx, dz) {
  return Math.round(wrapAngle(Math.atan2(dz, dx)) / (Math.PI * 2) * 256) & 255;
}

export function insideShape(shape, point, radius = 0) {
  if (!shape) return false;
  if (shape.type === 'sector') {
    const dx = point.x - shape.originX;
    const dz = point.z - shape.originZ;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.0001 || distance > shape.range + radius) return false;
    return Math.abs(angleDifference(Math.atan2(dz, dx), shape.angle)) <= shape.halfAngle;
  }
  if (shape.type === 'circle') {
    return Math.hypot(point.x - shape.originX, point.z - shape.originZ) <= shape.radius + radius;
  }
  if (shape.type === 'circles') {
    return shape.circles.some((circle) => Math.hypot(point.x - circle.x, point.z - circle.z) <= circle.radius + radius);
  }
  if (shape.type === 'line') {
    const dx = point.x - shape.originX;
    const dz = point.z - shape.originZ;
    const forward = dx * Math.cos(shape.angle) + dz * Math.sin(shape.angle);
    const side = Math.abs(-dx * Math.sin(shape.angle) + dz * Math.cos(shape.angle));
    return forward >= -radius && forward <= shape.length + radius && side <= shape.width / 2 + radius;
  }
  return false;
}

export function computeBotPolicy({ player, viewed, roomCleared = false, door = null }) {
  const ranged = player.family === 'crossbow' || player.family === 'staff';
  const activeEnemyIds = viewed.activeEnemyIds ? new Set(viewed.activeEnemyIds) : null;
  const enemies = viewed.entities
    .filter((entity) => entity.kind === 'enemy' && !entity.dead && entity.state !== 'dead')
    .filter((entity) => !entity.invulnerable && (entity.spawnTicksLeft ?? 0) <= 0)
    .filter((entity) => !activeEnemyIds || activeEnemyIds.has(entity.id));
  let moveX = 0;
  let moveZ = 0;
  let buttons = 0;
  let target = null;
  let targetDistance = Infinity;
  for (const enemy of enemies) {
    const distance = Math.hypot(enemy.x - player.x, enemy.z - player.z);
    if (distance < targetDistance) {
      target = enemy;
      targetDistance = distance;
    }
  }

  const threat = enemies.find((enemy) => (
    enemy.attackPhase === 'windup' &&
    enemy.attackRemaining > 0 &&
    insideShape(enemy.attackShape, player, player.radius ?? 0.32)
  ));
  if (!threat && (player.counterReadyTicks ?? 0) > 0) {
    buttons |= (player.previousButtons & BUTTONS.ATTACK) ? 0 : BUTTONS.ATTACK;
  }
  let aim = target
    ? aimByte(target.x - player.x, target.z - player.z)
    : player.lastInput?.aim ?? 0;
  if (threat && (player.dodgeCooldownTicks ?? 0) === 0) {
    const shape = threat.attackShape;
    let dx = player.x - (shape.originX ?? threat.x);
    let dz = player.z - (shape.originZ ?? threat.z);
    if (Math.hypot(dx, dz) < 0.01) {
      dx = -(threat.z - player.z);
      dz = threat.x - player.x;
    }
    const length = Math.hypot(dx, dz) || 1;
    moveX = Math.round(dx / length * 127);
    moveZ = Math.round(dz / length * 127);
    buttons |= BUTTONS.DODGE;
    aim = aimByte(dx, dz);
  } else if (roomCleared) {
    if (door) {
      const dx = door.x - player.x;
      const dz = door.z - player.z;
      const distance = Math.hypot(dx, dz);
      if (distance > 0.75) {
        moveX = Math.round(dx / distance * 127);
        moveZ = Math.round(dz / distance * 127);
        aim = aimByte(dx, dz);
      }
    }
  } else if (target) {
    const dx = target.x - player.x;
    const dz = target.z - player.z;
    if (ranged && targetDistance < 5.5) {
      moveX = Math.round(-dx / targetDistance * 127);
      moveZ = Math.round(-dz / targetDistance * 127);
    } else if (ranged && targetDistance > 6.5) {
      moveX = Math.round(dx / targetDistance * 127);
      moveZ = Math.round(dz / targetDistance * 127);
    } else if (!ranged && targetDistance > 1.35) {
      moveX = Math.round(dx / targetDistance * 127);
      moveZ = Math.round(dz / targetDistance * 127);
    } else if (!ranged && !player.attack && !player.skillCast) {
      const skillReady = player.level >= 7 && [1, 2, 3, 4].some((id) => (
        (player.skillCooldowns?.[id] ?? 0) === 0
      ));
      if (!skillReady) buttons |= BUTTONS.ATTACK;
    }
  }
  if (!threat && player.hp < player.maxHp * 0.55 && player.potions > 0 && !buttons) {
    buttons |= BUTTONS.POTION;
  } else if (!threat && !roomCleared && target && !player.skillCast && !buttons && (ranged || targetDistance <= 3.2)) {
    const skillIds = ranged || player.level >= 7 ? [1, 2, 3, 4] : [];
    const availableSkill = skillIds.find((id) => (
      (id < 4 || player.level >= 7) && (player.skillCooldowns?.[id] ?? 0) === 0
    ));
    if (availableSkill) buttons |= {
      1: BUTTONS.SKILL1,
      2: BUTTONS.SKILL2,
      3: BUTTONS.SKILL3,
      4: BUTTONS.SKILL4,
    }[availableSkill];
    else if (!player.attack) buttons |= BUTTONS.ATTACK;
  }
  if (!threat && (player.counterReadyTicks ?? 0) > 0 && (player.previousButtons & BUTTONS.ATTACK)) {
    buttons &= ~BUTTONS.ATTACK;
  }

  return { moveX, moveZ, aim, buttons };
}
