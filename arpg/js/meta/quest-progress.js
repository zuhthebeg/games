// Personal side-contract ledger. Pure functions over the save; the host sim never sees this.
import { SIDE_QUESTS, SIDE_QUEST_STATES } from '../content/quest-expansion.js';
import { mapUnlocked } from '../content/world-map.js';

const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;

export const questState = (save, id) => save.quests?.[id] ?? null;
export const questOffered = (save, id) => mapUnlocked(save, SIDE_QUESTS[id].offer);

export function acceptQuest(save, id) {
  const quest = SIDE_QUESTS[id];
  if (!quest) throw new Error('알 수 없는 의뢰입니다.');
  if (!questOffered(save, id)) throw new Error('아직 받을 수 없는 의뢰입니다.');
  if (questState(save, id)) throw new Error('이미 받은 의뢰입니다.');
  const next = structuredClone(save);
  next.quests = { ...(save.quests || {}), [id]: { state: 'active', progress: 0 } };
  return next;
}

// trackRound hook: units of the quest item actually accepted into the bag from this kill.
// Only counts while the contract was active at departure (roundSave), on its own maps and monster.
export function questGain(save, event, picked) {
  const gains = {};
  for (const quest of Object.values(SIDE_QUESTS)) {
    if (quest.kind !== 'collect' || questState(save, quest.id)?.state !== 'active') continue;
    if (event.monster !== quest.monster || !quest.maps.includes(event.stageId)) continue;
    const count = picked.filter(id => id === quest.item).length;
    if (count) gains[quest.id] = count;
  }
  return gains;
}

// settleRound hook. `run` identifies the sortie; the same run settled twice never counts twice.
// Death loses the carried units with the rest of the loot, so only kept terminals count.
export function settleQuests(save, next, { kept, gains = {}, run }) {
  const results = [];
  for (const [id, gained] of Object.entries(gains)) {
    const quest = SIDE_QUESTS[id], current = questState(save, id);
    if (!kept || !quest || current?.state !== 'active' || !integer(gained, 1, 1e6)) continue;
    if (run !== undefined && current.last === run) continue;
    const progress = Math.min(quest.target, current.progress + gained);
    const done = progress >= quest.target;
    next.quests = { ...(next.quests || {}), [id]: { state: done ? 'done' : 'active', progress,
      ...(run !== undefined ? { last: run } : {}) } };
    results.push({ id, gained: progress - current.progress, progress, target: quest.target, done,
      rewardXp: done ? quest.rewardXp : 0 });
  }
  return results;
}

export function validQuests(quests) {
  if (!record(quests)) return false;
  return Object.entries(quests).every(([id, entry]) => {
    const quest = SIDE_QUESTS[id];
    if (!quest || !record(entry) || !SIDE_QUEST_STATES.includes(entry.state)) return false;
    if (!integer(entry.progress, 0, quest.target)) return false;
    if ((entry.state === 'done') !== (entry.progress === quest.target)) return false;
    return entry.last === undefined || integer(entry.last, 0, 0xffffffff);
  });
}
