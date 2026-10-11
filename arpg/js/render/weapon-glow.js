import { Container, Graphics, GraphicsContext, Sprite, Texture } from '../../vendor/pixi-8.22.0.min.mjs';

export const WEAPON_GLOW_COLORS = Object.freeze([0xcde8ee, 0x53b9ff, 0x9cdaff, 0xbe84ff, 0xffd36f]);
export function weaponGlowSpec(enhance = 0, reduced = false) {
  const level = Math.max(0, Math.min(10, Math.floor(enhance)));
  return { level, color: level >= 6 ? WEAPON_GLOW_COLORS[level - 6] : null,
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
// Halo = the drawn weapon's silhouette repeated at 8 small offsets (additive, no filters).
const HALO = [[1,0],[.7,.7],[0,1],[-.7,.7],[-1,0],[-.7,-.7],[0,-1],[.7,-.7]];
let ringContext;
export function withWeaponGlow(visual, enhance, kit) {
  const spec = weaponGlowSpec(enhance);
  if (!spec.color) return visual;
  const container = new Container(), aura = new Container();
  // Fallback (procedural/atlas without weapon layer): approximate geometry by facing.
  const geometry = contextFor(spec, kit);
  const trail = new Graphics(geometry), glow = new Graphics(geometry);
  trail.alpha = .16;
  // Anchored path: sprites allocated once, textures swapped per frame.
  const silhouette = (alpha) => {
    const node = new Sprite(Texture.EMPTY);
    node.tint = spec.color; node.blendMode = 'add'; node.alpha = alpha; node.visible = false;
    return node;
  };
  const halo = HALO.map(() => silhouette(.2)), ghost = silhouette(.12);
  if (spec.ring && !ringContext) ringContext = new GraphicsContext().ellipse(0,0,18,11).stroke({color:0xffd36f, width:2, alpha:.8});
  const ring = spec.ring ? new Graphics(ringContext) : null;
  if (ring) ring.visible = false;
  aura.addChild(ghost, ...halo, trail, glow, ...(ring ? [ring] : []));
  const motes = Array.from({length:spec.particles}, (_, i) => {
    const node = new Graphics().circle(0,0,i%3 ? 1.4 : 2).fill(i%2 ? 0xffd36f : spec.color);
    aura.addChild(node); return node;
  });
  container.addChild(visual.container, aura);
  let age = 0, motionReduced = false, anchored = false, lastTexture = null, currentTexture = null, ghostAge = 1;
  return {
    container,
    get debug() { return {...visual.debug, weaponGlow:{level:spec.level, particles:motes.filter(n=>n.visible).length,
      staticGeometry:true, visible:aura.visible, reduced:motionReduced, anchored}}; },
    weaponPose() { return visual.weaponPose?.() || null; },
    update(state, animation, dt) {
      visual.update(state, animation, dt);
      aura.visible = !state.dead;
      if (!animation.frozen) age += dt;
      const reduced = !!animation.reduced;
      motionReduced = reduced;
      const pose = visual.weaponPose?.() || null;
      anchored = !!pose;
      const pulse = spec.pulse && !reduced ? .75 + Math.sin(age*5)*.25 : .8;
      let cx, cy, orbit;
      if (pose) {
        aura.position.set(0, 0);
        trail.visible = glow.visible = false;
        const show = !pose.hidden;
        const spread = 1.6 + (spec.level - 6) * .25;
        for (let i=0; i<halo.length; i++) {
          const node = halo[i]; node.visible = show;
          if (!show) continue;
          node.texture = pose.texture; node.anchor.copyFrom(pose.anchor); node.scale.set(pose.scale);
          node.position.set(HALO[i][0]*spread, HALO[i][1]*spread);
          node.alpha = .2 * pulse / .8;
        }
        // Afterimage of the previous drawn frame during swings (tier 8+).
        if (show && !animation.frozen && pose.texture !== currentTexture) {
          lastTexture = currentTexture; currentTexture = pose.texture; ghostAge = 0;
        } else if (!animation.frozen) ghostAge += dt;
        ghost.visible = show && spec.trail && !reduced && !!lastTexture && ghostAge < .14;
        if (ghost.visible) { ghost.texture = lastTexture; ghost.anchor.copyFrom(pose.anchor); ghost.scale.set(pose.scale); ghost.alpha = .14 * (1 - ghostAge/.14); }
        cx = pose.x ?? 0; cy = pose.y ?? -25; orbit = show;
      } else {
        for (const node of halo) node.visible = false; ghost.visible = false;
        glow.visible = true;
        // A presentation anchor follows facing only; never infer or change combat geometry.
        aura.position.set(Math.cos(state.facing)*15, -25 + Math.sin(state.facing)*6);
        glow.rotation = state.facing * .25;
        glow.alpha = pulse;
        trail.visible = spec.trail && !reduced;
        trail.position.set(-4 - Math.sin(age*3)*2, 3);
        trail.rotation = glow.rotation - .1;
        cx = 0; cy = 0; orbit = true;
      }
      if (ring) { ring.visible = !!pose && orbit; ring.position.set(cx, cy); }
      for (let i=0; i<motes.length; i++) {
        const node=motes[i];node.visible=!reduced && orbit;
        if (reduced || animation.frozen) continue;
        const angle=age*(spec.ring ? 2 : 1.1)+i*Math.PI*2/motes.length;
        node.position.set(cx+Math.cos(angle)*(spec.ring ? 21 : 16),cy+Math.sin(angle)*11);
        node.alpha=.4+Math.sin(angle+age)*.3;
      }
    },
    destroy() {
      visual.destroy(); container.removeFromParent(); container.destroy({children:true});
    },
  };
}
