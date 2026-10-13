import { BALANCE } from '../content/balance.js';
export const SAVE_VERSION = 5;
import { SLOTS } from './economy.js';
import { validAffixes } from './affixes.js';
import { BASE_STATS, STAT_KEYS, cap, statBudget } from './stats.js';
import { ITEMS, START_WEAPONS, CONSUMABLES, RECIPES, carriedWeight, capacity } from './items.js';
import { ENCHANT } from './economy.js';
import { resolve, FAMILIES } from './quiz.js';
import { xpSpan, MAX_LEVEL, STAGE_XP } from './progression.js';
import { BOOKS, DEFAULT_SKILLS, hasSkill, validLoadout, loadoutOf } from './skills.js';
import { ABILITIES } from '../content/combat.js';
import { DEFAULT_AUTO_USE, validAutoUse } from './auto-use.js';
import { validQuests } from './quest-progress.js';
import { validMastery, MASTERY_SKILLS } from './skill-mastery.js';
import { validSeenMaterials } from './recipe-discovery.js';

export const SAVE_KEY = 'arpg.save.v1';
export const DEFAULT_AUTO_BUY = Object.freeze({ potion: 20, mana_potion: 0, return_scroll: 1 });

export function createSave({ name, answers, weapon, createdAt }) {
  const result = resolve(answers);
  const chosen = weapon ?? result.weapon;
  const cleanName = name.trim();
  if (Array.from(cleanName).length < 1 || Array.from(cleanName).length > 12) throw new Error('이름은 1~12자입니다.');
  if (!FAMILIES.includes(chosen)) throw new Error('시작 무기가 올바르지 않습니다.');
  return {
    version: SAVE_VERSION, threat: 1, stageThreat: Object.fromEntries(Object.keys(STAGE_XP).map(id => [id, 0])),
    completedRounds: 0, shopRefresh: 0, paidRefreshes: 0, shopBought: [], rarelessRounds: 0,
    createdAt,
    name: cleanName,
    level: 1,
    xp: 0,
    statPoints: 0,
    stats: Object.fromEntries(STAT_KEYS.map((key) => [key, BASE_STATS[key] + result.points[key]])),
    gold: 30,
    equipped: { weapon: 'starter:weapon', head: null, body: 'starter:armor', hands: null, feet: null },
    items: [
      { uid: 'starter:weapon', id: START_WEAPONS[chosen], enhance: 0, affixes: [], rolledAt: 0 },
      { uid: 'starter:armor', id: 'cloth_tunic', enhance: 0, affixes: [], rolledAt: 0 },
    ],
    stacks: { potion: 3, mana_potion: 1, return_scroll: 1 },
    stash: { stacks: {} }, learned: [], skills: {}, skillMastery: {}, loadout: [DEFAULT_SKILLS[chosen], null, null], autoBuy: { ...DEFAULT_AUTO_BUY }, autoUse: { ...DEFAULT_AUTO_USE },
    cleared: Object.fromEntries(Object.keys(STAGE_XP).map((id) => [id, false])),
    flags: { chiefPity: false, starterRestoreUsed: false },
    quiz: { answers: [...answers], weapon: chosen, overridden: chosen !== result.weapon },
  };
}

const integer = (value, min = 0, max = Number.MAX_SAFE_INTEGER) =>
  Number.isSafeInteger(value) && value >= min && value <= max;
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function validReceipt(receipt) {
  if (!record(receipt) || !Object.hasOwn(STAGE_XP, receipt.stageId)
    || !['clear', 'return_scroll', 'death'].includes(receipt.terminal)) return false;
  if (receipt.threat !== undefined && !integer(receipt.threat, 1, 3)) return false;
  for (const key of ['depositedXp', 'xpForfeited', 'stageXp', 'levelsGained',
    'statPointsGained', 'goldGained']) {
    if (!integer(receipt[key])) return false;
  }
  for (const value of [receipt.xpGained, receipt.xpLost, receipt.xpDiscarded ?? 0]) {
    if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value * 2)) return false;
  }
  if (typeof receipt.firstClear !== 'boolean' || typeof receipt.pityGranted !== 'boolean') return false;
  if (receipt.masteryRises !== undefined && (!Array.isArray(receipt.masteryRises)
    || !receipt.masteryRises.every(r => record(r) && MASTERY_SKILLS.includes(r.id) && integer(r.level, 2, 5)))) return false;
  for (const counts of [receipt.used, receipt.restored]) {
    if (!record(counts) || !Object.entries(counts).every(([id, count]) =>
      ['potion', 'mana_potion', 'return_scroll'].includes(id) && integer(count))) return false;
  }
  for (const loot of [receipt.lootKept, receipt.lootLost]) {
    if (!record(loot) || !integer(loot.gold) || !record(loot.stacks) || !Array.isArray(loot.items)) return false;
    if (!Object.entries(loot.stacks).every(([id, count]) => Object.hasOwn(ITEMS, id)
      && ['material', 'consumable'].includes(ITEMS[id].kind) && integer(count))) return false;
    if (!loot.items.every((item) => record(item) && typeof item.uid === 'string'
      && Object.hasOwn(ITEMS, item.id) && SLOTS.includes(ITEMS[item.id].kind)
      && integer(item.enhance, 0, ENCHANT.max) && validAffixes(item, ITEMS[item.id]) && integer(item.rolledAt, 0, 0xffffffff))) return false;
  }
  return true;
}

