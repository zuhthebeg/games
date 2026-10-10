import { Container, Graphics, Text } from '../../vendor/pixi-8.22.0.min.mjs';
import { getTelegraphs } from '../sim/world.js';
import { shapePath, pattern } from './shapes.js';
import { VisualProvider } from './visual-provider.js';
const clamp = (view, a, b) => Math.max(a, Math.min(b, view));
export class ArenaRenderer {
  constructor(app, provider = new VisualProvider()) {
    this.app = app;
    this.provider = provider;
    this.root = new Container();
    this.root.eventMode = 'none';
    this.layers = {};
    for (const name of ['ground', 'telegraphs', 'shadows', 'entities', 'projectiles', 'fx', 'numbers']) {
      const layer = new Container();
      this.layers[name] = layer;
      this.root.addChild(layer);
    }
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
    this.camera = { x: 308, y: 430 };
    this.scale = 1;
    this.time = 0;
    this.stopLeft = 0;
    this.trauma = 0;
    this.reduced = false;
    this.ground = new Graphics();
    this.layers.ground.addChild(this.ground);
    for (let i = 0; i < 32; i++) {
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
      this.numbers.push({ node, left: 0, x: 0, y: 0 });
    }
    for (let i = 0; i < 40; i++) {
      const node = new Graphics();
      node.visible = false;
      this.layers.fx.addChild(node);
      this.effects.push({ node, left: 0, total: 0, kind: 'ring' });
    }
  }

  reset(world, reduced = false) {
    for (const view of this.views.values()) {
      view.visual.destroy();
      view.shadow.destroy();
      view.portal.destroy();
    }
    this.views.clear();
    for (const graphic of this.projectiles.values())
      graphic.destroy();
    this.projectiles.clear();
    for (const pool of this.projectilePool.values())
      for (const graphic of pool)
        graphic.destroy();
    this.projectilePool.clear();
    this.telegraphs = getTelegraphs(world);
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
    this.stopLeft = this.trauma = 0;
    this.camera.x = world.entities[0].x;
    this.camera.y = world.entities[0].y;
    const { w, h } = world.arena, graphic = this.ground;
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
    this.snapshot(world);
  }

  ensure(entity) {
    let view = this.views.get(entity.id);
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
    view = {
      visual,
      shadow,
      portal,
      prevX: entity.x,
      prevY: entity.y,
      x: entity.x,
      y: entity.y,
      anim: { age: 0, deadAge: 0, hurt: 0, reduced: this.reduced },
      lastAct: null
    };
    this.views.set(entity.id, view);
    return view;
  }

  snapshot(world) {
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
    particle.left = .8;
    particle.x = x;
    particle.y = y - 42;
    particle.node.text = String(text);
    particle.node.style.fill = color;
    particle.node.scale.set(big ? 1.25 : 1);
    particle.node.visible = true;
  }

  effect(x, y, r, color, life = .3, kind = 'ring', shape = null, facing = 0) {
    const effect = this.effects.find(effect => effect.left <= 0);
    if (!effect)
      return;
    effect.node.clear();
    if (shape)
      shapePath(effect.node, shape).fill({ color, alpha: .13 }).stroke({ color, width: 2 });
    else if (kind === 'trail')
      effect.node.ellipse(0, -17, r * .8, r * 1.1).fill({ color, alpha: .28 });
    else
      effect.node.circle(0, 0, r).stroke({ color, width: 2 });
    effect.node.position.set(x, y);
    effect.node.rotation = facing;
    effect.node.visible = true;
    effect.left = effect.total = life;
    effect.kind = kind;
  }

