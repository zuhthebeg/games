import test from 'node:test';
import assert from 'node:assert/strict';
import { Graphics, Container } from '../vendor/pixi-8.22.0.min.mjs';
import { SkillVfx, SKILL_VFX, VFX_CAPS, windupProgress } from '../js/render/skill-vfx.js';
import { ArenaRenderer } from '../js/render/renderer.js';
import { VisualProvider } from '../js/render/visual-provider.js';
import { ABILITIES } from '../js/content/combat.js';
import { createWorld, addPlayer, startStage, step } from '../js/sim/world.js';
import { encodeSnapshot, decodeSnapshot } from '../js/net/protocol.js';
const fixture = () => new SkillVfx(Graphics, new Container());
const entity = (id, ability, phase = 'windup', elapsed = 3) => ({ id, kind: 'player', x: 300, y: 300, r: 18,
  act: { id: ability, def: ABILITIES[ability], phase, elapsed, total: 18, facing: .4 } });
const freeze = obj => { if (obj && typeof obj === 'object') { Object.values(obj).forEach(freeze); Object.freeze(obj); } return obj; };

for (const [ability, profile] of Object.entries(SKILL_VFX)) {
  test(`${ability}: profile dimensions use authoritative combat content`, () => {
    if (profile.style === 'dash') {
      assert.equal(profile.dash, ABILITIES[ability].dash);
    } else if (profile.projectile) {
      assert.equal(profile.projectile, ABILITIES[ability].projectile);
      assert.equal(profile.projectileRadius, ABILITIES[ability].projectile.radius);
    } else if (profile.style === 'cleave') {
      assert.equal(profile.shape, ABILITIES[ability].shape);
      assert.equal(profile.shape.range, 168.75); assert.equal(profile.shape.arc, 70);
    } else if (profile.style === 'ember') {
      assert.equal(profile.radius, ABILITIES[ability].projectile.explode.radius);
      assert.equal(profile.projectileRadius, ABILITIES[ability].projectile.radius);
    } else if (profile.style === 'ring') {
      assert.equal(profile.shape, ABILITIES[ability].shape);
      assert.equal(profile.radius, ABILITIES[ability].shape.radius);
    } else assert.equal(profile.radius, ABILITIES[ability].heal.radius);
  });
  test(`${ability}: reduced particle count is substantially smaller, still readable`, () => {
    const vfx = fixture();
    const normal = vfx.emit(profile, profile.impact, 300, 300);
    vfx.reset(); const reduced = vfx.emit(profile, profile.impact, 300, 300, 0, 20, true);
    assert.equal(normal, profile.particles); assert.equal(reduced, profile.reducedParticles);
    assert.ok(reduced > 0 && reduced <= normal / 4);
  });
  test(`${ability}: full pool silently drops, reclaims after lifetime`, () => {
    const vfx = fixture();
    const radius = profile.radius ?? profile.projectileRadius ?? (profile.dash ? 18 + profile.dash.bodyPad : 0);
    for (let i = 0; i < VFX_CAPS.effects; i++) assert.equal(vfx.effect(profile, 'active', 0, 0, 0, radius, profile.shape, false), true);
    assert.equal(vfx.effect(profile, 'active', 0, 0, 0, radius, profile.shape, false), false);
    for (let i = 0; i < 20; i++) vfx.emit(profile, profile.impact, 0, 0);
    assert.equal(vfx.particles.filter(p => p.left > 0).length, VFX_CAPS.particles);
    assert.equal(vfx.emit(profile, profile.impact, 0, 0), 0);
    vfx.update({ tick: 0, entities: [], projectiles: [] }, 1, 2, false);
    assert.ok(vfx.effects.every(p => !p.node.visible && !p.wave.visible));
    assert.ok(vfx.particles.every(p => !p.node.visible));
    assert.equal(vfx.effect(profile, 'active', 0, 0, 0, radius, profile.shape, false), true);
  });
  test(`${ability}: unrelated ability events and actors never activate a profile`, () => {
    const vfx = fixture();
    for (const type of ['act', 'hit', 'explode', 'healCast', 'heal']) assert.equal(vfx.event({ type, ability: 'slash', radius: 99 }, {}, false), false);
    assert.equal(vfx.actor(entity(1, 'slash'), 7, false), false);
    assert.ok(vfx.effects.every(p => p.left === 0)); assert.ok(vfx.particles.every(p => p.left === 0));
  });
  test(`${ability}: charging, activation and feedback read frozen state only`, () => {
    const vfx = fixture(), actor = entity(1, ability), world = { tick: 50, entities: [actor], projectiles: [] };
    freeze(world); const before = JSON.stringify(world);
    vfx.update(world, 1, .016, false);
    assert.ok(vfx.actors[0].node.visible);
    const event = profile.style === 'cleave' || profile.style === 'ring' || profile.style === 'dash' || profile.projectile ? { type: 'hit', ability, x: 350, y: 300 } :
      { type: profile.style === 'ember' ? 'explode' : 'healCast', ability, x: 300, y: 300, radius: profile.radius };
    vfx.event(freeze(event), world, false);
    if (profile.style === 'heal') vfx.event(freeze({ type: 'heal', ability, x: 300, y: 300 }), world, false);
    assert.equal(JSON.stringify(world), before);
  });
}

