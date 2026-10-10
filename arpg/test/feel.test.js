import test from 'node:test';
import assert from 'node:assert/strict';
import { Container } from '../vendor/pixi-8.22.0.min.mjs';
import { ArenaRenderer } from '../js/render/renderer.js';
import { VisualProvider } from '../js/render/visual-provider.js';
import { FEEL, impactTier, numberScale } from '../js/render/feel.js';
import { createWorld, addPlayer, startStage, step } from '../js/sim/world.js';
import { ABILITIES } from '../js/content/combat.js';

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}
function fixture(reduced = false) {
  const world = createWorld({ seed: 11, arena: { w: 1400, h: 860 } });
  addPlayer(world, { pid: 'local', weapon: 'blade' });
  startStage(world, 'S2');
  step(world, { local: {} });
  const renderer = new ArenaRenderer({ stage: new Container(), screen: { width: 390, height: 844 } },
    new VisualProvider({ atlases: false }));
  renderer.reset(world, reduced);
  renderer.render(world, 1, 1 / 60);
  return { world, renderer };
}
function hit(world, extra = {}) {
  const [source, target] = world.entities;
  return { type: 'hit', src: source.id, dst: target.id, x: target.x, y: target.y, dmg: 14, ...extra };
}

test('importance tiers, pop easing, and effect caps have bounded tuning', () => {
  assert.equal(impactTier({ dmg: 14 }), FEEL.impact.normal);
  assert.equal(impactTier({ dmg: 26 }), FEEL.impact.heavy);
  assert.equal(impactTier({ dmg: 10, exposed: true }), FEEL.impact.weak);
  assert.equal(impactTier({ dmg: 10, critical: true }), FEEL.impact.critical);
  for (const tier of Object.values(FEEL.impact)) assert.ok(tier.stop >= .04 && tier.stop <= .09);
  assert.equal(numberScale(0), 1.4);
  assert.equal(numberScale(1), 1);
  assert.ok(numberScale(.04) < 1.4 && numberScale(.04) > 1);
  assert.ok(FEEL.particles.cap <= 64);
});

test('renderer reads a deeply frozen world and events without changing simulation/telegraphs', () => {
  const { world, renderer } = fixture();
  const event = hit(world, { exposed: true });
  const before = JSON.stringify(world);
  deepFreeze(world);
  deepFreeze(event);
  renderer.snapshot(world);
  renderer.events(world, [event]);
  for (let index = 0; index < 60; index++) renderer.render(world, .5, 1 / 60);
  assert.equal(JSON.stringify(world), before);
  assert.equal(renderer.views.get(event.dst).visual.container.scale.x, 1);
  assert.equal(renderer.trauma, 0);
  assert.ok(renderer.particles.every(particle => particle.left <= 0));
});

test('hit-stop freezes only the attacker/target visuals while simulation ticks and projectiles continue', () => {
  const { world, renderer } = fixture();
  const [player, enemy] = world.entities;
  const extra = { ...structuredClone(enemy), id: 999, x: 200, y: 200 };
  world.entities.push(extra);
  renderer.snapshot(world);
  renderer.render(world, 1, 1 / 60);
  const event = hit(world);
  renderer.events(world, [event]);
  const enemyView = renderer.views.get(enemy.id);
  const oldX = enemyView.x, oldAge = enemyView.anim.age, tick = world.tick;
  renderer.snapshot(world);
  step(world, { local: { mx: 1 } });
  extra.x += 12;
  world.projectiles.push({ id: 987, abilityId: 'arrow', x: 50, y: 50, vx: 760, vy: 0, r: 7 });
  renderer.render(world, 1, .016);
  assert.equal(enemyView.x, oldX);
  assert.equal(enemyView.anim.age, oldAge);
  assert.equal(renderer.views.get(999).x, extra.x);
  assert.equal(renderer.projectiles.get(987).x, 50);
  assert.ok(world.tick > tick);
  renderer.render(world, 1, .1);
  renderer.render(world, 1, .1);
  assert.equal(enemyView.x, enemy.x);
  assert.equal(renderer.views.get(player.id).anim.frozen, false);
});

