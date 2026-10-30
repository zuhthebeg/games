import { createMineLift } from './mine-lift.js';
import {BOSS_TUNING} from '../content/boss-tuning.js';
import { Container, Graphics, Sprite, Texture, Text } from '../../vendor/pixi-8.22.0.min.mjs';
import { drawCursedGround, paintRootGrip } from './skeleton-vfx.js';
import { getTelegraphs } from '../sim/world.js';
import { paintDragonVfx } from './dragon-presentation.js';
import { paintHuntDragonVfx } from './dragon-hunt-presentation.js';
import { shapePath, pattern } from './shapes.js';
import { VisualProvider } from './visual-provider.js';
import { FEEL, impactTier, numberScale, kickEnvelope, AreaImpact } from './feel.js';
import { DANGER_COLORS, MONSTER_VARIANTS } from '../content/monsters.js';
import { ABILITIES, MONSTERS } from '../content/combat.js';
import { presentationWorld } from './visibility.js';
import { paintSpellZones } from './spell-zones.js';
import { healingFeedback } from './healing-feedback.js';
import { SKILL_VFX } from './skill-vfx.js';
import { MasterySkillVfx as SkillVfx } from './mastery-vfx.js';
import { equipmentVisual } from './paperdoll-state.js';
import { masteryLevels } from '../meta/skill-mastery.js';
import { bakeBiome } from './biome-map.js';
import { SceneAssetState } from './scene-asset-state.js';
const clamp = (view, a, b) => Math.max(a, Math.min(b, view));
class IncenseSmoke {
  constructor(layer) {
    this.particles = Array.from({ length: 24 }, () => {
      const node = new Graphics();
      node.visible = false;
      layer.addChild(node);
      return { node, left: 0, total: 0, x: 0, y: 0, drift: 0, source: 0 };
    });
    this.time = 0;
    this.emission = 0;
    this.serial = 0;
  }

  update(dt, reduced) {
    this.time += dt;
    this.emission -= dt;
    const interval = reduced ? 1.1 : .24;
    while (this.emission <= 0) {
      const particle = this.particles.find(item => item.left <= 0);
      if (particle) {
        particle.source = this.serial++ % 2;
        particle.x = (particle.source ? 1207 : 522) + ((this.serial * 17) % 9 - 4);
        particle.y = (particle.source ? 348 : 420) + ((this.serial * 13) % 7 - 3);
        particle.drift = ((this.serial * 19) % 11 - 5) * (reduced ? .35 : 1);
        particle.total = particle.left = reduced ? 5.2 : 3.2;
        particle.node.clear().circle(0, 0, 5).fill({ color: 0x9da3a1, alpha: .42 })
          .circle(0, 0, 10).fill({ color: 0x858c8a, alpha: .12 });
        particle.node.visible = true;
      }
      this.emission += interval;
      if (particle && reduced && this.particles.filter(item => item.left > 0).length >= 4) break;
    }
    for (const particle of this.particles) {
      if (particle.left <= 0) continue;
      particle.left = Math.max(0, particle.left - dt);
      const progress = 1 - particle.left / particle.total;
      particle.node.position.set(particle.x + particle.drift * progress, particle.y - progress * (reduced ? 25 : 60));
      particle.node.scale.set(.65 + progress * .4);
      particle.node.alpha = Math.min(reduced ? .12 : .17, (progress < .18 ? progress / .18 : (1 - progress) / .45) * (reduced ? .12 : .17));
      particle.node.visible = particle.left > 0;
    }
  }

  destroy() {
    for (const particle of this.particles) particle.node.destroy();
    this.particles.length = 0;
  }
}
export class ArenaRenderer {
  constructor(app, provider = new VisualProvider()) {
    this.app = app;
    this.provider = provider;
    this.root = new Container();
    this.root.eventMode = 'none';
    this.layers = {};
    for (const name of ['ground', 'scenery', 'skillFx', 'telegraphs', 'shadows', 'entities', 'projectiles', 'occluder', 'fx', 'partyHp', 'numbers']) {
      const layer = new Container();
      this.layers[name] = layer;
      this.root.addChild(layer);
    }
    this.mineLift = createMineLift(this.layers.scenery);
    this.templeGround = new Sprite(Texture.EMPTY);
    this.templeOccluder = new Sprite(Texture.EMPTY);
    this.templeGround.visible = this.templeOccluder.visible = false;
    this.layers.occluder.addChild(this.templeOccluder);
    const imageAsset = file => async () => {
      const image = new Image();
      image.src = new URL(`../../assets/sprites/scenery/temple/${file}.webp`, import.meta.url);
      await image.decode();
      if (image.naturalWidth !== 1400 || image.naturalHeight !== 860) throw new Error(`Invalid temple ${file} dimensions`);
      return { texture: Texture.from(image) };
    };
    const imageState = (file, sprite) => new SceneAssetState(imageAsset(file),
      asset => asset.texture.destroy(true),
      asset => { sprite.visible = !!asset; sprite.texture = asset?.texture || Texture.EMPTY; });
    this.templeGroundState = imageState('ground', this.templeGround);
    this.templeOccluderState = imageState('occluder', this.templeOccluder);
    this.incense = null;
    this.layers.entities.sortableChildren = true;
    app.stage.addChild(this.root);
    this.warning = new Graphics();
    app.stage.addChild(this.warning);
    this.views = new Map();
    this.projectiles = new Map();
    this.projectilePool = new Map();
    this.telegraphs = [];
    this.telegraphViews = [];
    this.numbers = [];
    this.effects = [];
    this.particles = [];
    this.camera = { x: 308, y: 430 };
    this.scale = 1;
    this.time = 0;
    this.slowLeft = 0;
    this.numberSerial = 0;
    this.burstSerial = 0;
    this.trauma = 0;
    this.reduced = false;
    this.areaImpact = new AreaImpact();
    // Friendly skill graphics stay below authoritative danger outlines/fills.
    this.skillVfx = new SkillVfx(Graphics, this.layers.skillFx);
    // Snapshot-owned ground marks; text distinguishes pickup and return without color.
    this.spellZones = new Graphics();
    this.layers.skillFx.addChild(this.spellZones);
    this.holyWash = new Graphics();
    this.holyWash.visible = false; this.holyWashLeft = 0;
    this.layers.fx.addChild(this.holyWash);
    this.questRing = new Graphics();
    this.layers.skillFx.addChild(this.questRing);
    this.questLabels = ['반납: 입구', '회수: 장부', ''].map(text => {
      const label = new Text({text, style:{fontFamily:'sans-serif',fontSize:18,fill:0xffffff,stroke:{color:0x151814,width:3}}});
      label.anchor.set(.5); this.layers.skillFx.addChild(label); return label;
    });
    this.ground = new Graphics();
    this.layers.ground.addChild(this.ground);
    this.layers.ground.addChild(this.templeGround);
    for (let i = 0; i < FEEL.numbers.cap; i++) {
      const node = new Text({
        text: '',
        style: {
          fontFamily: 'sans-serif',
          fontSize: 18,
          fontWeight: 'bold',
          fill: 0xffffff,
          stroke: { color: 0x151814, width: 3 }
        }
      });
      node.anchor.set(.5);
      node.visible = false;
      this.layers.numbers.addChild(node);
      this.numbers.push({ node, left: 0, x: 0, y: 0, baseScale: 1 });
    }
    for (let i = 0; i < FEEL.effects.cap; i++) {
      const node = new Graphics();
      node.visible = false;
      this.layers.fx.addChild(node);
      this.effects.push({ node, left: 0, total: 0, kind: 'ring' });
    }
    // Stable geometry: bursts only change transforms/alpha, never allocate per hit.
    for (let i = 0; i < FEEL.particles.cap; i++) {
      const dust = i % 4 === 0;
      const node = new Graphics();
      if (dust) node.circle(0, 0, 2).fill(FEEL.colors.dust);
      else node.poly([-3, 0, 0, -1, 4, 0, 0, 1]).fill(0xffffff);
      node.visible = false;
      this.layers.fx.addChild(node);
      this.particles.push({ node, dust, left: 0, total: 0, x: 0, y: 0, vx: 0, vy: 0 });
    }
  }

