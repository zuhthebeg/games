import { Container, Graphics, GraphicsContext } from '../../vendor/pixi-8.22.0.min.mjs';

const COLORS = [0xcde8ee, 0x53b9ff, 0x9cdaff, 0xbe84ff, 0xffd36f];
export function weaponGlowSpec(enhance = 0, reduced = false) {
  const level = Math.max(0, Math.min(10, Math.floor(enhance)));
  return { level, color: level >= 6 ? COLORS[level - 6] : null,
    particles: reduced || level < 9 ? 0 : level === 9 ? 6 : 10,
    pulse: !reduced && level >= 8, trail: !reduced && level >= 8,
    ring: level >= 10 };
}

// Geometry contexts are shared by level/kit; no filters, canvas allocation, or
// redraw per frame. At most 10 tiny orbiting sprites, allocated once per visual.
const contexts = new Map();
function contextFor(spec, kit) {
  const key = `${spec.level}:${kit}`;
  if (contexts.has(key)) return contexts.get(key);
  const ctx = new GraphicsContext();
  for (const [width, alpha] of [[12, .07], [7, .16], [2, .65]]) {
    if (kit === 'bow') ctx.moveTo(-7,-19).quadraticCurveTo(17,0,-7,19);
    else if (kit === 'focus') ctx.circle(0,0,9).moveTo(0,9).lineTo(0,21);
    else ctx.moveTo(0,15).lineTo(0,-21).lineTo(3,-15).moveTo(-6,8).lineTo(6,8);
    ctx.stroke({color: spec.color, width, alpha});
  }
  if (spec.ring) {
    ctx.ellipse(0,0,18,11).stroke({color:0xffd36f, width:2, alpha:.8});
    ctx.poly([-20,-4,-13,-8,-15,-2,-9,0]).stroke({color:0xffffff,width:1.5,alpha:.8});
    ctx.poly([20,4,13,8,15,2,9,0]).stroke({color:0xffffff,width:1.5,alpha:.8});
  }
  contexts.set(key, ctx);
  return ctx;
}
export function withWeaponGlow(visual, enhance, kit) {
  const spec = weaponGlowSpec(enhance);
  if (!spec.color) return visual;
  const container = new Container(), aura = new Container();
  const geometry = contextFor(spec, kit);
  const trail = new Graphics(geometry), glow = new Graphics(geometry);
  trail.alpha = .16;
  aura.addChild(trail, glow);
  const motes = Array.from({length:spec.particles}, (_, i) => {
    const node = new Graphics().circle(0,0,i%3 ? 1.4 : 2).fill(i%2 ? 0xffd36f : spec.color);
    aura.addChild(node); return node;
  });
  container.addChild(visual.container, aura);
  let age = 0, motionReduced = false;
  return {
    container,
    get debug() { return {...visual.debug, weaponGlow:{level:spec.level, particles:motes.filter(n=>n.visible).length,
      staticGeometry:true, visible:aura.visible, reduced:motionReduced}}; },
    update(state, animation, dt) {
      visual.update(state, animation, dt);
      aura.visible = !state.dead;
      if (!animation.frozen) age += dt;
      const reduced = !!animation.reduced;
      motionReduced = reduced;
      // A presentation anchor follows facing only; never infer or change combat geometry.
      aura.position.set(Math.cos(state.facing)*15, -25 + Math.sin(state.facing)*6);
      glow.rotation = state.facing * .25;
      glow.alpha = spec.pulse && !reduced ? .75 + Math.sin(age*5)*.25 : .8;
      trail.visible = spec.trail && !reduced;
      trail.position.set(-4 - Math.sin(age*3)*2, 3);
      trail.rotation = glow.rotation - .1;
      for (let i=0; i<motes.length; i++) {
        const node=motes[i];node.visible=!reduced;
        if (reduced || animation.frozen) continue;
        const angle=age*(spec.ring ? 2 : 1.1)+i*Math.PI*2/motes.length;
        node.position.set(Math.cos(angle)*(spec.ring ? 21 : 16),Math.sin(angle)*11);
        node.alpha=.4+Math.sin(angle+age)*.3;
      }
    },
    destroy() {
      visual.destroy(); container.removeFromParent(); container.destroy({children:true});
    },
  };
}
