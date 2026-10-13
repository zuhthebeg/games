// [제안] Fraction of normal direct projectile damage on an allied blocker; 0 = no team kill.
export const FRIENDLY_PROJECTILE_DAMAGE = 0;
// [제안] P3 single source for encounter/reward tuning. Telegraph phase timings are NEVER scaled.
export const BALANCE = {
  // [제안] Player actions only; no cooldown/telegraph scaling.
  attackSpeed: { agiPerEff: .02, agiCap: .2, weightReference: 8, weightPerUnit: .0125,
    armorFreeWeight: 6, armorPerKg: { bow: .04, focus: .025, blade: .015 },
    weightCap: 24, loadStart: .8, loadCap: 1.2, loadSlope: .5, min: .7, max: 1.2 },
  // cocy 10-11: dodge is the one manual skill auto-attack players keep, so the counter must pay off.
  counter: { damage: 2.2, poise: 3, graceMs: 300 },
  // cocy 10-11: monsters felt too spongy — global stage-spawn HP ×0.7 (bosses included).
  monsterHp: 0.7,
  // cocy 10-11 20:00: armor is 방어력(AC), not HP. Hit damage on a player ×k/(k+AC); poison ticks bypass.
  armor: { k: 100 },
  elite: { hp: 2.2, damage: 1.3, tint: 0xb994ed, scale: 1.15 },
  threats: [
    { hp: 1, damage: 1, gold: 1, drop: 1, rarity: {common:70,fine:27,rare:3}, bossRarity:{fine:50,rare:40,epic:10} },
    { hp: 1.5, damage: 1.3, gold: 1.6, drop: 1.4, rarity: {common:55,fine:37,rare:7,epic:1}, bossRarity:{fine:35,rare:50,epic:15} },
    { hp: 2.1, damage: 1.7, gold: 2.4, drop: 1.9, rarity: {common:40,fine:43,rare:14,epic:3}, bossRarity:{fine:20,rare:55,epic:25} },
  ],
  normalGold: 1.2, rewardCurve: 1.06,
  // cocy 10-12: stats run to 100 (gear can push past it). 6 points = one pre-10-12 point, so every
  // existing effect is unchanged at the same investment; +2/level funds the new CON/LUK.
  // Effect units: eff(v) = knee curve over (v - base) / pointScale (same curve as before).
  stats: { base: 10, startPoints: 36, pointsPerLevel: 8, pointScale: 6, knee: 4, slope: .5,
    capBase: 40, capPerLevel: 2, capMax: 100,
    // WIS 100 = the old flat 5 MP/s; CON 100 = half of it in HP/s; both keep scaling past 100.
    mpRegenAt100: 5, mpRegenFloor: .2, hpRegenAt100: 2.5,
    // LUK, normalized (luk - base) / 90: crit chance/multiplier, gear drop chance, enhance success.
    luckCrit: .25, critMult: 1.5, luckDrop: .3, luckEnchant: .08,
    focusDamage: .04, mp: 8, regen: .06, speed: .01, speedCap: .07,
    dodge: .03, dodgeFloor: .79, iframe: 6, iframeCap: 42,
    potion: .02, potionCap: .18, poise: .04, capacity: 2, discount: .01, discountCap: .07 },
  size: { step: .035, spread: .1, max: 1.35, elite: 1.12, hpCoupling: .5, bossBase: 1.3 },
  stages: {
    // S20 aftermath: one fixed boss, HP below S20 chief (13860 vs 15770), stronger hits, no waves.
    TD1: { hp:18, damage:3, eliteChance:0, waves:1, waveMs:0, concurrent:1, huntTier:3, rewardRank:20, rec:[22,'epic',4] },
    M_THRONE_GARGOYLE: { hp:5, damage:2.5, eliteChance:0, waves:1, waveMs:0, concurrent:3, huntTier:3, rewardRank:19, sizeRank:19, rec:[20,'epic',3] },
    M_MARSH_MARKERS: { hp:4.2, damage:2.7, eliteChance:0, waves:1, waveMs:0, concurrent:3, huntTier:3, rewardRank:13, sizeRank:13, rec:[12,'rare',2] },
    M_MINE_CART: { hp:3.5, damage:2.4, eliteChance:0, waves:1, waveMs:0, concurrent:3, huntTier:3, rewardRank:12, sizeRank:12, rec:[11,'fine',3] },
    S1: { hp:1, damage:1, eliteChance:0, waves:1, waveMs:0, concurrent:2 },
    S2: { hp:4, damage:1.6, eliteChance:.08, waves:10, waveMs:15000, concurrent:4 },
    S3: { hp:3, damage:1.8, eliteChance:.10, waves:12, waveMs:12000, concurrent:3 },
    S4: { hp:2.5, bossHp:6, damage:1.15, eliteChance:.10, waves:9, waveMs:16000, concurrent:3 },
    S5: { hp:5, damage:4.2, eliteChance:.10, waves:14, waveMs:12000, concurrent:4 },
    S6: { hp:3, damage:1.35, eliteChance:.12, waves:10, waveMs:13000, concurrent:3 },
    S7: { hp:3, damage:1.4, eliteChance:.12, waves:12, waveMs:13000, concurrent:2 },
    S8: { hp:3.6, damage:2.2, eliteChance:.12, waves:9, waveMs:14000, concurrent:4, huntTier:2, rec:[7,'fine',1] },
    S9: { hp:3.2, damage:1.18, eliteChance:.12, waves:9, waveMs:14000, concurrent:3, huntTier:2, rec:[8,'fine',2] },
    S10: { hp:2.8, bossHp:7, damage:1.28, eliteChance:.12, waves:8, waveMs:16000, concurrent:4, huntTier:2, rec:[9,'fine',2] },
    S11: { hp:3.8, damage:6, eliteChance:.14, waves:9, waveMs:13000, concurrent:4, huntTier:3, rec:[10,'fine',2] },
    S12: { hp:3.5, damage:2.4, eliteChance:.14, waves:9, waveMs:14000, concurrent:4, huntTier:3, rec:[11,'fine',3] },
    S13: { hp:4.2, damage:2.7, eliteChance:.14, waves:10, waveMs:13000, concurrent:3, huntTier:3, rec:[12,'rare',2] },
    S14: { hp:3.2, damage:1.2, eliteChance:.15, waves:9, waveMs:15000, concurrent:3, huntTier:3, rec:[13,'rare',3] },
    S15: { hp:4, bossHp:12, damage:2.3, eliteChance:.15, waves:8, waveMs:16000, concurrent:4, huntTier:3, rec:[14,'rare',3] },
    S16: { hp:3.6, damage:2.2, eliteChance:.16, waves:9, waveMs:13000, concurrent:4, huntTier:3, rec:[15,'rare',4] },
    S17: { hp:4, damage:2.3, eliteChance:.16, waves:9, waveMs:14000, concurrent:4, huntTier:3, rec:[16,'rare',4] },
    S18: { hp:5, damage:3.2, eliteChance:.17, waves:9, waveMs:13000, concurrent:4, huntTier:3, rec:[17,'rare',5] },
    S19: { hp:5, damage:2.5, eliteChance:.18, waves:9, waveMs:14000, concurrent:4, huntTier:3, rec:[18,'epic',3] },
    S20: { hp:4.4, bossHp:16, damage:2.9, eliteChance:.18, waves:8, waveMs:16000, concurrent:5, huntTier:3, rec:[20,'epic',4] },
  },
};
export function threatMultipliers(threat = 1) {
  if (!Number.isInteger(threat) || threat < 1 || threat > 3) throw new Error('Invalid threat');
  return BALANCE.threats[threat - 1];
}

