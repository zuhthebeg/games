import { SkillVfx, SKILL_VFX } from './skill-vfx.js';
import { presentSkillEvents } from '../net/skill-presentation.js';

// Real mastery levels and visual stages are separate; never grow hit geometry.
export const masteryStage = (level = 1) => 1 + Math.floor(Math.max(1, Math.min(30, level)) / 5);
export function masteryVisual(level = 1, atlas = false, reduced = false, classic = false) {
  const stage = masteryStage(level), enabled = !classic && !reduced, enhanced = enabled && stage >= 3;
  return { level, stage, path: enhanced ? atlas ? 'atlas-overlay' : 'classic-enhanced' : 'classic',
    scale: enhanced && stage >= 5 ? 1.15 : 1,
    brightness: enhanced ? stage >= 5 ? 1.5 : 1.25 : 1,
    extraParticles: enhanced ? stage >= 7 ? 12 : stage >= 6 ? 10 : stage >= 5 ? 8 : 4 : 0,
    tail: enhanced ? 1.3 : 1, afterglow: enhanced && stage >= 5,
    outline: enabled && stage >= 2, directional: enabled && stage >= 4,
    crest: enabled ? Math.max(0, stage - 5) : 0 };
}

// Same palette as weapon-glow/game.css. No gameplay/attribute meaning.
export const ENHANCE_ACCENTS = Object.freeze({6:0xcde8ee,7:0x53b9ff,8:0x9cdaff,9:0xbe84ff,10:0xffd36f});
// Reuse classic fixed pools and geometry; no FX3 atlas/registry changes.
export class MasterySkillVfx extends SkillVfx {
  constructor(Graphics, layer, options = {}) {
    super(Graphics, layer, options);
    this.levels = {}; this.equipment = {}; this.context = masteryVisual(); this.presentation = new Map();
    this.projectileOwners = new Map(); this.projectileLive = new Set();
    // Classic dash charge scale and open-arc stroke joins can spill past the body.
    // A bounded actor mask keeps the same crescent paths inside the real body radius.
    for (const slot of this.actors) {
      slot.bodyMask = new Graphics(); slot.bodyMask.visible = false; layer.addChild(slot.bodyMask);
    }
  }
  setMastery(pid, levels) { this.levels[pid] = { ...levels }; }
  setEquipment(pid, descriptor) { this.equipment[pid] = { ...descriptor }; }
  enhancement(entity) {
    if(entity?.kind !== 'player') return 0;
    const n = this.equipment[entity.pid]?.enhance ?? entity.equipmentVisual?.enhance;
    return Number.isInteger(n) && n >= 0 && n <= 10 ? n : 0;
  }
  profile(ability) {
    const p = SKILL_VFX[ability];
    return p && this.context.accent ? {...p, coreAccent:p.accent, accent:this.context.accent, abilityId:ability} : p;
  }
  accentProfile(profile) {
    return this.context.accent ? {...profile,coreAccent:profile.coreAccent ?? profile.accent,accent:this.context.accent} : profile;
  }
  level(entity, ability) { return this.levels[entity?.pid]?.[ability] ?? entity?.skillMasteryLevels?.[ability] ?? 1; }
  visual(level, ability, reduced) { return masteryVisual(level, ability === 'ember_bolt', reduced, !this.fxRequested); }
  withLevel(level, ability, reduced, run, enhance = 0) {
    const previous = this.context, requested = this.fxRequested;
    this.context = {...this.visual(level, ability, reduced), enhance, accent:ENHANCE_ACCENTS[enhance]}; this.presentation.set(ability, this.context);
    this.fxRequested = requested && this.context.stage >= 3;
    try { return run(); } finally { this.context = previous; this.fxRequested = requested; }
  }
  // Additive inner glow, shock arcs and accent motes keep cone/circle/ring silhouettes.
  decorate(g, visual, shape, radius, color = 0xa8dce4, accent = 0xe3f5ef, style = '') {
    if (!visual?.outline && !visual?.extraParticles) return;
    const r = shape?.range ?? shape?.radius ?? radius, offset = shape?.offset || 0;
    if (!(r > 0)) return;
    // New stage2 outline and stage4 directional insets keep historical cores.
    if (visual.outline && !visual.extraParticles) {
      if (shape?.type === 'cone') g.arc(0,0,r*.72,-shape.arc*Math.PI/420,shape.arc*Math.PI/420).stroke({color:accent,width:1.5,alpha:.6});
      else if (['dash','frost','arrow','pierce'].includes(style)) g.moveTo(-r*.7,0).lineTo(r*.7,0).stroke({color:accent,width:1.5,alpha:.6});
      else g.circle(offset,0,r*.72).stroke({color:accent,width:1.5,alpha:.6});
      return;
    }
    if (visual.directional) {
      const x=offset+r*.34;
      g.moveTo(x,-r*.08).lineTo(x+r*.12,0).lineTo(x,r*.08).stroke({color:accent,width:1.5,alpha:.6});
    }
    // Two bounded inner motif echoes at most; no new masks, objects or timers.
    for(let i=0;i<visual.crest;i++) {
      const f=.38+i*.12;
      if(shape?.type==='cone') g.arc(0,0,r*f,-shape.arc*Math.PI/480,shape.arc*Math.PI/480).stroke({color:accent,width:2,alpha:.55});
      else if(['dash','frost','arrow','pierce'].includes(style)) g.poly([-r*f,0,0,-r*.12,r*f,0,0,r*.12]).stroke({color:accent,width:1.5,alpha:.55});
      else for(let k=0;k<4;k++) {const a=k*Math.PI/2;g.arc(offset,0,r*f,a,a+.6).stroke({color:accent,width:2,alpha:.55});}
    }
    const f = .68 * visual.scale, width = Math.min(10 * visual.scale, r * .12);
    if (shape?.type === 'cone') {
      const half = shape.arc * Math.PI / 360;
      g.arc(0, 0, r * f, -half * .86, half * .86).stroke({color, width: width * 2, alpha:.22 * visual.brightness})
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
      g.circle(offset,0,r*f).stroke({color,width:width*2,alpha:.2 * visual.brightness})
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
    if(args[0]?.blast20){const free=this.effects.find(s=>s.left<=0);if(free)free.mastery=null;return super.effect(...args);}
    args[0] = this.accentProfile(args[0]);
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
    profile = this.accentProfile(profile);
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
    if(event.blast20===true || event.ability==='blast_arrow'&&world.entities.find(e=>e.id===event.src)?.blast20)return super.event(event,world,reduced);
    let owner = world.entities.find(e => e.id === (event.src ?? event.id));
    if (event.type === 'explode') owner = world.entities.find(e => e.id === event.presentationOwner);
    if(owner?.flame20 && event.ability==='flame_ring') return super.event(event,world,reduced);
    return this.withLevel(this.level(owner,event.ability),event.ability,reduced,()=>{
      const result = super.event(event,world,reduced), profile = this.profile(event.ability);
      // Hit coordinates describe a contact glow, not a cast-origin cone. Cleave's
      // full-shape ground cracks are already emitted by actor() with the real shape.
      if (profile && event.type === 'hit' && this.context.extraParticles) this.effect(profile.style === 'cleave' ? {...profile,style:'impact'} : profile,'residue',event.x,event.y,0,profile.projectileRadius || 16,null,reduced);
      return result;
    },this.enhancement(owner));
  }
  actor(entity, tick, reduced) {
    if(entity.act?.flame20) return super.actor(entity,tick,reduced);
    const level = this.level(entity,entity.act?.id);
    const key = `${entity.act?.id}:${tick - (entity.act?.elapsed || 0)}`;
    const prior = this.actors.find(s=>s.id===entity.id && s.key===key);
    const enhance = prior?.castEnhance ?? this.enhancement(entity);
    const result = this.withLevel(level,entity.act?.id,reduced,()=>super.actor(entity,tick,reduced),enhance);
    const slot = this.actors.find(s=>s.id===entity.id);
    if (result && slot) {
      slot.node.mask = null; slot.bodyMask.visible = false;
      slot.castEnhance = enhance;
      slot.mastery = {...this.visual(level,entity.act?.id,reduced),enhance,accent:ENHANCE_ACCENTS[enhance]};
      if (entity.act.phase==='active' && SKILL_VFX[entity.act.id]?.style==='dash') {
        slot.node.scale.set(1);
        slot.bodyMask.clear().circle(0,0,entity.r+SKILL_VFX[entity.act.id].dash.bodyPad).fill(0xffffff);
        slot.bodyMask.position.set(entity.x,entity.y);slot.bodyMask.visible=true;slot.node.mask=slot.bodyMask;
      }
      if (entity.act.phase==='active' && SKILL_VFX[entity.act.id]?.style==='dash' && slot.mastery.extraParticles && slot.masteryDashKey !== slot.key) {
        const profile={...SKILL_VFX[entity.act.id],accent:ENHANCE_ACCENTS[enhance] ?? SKILL_VFX[entity.act.id].accent};
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
    const prior = this.projectiles.find(s=>s.id===particle.id);
    const enhance = prior?.castEnhance ?? this.enhancement(owner);
    const result = this.withLevel(level,particle.abilityId,reduced,()=>super.projectile(particle,alpha,reduced,dt),enhance);
    const slot = this.projectiles.find(s=>s.id===particle.id);
    if (slot) {
      slot.castEnhance=enhance;
      slot.mastery={...this.visual(level,particle.abilityId,reduced),enhance,accent:ENHANCE_ACCENTS[enhance]}; slot.node.scale.set(1); slot.node.alpha=1;
      // Stretch historical positions about the head, not each segment independently.
      let lx=slot.node.x,ly=slot.node.y;
      for (let i=0;i<slot.tail.length;i++) {
        const node=slot.tail[i]; if (!node.visible) continue;
        if(slot.mastery.accent) node.tint=slot.mastery.accent;
        const hx=slot.node.x+(slot.history[i*2]-slot.node.x)*slot.mastery.tail;
        const hy=slot.node.y+(slot.history[i*2+1]-slot.node.y)*slot.mastery.tail;
        node.position.set(lx,ly);node.rotation=Math.atan2(hy-ly,hx-lx);
        node.scale.set(Math.hypot(hx-lx,hy-ly),slot.mastery.scale);
        node.alpha=Math.min(1,node.alpha*slot.mastery.brightness);lx=hx;ly=hy;
      }
    }
    return result;
  }
  snapshot(world) {
    super.snapshot(world);
    const live = new Set(world.projectiles.map(p=>p.id));
    for(const id of this.projectileOwners.keys()) if(!live.has(id) && !this.projectileLive.has(id)) this.projectileOwners.delete(id);
    for(const p of world.projectiles) this.projectileOwners.set(p.id,p.ownerId);
    this.projectileLive = live;
  }
  events(events, world) {
    // Always maintain the projectile journal, even in already-decorated batches.
    return presentSkillEvents(events,world,this.projectileOwners);
  }
  reset() { super.reset(); this.levels={};this.equipment={};this.presentation?.clear();this.projectileOwners?.clear();this.projectileLive?.clear();
    for(const slot of this.actors) {slot.node.mask=null;if(slot.bodyMask)slot.bodyMask.visible=false;}
  }
  enhance(node, visual) { if (node?.visible && visual) node.alpha=Math.min(1,node.alpha*visual.brightness); }
  update(world, alpha, dt, reduced) {
    this.world=world; super.update(world,alpha,dt,reduced);
    for(const slot of this.effects) {
      if(slot.bakedActive && slot.left>0 && !reduced) slot.node.visible=true;
      this.enhance(slot.node,slot.mastery);this.enhance(slot.wave,slot.mastery);this.enhance(slot.baked,slot.mastery);
    }
    for(const slot of this.actors) {this.enhance(slot.node,slot.mastery);this.enhance(slot.baked,slot.mastery);
      if(!slot.seen) {slot.node.mask=null;slot.bodyMask.visible=false;}
    }
    for(const slot of this.particles) this.enhance(slot.node,slot.mastery);
  }
  status() {
    return {classic:!this.fxRequested,levels:this.levels,paths:Object.fromEntries(this.presentation),loads:[...this.fxLoads.keys()],
      active:this.effects.filter(s=>s.left>0).map(s=>({...s.mastery,baked:!!s.bakedActive})),particles:this.particles.filter(s=>s.left>0).length};
  }
}
