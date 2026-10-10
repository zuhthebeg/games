import { BASE_STATS, STAT_KEYS, cap } from './stats.js';
import { ITEMS, START_WEAPONS, RECIPES, carriedWeight, capacity } from './items.js';
import { resolve, FAMILIES } from './quiz.js';
import { xpSpan, MAX_LEVEL, STAGE_XP } from './progression.js';

export const SAVE_KEY = 'arpg.save.v1';

export function createSave({ name, answers, weapon, createdAt }) {
  const result = resolve(answers);
  const chosen = weapon ?? result.weapon;
  const cleanName = name.trim();
  if (Array.from(cleanName).length < 1 || Array.from(cleanName).length > 12) throw new Error('이름은 1~12자입니다.');
  if (!FAMILIES.includes(chosen)) throw new Error('시작 무기가 올바르지 않습니다.');
  return {
    version: 1,
    createdAt,
    name: cleanName,
    level: 1,
    xp: 0,
    statPoints: 0,
    stats: Object.fromEntries(STAT_KEYS.map((key) => [key, BASE_STATS[key] + result.points[key]])),
    gold: 30,
    equipped: { weapon: 'starter:weapon', armor: 'starter:armor' },
    items: [
      { uid: 'starter:weapon', id: START_WEAPONS[chosen], enhance: 0 },
      { uid: 'starter:armor', id: 'cloth_tunic', enhance: 0 },
    ],
    stacks: { potion: 3, mana_potion: 1, return_scroll: 1 },
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
  for (const key of ['depositedXp', 'xpForfeited', 'stageXp', 'levelsGained',
    'statPointsGained', 'goldGained']) {
    if (!integer(receipt[key])) return false;
  }
  for (const value of [receipt.xpGained, receipt.xpLost, receipt.xpDiscarded ?? 0]) {
    if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value * 2)) return false;
  }
  if (typeof receipt.firstClear !== 'boolean' || typeof receipt.pityGranted !== 'boolean') return false;
  for (const counts of [receipt.used, receipt.restored]) {
    if (!record(counts) || !Object.entries(counts).every(([id, count]) =>
      ['potion', 'mana_potion', 'return_scroll'].includes(id) && integer(count))) return false;
  }
  for (const loot of [receipt.lootKept, receipt.lootLost]) {
    if (!record(loot) || !integer(loot.gold) || !record(loot.stacks) || !Array.isArray(loot.items)) return false;
    if (!Object.entries(loot.stacks).every(([id, count]) => Object.hasOwn(ITEMS, id)
      && ['material', 'consumable'].includes(ITEMS[id].kind) && integer(count))) return false;
    if (!loot.items.every((item) => record(item) && typeof item.uid === 'string'
      && Object.hasOwn(ITEMS, item.id) && ['weapon', 'armor'].includes(ITEMS[item.id].kind)
      && integer(item.enhance, 0, 5))) return false;
  }
  return true;
}

export function validateSave(save) {
  try {
    if (!record(save) || save.version !== 1 || !integer(save.createdAt)) return false;
    if (typeof save.name !== 'string' || save.name !== save.name.trim()) return false;
    if (Array.from(save.name).length < 1 || Array.from(save.name).length > 12) return false;
    if (!integer(save.level, 1, MAX_LEVEL) || !integer(save.statPoints) || !integer(save.gold)) return false;
    if (!Number.isFinite(save.xp) || save.xp < 0 || save.xp >= xpSpan(save.level)) return false;
    if (!Number.isInteger(save.xp * 2) || (save.level === MAX_LEVEL && save.xp !== 0)) return false;
    if (!record(save.stats) || Object.keys(save.stats).length !== 5) return false;
    if (!STAT_KEYS.every((key) => integer(save.stats[key], 5, cap(save.level)))) return false;
    const spent = STAT_KEYS.reduce((sum, key) => sum + save.stats[key] - 5, 0);
    if (spent + save.statPoints !== 6 + 3 * (save.level - 1)) return false;
    if (!Array.isArray(save.items) || !save.items.length || !record(save.equipped)) return false;
    const uids = new Set();
    for (const item of save.items) {
      if (!record(item) || typeof item.uid !== 'string' || !item.uid || uids.has(item.uid)) return false;
      if (!Object.hasOwn(ITEMS, item.id) || !['weapon', 'armor'].includes(ITEMS[item.id].kind)) return false;
      if (!integer(item.enhance, 0, 5) || (item.uid.startsWith('craft:') && !RECIPES[item.id])) return false;
      uids.add(item.uid);
    }
    for (const slot of ['weapon', 'armor']) {
      const item = save.items.find((candidate) => candidate.uid === save.equipped[slot]);
      if (!item || ITEMS[item.id].kind !== slot || ITEMS[item.id].requiredLevel > save.level) return false;
    }
    if (!record(save.stacks)) return false;
    for (const [id, count] of Object.entries(save.stacks)) {
      if (!Object.hasOwn(ITEMS, id) || !['material', 'consumable'].includes(ITEMS[id].kind) || !integer(count)) {
        return false;
      }
    }
    if ((save.stacks.return_scroll || 0) > 2 || carriedWeight(save) > capacity(save) * 1.2) return false;
    if (!record(save.cleared) || !['S1', 'S2', 'S3', 'S4'].every((id) => typeof save.cleared[id] === 'boolean')) {
      return false;
    }
    // v1 saves made before S5~S7 have no new keys. Missing means not yet cleared; no migration needed.
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
    return true;
  } catch {
    return false;
  }
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
    if (validateSave(data)) return structuredClone(data);
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
