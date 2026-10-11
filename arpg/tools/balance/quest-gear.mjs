// Deterministic reward-only diagnostics; complete production rosters, not isolated drop odds.
// Usage: node arpg/tools/balance/quest-gear.mjs [runs=500]
import assert from 'node:assert/strict';
import { questReward } from '../../test/fixtures/quest-rewards.js';
const runs = Number(process.argv[2] || 500);
assert.ok(Number.isSafeInteger(runs) && runs >= 100);
const rows = [];
for (const stageId of ['S2','S4','S10','S20']) for (const threat of [1,2,3]) {
  const counts = [0,0,0]; let awards = 0, kills = 0;
  for (let seed = 1; seed <= runs; seed++) {
    const result = questReward(stageId, seed, threat);
    const n = result.receipt.lootKept.items.length;
    assert.ok(n <= 2 && result.tracker.gearAwarded <= 2);
    assert.ok(n <= result.tracker.gearBudget);
    counts[n]++; awards += result.tracker.gearAwarded; kills = result.events.length;
    if (seed <= 3) assert.deepEqual(result, questReward(stageId, seed, threat));
  }
  const average = (counts[1] + 2 * counts[2]) / runs;
  assert.ok(average >= 0.9 && average <= 1.2, `${stageId}/${threat}: ${average}`);
  rows.push({ stageId, threat, runs, kills, distribution: counts, average, awardedAverage: awards / runs, max: counts[2] ? 2 : 1 });
}
const guaranteeRows = [];
for (const stageId of ['S4','S10','S20']) for (const threat of [1,2,3]) {
  const distribution = [0,0,0];
  for (let seed = 1; seed <= 100; seed++) {
    const result = questReward(stageId, seed, threat, stageId === 'S4', 6);
    assert.ok(result.receipt.lootKept.items.length <= 2);
    assert.equal(result.save.rarelessRounds, 0);
    distribution[result.receipt.lootKept.items.length]++;
  }
  guaranteeRows.push({ stageId, threat, runs: 100, distribution,
    average: (distribution[1] + 2 * distribution[2]) / 100, max: distribution[2] ? 2 : 1 });
}
for (let seed = 1; seed <= 100; seed++) assert.equal(questReward('S1', seed).receipt.lootKept.items.length, 0);
console.log(JSON.stringify({ kind: 'full-roster reward simulation (combat success assumed)', rows,
  guaranteeRows, guaranteedScenarios: 900, trainingRuns: 100, sameSeedReplays: 36 }, null, 2));
