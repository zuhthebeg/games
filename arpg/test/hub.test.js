import test from 'node:test';
import assert from 'node:assert/strict';
import { HubUI, restoreInnVitals } from '../js/ui/hub.js';
import { createSave, validateSave } from '../js/meta/save.js';
import { createWorld, addPlayer } from '../js/sim/world.js';
import { buildRoundMods } from '../js/meta/run.js';

const makeSave = () => createSave({ name: '회복 시험', answers: [0, 0, 0, 0, 0], createdAt: 1 });

function makeHub(save, recoverVitals) {
  // Test the real entry/action flow without depending on browser rendering.
  const hub = Object.create(HubUI.prototype);
  Object.assign(hub, {
    save, recoverVitals, dev: false, receipt: null, show: (_html, page) => { hub.page = page; },
  });
  return hub;
}

test('inn auto-recovers HP and MP after clear, scroll return and death without changing save or settlement', () => {
  for (const terminal of ['clear', 'return_scroll', 'death']) {
    const save = makeSave();
    const originalSave = structuredClone(save);
    const world = createWorld({ seed: 1 });
    addPlayer(world, { pid: 'local', weapon: 'blade', mods: buildRoundMods(save) });
    const player = world.entities[0];
    player.hp = terminal === 'death' ? 0 : 1;
    player.mp = 2;
    player.terminal = terminal;
    const originalPlayer = structuredClone(player);
    const hub = makeHub(save, () => restoreInnVitals(player));
    hub.action('result-inn', {});
    assert.equal(hub.page, 'inn');
    assert.equal(player.hp, player.maxHp);
    assert.equal(player.mp, player.maxMp);
    assert.deepEqual(player, { ...originalPlayer, hp: player.maxHp, mp: player.maxMp });
    assert.deepEqual(save, originalSave);
    assert.ok(validateSave(save));
  }
});

test('loaded inn invokes automatic recovery; fresh round starts at full derived HP/MP', () => {
  const save = makeSave();
  let recovered = 0;
  const hub = makeHub(save, () => { recovered++; restoreInnVitals(null); });
  hub.ready();
  assert.equal(hub.page, 'inn');
  assert.equal(recovered, 1);
  const world = createWorld({ seed: 2 });
  addPlayer(world, { pid: 'local', weapon: 'blade', mods: buildRoundMods(save) });
  assert.equal(world.entities[0].hp, world.entities[0].maxHp);
  assert.equal(world.entities[0].mp, world.entities[0].maxMp);
  assert.equal(Object.hasOwn(save, 'hp'), false);
  assert.equal(Object.hasOwn(save, 'mp'), false);
});
