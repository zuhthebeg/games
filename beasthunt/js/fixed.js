// Bounded accumulator shared by browser and cadence tests; seconds in, fixed ticks out.
export const STEP = 1 / 60;
export class FixedClock {
  constructor() { this.accumulator = 0; }
  reset() { this.accumulator = 0; }
  advance(seconds, step) {
    this.accumulator += Math.max(0, Math.min(seconds, .1));
    let count = 0;
    while (this.accumulator + 1e-10 >= STEP && count < 6) {
      this.accumulator -= STEP; if (this.accumulator < 0) this.accumulator = 0;
      step(); count++;
    }
    return count;
  }
  get alpha() { return this.accumulator / STEP; }
}
export function interpolatePose(before, after, alpha) {
  const pose = { ...after };
  // Respawn is a relocation, not motion through the arena. Keep ordinary roll
  // and knockback interpolation. Respawn is the current sim's only teleport.
  if (before.state === 'dead' && after.state !== 'dead') return pose;
  for (const k of ['x','y','z','spin']) if (typeof after[k] === 'number') pose[k] = before[k] + (after[k] - before[k]) * alpha;
  let angle = (after.yaw - before.yaw) % (Math.PI*2);
  if (angle > Math.PI) angle -= Math.PI*2; if (angle < -Math.PI) angle += Math.PI*2;
  pose.yaw = before.yaw + angle*alpha;
  return pose;
}
