import { aimByte } from './bot-policy.js';
import { pickAimTarget } from '../sim/world.js';

const FAMILY_RANGES = {
  crossbow: 12,
  staff: 8,
};

function angleFromAim(aim) {
  return (aim / 256) * Math.PI * 2;
}

export function buildRangedAimInput(input, player, viewedWorld) {
  const range = FAMILY_RANGES[player?.family];
  if (!range) return input;

  const moveX = Number(input.moveX ?? input.mx ?? 0) / 127;
  const moveZ = Number(input.moveZ ?? input.mz ?? 0) / 127;
  const moving = Math.hypot(moveX, moveZ) > 0.01;
  const fallbackAngle = moving
    ? Math.atan2(moveZ, moveX)
    : Number.isFinite(input.aim)
      ? angleFromAim(input.aim)
      : player.facing ?? 0;
  const target = pickAimTarget(viewedWorld, { ...player, facing: fallbackAngle, viewLag: 0 }, range);
  if (!target) {
    const withoutDistance = { ...input };
    delete withoutDistance.ad;
    return {
      ...withoutDistance,
      aim: moving
        ? aimByte(moveX, moveZ)
        : Number.isFinite(input.aim)
          ? input.aim
          : aimByte(Math.cos(fallbackAngle), Math.sin(fallbackAngle)),
    };
  }

  const dx = target.x - player.x;
  const dz = target.z - player.z;
  const distance = Math.hypot(dx, dz);
  return {
    ...input,
    aim: aimByte(dx, dz),
    ad: Math.min(range, Math.max(0, Math.round(distance * 10) / 10)),
  };
}
