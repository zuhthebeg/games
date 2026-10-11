import { ABILITIES } from '../content/combat.js';
import { shapePath } from './shapes.js';

// Presentation only: dimensions come from combat content, never duplicate tuning.
// New table entries can reuse these styles or supply drawEffect/onEvent/onActor/
// drawProjectile hooks. Hooks receive this fixed-pool presenter, never a sim writer.
export const SKILL_VFX = Object.freeze({
  whirl: Object.freeze({ style: 'ring', radius: ABILITIES.whirl.shape.radius,
    shape: ABILITIES.whirl.shape, color: 0xa8dce4, accent: 0xe3f5ef,
    windup: 'runes', impact: 'spark', activeLife: .28, residueLife: .4, particles: 10, reducedParticles: 2 }),
  flame_ring: Object.freeze({ style: 'ring', radius: ABILITIES.flame_ring.shape.radius,
    shape: ABILITIES.flame_ring.shape, color: 0xf08c46, accent: 0xffe6ad,
    windup: 'runes', impact: 'spark', activeLife: .32, residueLife: .4, particles: 12, reducedParticles: 2 }),
  blast_arrow: Object.freeze({ style: 'ember', radius: ABILITIES.blast_arrow.projectile.explode.radius,
    projectileRadius: ABILITIES.blast_arrow.projectile.radius, color: 0xf08c46, accent: 0xffe6ad,
    windup: 'converge', impact: 'smoke', activeLife: .32, residueLife: .55, particles: 12, reducedParticles: 2 }),
  heavy_cleave: Object.freeze({ style: 'cleave', shape: ABILITIES.heavy_cleave.shape,
    color: 0xa8dce4, accent: 0xe3f5ef, windup: 'vertical', impact: 'spark',
    activeLife: .24, residueLife: .65, particles: 10, reducedParticles: 2 }),
  ember_bolt: Object.freeze({ style: 'ember', radius: ABILITIES.ember_bolt.projectile.explode.radius,
    projectileRadius: ABILITIES.ember_bolt.projectile.radius, color: 0xf08c46, accent: 0xffe6ad,
    windup: 'converge', impact: 'smoke', activeLife: .32, residueLife: .55,
    particles: 12, reducedParticles: 2 }),
  healing_light: Object.freeze({ style: 'heal', radius: ABILITIES.healing_light.heal.radius,
    color: 0x79dca0, accent: 0xc5d799, windup: 'runes', impact: 'rise',
    activeLife: .4, residueLife: .65, particles: 10, reducedParticles: 2 })
});
export const VFX_CAPS = Object.freeze({ effects: 48, particles: 96, actors: 8, projectiles: 24, trail: 6 });
export const particleCount = (profile, reduced) => reduced ? profile.reducedParticles : profile.particles;
const clamp01 = value => Math.max(0, Math.min(1, value));
// total + elapsed are already sent to guests; phaseTicks/left are not. The
// windup fraction is reconstructed from the accepted total, including speed rounding.
export function windupProgress(act) {
  if (act.phase !== 'windup') return 1;
  const def = act.def || ABILITIES[act.id];
  const ratio = def.windupMs / Math.max(1, def.windupMs + def.lockMs);
  return clamp01(act.elapsed / Math.max(1, Math.round(act.total * ratio)));
}

