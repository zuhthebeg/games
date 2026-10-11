import { BIOMES, biomeForStage, biomeSeed } from '../content/biomes.js';
import { STAGES } from '../content/combat.js';
export const TALL_PROPS = new Set(['tree', 'column', 'beam', 'boulder', 'cocoon', 'brazier']);
export const PROP_RADIUS = 42; // Conservative enclosing circle for all painted geometry/shadows.
export const EDGE_BAND = 116;
export function randomFor(seed) {
  let n = seed >>> 0;
  return () => { n = (Math.imul(n, 1664525) + 1013904223) >>> 0; return n / 4294967296; };
}
export function exclusionZones(stageId, w, h) {
  return [{ x: w * .22, y: h * .5, r: 160 },
    ...(STAGES[stageId]?.spawns || []).map(s => ({ x: s.fx * w, y: s.fy * h, r: 120 }))];
}
export function allowedProp(prop, zones, w, h) {
  return prop.x >= prop.r + 22 && prop.x <= w - prop.r - 22
    && prop.y >= prop.r + 22 && prop.y <= h - prop.r - 22
    && (!prop.tall || Math.min(prop.x + prop.r, w - prop.x + prop.r, prop.y + prop.r, h - prop.y + prop.r) <= EDGE_BAND)
    && zones.every(z => Math.hypot(prop.x - z.x, prop.y - z.y) >= z.r + prop.r);
}
export function createBiomeLayout(stageId = 'S1', w = 1400, h = 860) {
  const id = biomeForStage(stageId), seed = biomeSeed(stageId), biome = BIOMES[id];
  const random = randomFor(seed), zones = exclusionZones(stageId, w, h), props = [];
  // Every kind gets 4 accepted placements (32 props), never a last-resort unsafe placement.
  for (const kind of biome.props) {
    let placed = 0;
    for (let attempt = 0; attempt < 600 && placed < 4; attempt++) {
      const tall = TALL_PROPS.has(kind), r = PROP_RADIUS;
      let x = 64 + random() * (w - 128), y = 64 + random() * (h - 128);
      // Tall props entirely confined to the edge band. Most low props also stay outside combat center.
      if (tall || random() < .72) {
        const edge = Math.floor(random() * 4);
        if (edge === 0) y = 64 + random() * 8;
        if (edge === 1) y = h - 64 - random() * 8;
        if (edge === 2) x = 64 + random() * 8;
        if (edge === 3) x = w - 64 - random() * 8;
      }
      const prop = { kind, x, y, r, tall, variation: random() };
      if (!allowedProp(prop, zones, w, h) || props.some(p => Math.hypot(x - p.x, y - p.y) < r * 1.35)) continue;
      props.push(prop); placed++;
    }
  }
  return { stageId, id, seed, w, h, zones, props };
}
export function luminance(color) {
  const c = [color >> 16 & 255, color >> 8 & 255, color & 255].map(v => {
    v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
  });
  return c[0] * .2126 + c[1] * .7152 + c[2] * .0722;
}
export const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);
