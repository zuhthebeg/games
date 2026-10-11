import { ABILITIES, WEAPONS, SKILL_SLOTS } from '../content/combat.js';
import { cloneSave, equippedItem, ITEMS } from './items.js';
import { effectiveStats, STAT_NAMES } from './stats.js';

export const DEFAULT_SKILLS = Object.fromEntries(Object.entries(WEAPONS).map(([family, kit]) => [family, kit.skill]));
// skills-v2 §3 (100-point scale): 숙련 30 / 상급 45 of the family stat, counted with gear
// at the moment of learning. Learned books stay learned.
export const BOOKS = {
  whirl: { family: 'blade', type: '기술교본', price: 150, req: { stat: 'str', value: 30 } },
  heavy_cleave: { family: 'blade', type: '기술교본', price: 250, req: { stat: 'str', value: 45 } },
  pierce_shot: { family: 'bow', type: '기술교본', price: 150, req: { stat: 'agi', value: 30 } },
  blast_arrow: { family: 'bow', type: '기술교본', price: 250, req: { stat: 'agi', value: 45 } },
  healing_light: { family: 'focus', type: '마법교본', price: 200, req: { stat: 'int', value: 30 } },
  frost_lance: { family: 'focus', type: '마법교본', price: 180, req: { stat: 'int', value: 30 } },
  flame_ring: { family: 'focus', type: '마법교본', price: 280, req: { stat: 'int', value: 45 } },
};
export function bookRequirement(save, id) {
  const req = BOOKS[id]?.req;
  if (!req) return null;
  const have = effectiveStats(save)[req.stat];
  return { ...req, have, ok: have >= req.value, label: `${STAT_NAMES[req.stat]} ${have}/${req.value}` };
}
export const hasSkill = (save, id) => Object.values(DEFAULT_SKILLS).includes(id)
  || (Object.hasOwn(BOOKS, id) && (save.learned || []).includes(id));
export const equippedSkill = (save, family) => save.skills?.[family] || DEFAULT_SKILLS[family];

export function learnSkill(save, id) {
  if (!Object.hasOwn(BOOKS, id)) throw new Error('없는 교본입니다.');
  if (hasSkill(save, id)) throw new Error('이미 배운 기술입니다.');
  const book = BOOKS[id];
  if (save.gold < book.price) throw new Error('골드가 부족합니다.');
  const req = bookRequirement(save, id);
  if (!req.ok) throw new Error(`능력치 부족 · ${req.label}`);
  const next = cloneSave(save);
  next.gold -= book.price;
  next.learned.push(id);
  return next;
}

// skills-v2 §2: three family-free slots that survive weapon swaps. The sim drops ids the
// current weapon cannot use; an empty or dropped slot 1 falls back to the kit skill.
export const validLoadout = (save, loadout) => Array.isArray(loadout) && loadout.length === SKILL_SLOTS
  && loadout.every(id => id === null || (typeof id === 'string' && Object.hasOwn(ABILITIES, id) && hasSkill(save, id)))
  && new Set(loadout.filter(Boolean)).size === loadout.filter(Boolean).length;

// Saves before K2 had one skill per weapon family: keep that pick in slot 1 and fill the
// other slots with the same family's learned skills, strongest first.
export function migrateLoadout(save, family) {
  const ids = [equippedSkill(save, family), ...characterSkills(save).filter(id => ABILITIES[id].family === family)];
  const unique = [...new Set(ids)].slice(0, SKILL_SLOTS);
  return Array.from({ length: SKILL_SLOTS }, (_, i) => unique[i] ?? null);
}

export const weaponFamily = save => ITEMS[equippedItem(save, 'weapon')?.id]?.family || 'blade';
export const loadoutOf = (save, family = weaponFamily(save)) => (validLoadout(save, save.loadout) ? save.loadout : migrateLoadout(save, family));
export const slotOf = (save, id) => loadoutOf(save).indexOf(id);

// Put a learned skill into a slot (moving it if already slotted). null clears the slot.
export function setSlot(save, family, slot, id) {
  if (!Number.isInteger(slot) || slot < 0 || slot >= SKILL_SLOTS) throw new Error('없는 슬롯입니다.');
  if (id !== null && !hasSkill(save, id)) throw new Error('아직 배우지 않은 기술입니다.');
  const loadout = [...loadoutOf(save, family)];
  const from = id === null ? -1 : loadout.indexOf(id);
  if (from >= 0) loadout[from] = loadout[slot];
  loadout[slot] = id;
  const next = cloneSave(save);
  next.loadout = loadout;
  return next;
}

// Academy "장착": first empty slot, otherwise slot 1. Already slotted skills stay where they are.
export function equipSkill(save, family, id) {
  if (!Object.hasOwn(DEFAULT_SKILLS, family) || !Object.hasOwn(ABILITIES, id)) throw new Error('없는 기술입니다.');
  if (!hasSkill(save, id)) throw new Error('아직 배우지 않은 기술입니다.');
  const loadout = loadoutOf(save, family);
  if (loadout.includes(id)) return save;
  const empty = loadout.indexOf(null);
  return setSlot(save, family, empty >= 0 ? empty : 0, id);
}

// Display-only grades. No combat, book-price or learning requirement changes.
export const SKILL_DISPLAY = {
  lunge:{ grade:0, label:'입문' }, volley:{ grade:0, label:'입문' }, ember_bolt:{ grade:0, label:'입문' },
  whirl:{ grade:1, label:'숙련' }, pierce_shot:{ grade:1, label:'숙련' }, frost_lance:{ grade:1, label:'숙련' }, healing_light:{ grade:1, label:'숙련' },
  heavy_cleave:{ grade:2, label:'상급' }, blast_arrow:{ grade:2, label:'상급' }, flame_ring:{ grade:2, label:'상급' },
};
export const characterSkills = save => Object.keys(SKILL_DISPLAY).filter(id => hasSkill(save, id))
  .sort((a, b) => SKILL_DISPLAY[b].grade - SKILL_DISPLAY[a].grade);