export function validateSave(save) {
  try {
    if (!record(save) || save.version !== SAVE_VERSION || !integer(save.createdAt)) return false;
    if (typeof save.name !== 'string' || save.name !== save.name.trim()) return false;
    if (Array.from(save.name).length < 1 || Array.from(save.name).length > 12) return false;
    if (!integer(save.level, 1, MAX_LEVEL) || !integer(save.statPoints) || !integer(save.gold)) return false;
    if (!Number.isFinite(save.xp) || save.xp < 0 || save.xp >= xpSpan(save.level)) return false;
    if (!Number.isInteger(save.xp * 2) || (save.level === MAX_LEVEL && save.xp !== 0)) return false;
    if (save.threat !== undefined && !integer(save.threat, 1, 3)) return false;
    if (save.stageThreat !== undefined && (!record(save.stageThreat)
      || !Object.entries(save.stageThreat).every(([id, value]) => Object.hasOwn(STAGE_XP, id) && integer(value, 0, 3)
        && (value === 0 || save.cleared?.[id] === true)))) return false;
    if (!record(save.stats) || Object.keys(save.stats).length !== STAT_KEYS.length) return false;
    const base = BALANCE.stats.base;
    if (!STAT_KEYS.every((key) => integer(save.stats[key], base, cap(save.level)))) return false;
    const spent = STAT_KEYS.reduce((sum, key) => sum + save.stats[key] - base, 0);
    if (spent + save.statPoints !== statBudget(save.level)) return false;
    if (!Array.isArray(save.items) || !save.items.length || !record(save.equipped)) return false;
    const uids = new Set();
    for (const item of save.items) {
      if (!record(item) || typeof item.uid !== 'string' || !item.uid || uids.has(item.uid)) return false;
      if (!Object.hasOwn(ITEMS, item.id) || !SLOTS.includes(ITEMS[item.id].kind)) return false;
      if (!validAffixes(item, ITEMS[item.id]) || !integer(item.rolledAt, 0, 0xffffffff)) return false;
      if (!integer(item.enhance, 0, ENCHANT.max) || (item.uid.startsWith('craft:') && !RECIPES[item.id])) return false;
      uids.add(item.uid);
    }
    // A weapon is still mandatory to launch main.js; newly added armor slots may be empty.
    if (save.equipped.weapon === null || !SLOTS.every((slot) => Object.hasOwn(save.equipped, slot))) return false;
    for (const slot of SLOTS) {
      if (save.equipped[slot] === null) continue;
      const item = save.items.find((candidate) => candidate.uid === save.equipped[slot]);
      if (!item || ITEMS[item.id].kind !== slot) return false;
    }
    if (!['completedRounds', 'shopRefresh', 'paidRefreshes', 'rarelessRounds'].every((key) => integer(save[key]))) return false;
    if (save.enchantCount !== undefined && !integer(save.enchantCount)) return false;
    if (!Array.isArray(save.shopBought) || !save.shopBought.every((uid) => typeof uid === 'string')
      || new Set(save.shopBought).size !== save.shopBought.length) return false;
    if (save.autoBuy !== undefined && (!record(save.autoBuy)
      || !Object.entries(save.autoBuy).every(([id, target]) => CONSUMABLES.includes(id) && integer(target)))) return false;
    if (save.autoUse !== undefined && !validAutoUse(save.autoUse)) return false;
    if (save.loadout !== undefined && !validLoadout(save, save.loadout)) return false;
    if (save.loadouts !== undefined && (!record(save.loadouts) || !Object.entries(save.loadouts)
      .every(([family, loadout]) => Object.hasOwn(DEFAULT_SKILLS, family) && validLoadout(save, loadout)))) return false;
    if (save.seenMaterials !== undefined && !validSeenMaterials(save.seenMaterials)) return false;
    if (!record(save.stacks)) return false;
    if (!record(save.stash) || !record(save.stash.stacks)
      || !Object.entries(save.stash.stacks).every(([id, count]) => Object.hasOwn(ITEMS, id)
        && ITEMS[id].kind === 'consumable' && integer(count))) return false;
    if (!Array.isArray(save.learned) || new Set(save.learned).size !== save.learned.length
      || !save.learned.every(id => typeof id === 'string' && Object.hasOwn(BOOKS, id))) return false;
    if (!record(save.skills) || !Object.entries(save.skills).every(([family, id]) =>
      Object.hasOwn(DEFAULT_SKILLS, family) && typeof id === 'string' && hasSkill(save, id)
        && ABILITIES[id]?.family === family)) return false;
    for (const [id, count] of Object.entries(save.stacks)) {
      if (!Object.hasOwn(ITEMS, id) || !['material', 'consumable'].includes(ITEMS[id].kind) || !integer(count)) {
        return false;
      }
    }
    if (carriedWeight(save) > capacity(save) * 1.2) return false;
    if (!record(save.cleared) || !['S1', 'S2', 'S3', 'S4'].every((id) => typeof save.cleared[id] === 'boolean')) {
      return false;
    }
    // v1 saves made before S5~S7 have no new keys. Missing means not yet cleared; preserve those flags during v2 migration.
    if (!Object.keys(STAGE_XP).every((id) => save.cleared[id] === undefined
      || typeof save.cleared[id] === 'boolean')) return false;
    if (!record(save.flags) || typeof save.flags.chiefPity !== 'boolean'
      || typeof save.flags.starterRestoreUsed !== 'boolean') return false;
    if (!record(save.quiz) || !FAMILIES.includes(save.quiz.weapon) || typeof save.quiz.overridden !== 'boolean') {
      return false;
    }
    const quiz = resolve(save.quiz.answers);
    if (save.quiz.overridden !== (save.quiz.weapon !== quiz.weapon)) return false;
    if (save.lastReceipt !== undefined && !validReceipt(save.lastReceipt)) return false;
    // Optional side-contract ledger; absent on every older save means no contract taken.
    if (save.quests !== undefined && !validQuests(save.quests)) return false;
    if (save.skillMastery !== undefined && !validMastery(save.skillMastery)) return false;
    return true;
  } catch {
    return false;
  }
}

