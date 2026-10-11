import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, addPlayer, step, emptyInput } from '../js/sim/world.js';
import { ABILITIES, WEAPONS } from '../js/content/combat.js';

const LEARNABLE = { blade: ['whirl', 'heavy_cleave'], bow: ['pierce_shot', 'blast_arrow'], focus: ['frost_lance', 'flame_ring'] };

test('equipped learnable skill fires on the skill button; off-family/unknown falls back to kit default', () => {
  for (const [family, ids] of Object.entries(LEARNABLE)) {
    for (const id of ids) {
      assert.equal(ABILITIES[id].family, family);
      assert.ok(ABILITIES[id].name);
      const world = createWorld();
      const p = addPlayer(world, { pid: 'a', weapon: family, mods: { skill: id, maxMp: 100 } });
      assert.equal(p.skill, id);
      step(world, { a: { ...emptyInput(), skillEdge: true } });
      assert.equal(p.act?.id, id);
    }
    const other = Object.entries(LEARNABLE).find(([f]) => f !== family)[1][0];
    for (const bad of [other, 'nope', undefined])
      assert.equal(addPlayer(createWorld(), { pid: 'a', weapon: family, mods: { skill: bad } }).skill, WEAPONS[family].skill);
  }
});
