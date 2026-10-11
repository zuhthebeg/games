import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, addPlayer, step, emptyInput } from '../js/sim/world.js';
import { ABILITIES, WEAPONS } from '../js/content/combat.js';

const LEARNABLE = { blade: ['whirl', 'heavy_cleave'], bow: ['pierce_shot', 'blast_arrow'], focus: ['frost_lance', 'flame_ring'] };

test('equipped learnable skill fires on the skill button; weapon-forbidden/unknown falls back to kit default', () => {
  for (const [family, ids] of Object.entries(LEARNABLE)) {
    for (const id of ids) {
      assert.equal(ABILITIES[id].family, family);
      assert.ok(ABILITIES[id].name);
      const world = createWorld();
      const p = addPlayer(world, { pid: 'a', weapon: family, mods: { skill: id, maxMp: 100 } });
      assert.equal(p.skills[0], id);
      step(world, { a: { ...emptyInput(), skillEdge: true } });
      assert.equal(p.act?.id, id);
    }
    // skills-v2 §4: only bow skills off a bow, and blade skills on a bow, are forbidden.
    const forbidden = family === 'bow' ? LEARNABLE.blade[0] : LEARNABLE.bow[0];
    for (const bad of [forbidden, 'nope', undefined])
      assert.equal(addPlayer(createWorld(), { pid: 'a', weapon: family, mods: { skill: bad } }).skills[0], WEAPONS[family].skill);
  }
});
