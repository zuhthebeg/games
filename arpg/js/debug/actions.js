import { ITEMS, instance, uniqueUid, rollDrops } from '../meta/items.js';
import { SLOTS, ECONOMY } from '../meta/economy.js';
import { MAX_LEVEL, STAGE_XP } from '../meta/progression.js';
import { STAT_KEYS, cap } from '../meta/stats.js';

export const RARITIES = ['common', 'fine', 'rare', 'epic'];
export const debugActions = [];
const listeners = new Set();
export function registerDebugAction({ group, label, run }) {
  if (typeof group !== 'string' || typeof label !== 'string' || typeof run !== 'function') throw new TypeError('Invalid debug action');
  const action = { group, label, run };
  debugActions.push(action);
  for (const notify of listeners) notify();
  return () => {
    const index = debugActions.indexOf(action);
    if (index >= 0) debugActions.splice(index, 1);
    for (const notify of listeners) notify();
  };
}
export function watchDebugActions(notify) { listeners.add(notify); return () => listeners.delete(notify); }

export function grantGear(save, { slot = 'random', rarity = 'common', huntTier = 1, seed = 0 } = {}) {
  const next = structuredClone(save);
  const selected = slot === 'random' ? SLOTS[(seed >>> 0) % SLOTS.length] : slot;
  const matching = Object.entries(ITEMS).filter(([, item]) => item.slot === selected && item.rarity === rarity);
  // P1 has only T1/T2 templates. Never invent IDs or invalid T3 affix ranges.
  const tier = Math.min(huntTier, Math.max(...matching.map(([, item]) => item.huntTier)));
  const pool = matching.filter(([, item]) => item.huntTier === tier);
  if (!pool.length) throw new Error('해당 장비 템플릿 없음');
  const [id] = pool[(seed >>> 0) % pool.length];
  next.items.push(instance(uniqueUid(next, `debug:${id}`), id, seed));
  return next;
}
export function grantSet(save, huntTier = 1, seed = 0) {
  let next = save;
  for (const rarity of RARITIES) for (const slot of SLOTS) next = grantGear(next, { slot, rarity, huntTier, seed: seed++ });
  return next;
}
export function setLevel(save, level) {
  if (!Number.isInteger(level) || level < 1 || level > MAX_LEVEL) throw new Error(`레벨 1~${MAX_LEVEL}`);
  const next = structuredClone(save);
  next.level = level; next.xp = 0;
  // Respect SaveStore's point-conservation invariant; reclaim points above the new cap.
  for (const key of STAT_KEYS) next.stats[key] = Math.min(next.stats[key], cap(level));
  const budget = 6 + 3 * (level - 1);
  let spent = STAT_KEYS.reduce((sum, key) => sum + next.stats[key] - 5, 0);
  if (spent > budget) { for (const key of STAT_KEYS) next.stats[key] = 5; spent = 0; }
  next.statPoints = budget - spent;
  for (const slot of SLOTS) {
    const item = next.items.find(item => item.uid === next.equipped[slot]);
    if (item && ITEMS[item.id].requiredLevel > level) next.equipped[slot] = null;
  }
  if (!next.equipped.weapon) {
    const gear = instance(uniqueUid(next, 'debug:starter'), 'training_sword', 0);
    next.items.push(gear); next.equipped.weapon = gear.uid;
  }
  return next;
}
export function mutateSave(save, action) {
  const next = structuredClone(save);
  if (action.startsWith('gold:')) next.gold += Number(action.split(':')[1]);
  else if (action === 'stones') for (let i = 1; i <= 3; i++) next.stacks[`enhance_stone_${i}`] = (next.stacks[`enhance_stone_${i}`] || 0) + 10;
  else if (action === 'materials') {
    for (const [id, item] of Object.entries(ITEMS)) if (item.kind === 'material') next.stacks[id] = (next.stacks[id] || 0) + 20;
  } else if (action === 'potions') {
    for (const [id, item] of Object.entries(ITEMS)) if (item.kind === 'consumable' && id.includes('potion')) next.stacks[id] = (next.stacks[id] || 0) + 5;
  } else if (action === 'unlock' || action === 'progress-reset') {
    next.cleared = Object.fromEntries(Object.keys(STAGE_XP).map(id => [id, action === 'unlock']));
    if (action === 'progress-reset') { next.completedRounds = 0; next.flags.chiefPity = false; next.flags.starterRestoreUsed = false; delete next.lastReceipt; }
  } else if (action === 'reroll') { next.shopRefresh++; next.shopBought = []; }
  else if (action === 'refresh-reset') { next.paidRefreshes = 0; next.completedRounds = 0; }
  // P1 checks >= pityRounds *before* rolling the next boss (not pityRounds-1).
  else if (action === 'pity') next.rarelessRounds = ECONOMY.pityRounds;
  else throw new Error('알 수 없는 세이브 액션');
  return next;
}
export function summarizeLoot(loot) {
  const gear = Object.fromEntries(RARITIES.map(rarity => [rarity, 0]));
  for (const item of loot.items) gear[ITEMS[item.id].rarity]++;
  return { gold: loot.gold, gear, stones: Object.fromEntries([1, 2, 3].map(tier => [tier, loot.stacks[`enhance_stone_${tier}`] || 0])) };
}
export function previewDrops(monster, count, ctx = {}, roll = rollDrops) {
  if (![100, 1000].includes(count)) throw new Error('횟수는 100/1000');
  const total = { gold: 0, items: [], stacks: {} };
  for (let seed = 0; seed < count; seed++) {
    const loot = roll(monster, seed, ctx);
    total.gold += loot.gold; total.items.push(...loot.items);
    for (const [id, value] of Object.entries(loot.stacks)) total.stacks[id] = (total.stacks[id] || 0) + value;
  }
  return { count, ...summarizeLoot(total), goldAverage: total.gold / count };
}
