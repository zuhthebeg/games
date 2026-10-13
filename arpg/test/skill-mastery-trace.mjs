// Run at repository root: node arpg/test/skill-mastery-trace.mjs [output.json]
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { STAGES } from '../js/content/combat.js';
import { createWorld, addPlayer, startStage, step, emptyInput } from '../js/sim/world.js';
import { createSave } from '../js/meta/save.js';
import { buildRoundMods } from '../js/meta/run.js';

export function masteryTraces(counts = {}) {
  const traces = {};
  for (const stageId of Object.keys(STAGES)) for (const seed of [11, 73, 991]) {
    const world = createWorld({ seed });
    for (const [pid, weapon] of [['a', 'bow'], ['b', 'focus']]) {
      const save = createSave({ name: pid, weapon, answers: [0, 0, 0, 0, 0], createdAt: 1 });
      save.skillMastery = counts;
      addPlayer(world, { pid, weapon, mods: { ...buildRoundMods(save), maxHp: 10000 } });
    }
    startStage(world, stageId);
    const hash = createHash('sha256');
    for (let tick = 0; tick < 1800; tick++) {
      const events = step(world, {
        a: { ...emptyInput(), autoAttack: true, skillEdge: tick % 180 === 0, mx: tick % 120 < 60 ? .2 : -.2 },
        b: { ...emptyInput(), autoAttack: true, skillEdge: tick % 120 === 0 },
      });
      hash.update(JSON.stringify({ world, events }));
    }
    traces[`${stageId}/${seed}`] = hash.digest('hex');
  }
  return { stages: Object.keys(STAGES).length, seeds: [11, 73, 991], ticks: 1800, traces };
}
if (process.argv[1]?.endsWith('skill-mastery-trace.mjs')) {
  const data = masteryTraces();
  const json = JSON.stringify(data, null, 2) + '\n';
  if (process.argv[2]) writeFileSync(process.argv[2], json);
  else process.stdout.write(json);
}