// cocy 10-12: v4 stats (base 5, cap 19, 1 point/level) -> v5 (base 10, cap 100). One old point is
// worth pointScale new points, so every allocation keeps its exact effect; CON/LUK start at base and
// the extra per-level points they come with arrive unspent.
export function migrateStatScale(data) {
  if (!record(data.stats) || !integer(data.level, 1, MAX_LEVEL) || !integer(data.statPoints)) return data;
  const { base, pointScale, pointsPerLevel } = BALANCE.stats;
  const stats = Object.fromEntries(STAT_KEYS.map((key) => [key,
    integer(data.stats[key]) ? base + pointScale * (data.stats[key] - 5) : base]));
  const spent = STAT_KEYS.reduce((sum, key) => sum + stats[key] - base, 0);
  // Remaining = new budget minus what the old points now occupy (old unspent x scale + the new CON/LUK share).
  const statPoints = data.statPoints * pointScale + (pointsPerLevel - pointScale) * (data.level - 1);
  if (spent + statPoints !== statBudget(data.level)) return data; // malformed: leave to validation/backup
  return { ...data, version: SAVE_VERSION, stats, statPoints };
}

// Only this adapter knows about browser storage. Inject storage/clock in tests or future adapters.
export class SaveStore {
  constructor(storage, now = () => Date.now()) {
    this.storage = storage;
    this.now = now;
  }

  load() {
    const raw = this.storage.getItem(SAVE_KEY);
    if (raw === null) return null;
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      data = null;
    }
    if (record(data) && data.version === 3) {
      data = { ...data, version: 4, stash: { stacks: {} }, learned: [], skills: {} };
    }
    if (record(data) && data.version === 4) data = migrateStatScale(data);
    // cocy 10-11: stone grades were removed; a held mid stone becomes two plain stones.
    if (record(data) && record(data.stacks) && integer(data.stacks.enhance_stone_2, 1)) {
      data = { ...data, stacks: { ...data.stacks, enhance_stone_1: (data.stacks.enhance_stone_1 || 0) + 2 * data.stacks.enhance_stone_2 } };
      delete data.stacks.enhance_stone_2;
    }
    if (validateSave(data)) {
      const family = ITEMS[data.items.find(item => item.uid === data.equipped.weapon)?.id]?.family || 'blade';
      return structuredClone({ ...data, autoBuy: { ...DEFAULT_AUTO_BUY, ...data.autoBuy }, autoUse: { ...DEFAULT_AUTO_USE, ...data.autoUse },
        skillMastery: data.skillMastery ?? {}, loadout: loadoutOf(data, family) });
    }
    // Back up before removing. A quota/storage failure leaves the original untouched.
    this.storage.setItem(`${SAVE_KEY}.corrupt.${this.now()}`, raw);
    this.storage.removeItem(SAVE_KEY);
    return null;
  }

  save(data) {
    if (!validateSave(data)) throw new Error('저장 데이터 검증에 실패했습니다.');
    this.storage.setItem(SAVE_KEY, JSON.stringify(data));
  }

  reset() {
    this.storage.removeItem(SAVE_KEY);
  }
}
