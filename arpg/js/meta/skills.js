import { ABILITIES, WEAPONS, SKILL_SLOTS, canUseSkill, skillLineageEligible } from '../content/combat.js';
import { cloneSave, equippedItem, ITEMS } from './items.js';
import { effectiveStats, STAT_NAMES } from './stats.js';

export const DEFAULT_SKILLS = Object.fromEntries(Object.entries(WEAPONS).map(([family, kit]) => [family, kit.skill]));
// skills-v2 §3 (100-point scale): 숙련 30 / 상급 45 of the family stat, counted with gear
// at the moment of learning. Learned books stay learned.
export const BOOKS = {
  poison_arrow:{family:'bow',type:'해골 교본',price:220,req:{stat:'agi',value:30}},
  cursed_hands:{family:'focus',type:'해골 교본',price:280,req:{stat:'int',value:30}},
  blood_spear:{family:'focus',type:'해골 교본',price:300,req:{stat:'int',value:45}},
  dead_explosion:{family:'blade',type:'해골 교본',price:320,req:{stat:'str',value:45}},
  poison_field:{family:'blade',type:'해골 교본',price:280,req:{stat:'str',value:30}},
  curse:{family:'blade',type:'해골 교본',price:280,req:{stat:'str',value:30}},
  invisibility:{family:'blade',type:'해골 교본',price:300,req:{stat:'str',value:30}},
  sword_wave:{family:'blade',type:'기술교본',price:300,req:{stat:'str',value:45}},
  berserk:{family:'blade',type:'기술교본',price:300,req:{stat:'str',value:45}},
  whirl: { family: 'blade', type: '기술교본', price: 150, req: { stat: 'str', value: 30 } },
  heavy_cleave: { family: 'blade', type: '기술교본', price: 250, req: { stat: 'str', value: 45 } },
  ground_slam: { family: 'blade', type: '기술교본', price: 180, req: { stat: 'str', value: 30 } },
  armor_break: { family: 'blade', type: '기술교본', price: 250, req: { stat: 'str', value: 45 } },
  triple_arrow: { family: 'bow', type: '기술교본', price: 180, req: { stat: 'agi', value: 30 } },
  evasion_shot: { family: 'bow', type: '기술교본', price: 250, req: { stat: 'agi', value: 45 } },
  pierce_shot: { family: 'bow', type: '기술교본', price: 150, req: { stat: 'agi', value: 30 } },
  blast_arrow: { family: 'bow', type: '기술교본', price: 250, req: { stat: 'agi', value: 45 } },
  protective_shield: { family: 'focus', type: '마법교본', price: 200, req: { stat: 'int', value: 30 } },
  turn_undead: { family: 'focus', type: '마법교본', price: 200, req: { stat: 'int', value: 30 } },
  healing_light: { family: 'focus', type: '마법교본', price: 200, req: { stat: 'int', value: 30 } },
  frost_lance: { family: 'focus', type: '마법교본', price: 180, req: { stat: 'int', value: 30 } },
  rain_arrow: { family: 'bow', type: '기술교본', price: 300, req: { stat: 'agi', value: 45 } },
  spinning_shot: { family: 'bow', type: '기술교본', price: 280, req: { stat: 'agi', value: 45 } },
  meteor: { family: 'focus', type: '마법교본', price: 360, req: { stat: 'int', value: 45 } },
  firewall: { family: 'focus', type: '마법교본', price: 300, req: { stat: 'int', value: 45 } },
  flame_ring: { family: 'focus', type: '마법교본', price: 280, req: { stat: 'int', value: 45 } },
};
export function bookRequirement(save, id) {
  const req = BOOKS[id]?.req;
  if (!req) return null;
  const have = effectiveStats(save)[req.stat];
  return { ...req, have, ok: have >= req.value, label: `${STAT_NAMES[req.stat]} ${have}/${req.value}` };
}
export const skillSchool = id => ['poison_field','curse','invisibility'].includes(id) ? 'focus' : ABILITIES[id]?.family;
export const skillLineageAllowed = (save,id) => skillLineageEligible(id,save.lineage);
// Save ownership is distinct from current lineage permission: never erase hidden learned books.
export const ownsSkill = (save,id) => Object.values(DEFAULT_SKILLS).includes(id) || Object.hasOwn(BOOKS,id) && (save.learned || []).includes(id);
export const hasSkill = (save, id) => skillLineageAllowed(save,id) && (Object.values(DEFAULT_SKILLS).includes(id)
  || (Object.hasOwn(BOOKS, id) && (save.learned || []).includes(id)));
export const equippedSkill = (save, family) => save.skills?.[family] || DEFAULT_SKILLS[family];

