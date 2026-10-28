import {BOSS_TUNING, isBossType} from '../content/boss-tuning.js';
import { ECONOMY, rng } from './economy.js';
import { STAGES } from '../content/combat.js';
import { threatMultipliers, BALANCE } from '../content/balance.js';
import { deriveMods, effectiveStats } from './stats.js';
import { addXp, stageXp, deathLoss, MAX_LEVEL, xpSpan, STAGE_XP } from './progression.js';
import { ITEMS, carriedWeight, capacity, rollDrops, dropSeed, cloneSave, uniqueUid, instance } from './items.js';
import { loadoutOf } from './skills.js';
import { questGain, settleQuests } from './quest-progress.js';
import { trackMastery, settleMastery } from './skill-mastery.js';

export const emptyLoot = () => ({ gold: 0, items: [], stacks: {} });
const USED_KEYS = { potions: 'potion', manaPotions: 'mana_potion', scrolls: 'return_scroll', greenPotions: 'green_potion' };

// stageThreat stores the highest CLEARED tier; absent historical clears count as tier 1.
// An uncleared stage always starts at tier 1, never gains a free higher-tier unlock.
export const clearedThreat = (save, stageId) => save.stageThreat?.[stageId] ?? (save.cleared[stageId] ? 1 : 0);
export const unlockedThreat = (save, stageId) => stageId === 'S1' ? 1 : Math.min(3, clearedThreat(save, stageId) + 1);
export function selectThreat(save, stageId, threat) {
  threatMultipliers(threat);
  if (!Object.hasOwn(STAGE_XP, stageId) || threat > unlockedThreat(save, stageId)
    || (stageId === 'S1' && threat !== 1)) throw new Error('위협도가 잠겨 있습니다.');
  return { ...cloneSave(save), threat };
}

export function buildRoundMods(save) {
  const { capacity: ignoredCapacity, shopDiscount, family, ...mods } = deriveMods(save);
  return {
    ...mods, ...((save.stacks.green_potion || 0) > 0 ? {
      greenPotions: save.stacks.green_potion,
      effectiveAgi: effectiveStats(save).agi,
      greenMods: (() => {
        const boosted = deriveMods({...save, stats: {...save.stats, agi: save.stats.agi + 20}});
        return {speedMult: boosted.speedMult, attackSpeedBonus: boosted.attackSpeedBonus, dodgeCdMult: boosted.dodgeCdMult, iframeBonusMs: boosted.iframeBonusMs};
      })(),
    } : {}), ...(save.lineage && save.lineage !== 'human' ? {lineage:save.lineage} : {}), threat: save.threat ?? 1,
    skills: loadoutOf(save, family), // sim drops weapon-forbidden ids; empty slot 1 = kit default
    potions: save.stacks.potion || 0,
    manaPotions: save.stacks.mana_potion || 0,
    scrolls: save.stacks.return_scroll || 0,
  };
}

export function createTracker(seed) {
  return { seed: seed >>> 0, killIndex: 0, depositedXp: 0, tempLoot: emptyLoot(), skipped: 0,
    gearBudget: 1 + (rng(seed ^ 0x71b0d6e3)() < ECONOMY.questExtraGearChance ? 1 : 0),
    gearAwarded: 0, bossGearAwarded: false };
}

export function usedConsumables(save, player) {
  return Object.fromEntries(Object.entries(USED_KEYS).map(([key, id]) => [key, (save.stacks[id] || 0) - (player[key] ?? 0)]));
}

export function currentLoad(save, tracker, used = {}) {
  const remaining = cloneSave(save);
  for (const [key, id] of Object.entries(USED_KEYS)) remaining.stacks[id] = (save.stacks[id] || 0) - (used[key] || 0);
  const weight = carriedWeight(remaining, tracker.tempLoot);
  return { weight, capacity: capacity(save), ratio: weight / capacity(save) };
}