  reset(world, reduced = false, equipmentSave) {
    this.skillVfx.reset();
    this.holyWash.clear(); this.holyWash.visible = false; this.holyWashLeft = 0;
    this.spellZones.clear();
    if (equipmentSave) {
      this.skillVfx.setMastery(world.entities[0].pid, masteryLevels(equipmentSave));
      this.skillVfx.setEquipment(world.entities[0].pid, equipmentVisual(equipmentSave));
    }
    this.areaImpact.reset();
    for (const view of this.views.values()) {
      view.visual.destroy();
      view.shadow.destroy();
      view.portal.destroy();
      view.bluntCharge.destroy();
      view.sunder.destroy(); view.statusRing.destroy();
      view.footHp?.container.destroy({ children: true });
    }
    this.views.clear();
    this.provider.beginRound?.(world.entities, equipmentSave);
    for (const graphic of this.projectiles.values())
      graphic.destroy();
    this.projectiles.clear();
    for (const pool of this.projectilePool.values())
      for (const graphic of pool)
        graphic.destroy();
    this.projectilePool.clear();
    this.telegraphs = world.telegraphs ?? getTelegraphs(world);
    for (const tg of this.telegraphViews)
      tg.visible = false;
    for (const particle of this.numbers) {
      particle.left = 0;
      particle.node.visible = false;
    }
    for (const effect of this.effects) {
      effect.left = 0;
      effect.node.visible = false;
    }
    this.reduced = reduced;
    for (const particle of this.particles) {
      particle.left = 0;
      particle.node.visible = false;
    }
    this.slowLeft = this.trauma = 0;
    this.numberSerial = this.burstSerial = 0;
    this.camera.x = world.entities[0].x;
    this.camera.y = world.entities[0].y;
    // Dispose the previous map before allocating the next one: never accumulate stage textures.
    if (this.biomeMap) {
      this.biomeMap.sprite.destroy();
      this.biomeMap.texture.destroy(true);
      this.biomeMap = null;
    }
    const { w, h } = world.arena;
    const sanctuary = world.round?.stageId === 'SANCTUARY';
    const legacy = !this.app.renderer || new URLSearchParams(globalThis.location?.search || '').get('biome') === '0';
    this.ground.visible = sanctuary || legacy;
    this.ground.clear();
    if (sanctuary) {
      this.ground.rect(0, 0, w, h).fill(0x171b1a);
    } else if (!legacy) {
      this.biomeMap = bakeBiome(this.app.renderer, world.round?.stageId || 'S1', w, h);
      this.layers.ground.addChild(this.biomeMap.sprite);
    } else {
      const graphic = this.ground;
      graphic.clear().rect(0, 0, w, h).fill(0x202923);
      for (let y = 0; y < h; y += 64)
        for (let x = 0; x < w; x += 64)
          graphic.rect(x + 1, y + 1, 62, 62).fill((x / 64 + y / 64) % 2 ? 0x222b25 : 0x1e2722);
      for (let i = 0; i < 100; i++) {
        const x = (i * 431) % w, y = (i * 167) % h;
        graphic.moveTo(x, y).lineTo(x + 8, y + 3).stroke({ color: 0x394034, width: 1 });
      }
      graphic
        .rect(5, 5, w - 10, h - 10)
        .stroke({ color: 0x716447, width: 10 })
        .rect(18, 18, w - 36, h - 36)
        .stroke({ color: 0x3e493b, width: 2 });
      for (let x = 42; x < w; x += 120)
        graphic.circle(x, 26, 3).circle(x, h - 26, 3).fill(0xae8545);
    }
    this.templeGroundState.reset(sanctuary);
    this.templeOccluderState.reset(sanctuary);
    this.incense?.destroy();
    this.incense = sanctuary ? new IncenseSmoke(this.layers.fx) : null;
    this.mineLift.reset(world.round?.stageId);
    this.snapshot(world);
  }

  leaveSanctuary() {
    this.templeGroundState.reset(false);
    this.templeOccluderState.reset(false);
    this.incense?.destroy();
    this.incense = null;
    this.ground.clear();
  }

