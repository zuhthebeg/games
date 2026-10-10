// [제안] Fraction of normal direct projectile damage on an allied blocker; 0 = no team kill.
export const FRIENDLY_PROJECTILE_DAMAGE = 0;
// [제안] P3 single source for encounter/reward tuning. Telegraph phase timings are NEVER scaled.
export const BALANCE = {
  elite: { hp: 2.2, damage: 1.3, tint: 0xb994ed, scale: 1.15 },
  threats: [
    { hp: 1, damage: 1, gold: 1, drop: 1, rarity: {common:70,fine:27,rare:3}, bossRarity:{fine:50,rare:40,epic:10} },
    { hp: 1.5, damage: 1.3, gold: 1.6, drop: 1.4, rarity: {common:55,fine:37,rare:7,epic:1}, bossRarity:{fine:35,rare:50,epic:15} },
    { hp: 2.1, damage: 1.7, gold: 2.4, drop: 1.9, rarity: {common:40,fine:43,rare:14,epic:3}, bossRarity:{fine:20,rare:55,epic:25} },
  ],
  normalGold: 1.2, rewardCurve: 1.12,
  // [제안] 1 level point, ~2x early point effect, earlier soft knee: balanced Lv30 stat impact ~69% old.
  stats: { pointsPerLevel: 1, knee: 4, slope: .5, capBase: 9, capEvery: 3, capMax: 19,
    focusDamage: .04, mp: 8, regen: .06, speed: .01, speedCap: .07,
    dodge: .03, dodgeFloor: .79, iframe: 6, iframeCap: 42,
    potion: .02, potionCap: .18, poise: .04, capacity: 2, discount: .01, discountCap: .07 },
  size: { step: .035, spread: .1, max: 1.35, elite: 1.12, hpCoupling: .5, bossBase: 1.3 },
  stages: {
    S1: { hp:1, damage:1, eliteChance:0, waves:1, waveMs:0, concurrent:1 },
    S2: { hp:4, damage:1.6, eliteChance:.08, waves:10, waveMs:15000, concurrent:4 },
    S3: { hp:3, damage:1.8, eliteChance:.10, waves:12, waveMs:12000, concurrent:3 },
    S4: { hp:2.5, bossHp:6, damage:1.15, eliteChance:.10, waves:9, waveMs:16000, concurrent:3 },
    S5: { hp:5, damage:4.2, eliteChance:.10, waves:14, waveMs:12000, concurrent:4 },
    S6: { hp:3, damage:1.35, eliteChance:.12, waves:10, waveMs:13000, concurrent:3 },
    S7: { hp:3, damage:1.4, eliteChance:.12, waves:12, waveMs:13000, concurrent:2 },
  },
};
export function threatMultipliers(threat = 1) {
  if (!Number.isInteger(threat) || threat < 1 || threat > 3) throw new Error('Invalid threat');
  return BALANCE.threats[threat - 1];
}

// [제안] Absolute rendered enlargement is capped at 1.35, including the legacy chief scale.
// Return a multiplier relative to each archetype's existing visual/physical base.
export function monsterSizeProfile(stageId, elite, boss, roll) {
  const stage = Number(String(stageId).match(/^S(\d+)$/)?.[1] || 1);
  const mu = Math.min(BALANCE.size.max, 1 + Math.max(0, stage - 1) * BALANCE.size.step);
  const variant = elite ? BALANCE.size.elite : 1;
  const limit = BALANCE.size.max / (boss ? BALANCE.size.bossBase : 1);
  const mean = Math.min(limit, mu * variant);
  const scale = Math.min(limit, mu * (1 - BALANCE.size.spread + 2 * BALANCE.size.spread * roll) * variant);
  return { scale, mean, hp: 1 + BALANCE.size.hpCoupling * (scale - mean) };
}
