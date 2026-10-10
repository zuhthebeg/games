import { deriveMods } from './stats.js';
import { addXp, stageXp, deathLoss, MAX_LEVEL, xpSpan } from './progression.js';
import { ITEMS, carriedWeight, capacity, rollDrops, dropSeed, cloneSave, uniqueUid } from './items.js';

export const emptyLoot = () => ({ gold: 0, items: [], stacks: {} });
const USED_KEYS = { potions: 'potion', manaPotions: 'mana_potion', scrolls: 'return_scroll' };

export function buildRoundMods(save) {
  const { capacity: ignoredCapacity, shopDiscount, family, ...mods } = deriveMods(save);
  return {
    ...mods,
    potions: save.stacks.potion || 0,
    manaPotions: save.stacks.mana_potion || 0,
    scrolls: save.stacks.return_scroll || 0,
  };
}

export function createTracker(seed) {
  return { seed: seed >>> 0, killIndex: 0, depositedXp: 0, tempLoot: emptyLoot(), skipped: 0 };
}

export function usedConsumables(save, player) {
  return Object.fromEntries(Object.entries(USED_KEYS).map(([key, id]) => [key, (save.stacks[id] || 0) - player[key]]));
}

export function currentLoad(save, tracker, used = {}) {
  const remaining = cloneSave(save);
  for (const [key, id] of Object.entries(USED_KEYS)) remaining.stacks[id] = (save.stacks[id] || 0) - (used[key] || 0);
  const weight = carriedWeight(remaining, tracker.tempLoot);
  return { weight, capacity: capacity(save), ratio: weight / capacity(save) };
}

// A pure event reducer. Main applies its ratio via setLoad; renderer receives fx, never loot ownership.
export function trackRound(save, tracker, events, used = {}) {
  const next = structuredClone(tracker);
  const fx = [];
  const load = () => currentLoad(save, next, used);
  const pickup = (id, count, instance) => {
    const scrollCount = (save.stacks.return_scroll || 0) - (used.scrolls || 0)
      + (next.tempLoot.stacks.return_scroll || 0);
    if (load().weight + ITEMS[id].weight * count > capacity(save) * 1.2 + 1e-9
      || (id === 'return_scroll' && scrollCount + count > 2)) {
      next.skipped += count;
      return false;
    }
    if (instance) next.tempLoot.items.push(instance);
    else next.tempLoot.stacks[id] = (next.tempLoot.stacks[id] || 0) + count;
    return true;
  };
  for (const event of events) {
    if (event.type !== 'kill') continue;
    next.depositedXp += event.xp;
    const seed = dropSeed(next.seed, next.killIndex++);
    const drop = rollDrops(event.monster, seed);
    next.tempLoot.gold += drop.gold;
    const picked = [];
    let rejected = false;
    for (const [id, count] of Object.entries(drop.stacks)) {
      // Pick stack units separately so a nearly-full bag never drops an entire stack unnecessarily.
      for (let unit = 0; unit < count; unit++) {
        if (pickup(id, 1)) picked.push(id);
        else rejected = true;
      }
    }
    for (const item of drop.items) {
      if (pickup(item.id, 1, item)) picked.push(item.id);
      else rejected = true;
    }
    fx.push({ type: 'drop', x: event.x, y: event.y, gold: drop.gold, picked, rejected });
  }
  return { tracker: next, fx, load: load() };
}

export function settleRound(save, { stageId, terminal, depositedXp = 0, tempLoot = emptyLoot(), used = {} }) {
  if (!['S1', 'S2', 'S3', 'S4'].includes(stageId)
    || !['clear', 'return_scroll', 'death'].includes(terminal)) throw new Error('Invalid settlement');
  if (!Number.isSafeInteger(depositedXp) || depositedXp < 0) throw new Error('Invalid XP deposit');
  let next = cloneSave(save);
  const consumption = {};
  for (const [key, id] of Object.entries(USED_KEYS)) {
    const count = used[key] ?? 0;
    if (!Number.isSafeInteger(count) || count < 0 || count > (save.stacks[id] || 0)) {
      throw new Error('Invalid consumable claim');
    }
    next.stacks[id] = (save.stacks[id] || 0) - count;
    consumption[id] = count;
  }
  const kept = terminal !== 'death';
  const receipt = {
    stageId, terminal,
    firstClear: terminal === 'clear' && !save.cleared[stageId],
    xpGained: 0,
    xpLost: 0,
    xpDiscarded: 0,
    depositedXp,
    xpForfeited: terminal === 'clear' ? 0 : depositedXp,
    stageXp: 0,
    levelsGained: 0,
    statPointsGained: 0,
    goldGained: kept ? tempLoot.gold : 0,
    lootKept: kept ? structuredClone(tempLoot) : emptyLoot(),
    lootLost: kept ? emptyLoot() : structuredClone(tempLoot),
    used: consumption,
    restored: {},
    pityGranted: false,
  };
  if (kept) {
    next.gold += tempLoot.gold;
    for (const [id, count] of Object.entries(tempLoot.stacks)) {
      next.stacks[id] = (next.stacks[id] || 0) + count;
    }
    for (const item of tempLoot.items) {
      // UID collision recovery is deterministic, including repeated round seeds.
      const uid = next.items.some((candidate) => candidate.uid === item.uid)
        ? uniqueUid(next, item.uid) : item.uid;
      next.items.push({ ...item, uid });
    }
  }
  if (terminal === 'clear') {
    receipt.stageXp = stageXp(save, stageId);
    const offeredXp = depositedXp + receipt.stageXp;
    let room = save.level === MAX_LEVEL ? 0 : -save.xp;
    for (let level = save.level; level < MAX_LEVEL; level++) room += xpSpan(level);
    receipt.xpGained = Math.min(offeredXp, room);
    receipt.xpDiscarded = offeredXp - receipt.xpGained;
    next = addXp(next, offeredXp);
    next.cleared[stageId] = true;
    if (stageId === 'S4' && !save.flags.chiefPity) {
      if (!tempLoot.items.some((item) => item.id === 'chief_maul')) {
        const item = { uid: uniqueUid(next, 'pity:chief_maul'), id: 'chief_maul', enhance: 0 };
        next.items.push(item);
        receipt.lootKept.items.push(item);
        receipt.pityGranted = true;
      }
      next.flags.chiefPity = true;
    }
  } else if (terminal === 'death') {
    receipt.xpLost = deathLoss(save, stageId);
    next.xp = Math.max(0, next.xp - receipt.xpLost);
    if (stageId === 'S2' && !save.flags.starterRestoreUsed) {
      // Restore to starting minimums, never remove supplies bought at the inn.
      const starter = { potion: 3, mana_potion: 1, return_scroll: 1 };
      for (const [id, count] of Object.entries(starter)) {
        receipt.restored[id] = Math.max(0, count - next.stacks[id]);
        next.stacks[id] = Math.max(count, next.stacks[id]);
      }
      next.flags.starterRestoreUsed = true;
    }
  }
  receipt.levelsGained = next.level - save.level;
  receipt.statPointsGained = receipt.levelsGained * 3;
  // Optional v1 metadata keeps the innkeeper's last-run summary across browser reloads.
  next.lastReceipt = structuredClone(receipt);
  return { save: next, receipt };
}