  ensure(entity) {
    let view = this.views.get(entity.id);
    const ownerKey = `${entity.kind}|${entity.pid ?? ''}`;
    if (view && view.ownerKey !== ownerKey) {
      view.lastCast = null;
      view.presented?.clear();
      view.ownerKey = ownerKey;
    }
    if (view && !!view.skeletal !== !!entity.skeletal) {
      view.visual.destroy();
      view.visual = this.provider.createVisual(entity);
      this.layers.entities.addChild(view.visual.container);
      view.skeletal = !!entity.skeletal;
    }
    if (view)
      return view;
    const visual = this.provider.createVisual(entity), shadow = new Graphics()
      .ellipse(0, 0, entity.r * 1.15, entity.r * .48)
      .fill({ color: 0x030807, alpha: .5 });
    const portal = new Graphics()
      .ellipse(0, 0, entity.r + 12, (entity.r + 12) * .65)
      .stroke({ color: 0x99dac0, width: 2 })
      .ellipse(0, 0, entity.r + 5, (entity.r + 5) * .65)
      .stroke({ color: 0x627fba, width: 1 });
    this.layers.entities.addChild(visual.container);
    this.layers.shadows.addChild(shadow);
    this.layers.fx.addChild(portal);
    const statusRing = new Graphics(); this.layers.fx.addChild(statusRing);
    const bluntCharge = new Graphics(), sunder = new Graphics()
      .moveTo(-7, -7).lineTo(0, -2).lineTo(-3, 3).lineTo(5, 8)
      .moveTo(0, -2).lineTo(7, -6).stroke({ color: 0xe88e50, width: 3 });
    this.layers.skillFx.addChild(bluntCharge);
    this.layers.fx.addChild(sunder);
    bluntCharge.visible = sunder.visible = false;
    let footHp = null;
    if (entity.kind === 'player') {
      const container = new Container(), bar = new Graphics();
      const label = new Text({ text: '', style: { fontFamily: 'sans-serif', fontSize: 12,
        fontWeight: 'bold', fill: 0xf2fff5, stroke: { color: 0x101915, width: 3 } } });
      label.anchor.set(.5, 0); label.y = 7;
      container.addChild(bar, label); this.layers.partyHp.addChild(container);
      container.visible = false;
      footHp = { container, bar, label, state: '' };
    }
    view = {
      skeletal: !!entity.skeletal, bluntCharge, sunder, footHp, statusRing,
      visual,
      shadow,
      portal,
      prevX: entity.x,
      prevY: entity.y,
      x: entity.x,
      y: entity.y,
      anim: { age: 0, deadAge: 0, hurt: 0, flash: 0, frozen: false, reduced: this.reduced },
      stopLeft: 0, flashLeft: 0, flashAlpha: 0, kickAge: FEEL.kick.life,
      kickX: 0, kickY: 0, trailLeft: 0,
      ownerKey,
      lastCast: null,
      presented: new Map()
    };
    this.views.set(entity.id, view);
    return view;
  }

  snapshot(world) {
    world=presentationWorld(world);
    this.skillVfx.snapshot(world);
    for (const entity of world.entities) {
      const view = this.ensure(entity);
      view.prevX = entity.x;
      view.prevY = entity.y;
    }
    for (const particle of world.projectiles) {
      const graphic = this.projectiles.get(particle.id);
      if (graphic) {
        graphic.prevX = particle.x;
        graphic.prevY = particle.y;
      }
    }
  }

  number(text, x, y, color = 0xffffff, big = false) {
    const particle = this.numbers.find(particle => particle.left <= 0) || this.numbers[0];
    particle.left = FEEL.numbers.life;
    const lane = (this.numberSerial++ % 5) - 2;
    particle.x = x + lane * FEEL.numbers.spread;
    particle.y = y - 42;
    particle.node.text = String(text);
    particle.node.style.fill = color;
    particle.baseScale = typeof big === 'number' ? big : big ? FEEL.numbers.weakScale : 1;
    particle.node.scale.set(particle.baseScale * (this.reduced ? 1 : numberScale(0)));
    particle.node.alpha = 1;
    particle.node.visible = true;
  }

  effect(x, y, r, color, life = .3, kind = 'ring', shape = null, facing = 0, mastery = null) {
    const effect = this.effects.find(effect => effect.left <= 0);
    if (!effect)
      return;
    effect.node.clear();
    if (['slash', 'reverse'].includes(kind) && shape?.type === 'cone') {
      const half = shape.arc * Math.PI / 360;
      effect.node.arc(0, 0, shape.range * .78, -half, half)
        .stroke({ color, width: FEEL.trail.slashWidth, alpha: FEEL.trail.slashAlpha })
        .arc(0, 0, shape.range * .66, kind === 'reverse' ? -half * .8 : -half, kind === 'reverse' ? half : half * .8)
        .stroke({ color, width: 2, alpha: .35 });
    }
    else if (kind === 'thrust')
      effect.node.poly([0, -3, shape.range, 0, 0, 9]).fill({ color, alpha: .55 })
        .moveTo(8, 0).lineTo(shape.range, 0).stroke({ color: 0xf4fff8, width: 5 });
    else if (kind === 'spin')
      effect.node.circle(0, 0, shape.radius).stroke({ color, width: 7, alpha: .8 })
        .arc(0, 0, shape.radius * .72, -.6, 2.5).stroke({ color, width: 3 });
    else if (kind === 'down' || kind === 'up') {
      const direction = kind === 'up' ? -1 : 1;
      effect.node.moveTo(shape.range * .2, -35 * direction).quadraticCurveTo(shape.range, -20 * direction, shape.range * .65, 35 * direction)
        .stroke({ color, width: 8, alpha: .8 }).circle(shape.range * .65, 35 * direction, 5).fill(color);
    }
    else if (shape)
      shapePath(effect.node, shape).fill({ color, alpha: .13 }).stroke({ color, width: 2 });
    else if (kind === 'trail')
      effect.node.ellipse(0, -17, r * .8, r * 1.1).fill({ color, alpha: .28 });
    else
      effect.node.circle(0, 0, r).stroke({ color, width: 2 });
    effect.node.position.set(x, y);
    effect.node.rotation = facing;
    effect.node.visible = true;
    effect.node.alpha = this.reduced ? FEEL.effects.reducedAlpha : 1;
    effect.node.scale.set(1);
    effect.left = effect.total = life + (mastery?.afterglow ? .1 : 0);
    effect.kind = kind;
    effect.mastery = mastery;
    this.skillVfx.decorate(effect.node, mastery, shape, r, color, 0xffdf9c);
  }

  burst(x, y, tier, color, facing = 0) {
    let count = this.reduced ? Math.min(FEEL.particles.reducedCount, tier.sparks) : tier.sparks;
    const phase = this.burstSerial++ * 2.399;
    for (const particle of this.particles) {
      if (count <= 0) break;
      if (particle.left > 0) continue;
      const angle = facing + phase + count * 2.399;
      const speed = FEEL.particles.speed * (.5 + (count % 4) * .2);
      particle.x = x;
      particle.y = y - 22;
      particle.vx = Math.cos(angle) * speed;
      particle.vy = Math.sin(angle) * speed - (particle.dust ? 10 : 25);
      particle.left = particle.total = FEEL.particles.life * (particle.dust ? 1.3 : 1);
      particle.node.position.set(particle.x, particle.y);
      particle.node.rotation = angle;
      particle.node.tint = particle.dust ? 0xffffff : color;
      particle.node.alpha = this.reduced ? FEEL.effects.reducedAlpha : 1;
      particle.node.scale.set(1);
      particle.node.visible = true;
      count--;
    }
  }

