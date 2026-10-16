import test from 'node:test';
import assert from 'node:assert/strict';
import { Container } from '../vendor/pixi-8.22.0.min.mjs';
import { ABILITIES } from '../js/content/combat.js';
import { createWorld, addPlayer, spawnMonster, step, emptyInput } from '../js/sim/world.js';
import { shapeHitsCircle } from '../js/sim/core.js';
import { FEEL, AreaImpact, impactTier } from '../js/render/feel.js';
import { ArenaRenderer } from '../js/render/renderer.js';
import { VisualProvider } from '../js/render/visual-provider.js';

const specs = {
  whirl: { old: 105, size: 136.5, factor: 1.3, damage: 44, mp: 20, cd: 6000 },
  heavy_cleave: { old: 135, size: 168.75, factor: 1.25, damage: 96, mp: 26, cd: 6500 },
  blast_arrow: { old: 80, size: 108, factor: 1.35, damage: 54, mp: 24, cd: 6000 },
  flame_ring: { old: 130, size: 169, factor: 1.3, damage: 68, mp: 18, cd: 5500 },
};
const monster = (world, x, y = 400) => {
  const m = spawnMonster(world, 'goblin_grunt', x, y);
  Object.assign(m, { spawnLeft: 0, staggerLeft: 999, r: 1, hp: 1000, maxHp: 1000 });
  return m;
};
for (const [id, spec] of Object.entries(specs)) {
  test(`${id}: exact expanded boundary, unchanged damage/MP/cooldown, real sim hits new reach only`, () => {
    const def = ABILITIES[id];
    const shape = def.shape || { type: 'circle', radius: def.projectile.explode.radius };
    assert.equal(shape.range ?? shape.radius, spec.old * spec.factor);
    assert.equal(def.damage, spec.damage); assert.equal(def.manaCost, spec.mp); assert.equal(def.cooldownMs, spec.cd);
    if (id === 'heavy_cleave') assert.equal(shape.arc, 70);
    assert.equal(shapeHitsCircle(shape, 0, 0, 0, spec.size, 0, 0), true);
    assert.equal(shapeHitsCircle(shape, 0, 0, 0, spec.size + .01, 0, 0), false);
    if (id === 'heavy_cleave') {
      const a = 36 * Math.PI / 180;
      assert.equal(shapeHitsCircle(shape, 0, 0, 0, 120 * Math.cos(a), 120 * Math.sin(a), 0), false);
    }
    const world = createWorld();
    const p = addPlayer(world, { pid: 'local', weapon: def.family, x: 500, y: 400, mods: { skill: id, mpRegen: 0 } });
    // A stationary ranged explosion at range expiry avoids direct-hit/knockback confounds.
    const origin = id === 'blast_arrow' ? 800 : p.x;
    const inside = monster(world, origin + (spec.old + spec.size) / 2);
    const outside = monster(world, origin + spec.size + 2);
    let events;
    if (id === 'blast_arrow') {
      world.projectiles.push({ id: world.nextId++, team: p.team, ownerId: p.id, ownerKind: p.kind, ownerType: p.weapon,
        abilityId: id, x: origin, y: 400, vx: 0, vy: 0, r: 9, travelled: 560, range: 560,
        pierce: 0, hit: [], dmgMult: 1, poiseMult: 1 });
      events = step(world);
      assert.equal(events.find(e => e.type === 'explode').radius, spec.size);
    } else {
      events = [];
      for (let i = 0; i < 40; i++) events.push(...step(world, { local: { ...emptyInput(), aimX: 1, skillEdge: i === 0 } }));
      assert.equal(p.mp, 100 - spec.mp);
    }
    assert.deepEqual(events.filter(e => e.type === 'hit' && !e.periodic).map(e => e.dst), [inside.id]);
    assert.equal(outside.hp, 1000);
  });
}

function fixture() {
  const world = createWorld();
  const player = addPlayer(world, { pid: 'local', x: 500, y: 400 });
  const first = monster(world, 560), second = monster(world, 620);
  const friend = addPlayer(world, { pid: 'friend', x: 400, y: 400 });
  const hit = (dst, extra = {}) => ({ type: 'hit', ability: 'whirl', src: player.id, dst, dmg: 44, x: 600, y: 400, ...extra });
  return { world, player, first, second, friend, hit };
}
test('area feedback counts distinct enemies per caster/cast, spans batches, never mutates events or world', () => {
  const { world, player, first, second, friend, hit } = fixture(), feel = new AreaImpact();
  const one = hit(first.id), duplicate = hit(first.id);
  assert.equal(feel.tiers([one, duplicate], world).size, 0);
  assert.equal(feel.tiers([hit(friend.id)], world).size, 0);
  const two = Object.freeze(hit(second.id, { critical: true }));
  const before = JSON.stringify(world);
  const boosted = feel.tiers([two], world).get(two);
  assert.equal(boosted.stop, impactTier(two).stop + 1 / 60);
  assert.equal(boosted.trauma, impactTier(two).trauma + .025);
  assert.equal(JSON.stringify(world), before);
  assert.equal(feel.tiers([{ type: 'act', id: player.id, ability: 'whirl' }, one], world).size, 0);
  assert.equal(feel.tiers([hit(second.id, { src: friend.id })], world).size, 0);
  assert.equal(feel.tiers([hit(second.id, { ability: 'slash' }), hit(first.id, { ability: 'slash' })], world).size, 0);
  assert.equal(feel.tiers([hit(second.id, { src: first.id }), hit(first.id, { src: first.id })], world).size, 0);
  feel.reset(); assert.equal(feel.casts.size, 0);
});

test('same-batch multi-hit adds exactly one 60Hz frame to both targets/attacker, small extra shake; reset and reduced safe', () => {
  const { world, player, first, second, hit } = fixture();
  const renderer = new ArenaRenderer({ stage: new Container(), screen: { width: 390, height: 844 } }, new VisualProvider({ atlases: false }));
  renderer.reset(world);
  renderer.events(world, [hit(first.id), hit(second.id)]);
  for (const entity of [player, first, second]) assert.equal(renderer.views.get(entity.id).stopLeft, FEEL.impact.heavy.stop + 1 / 60);
  assert.equal(renderer.trauma, 2 * (FEEL.impact.heavy.trauma + .025));
  renderer.reset(world);
  renderer.events(world, [hit(first.id)]);
  assert.equal(renderer.views.get(first.id).stopLeft, FEEL.impact.heavy.stop);
  renderer.reset(world, true);
  renderer.events(world, [hit(first.id), hit(second.id)]);
  renderer.render(world, 1, 1 / 60);
  assert.equal(renderer.trauma, 0);
  assert.equal(renderer.root.x, (390 / 2) - renderer.camera.x * renderer.scale);
  for (const view of renderer.views.values()) assert.equal(view.stopLeft, 0);
  assert.equal(renderer.numbers.filter(n => n.left > 0).length, 2);
});
