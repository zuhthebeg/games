import {VOLLEY_WAVES} from '../sim/volley-evolution.js';
import {PLAYER_BASE} from '../content/combat.js';
import { whirlFrame } from '../sim/whirl-evolution.js';
import { lungeFrame } from "../sim/lunge-evolution.js";
import { QuarksVfx } from './quarks-vfx.js';
import { drawHandsBurst, drawBloodLance, drawBloodBurst } from './skeleton-vfx.js';
import { HolyVfx } from './holy-vfx.js';
import { ABILITIES } from '../content/combat.js';
import { shapePath } from './shapes.js';
import { Assets, Sprite, Texture, Rectangle } from '../../vendor/pixi-8.22.0.min.mjs';
import { fxPreference } from '../prefs.js';

// Presentation-only default. Classic opts out completely; reduced motion never loads atlases.
// Settings stores the choice per device; ?fx= in the URL still overrides it.
export const effekseerEnabled = (search = globalThis.location?.search || '', storage) =>
  fxPreference(search, storage) !== 'classic';

// Presentation only: dimensions come from combat content, never duplicate tuning.
// New table entries can reuse these styles or supply drawEffect/onEvent/onActor/
// drawProjectile hooks. Hooks receive this fixed-pool presenter, never a sim writer.
export const SKILL_VFX = Object.freeze({
  poison_arrow: Object.freeze({style:'arrow',projectile:ABILITIES.poison_arrow.projectile,projectileRadius:8,color:0x78c547,accent:0xd6ffa2,windup:'bow',impact:'spark',activeLife:.2,residueLife:.35,particles:12,reducedParticles:2}),
  cursed_hands: Object.freeze({statusCue:true,style:'heal',radius:ABILITIES.cursed_hands.shape.radius,color:0xbc85e3,accent:0xead3fa,windup:'runes',impact:'rise',activeLife:.65,residueLife:.5,particles:12,reducedParticles:2,drawEffect:drawHandsBurst,
    onEvent(v,e,w,reduced){if(e.type==='handsBurst'){v.effect(this,'active',e.x,e.y,0,e.radius,null,reduced,e.id);v.emit(this,'curseSmoke',e.x,e.y,0,e.radius,reduced);!reduced&&v.emit(this,'dust',e.x,e.y,0,e.radius,reduced);return true;}return false;} }),
  blood_spear: Object.freeze({style:'pierce',projectile:ABILITIES.blood_spear.projectile,projectileRadius:11,color:0xc82d4f,accent:0xffadb9,windup:'crystal',impact:'spark',activeLife:.25,residueLife:.4,particles:14,reducedParticles:2,
    drawProjectile:drawBloodLance,drawEffect:drawBloodBurst,
    onEvent(v,e,w,reduced){
      if(e.type==='act'){const caster=w.entities?.find(p=>p.id===e.id);if(caster){v.effect(this,'sacrifice',caster.x,caster.y-12,0,18,null,reduced,e.id);v.emit(this,'blood',caster.x,caster.y-12,0,12,reduced);}}
      if(e.type==='hit'){v.effect(this,'residue',e.x,e.y,0,11,null,reduced,e.src);v.emit(this,'blood',e.x,e.y,0,20,reduced);}
      return false;
    } }),
  dead_explosion: Object.freeze({style:'ember',radius:ABILITIES.dead_explosion.shape.radius,color:0xae356e,accent:0xe7c7f1,windup:'converge',impact:'smoke',motif:'blast',activeLife:.6,residueLife:.7,particles:30,reducedParticles:3}),
  curse: Object.freeze({statusCue:true,style:'heal',radius:ABILITIES.curse.shape.radius,color:0xbc85e3,accent:0xe4b7ff,windup:'runes',impact:'rise',activeLife:.3,residueLife:.4,particles:8,reducedParticles:2}),
  invisibility: Object.freeze({statusCue:true,style:'heal',radius:28,color:0x8cb2bb,accent:0xd1edf2,windup:'runes',impact:'rise',activeLife:.2,residueLife:.2,particles:4,reducedParticles:1}),
  berserk: Object.freeze({statusCue:true,style:'heal',radius:32,color:0xf17b60,accent:0xffc08d,windup:'runes',impact:'rise',activeLife:.3,residueLife:.4,particles:8,reducedParticles:2}),
  sword_wave: Object.freeze({style:'pierce',projectile:ABILITIES.sword_wave.projectile,projectileRadius:ABILITIES.sword_wave.projectile.radius,color:0x8cddd0,accent:0xd8fff6,windup:'runes',impact:'spark',activeLife:.2,residueLife:.3,particles:8,reducedParticles:2,
    drawProjectile(g,p){g.arc(-8,0,p.r*.85,-1.2,1.2).stroke({color:0xc1f7ed,width:6}).arc(-12,0,p.r*.85,-1.1,1.1).stroke({color:0x72c9bf,width:3,alpha:.6});} }),
  lunge: Object.freeze({ style: 'dash', dash: ABILITIES.lunge.dash,
    color: 0xa8dce4, accent: 0xe3f5ef, windup: 'blade', impact: 'spark',
    activeLife: .2, residueLife: .26, particles: 16, reducedParticles: 2 }),
  volley: Object.freeze({ style: 'arrow', projectile: ABILITIES.volley.projectile,
    projectileRadius: ABILITIES.volley.projectile.radius, color: 0xd2c497, accent: 0xf1ebd2,
    windup: 'bow', impact: 'spark', activeLife: .18, residueLife: .28, particles: 14, reducedParticles: 2 }),
  spinning_shot: Object.freeze({ style: 'arrow', projectile: ABILITIES.spinning_shot.projectile,
    projectileRadius: ABILITIES.spinning_shot.projectile.radius, color: 0xd2c497, accent: 0xf1ebd2,
    windup: 'bow', impact: 'spark', activeLife: .18, residueLife: .28, particles: 14, reducedParticles: 2 }),
  triple_arrow: Object.freeze({ style: 'arrow', projectile: ABILITIES.triple_arrow.projectile,
    projectileRadius: ABILITIES.triple_arrow.projectile.radius, color: 0xd2c497, accent: 0xf1ebd2,
    windup: 'bow', impact: 'spark', activeLife: .18, residueLife: .28, particles: 14, reducedParticles: 2 }),
  evasion_shot: Object.freeze({ style: 'arrow', projectile: ABILITIES.evasion_shot.projectile,
    projectileRadius: ABILITIES.evasion_shot.projectile.radius, color: 0x91d8ee, accent: 0xf0fcff,
    windup: 'bow', impact: 'spark', activeLife: .18, residueLife: .28, particles: 14, reducedParticles: 2 }),
  pierce_shot: Object.freeze({ style: 'pierce', projectile: ABILITIES.pierce_shot.projectile,
    projectileRadius: ABILITIES.pierce_shot.projectile.radius, color: 0x91d8ee, accent: 0xf0fcff,
    windup: 'bow', impact: 'spark', activeLife: .22, residueLife: .3, particles: 16, reducedParticles: 2 }),
  frost_lance: Object.freeze({ style: 'frost', projectile: ABILITIES.frost_lance.projectile,
    projectileRadius: ABILITIES.frost_lance.projectile.radius, color: 0x9fd8ff, accent: 0xe9faff,
    windup: 'crystal', impact: 'shard', activeLife: .24, residueLife: .45, particles: 18, reducedParticles: 2 }),
  whirl: Object.freeze({ style: 'ring', radius: ABILITIES.whirl.shape.radius,
    shape: ABILITIES.whirl.shape, color: 0xa8dce4, accent: 0xe3f5ef,
    windup: 'runes', impact: 'spark', motif: 'whirl', activeLife: .34, residueLife: .45, particles: 22, reducedParticles: 2 }),
  flame_ring: Object.freeze({ style: 'ring', radius: ABILITIES.flame_ring.shape.radius,
    shape: ABILITIES.flame_ring.shape, color: 0xf08c46, accent: 0xffe6ad,
    windup: 'runes', impact: 'spark', motif: 'flame', activeLife: .4, residueLife: .5, particles: 26, reducedParticles: 2 }),
  blast_arrow: Object.freeze({ style: 'ember', radius: ABILITIES.blast_arrow.projectile.explode.radius,
    projectileRadius: ABILITIES.blast_arrow.projectile.radius, color: 0xf08c46, accent: 0xffe6ad,
    windup: 'converge', impact: 'smoke', motif: 'blast', activeLife: .38, residueLife: .6, particles: 26, reducedParticles: 2 }),
  ground_slam: Object.freeze({ style: 'ring', radius: ABILITIES.ground_slam.shape.radius,
    shape: ABILITIES.ground_slam.shape, color: 0xe88e50, accent: 0xffdf9c,
    windup: 'runes', impact: 'spark', motif: 'quake', activeLife: .34, residueLife: .45, particles: 22, reducedParticles: 2 }),
  armor_break: Object.freeze({ style: 'cleave', shape: ABILITIES.armor_break.shape,
    color: 0xdca56b, accent: 0xffdf9c, windup: 'blade', impact: 'spark',
    activeLife: .3, residueLife: .5, particles: 18, reducedParticles: 2 }),
  heavy_cleave: Object.freeze({ style: 'cleave', shape: ABILITIES.heavy_cleave.shape,
    color: 0xa8dce4, accent: 0xe3f5ef, windup: 'vertical', impact: 'spark',
    activeLife: .3, residueLife: .65, particles: 22, reducedParticles: 2 }),
  ember_bolt: Object.freeze({ style: 'ember', radius: ABILITIES.ember_bolt.projectile.explode.radius,
    projectileRadius: ABILITIES.ember_bolt.projectile.radius, color: 0xf08c46, accent: 0xffe6ad,
    windup: 'converge', impact: 'smoke', motif: 'blast', activeLife: .36, residueLife: .6,
    particles: 22, reducedParticles: 2 }),
  protective_shield: Object.freeze({ style: 'heal', radius: ABILITIES.protective_shield.shield.radius,
    color: 0x73baf0, accent: 0xa8dafa, windup: 'runes', impact: 'rise',
    activeLife: .4, residueLife: .5, particles: 16, reducedParticles: 2 }),
  turn_undead: Object.freeze({ style: 'heal', radius: ABILITIES.turn_undead.executeUndead.radius,
    color: 0xf5df9b, accent: 0xfff5cc, windup: 'runes', impact: 'rise',
    activeLife: .4, residueLife: .5, particles: 16, reducedParticles: 2 }),
  healing_light: Object.freeze({ style: 'heal', radius: ABILITIES.healing_light.heal.radius,
    color: 0x79dca0, accent: 0xc5d799, windup: 'runes', impact: 'rise',
    motif: 'heal', activeLife: .5, residueLife: .8, particles: 22, reducedParticles: 2 })
});
export const VFX_BAKED = Object.freeze({ lunge: 'lunge', volley: 'volley', frost_lance: 'frost_lance', whirl: 'whirl', pierce_shot: 'pierce_shot', flame_ring: 'flame_ring', blast_arrow: 'blast_arrow', heavy_cleave: 'heavy_cleave', healing_light: 'healing_light', ember_bolt: 'fireball' });
// Quality gate (cocy 10-13 "클래식보다 밋밋"): FX2 bakes for the other nine skills are nearly
// empty (peak 0~295 opaque px per frame) and replaced richer vector art. Only atlases that
// pass the coverage gate in tools/vfx are enabled; the rest stay classic until rebaked.
export const VFX_ATLASES = Object.freeze({ ember_bolt: VFX_BAKED.ember_bolt });
const VFX_REVISION = 'af4408539bbd'; // Cache key for the complete baked asset set.
const PROFILE_IDS = new Map(Object.entries(SKILL_VFX).map(([id, profile]) => [profile, id]));
export const VFX_CAPS = Object.freeze({ effects: 48, particles: 96, actors: 8, projectiles: 24, trail: 6 });
export const particleCount = (profile, reduced) => reduced ? profile.reducedParticles : profile.particles;
const clamp01 = value => Math.max(0, Math.min(1, value));
// total + elapsed are already sent to guests; phaseTicks/left are not. The
// windup fraction is reconstructed from the accepted total, including speed rounding.
export function windupProgress(act) {
  if (act.phase !== 'windup') return 1;
  const def = act.def || ABILITIES[act.id];
  if (!def.windupMs) return 1;
  const ratio = def.windupMs / Math.max(1, def.windupMs + def.lockMs);
  return clamp01(act.elapsed / Math.max(1, Math.round(act.total * ratio)));
}