  impact(target, source, tier) {
    if (!target) return;
    const view = this.ensure(target);
    // Heavy-poise bosses shrug hits off: no flinch clip, freeze or kick; the hit clip plays only on a real stagger.
    const superArmor = target.kind === 'monster' && MONSTERS[target.type]?.heavyPoise && !target.dead;
    if (!superArmor) view.anim.hurt = FEEL.hurtLife;
    if (this.reduced) return;
    if (!superArmor) view.stopLeft = Math.max(view.stopLeft, tier.stop);
    view.flashLeft = tier === FEEL.impact.kill ? FEEL.flash.killLife : FEEL.flash.life;
    view.flashAlpha = tier === FEEL.impact.kill ? FEEL.flash.killAlpha : FEEL.flash.alpha;
    const angle = source ? Math.atan2(target.y - source.y, target.x - source.x) : target.facing;
    view.kickAge = superArmor ? FEEL.kick.life : 0;
    view.kickX = Math.cos(angle) * tier.kick;
    view.kickY = Math.sin(angle) * tier.kick;
    if (source) {
      const attacker = this.ensure(source);
      attacker.stopLeft = Math.max(attacker.stopLeft, tier.stop);
    }
    const received = target.kind === 'player' ? FEEL.shake.received : 1;
    this.trauma = Math.min(1, this.trauma + tier.trauma * received);
  }

  events(world, events) {
    const hidden=new Set(world.entities.filter(e=>e.id!==world.entities[0]?.id && e.invisibleUntil>world.tick).map(e=>e.id));
    events=events.filter(e=>!hidden.has(e.dst ?? e.id));
    world=presentationWorld(world);
    events = this.skillVfx.events(events, world);
    const areaTiers = this.areaImpact.tiers(events, world);
    this.telegraphs = world.telegraphs ?? getTelegraphs(world);
    for (const event of events) {
      const entity = world.entities.find(entity => entity.id === (event.dst ?? event.id));
      const caster = world.entities.find(e => e.id === (event.src ?? event.presentationOwner));
      const visual = this.skillVfx.visual(this.skillVfx.level(caster, event.ability), event.ability, this.reduced);
      if (!this.reduced && visual.afterglow && caster?.pid === world.entities[0]?.pid && ['hit', 'explode'].includes(event.type))
        this.trauma = Math.min(1, this.trauma + .035);
      if (event.type === 'explode' && event.ability === 'dead_explosion' && !this.reduced) this.trauma=Math.min(1,this.trauma+.65);
      if (this.skillVfx.event(event, world, this.reduced)) continue;
      if (healingFeedback(this, event)) continue;
      if (event.type === 'hit') {
        const tier = areaTiers.get(event) || impactTier(event);
        const source = world.entities.find(candidate => candidate.id === event.src);
        const color = entity?.kind === 'player' ? FEEL.colors.hurt : ABILITIES[event.ability]?.requiresForm === 'blunt' ? 0xe88e50 : event.counter ? FEEL.colors.counter
          : event.crit || event.critical ? FEEL.colors.critical : event.exposed ? FEEL.colors.weak : FEEL.colors.normal;
        this.impact(entity, source, tier);
        const size = event.counter ? FEEL.counter.scale : event.crit || event.critical ? FEEL.numbers.criticalScale : event.exposed ? FEEL.numbers.weakScale : 1;
        this.number(`${event.dmg}${event.exposed || event.counter ? '!' : ''}`, event.x, event.y, color, size);
        this.burst(event.x, event.y, tier, color, source?.facing);
        if (event.counter) {
          this.effect(event.x, event.y, FEEL.counter.ring, FEEL.colors.counter, FEEL.counter.ringLife);
          this.effect(event.x, event.y, FEEL.counter.ring * .55, 0xffffff, FEEL.counter.ringLife * .6);
          if (!this.reduced) this.slowLeft = Math.max(this.slowLeft, FEEL.counter.slow);
        }
      }
      else if (event.type === 'projectileBlocked')
        this.burst(event.x, event.y, FEEL.impact.normal, FEEL.colors.normal);
      else if (event.type === 'projectileClash') {
        this.burst(event.x, event.y, FEEL.impact.weak, 0xfff1c2);
        this.effect(event.x, event.y, 22, 0xfff1c2, .25);
      }
      else if (event.type === 'kill') {
        this.impact(entity, world.entities.find(candidate => candidate.id === event.by), FEEL.impact.kill);
        this.burst(event.x, event.y, FEEL.impact.kill, FEEL.colors.weak);
        this.effect(event.x, event.y, 28, 0xd3b878);
      }
      else if (event.type === 'explode') {
        this.effect(event.x, event.y, event.radius, 0xffaf56, .4);
        if (event.ability === 'meteor') {
          this.effect(event.x, event.y, event.radius * .65, 0xffe2a2, .6);
          this.burst(event.x, event.y, FEEL.impact.kill, 0xd8aa78);
        }
      }
      else if (event.type === 'counter' && entity) {
        this.number(event.ability === 'shield_bash' ? '방패 강타!' : '반격!', entity.x, entity.y - 22, FEEL.colors.counter, FEEL.counter.scale);
        this.effect(entity.x, entity.y, FEEL.perfect.radius * 1.4, FEEL.colors.counter, FEEL.perfect.ringLife);
      }
      else if (event.type === 'perfectDodge' && entity) {
        this.slowLeft = this.reduced ? 0 : FEEL.perfect.life;
        this.number(event.kind === 'block' ? '완벽 막기' : event.kind === 'blink' ? '점멸' : '완벽 회피', entity.x, entity.y, FEEL.colors.perfect, true);
        this.effect(entity.x, entity.y, FEEL.perfect.radius, FEEL.colors.perfect, FEEL.perfect.ringLife);
      }
      else if (event.type === 'potion' && entity)
        this.number(`+${Math.max(1, Math.round(event.heal))}`, entity.x, entity.y, 0xa5d894);
      else if (event.type === 'manaPotion' && entity)
        this.number(`MP +${event.gain}`, entity.x, entity.y, 0x8abfe0);
      else if (event.type === 'drop') {
        this.effect(event.x, event.y, 19, 0xecc875, 0.6);
        this.number(event.rejected ? '짐이 가득하다' : `+${event.gold} G · 전리품 ${event.picked.length}`,
          event.x, event.y - 18, 0xecc875);
      }
    }
  }

  aim(x, y, vector) {
    const particle = this.local;
    if (!particle)
      return;
    vector.aimX = (x - this.root.x) / this.scale - particle.x;
    vector.aimY = (y - this.root.y) / this.scale - particle.y;
  }