export function learnSkill(save, id) {
  if (!Object.hasOwn(BOOKS, id)) throw new Error('없는 교본입니다.');
  if (!skillLineageAllowed(save,id)) throw new Error('현재 계보로 배울 수 없는 기술입니다.');
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
  && Array.from(loadout).every(id => id === null || (typeof id === 'string' && Object.hasOwn(ABILITIES, id) && ownsSkill(save, id)))
  && new Set(loadout.filter(Boolean)).size === loadout.filter(Boolean).length;

// Saves before K2 had one skill per weapon family: keep that pick in slot 1 and fill the
// other slots with the same family's learned skills, strongest first.
export function migrateLoadout(save, family) {
  const ids = [equippedSkill(save, family), ...characterSkills(save).filter(id => ABILITIES[id].family === family)];
  const unique = [...new Set(ids)].slice(0, SKILL_SLOTS);
  return Array.from({ length: SKILL_SLOTS }, (_, i) => unique[i] ?? null);
}

export const weaponFamily = save => ITEMS[equippedItem(save, 'weapon')?.id]?.family || 'blade';
export const weaponForm = save => ITEMS[equippedItem(save, 'weapon')?.id]?.form;
export const loadoutOf = (save, family = weaponFamily(save)) => (validLoadout(save, save.loadout) ? save.loadout : migrateLoadout(save, family));
export const slotOf = (save, id) => loadoutOf(save).indexOf(id);

// cocy 10-13: changing weapon family restores the loadout last set while holding that family.
// A family never held before keeps the current loadout (the sim drops unusable ids).
export function withFamilyLoadout(prev, next) {
  const before = weaponFamily(prev), after = weaponFamily(next);
  if (before === after) return next;
  const out = cloneSave(next);
  out.loadouts = { ...(prev.loadouts || {}), [before]: [...loadoutOf(prev, before)] };
  if (validLoadout(out, out.loadouts[after])) out.loadout = [...out.loadouts[after]];
  return out;
}

// Exact form histories are bounded and separate from the legacy family API above.
export const WEAPON_LOADOUT_KEYS = Object.freeze(['blade:sword', 'blade:blunt', 'bow:bow', 'focus:wand', 'focus:staff']);
export const weaponLoadoutKey = save => {
  const family = weaponFamily(save), form = weaponForm(save) || (family === 'blade' ? 'sword' : family);
  const key = `${family}:${form}`;
  if (!WEAPON_LOADOUT_KEYS.includes(key)) throw new Error('알 수 없는 무기 형태입니다.');
  return key;
};
export const validWeaponLoadouts = (save, map) => map !== null && typeof map === 'object' && !Array.isArray(map)
  && Object.entries(map).every(([key, slots]) => WEAPON_LOADOUT_KEYS.includes(key) && validLoadout(save, slots));

// next is an already validated equip/purchase clone. No writes or learning costs here.
export function weaponLoadoutCandidate(prev, next, { keepCurrent = false } = {}) {
  if (prev.equipped.weapon === next.equipped.weapon) return { save: prev, reason: 'same-uid' };
  const before = [...loadoutOf(prev)];
  if ((prev.loadout !== undefined && !validLoadout(prev, prev.loadout)) || !validLoadout(prev, before) || (prev.weaponLoadouts !== undefined && !validWeaponLoadouts(prev, prev.weaponLoadouts))) {
    throw new Error('스킬 기억이 올바르지 않습니다.');
  }
  const from = weaponLoadoutKey(prev), to = weaponLoadoutKey(next);
  const history = prev.weaponLoadouts || {}, remembered = history[to];
  // Staff-locked selections remain remembered/visible; only runtime casting is blocked.
  const filtered = remembered?.map(id => id !== null && (ABILITIES[id]?.requiresFocus || canUseSkill(id, weaponFamily(next), weaponForm(next), next.lineage, ITEMS[equippedItem(next, 'weapon')?.id]?.handedness)) ? id : null);
  const reason = keepCurrent ? 'current' : from === to ? 'same-form' : !remembered ? 'unseen'
    : filtered.some(Boolean) ? 'remembered' : 'unusable';
  const after = reason === 'remembered' ? filtered : before;
  const out = cloneSave(next);
  out.loadout = [...after];
  out.weaponLoadouts = { ...structuredClone(history), [from]: [...before], [to]: [...after] };
  return { save: out, before, after: [...after], from, to, reason, remembered: remembered ? [...remembered] : null };
}

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
  poison_arrow:{grade:1,label:'해골'}, cursed_hands:{grade:1,label:'해골'}, blood_spear:{grade:2,label:'해골'}, dead_explosion:{grade:2,label:'해골'},
  poison_field:{grade:2,label:'해골'}, curse:{grade:2,label:'해골'}, invisibility:{grade:2,label:'해골'}, sword_wave:{grade:2,label:'상급'}, berserk:{grade:2,label:'상급'},
  rain_arrow:{ grade:2, label:'상급' }, spinning_shot:{ grade:2, label:'상급' },
  meteor:{ grade:2, label:'상급' }, firewall:{ grade:2, label:'상급' },
  lunge:{ grade:0, label:'입문' }, volley:{ grade:0, label:'입문' }, ember_bolt:{ grade:0, label:'입문' },
  whirl:{ grade:1, label:'숙련' }, pierce_shot:{ grade:1, label:'숙련' }, frost_lance:{ grade:1, label:'숙련' }, healing_light:{ grade:1, label:'숙련' }, turn_undead:{ grade:1, label:'숙련' },
  protective_shield:{ grade:1, label:'숙련' },
  triple_arrow:{ grade:1, label:'숙련' }, evasion_shot:{ grade:2, label:'상급' },
  ground_slam:{ grade:1, label:'숙련' }, armor_break:{ grade:2, label:'상급' },
  heavy_cleave:{ grade:2, label:'상급' }, blast_arrow:{ grade:2, label:'상급' }, flame_ring:{ grade:2, label:'상급' },
};
export const characterSkills = save => Object.keys(SKILL_DISPLAY).filter(id => hasSkill(save, id))
  .sort((a, b) => SKILL_DISPLAY[b].grade - SKILL_DISPLAY[a].grade);
