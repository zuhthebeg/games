// Pure deterministic helpers shared by the sim. No DOM, no Date, no Math.random.

export const SIM_HZ = 30;
export const TICK_MS = 1000 / SIM_HZ;
export const DT = 1 / SIM_HZ;
export const ticks = (ms) => Math.max(0, Math.round(ms / TICK_MS));

export const TEAM_PLAYER = 0;
export const TEAM_MONSTER = 1;

// mulberry32; state lives on the world so snapshots are serializable.
export function rand(world) {
  let t = (world.rng = (world.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function pickWeighted(world, items) {
  let total = 0;
  for (const it of items) total += it.weight;
  let r = rand(world) * total;
  for (const it of items) {
    r -= it.weight;
    if (r < 0) return it;
  }
  return items[items.length - 1];
}

const TAU = Math.PI * 2;
export function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

export function turnToward(cur, target, maxStep) {
  const d = angleDiff(cur, target);
  if (Math.abs(d) <= maxStep) return target;
  return cur + Math.sign(d) * maxStep;
}

export const dist2 = (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2;

// Hit shapes. The renderer draws telegraphs from the exact same object (design §7.2):
// visual may be drawn slightly larger, never smaller.
//   circle: { type:'circle', radius, offset }   centre is `offset` px ahead of origin along facing
//   cone:   { type:'cone', range, arc }          arc in degrees, apex at origin
//   rect:   { type:'rect', length, width, offset } starts `offset` ahead of origin, extends `length`
export function shapeHitsCircle(shape, ox, oy, facing, cx, cy, cr) {
  const cos = Math.cos(facing), sin = Math.sin(facing);
  const dx = cx - ox, dy = cy - oy;
  const lx = dx * cos + dy * sin;
  const ly = -dx * sin + dy * cos;
  switch (shape.type) {
    case 'circle': {
      const off = shape.offset || 0;
      return (lx - off) ** 2 + ly ** 2 <= (shape.radius + cr) ** 2;
    }
    case 'cone': {
      const d = Math.hypot(lx, ly);
      if (d > shape.range + cr) return false;
      if (d <= cr) return true;
      const half = (shape.arc * Math.PI) / 360;
      const slack = Math.asin(Math.min(1, cr / d));
      return Math.abs(Math.atan2(ly, lx)) <= half + slack;
    }
    case 'rect': {
      const off = shape.offset || 0;
      const px = Math.max(off, Math.min(off + shape.length, lx));
      const py = Math.max(-shape.width / 2, Math.min(shape.width / 2, ly));
      return (lx - px) ** 2 + (ly - py) ** 2 <= cr * cr;
    }
    default:
      throw new Error(`unknown shape ${shape.type}`);
  }
}

// Earliest entry of a finite segment into a circle (0..1), null on a miss.
// Starting inside counts as contact; callers exclude the projectile owner.
export function segmentCircleEntry(ax, ay, bx, by, cx, cy, radius) {
  const dx = bx - ax, dy = by - ay, ox = ax - cx, oy = ay - cy;
  const c = ox * ox + oy * oy - radius * radius;
  if (c <= 0) return 0;
  const a = dx * dx + dy * dy;
  if (a === 0) return null;
  const b = ox * dx + oy * dy, discriminant = b * b - a * c;
  if (discriminant < 0) return null;
  const t = (-b - Math.sqrt(discriminant)) / a;
  return t >= 0 && t <= 1 ? t : null;
}