  castIdentity(act, world, castStartOverride) {
    if (!act) return null;
    const key = `${act.id}|${act.step ?? 0}|${!!act.counter}`;
    const domain = act.presentationSeq !== undefined && act.presentationSeq !== null
      && !Number.isFinite(act.presentationAuthorityStart) ? 'predicted' : 'authority';
    const castStart = Number.isFinite(act.presentationAuthorityStart) ? act.presentationAuthorityStart
      : Number.isFinite(castStartOverride) ? castStartOverride
        : Number.isFinite(act.castTick) ? act.castTick
          : Number.isFinite(act.elapsed) ? (world.tick ?? 0) - act.elapsed : world.tick ?? 0;
    const tokens = [];
    if (act.presentationSeq !== undefined && act.presentationSeq !== null) tokens.push(`seq:${act.presentationSeq}`);
    if (Number.isFinite(act.presentationAuthorityStart)) tokens.push(`auth:${act.presentationAuthorityStart}`);
    tokens.push(`cast:${key}@${domain}:${castStart}`);
    return { key, domain, castStart, tokens, positionTick: world.positionTick ?? world.tick ?? 0 };
  }
  sameCastIdentity(first, second) {
    return !!first && !!second && first.key === second.key && first.domain === second.domain
      && Math.abs(first.castStart - second.castStart) <= 2;
  }
  hasPresentedCast(view, identity) {
    if (!identity) return false;
    if (identity.tokens.some(token => view.presented.has(token))) return true;
    return [...view.presented.values()].some(row => row.key === identity.key && row.domain === identity.domain
      && Math.abs(row.castStart - identity.castStart) <= 2);
  }
  rememberPresentedCast(view, identity) {
    for (const token of identity.tokens)
      view.presented.set(token, { key: identity.key, domain: identity.domain, castStart: identity.castStart,
        positionTick: identity.positionTick });
  }
  prunePresentedCasts(view, world) {
    const positionTick = world.positionTick ?? world.tick ?? 0;
    for (const [token, row] of view.presented)
      if (positionTick - row.positionTick > 60) view.presented.delete(token);
  }
  presentTrailForAct(world, entity, view, act, castStartOverride) {
    const identity = this.castIdentity(act, world, castStartOverride);
    if (!identity || entity.kind !== 'player' || !act.def?.shape || act.def.heal || SKILL_VFX[act.id]
      || this.hasPresentedCast(view, identity)) return false;
    const blunt = act.def.requiresForm === 'blunt' || (act.step && entity.weaponForm === 'blunt');
    const visual = this.skillVfx.visual(this.skillVfx.level(entity, act.id), act.id, this.reduced);
    this.effect(view.x, view.y, 0, blunt ? 0xe88e50 : 0xc9ece3, FEEL.trail.life,
      act.def.comboTrail || (blunt ? 'blunt' : 'slash'), act.def.shape, act.facing, visual);
    if (visual.extraParticles) this.burst(view.x, view.y,
      { ...FEEL.impact.normal, sparks: visual.extraParticles }, 0xe88e50, act.facing);
    this.rememberPresentedCast(view, identity);
    return true;
  }
  presentPassedActs(world, entity, view) {
    this.prunePresentedCasts(view, world);
    if (entity.id === this.local?.id) return;
    for (const passed of world.passedActs || []) {
      if (passed.entityId !== entity.id) continue;
      const act = passed.act;
      const castStart = Number.isFinite(passed.castStart) ? passed.castStart
        : Number.isFinite(act?.castTick) ? act.castTick : world.tick - (act?.elapsed || 0);
      const identity = this.castIdentity(act, world, castStart);
      const sampled = this.castIdentity(entity.act, world);
      if (this.sameCastIdentity(identity, sampled)) continue;
      this.presentTrailForAct(world, entity, view, act, castStart);
    }
  }