export class SkillVfx {
  constructor(Graphics, layer) {
    this.layer = layer;
    const graphic = () => { const node = new Graphics(); node.visible = false; layer.addChild(node); return node; };
    this.effects = Array.from({ length: VFX_CAPS.effects }, () => ({ node: graphic(), wave: graphic(), left: 0 }));
    this.particles = Array.from({ length: VFX_CAPS.particles }, () => {
      const node = graphic(); node.circle(0, 0, 1).fill(0xffffff);
      return { node, left: 0 };
    });
    this.actors = Array.from({ length: VFX_CAPS.actors }, () => ({ id: null, node: graphic(),
      motes: Array.from({ length: 8 }, () => { const node = graphic(); node.circle(0, 0, 1.5).fill(0xffffff); return node; }) }));
    this.projectiles = Array.from({ length: VFX_CAPS.projectiles }, () => ({ id: null, node: graphic(),
      history: new Float64Array(VFX_CAPS.trail * 2), count: 0, clock: 0,
      tail: Array.from({ length: VFX_CAPS.trail }, (_, i) => {
        const node = graphic(); node.moveTo(0, 0).lineTo(1, 0).stroke({ color: 0xffffff, width: 7 - i }); return node;
      }) }));
  }
  reset() {
    for (const item of [...this.effects, ...this.particles]) { item.left = 0; item.node.visible = false; if (item.wave) item.wave.visible = false; }
    for (const slot of this.actors) { slot.id = null; slot.node.visible = false; for (const node of slot.motes) node.visible = false; }
    for (const slot of this.projectiles) { slot.id = null; slot.node.visible = false; for (const node of slot.tail) node.visible = false; }
  }
  effect(profile, kind, x, y, facing, radius, shape, reduced) {
    const slot = this.effects.find(item => item.left <= 0);
    if (!slot) return false;
    Object.assign(slot, { kind, radius, reduced, left: kind === 'residue' ? (reduced ? .2 : profile.residueLife) : profile.activeLife });
    slot.total = slot.left;
    const g = slot.node, wave = slot.wave;
    wave.clear(); wave.position.set(x, y); wave.rotation = facing || 0; wave.scale.set(.3); wave.visible = false;
    g.clear(); g.position.set(x, y); g.rotation = facing || 0; g.scale.set(1); g.visible = true;
    if (profile.drawEffect) {
      profile.drawEffect(this, slot, { kind, x, y, facing, radius, shape, reduced });
      return true;
    }
    if (profile.style === 'cleave') {
      slot.kind = kind === 'residue' ? 'residue' : 'wave';
      if (kind === 'residue') {
        // Four cracked ground lines remain entirely inside the authoritative cone.
        const half = shape.arc * Math.PI / 360;
        const count = reduced ? 2 : 4;
        for (let i = 0; i < count; i++) {
          const angle = -half * .72 + i * half * 1.44 / (count - 1);
          const c = Math.cos(angle), s = Math.sin(angle);
          g.moveTo(c * 22, s * 22).lineTo(c * shape.range * .42, s * shape.range * .42 + 3)
            .lineTo(c * shape.range * .62, s * shape.range * .62 - 3)
            .lineTo(c * (shape.range - 5), s * (shape.range - 5));
        }
        g.stroke({ color: 0x71867d, width: 2, alpha: .55 });
      } else {
        shapePath(wave, shape).fill({ color: profile.color, alpha: reduced ? .05 : .14 });
        wave.visible = !reduced;
        // Inner-aligned stroke never grows beyond the hit boundary.
        shapePath(g, shape).stroke({ color: profile.accent, width: reduced ? 2 : 4, alignment: 1, alpha: .85 });
        const half = shape.arc * Math.PI / 360;
        g.arc(0, 0, shape.range - 4, -half, half).stroke({ color: profile.color, width: 3, alpha: .65 });
      }
    } else {
      slot.kind = 'wave';
      g.circle(0, 0, radius).stroke({ color: profile.color, width: reduced ? 2 : 4, alignment: 1, alpha: .8 });
      if (!reduced) {
        wave.circle(0, 0, radius).fill({ color: profile.color, alpha: .08 })
          .circle(0, 0, radius * .18).fill({ color: profile.accent, alpha: .28 });
        wave.visible = true;
      }
      if (profile.style === 'heal') g.circle(0, 0, radius - 6).stroke({ color: profile.accent, width: 1, alpha: .3 });
    }
    return true;
  }
  emit(profile, kind, x, y, facing = 0, radius = 20, reduced = false) {
    let remaining = particleCount(profile, reduced), spawned = 0;
    for (const slot of this.particles) {
      if (!remaining) break;
      if (slot.left > 0) continue;
      const i = remaining--, angle = facing + i * 2.399963;
      const smoke = kind === 'smoke' || kind === 'dust';
      const rise = kind === 'rise';
      const dist = smoke ? radius * .35 : rise ? 10 : 0;
      const motion = reduced ? .25 : 1;
      Object.assign(slot, { kind, reduced, x: x + Math.cos(angle) * dist, y: y + Math.sin(angle) * dist,
        vx: (rise ? Math.cos(angle) * 3 : smoke ? Math.cos(angle) * 12 : Math.cos(angle) * 85) * motion,
        vy: (rise ? -48 - i * 2 : smoke ? -12 : Math.sin(angle) * 85) * motion,
        total: smoke || rise ? profile.residueLife : .18, size: smoke ? 5 : rise ? 1.8 : 2.5 });
      slot.left = slot.total;
      slot.node.position.set(slot.x, slot.y); slot.node.rotation = rise ? 0 : angle;
      slot.node.tint = smoke ? (kind === 'dust' ? 0x8a9b88 : 0x6e7370) : profile.color;
      slot.node.scale.set(slot.size, smoke ? slot.size : slot.size * (rise ? 2 : .5));
      slot.node.alpha = smoke ? .25 : reduced ? .35 : .75; slot.node.visible = true;
      spawned++;
    }
    return spawned;
  }
  event(event, world, reduced = false) {
    const profile = SKILL_VFX[event.ability];
    if (!profile) return false;
    if (profile.onEvent) return profile.onEvent(this, event, world, reduced);
    if (event.type === 'hit') {
      if (profile.style === 'cleave' || profile.style === 'ember' || profile.style === 'ring') this.emit(profile, 'spark', event.x, event.y, 0, 20, reduced);
      return false; // Existing numbers, impact, hit-stop and camera remain untouched.
    }
    if (event.type === 'explode' && profile.style === 'ember') {
      this.effect(profile, 'active', event.x, event.y, 0, event.radius, null, reduced);
      this.emit(profile, 'smoke', event.x, event.y, 0, event.radius, reduced);
      return true;
    }
    if (event.type === 'healCast' && profile.style === 'heal') {
      this.effect(profile, 'active', event.x, event.y, 0, event.radius, null, reduced);
      return true;
    }
    if (event.type === 'heal' && profile.style === 'heal') this.emit(profile, 'rise', event.x, event.y, 0, 10, reduced);
    // healingFeedback still owns green numbers; act state owns charge/activation.
    return false;
  }
  actor(entity, worldTick, reduced) {
    const act = entity.act, profile = SKILL_VFX[act?.id];
    if (!profile || entity.dead || entity.kind !== 'player') return false;
    if (profile.onActor) return profile.onActor(this, entity, worldTick, reduced);
    let slot = this.actors.find(item => item.id === entity.id);
    if (!slot) slot = this.actors.find(item => item.id === null);
    if (!slot) return true;
    const key = `${act.id}:${worldTick - act.elapsed}`;
    if (slot.id !== entity.id || slot.key !== key) {
      Object.assign(slot, { id: entity.id, key, fired: false });
      const g = slot.node; g.clear(); g.rotation = 0; g.scale.set(1);
      if (profile.windup === 'vertical') {
        g.moveTo(0, 8).lineTo(0, -48).stroke({ color: profile.color, width: 8, alpha: .16 })
          .moveTo(0, 8).lineTo(0, -48).stroke({ color: profile.accent, width: 2, alpha: .8 });
      } else if (profile.windup === 'converge') {
        g.circle(0, 0, 7).fill({ color: profile.color, alpha: .32 })
          .circle(0, 0, 3).fill({ color: profile.accent, alpha: .8 });
      } else {
        g.circle(0, 0, 25).stroke({ color: profile.color, width: 2, alpha: .7 })
          .circle(0, 0, 19).stroke({ color: profile.accent, width: 1, alpha: .3 });
        for (let i = 0; i < 8; i++) {
          const a = i * Math.PI / 4;
          g.moveTo(Math.cos(a) * 19, Math.sin(a) * 19).lineTo(Math.cos(a) * 24, Math.sin(a) * 24);
        }
        g.stroke({ color: profile.color, width: 2, alpha: .7 });
      }
    }
    slot.seen = true;
    const charging = act.phase === 'windup' || act.phase === 'lock', p = windupProgress(act);
    const x = entity.x + (profile.style === 'heal' || profile.style === 'ring' ? 0 : Math.cos(act.facing) * (entity.r + 6));
    const y = entity.y + (profile.style === 'heal' || profile.style === 'ring' ? 0 : Math.sin(act.facing) * (entity.r + 6) - 20);
    slot.node.visible = charging; slot.node.position.set(x, y);
    slot.node.alpha = (reduced ? .35 : .8) * (.2 + p * .8);
    if (profile.style === 'heal') slot.node.rotation = reduced ? 0 : p * .55;
    for (let i = 0; i < slot.motes.length; i++) {
      const node = slot.motes[i];
      node.visible = charging && profile.style !== 'cleave' && i < (reduced ? 2 : 8);
      if (!node.visible) continue;
      const a = i * Math.PI / 4 + (reduced ? 0 : p * .8);
      const r = profile.style === 'ember' ? 26 * (1 - p) + 3 : 22;
      node.position.set(x + Math.cos(a) * r, y + Math.sin(a) * r);
      node.tint = profile.color; node.alpha = reduced ? .3 : .65; node.scale.set(1);
    }
    // Recovery also covers an active phase omitted by a guest snapshot; stable
    // tick-elapsed identity prevents repeated waves when snapshots replace act objects.
    if (!charging && !slot.fired) {
      slot.fired = true;
      if (profile.style === 'ring') {
        this.effect(profile, 'active', entity.x, entity.y, act.facing, act.def.shape.radius, act.def.shape, reduced);
      } else if (profile.style === 'cleave') {
        const shape = act.def.shape;
        this.effect(profile, 'active', entity.x, entity.y, act.facing, 0, shape, reduced);
        this.effect(profile, 'residue', entity.x, entity.y, act.facing, 0, shape, reduced);
        this.emit(profile, 'dust', entity.x + Math.cos(act.facing) * shape.range * .6,
          entity.y + Math.sin(act.facing) * shape.range * .6, act.facing, 18, reduced);
      }
    }
    return true;
  }
  projectile(particle, alpha, reduced, dt) {
    const profile = SKILL_VFX[particle.abilityId];
    let slot = this.projectiles.find(item => item.id === particle.id);
    if (!slot) slot = this.projectiles.find(item => item.id === null);
    if (!slot) return;
    if (slot.id !== particle.id) {
      Object.assign(slot, { id: particle.id, prevX: particle.x, prevY: particle.y, count: 0, clock: 0 });
      const g = slot.node; g.clear();
      if (profile.drawProjectile) profile.drawProjectile(g, particle, reduced);
      else g.circle(0, 0, particle.r).fill({ color: profile.color, alpha: .85 })
        .circle(0, 0, particle.r * .5).fill({ color: profile.accent, alpha: .85 });
    }
    slot.seen = true;
    const x = slot.prevX + (particle.x - slot.prevX) * alpha, y = slot.prevY + (particle.y - slot.prevY) * alpha;
    slot.node.visible = true; slot.node.position.set(x, y);
    slot.clock += dt;
    if (slot.clock >= .025 || !slot.count) {
      slot.history.copyWithin(2, 0, (VFX_CAPS.trail - 1) * 2);
      slot.history[0] = x; slot.history[1] = y;
      slot.count = Math.min(VFX_CAPS.trail, slot.count + 1); slot.clock %= .025;
    }
    let lastX = x, lastY = y;
    for (let i = 0; i < slot.tail.length; i++) {
      const node = slot.tail[i], hx = slot.history[i * 2], hy = slot.history[i * 2 + 1];
      node.visible = i < slot.count && i < (reduced ? 1 : VFX_CAPS.trail);
      if (!node.visible) continue;
      node.position.set(lastX, lastY); node.rotation = Math.atan2(hy - lastY, hx - lastX);
      node.scale.set(Math.hypot(hx - lastX, hy - lastY), 1);
      node.tint = profile.color;
      node.alpha = (reduced ? .1 : .45) * (1 - i / VFX_CAPS.trail);
      lastX = hx; lastY = hy;
    }
  }
  snapshot(world) {
    for (const slot of this.projectiles) {
      const particle = world.projectiles.find(item => item.id === slot.id);
      if (particle) { slot.prevX = particle.x; slot.prevY = particle.y; }
    }
  }
  update(world, alpha, dt, reduced) {
    for (const slot of this.actors) slot.seen = false;
    for (const entity of world.entities) this.actor(entity, world.tick, reduced);
    for (const slot of this.actors) if (!slot.seen) {
      slot.id = null; slot.node.visible = false; for (const node of slot.motes) node.visible = false;
    }
    for (const slot of this.projectiles) slot.seen = false;
    for (const particle of world.projectiles) if (SKILL_VFX[particle.abilityId]?.projectileRadius) this.projectile(particle, alpha, reduced, dt);
    for (const slot of this.projectiles) if (!slot.seen) {
      slot.id = null; slot.node.visible = false; for (const node of slot.tail) node.visible = false;
    }
    for (const slot of this.effects) {
      if (slot.left <= 0) continue;
      slot.left = Math.max(0, slot.left - dt); slot.node.visible = slot.left > 0;
      const age = 1 - slot.left / slot.total;
      // Full-size boundary stays exact; only the interior wave grows up to it.
      slot.node.scale.set(1);
      slot.node.alpha = (reduced ? .35 : .8) * (1 - age);
      slot.wave.visible = slot.left > 0 && slot.kind === 'wave' && !reduced;
      slot.wave.scale.set(.3 + .7 * Math.min(1, age * 4));
      slot.wave.alpha = slot.node.alpha;
    }
    for (const slot of this.particles) {
      if (slot.left <= 0) continue;
      slot.left = Math.max(0, slot.left - dt); slot.node.visible = slot.left > 0;
      slot.x += slot.vx * dt; slot.y += slot.vy * dt;
      slot.node.position.set(slot.x, slot.y);
      const fade = slot.left / slot.total;
      slot.node.alpha = fade * (slot.kind === 'smoke' || slot.kind === 'dust' ? .25 : reduced ? .35 : .75);
      if (slot.kind === 'smoke' || slot.kind === 'dust') slot.node.scale.set(slot.size * (1 + (1 - fade) * .6));
    }
  }
}
