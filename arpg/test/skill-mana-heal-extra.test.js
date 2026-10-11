import test from 'node:test';
import assert from 'node:assert/strict';
import { ABILITIES } from '../js/content/combat.js';
import { createWorld, addPlayer, spawnMonster, emptyInput, step } from '../js/sim/world.js';
import { ticks } from '../js/sim/core.js';
const castInput = { ...emptyInput(), aimX: 1, skillEdge: true };
const make = (id) => {
  const w = createWorld(); const p = addPlayer(w, { pid: 'a', weapon: ABILITIES[id].family,
    x: 500, y: 400, mods: { skill: id, mpRegen: 0 } }); return { w, p };
};
const skills = Object.entries(ABILITIES).filter(([, d]) => d.family && d.cooldownMs > 0);

test('insufficient skill MP never cancels an existing cancelable basic for any family/book', () => {
  for (const [id, def] of skills) {
    const { w, p } = make(id); p.mp = 0;
    step(w, { a: { ...emptyInput(), attack: true } });
    const act = p.act; assert.equal(act.phase, 'windup');
    step(w, { a: castInput });
    assert.equal(p.act, act, id); assert.equal(p.mp, 0); assert.deepEqual(p.cds, {});
    assert.equal(w.events.some(e => e.type === 'actCancel'), false);
    assert.ok(def.manaCost > 0);
  }
});

test('every accepted skill keeps its single upfront cost through recovery cancellation and cooldown rejection', () => {
  for (const [id, def] of skills) {
    const { w, p } = make(id);
    step(w, { a: castInput });
    while (p.act && p.act.phase !== 'recovery') step(w);
    assert.equal(p.mp, 100 - def.manaCost);
    const events = step(w, { a: { ...emptyInput(), dodgeEdge: true } });
    assert.equal(p.act, null);
    assert.equal(p.cds[id], ticks(def.cooldownMs));
    assert.ok(events.some(e => e.type === 'actCancel' && e.ability === id));
    for (let i = 0; i < 30; i++) step(w, { a: castInput });
    assert.equal(p.mp, 100 - def.manaCost); assert.equal(p.act, null);
  }
});

test('heal samples positions/life at delivery, emits no zero-damage hostile hit, remains one-shot over active ticks', () => {
  const { w, p } = make('healing_light'); p.hp = 10;
  const leaving = addPlayer(w, { pid: 'leave', x: 550, y: 400 }); leaving.hp = 10;
  const arriving = addPlayer(w, { pid: 'arrive', x: 900, y: 400 }); arriving.hp = 10;
  const dying = addPlayer(w, { pid: 'die', x: 530, y: 400 }); dying.hp = 10;
  const enemy = spawnMonster(w, 'scarecrow', 565, 470); enemy.spawnLeft = 0;
  step(w, { a: castInput });
  while (p.act.phase !== 'active') step(w);
  leaving.x = 900; arriving.x = 550; dying.dead = true; dying.hp = 0;
  const events = [];
  while (p.act) events.push(...step(w));
  assert.equal(leaving.hp, 10); assert.equal(arriving.hp, 40); assert.equal(dying.hp, 0); assert.equal(p.hp, 40);
  assert.equal(events.filter(e => e.type === 'healCast').length, 1);
  assert.equal(events.filter(e => e.type === 'heal').length, 2);
  assert.equal(events.some(e => e.type === 'hit'), false);
});

test('caster death during windup cancels heal and retains upfront MP without resurrection', () => {
  const { w, p } = make('healing_light'); p.hp = 1;
  const monster = spawnMonster(w, 'goblin_grunt', 550, 400); monster.spawnLeft = 0; monster.thinkLeft = 10000;
  const def = ABILITIES.goblin_slash;
  monster.act = { id: 'goblin_slash', def, phase: 'active', left: 1, elapsed: 0, total: 1,
    phaseTicks: { windup: 1, lock: 1, active: 1, recovery: 1 }, facing: Math.PI, ox: monster.x, oy: monster.y, hit: [] };
  const events = [...step(w, { a: castInput })];
  for (let i = 0; i < 40; i++) events.push(...step(w));
  assert.equal(p.dead, true); assert.equal(p.hp, 0); assert.equal(p.act, null); assert.equal(p.mp, 72);
  assert.ok(events.some(e => e.type === 'actCancel' && e.ability === 'healing_light'));
  assert.equal(events.some(e => e.type === 'healCast' || e.type === 'heal'), false);
});
