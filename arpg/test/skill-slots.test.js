import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, addPlayer, step, emptyInput, playerSkills, SKILL_EDGES } from '../js/sim/world.js';
import { ABILITIES, WEAPONS, SKILL_USE, canUseSkill } from '../js/content/combat.js';
import { EDGES } from '../js/net/protocol.js';

const fire = (weapon, skills, edge) => {
  const world = createWorld();
  const p = addPlayer(world, { pid: 'a', weapon, x: 500, y: 400, mods: { skills, maxMp: 300, mpRegen: 0 } });
  step(world, { a: { ...emptyInput(), aimX: 1, [edge]: true } });
  return p;
};

test('three slots fire independently by edge; empty slot is a no-op; slot 1 falls back to kit', () => {
  const p = fire('blade', ['whirl', 'heavy_cleave', 'ember_bolt'], 'skill3Edge');
  assert.deepEqual(p.skills, ['whirl', 'heavy_cleave', 'ember_bolt']);
  assert.equal(p.act.id, 'ember_bolt');
  assert.equal(fire('blade', ['whirl', 'heavy_cleave'], 'skill2Edge').act.id, 'heavy_cleave');
  const empty = fire('blade', ['whirl'], 'skill3Edge');
  assert.equal(empty.act, null);
  assert.equal(empty.mp, 300);
  assert.deepEqual(playerSkills({ skills: [null, 'whirl'] }, 'blade'), [WEAPONS.blade.skill, 'whirl', null]);
  assert.deepEqual(playerSkills({ skill: 'whirl' }, 'blade'), ['whirl', null, null]);
});

test('weapon gates: bow never fires blade skills, only a bow fires bow skills, magic fires from anything', () => {
  assert.equal(canUseSkill('whirl', 'bow'), false);
  assert.equal(canUseSkill('whirl', 'focus'), true);
  assert.equal(canUseSkill('pierce_shot', 'blade'), false);
  assert.equal(canUseSkill('pierce_shot', 'focus'), false);
  for (const weapon of ['blade', 'bow', 'focus']) {
    assert.equal(canUseSkill('frost_lance', weapon), true);
    assert.equal(canUseSkill('healing_light', weapon), true);
  }
  assert.deepEqual(fire('bow', ['whirl', 'frost_lance'], 'skillEdge').skills, [WEAPONS.bow.skill, 'frost_lance', null]);
  assert.equal(fire('bow', ['whirl', 'frost_lance'], 'skill2Edge').act.id, 'frost_lance');
});

test('every ability family has a SKILL_USE row and matching weapon is always 1', () => {
  for (const def of Object.values(ABILITIES)) if (['blade', 'bow', 'focus'].includes(def.family)) {
    assert.equal(SKILL_USE[def.family][def.family], 1);
  }
});

test('net carries the two new skill edges after the original one', () => {
  for (const edge of SKILL_EDGES) assert.ok(EDGES.includes(edge));
  assert.equal(EDGES[0], 'skillEdge');
});