  events(world, events) {
    this.telegraphs = getTelegraphs(world);
    for (const event of events) {
      const entity = world.entities.find(entity => entity.id === (event.dst ?? event.id));
      if (event.type === 'hit') {
        this.ensure(entity).anim.hurt = .08;
        this.number(event.dmg, event.x, event.y, event.exposed ? 0xffd16b : 0xffffff, event.exposed);
        this.effect(event.x, event.y - 18, 12, 0xffeac1, .16);
        if (event.dmg >= 20 || event.exposed) {
          this.stopLeft = Math.max(this.stopLeft, .05);
          this.trauma = Math.min(1, this.trauma + .28);
        }
      }
      else if (event.type === 'kill') {
        this.stopLeft = Math.max(this.stopLeft, .065);
        this.trauma = Math.min(1, this.trauma + .35);
        this.effect(event.x, event.y, 28, 0xd3b878);
      }
      else if (event.type === 'explode')
        this.effect(event.x, event.y, event.radius, 0xffaf56, .4);
      else if (event.type === 'perfectDodge') {
        this.number('완벽 회피', entity.x, entity.y, 0xa9ffef, true);
        this.effect(entity.x, entity.y, 30, 0xbcffee, .25);
      }
      else if (event.type === 'potion')
        this.number(`+${event.heal}`, entity.x, entity.y, 0xa5d894);
      else if (event.type === 'manaPotion')
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

  render(world, alpha, deltaTime) {
    this.local = world.entities[0];
    this.time += deltaTime;
    const frozen = this.stopLeft > 0 && !this.reduced;
    this.stopLeft = Math.max(0, this.stopLeft - deltaTime);
    this.trauma = Math.max(0, this.trauma - deltaTime * 2.7);
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
    const shake = this.reduced ? 0 : 4 * this.trauma * this.trauma;
    this.root.position.set(
      screenWidth / 2 - this.camera.x * this.scale + Math.sin(this.time * 61) * shake,
      screenHeight / 2 - this.camera.y * this.scale + Math.sin(this.time * 79) * shake,
    );
    for (const entity of world.entities) {
      const view = this.ensure(entity);
      if (!frozen) {
        view.x = view.prevX + (entity.x - view.prevX) * alpha;
        view.y = view.prevY + (entity.y - view.prevY) * alpha;
      }
      view.visual.container.position.set(view.x, view.y);
      view.visual.container.zIndex = view.y;
      view.shadow.position.set(view.x, view.y);
      view.shadow.alpha = entity.dead ? Math.max(0, 1 - view.anim.deadAge / .7) : 1;
      view.anim.hurt = Math.max(0, view.anim.hurt - deltaTime);
      view.visual.update(entity, view.anim, frozen ? 0 : deltaTime);
      view.portal.position.set(entity.x, entity.y);
      view.portal.visible = entity.spawnLeft > 0;
      view.portal.alpha = (entity.spawnLeft || 0) / 21;
      view.portal.scale.set(1 + (21 - (entity.spawnLeft || 0)) * .02);
      if (entity.kind === 'player' && entity.dodge.dashLeft > 0 && !frozen)
        this.effect(view.x, view.y, entity.r, 0x9dd4cd, .14, 'trail');
      const active = entity.act?.phase === 'active';
      if (entity.kind === 'player' && active && entity.act.def.shape && view.lastAct !== entity.act) {
        this.effect(entity.x, entity.y, 0, 0xc9ece3, .14, 'slash', entity.act.def.shape, entity.act.facing);
        view.lastAct = entity.act;
      }
      if (!entity.act)
        view.lastAct = null;
    }
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
      graphic.clear().position.set(telegraph.ox, telegraph.oy);
      graphic.rotation = telegraph.facing;
      const locked = telegraph.phase !== 'windup', color = locked ? 0xf0655e : 0xe7ad47;
      shapePath(graphic, telegraph.shape).fill({ color, alpha: locked ? .27 : .07 })
        .stroke({ color, width: telegraph.major ? 4 : 2, alpha: 1 });
      if (!locked && telegraph.progress > 0)
        shapePath(graphic, telegraph.shape, telegraph.progress).fill({ color, alpha: .24 });
      pattern(graphic, telegraph.shape, color, locked);
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
      let graphic = this.projectiles.get(particle.id);
      if (!graphic) {
        const pool = this.projectilePool.get(particle.abilityId);
        graphic = pool?.pop();
        if (!graphic) {
          graphic = new Graphics();
          const abilityId = particle.abilityId;
          if (abilityId === 'arrow' || abilityId === 'volley')
            graphic
              .moveTo(-16, 0)
              .lineTo(7, 0)
              .stroke({ color: 0xe5d4a0, width: 2 })
              .poly([7, 0, 1, -4, 1, 4])
              .fill(0xe6e5ce);
          else if (abilityId === 'sling_stone')
            graphic.circle(0, 0, particle.r).fill(0xa29c86).circle(-2, -2, 2).fill(0xc9c5b3);
          else {
            const color = abilityId === 'ember_bolt' ? 0xff9856 : 0xa5e8ef;
            graphic
              .circle(0, 0, particle.r * 1.8)
              .fill({ color, alpha: .15 })
              .circle(0, 0, particle.r)
              .fill({ color, alpha: .7 })
              .circle(-2, -2, particle.r * .4)
              .fill(0xfff5dc);
            graphic.blendMode = 'add';
          }
          graphic.ability = particle.abilityId;
          this.layers.projectiles.addChild(graphic);
        }
        graphic.prevX = particle.x;
        graphic.prevY = particle.y;
        graphic.position.set(particle.x, particle.y);
        this.projectiles.set(particle.id, graphic);
      }
      graphic.visible = true;
      if (!frozen)
        graphic.position.set(
          graphic.prevX + (particle.x - graphic.prevX) * alpha,
          graphic.prevY + (particle.y - graphic.prevY) * alpha,
        );
      graphic.rotation = Math.atan2(particle.vy, particle.vx);
    }
    for (const [id, graphic] of this.projectiles)
      if (!graphic.visible) {
        let pool = this.projectilePool.get(graphic.ability);
        if (!pool) {
          pool = [];
          this.projectilePool.set(graphic.ability, pool);
        }
        pool.push(graphic);
        this.projectiles.delete(id);
      }
    for (const particle of this.numbers) {
      if (particle.left <= 0)
        continue;
      particle.left -= deltaTime;
      particle.node.visible = particle.left > 0;
      particle.node.position.set(particle.x, particle.y - (1 - particle.left / .8) * 34);
      particle.node.alpha = Math.min(1, particle.left * 4);
    }
    for (const effect of this.effects) {
      if (effect.left <= 0)
        continue;
      effect.left -= deltaTime;
      effect.node.visible = effect.left > 0;
      effect.node.alpha = Math.max(0, effect.left / effect.total) * (this.reduced ? .5 : 1);
      effect.node.scale.set(effect.kind === 'ring' ? 1 + (1 - effect.left / effect.total) * .35 : 1);
    }
  }
}