test('received damage shakes more; reduced effects disable freeze/flash/kick/slow without losing hit feedback', () => {
  const { world, renderer } = fixture();
  renderer.events(world, [hit(world)]);
  const outgoing = renderer.trauma;
  renderer.reset(world);
  renderer.events(world, [hit(world, { dst: world.entities[0].id, src: world.entities[1].id })]);
  assert.ok(renderer.trauma > outgoing);
  renderer.reset(world, true);
  renderer.events(world, [hit(world), { type: 'perfectDodge', id: world.entities[0].id }]);
  renderer.render(world, 1, .016);
  for (const view of renderer.views.values()) {
    assert.equal(view.anim.frozen, false);
    assert.equal(view.anim.flash, 0);
    assert.equal(view.visual.container.scale.x, 1);
    assert.equal(view.visual.container.x, view.x);
  }
  assert.ok(renderer.numbers.some(number => number.left > 0));
  assert.equal(renderer.slowLeft, 0);
});

test('particle/number/effect pools stay bounded, spread overlaps, reset and return to rest', () => {
  const { world, renderer } = fixture();
  for (let index = 0; index < 100; index++) renderer.events(world, [hit(world)]);
  assert.equal(renderer.particles.length, FEEL.particles.cap);
  assert.equal(renderer.numbers.length, FEEL.numbers.cap);
  assert.equal(renderer.effects.length, FEEL.effects.cap);
  assert.ok(new Set(renderer.numbers.map(number => number.x)).size > 1);
  renderer.events(world, [{ type: 'kill', id: world.entities[1].id, by: world.entities[0].id, x: 400, y: 300 }]);
  assert.ok(renderer.views.get(world.entities[1].id).stopLeft >= FEEL.impact.kill.stop);
  renderer.events(world, [{ type: 'perfectDodge', id: world.entities[0].id }]);
  assert.equal(renderer.slowLeft, FEEL.perfect.life);
  renderer.reset(world);
  assert.equal(renderer.slowLeft, 0);
  assert.ok(renderer.particles.every(particle => particle.left === 0));
});

test('telegraphs stay authoritative during sprite freeze and rebuild only on new sim snapshots', () => {
  const { world, renderer } = fixture();
  world.entities[1].act = { id: 'goblin_slash', def: ABILITIES.goblin_slash,
    phase: 'lock', elapsed: 4, total: 20, facing: .5 };
  renderer.events(world, [hit(world)]);
  renderer.render(world, 1, 1 / 60);
  const graphic = renderer.telegraphViews[0];
  let clears = 0;
  const originalClear = graphic.clear.bind(graphic);
  graphic.clear = () => { clears++; return originalClear(); };
  renderer.render(world, 1, 1 / 60);
  assert.equal(clears, 0);
  const next = structuredClone(world);
  next.entities[1].x += 10;
  deepFreeze(next);
  const before = JSON.stringify(next);
  renderer.snapshot(next);
  renderer.events(next, []);
  renderer.render(next, 1, .005);
  assert.equal(clears, 1);
  assert.equal(graphic.x, next.entities[1].x);
  assert.notEqual(renderer.views.get(next.entities[1].id).x, graphic.x);
  assert.equal(graphic.rotation, next.entities[1].act.facing);
  assert.equal(JSON.stringify(next), before);
});

test('projectileBlocked reuses bounded spark pool without damage number or player trauma',()=>{
  const {world,renderer}=fixture();
  renderer.events(world,[{type:'projectileBlocked',id:999,blockerId:world.entities[0].id,x:200,y:300}]);
  assert.ok(renderer.particles.some(p=>p.left>0));
  assert.equal(renderer.trauma,0);assert.equal(renderer.numbers.filter(n=>n.left>0).length,0);
});
