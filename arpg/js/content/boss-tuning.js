// Single authored table. Size is relative to the shipped visual, including its prior 2x boss scale.
const profile = {hp:1.6, damage:1.3, speed:1.15, poise:1.3, cooldown:.8, think:.8, size:.7};
export const BOSS_TUNING = Object.freeze(Object.fromEntries(
  ['throne_dragon','gargoyle','rune_guardian','goblin_chief','necropolis_lord'].map(id=>[id,Object.freeze({
    ...profile, primary:['throne_dragon','goblin_chief','necropolis_lord'].includes(id),
  })])));
export const isBossType = type => Object.hasOwn(BOSS_TUNING, type);
