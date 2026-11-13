import test from 'node:test';
import assert from 'node:assert/strict';
import { HubUI } from '../js/ui/hub.js';
import { ABILITIES } from '../js/content/combat.js';
import { skillCardHtml } from '../js/ui/skill-view.js';
import { createWorld, addPlayer, step, emptyInput } from '../js/sim/world.js';
import { createSave } from '../js/meta/save.js';
import { masteryLevels, setMasteryLevel } from '../js/meta/skill-mastery.js';

for (const [level, seconds, ticks] of [
  [1, 4, 120], [4, 4, 120], [5, 4.5, 135], [19, 5.5, 165],
  [20, 6, 180], [29, 6.5, 195], [30, 7, 210],
]) {
  test('firewall common detail and card agree with real zone at mastery ' + level, () => {
    const save = setMasteryLevel({ ...createSave({ name: 'firewall', answers: [0,0,0,0,0], createdAt: 1 }),
      learned: ['firewall'] }, 'firewall', level);
    const before = structuredClone(save), definition = structuredClone(ABILITIES.firewall);
    const world = createWorld({ seed: 123 });
    const player = addPlayer(world, { pid: 'firewall', x: 300, y: 400, weapon: 'focus',
      skillMasteryLevels: masteryLevels(save), mods: { skills: ['firewall'], mpRegen: 0 } });
    for (let tick = 0; tick < 60 && !world.zones?.length; tick++) {
      step(world, { [player.pid]: { ...emptyInput(), skillEdge: tick === 0 } });
    }
    const zone = world.zones[0];
    assert.ok(zone, 'real cast must generate a zone');
    assert.equal(zone.endTick - zone.startTick, ticks);
    assert.equal(zone.abilityId, 'firewall');
    const worldBefore = structuredClone(world);
    const hub = Object.assign(Object.create(HubUI.prototype), { save, mountSheet(html) { this.html = html; } });
    hub.openSkill('firewall');
    const row = hub.html.match(/<p>고정 지점 사거리 (\d+) px · 길이 (\d+) px · 폭 (\d+) px · 지속 ([\d.]+)초<\/p>/);
    assert.ok(row, 'common zone row exists separately from the card');
    assert.deepEqual(row.slice(1, 4).map(Number), [360, 220, 36]);
    assert.equal(Number(row[4]), seconds);
    assert.equal(Number(row[4]) * 30, zone.endTick - zone.startTick);
    const card = skillCardHtml('firewall', save, { context: 'detail' });
    const cardSeconds = Number(card.match(/지속 ([\d.]+)초 · 길이 220 px · 폭 36 px/)[1]);
    assert.equal(cardSeconds, Number(row[4]));
    assert.ok(hub.html.includes(card), 'entire existing card preserved');
    assert.deepEqual(save, before);
    assert.deepEqual(world, worldBefore);
    assert.deepEqual(ABILITIES.firewall, definition);
    assert.deepEqual(definition.zone, { range: 360, reach: 280, durationMs: 4000, intervalMs: 500, length: 220, width: 18 });
  });
}