// [제안] Absolute rendered enlargement is capped at 1.35, including the legacy chief scale.
// Return a multiplier relative to each archetype's existing visual/physical base.
export function monsterSizeProfile(stageId, elite, boss, roll) {
  if (stageId === 'TD1') return { scale: 1, mean: 1, hp: 1 };
  const stage = BALANCE.stages[stageId]?.sizeRank ?? Number(String(stageId).match(/^S(\d+)$/)?.[1] || 1);
  const mu = Math.min(BALANCE.size.max, 1 + Math.max(0, stage - 1) * BALANCE.size.step);
  const variant = elite ? BALANCE.size.elite : 1;
  const limit = BALANCE.size.max / (boss ? BALANCE.size.bossBase : 1);
  const mean = Math.min(limit, mu * variant);
  const scale = Math.min(limit, mu * (1 - BALANCE.size.spread + 2 * BALANCE.size.spread * roll) * variant);
  return { scale, mean, hp: 1 + BALANCE.size.hpCoupling * (scale - mean) };
}

// Rate, not duration multiplier. Live load is sampled once by the act machine.
export function attackRate(agiBonus = 0, weaponWeight = 8, loadRatio = 0, armorWeight = 0, family = 'blade') {
  const a = BALANCE.attackSpeed;
  const weight = Math.max(0, Math.min(a.weightCap, weaponWeight));
  const load = Math.max(0, Math.min(a.loadCap, loadRatio) - a.loadStart);
  const armor = Math.max(0, armorWeight - a.armorFreeWeight) * a.armorPerKg[family];
  return Math.max(a.min, Math.min(a.max, (1 + Math.max(0, Math.min(a.agiCap, agiBonus)))
    / (1 + a.weightPerUnit * (weight - a.weightReference) + a.loadSlope * load + armor)));
}