export class SkillVfx {
  constructor(Graphics, layer, options = {}) {
    this.layer = layer;
    this.holy = new HolyVfx(Graphics, layer);
    // Additive light on the dark arena for shapes; particles stay one normal batch.
    const graphic = (add = true) => { const node = new Graphics(); node.visible = false; if (add) node.blendMode = 'add'; layer.addChild(node); return node; };
    this.effects = Array.from({ length: VFX_CAPS.effects }, () => ({ node: graphic(), wave: graphic(), left: 0 }));
    this.particles = Array.from({ length: VFX_CAPS.particles }, () => {
      const node = graphic(false); node.circle(0, 0, 1).fill(0xffffff);
      return { node, left: 0 };
    });
    this.actors = Array.from({ length: VFX_CAPS.actors }, () => ({ id: null, node: graphic(), guide: graphic(false),
      motes: Array.from({ length: 8 }, () => { const node = graphic(); node.circle(0, 0, 1.8).fill(0xffffff); return node; }) }));
    this.fxReady = false;
    this.fxError = null;
    this.fxImpacts = [];
    this.projectiles = Array.from({ length: VFX_CAPS.projectiles }, () => ({ id: null, node: graphic(),
      history: new Float64Array(VFX_CAPS.trail * 2), count: 0, clock: 0,
      drops: Array.from({ length: VFX_CAPS.trail }, () => {const n=graphic(false);n.ellipse(0,0,3,4).fill(0xcc1b42);return n;}),
      tail: Array.from({ length: VFX_CAPS.trail }, (_, i) => {
        const node = graphic(); node.moveTo(0, 0).lineTo(1, 0).stroke({ color: 0xffffff, width: 11 - i * 1.5 }); return node;
      }) }));
    this.fxRequested = options.effekseer ?? effekseerEnabled();
    this.quarksRequested = this.fxRequested;
    this.quarks = new QuarksVfx(Graphics, layer);
    this.atlases = options.atlases || VFX_ATLASES; // tools/vfx probes pass VFX_BAKED
    this.fxAssets = new Map(); this.fxLoads = new Map(); this.fxErrors = new Map();
    this.fxLoad = null; // No eager network/decode, including in the default-on mode.
  }
  profile(ability) { return SKILL_VFX[ability]; }
  setEffekseer(enabled) {
    this.fxRequested = Boolean(enabled);
    this.quarksRequested = this.fxRequested;
    if (!enabled) this.quarks.reset();
    if (!this.fxRequested) for (const slot of [...this.effects, ...this.actors, ...this.projectiles]) {
      if (slot.baked) slot.baked.visible = false; slot.bakedActive = false;
    }
  }
  requestSkill(ability, reduced = false) {
    if (!this.fxRequested || reduced || !this.atlases[ability]) return null;
    if (!this.fxLoads.has(ability)) this.fxLoads.set(ability, this.loadEffekseer(ability));
    return this.fxLoads.get(ability);
  }
  async loadEffekseer(ability = 'ember_bolt') {
    try {
      const url = new URL(`../../assets/vfx/${this.atlases[ability]}/atlas.json`, import.meta.url);
      url.searchParams.set('v', VFX_REVISION);
      const response = await fetch(url);
      if (!response.ok) throw new Error(`FX2 ${ability} metadata: ${response.status}`);
      const meta = await response.json();
      const imageUrl = new URL(meta.image, url); imageUrl.searchParams.set('v', VFX_REVISION);
      const sheet = await Assets.load(imageUrl.href);
      const frames = {};
      for (const [id, item] of Object.entries(meta.frames)) {
        const { x, y, w, h } = item.frame;
        frames[id] = new Texture({ source: sheet.source, frame: new Rectangle(x, y, w, h) });
      }
      const clips = Object.fromEntries(Object.entries(meta.clips).map(([id, clip]) =>
        [id, { ...clip, textures: clip.frames.map(key => frames[key]) }]));
      this.fxAssets.set(ability, { clips, meta });
      // One shared bounded pool, not one pool per skill. Allocate only after success.
      const sprite = () => { const node = new Sprite(Texture.EMPTY); node.visible = false; this.layer.addChild(node); return node; };
      for (const slot of [...this.effects, ...this.actors, ...this.projectiles]) if (!slot.baked) slot.baked = sprite();
      this.fxReady = true;
      return true;
    } catch (error) {
      this.fxErrors.set(ability, String(error)); this.fxError = String(error); return false;
    }
  }
  baked(slot, ability, label, x, y, rotation, extent, progress = 0) {
    const clip = this.fxAssets.get(ability)?.clips[label];
    if (!clip || !slot.baked) return false;
    const node = slot.baked;
    node.anchor.set(...clip.anchor);
    const index = Math.min(clip.textures.length - 1, Math.floor(clamp01(progress) * clip.textures.length));
    node.texture = clip.textures[index];
    node.position.set(x, y); node.rotation = rotation || 0;
    node.scale.set(extent / clip.support);
    node.alpha = 1; node.visible = true;
    slot.bakedClip = clip; slot.bakedActive = true;
    return true;
  }
  bakeEffect(slot, profile, kind, x, y, facing, radius, shape, reduced) {
    const ability = (PROFILE_IDS.get(profile) ?? profile.abilityId);
    this.requestSkill(ability, reduced);
    slot.bakedActive = false;
    if (slot.baked) slot.baked.visible = false;
    if (reduced || !this.fxRequested) return;
    const label = kind === 'residue' ? 'impact' : profile.projectileRadius ? 'impact' : 'active';
    // Residue for the dash is its observed travelled segment, never full dash range.
    const dash = profile.style === 'dash';
    if (kind === 'residue' && !dash && !profile.projectile) return;
    const selected = dash ? 'active' : label;
    const extent = shape?.range || radius;
    if (this.baked(slot, ability, selected, x, y, profile.style === 'cleave' || dash ? facing : 0, extent)) {
      slot.node.visible = false;
      // Native fill stays within the hit footprint; the exact gameplay boundary
      // remains a thin vector guide instead of asking smoke/glow to telegraph it.
      slot.bakedBoundary = !dash && (shape?.type === 'cone' || radius > 0);
      slot.wave.clear();
      if (slot.bakedBoundary) {
        if (shape?.type === 'cone') shapePath(slot.wave, shape);
        else slot.wave.circle(0, 0, radius);
        slot.wave.stroke({ color: profile.color, width: 1.5, alignment: 1, alpha: .55 });
        slot.wave.scale.set(1);
      }
      slot.wave.visible = slot.bakedBoundary;
    }
  }
  reset() {
    this.quarks.reset();
    this.holy.reset();
    for (const slot of [...this.effects, ...this.actors, ...this.projectiles]) { if (slot.baked) slot.baked.visible = false; slot.bakedActive = false; }
    for (const slot of this.projectiles) { if (slot.baked) slot.baked.visible = false; slot.bakedAge = 0; }
    for (const item of [...this.effects, ...this.particles]) { item.left = 0; item.node.visible = false; if (item.wave) item.wave.visible = false; }
    for (const slot of this.actors) { slot.id = null; slot.node.visible = false; slot.guide.visible = false; for (const node of slot.motes) node.visible = false; }
    for (const slot of this.projectiles) { slot.id = null; slot.node.visible = false; for (const node of slot.drops) node.visible=false; for (const node of slot.tail) node.visible = false; }
  }
  effect(profile, kind, x, y, facing, radius, shape, reduced, ownerId = null) {
    this.requestSkill((PROFILE_IDS.get(profile) ?? profile.abilityId), reduced);
    const slot = this.effects.find(item => item.left <= 0);
    if (!slot) return false;
    Object.assign(slot, { kind, radius, reduced, ownerId, left: kind === 'residue' ? (reduced ? .2 : profile.residueLife) : profile.activeLife });
    slot.total = slot.left;
    const g = slot.node, wave = slot.wave;
    wave.clear(); wave.position.set(x, y); wave.rotation = facing || 0; wave.scale.set(.3); wave.visible = false;
    g.blendMode = wave.blendMode = 'add';
    g.clear(); g.position.set(x, y); g.rotation = facing || 0; g.scale.set(1); g.visible = true;
    if (profile.drawEffect) {
      profile.drawEffect(this, slot, { kind, x, y, facing, radius, shape, reduced });
      return true;
    }
    if (profile.style === 'dash') {
      // Only the observed, short travelled segment, never the untraversed dash range.
      g.moveTo(-radius, 0).lineTo(0, 0).stroke({ color: profile.color, width: reduced ? 1 : 3, alpha: .45 });
      if (!reduced) {
        g.moveTo(-radius, 0).lineTo(0, 0).stroke({ color: profile.color, width: 14, alpha: .18 })
          .moveTo(-radius, 0).lineTo(0, 0).stroke({ color: profile.accent, width: 2, alpha: .9 });
        for (let i = 0; i < 3; i++) g.moveTo(-radius * (.25 + i * .25), -7).lineTo(-radius * (.15 + i * .25), 0).lineTo(-radius * (.25 + i * .25), 7);
        g.stroke({ color: profile.accent, width: 2, alpha: .55 });
      }
    } else if (profile.projectile && profile.style !== 'ember') {
      if (profile.style === 'frost') {
        g.poly([-radius, 0, 0, -radius * .4, radius, 0, 0, radius * .4])
          .stroke({ color: profile.color, width: 1, alignment: 1, alpha: .7 });
        if (!reduced) {
          g.poly([-radius, 0, 0, -radius * .4, radius, 0, 0, radius * .4]).fill({ color: profile.color, alpha: .3 });
          for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; g.moveTo(0, 0).lineTo(Math.cos(a) * radius * .95, Math.sin(a) * radius * .95); }
          g.stroke({ color: profile.accent, width: 2, alpha: .85 });
        }
      } else {
        g.moveTo(-radius, 0).lineTo(radius - 1, 0)
          .stroke({ color: profile.accent, width: reduced ? 1 : 2, alpha: .8 });
        g.moveTo(0, -radius * .4).lineTo(radius - 1, 0).lineTo(0, radius * .4)
          .stroke({ color: profile.color, width: 1, alpha: .7 });
        if (!reduced) {
          // Impact star stays inside the projectile radius.
          for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, l = radius * (i % 2 ? .55 : .95); g.moveTo(0, 0).lineTo(Math.cos(a) * l, Math.sin(a) * l); }
          g.stroke({ color: profile.accent, width: 2, alpha: .9 }).circle(0, 0, radius * .35).fill({ color: profile.accent, alpha: .55 });
        }
      }
    } else if (profile.style === 'cleave') {
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
        if (!reduced) {
          for (let i = 0; i < count; i++) {
            const angle = -half * .72 + i * half * 1.44 / (count - 1);
            g.moveTo(Math.cos(angle) * 22, Math.sin(angle) * 22).lineTo(Math.cos(angle) * (shape.range - 5), Math.sin(angle) * (shape.range - 5));
          }
          g.stroke({ color: profile.color, width: 6, alpha: .14 });
        }
      } else {
        shapePath(wave, shape).fill({ color: profile.color, alpha: reduced ? .05 : .26 });
        wave.visible = !reduced;
        // Inner-aligned stroke never grows beyond the hit boundary.
        shapePath(g, shape).stroke({ color: profile.coreAccent ?? profile.accent, width: reduced ? 2 : 5, alignment: 1, alpha: .95 });
        const half = shape.arc * Math.PI / 360;
        g.arc(0, 0, shape.range - 4, -half, half).stroke({ color: profile.color, width: 3, alpha: .65 });
        if (!reduced) {
          // Inner crescents read as the blade's swing passing through the cone.
          for (const f of [.45, .65, .85]) g.arc(0, 0, shape.range * f, -half * .9, half * .9).stroke({ color: profile.accent, width: 7 - f * 5, alpha: .3 + f * .4 });
        }
      }
    } else {
      slot.kind = 'wave';
      g.circle(0, 0, radius).stroke({ color: profile.color, width: reduced ? 2 : 5, alignment: 1, alpha: .95 });
      if (!reduced) {
        wave.circle(0, 0, radius).fill({ color: profile.color, alpha: .2 })
          .circle(0, 0, radius * .3).fill({ color: profile.accent, alpha: .55 });
        wave.visible = true;
        this.motif(g, profile, radius);
      }
      if (profile.style === 'heal') g.circle(0, 0, radius - 6).stroke({ color: profile.accent, width: reduced ? 1 : 2, alpha: reduced ? .3 : .6 });
    }
    this.bakeEffect(slot, profile, kind, x, y, facing, radius, shape, reduced);
    return true;
  }
  // Decoration inside an area's exact radius; never draws past it.
  motif(g, profile, radius) {
    const tau = Math.PI * 2;
    if (profile.motif === 'quake') {
      for(let i=0;i<8;i++) {const a=i*tau/8,c=Math.cos(a),s=Math.sin(a);
        g.moveTo(c*radius*.25,s*radius*.25).lineTo(c*radius*.5-s*4,s*radius*.5+c*4).lineTo(c*radius*.85,s*radius*.85);
      }
      g.stroke({color:profile.accent,width:2,alpha:.7});
    } else if (profile.motif === 'whirl') {
      for (let i = 0; i < 3; i++) {
        const a = i * tau / 3;
        g.arc(0, 0, radius * .78, a, a + 1.5).stroke({ color: profile.accent, width: 6, alpha: .85 })
          .arc(0, 0, radius * .52, a + .7, a + 1.9).stroke({ color: profile.color, width: 4, alpha: .6 });
      }
    } else if (profile.motif === 'flame') {
      for (let i = 0; i < 14; i++) {
        const a = i * tau / 14, w = .16, inner = radius * .55, outer = radius * (i % 2 ? .86 : .97);
        g.poly([Math.cos(a - w) * inner, Math.sin(a - w) * inner, Math.cos(a) * outer, Math.sin(a) * outer, Math.cos(a + w) * inner, Math.sin(a + w) * inner])
          .fill({ color: i % 2 ? profile.accent : profile.color, alpha: .7 });
      }
      g.circle(0, 0, radius * .55).stroke({ color: profile.accent, width: 3, alpha: .7 });
    } else if (profile.motif === 'blast') {
      for (let i = 0; i < 12; i++) {
        const a = i * tau / 12 + .13, l = radius * (i % 2 ? .62 : .94);
        g.moveTo(Math.cos(a) * radius * .2, Math.sin(a) * radius * .2).lineTo(Math.cos(a) * l, Math.sin(a) * l);
      }
      g.stroke({ color: profile.accent, width: 4, alpha: .85 }).circle(0, 0, radius * .38).fill({ color: profile.accent, alpha: .6 });
    } else if (profile.motif === 'heal') {
      const r = radius * .26;
      g.rect(-r * .28, -r, r * .56, r * 2).fill({ color: profile.accent, alpha: .7 })
        .rect(-r, -r * .28, r * 2, r * .56).fill({ color: profile.accent, alpha: .7 });
      for (let i = 0; i < 8; i++) { const a = i * tau / 8; g.circle(Math.cos(a) * radius * .7, Math.sin(a) * radius * .7, 4).fill({ color: profile.accent, alpha: .75 }); }
      g.circle(0, 0, radius * .45).stroke({ color: profile.color, width: 3, alpha: .55 });
    }
  }
  emit(profile, kind, x, y, facing = 0, radius = 20, reduced = false) {
    let remaining = particleCount(profile, reduced), spawned = 0;
    for (const slot of this.particles) {
      if (!remaining) break;
      if (slot.left > 0) continue;
      const i = remaining--, angle = facing + i * 2.399963;
      // Explosion smoke carries a hot ember in every other slot (same slot count).
      const ember = kind === 'smoke' && !reduced && i % 2 === 0;
      const cursed = kind === 'curseSmoke', blood = kind === 'blood';
      const smoke = (kind === 'smoke' || kind === 'dust' || cursed) && !ember;
      const rise = kind === 'rise';
      const dist = smoke ? radius * (cursed ? .65 : .35) : rise ? 6 + (i % 4) * 6 : ember ? radius * .15 : 0;
      const motion = reduced ? .25 : 1, speed = ember ? radius * 3.2 : 120 + (i % 3) * 45;
      Object.assign(slot, { kind: ember ? 'ember' : kind, reduced, x: x + Math.cos(angle) * dist, y: y + Math.sin(angle) * dist,
        vx: (rise ? Math.cos(angle) * 6 : smoke ? Math.cos(angle) * 12 : Math.cos(angle) * speed) * motion,
        vy: (rise ? -60 - i * 3 : smoke ? -12 : Math.sin(angle) * speed) * motion,
        total: smoke || rise || blood ? profile.residueLife : ember ? .36 : .24, size: smoke ? (cursed ? 10 : 5) : rise ? 2 : 2.6 + (i % 2) * .6 });
      slot.left = slot.total;
      slot.node.position.set(slot.x, slot.y); slot.node.rotation = rise ? 0 : angle;
      slot.node.tint = cursed ? (i%2?0x633c7a:0x6c915a) : blood ? (i%2?0xd81b42:0x7e102d) : smoke ? (kind === 'dust' ? 0x8a9b88 : 0x6e7370) : i % 2 ? profile.accent : profile.color;
      slot.node.scale.set(kind === 'shard' ? slot.size * 1.8 : slot.size * (ember ? 1.4 : 1),
        smoke ? slot.size : slot.size * (rise ? 2.4 : kind === 'shard' ? .35 : .5));
      slot.node.alpha = smoke ? .25 : reduced ? .35 : .95; slot.node.visible = true;
      spawned++;
    }
    return spawned;
  }
  event(event, world, reduced = false) {
    if(event.type==='projectile' && event.volley20) {
      const profile=this.profile('volley');
      // Journal identity survives missing actors, owner leave and same-tick expiry.
      for(const degrees of VOLLEY_WAVES[event.wave-1]) {
        const facing=event.facing+degrees*Math.PI/180;
        this.effect(profile,'active',event.ox+Math.cos(facing)*(PLAYER_BASE.r+4),event.oy+Math.sin(facing)*(PLAYER_BASE.r+4),facing,profile.projectileRadius,null,reduced);
      }
      return true;
    }
    if(this.quarksRequested && !reduced)this.quarks.event(event,world);
    if (event.type === 'turnUndead') { this.holy.event(event, world, reduced); return false; }
    const profile = this.profile(event.ability);
    if (!profile) return false;
    this.requestSkill(event.ability, reduced);
    if (profile.onEvent) return profile.onEvent(this, event, world, reduced);
    if (event.type === 'hit') {
      if (profile.style !== 'heal') this.emit(profile, profile.impact === 'shard' ? 'shard' : 'spark', event.x, event.y, 0, 20, reduced);
      if (profile.projectile && profile.style !== 'ember') {
        const source = world.entities?.find(e => e.id === event.src);
        const facing = source?.act?.facing ?? source?.facing ?? 0;
        this.effect(profile, 'residue', event.x, event.y, facing, profile.projectileRadius, null, reduced);
      }
      return false; // Existing numbers, impact, hit-stop and camera remain untouched.
    }
    if (event.type === 'explode' && profile.style === 'ember') {
      this.effect(profile, 'active', event.x, event.y, 0, event.radius, null, reduced, event.presentationOwner);
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
    const act = entity.act, profile = this.profile(act?.id);
    if (!profile || entity.dead || entity.kind !== 'player') return false;
    this.requestSkill(act.id, reduced);
    if (profile.onActor) return profile.onActor(this, entity, worldTick, reduced);
    let slot = this.actors.find(item => item.id === entity.id);
    if (!slot) slot = this.actors.find(item => item.id === null);
    if (!slot) return true;
    const key = `${act.id}:${worldTick - act.elapsed}`;
    if (slot.id !== entity.id || slot.key !== key) {
      Object.assign(slot, { id: entity.id, key, fired: false, trailX: entity.x, trailY: entity.y });
      const g = slot.node; g.clear(); g.rotation = 0; g.scale.set(1);g.blendMode=act.id==='blood_spear'?'normal':'add';
      slot.guide.clear(); slot.guide.visible = false;
      if (act.id === 'blood_spear') {
        drawBloodLance(g, null, reduced);
        const offset=entity.r+4, range=act.growth?.range??profile.projectile.rangePx, width=profile.projectile.radius*2;
        slot.guide.rect(offset,-width/2,range,width).fill({color:0x650e2c,alpha:.2}).stroke({color:0xd84665,width:1,alpha:.65})
          .moveTo(offset,0).lineTo(offset+range,0).stroke({color:0xff7d99,width:1.5,alpha:.8});
      } else if (profile.windup === 'blade') {
        g.moveTo(-14, 0).lineTo(20, 0).stroke({ color: profile.color, width: 10, alpha: .22 })
          .moveTo(-12, 0).lineTo(18, 0).stroke({ color: profile.accent, width: 3, alpha: .95 })
          .poly([18, -4, 26, 0, 18, 4]).fill({ color: profile.accent, alpha: .9 });
      } else if (profile.windup === 'bow') {
        g.arc(0, 0, 14, -Math.PI / 2, Math.PI / 2).stroke({ color: profile.color, width: 8, alpha: .2 })
          .arc(0, 0, 14, -Math.PI / 2, Math.PI / 2)
          .stroke({ color: profile.color, width: 3, alpha: .9 })
          .moveTo(0, -14).lineTo(-9, 0).lineTo(0, 14)
          .stroke({ color: profile.accent, width: 2, alpha: .9 })
          .moveTo(-9, 0).lineTo(22, 0).stroke({ color: profile.accent, width: 2, alpha: .8 });
        if(act.pierce20) {
          for(const y of [-1.5,1.5]) g.moveTo(-7,y).lineTo(7,y).stroke({color:profile.accent,width:1,alpha:.95});
          for(const x of [-4,0,4]) g.circle(x,0,2).stroke({color:profile.accent,width:1,alpha:.9});
        }
      } else if (profile.windup === 'crystal') {
        g.poly([-16, 0, 0, -8, 16, 0, 0, 8]).fill({ color: profile.color, alpha: .5 })
          .stroke({ color: profile.accent, width: 2, alignment: 1, alpha: .95 })
          .poly([-7, 0, 0, -14, 7, 0, 0, 14]).stroke({ color: profile.accent, width: 1, alpha: .6 });
        if(act.id==='frost_lance' && act.frost20) g.moveTo(-10,0).lineTo(-3,-3).lineTo(3,0).lineTo(8,-2).stroke({color:profile.accent,width:1,alpha:.95}).moveTo(-3,-3).lineTo(-1,3).lineTo(3,0).stroke({color:profile.accent,width:1,alpha:.95});
      } else if (profile.windup === 'vertical') {
        g.moveTo(0, 8).lineTo(0, -56).stroke({ color: profile.color, width: 16, alpha: .2 })
          .moveTo(0, 8).lineTo(0, -56).stroke({ color: profile.accent, width: 3, alpha: .95 })
          .circle(0, -56, 6).fill({ color: profile.accent, alpha: .8 });
      } else if (profile.windup === 'converge') {
        g.circle(0, 0, 12).fill({ color: profile.color, alpha: .3 })
          .circle(0, 0, 7).fill({ color: profile.color, alpha: .55 })
          .circle(0, 0, 3.5).fill({ color: profile.accent, alpha: 1 });
      } else {
        g.circle(0, 0, 28).stroke({ color: profile.color, width: 8, alpha: .2 })
          .circle(0, 0, 28).stroke({ color: profile.color, width: 2.5, alpha: .9 })
          .circle(0, 0, 20).stroke({ color: profile.accent, width: 1.5, alpha: .6 });
        for (let i = 0; i < 8; i++) {
          const a = i * Math.PI / 4;
          g.moveTo(Math.cos(a) * 20, Math.sin(a) * 20).lineTo(Math.cos(a) * 27, Math.sin(a) * 27);
        }
        g.stroke({ color: profile.accent, width: 2.5, alpha: .9 });
      }
    }
    slot.seen = true;
    if(act.whirl20) {
      const frame=whirlFrame(act),radius=act.def.shape.radius,g=slot.node;
      slot.guide.visible=false;slot.motes.forEach(n=>n.visible=false);if(slot.baked)slot.baked.visible=false;
      g.clear();g.visible=frame.segment!==0;g.position.set(entity.x,entity.y);g.scale.set(1);
      g.rotation=act.facing+(reduced ? 0 : frame.progress*Math.PI*2);
      g.alpha=reduced ? .55 : .9;
      const color=frame.segment===2 ? profile.accent : profile.color;
      // Inward strokes stay inside the exact contact circle. Two static crescents
      // also retain the dual-rotation cue with reduced motion (no trail/shake).
      g.arc(0,0,radius,-Math.PI*.4,Math.PI*.4).stroke({color,width:reduced?3:6,alignment:1,alpha:.9})
        .arc(0,0,radius*.78,Math.PI*.6,Math.PI*1.4).stroke({color:profile.accent,width:3,alignment:1,alpha:.75});
      return true;
    }

    slot.guide.visible=act.id==='blood_spear' && act.phase==='windup';
    if(slot.guide.visible){slot.guide.position.set(entity.x,entity.y);slot.guide.rotation=act.facing;}
    const completedLunge=act.lunge20 ? lungeFrame(act) : null;
    const charging = act.phase === 'windup' || act.phase === 'lock' || !!(completedLunge && act.elapsed===act.phaseTicks.windup+act.phaseTicks.lock), p = windupProgress(act);
    const x = (act.volley20 ? act.ox : entity.x) + (profile.style === 'heal' || profile.style === 'ring' ? 0 : Math.cos(act.facing) * (entity.r + 6));
    const y = (act.volley20 ? act.oy : entity.y) + (profile.style === 'heal' || profile.style === 'ring' ? 0 : Math.sin(act.facing) * (entity.r + 6) - 20);
    slot.node.visible = charging; slot.node.position.set(x, y);
    if (profile.windup === 'blade' || profile.windup === 'bow' || profile.windup === 'crystal') slot.node.rotation = act.facing;
    slot.node.alpha = (reduced ? .35 : 1) * (.25 + p * .75);
    if (!reduced) slot.node.scale.set(.85 + p * .3);
    if (profile.style === 'heal') slot.node.rotation = reduced ? 0 : p * .55;
    else if (profile.style === 'ring' && !reduced) slot.node.rotation = p * 2.4;
    for (let i = 0; i < slot.motes.length; i++) {
      const node = slot.motes[i];
      node.visible = !(act.volley20 && reduced) && charging && profile.style !== 'cleave' && i < (reduced ? 2 : 8);
      if (!node.visible) continue;
      const a = i * Math.PI / 4 + (reduced ? 0 : p * .8);
      const r = profile.style === 'ember' ? 26 * (1 - p) + 3 : 22;
      node.position.set(x + Math.cos(a) * r, y + Math.sin(a) * r);
      node.tint = i % 2 ? profile.accent : profile.color; node.alpha = reduced ? .3 : .9; node.scale.set(reduced ? 1 : 1 + p * .6);
    }
    // Recovery also covers an active phase omitted by a guest snapshot; stable
    // tick-elapsed identity prevents repeated waves when snapshots replace act objects.
    if (!act.volley20 && !charging && !slot.fired) {
      slot.fired = true;
      if (profile.style === 'ring') {
        this.effect(profile, 'active', entity.x + Math.cos(act.facing)*(act.def.shape.offset||0), entity.y + Math.sin(act.facing)*(act.def.shape.offset||0), act.facing, act.def.shape.radius, {...act.def.shape,offset:0}, reduced);
      } else if (profile.style === 'cleave') {
        const shape = act.def.shape;
        this.effect(profile, 'active', entity.x, entity.y, act.facing, 0, shape, reduced);
        this.effect(profile, 'residue', entity.x, entity.y, act.facing, 0, shape, reduced);
        this.emit(profile, 'dust', entity.x + Math.cos(act.facing) * shape.range * .6,
          entity.y + Math.sin(act.facing) * shape.range * .6, act.facing, 18, reduced);
      } else if (profile.projectile && profile.style !== 'ember') {
        const pr = profile.projectile;
        for (let i = 0; i < pr.count; i++) {
          const spread = pr.count > 1 ? (i / (pr.count - 1) - .5) * pr.spreadDeg * Math.PI / 180 : 0;
          const facing = act.facing + spread;
          this.effect(profile, 'active', entity.x + Math.cos(facing) * (entity.r + 4),
            entity.y + Math.sin(facing) * (entity.r + 4), facing, pr.radius, null, reduced);
        }
      } else if (profile.style === 'dash') {
        const radius = entity.r + profile.dash.bodyPad;
        slot.node.clear().arc(0, 0, radius, -Math.PI / 3, Math.PI / 3)
          .stroke({ color: profile.accent, width: reduced ? 2 : 4, alignment: 1, alpha: .85 })
          .moveTo(0, 0).lineTo(radius - 2, 0).stroke({ color: profile.color, width: 2, alpha: .65 });
        if (!reduced) slot.node.arc(0, 0, radius, -Math.PI / 2.4, Math.PI / 2.4).stroke({ color: profile.color, width: 14, alignment: 1, alpha: .25 })
          .arc(0, 0, radius * .7, -Math.PI / 3.5, Math.PI / 3.5).stroke({ color: profile.accent, width: 3, alpha: .7 });
      }
    }
    if (profile.style === 'dash') {
      if (charging) { slot.trailX = entity.x; slot.trailY = entity.y; }
      else {
        const segment=act.lunge20 ? lungeFrame(act).segment : 1;
        slot.node.visible = act.lunge20 ? segment!==0 : act.phase === 'active'; slot.node.position.set(entity.x, entity.y);
        slot.node.alpha = act.lunge20 && segment===2 ? (reduced ? .55 : .9) : (reduced ? .35 : .8);
        const dx = entity.x - slot.trailX, dy = entity.y - slot.trailY, distance = Math.hypot(dx, dy);
        const radius = entity.r + profile.dash.bodyPad;
        if (act.phase === 'active' && distance >= radius * .5) {
          if (!reduced) this.effect(profile, 'residue', entity.x, entity.y, Math.atan2(dy, dx),
            Math.min(distance, radius, profile.dash.distance), null, reduced);
          slot.trailX = entity.x; slot.trailY = entity.y;
        }
      }
    }
    if (slot.baked) slot.baked.visible = false;
    if (!reduced && this.fxRequested && charging) this.baked(slot, act.id, 'windup', x, y,
      profile.windup === 'bow' || profile.windup === 'blade' || profile.windup === 'crystal' ? act.facing : 0, 24, p);
    if (!reduced && this.fxRequested && profile.style === 'dash' && (act.lunge20 ? !!completedLunge.segment : act.phase === 'active')) {
      this.baked(slot, act.id, 'impact', entity.x, entity.y, act.facing, entity.r + profile.dash.bodyPad,
        clamp01(act.elapsed / Math.max(1, act.total)));
    }
    return true;
  }
  projectile(particle, alpha, reduced, dt) {
    const profile = this.profile(particle.abilityId);
    this.requestSkill(particle.abilityId, reduced);
    let slot = this.projectiles.find(item => item.id === particle.id);
    if (!slot) slot = this.projectiles.find(item => item.id === null);
    if (!slot) return;
    if (slot.id !== particle.id) {
      Object.assign(slot, { id: particle.id, prevX: particle.x, prevY: particle.y, count: 0, clock: 0, bakedAge: 0, frostFacet:false });
      const g = slot.node; g.clear();g.blendMode=particle.abilityId==='blood_spear'?'normal':'add';
      if (profile.drawProjectile) profile.drawProjectile(g, particle, reduced);
      else if (profile.projectile && profile.style !== 'ember') {
        const r = particle.r;
        if (profile.style === 'frost') g.poly([-r, 0, -r * .2, -r * .45, r, 0, -r * .2, r * .45])
          .fill({ color: profile.color, alpha: .8 });
        else g.poly([r, 0, 0, -r * .45, 0, r * .45]).fill({ color: profile.color, alpha: .85 });
        g.moveTo(-r + 1, 0).lineTo(r - 1, 0)
          .stroke({ color: profile.accent, width: profile.style === 'pierce' ? 3 : 2, alpha: .95 });
        // Glow stays inside the projectile radius.
        if (!reduced) g.circle(0, 0, r * .95).fill({ color: profile.color, alpha: .22 }).circle(r * .45, 0, r * .3).fill({ color: profile.accent, alpha: .9 });
      } else g.circle(0, 0, particle.r).fill({ color: profile.color, alpha: .85 })
        .circle(0, 0, particle.r * .5).fill({ color: profile.accent, alpha: .85 })
        .circle(0, 0, particle.r * .22).fill({ color: 0xffffff, alpha: .9 });
    }
    if(particle.frost20 && particle.abilityId==='frost_lance' && !slot.frostFacet) {
      slot.frostFacet=true;
      const g=slot.node,r=particle.r;
      g.moveTo(-r*.65,0).lineTo(-r*.2,-r*.18).lineTo(r*.2,0).lineTo(r*.55,-r*.08).stroke({color:profile.accent,width:1,alpha:.95})
        .moveTo(-r*.2,-r*.18).lineTo(-r*.1,r*.18).lineTo(r*.2,0).stroke({color:profile.accent,width:1,alpha:.95});
    }
    if(particle.pierce20 && particle.abilityId==='pierce_shot') {
      // Identity-local static grooves/rings, wholly inside radius8; no extra nodes.
      const g=slot.node,r=particle.r;
      g.clear().poly([r,0,0,-r*.45,0,r*.45]).fill({color:profile.color,alpha:.85});
      for(const y of [-1.5,1.5]) g.moveTo(-r+1,y).lineTo(r-1,y).stroke({color:profile.accent,width:1,alpha:.95});
      for(const x of [-4,0,4]) g.circle(x,0,2).stroke({color:profile.accent,width:1,alpha:.9});
    }
    slot.seen = true;
    const x = slot.prevX + (particle.x - slot.prevX) * alpha, y = slot.prevY + (particle.y - slot.prevY) * alpha;
    slot.node.visible = true; slot.node.position.set(x, y);
    slot.node.alpha = particle.presentationAlpha ?? 1;
    slot.node.rotation = Math.atan2(particle.vy, particle.vx);
    slot.clock += dt;
    if (slot.clock >= .025 || !slot.count) {
      slot.history.copyWithin(2, 0, (VFX_CAPS.trail - 1) * 2);
      slot.history[0] = x; slot.history[1] = y;
      slot.count = Math.min(VFX_CAPS.trail, slot.count + 1); slot.clock %= .025;
    }
    let lastX = x, lastY = y;
    for (let i = 0; i < slot.tail.length; i++) {
      const drop=slot.drops[i];drop.visible=false;
      const node = slot.tail[i], hx = slot.history[i * 2], hy = slot.history[i * 2 + 1];
      node.visible = !(particle.volley20 && reduced) && i < slot.count && i < (reduced ? 1 : VFX_CAPS.trail);
      if (!node.visible) continue;
      node.position.set(lastX, lastY); node.rotation = Math.atan2(hy - lastY, hx - lastX);
      node.scale.set(Math.hypot(hx - lastX, hy - lastY), 1);
      node.tint = profile.color;
      node.alpha = (reduced ? .1 : .7) * (1 - i / VFX_CAPS.trail) * (particle.presentationAlpha ?? 1);
      if(particle.abilityId==='blood_spear' && !reduced && i>0){drop.visible=true;drop.position.set(hx,hy+2+i*1.5);drop.alpha=(1-i/VFX_CAPS.trail)*.8;drop.scale.set(1-i*.08);}
      lastX = hx; lastY = hy;
    }
    if (slot.baked) slot.baked.visible = false;
    if (!reduced && this.fxRequested) {
      const clip = this.fxAssets.get(particle.abilityId)?.clips.projectile;
      slot.bakedAge += dt;
      // The baked flight clip is a small core inside the hit radius; it overlays the vector
      // body and trail instead of replacing them, or the shot reads as invisible in flight.
      if (clip) this.baked(slot, particle.abilityId, 'projectile', x, y, slot.node.rotation,
        particle.r, (slot.bakedAge * clip.fps % clip.textures.length) / clip.textures.length);
      if (slot.baked?.visible) slot.baked.alpha = particle.presentationAlpha ?? 1;
    }
  }

  snapshot(world) {
    for (const slot of this.projectiles) {
      const particle = world.projectiles.find(item => item.id === slot.id);
      if (particle) { slot.prevX = particle.x; slot.prevY = particle.y; }
    }
  }
  update(world, alpha, dt, reduced) {
    this.quarks.update(world,dt,this.quarksRequested && !reduced);
    if(world.round?.state && world.round.state!=='running'){this.reset();return;}
    this.holy.update(dt);
    for (const slot of this.actors) slot.seen = false;
    for (const entity of world.entities) this.actor(entity, world.tick, reduced);
    for (const slot of this.actors) if (!slot.seen) {
      slot.id = null; slot.node.visible = false; slot.guide.visible = false; for (const node of slot.motes) node.visible = false;
      if (slot.baked) slot.baked.visible = false;
    }
    for (const slot of this.projectiles) slot.seen = false;
    for (const particle of world.projectiles) if (SKILL_VFX[particle.abilityId]?.projectileRadius) this.projectile(particle, alpha, reduced, dt);
    for (const slot of this.projectiles) if (!slot.seen) {
      slot.id = null; slot.node.visible = false; for (const node of slot.drops) node.visible=false; for (const node of slot.tail) node.visible = false;
      if (slot.baked) slot.baked.visible = false;
    }
    for (const slot of this.effects) {
      if (slot.left <= 0) continue;
      if (slot.ownerId != null) {
        let owner;
        for (const entity of world.entities) if (entity.id === slot.ownerId) { owner = entity; break; }
        if (!owner || owner.dead) { slot.left = 0; slot.node.visible = slot.wave.visible = false; continue; }
      }
      slot.left = Math.max(0, slot.left - dt); slot.node.visible = slot.left > 0;
      const age = 1 - slot.left / slot.total;
      // Full-size boundary stays exact; only the interior wave grows up to it.
      slot.node.scale.set(1);
      slot.node.alpha = reduced ? .35 * (1 - age) : Math.pow(1 - age, .6);
      slot.wave.visible = slot.left > 0 && (slot.kind === 'hands' || slot.kind === 'wave' && !reduced);
      slot.wave.scale.set(.3 + .7 * Math.min(1, age * 5));
      slot.wave.alpha = slot.node.alpha;
      if(slot.kind==='hands'){const rise=reduced||slot.reduced?1:1-Math.pow(1-Math.min(1,age*4),3);slot.wave.y=slot.originY+(1-rise)*28;slot.wave.scale.set(1,.18+.82*rise);}
      if (slot.baked) {
        slot.baked.visible = slot.left > 0 && slot.bakedActive && !reduced;
        if (slot.baked.visible) {
          const clip = slot.bakedClip;
          slot.baked.texture = clip.textures[Math.min(clip.textures.length - 1, Math.floor(age * clip.textures.length))];
          slot.baked.alpha = Math.pow(1 - age, .6);
          slot.node.visible = false;
          slot.wave.visible = !!slot.bakedBoundary; slot.wave.scale.set(1);
        }
      }
    }
    for (const slot of this.particles) {
      if (slot.left <= 0) continue;
      slot.left = Math.max(0, slot.left - dt); slot.node.visible = slot.left > 0;
      slot.x += slot.vx * dt; slot.y += slot.vy * dt;
      slot.node.position.set(slot.x, slot.y);
      const fade = slot.left / slot.total;
      slot.node.alpha = fade * (slot.kind === 'smoke' || slot.kind === 'dust' || slot.kind === 'curseSmoke' ? .25 : reduced ? .35 : .95);
      if (slot.kind === 'smoke' || slot.kind === 'dust' || slot.kind === 'curseSmoke') slot.node.scale.set(slot.size * (1 + (1 - fade) * .6));
      // Sparks and embers decelerate so the burst snaps out, then hangs.
      else if (!slot.reduced && slot.kind !== 'rise') { const damp = Math.exp(-5 * dt); slot.vx *= damp; slot.vy *= damp; }
    }
  }
}
