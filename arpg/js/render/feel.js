// Presentation-only tuning, seconds and arena pixels. Never changes the combat clock or RNG.
export const FEEL = Object.freeze({
  impact: Object.freeze({
    normal: Object.freeze({ stop: .04, trauma: .18, kick: 5, sparks: 5 }),
    heavy: Object.freeze({ stop: .065, trauma: .25, kick: 8, sparks: 8 }),
    weak: Object.freeze({ stop: .07, trauma: .28, kick: 9, sparks: 9 }),
    critical: Object.freeze({ stop: .08, trauma: .3, kick: 10, sparks: 10 }),
    kill: Object.freeze({ stop: .09, trauma: .34, kick: 11, sparks: 14 }),
  }),
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
  colors: Object.freeze({ normal: 0xffebc2, weak: 0xffca66, critical: 0xff9679, hurt: 0xff9d8c, dust: 0xa18b68, perfect: 0xa9ffef }),
  audio: Object.freeze({ voices: 6, pitch: .05, gain: .45, cooldown: .025 }),
});

export function impactTier(event) {
  if (event.type === 'kill' || event.type === 'death') return FEEL.impact.kill;
  if (event.critical) return FEEL.impact.critical;
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
