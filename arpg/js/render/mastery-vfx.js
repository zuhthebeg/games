import { SkillVfx, SKILL_VFX } from './skill-vfx.js';
import { presentSkillEvents } from '../net/skill-presentation.js';

// Decoration grows inside the authoritative boundary, never the boundary itself.
// Lv5's 1.15 size applies to inner light/particles, not the hit-range guide/core.
export function masteryVisual(level = 1, atlas = false, reduced = false, classic = false) {
  const enhanced = !classic && !reduced && level >= 3;
  return { level, path: enhanced ? atlas ? 'atlas-overlay' : 'classic-enhanced' : 'classic',
    scale: enhanced && level === 5 ? 1.15 : 1,
    brightness: enhanced ? level === 5 ? 1.5 : 1.25 : 1,
    extraParticles: enhanced ? level === 5 ? 8 : 4 : 0,
    tail: enhanced ? 1.3 : 1, afterglow: enhanced && level === 5 };
}

// Reuse classic fixed pools and geometry; no FX3 atlas/registry changes.
export class MasterySkillVfx extends SkillVfx {
  constructor(Graphics, layer, options = {}) {
    super(Graphics, layer, options);
    this.levels = {}; this.context = masteryVisual(); this.presentation = new Map();
    this.projectileOwners = new Map();
  }
  setMastery(pid, levels) { this.levels[pid] = { ...levels }; }
  level(entity, ability) { return this.levels[entity?.pid]?.[ability] ?? entity?.skillMasteryLevels?.[ability] ?? 1; }
  visual(level, ability, reduced) { return masteryVisual(level, ability === 'ember_bolt', reduced, !this.fxRequested); }
  withLevel(level, ability, reduced, run) {
    const previous = this.context, requested = this.fxRequested;
    this.context = this.visual(level, ability, reduced); this.presentation.set(ability, this.context);
    this.fxRequested = requested && level >= 3;
    try { return run(); } finally { this.context = previous; this.fxRequested = requested; }
  }
  // Additive inner glow, shock arcs and accent motes keep cone/circle/ring silhouettes.
  decorate(g, visual, shape, radius, color = 0xa8dce4, accent = 0xe3f5ef, style = '') {
    if (!visual?.extraParticles) return;
    const r = shape?.range ?? shape?.radius ?? radius, offset = shape?.offset || 0;
    if (!(r > 0)) return;
    const f = .68 * visual.scale, width = Math.min(10 * visual.scale, r * .12);
    if (shape?.type === 'cone') {
      const half = shape.arc * Math.PI / 360;
      g.arc(0, 0, r * f, -half * .86, half * .86).stroke({color, width: width * 2, alpha:.22})
        .arc(0, 0, r * f, -half * .86, half * .86).stroke({color:accent,width:2,alpha:.75});
      for (let i=0;i<(visual.afterglow?7:4);i++) {
        const a = -half * .7 + i * half * 1.4 / ((visual.afterglow?7:4)-1);
        g.circle(Math.cos(a)*r*.86,Math.sin(a)*r*.86,Math.min(2.5*visual.scale,r*.03)).fill({color:accent,alpha:.8});
      }
    } else if (style === 'dash') {
      g.moveTo(-r,0).lineTo(0,0).stroke({color,width:8*visual.scale,alpha:.3});
      if (visual.afterglow) g.moveTo(-r,3).lineTo(0,3).stroke({color:accent,width:2,alpha:.5});
    } else if (style === 'frost' || style === 'arrow' || style === 'pierce') {
      g.poly([-r*.85,0,0,-r*.30*visual.scale,r*.85,0,0,r*.30*visual.scale]).fill({color,alpha:.5});
      g.moveTo(-r*.7,0).lineTo(r*.8,0).stroke({color:accent,width:Math.min(3*visual.scale,r*.35),alpha:.9});
    } else {
      g.circle(offset,0,r*f).stroke({color,width:width*2,alpha:.2})
        .circle(offset,0,r*f).stroke({color:accent,width:2,alpha:.75});
      // Different existing motifs remain visible; never replace them with a white disc.
      const n = visual.afterglow ? 12 : 8;
      for (let i=0;i<n;i++) {
        const a=i*Math.PI*2/n + (style==='heal'?.2:0);
        g.circle(offset+Math.cos(a)*r*.87,Math.sin(a)*r*.87,Math.min(2.5*visual.scale,r*.03)).fill({color,alpha:.8});
      }
    }
    if (visual.afterglow) {
      if (shape?.type==='cone') {
        const half=shape.arc*Math.PI/360;
        g.arc(0,0,r*.9,-half*.8,half*.8).stroke({color,width:3,alpha:.45});
      } else if (!['dash','frost','arrow','pierce'].includes(style)) g.circle(offset,0,r*.92).stroke({color,width:3,alpha:.45});
    }
  }
  effect(...args) {
    const free = this.effects.find(slot => slot.left <= 0), result = super.effect(...args);
    if (result && free) {
      const [profile,kind,x,y,facing,radius,shape,reduced] = args;
      free.mastery = this.context;
      this.decorate(free.node,this.context,shape,radius,profile.color,profile.accent,profile.style);
      if (free.bakedActive) free.node.visible = true;
      if (this.context.extraParticles && kind === 'active') this.emit({...profile,particles:this.context.extraParticles},profile.impact,x,y,facing,Math.min(radius || 20,20),reduced);
      if (this.context.afterglow && kind === 'residue') free.left = free.total = free.total + .1;
    }
    return result;
  }
  emit(profile, kind, x, y, facing, radius, reduced) {
    const free = this.particles.filter(slot => slot.left <= 0), visual = this.context;
    const count = super.emit(visual.extraParticles ? {...profile,particles:profile.particles+visual.extraParticles} : profile,kind,x,y,facing,radius,reduced);
    for (const slot of free.slice(0,count)) {
      slot.mastery = visual;
      if (visual.extraParticles) slot.node.scale.set(slot.node.scale.x * visual.scale,slot.node.scale.y * visual.scale);
      if (visual.afterglow) slot.left = slot.total = slot.total + .1;
    }
    return count;
  }
  event(event, world, reduced = false) {
    let owner = world.entities.find(e => e.id === (event.src ?? event.id));
    if (event.type === 'explode') owner = world.entities.find(e => e.id === event.presentationOwner);
    return this.withLevel(this.level(owner,event.ability),event.ability,reduced,()=>{
      const result = super.event(event,world,reduced), profile = SKILL_VFX[event.ability];
      if (profile && event.type === 'hit' && this.context.extraParticles) this.effect(profile,'residue',event.x,event.y,0,profile.projectileRadius || 16,null,reduced);
      return result;
    });
  }
  actor(entity, tick, reduced) {
    const level = this.level(entity,entity.act?.id);
    const result = this.withLevel(level,entity.act?.id,reduced,()=>super.actor(entity,tick,reduced));
    const slot = this.actors.find(s=>s.id===entity.id);
    if (result && slot) {
      slot.mastery = this.visual(level,entity.act?.id,reduced);
      if (entity.act.phase==='active' && SKILL_VFX[entity.act.id]?.style==='dash' && slot.mastery.extraParticles && slot.masteryDashKey !== slot.key) {
        const profile=SKILL_VFX[entity.act.id];
        this.decorate(slot.node,slot.mastery,{type:'cone',range:entity.r+profile.dash.bodyPad,arc:120},0,profile.color,profile.accent);
        slot.masteryDashKey=slot.key;
      }
      // Charging light grows, but the active lunge body/guide never does.
      if (entity.act.phase==='windup' || entity.act.phase==='lock') slot.node.scale.set(slot.node.scale.x * slot.mastery.scale);
    }
    return result;
  }
  projectile(particle, alpha, reduced, dt) {
    const owner = this.world.entities.find(e=>e.id===particle.ownerId), level = this.level(owner,particle.abilityId);
    const result = this.withLevel(level,particle.abilityId,reduced,()=>super.projectile(particle,alpha,reduced,dt));
    const slot = this.projectiles.find(s=>s.id===particle.id);
    if (slot) {
      slot.mastery=this.visual(level,particle.abilityId,reduced); slot.node.scale.set(1); slot.node.alpha=1;
      // Stretch historical positions about the head, not each segment independently.
      let lx=slot.node.x,ly=slot.node.y;
      for (let i=0;i<slot.tail.length;i++) {
        const node=slot.tail[i]; if (!node.visible) continue;
        const hx=slot.node.x+(slot.history[i*2]-slot.node.x)*slot.mastery.tail;
        const hy=slot.node.y+(slot.history[i*2+1]-slot.node.y)*slot.mastery.tail;
        node.position.set(lx,ly);node.rotation=Math.atan2(hy-ly,hx-lx);
        node.scale.set(Math.hypot(hx-lx,hy-ly),slot.mastery.scale);
        node.alpha=Math.min(1,node.alpha*slot.mastery.brightness);lx=hx;ly=hy;
      }
    }
    return result;
  }
  snapshot(world) { super.snapshot(world); for(const p of world.projectiles) this.projectileOwners.set(p.id,p.ownerId); }
  events(events, world) {
    if (events.some(e=>e.type==='explode' && Object.hasOwn(e,'presentationOwner'))) return events;
    return presentSkillEvents(events,world,this.projectileOwners);
  }
  reset() { super.reset(); this.levels={};this.presentation?.clear();this.projectileOwners?.clear(); }
  enhance(node, visual) { if (node?.visible && visual) node.alpha=Math.min(1,node.alpha*visual.brightness); }
  update(world, alpha, dt, reduced) {
    this.world=world; super.update(world,alpha,dt,reduced);
    for(const slot of this.effects) {
      if(slot.bakedActive && slot.left>0 && !reduced) slot.node.visible=true;
      this.enhance(slot.node,slot.mastery);this.enhance(slot.wave,slot.mastery);this.enhance(slot.baked,slot.mastery);
    }
    for(const slot of this.actors) {this.enhance(slot.node,slot.mastery);this.enhance(slot.baked,slot.mastery);}
    for(const slot of this.particles) this.enhance(slot.node,slot.mastery);
  }
  status() {
    return {classic:!this.fxRequested,levels:this.levels,paths:Object.fromEntries(this.presentation),loads:[...this.fxLoads.keys()],
      active:this.effects.filter(s=>s.left>0).map(s=>({...s.mastery,baked:!!s.bakedActive})),particles:this.particles.filter(s=>s.left>0).length};
  }
}
