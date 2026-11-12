import test from 'node:test';
import assert from 'node:assert/strict';
import { HubUI } from '../js/ui/hub.js';
import { ABILITIES } from '../js/content/combat.js';
import { skillCardHtml } from '../js/ui/skill-view.js';
import { createWorld, addPlayer, step, emptyInput } from '../js/sim/world.js';
import { createSave } from '../js/meta/save.js';
import { masteryLevels, setMasteryLevel } from '../js/meta/skill-mastery.js';

for (const [level, radius, seconds, ticks] of [
  [1, 80, 3, 90], [4, 80, 3, 90], [5, 90, 3.5, 105],
  [19, 110, 4.5, 135], [20, 120, 5, 150], [29, 130, 5.5, 165], [30, 140, 6, 180],
]) {
  test('poison field detail common row agrees with actual zone at mastery ' + level, () => {
    const save = setMasteryLevel({ ...createSave({ name: 'poison', answers: [0,0,0,0,0], createdAt: 1 }),
      lineage: 'skeleton_knight', learned: ['poison_field'] }, 'poison_field', level);
    const before = structuredClone(save), definition = structuredClone(ABILITIES.poison_field);
    const world = createWorld({ seed: 123 });
    const player = addPlayer(world, { pid: 'poison', x: 300, y: 400, weapon: 'blade',
      skillMasteryLevels: masteryLevels(save),
      mods: { skills: ['poison_field'], lineage: 'skeleton_knight', weaponForm: 'sword', mpRegen: 0 } });
    for (let tick = 0; tick < 60 && !world.zones?.length; tick++) {
      step(world, { [player.pid]: { ...emptyInput(), skillEdge: tick === 0 } });
    }
    const zone = world.zones[0];
    assert.ok(zone, 'real cast must generate a zone');
    assert.equal(zone.radius, radius);
    assert.equal(zone.endTick - zone.startTick, ticks);
    const worldBefore = structuredClone(world);
    const hub = Object.assign(Object.create(HubUI.prototype), { save, mountSheet(html) { this.html = html; } });
    hub.openSkill('poison_field');
    const row = hub.html.match(/<p>고정 지점 사거리 (\d+) px · 반경 (\d+) px · 지속 ([\d.]+)초<\/p>/);
    assert.ok(row, 'common zone detail row exists independently of the growth card');
    assert.equal(Number(row[1]), 360, 'cast range remains unchanged');
    assert.equal(Number(row[2]), zone.radius, 'common detail radius must match the actual zone');
    assert.equal(Number(row[3]), seconds);
    assert.equal(Number(row[3]) * 30, zone.endTick - zone.startTick);
    assert.ok(hub.html.includes(skillCardHtml('poison_field', save, { context: 'detail' })), 'entire existing card preserved');
    assert.deepEqual(save, before, 'detail must not mutate save');
    assert.deepEqual(world, worldBefore, 'detail must not mutate simulation');
    assert.deepEqual(ABILITIES.poison_field, definition, 'detail must not mutate content');
  });
}
