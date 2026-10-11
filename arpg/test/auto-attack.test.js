import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, addPlayer, spawnMonster, step, emptyInput } from '../js/sim/world.js';
import { ABILITIES, WEAPONS } from '../js/content/combat.js';

const input = (extra = {}) => ({ ...emptyInput(), ...extra });
const auto = (extra = {}) => input({ autoAttack: true, ...extra });
function enemy(w, x, y = 400) {
  const e = spawnMonster(w, 'goblin_grunt', x, y);
  e.spawnLeft = 0; e.staggerLeft = 9999; e.hp = e.maxHp = 10000;
  return e;
}
function fixture(weapon, enemyX) {
  const w = createWorld({ seed: 11 });
  const p = addPlayer(w, { pid: 'a', weapon, x: 400, y: 400 });
  const g = enemyX === null ? null : enemy(w, enemyX);
  return { w, p, g };
}

test('blade auto attack swings only when the target is inside the real cone reach, aimed at it', () => {
  const near = fixture('blade', 470);
  step(near.w, { a: auto() });
  assert.equal(near.p.act?.id, WEAPONS.blade.basic);
  assert.ok(Math.abs(near.p.facing) < 1e-6, 'faces the target on its right');
  const far = fixture('blade', 400 + ABILITIES.slash.shape.range + 60);
  for (let i = 0; i < 10; i++) step(far.w, { a: auto() });
  assert.equal(far.p.act, null, 'never swings at air');
});

test('ranged auto attack fires inside 85% of shot range and holds fire beyond it', () => {
  for (const weapon of ['bow', 'focus']) {
    const range = ABILITIES[WEAPONS[weapon].basic].projectile.rangePx;
    const inside = fixture(weapon, 400 + range * 0.8);
    step(inside.w, { a: auto() });
    assert.equal(inside.p.act?.id, WEAPONS[weapon].basic, `${weapon} fires`);
    const outside = fixture(weapon, 400 + range * 0.95);
    for (let i = 0; i < 10; i++) step(outside.w, { a: auto() });
    assert.equal(outside.p.act, null, `${weapon} holds`);
  }
});

test('with nothing in reach auto mode moves exactly like manual movement', () => {
  const a = fixture('blade', null), b = fixture('blade', null);
  for (let i = 0; i < 30; i++) { step(a.w, { a: auto({ mx: 1 }) }); step(b.w, { a: input({ mx: 1 }) }); }
  assert.equal(a.p.x, b.p.x); assert.equal(a.p.y, b.p.y);
});

test('auto attack never dodges or casts on its own; manual dodge still works', () => {
  const f = fixture('blade', 470);
  for (let i = 0; i < 60; i++) step(f.w, { a: auto() });
  assert.equal(f.p.dodge.startedTick, -9999, 'no automatic dodge');
  assert.equal(f.p.mp, f.p.maxMp, 'no automatic skill');
  const dodged = fixture('blade', 470);
  step(dodged.w, { a: auto({ dodgeEdge: true, mx: -1 }) });
  assert.equal(dodged.p.dodge.startedTick, 0); assert.equal(dodged.p.act, null);
});

test('manual attack input overrides auto targeting (explicit aim wins)', () => {
  const f = fixture('blade', 470);
  step(f.w, { a: auto({ attack: true, aimX: 0, aimY: 1 }) });
  assert.equal(f.p.act?.id, WEAPONS.blade.basic);
  assert.ok(Math.abs(f.p.facing - Math.PI / 2) < 1e-6, `aimed down, got ${f.p.facing}`);
});

test('in auto mode a manual perfect dodge still triggers the (stronger) counter, flagged on the hit', () => {
  const f = fixture('blade', 610);
  f.w.projectiles.push({ id: f.w.nextId++, team: f.g.team, ownerId: f.g.id, ownerKind: f.g.kind, ownerType: f.g.type,
    abilityId: 'sling_stone', x: 425, y: 400, vx: 0, vy: 0, r: 8, travelled: 0, range: 560, pierce: 0, hit: [], dmgMult: 1, poiseMult: 1 });
  const events = [...step(f.w, { a: auto({ dodgeEdge: true, mx: 1 }) })];
  for (let i = 0; i < 55; i++) events.push(...step(f.w, { a: auto() }));
  assert.equal(events.filter((e) => e.type === 'perfectDodge').length, 1);
  assert.equal(events.filter((e) => e.type === 'counter').length, 1);
  const counterHit = events.find((e) => e.type === 'hit' && e.src === f.p.id && e.counter);
  assert.ok(counterHit, 'counter hit carries counter:true for presentation');
});