test('windup progress uses only guest snapshot total/elapsed and handles speed rounding', () => {
  for (const ability of Object.keys(SKILL_VFX)) {
    const act = entity(1, ability).act;
    act.total = 12; act.elapsed = 0; assert.equal(windupProgress(act), 0);
    act.elapsed = 6; assert.ok(windupProgress(act) >= .5 && windupProgress(act) <= .6);
    act.elapsed = 12; assert.equal(windupProgress(act), 1);
    act.phase = 'lock'; assert.equal(windupProgress(act), 1);
  }
});

test('cleave full-size boundary stays 168.75px/70deg while interior grows, residue lasts .65s', () => {
  const vfx = fixture(), actor = entity(1, 'heavy_cleave', 'active', 18);
  vfx.update({ tick: 100, entities: [actor], projectiles: [] }, 1, .016, false);
  const wave = vfx.effects.find(p => p.kind === 'wave'), residue = vfx.effects.find(p => p.kind === 'residue');
  assert.equal(wave.node.scale.x, 1); assert.ok(wave.wave.scale.x < 1);
  const arc = wave.node.context.instructions[0].data.path.instructions.find(p => p.action === 'arc');
  assert.equal(arc.data[2], 168.75); assert.equal((arc.data[4] - arc.data[3]) * 180 / Math.PI, 70);
  assert.equal(residue.total, .65); assert.equal(wave.node.rotation, .4);
  const before = vfx.effects.filter(p => p.left > 0).length;
  const clone = structuredClone(actor); clone.act.elapsed++; clone.act.phase = 'recovery';
  vfx.update({ tick: 101, entities: [clone], projectiles: [] }, 1, .016, false);
  assert.equal(vfx.effects.filter(p => p.left > 0).length, before, 'snapshot act replacement must not replay');
});

test('explode/healCast use event radii, keep fixed boundary with reduced/no growing flash', () => {
  for (const [ability, type] of [['ember_bolt', 'explode'], ['healing_light', 'healCast']]) {
    const vfx = fixture(), event = { ability, type, x: 12, y: 20, radius: 63 };
    assert.equal(vfx.event(event, {}, true), true);
    vfx.update({ tick: 0, entities: [], projectiles: [] }, 1, .016, true);
    assert.equal(vfx.effects[0].radius, 63); assert.equal(vfx.effects[0].node.scale.x, 1);
    assert.equal(vfx.effects[0].node.context.instructions[0].data.path.instructions[0].data[2], 63);
    assert.equal(vfx.effects[0].wave.visible, false);
  }
});

