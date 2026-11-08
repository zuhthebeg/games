import { PARTY_PERFECT_DODGE_TICKS, PERFECT_DODGE_TICKS } from '../sim/world.js';

export function isPerfectDodgeWindowActive(world, player) {
  if (!player || player.dodgeStartTick === null) return false;
  const windowTicks = world.partySize > 1 ? PARTY_PERFECT_DODGE_TICKS : PERFECT_DODGE_TICKS;
  return world.tick - player.dodgeStartTick < windowTicks;
}
