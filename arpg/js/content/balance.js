// [제안] P3 single source for encounter/reward tuning. Telegraph phase timings are NEVER scaled.
export const BALANCE = {
  elite: { hp: 2.2, damage: 1.3, tint: 0xb994ed, scale: 1.15 },
  threats: [
    { hp: 1, damage: 1, gold: 1, drop: 1, rarity: {common:70,fine:27,rare:3}, bossRarity:{fine:50,rare:40,epic:10} },
    { hp: 1.5, damage: 1.3, gold: 1.6, drop: 1.4, rarity: {common:55,fine:37,rare:7,epic:1}, bossRarity:{fine:35,rare:50,epic:15} },
    { hp: 2.1, damage: 1.7, gold: 2.4, drop: 1.9, rarity: {common:40,fine:43,rare:14,epic:3}, bossRarity:{fine:20,rare:55,epic:25} },
  ],
  normalGold: 2.5, rewardCurve: 1.3,
  stages: {
    S1: { hp:1, damage:1, eliteChance:0, waves:1, waveMs:0, concurrent:1 },
    S2: { hp:16, damage:1.6, eliteChance:.08, waves:3, waveMs:30000, concurrent:2 },
    S3: { hp:12, damage:2, eliteChance:.10, waves:4, waveMs:30000, concurrent:2 },
    S4: { hp:15, damage:1.15, eliteChance:.10, waves:3, waveMs:40000, concurrent:3 },
    S5: { hp:16, damage:4.7, eliteChance:.10, waves:4, waveMs:35000, concurrent:3 },
    S6: { hp:12, damage:.85, eliteChance:.12, waves:3, waveMs:40000, concurrent:2 },
    S7: { hp:12, damage:1.25, eliteChance:.12, waves:4, waveMs:30000, concurrent:2 },
  },
};
export function threatMultipliers(threat = 1) {
  if (!Number.isInteger(threat) || threat < 1 || threat > 3) throw new Error('Invalid threat');
  return BALANCE.threats[threat - 1];
}