test('four players repeatedly cast all ten skills: fixed allocation, caps, reset and departure cleanup', () => {
  let allocations = 0;
  class CountGraphics extends Graphics { constructor() { super(); allocations++; } }
  const vfx = new SkillVfx(CountGraphics, new Container()), initial = allocations;
  const ids = Object.keys(SKILL_VFX);
  for (let cycle = 0; cycle < 36; cycle++) {
    const ability = ids[cycle % ids.length], actors = Array.from({ length: 4 }, (_, i) => entity(i, ability, 'active', 18));
    const world = { tick: 100 + cycle * 18, entities: actors,
      projectiles: SKILL_VFX[ability].projectileRadius ? actors.map((e, i) => ({ id: i, abilityId: ability,
        r: ABILITIES[ability].projectile.radius, x: 300 + cycle, y: 300, vx: ABILITIES[ability].projectile.speed, vy: 0 })) : [] };
    vfx.update(world, 1, .016, false);
    for (const actor of actors) {
      vfx.event({ type: 'hit', ability, x: actor.x, y: actor.y }, world, false);
      vfx.event({ type: 'explode', ability, x: actor.x, y: actor.y, radius: 78 }, world, false);
      vfx.event({ type: 'healCast', ability, x: actor.x, y: actor.y, radius: 160 }, world, false);
      vfx.event({ type: 'heal', ability, x: actor.x, y: actor.y }, world, false);
    }
  }
  assert.equal(allocations, initial);
  assert.equal(vfx.effects.length, VFX_CAPS.effects); assert.equal(vfx.particles.length, VFX_CAPS.particles);
  assert.equal(vfx.projectiles.length, VFX_CAPS.projectiles); assert.equal(vfx.actors.length, VFX_CAPS.actors);
  vfx.reset(); assert.ok(vfx.layer.children.every(node => !node.visible));
});

test('ember uses six fixed history segments (one reduced), cap overflow is safe and clears on removal', () => {
  const vfx = fixture(), world = { tick: 0, entities: [], projectiles: Array.from({ length: 30 }, (_, id) => ({ id, abilityId: 'ember_bolt', x: 20, y: 30, vx: 520, vy: 0, r: 12 })) };
  for (let frame = 0; frame < 10; frame++) {
    vfx.snapshot(world); world.projectiles.forEach(p => p.x += 5); vfx.update(world, 1, .03, false);
  }
  assert.equal(vfx.projectiles.filter(p => p.id !== null).length, VFX_CAPS.projectiles);
  assert.equal(vfx.projectiles[0].tail.filter(n => n.visible).length, 6);
  assert.ok(vfx.projectiles[0].history[0] > vfx.projectiles[0].history[2]);
  vfx.update(world, 1, .03, true); assert.equal(vfx.projectiles[0].tail.filter(n => n.visible).length, 1);
  world.projectiles = []; vfx.update(world, 1, .03, false);
  assert.ok(vfx.projectiles.every(p => p.id === null && p.tail.every(n => !n.visible)));
});

