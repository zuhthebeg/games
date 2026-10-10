import { eff } from './stats.js';
import { NEW_MONSTER_DROPS } from '../content/loot.js';

const weapon = (name, family, rarity, power, weight, form) => ({
  name, kind: 'weapon', family, rarity, power, weight, form,
  requiredLevel: { common: 1, fine: 2, rare: 4 }[rarity],
});
const armor = (name, rarity, hp, weight) => ({
  name, kind: 'armor', rarity, hp, weight,
  requiredLevel: rarity === 'common' ? 1 : 2,
});

export const ITEMS = {
  training_sword: weapon('수련용 검', 'blade', 'common', 1, 8),
  short_bow: weapon('짧은 활', 'bow', 'common', 1, 6),
  apprentice_wand: weapon('견습 지팡이', 'focus', 'common', 1, 4, 'wand'),
  iron_sword: weapon('철검', 'blade', 'fine', 1.15, 12),
  goblin_cleaver: weapon('고블린 식칼', 'blade', 'fine', 1.18, 14),
  hunter_bow: weapon('사냥꾼의 활', 'bow', 'fine', 1.15, 7),
  ember_wand: weapon('불씨 지팡이', 'focus', 'fine', 1.15, 5, 'wand'),
  chief_maul: weapon('대장의 망치', 'blade', 'rare', 1.32, 18),
  cloth_tunic: armor('천 튜닉', 'common', 0, 4),
  leather_vest: armor('가죽 조끼', 'fine', 20, 8),
  boar_hide_armor: armor('멧돼지 가죽 갑옷', 'fine', 35, 12),
  // [제안] Next hunting tier, independent of rarity/enhancement; no old gear rebalance.
  rune_blade: { ...weapon('룬철 검', 'blade', 'fine', 1.35, 13), huntTier: 2, requiredLevel: 5 },
  pack_bow: { ...weapon('늑대 사냥 활', 'bow', 'fine', 1.35, 8), huntTier: 2, requiredLevel: 5 },
  altar_staff: { ...weapon('제단 지팡이', 'focus', 'fine', 1.35, 6, 'staff'), huntTier: 2, requiredLevel: 5 },
  woven_armor: { ...armor('거미줄 가죽 갑옷', 'fine', 50, 10), huntTier: 2, requiredLevel: 5 },
  scrap: { name: '고철', kind: 'material', weight: 0.2 },
  hide: { name: '가죽', kind: 'material', weight: 0.5 },
  fang: { name: '송곳니', kind: 'material', weight: 0.3 },
  // [제안] One rune material and one web material; §10.2 frost_shard is shared with spirit drops.
  rune_shard: { name: '룬 조각', kind: 'material', weight: 0.3 },
  frost_shard: { name: '서리 파편', kind: 'material', weight: 0.3 },
  web: { name: '거미줄', kind: 'material', weight: 0.2 },
  potion: { name: 'HP 물약', kind: 'consumable', weight: 1, price: 10 },
  mana_potion: { name: '마나 물약', kind: 'consumable', weight: 1, price: 12 },
  return_scroll: { name: '귀환 주문서', kind: 'consumable', weight: 1, price: 6, maxCarry: 2 },
};
export const START_WEAPONS = { blade: 'training_sword', bow: 'short_bow', focus: 'apprentice_wand' };
export const CONSUMABLES = ['potion', 'mana_potion', 'return_scroll'];
export const RECIPES = {
  iron_sword: { scrap: 8, fang: 2, gold: 60 },
  hunter_bow: { scrap: 8, hide: 2, gold: 60 },
  ember_wand: { scrap: 8, fang: 3, gold: 60 },
  boar_hide_armor: { scrap: 6, hide: 4, gold: 50 },
  leather_vest: { scrap: 5, hide: 3, gold: 40 },
  // [제안] Scrap remains the common sink; craft salvage refunds only 25% of scrap.
  rune_blade: { scrap: 16, rune_shard: 2, fang: 2, gold: 140 },
  pack_bow: { scrap: 16, hide: 4, web: 2, gold: 140 },
  altar_staff: { scrap: 16, rune_shard: 2, frost_shard: 3, gold: 140 },
  woven_armor: { scrap: 16, hide: 4, web: 4, gold: 140 },
};
export const ENHANCE_SCRAP = [4, 5, 7, 8, 10];
export const ENHANCE_GOLD = [60, 94, 135, 184, 240];
export const enhanceMultiplier = (level) => 1 + 0.04 * level + 0.002 * level ** 2;
export const cloneSave = (save) => structuredClone(save);
export const equippedItem = (save, slot) => save.items.find((item) => item.uid === save.equipped[slot]);

export function capacity(save) {
  return 100 + save.stats.str - 5;
}

export function lootWeight(loot) {
  return loot.items.reduce((sum, item) => sum + ITEMS[item.id].weight, 0)
    + Object.entries(loot.stacks).reduce((sum, [id, count]) => sum + ITEMS[id].weight * count, 0);
}

export function carriedWeight(save, tempLoot = { items: [], stacks: {} }) {
  const equipped = ['weapon', 'armor'].reduce((sum, slot) => sum + ITEMS[equippedItem(save, slot).id].weight, 0);
  const supplies = CONSUMABLES.reduce((sum, id) => sum + (save.stacks[id] || 0) * ITEMS[id].weight, 0);
  return Math.round((equipped + supplies + lootWeight(tempLoot)) * 1000) / 1000;
}

export function uniqueUid(save, prefix) {
  let index = 1;
  while (save.items.some((item) => item.uid === `${prefix}:${index}`)) index++;
  return `${prefix}:${index}`;
}

