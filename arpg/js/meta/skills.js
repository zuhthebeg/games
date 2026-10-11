import { ABILITIES, WEAPONS } from '../content/combat.js';
import { cloneSave } from './items.js';

export const DEFAULT_SKILLS = Object.fromEntries(Object.entries(WEAPONS).map(([family, kit]) => [family, kit.skill]));
export const BOOKS = {
  whirl: { family: 'blade', type: '기술교본', price: 150 },
  heavy_cleave: { family: 'blade', type: '기술교본', price: 250 },
  pierce_shot: { family: 'bow', type: '기술교본', price: 150 },
  blast_arrow: { family: 'bow', type: '기술교본', price: 250 },
  frost_lance: { family: 'focus', type: '마법교본', price: 180 },
  flame_ring: { family: 'focus', type: '마법교본', price: 280 },
};
export const hasSkill = (save, id) => Object.values(DEFAULT_SKILLS).includes(id)
  || (Object.hasOwn(BOOKS, id) && (save.learned || []).includes(id));
export const equippedSkill = (save, family) => save.skills?.[family] || DEFAULT_SKILLS[family];

export function learnSkill(save, id) {
  if (!Object.hasOwn(BOOKS, id)) throw new Error('없는 교본입니다.');
  if (hasSkill(save, id)) throw new Error('이미 배운 기술입니다.');
  const book = BOOKS[id];
  if (save.gold < book.price) throw new Error('골드가 부족합니다.');
  const next = cloneSave(save);
  next.gold -= book.price;
  next.learned.push(id);
  return next;
}

export function equipSkill(save, family, id) {
  if (!Object.hasOwn(DEFAULT_SKILLS, family) || !Object.hasOwn(ABILITIES, id) || ABILITIES[id].family !== family) {
    throw new Error('무기 계열에 맞지 않는 기술입니다.');
  }
  if (!hasSkill(save, id)) throw new Error('아직 배우지 않은 기술입니다.');
  const next = cloneSave(save);
  next.skills[family] = id;
  return next;
}