test('renderer integration preserves danger priority, legacy skills, heal numbers and guest exactly-once cleave', () => {
  const world = createWorld({ seed: 7 }); addPlayer(world, { pid: 'local' }); startStage(world, 'S2'); step(world, { local: {} });
  const renderer = new ArenaRenderer({ stage: new Container(), screen: { width: 390, height: 844 } }, new VisualProvider({ atlases: false }));
  renderer.reset(world);
  assert.ok(renderer.root.getChildIndex(renderer.layers.skillFx) < renderer.root.getChildIndex(renderer.layers.telegraphs));
  const player = world.entities[0]; Object.assign(player, entity(player.id, 'heavy_cleave', 'active', 18)); world.tick = 100;
  for (let i = 0; i < 3; i++) {
    const guest = decodeSnapshot(encodeSnapshot(world), 'local'); renderer.render(freeze(guest), 1, .016);
    player.act.elapsed++; world.tick++;
  }
  assert.equal(renderer.skillVfx.effects.filter(p => p.left > 0).length, 2);
  assert.equal(renderer.effects.filter(p => p.left > 0).length, 0, 'no duplicate old slash');
  renderer.events(world, [{ type: 'healCast', ability: 'healing_light', x: 300, y: 300, radius: 160 },
    { type: 'heal', ability: 'healing_light', x: 300, y: 300, heal: 5 }]);
  assert.ok(renderer.numbers.some(p => p.node.text === '+5'));
  assert.equal(renderer.effects.filter(p => p.left > 0).length, 0, 'no duplicate expanding legacy healing ring');
  renderer.reset(world); player.act = entity(player.id, 'whirl', 'active', 18).act;
  renderer.render(world, 1, .016); assert.equal(renderer.effects.filter(p => p.left > 0).length, 0);
  assert.equal(renderer.skillVfx.effects.filter(p => p.left > 0).length, 1);
});

test('lunge follows the current body hit circle, trails only actual movement, never paints the full dash ahead', () => {
  const vfx = fixture(), actor = entity(1, 'lunge'), world = { tick: 100, entities: [actor], projectiles: [] };
  vfx.update(world, 1, .016, false);
  actor.act.phase = 'active'; actor.act.elapsed++; world.tick++; actor.x += 19;
  vfx.update(world, 1, .016, false);
  const slot = vfx.actors[0], arc = slot.node.context.instructions[0].data.path.instructions.find(p => p.action === 'arc');
  assert.equal(arc.data[2], actor.r + ABILITIES.lunge.dash.bodyPad);
  assert.equal(slot.node.position.x, actor.x); assert.equal(slot.node.position.y, actor.y);
  assert.equal(slot.node.rotation, actor.act.facing);
  const trail = vfx.effects.find(p => p.left > 0);
  assert.equal(trail.kind, 'residue'); assert.equal(trail.radius, 19); assert.equal(trail.node.position.x, actor.x);
  actor.x += 10; actor.act.elapsed++; world.tick++;
  vfx.update(world, 1, .016, false);
  assert.equal(slot.node.position.x, actor.x);
  assert.equal(vfx.effects.filter(p => p.left > 0).length, 1, 'stationary/sub-threshold frames do not allocate trails');
  actor.act.phase = 'recovery'; actor.act.elapsed++; world.tick++;
  vfx.update(world, 1, .016, false); assert.equal(slot.node.visible, false);
  vfx.update({ tick: world.tick, entities: [], projectiles: [] }, 1, 1, false);
  assert.ok(vfx.layer.children.every(n => !n.visible));
});

test('lunge reduced motion retains the exact moving blade but no moving residue; cancellation never fires', () => {
  for (const reduced of [false, true]) {
    const vfx = fixture(), actor = entity(1, 'lunge'), world = { tick: 100, entities: [actor], projectiles: [] };
    vfx.update(world, 1, .016, reduced);
    vfx.update({ tick: 101, entities: [], projectiles: [] }, 1, .016, reduced);
    assert.ok(vfx.effects.every(p => p.left === 0));
    vfx.update(world, 1, .016, reduced);
    actor.act.phase = 'active'; actor.act.elapsed++; world.tick++; actor.x += 40;
    vfx.update(world, 1, .016, reduced);
    assert.equal(vfx.actors[0].node.visible, true);
    assert.equal(vfx.effects.filter(p => p.left > 0).length, reduced ? 0 : 1);
    assert.ok(vfx.effects.every(p => !p.wave.visible));
  }
});

