import test from 'node:test';
import assert from 'node:assert/strict';
import { ABILITIES, MONSTERS } from '../js/content/combat.js';
import { createWorld, addPlayer, spawnMonster, step, emptyInput, getTelegraphs } from '../js/sim/world.js';

const patterns = [
  ['wolf', 'wolf_dash', 200], ['wolf', 'wolf_bite', 60],
  ['rune_guardian', 'guardian_crush', 60], ['rune_guardian', 'guardian_ring', 140],
  ['spirit', 'spirit_bolt', 200], ['poison_spider', 'spider_bite', 60],
];
for (const [type, ability, distance] of patterns) {
  test(`${ability}: readable phases, fixed lock, hit inside / no hit outside`, () => {
    for (const leave of [false, true]) {
      const world = createWorld({ seed: 11 });
      const player = addPlayer(world, { pid: 'a', x: 400, y: 400 });
      const monster = spawnMonster(world, type, 400 + distance, 400);
      monster.spawnLeft = monster.thinkLeft = 0;
      for (const id of MONSTERS[type].abilities) if (id !== ability) monster.cds[id] = 9999;
      step(world, { a: emptyInput() });
      assert.equal(monster.act.id, ability);
      assert.equal(monster.act.phase, 'windup');
      const initial = getTelegraphs(world)[0];
      if (ABILITIES[ability].delivery === 'shape') assert.equal(initial.shape, ABILITIES[ability].shape);
      while (monster.act.phase !== 'lock') step(world, { a: emptyInput() });
      assert.equal(player.hp, 100);
      const facing = monster.act.facing;
      if (leave) { player.x = 1000; player.y = 700; }
      while (monster.act.phase !== 'active') {
        step(world, { a: emptyInput() });
        assert.equal(monster.act.facing, facing, 'locked target must not turn toward moved player');
      }
      const events = [];
      // Includes projectile flight, but remains in the ≥2.5s recovery before another attack.
      for (let tick = 0; tick < 70; tick++) events.push(...step(world, { a: emptyInput() }));
      assert.ok(events.some((event) => event.type === 'hit') === !leave);
      assert.equal(player.hp === 100, leave);
      if (ability === 'spider_bite') assert.equal(Boolean(player.poison), !leave);
    }
  });
}

test('S5 two wolves share the major token: never overlap attack introductions', async () => {
  const { startStage } = await import('../js/sim/world.js');
  const world = createWorld({ seed: 42 });
  addPlayer(world, { pid: 'a', mods: { maxHp: 1000 } });
  startStage(world, 'S5');
  const seen = new Map();
  for (let tick = 0; tick < 1800; tick++) {
    for (const event of step(world, { a: emptyInput() })) {
      if (event.type === 'act') seen.set(event.ability, (seen.get(event.ability) || 0) + 1);
    }
    const active = world.entities.filter((entity) => entity.kind === 'monster' && entity.act);
    assert.ok(active.length <= 1);
    if (active.length) assert.equal(world.majorBusyBy, active[0].id);
  }
  assert.ok([...seen.values()].some((count) => count >= 2));
});
