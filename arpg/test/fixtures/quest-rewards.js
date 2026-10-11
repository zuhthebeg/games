import { STAGES } from '../../js/content/combat.js';
import { BALANCE } from '../../js/content/balance.js';
import { rng } from '../../js/meta/economy.js';
import { createSave } from '../../js/meta/save.js';
import { createTracker, trackRound, settleRound } from '../../js/meta/run.js';

export function rewardSave(stageId, threat = 1, firstChief = false, rarelessRounds = 0) {
  const save = createSave({ name: 'reward', answers: [0,0,0,0,0], weapon: 'blade', createdAt: 123 });
  save.threat = threat;
  save.stageThreat[stageId] = 3;
  save.flags.chiefPity = !firstChief;
  save.rarelessRounds = rarelessRounds;
  return save;
}

// Full actual encounter roster, with seeded representative elite variants at the stage rate.
// Combat AI consumes its own RNG: this models reward events, not combat success or an AI replay.
export function questEvents(stageId, seed, threat = 1, bossLast = false) {
  const random = rng(seed);
  const spawns = [...STAGES[stageId].spawns];
  if (bossLast) spawns.sort((a, b) => Number(a.monster === 'goblin_chief') - Number(b.monster === 'goblin_chief'));
  return spawns.map((spawn, i) => ({ type: 'kill', id: i + 100, monster: spawn.monster,
    stageId, threat, elite: spawn.monster !== 'goblin_chief' && random() < BALANCE.stages[stageId].eliteChance,
    xp: 0, x: spawn.fx * 1400, y: spawn.fy * 860 }));
}

export function questReward(stageId, seed, threat = 1, firstChief = false, rarelessRounds = 0) {
  const save = rewardSave(stageId, threat, firstChief, rarelessRounds);
  const events = questEvents(stageId, seed, threat);
  const { tracker } = trackRound(save, createTracker(seed), events);
  const result = settleRound(save, { stageId, terminal: 'clear', ...tracker });
  return { save, events, tracker, ...result };
}