for (const ability of ['volley', 'pierce_shot', 'frost_lance']) {
  test(`${ability}: launch count, spread, position and geometry match the real projectile content; guest activation once`, () => {
    const vfx = fixture(), actor = entity(1, ability), world = { tick: 100, entities: [actor], projectiles: [] };
    vfx.update(freeze(structuredClone(world)), 1, .016, false);
    actor.act.phase = 'active'; actor.act.elapsed++; world.tick++;
    vfx.update(freeze(structuredClone(world)), 1, .016, false);
    const pr = ABILITIES[ability].projectile, effects = vfx.effects.filter(p => p.left > 0);
    assert.equal(effects.length, pr.count);
    for (const [i, effect] of effects.entries()) {
      const angle = actor.act.facing + (pr.count > 1 ? (i / (pr.count - 1) - .5) * pr.spreadDeg * Math.PI / 180 : 0);
      assert.equal(effect.radius, pr.radius); assert.equal(effect.node.rotation, angle);
      assert.equal(effect.node.position.x, actor.x + Math.cos(angle) * (actor.r + 4));
      assert.equal(effect.node.position.y, actor.y + Math.sin(angle) * (actor.r + 4));
      assert.equal(effect.wave.visible, false, 'non-explosive skills never fake an area wave');
    }
    actor.act.elapsed++; world.tick++; actor.act.phase = 'recovery';
    vfx.update(freeze(structuredClone(world)), 1, .016, false);
    assert.equal(vfx.effects.filter(p => p.left > 0).length, pr.count);
  });

  test(`${ability}: fixed projectile pool follows actual radius/velocity, keeps bounded history and reduced one segment`, () => {
    const vfx = fixture(), pr = ABILITIES[ability].projectile;
    const world = { tick: 100, entities: [], projectiles: Array.from({ length: 30 }, (_, id) => ({ id,
      abilityId: ability, r: pr.radius, x: 10, y: 20, vx: 0, vy: pr.speed })) };
    for (let frame = 0; frame < 10; frame++) {
      vfx.snapshot(world); world.projectiles.forEach(p => p.y += pr.speed * .03);
      vfx.update(freeze(structuredClone(world)), 1, .03, false);
    }
    const slot = vfx.projectiles[0];
    assert.equal(vfx.projectiles.filter(p => p.id !== null).length, VFX_CAPS.projectiles);
    assert.equal(slot.node.rotation, Math.PI / 2);
    assert.equal(slot.node.position.y, world.projectiles[0].y);
    const points = slot.node.context.instructions[0].data.path.instructions[0].data[0];
    for (let i = 0; i < points.length; i += 2) assert.ok(Math.hypot(points[i], points[i + 1]) <= pr.radius);
    assert.equal(slot.tail.filter(n => n.visible).length, VFX_CAPS.trail);
    assert.ok(slot.history[1] > slot.history[3]);
    vfx.update(world, 1, .03, true); assert.equal(slot.tail.filter(n => n.visible).length, 1);
    vfx.update({ tick: 101, entities: [], projectiles: [] }, 1, .03, true);
    assert.ok(vfx.projectiles.every(p => p.id === null && !p.node.visible && p.tail.every(n => !n.visible)));
  });

  test(`${ability}: every actual target hit sparks at its event position, frost residue differs from explosions`, () => {
    const vfx = fixture(), world = freeze({ entities: [entity(1, ability)] });
    for (const [i, x] of [120, 180, 250].entries()) {
      assert.equal(vfx.event(freeze({ type: 'hit', ability, src: 1, dst: i + 2, x, y: 80 }), world, false), false);
    }
    assert.equal(vfx.particles.filter(p => p.left > 0).length, SKILL_VFX[ability].particles * 3);
    const effects = vfx.effects.filter(p => p.left > 0);
    assert.equal(effects.length, 3);
    assert.deepEqual(effects.map(e => e.node.position.x), [120, 180, 250]);
    assert.ok(effects.every(e => e.kind === 'residue' && !e.wave.visible));
    if (ability === 'frost_lance') assert.ok(vfx.particles.filter(p => p.left > 0).every(p => p.kind === 'shard'));
    vfx.update({ tick: 0, entities: [], projectiles: [] }, 1, 1, false);
    assert.ok(vfx.layer.children.every(n => !n.visible));
  });
}