// A pure event reducer. Main applies its ratio via setLoad; renderer receives fx, never loot ownership.
export function trackRound(save, tracker, events, used = {}, world = null, pid = null) {
  const next = structuredClone(tracker);
  trackMastery(next, events, world, pid);
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
    const mods = deriveMods(save);
    const drop = rollDrops(event.monster, seed, { elite: event.elite === true, threat: event.threat ?? save.threat ?? 1,
      stageId: event.stageId, huntTier: BALANCE.stages[event.stageId]?.huntTier, rarelessRounds: save.rarelessRounds,
      goldBonus: mods.goldBonus, materialBonus: mods.materialBonus, dropLuck: mods.dropLuck });
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
    // Filter only equipment AFTER the original roll: every non-gear RNG stream stays intact.
    // Spend on award, not bag acceptance; overflow, sale/stash and reload cannot reroll a slot.
    const boss = isBossType(event.monster);
    const spawns = STAGES[event.stageId]?.spawns || [];
    // Guardians share boss loot, but must not spend the final authored boss's reserved award.
    const primary = spawns.find(s => BOSS_TUNING[s.monster]?.primary)?.monster || spawns.find(s => isBossType(s.monster))?.monster;
    const reservedBoss = !!primary, reservedAward = boss && (!primary || event.monster === primary);
    let gear = drop.items;
    if (boss) {
      // Keep the original first rolled boss item (including rareless pity), not the best of N.
      gear = [drop.items.find(item => item.uid.includes(':rolled:0:')) || drop.items[0]].filter(Boolean);
      if (event.stageId === 'S4' && !save.flags.chiefPity) {
        gear = [drop.items.find(item => item.id === 'chief_maul')
          || instance(`drop:${seed}:chief-pity`, 'chief_maul', save.createdAt >>> 0)];
      }
    }
    const limit = next.gearBudget - (reservedBoss && !reservedAward && !next.bossGearAwarded ? 1 : 0);
    gear = event.stageId === 'S1' ? [] : gear.slice(0, Math.max(0, limit - next.gearAwarded));
    for (const item of gear) {
      next.gearAwarded++;
      if (reservedAward) next.bossGearAwarded = true;
      if (pickup(item.id, 1, item)) {
        picked.push(item.id);
        // Main settles tempLoot, not the whole tracker. Keep this earned guarantee marker
        // with the loot so sale/storage cannot trigger another chief award at settlement.
        if (event.stageId === 'S4' && item.id === 'chief_maul') next.tempLoot.chiefAwarded = true;
      } else rejected = true;
    }
    // Side contracts count only units actually accepted into the bag on this sortie.
    for (const [id, count] of Object.entries(questGain(save, event, picked))) {
      next.tempLoot.quest ??= { run: next.seed, gains: {} };
      next.tempLoot.quest.gains[id] = (next.tempLoot.quest.gains[id] || 0) + count;
    }
    fx.push({ type: 'drop', x: event.x, y: event.y, gold: drop.gold, picked, rejected });
  }
  return { tracker: next, fx, load: load() };
}

