import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, addPlayer, spawnMonster, step } from '../js/sim/world.js';
import { BALANCE } from '../js/content/balance.js';
import { ITEMS, armorAc } from '../js/meta/items.js';
import { deriveMods } from '../js/meta/stats.js';
import { createSave } from '../js/meta/save.js';

const hitOn = (ac) => {
  const world = createWorld(7);
  const p = addPlayer(world, { pid: 'p', x: 400, y: 400, mods: { ac, maxHp: 500 } });
  const m = spawnMonster(world, 'goblin_grunt', 450, 400); m.spawnLeft = 0;
  for (let i = 0; i < 300; i++) {
    const hit = step(world, {}).find(e => e.type === 'hit' && e.dst === p.id);
    if (hit) return hit.dmg;
  }
  throw new Error('no monster hit');
};

test('AC reduces hit damage by k/(k+AC), never below 1, and 0 AC is unchanged', () => {
  const raw = hitOn(0), k = BALANCE.armor.k;
  assert.equal(hitOn(50), Math.max(1, Math.round(raw * k / (k + 50))));
  assert.ok(hitOn(50) < raw);
  assert.equal(hitOn(100000), 1);
});

test('armor gives AC (enchant +1 per level), never HP; weapons give no AC', () => {
  assert.equal(ITEMS.boar_hide_armor.hp, undefined);
  assert.equal(armorAc({ id: 'boar_hide_armor', enhance: 7 }), ITEMS.boar_hide_armor.ac + 7);
  assert.equal(armorAc({ id: 'iron_sword', enhance: 7 }), 0);
  for (const def of Object.values(ITEMS)) if (def.slot && def.slot !== 'weapon') assert.ok(Number.isInteger(def.ac) && def.ac >= 0, def.name);
  const save = createSave({ name: 'AC', answers: [0, 0, 0, 0, 0], createdAt: 1 });
  const before = deriveMods(save);
  save.items.push({ uid: 'b', id: 'warden_plate', enhance: 3, affixes: [] }); save.equipped.body = 'b';
  const after = deriveMods(save);
  assert.equal(after.maxHp, before.maxHp);
  assert.equal(after.ac, ITEMS.warden_plate.ac + 3);
});