  render(world, alpha, deltaTime) {
    world=presentationWorld(world);
    this.local = world.entities[0];
    this.time += deltaTime;
    this.mineLift.update(deltaTime, this.reduced);
    this.incense?.update(deltaTime, this.reduced);
    const visualDelta = deltaTime * (this.slowLeft > 0 && !this.reduced ? FEEL.perfect.scale : 1);
    this.slowLeft = Math.max(0, this.slowLeft - deltaTime);
    this.trauma = Math.max(0, this.trauma - deltaTime * FEEL.shake.decay);
    const screenWidth = this.app.screen.width, screenHeight = this.app.screen.height;
    this.scale = screenWidth < 600 ? .72 : Math.min(1, screenHeight / 700);
    this.root.scale.set(this.scale);
    const halfWidth = screenWidth / this.scale / 2, halfHeight = screenHeight / this.scale / 2;
    const targetX = world.arena.w < halfWidth * 2 ? world.arena.w / 2
      : clamp(this.local.x, halfWidth, world.arena.w - halfWidth);
    const targetY = world.arena.h < halfHeight * 2 ? world.arena.h / 2
      : clamp(this.local.y, halfHeight, world.arena.h - halfHeight);
    this.camera.x += (targetX - this.camera.x) * (1 - Math.exp(-deltaTime * 9));
    this.camera.y += (targetY - this.camera.y) * (1 - Math.exp(-deltaTime * 9));
    this.camera.x = world.arena.w < halfWidth * 2 ? world.arena.w / 2
      : clamp(this.camera.x, halfWidth, world.arena.w - halfWidth);
    this.camera.y = world.arena.h < halfHeight * 2 ? world.arena.h / 2
      : clamp(this.camera.y, halfHeight, world.arena.h - halfHeight);
    const shake = this.reduced ? 0 : this.trauma * this.trauma;
    this.root.position.set(
      screenWidth / 2 - this.camera.x * this.scale + Math.sin(this.time * FEEL.shake.frequencyX) * shake * FEEL.shake.maxX,
      screenHeight / 2 - this.camera.y * this.scale + Math.sin(this.time * FEEL.shake.frequencyY) * shake * FEEL.shake.maxY,
    );
    this.holyWashLeft = Math.max(0, this.holyWashLeft - deltaTime);
    this.holyWash.clear();
    this.holyWash.visible = !this.reduced && this.holyWashLeft > 0;
    if (this.holyWash.visible) this.holyWash.rect(this.camera.x-halfWidth, this.camera.y-halfHeight, halfWidth*2, halfHeight*2)
      .fill({color:0xffedbb,alpha:.045*this.holyWashLeft/.16});
    const objective = world.round?.objective;
    this.questRing.clear();
    this.questLabels.forEach(label => { label.visible = false; });
    if (objective?.kind === 'kill-target') {
      const target = world.entities.find(e => e.id === objective.targetId);
      if (target && objective.state !== 'complete') {
        this.questRing.circle(target.x,target.y,target.r+12).stroke({color:0xf5df9b,width:3});
        this.questLabels[0].visible = true; this.questLabels[0].text = '대상: 가고일';
        this.questLabels[0].position.set(target.x,target.y-target.r-28);
      }
    } else if (objective?.kind === 'visit-markers') {
      for (const [i,pos] of objective.markers.entries()) {
        const done = !!(objective.visited & (1 << i)), label = this.questLabels[i];
        this.questRing.circle(pos.x,pos.y,objective.radius).stroke({color:done ? 0xa1ddb3 : 0xf5df9b,width:3});
        label.visible = true; label.text = `표식: ${i+1}${done ? ' ✓' : ''}`;
        label.position.set(pos.x,pos.y-objective.radius-16);
      }
    } else if (objective && objective.state !== 'complete') {
      for (const [i, pos] of [objective.entry, objective.token].entries()) {
        this.questRing.circle(pos.x, pos.y, objective.radius).stroke({color:0xf5df9b,width:3});
        this.questLabels[i].visible = true;
        this.questLabels[i].position.set(pos.x, pos.y-objective.radius-16);
      }
      this.questLabels[0].text = '반납: 입구';
      this.questLabels[1].text = objective.carrier !== null ? '운반: 장부' : '회수: 장부';
    }
    for (const drop of world.lootDrops || []) this.questRing.circle(drop.x, drop.y, 12).fill({color:0xf5df9b,alpha:.8}).circle(drop.x,drop.y,48).stroke({color:0xf5df9b,width:1,alpha:.5});
    for (const entity of world.entities) {
      const view = this.ensure(entity);
      const frozen = view.stopLeft > 0 && !this.reduced;
      view.stopLeft = Math.max(0, view.stopLeft - deltaTime);
      if (!frozen) {
        view.x = view.prevX + (entity.x - view.prevX) * alpha;
        view.y = view.prevY + (entity.y - view.prevY) * alpha;
      }
      this.presentPassedActs(world, entity, view);
      const kick = this.reduced ? 0 : kickEnvelope(view.kickAge);
      if (!frozen) view.kickAge = Math.min(FEEL.kick.life, view.kickAge + visualDelta);
      view.visual.container.position.set(view.x + view.kickX * kick, view.y + view.kickY * kick);
      // Match authored sim boss identity; scale the outer visual once, including lazy atlas swaps.
      // Apply the current-size tuning exactly once; collision radius is tuned at spawn.
      const bossScale = (entity.kind === 'monster' && (entity.boss || MONSTERS[entity.type]?.boss
        || entity.type === 'goblin_chief' || MONSTER_VARIANTS[entity.type]?.speciesTags.includes('boss')) ? 2 : 1) * (entity.kind === 'monster' ? BOSS_TUNING[entity.type]?.size || 1 : 1);
      view.visual.container.scale.set(bossScale * (1 + kick * FEEL.kick.squash), bossScale * (1 - kick * FEEL.kick.squash));
      view.visual.container.zIndex = view.y;
      view.shadow.position.set(view.x, view.y);
      if (view.footHp) {
        const hp = view.footHp;
        hp.container.visible = entity.id !== this.local.id && entity.team === this.local.team;
        hp.container.position.set(view.x, view.y + entity.r * .48 + 6 / this.scale);
        // Keep a compact 56px bar and readable 12px text on mobile, independent of camera zoom.
        hp.container.scale.set(1 / this.scale);
        const maxHp = Math.max(1, Math.round(entity.maxHp || 1));
        const current = entity.dead || entity.terminal === 'death' ? 0 : Math.max(0, Math.min(maxHp, Math.round(entity.hp || 0)));
        const state = entity.dead || entity.terminal === 'death' ? '쓰러짐' : entity.terminal ? '귀환' : '';
        const text = `${current}/${maxHp}${state ? ` · ${state}` : ''}`;
        if (hp.state !== text) {
          hp.state = text; hp.label.text = text;
          hp.bar.clear().roundRect(-29, -1, 58, 7, 2).fill({color:0x08120e,alpha:.9})
            .roundRect(-28, 0, 56 * current / maxHp, 5, 1).fill(current / maxHp <= .3 ? 0xe19b6d : 0x79dca0);
        }
      }
      view.shadow.alpha = entity.dead ? Math.max(0, 1 - view.anim.deadAge / .7) : 1;
      view.anim.frozen = frozen || entity.frozenUntil > world.tick;
      view.holyLeft = Math.max(0, (view.holyLeft || 0) - deltaTime);
      view.anim.flash = this.reduced || view.flashLeft <= 0 ? 0 : view.flashAlpha;
      if (view.holyLeft > 1 && !this.reduced) view.anim.flash = 1;
      view.flashLeft = Math.max(0, view.flashLeft - deltaTime);
      if (view.stealthAlpha) {view.visual.container.alpha=1;view.stealthAlpha=false;}
      if (view.holyFade) { view.visual.container.alpha = 1; view.holyFade = false; }
      view.visual.update(entity, view.anim, view.anim.frozen ? 0 : visualDelta);
      if (view.holyLeft > 0 && entity.dead) { view.visual.container.alpha *= Math.min(1, view.holyLeft / .9); view.holyFade = true; }
      if (entity.invisibleUntil>world.tick) {view.visual.container.alpha*=.32;view.stealthAlpha=true;}
      if (entity.invisibleUntil>world.tick) view.shadow.alpha=.18;
      if (!frozen) view.anim.hurt = Math.max(0, view.anim.hurt - visualDelta);
      view.portal.position.set(entity.x, entity.y);
      view.portal.visible = entity.spawnLeft > 0;
      view.portal.alpha = (entity.spawnLeft || 0) / 21;
      view.portal.scale.set(1 + (21 - (entity.spawnLeft || 0)) * .02);
      view.trailLeft = Math.max(0, view.trailLeft - deltaTime);
      if (entity.kind === 'player' && entity.dodge.dashLeft > 0 && !frozen && view.trailLeft <= 0) {
        this.effect(view.x, view.y, entity.r, 0x9dd4cd, FEEL.trail.life, 'trail');
        view.trailLeft = FEEL.trail.dodgeInterval;
      }
      const poison=entity.poison?.left>0, rooted=entity.rootUntil>world.tick;
      const ice = entity.frozenUntil > world.tick, fire = entity.burn?.expiresTick > world.tick, shield = entity.shieldUntil > world.tick, cursed=entity.curse?.expiresTick>world.tick, rage=entity.berserk?.expiresTick>world.tick;
      view.statusRing.clear(); view.statusRing.position.set(view.x, view.y);
      view.statusRing.visible = !entity.dead && (ice || fire || shield || cursed || rage || poison || rooted);
      if (poison) {view.statusRing.ellipse(0,1,entity.r+5,(entity.r+5)*.45).stroke({color:0x81d74a,width:3,alpha:.85});for(const x of [-9,0,9])view.statusRing.circle(x,-entity.r*1.7-5-Math.abs(x)*.3,3).fill({color:0xa6ec67,alpha:.9});}
      if (paintRootGrip(view.statusRing,view,entity,world.tick,this.reduced,world.round?.state && world.round.state!=='running')) view.statusRing.visible=true;
      if (cursed) view.statusRing.moveTo(-9,-entity.r-19).lineTo(9,-entity.r-1).moveTo(9,-entity.r-19).lineTo(-9,-entity.r-1).stroke({color:0xbc85e3,width:4});
      if (rage) view.statusRing.ellipse(0,0,entity.r+7,(entity.r+7)*.55).stroke({color:0xf17b60,width:4}).moveTo(-8,-entity.r-6).lineTo(0,-entity.r-18).lineTo(8,-entity.r-6).stroke({color:0xf17b60,width:3});
      if (shield) view.statusRing.ellipse(0, -entity.r * .6, entity.r + 9, entity.r * 1.6).fill({color:0x73baf0,alpha:.12}).stroke({color:0xa8dafa,width:2,alpha:.8});
      // Static shield-shaped pips: no motion, shared host/snapshot state, at most three.
      if (shield) for (let i = 0, n = Math.min(3, entity.shieldCharges ?? 1); i < n; i++) {
        const x = (i - (n - 1) / 2) * 10, y = -entity.r * 2.3 - 6;
        view.statusRing.poly([x-3,y-4,x+3,y-4,x+3,y+1,x,y+4,x-3,y+1]).fill({color:0xc9e9fa}).stroke({color:0x38556c,width:1});
      }
      if (ice) view.statusRing.poly([-entity.r-6,0,-entity.r,-entity.r*2,0,-entity.r*2-8,entity.r,-entity.r*2,entity.r+6,0,0,6]).fill({color:0x8cddf0,alpha:.28}).stroke({color:0xb5f0ff,width:2});
      if (fire) for (const offset of [-10,0,10]) view.statusRing.moveTo(offset-4,-2).quadraticCurveTo(offset-8,-12,offset,-20).quadraticCurveTo(offset+8,-9,offset+4,-2).fill({color:0xf8a75e,alpha:.8});
      view.sunder.visible = !entity.dead && entity.sunder?.expiresTick > world.tick;
      view.sunder.position.set(view.x, view.y - entity.r - 18);
      const blunt = entity.kind === 'player' && (entity.act?.def.requiresForm === 'blunt' || (entity.act?.step && entity.weaponForm === 'blunt'));
      view.bluntCharge.visible = blunt && entity.act.phase === 'windup';
      if (view.bluntCharge.visible) {
        view.bluntCharge.clear();
        shapePath(view.bluntCharge, entity.act.def.shape).fill({ color: 0xa77850, alpha: .08 })
          .stroke({ color: 0xe88e50, width: 2, alpha: .65 });
        view.bluntCharge.position.set(entity.x, entity.y);
        view.bluntCharge.rotation = entity.act.facing;
        const visual = this.skillVfx.visual(this.skillVfx.level(entity, entity.act.id), entity.act.id, this.reduced);
        view.bluntCharge.scale.set(1);
        this.skillVfx.decorate(view.bluntCharge, visual, entity.act.def.shape, 0, 0xe88e50, 0xffdf9c);
        view.bluntCharge.alpha = Math.min(1, .65 * visual.brightness);
      }
      const act = entity.act, active = act?.phase === 'active';
      const presentationSeq = act?.presentationSeq;
      const activeKey = act
        ? (presentationSeq !== undefined ? `seq:${presentationSeq}`
          : Number.isFinite(act.presentationAuthorityStart) ? `auth:${act.presentationAuthorityStart}` : `${act.id}|${act.step ?? 0}`)
        : null;
      const elapsed = Number.isFinite(act?.elapsed) ? act.elapsed : 0;
      const castStart = act
        ? (Number.isFinite(act.presentationAuthorityStart) ? act.presentationAuthorityStart
          : Number.isFinite(act.castTick) ? act.castTick : world.tick - elapsed)
        : null;
      const sameCast = !!act && view.lastCast && view.lastCast.key === activeKey
        && (presentationSeq !== undefined
          || (elapsed >= view.lastCast.elapsed && Math.abs(castStart - view.lastCast.castStart) <= 4));
      let cast = sameCast ? view.lastCast : null;
      if (act && !cast) cast = { key: activeKey, castStart, elapsed, seenActive: false, trailFired: false };
      const canTrail = entity.kind === 'player' && !!activeKey && act.def.shape && !act.def.heal && !SKILL_VFX[act.id];
      const fireTrail = () => {
        this.presentTrailForAct(world, entity, view, act, castStart);
        cast.trailFired = true;
      };
      if (act) {
        if (active) {
          if (canTrail && !cast.trailFired) fireTrail();
          cast.seenActive = true;
        } else if (act.phase === 'recovery' && canTrail && !cast.seenActive && !cast.trailFired) {
          const phases = act.phaseTicks || {};
          const recoveryElapsed = elapsed - (phases.windup || 0) - (phases.lock || 0) - (phases.active || 0);
          const positionTick = world.positionTick ?? world.tick ?? 0;
          const stale = Number.isFinite(castStart) && positionTick - castStart > 12;
          if (recoveryElapsed >= 0 && !stale) fireTrail();
        }
        cast.key = activeKey;
        cast.castStart = castStart;
        cast.elapsed = elapsed;
        view.lastCast = cast;
      }
    }
    // Roster departures remove views, not just the authoritative entity.
    const liveIds = new Set(world.entities.map(e => e.id));
    for (const [id, view] of this.views) if (!liveIds.has(id)) {
      view.visual.destroy(); view.shadow.destroy(); view.portal.destroy(); view.bluntCharge.destroy(); view.sunder.destroy(); view.statusRing.destroy(); view.footHp?.container.destroy({ children: true }); this.views.delete(id);
    }
    paintSpellZones(this.spellZones, world, this.reduced);
    // Telegraph origin remains authoritative (no camera/animation lunge baked into geometry).
    const telegraphViews = this.telegraphs;
    this.warning.clear();
    for (let i = 0; i < telegraphViews.length; i++) {
      const telegraph = telegraphViews[i];
      let graphic = this.telegraphViews[i];
      if (!graphic) {
        graphic = new Graphics();
        this.layers.telegraphs.addChild(graphic);
        this.telegraphViews.push(graphic);
      }
      graphic.visible = true;
      graphic.position.set(telegraph.ox, telegraph.oy);
      graphic.rotation = telegraph.facing + (telegraph.shape.facingOffsetDeg || 0) * Math.PI / 180;
      const locked = telegraph.phase !== 'windup', color = locked ? DANGER_COLORS.active : DANGER_COLORS.preparation;
      // Geometry changes at sim snapshots, not at 60Hz interpolated sprite frames.
      if (graphic.telegraph !== telegraph) {
        graphic.clear();
        if(telegraph.ability==='cursed_hands'){
          drawCursedGround(graphic,telegraph.shape.radius,telegraph.progress,this.reduced);
        } else {
        shapePath(graphic, telegraph.shape).fill({ color, alpha: locked ? .27 : .07 })
          .stroke({ color, width: telegraph.major ? 4 : 2, alpha: 1 });
        if (!locked && telegraph.progress > 0)
          shapePath(graphic, telegraph.shape, telegraph.progress).fill({ color, alpha: .24 });
        pattern(graphic, telegraph.shape, color, locked);
        paintDragonVfx(graphic, telegraph, world.tick, this.reduced);
        paintHuntDragonVfx(graphic, telegraph, world.tick, this.reduced);
        }
        graphic.telegraph = telegraph;
      }
      const x = telegraph.ox * this.scale + this.root.x, y = telegraph.oy * this.scale + this.root.y;
      if (x < 20 || x > screenWidth - 20 || y < 90 || y > screenHeight - 160) {
        const angle = Math.atan2(y - screenHeight / 2, x - screenWidth / 2);
        const warningX = clamp(x, 22, screenWidth - 22);
        const warningY = clamp(y, 95, screenHeight - 170);
        this.warning.save()
          .translateTransform(warningX, warningY)
          .rotateTransform(angle)
          .poly([10, 0, -7, -7, -7, 7])
          .fill(color)
          .stroke({ color: 0x111711, width: 2 })
          .restore();
      }
    }
    for (let i = telegraphViews.length; i < this.telegraphViews.length; i++)
      this.telegraphViews[i].visible = false;
    for (const [id, graphic] of this.projectiles)
      graphic.visible = false;
    for (const particle of world.projectiles) {
      if (SKILL_VFX[particle.abilityId]?.projectileRadius) continue; // Fixed core/history pool owns this profile.
      let graphic = this.projectiles.get(particle.id);
      if (!graphic) {
        const poolKey = `${particle.abilityId}/${particle.step || 0}/${particle.r}`;
        const pool = this.projectilePool.get(poolKey);
        graphic = pool?.pop();
        if (!graphic) {
          graphic = new Graphics();
          const abilityId = particle.abilityId;
          if (ABILITIES[abilityId]?.family === 'bow' && !ABILITIES[abilityId].element)
            graphic
              .moveTo(-FEEL.trail.tailLength, 0).lineTo(-12, 0)
              .stroke({ color: 0xd2c497, width: 3, alpha: FEEL.trail.tailAlpha })
              .moveTo(-16, 0)
              .lineTo(7, 0)
              .stroke({ color: 0xe5d4a0, width: 2 })
              .poly([7, 0, 1, -4, 1, 4])
              .fill(0xe6e5ce);
          else if (abilityId === 'sling_stone')
            graphic.circle(0, 0, particle.r).fill(0xa29c86).circle(-2, -2, 2).fill(0xc9c5b3);
          else {
            const element = ABILITIES[abilityId]?.element;
            const color = element === 'fire' ? 0xff9856 : element === 'frost' ? 0x9fd8ff : 0xa5e8ef;
            graphic
              .poly([-(particle.step === 3 ? FEEL.trail.tailLength * 1.8 : FEEL.trail.tailLength), 0, -3, -particle.r * .6, -3, particle.r * .6])
              .fill({ color, alpha: FEEL.trail.tailAlpha })
              .circle(0, 0, particle.r * 1.8)
              .fill({ color, alpha: .15 })
              .circle(0, 0, particle.r)
              .fill({ color, alpha: .7 })
              .circle(-2, -2, particle.r * .4)
              .fill(0xfff5dc);
            graphic.blendMode = 'add';
          }
          graphic.ability = particle.abilityId;
          graphic.poolKey = poolKey;
          this.layers.projectiles.addChild(graphic);
        }
        graphic.prevX = particle.x;
        graphic.prevY = particle.y;
        graphic.position.set(particle.x, particle.y);
        this.projectiles.set(particle.id, graphic);
      }
      graphic.visible = true;
      graphic.alpha = particle.presentationAlpha ?? 1;
      graphic.position.set(
        graphic.prevX + (particle.x - graphic.prevX) * alpha,
        graphic.prevY + (particle.y - graphic.prevY) * alpha,
      );
      graphic.rotation = Math.atan2(particle.vy, particle.vx);
    }
    for (const [id, graphic] of this.projectiles)
      if (!graphic.visible) {
        let pool = this.projectilePool.get(graphic.poolKey);
        if (!pool) {
          pool = [];
          this.projectilePool.set(graphic.poolKey, pool);
        }
        pool.push(graphic);
        this.projectiles.delete(id);
      }
    this.skillVfx.update(world, alpha, visualDelta, this.reduced);
    for (const particle of this.numbers) {
      if (particle.left <= 0)
        continue;
      particle.left -= visualDelta;
      particle.node.visible = particle.left > 0;
      const age = FEEL.numbers.life - particle.left;
      particle.node.position.set(particle.x, particle.y - (1 - (1 - age / FEEL.numbers.life) ** 2) * FEEL.numbers.rise);
      particle.node.scale.set(particle.baseScale * (this.reduced ? 1 : numberScale(age)));
      particle.node.alpha = Math.min(1, particle.left * 4);
    }
    for (const effect of this.effects) {
      if (effect.left <= 0)
        continue;
      effect.left -= visualDelta;
      effect.node.visible = effect.left > 0;
      effect.node.alpha = Math.max(0, effect.left / effect.total) * (this.reduced ? FEEL.effects.reducedAlpha : 1);
      effect.node.scale.set(effect.kind === 'ring' ? 1 + (1 - effect.left / effect.total) * FEEL.effects.ringGrow : 1);
      this.skillVfx.enhance(effect.node, effect.mastery);
    }
    for (const particle of this.particles) {
      if (particle.left <= 0) continue;
      particle.left -= visualDelta;
      particle.node.visible = particle.left > 0;
      particle.x += particle.vx * visualDelta;
      particle.y += particle.vy * visualDelta;
      particle.vy += FEEL.particles.gravity * visualDelta;
      particle.node.position.set(particle.x, particle.y);
      particle.node.alpha = Math.max(0, particle.left / particle.total) * (this.reduced ? FEEL.effects.reducedAlpha : 1);
      particle.node.scale.set(particle.dust ? 1 + (1 - particle.left / particle.total) : 1);
    }
  }
}
