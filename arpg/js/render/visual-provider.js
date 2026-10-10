import { BALANCE } from '../content/balance.js';
import { Container, Graphics } from '../../vendor/pixi-8.22.0.min.mjs';
import { registerAtlasFactories } from './atlas-visual.js';
import { visualKey } from './atlas-state.js';
import { MONSTER_VARIANTS, MONSTER_PALETTES } from '../content/monsters.js';
const COLORS = {
  blade: 0x7c9fa2,
  bow: 0x819768,
  focus: 0x8573ab,
};
// Atlas providers can register the same key and return this contract unchanged.
// update(entityState, animState, deltaTime) never writes to the simulation.
export class VisualProvider {
  constructor({ palette = {}, atlases = true } = {}) {
    this.palette = palette;
    this.factories = new Map();
    if (atlases) registerAtlasFactories(this, procedural);
  }

  beginRound(entities) {
    this.atlases?.beginRound(entities.map(visualKey));
  }

  register(key, factory) {
    this.factories.set(key, factory);
  }

  createVisual(entity) {
    const key = visualKey(entity);
    const variant = MONSTER_VARIANTS[key];
    const color = this.palette[key] ?? (variant ? MONSTER_PALETTES[variant.paletteId][0] : COLORS[key]);
    return this.factories.has(key) ? this.factories.get(key)(entity, { color }) : procedural(entity, { color });
  }
}
function procedural(entity, { color }) {
  const container = new Container();
  const body = new Container();
  const silhouette = new Graphics();
  const weapon = new Graphics();
  const face = new Graphics();
  const stars = new Graphics();
  const bar = new Graphics();
  const health = new Graphics();
  const flash = new Graphics();
  const radius = entity.r, visualKey = entity.kind === 'player' ? entity.weapon : entity.type;
  silhouette.ellipse(-6, -2, 6, 4).ellipse(7, -2, 6, 4).fill(0x242722);
  if (visualKey === 'iron_boar') {
    silhouette.ellipse(0, -16, radius + 7, radius * .7).fill(color).ellipse(18, -15, 12, 10).fill(0x3a3027);
    silhouette.poly([23, -12, 33, -23, 28, -8]).poly([18, -8, 25, 0, 22, -12]).fill(0xe7d4aa);
    silhouette.moveTo(-16, -29).lineTo(12, -29).stroke({ color: 0x999b91, width: 5 });
  }
  else if (visualKey === 'wolf') {
    // Long low body, pointed muzzle, upright ears and tail; unlike the round armored boar.
    silhouette.ellipse(-2, -19, 26, 13).fill(color);
    silhouette.poly([10, -28, 23, -37, 28, -29, 39, -21, 26, -15, 14, -16])
      .poly([12, -30, 12, -45, 22, -34]).poly([-21, -23, -38, -34, -31, -15])
      .rect(-18, -15, 7, 15).rect(12, -15, 7, 15).fill(color);
    silhouette.circle(25, -28, 2).fill(0xf0e6d0);
  }
  else if (visualKey === 'rune_guardian') {
    // Broad segmented stone shoulders, square head and carved rune; no goblin ears/crown.
    silhouette.roundRect(-23, -43, 46, 34, 3).rect(-15, -61, 30, 20)
      .rect(-38, -42, 12, 32).rect(26, -42, 12, 32)
      .rect(-21, -8, 14, 9).rect(7, -8, 14, 9).fill(color);
    silhouette.poly([0, -36, 10, -25, 0, -14, -10, -25, 0, -36])
      .stroke({ color: 0xc5d3d4, width: 3 });
  }
  else if (visualKey === 'spirit') {
    // Floating diamond core inside a tapered flame/wisp; no humanoid limbs.
    silhouette.poly([0, -58, 20, -31, 12, -10, 0, 2, -12, -10, -20, -31]).fill({ color, alpha: .65 });
    silhouette.poly([0, -43, 10, -30, 0, -17, -10, -30]).fill(0xe0dcf5);
    silhouette.ellipse(0, -29, 25, 11).stroke({ color, width: 2 });
  }
  else if (visualKey === 'poison_spider') {
    // Eight bent legs, twin body lobes and mandibles, identifiable without hue.
    for (const side of [-1, 1]) {
      for (let leg = 0; leg < 4; leg++) {
        const y = -33 + leg * 8;
        silhouette.moveTo(side * 9, y).lineTo(side * 28, y - 7).lineTo(side * 35, y + 7);
      }
    }
    silhouette.stroke({ color, width: 4 });
    silhouette.ellipse(0, -30, 17, 16).ellipse(0, -12, 11, 10).fill(color);
    silhouette.poly([-6, -4, -9, 4, -2, 0]).poly([6, -4, 9, 4, 2, 0]).fill(0xc3d0b7);
  }
  else if (visualKey === 'scarecrow') {
    silhouette.rect(-3, -42, 6, 42).rect(-30, -30, 60, 6).fill(0x745639);
    silhouette.poly([-17, -32, 17, -32, 11, -4, -11, -4]).fill(color);
    silhouette.circle(0, -41, 10).fill(0xd5b66b).poly([-15, -45, 15, -45, 5, -57, -6, -57]).fill(0x574430);
    silhouette.moveTo(-6, -40).lineTo(-2, -37).moveTo(2, -37).lineTo(6, -40).stroke({ color: 0x26241b, width: 2 });
  }
  else {
    silhouette
      .poly([-radius * .75, -6, -radius * .65, -26, 0, -34, radius * .65, -26, radius * .75, -6])
      .fill(color)
      .stroke({ color: 0x1a231c, width: 2 });
    silhouette.circle(0, -36, radius * .58).fill(entity.kind === 'player' ? 0xc4b29a : color);
    if (entity.kind === 'player')
      silhouette.poly([-13, -42, 0, -51, 13, -42, 11, -31, 0, -37, -11, -31]).fill(0x343b3b);
    else
      silhouette.poly([-8, -39, -24, -44, -14, -29]).poly([8, -39, 24, -44, 14, -29]).fill(color);
    if (visualKey === 'goblin_chief')
      silhouette.poly([-15, -46, -17, -58, -7, -52, 0, -63, 7, -52, 17, -58, 15, -46]).fill(0xc5a24d);
    silhouette.circle(-5, -36, 2).circle(5, -36, 2).fill(0xf4d18c);
  }
  if (visualKey === 'blade' || visualKey === 'goblin_grunt')
    weapon.poly([9, -3, 13, -3, 14, -39, 11, -48, 8, -39]).fill(0xc8d1c9).rect(4, -15, 16, 4).fill(0x927850);
  if (visualKey === 'bow')
    weapon
      .moveTo(12, -43)
      .quadraticCurveTo(38, -24, 12, -6)
      .stroke({ color: 0xba9863, width: 4 })
      .moveTo(12, -43)
      .lineTo(12, -6)
      .stroke({ color: 0xc5c1a5, width: 1 });
  if (visualKey === 'focus')
    weapon
      .circle(19, -29, 12)
      .fill({ color: 0x8ddfe9, alpha: .15 })
      .circle(19, -29, 6)
      .fill(0xb4ebf5)
      .circle(17, -32, 2)
      .fill(0xffffff);
  if (visualKey === 'goblin_slinger')
    weapon
      .moveTo(12, -20)
      .lineTo(29, -40)
      .lineTo(34, -26)
      .lineTo(12, -20)
      .stroke({ color: 0xc7b18d, width: 2 })
      .circle(29, -38, 4)
      .fill(0xaba795);
  if (visualKey === 'goblin_chief')
    weapon.rect(13, -43, 6, 42).fill(0x796047).roundRect(8, -50, 16, 23, 3).fill(0x9b9b87);
  face.poly([radius + 3, 0, radius + 11, 0, radius + 5, -4]).fill(entity.kind === 'player' ? 0xb2e5df : 0xc3af87);
  for (let i = 0; i < 3; i++)
    stars.star((i - 1) * 14, -62 - (i % 2) * 6, 4, 4, 2).fill(0xffd57a);
  bar.rect(-radius, -66, radius * 2, 4).fill(0x1b1b18);
  health.rect(-radius, -66, radius * 2, 4).fill(0xb26d50);
  flash.ellipse(0, -20, radius * .8, 16).circle(0, -36, radius * .58).fill(0xffffff);
  flash.visible = false;
  if (entity.eliteVariant) {
    body.scale.set(BALANCE.elite.scale);
    silhouette.tint = BALANCE.elite.tint;
  }
  body.addChild(silhouette, weapon, flash, stars);
  container.addChild(body, face, bar, health);
  return {
    container,
    get debug() { return { mode: 'procedural', key: visualKey }; },
    update(state, animation, deltaTime) {
      flash.visible = animation.flash > 0 && !animation.reduced;
      flash.alpha = animation.flash || 0;
      if (animation.frozen) return;
      animation.age += deltaTime;
      if (state.dead)
        animation.deadAge += deltaTime;
      const phase = state.act?.phase, lean = phase === 'windup' ? -3 : phase === 'active' ? 7 : 0;
      const bob = state.moving ? Math.sin(animation.age * 15) * 2 : Math.sin(animation.age * 3) * .6;
      body.position.set(Math.cos(state.facing) * lean, -bob + Math.min(14, animation.deadAge * 20));
      body.rotation = state.staggerLeft > 0 ? Math.sin(animation.age * 25) * .12 : 0;
      weapon.rotation = Math.cos(state.facing) * (phase === 'windup' ? -.3 : phase === 'active' ? .45 : .1);
      face.rotation = state.facing;
      stars.visible = state.staggerLeft > 0;
      stars.rotation = Math.sin(animation.age * 6) * .05;
      body.alpha = state.spawnLeft > 0 ? .45 : .95;
      container.alpha = state.dead ? Math.max(0, 1 - animation.deadAge / .7)
        : state.terminal === 'return_scroll' ? .35 : 1;
      bar.visible = health.visible = state.kind === 'monster' && !state.dead && state.type !== 'scarecrow';
      health.scale.x = Math.max(0, state.hp / state.maxHp);
    },
    destroy() {
      container.removeFromParent();
      container.destroy({ children: true });
    }
  };
}
