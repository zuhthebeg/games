import { ABILITIES } from '../content/combat.js';

// Presentation-only tuning, seconds and arena pixels. Never changes the combat clock or RNG.
export const FEEL = Object.freeze({
  impact: Object.freeze({
    normal: Object.freeze({ stop: .04, trauma: .18, kick: 5, sparks: 5 }),
    heavy: Object.freeze({ stop: .065, trauma: .25, kick: 8, sparks: 8 }),
    weak: Object.freeze({ stop: .07, trauma: .28, kick: 9, sparks: 9 }),
    critical: Object.freeze({ stop: .08, trauma: .3, kick: 10, sparks: 10 }),
    kill: Object.freeze({ stop: .09, trauma: .34, kick: 11, sparks: 14 }),
    // cocy 10-11: the counter is the reward for the one manual skill left in auto mode.
    counter: Object.freeze({ stop: .14, trauma: .55, kick: 16, sparks: 22 }),
  }),
  area: Object.freeze({ stop: 1 / 60, trauma: .025 }),
  heavyDamage: 20,
  hurtLife: .12,
  flash: Object.freeze({ life: .033, killLife: .05, alpha: .85, killAlpha: 1 }),
  shake: Object.freeze({ maxX: 5, maxY: 3, decay: 2.7, received: 1.8, frequencyX: 61, frequencyY: 79 }),
  kick: Object.freeze({ life: .18, squash: .12 }),
  numbers: Object.freeze({ cap: 32, life: .8, rise: 38, pop: .14, popScale: 1.4, weakScale: 1.2, criticalScale: 1.35, spread: 18 }),
  particles: Object.freeze({ cap: 56, life: .24, speed: 110, gravity: 180, reducedCount: 3 }),
  effects: Object.freeze({ cap: 40, reducedAlpha: .3, ringGrow: .5 }),
  trail: Object.freeze({ life: .16, dodgeInterval: .035, slashWidth: 5, tailLength: 36, tailAlpha: .25, slashAlpha: .7 }),
  perfect: Object.freeze({ life: .18, scale: .35, ringLife: .32, radius: 32 }),
  counter: Object.freeze({ slow: .26, ring: 58, ringLife: .38, scale: 1.7 }),
  colors: Object.freeze({ counter: 0xffd36b, normal: 0xffebc2, weak: 0xffca66, critical: 0xff9679, hurt: 0xff9d8c, dust: 0xa18b68, perfect: 0xa9ffef }),
  audio: Object.freeze({ voices: 6, pitch: .05, gain: .45, cooldown: .025 }),
});

export function impactTier(event) {
  if (event.type === 'kill' || event.type === 'death') return FEEL.impact.kill;
  if (event.counter) return FEEL.impact.counter;
  if (event.crit || event.critical) return FEEL.impact.critical;
  if (event.exposed) return FEEL.impact.weak;
  return event.dmg >= FEEL.heavyDamage ? FEEL.impact.heavy : FEEL.impact.normal;
}

export function numberScale(age) {
  const progress = Math.max(0, Math.min(1, age / FEEL.numbers.pop));
  return 1 + (FEEL.numbers.popScale - 1) * (1 - progress) ** 3;
}

// Envelope reaches its maximum quickly, then eases back to zero; no sim knockback is added.
export function kickEnvelope(age) {
  const progress = Math.max(0, Math.min(1, age / FEEL.kick.life));
  return Math.sin(Math.PI * progress) * (1 - progress) ** 2;
}

// One source/ability entry per living player. Accepted act events delimit casts;
// distinct hostile targets accumulate across active ticks and guest journal batches.
// No event/world mutation and no simulation clock or RNG access.
export class AreaImpact {
  constructor() { this.casts = new Map(); }
  reset() { this.casts.clear(); }
  tiers(events, world) {
    const groups = new Map();
    const players = new Set(world.entities.filter(e => e.kind === 'player').map(e => e.id));
    for (const [key, cast] of this.casts) if (!players.has(cast.src)) this.casts.delete(key);
    for (const event of events) {
      const def = ABILITIES[event.ability];
      const area = def && !def.heal && def.cooldownMs > 0
        && (def.shape?.type === 'circle' || def.shape?.type === 'cone' || def.projectile?.explode);
      if (!area) continue;
      const src = event.type === 'act' ? event.id : event.src;
      if (!players.has(src)) continue;
      const key = `${src}:${event.ability}`;
      if (event.type === 'act') { this.casts.delete(key); continue; }
      if (event.type !== 'hit' || world.entities.find(e => e.id === event.dst)?.kind !== 'monster') continue;
      let cast = this.casts.get(key);
      if (!cast) { cast = { src, targets: new Set() }; this.casts.set(key, cast); }
      cast.targets.add(event.dst);
      let group = groups.get(cast);
      if (!group) { group = []; groups.set(cast, group); }
      group.push(event);
    }
    const tiers = new Map();
    for (const [cast, hits] of groups) if (cast.targets.size >= 2) for (const event of hits) {
      const tier = impactTier(event);
      tiers.set(event, { ...tier, stop: tier.stop + FEEL.area.stop, trauma: tier.trauma + FEEL.area.trauma });
    }
    return tiers;
  }
}
