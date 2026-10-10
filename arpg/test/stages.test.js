import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, addPlayer, startStage, step, emptyInput, getTelegraphs, setLoad } from '../js/sim/world.js';
import { ticks, shapeHitsCircle } from '../js/sim/core.js';
import { createSave, validateSave } from '../js/meta/save.js';
import { buildRoundMods, createTracker, trackRound, settleRound, usedConsumables } from '../js/meta/run.js';
import { ITEMS, equippedItem } from '../js/meta/items.js';
import { allocateStats, cap } from '../js/meta/stats.js';

// Same simple policy as the existing tests: nearest target, approach/attack, lateral dodge in danger.
function bot(world, player) {
  const input = emptyInput();
  input.potionEdge = player.hp < player.maxHp * 0.45;
  const danger = getTelegraphs(world).find((telegraph) =>
    (telegraph.phase === 'lock' || telegraph.progress > 0.7)
    && shapeHitsCircle(telegraph.shape, telegraph.ox, telegraph.oy, telegraph.facing,
      player.x, player.y, player.r + 12));
  const targets = world.entities.filter((entity) => entity.kind === 'monster' && !entity.dead && !entity.spawnLeft);
  targets.sort((left, right) => Math.hypot(left.x - player.x, left.y - player.y)
    - Math.hypot(right.x - player.x, right.y - player.y));
  const target = targets[0];
  if (danger) {
    input.mx = -Math.sin(danger.facing);
    input.my = Math.cos(danger.facing);
    input.dodgeEdge = true;
  } else if (target) {
    const dx = target.x - player.x, dy = target.y - player.y;
    const distance = Math.hypot(dx, dy) || 1;
    input.mx = distance > 70 ? dx / distance : 0;
    input.my = distance > 70 ? dy / distance : 0;
    input.attack = distance < 110;
    input.skillEdge = distance < 160;
  }
  return input;
}

for (const stageId of ['S5', 'S6', 'S7']) {
  test(`${stageId}: unmodified basic blade + simple dodging bot clears; idling dies (seeds 1/11/42)`, () => {
    for (const seed of [1, 11, 42]) {
      for (const active of [true, false]) {
        const world = createWorld({ seed });
        const player = addPlayer(world, { pid: 'a' });
        startStage(world, stageId);
        for (let tick = 0; tick < ticks(240000) && world.round.state === 'running'; tick++) {
          step(world, { a: active ? bot(world, player) : emptyInput() });
        }
        assert.equal(world.round.state, active ? 'clear' : 'failed',
          `${stageId}/${seed}/${active ? 'bot' : 'idle'} hp=${player.hp} tick=${world.tick}`);
        if (!active) assert.ok(player.deathCause?.ability);
        console.log(`${stageId} seed=${seed} ${active ? 'bot clear' : 'idle death'} tick=${world.tick} hp=${player.hp}`);
      }
    }
  });
}

test('real solo S1~S7 loop tracks all drops, XP, death policy metadata and persists valid v1 saves', () => {
  let save = createSave({ name: '코스 시험', answers: [0, 0, 0, 0, 0], createdAt: 1 });
  // S1 is timed and already integration-tested; use its real settlement to start the active encounters.
  save = settleRound(save, { stageId: 'S1', terminal: 'clear' }).save;
  save = allocateStats(save, { agi: save.statPoints });
  const receipts = [];
  for (const stageId of ['S2', 'S3', 'S4', 'S5', 'S6', 'S7']) {
    const world = createWorld({ seed: 11 });
    const player = addPlayer(world, { pid: 'local', weapon: ITEMS[equippedItem(save, 'weapon').id].family,
      mods: buildRoundMods(save) });
    let tracker = createTracker(11);
    startStage(world, stageId);
    for (let tick = 0; tick < 7200 && world.round.state === 'running'; tick++) {
      const events = step(world, { local: bot(world, player) });
      const result = trackRound(save, tracker, events, usedConsumables(save, player));
      tracker = result.tracker;
      setLoad(world, 'local', result.load.ratio);
    }
    assert.equal(player.terminal, 'clear', `${stageId}: hp=${player.hp}`);
    const result = settleRound(save, { stageId, terminal: player.terminal, ...tracker,
      used: usedConsumables(save, player) });
    save = result.save;
    assert.ok(validateSave(save), stageId);
    receipts.push(result.receipt);
    if (save.statPoints) {
      const agi = Math.min(save.statPoints, cap(save.level) - save.stats.agi);
      save = allocateStats(save, { agi, str: save.statPoints - agi });
    }
  }
  assert.deepEqual(receipts.map((receipt) => receipt.stageXp), [100, 180, 260, 340, 480, 520]);
  assert.deepEqual(receipts.slice(3).map((receipt) => receipt.depositedXp), [44, 56, 36]);
  assert.ok(save.cleared.S7);
  // §8.4 table excludes kill XP; actual S1~S7 first clears plus kills reach Lv7.
  assert.equal(save.level, 7);
  assert.ok(save.stacks.hide >= 4 && save.stacks.rune_shard >= 2 && save.stacks.frost_shard >= 2 && save.stacks.web >= 3);
  console.log(`S1~S7 valid solo progression: Lv${save.level}, xp=${save.xp}, gold=${save.gold}`);
});