export function settleRound(save, { stageId, terminal, depositedXp = 0, tempLoot = emptyLoot(), used = {}, skillMastery = {}, invasionToken = null }) {
  if (!Object.hasOwn(STAGE_XP, stageId)
    || !['clear', 'return_scroll', 'death'].includes(terminal)) throw new Error('Invalid settlement');
  if (!Number.isSafeInteger(depositedXp) || depositedXp < 0) throw new Error('Invalid XP deposit');
  // Defense at the public settlement boundary, including the existing chief guarantee.
  // Runtime trackers already enforce the smaller seeded budget; no blanket stack truncation.
  tempLoot = structuredClone(tempLoot);
  const questLoot = tempLoot.quest;
  delete tempLoot.quest;
  const invasion = invasionToken !== null && invasionToken === save.activeInvasion;
  tempLoot.items = invasion ? tempLoot.items : stageId === 'S1' ? [] : tempLoot.items.slice(0, 2);
  const threat = stageId === 'S1' ? 1 : save.threat ?? 1;
  selectThreat(save, stageId, threat);
  let next = cloneSave(save);
  const consumption = {};
  for (const [key, id] of Object.entries(USED_KEYS)) {
    const count = used[key] ?? 0;
    if (!Number.isSafeInteger(count) || count < 0 || count > (save.stacks[id] || 0) || id === 'green_potion' && count > 1) {
      throw new Error('Invalid consumable claim');
    }
    // Optional new supply stays absent in legacy saves/receipts when unused.
    if (id === 'green_potion' && !Object.hasOwn(save.stacks, id) && count === 0) continue;
    next.stacks[id] = (save.stacks[id] || 0) - count;
    consumption[id] = count;
  }
  const kept = terminal !== 'death';
  const receipt = {
    stageId, threat, terminal,
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
    pityGranted: kept && tempLoot.items.some(item => item.uid.endsWith(':chief-pity')),
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
    next.stageThreat = { ...(save.stageThreat || {}), [stageId]: Math.max(clearedThreat(save, stageId), threat) };
    next.completedRounds++;
    if (next.completedRounds % ECONOMY.refreshRounds === 0) {
      next.shopRefresh++; next.paidRefreshes = 0; next.shopBought = [];
    }
    if (stageId === 'S4' && !save.flags.chiefPity) {
      if (!tempLoot.chiefAwarded && !tempLoot.items.some((item) => item.id === 'chief_maul')) {
        const item = instance(uniqueUid(next, 'pity:chief_maul'), 'chief_maul', save.createdAt >>> 0);
        if (!invasion && receipt.lootKept.items.length === 2) {
          // Legacy/direct callers may provide two items. Replace the weaker one within the cap.
          const ranks = { common: 0, fine: 1, rare: 2, epic: 3 };
          const weakest = receipt.lootKept.items.reduce((best, candidate, i, items) =>
            ranks[ITEMS[candidate.id].rarity] < ranks[ITEMS[items[best].id].rarity] ? i : best, 0);
          receipt.lootKept.items.splice(weakest, 1);
          // Collision recovery may have renamed the promoted item; locate its exact appended slot.
          next.items.splice(save.items.length + weakest, 1);
        }
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
  const quests = settleQuests(save, next, { kept, gains: questLoot?.gains, run: questLoot?.run });
  const questXp = quests.reduce((sum, quest) => sum + quest.rewardXp, 0);
  if (questXp) {
    const before = next;
    next = addXp(next, questXp);
    let gained = 0;
    for (let level = before.level; level < next.level; level++) gained += xpSpan(level);
    gained += next.xp - before.xp;
    receipt.xpGained += gained;
    receipt.xpDiscarded += questXp - gained;
  }
  if (quests.length) receipt.quests = quests;
  const receivedRare = receipt.lootKept.items.some((item) => ['rare', 'epic'].includes(ITEMS[item.id].rarity));
  if (receivedRare) next.rarelessRounds = 0;
  else if (terminal === 'clear' && stageId !== 'S1') next.rarelessRounds = save.rarelessRounds + 1;
  receipt.levelsGained = next.level - save.level;
  receipt.statPointsGained = receipt.levelsGained * BALANCE.stats.pointsPerLevel;
  const mastery = settleMastery(save, skillMastery);
  next.skillMastery = mastery.skillMastery;
  if (mastery.rises.length) receipt.masteryRises = mastery.rises;
  // Optional v1 metadata keeps the innkeeper's last-run summary across browser reloads.
  next.lastReceipt = structuredClone(receipt);
  return { save: next, receipt };
}

// Applies only a terminal host ledger receipt matching this locally persisted sortie token.
// Clearing the token and banking resources are one save write; old/replayed receipts cannot grant again.
export function settleInvasion(save, account) {
  if (!account || typeof account.token !== 'string') throw new Error('Missing invasion receipt');
  if (save.invasionReceiptId === account.token) return {save,receipt:save.lastReceipt};
  if (save.activeInvasion !== account.token || !['clear','return_scroll','death'].includes(account.terminal)
    || !['hunter','invader'].includes(account.role) || account.role === 'invader' && account.terminal === 'clear') throw new Error('Invalid invasion receipt');
  const result=settleRound(save,{stageId:account.stageId,terminal:account.terminal,
    depositedXp:account.role==='invader'?0:account.depositedXp,tempLoot:account.terminal==='death' ? account.lostLoot || emptyLoot() : account.tempLoot,
    used:account.used,skillMastery:account.skillMastery,invasionToken:account.token});
  delete result.save.activeInvasion;
  result.save.invasionReceiptId=account.token;
  return result;
}