export function equip(save, uid) {
  const item = save.items.find((candidate) => candidate.uid === uid);
  if (!item) throw new Error('장비를 찾을 수 없습니다.');
  const definition = ITEMS[item.id];
  if (!['weapon', 'armor'].includes(definition.kind)) throw new Error('장비가 아닙니다.');
  if (save.level < definition.requiredLevel) throw new Error(`Lv${definition.requiredLevel}부터 장착할 수 있습니다.`);
  const next = cloneSave(save);
  next.equipped[definition.kind] = uid;
  if (carriedWeight(next) > capacity(next) * 1.2) throw new Error('장착 후 무게가 120%를 넘습니다.');
  return next;
}

export function dismantleRefund(item) {
  // Provenance is encoded in the UID so the instance contract stays {uid, id, enhance}.
  if (item.uid.startsWith('craft:')) return Math.floor(RECIPES[item.id].scrap * 0.25);
  return { common: 2, fine: 5, rare: 12 }[ITEMS[item.id].rarity];
}

export function dismantle(save, uid) {
  const item = save.items.find((candidate) => candidate.uid === uid);
  if (!item || !['weapon', 'armor'].includes(ITEMS[item.id].kind)) throw new Error('분해할 장비가 없습니다.');
  if (Object.values(save.equipped).includes(uid)) throw new Error('장착한 장비는 분해할 수 없습니다.');
  const next = cloneSave(save);
  next.items = next.items.filter((candidate) => candidate.uid !== uid);
  next.stacks.scrap = (next.stacks.scrap || 0) + dismantleRefund(item);
  return next;
}

function spend(save, cost) {
  if (save.gold < cost.gold) throw new Error('골드가 부족합니다.');
  for (const [id, count] of Object.entries(cost)) {
    if (id !== 'gold' && (save.stacks[id] || 0) < count) throw new Error(`${ITEMS[id].name}이 부족합니다.`);
  }
  const next = cloneSave(save);
  next.gold -= cost.gold;
  for (const [id, count] of Object.entries(cost)) {
    if (id !== 'gold') next.stacks[id] -= count;
  }
  return next;
}

export function craft(save, id) {
  if (!RECIPES[id]) throw new Error('없는 제작법입니다.');
  const next = spend(save, RECIPES[id]);
  next.items.push({ uid: uniqueUid(save, `craft:${id}`), id, enhance: 0 });
  return next;
}

export function enhance(save, uid) {
  const item = save.items.find((candidate) => candidate.uid === uid);
  if (!item || item.enhance >= 5) throw new Error('더 강화할 수 없습니다.');
  const next = spend(save, { scrap: ENHANCE_SCRAP[item.enhance], gold: ENHANCE_GOLD[item.enhance] });
  next.items.find((candidate) => candidate.uid === uid).enhance++;
  return next;
}

export function shopPrice(save, id) {
  if (!CONSUMABLES.includes(id)) throw new Error('판매하지 않는 물품입니다.');
  const discount = Math.min(0.1, 0.005 * eff(save.stats.cha));
  return Math.max(1, Math.ceil(ITEMS[id].price * (1 - discount)));
}

export function buy(save, id, count = 1) {
  if (!Number.isSafeInteger(count) || count < 1) throw new Error('구매 수량이 올바르지 않습니다.');
  const next = spend(save, { gold: shopPrice(save, id) * count });
  next.stacks[id] = (next.stacks[id] || 0) + count;
  if (next.stacks[id] > (ITEMS[id].maxCarry ?? Infinity)) throw new Error('귀환 주문서는 최대 2장입니다.');
  if (carriedWeight(next) > capacity(next) * 1.2) throw new Error('구매 후 무게가 120%를 넘습니다.');
  return next;
}

export function dropSeed(roundSeed, killIndex) {
  return (roundSeed ^ Math.imul(killIndex + 1, 0x9e3779b9)) >>> 0;
}

export function rollDrops(monsterType, seed) {
  let state = seed >>> 0;
  const random = () => {
    let value = state = (state + 0x6d2b79f5) >>> 0;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  const integer = (min, max) => min + Math.floor(random() * (max - min + 1));
  const loot = { gold: 0, stacks: {}, items: [] };
  const stack = (id, count, chance = 1) => {
    if (random() < chance) loot.stacks[id] = count;
  };
  const gear = (id, chance) => {
    if (random() < chance) loot.items.push({ uid: `drop:${seed >>> 0}:${id}`, id, enhance: 0 });
  };
  const table = NEW_MONSTER_DROPS[monsterType];
  if (table) {
    loot.gold = integer(...table.gold);
    for (const entry of table.stacks) stack(entry.id, entry.count, entry.chance ?? 1);
    for (const entry of table.items) gear(entry.id, entry.chance);
    return loot;
  }
  switch (monsterType) {
    case 'goblin_grunt':
      loot.gold = integer(3, 6);
      stack('scrap', 1, 0.6);
      stack('fang', 1, 0.4);
      stack('potion', 1, 0.15);
      gear('goblin_cleaver', 0.06);
      break;
    case 'goblin_slinger':
      loot.gold = integer(2, 5);
      stack('scrap', 1, 0.5);
      stack('hide', 1, 0.3);
      stack('mana_potion', 1, 0.15);
      break;
    case 'iron_boar':
      loot.gold = integer(6, 10);
      stack('hide', 2);
      stack('scrap', integer(1, 2));
      stack('potion', 1, 0.2);
      gear('leather_vest', 0.1);
      break;
    case 'goblin_chief':
      loot.gold = integer(25, 40);
      stack('scrap', 3);
      stack('fang', 2);
      gear('chief_maul', 0.25);
      break;
    case 'scarecrow':
      break;
    default:
      throw new Error(`unknown drop table: ${monsterType}`);
  }
  return loot;
}
