import { eff, effectiveStats } from './stats.js';
import { SLOTS, MATERIAL_STACK, SALVAGE, ECONOMY, ENCHANT, STONE, GREATER_STONE, rng, weighted, SLOT_BIASES, RECIPES, enhanceMultiplier } from './economy.js';
import { rollAffixes, affixTotals } from './affixes.js';
export { rollAffixes, DEFERRED_AFFIXES } from './affixes.js';
import { BALANCE, threatMultipliers } from '../content/balance.js';
import { NEW_MONSTER_DROPS } from '../content/loot.js';

const weapon = (name, family, rarity, power, weight, form) => ({
  name, kind: 'weapon', slot: 'weapon', huntTier: 1, material: family === 'blade' ? 'metal' : 'wood', family, rarity, power, weight, form,
  requiredLevel: { common: 1, fine: 2, rare: 4 }[rarity],
});
// AC = old armor HP × 2/3: keeps effective HP within ~10% of the old HP model across hunting tiers.
const toAc = (hp) => Math.round(hp * 2 / 3);
const armor = (name, rarity, hp, weight, material = 'leather') => ({
  name, kind: 'body', slot: 'body', huntTier: 1, material, armorClass: weight <= 4 ? 'light' : weight <= 8 ? 'medium' : 'heavy', rarity, ac: toAc(hp), weight,
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
  chief_maul: weapon('대장의 망치', 'blade', 'rare', 1.32, 18, 'blunt'),
  cloth_tunic: armor('천 튜닉', 'common', 0, 4, 'cloth'),
  leather_vest: armor('가죽 조끼', 'fine', 20, 8),
  boar_hide_armor: armor('멧돼지 가죽 갑옷', 'fine', 35, 12),
  // [제안] Next hunting tier, independent of rarity/enhancement; no old gear rebalance.
  rune_blade: { ...weapon('룬철 검', 'blade', 'fine', 1.35, 13), material: 'rune', huntTier: 2, requiredLevel: 5 },
  pack_bow: { ...weapon('늑대 사냥 활', 'bow', 'fine', 1.35, 8), huntTier: 2, requiredLevel: 5 },
  altar_staff: { ...weapon('제단 지팡이', 'focus', 'fine', 1.35, 6, 'staff'), huntTier: 2, requiredLevel: 5 },
  woven_armor: { ...armor('거미줄 가죽 갑옷', 'fine', 50, 10, 'cloth'), huntTier: 2, requiredLevel: 5 },
  // [제안] Hunting tier 3 for S11~S20: +0.25 power / +25 HP over tier 2, Lv10 gate.
  warden_blade: { ...weapon('파수꾼의 대검', 'blade', 'fine', 1.6, 15), huntTier: 3, requiredLevel: 10 },
  frost_bow: { ...weapon('서리 장궁', 'bow', 'fine', 1.6, 9), huntTier: 3, requiredLevel: 10 },
  seal_staff: { ...weapon('봉인의 지팡이', 'focus', 'fine', 1.6, 7, 'staff'), huntTier: 3, requiredLevel: 10 },
  warden_plate: { ...armor('파수꾼 판금 갑옷', 'fine', 75, 13, 'metal'), huntTier: 3, requiredLevel: 10 },
  rune_maul: { ...weapon('룬철 철퇴', 'blade', 'fine', 1.35, 15, 'blunt'), material: 'rune', huntTier: 2, requiredLevel: 5, craftOnly: true },
  warden_maul: { ...weapon('파수꾼 전쟁망치', 'blade', 'fine', 1.6, 19, 'blunt'), huntTier: 3, requiredLevel: 10, craftOnly: true },
  // T4 carries the authored Lv15 band; meetsRequirement still uses strength only.
  revenant_blade: { ...weapon('망자의 장검', 'blade', 'fine', 1.85, 17), huntTier: 4, requiredLevel: 15 },
  bone_bow: { ...weapon('뼈 장궁', 'bow', 'fine', 1.85, 11), huntTier: 4, requiredLevel: 15 },
  soulfire_wand: { ...weapon('넋불 완드', 'focus', 'fine', 1.85, 7, 'wand'), huntTier: 4, requiredLevel: 15 },
  gravekeeper_staff: { ...weapon('묘지기 지팡이', 'focus', 'fine', 1.85, 9, 'staff'), huntTier: 4, requiredLevel: 15 },
  ossuary_maul: { ...weapon('납골당 철퇴', 'blade', 'fine', 1.85, 20, 'blunt'), huntTier: 4, requiredLevel: 15 },
  shroud_robe: { ...armor('수의 로브', 'fine', 100, 6, 'cloth'), huntTier: 4, requiredLevel: 15 },
  shadow_leather: { ...armor('그림자 가죽 갑옷', 'fine', 100, 12, 'leather'), huntTier: 4, requiredLevel: 15 },
  ossuary_plate: { ...armor('납골 판금', 'fine', 100, 15, 'metal'), huntTier: 4, requiredLevel: 15 },
  dragonfang_blade: { ...weapon('용송곳니 검', 'blade', 'rare', 1.95, 17), huntTier: 4, requiredLevel: 15, dropOnly: 'throne_dragon' },
  dragon_scale_armor: { ...armor('수호룡 비늘 갑옷', 'rare', 110, 15, 'metal'), huntTier: 4, requiredLevel: 15, dropOnly: 'throne_dragon' },
  dragon_scale: { name: '수호룡 비늘', kind: 'material', weight: 0.3, sell: 6 },
  scrap: { material: 'metal', name: '고철', kind: 'material', weight: 0.2, sell: 1 },
  hide: { material: 'leather', name: '가죽', kind: 'material', weight: 0.5, sell: 2 },
  wood: { name: '목재', kind: 'material', material: 'wood', weight: 0.2, sell: 1 },
  fang: { name: '송곳니', kind: 'material', weight: 0.3, sell: 2 },
  // [제안] One rune material and one web material; §10.2 frost_shard is shared with spirit drops.
  rune_shard: { material: 'rune', name: '룬 조각', kind: 'material', weight: 0.3, sell: 4 },
  frost_shard: { name: '서리 파편', kind: 'material', weight: 0.3, sell: 4 },
  web: { material: 'cloth', name: '거미줄', kind: 'material', weight: 0.2, sell: 2 },
  potion: { name: 'HP 물약', kind: 'consumable', weight: 0.1, price: 3 },
  mana_potion: { name: '마나 물약', kind: 'consumable', weight: 0.1, price: 5 },
  return_scroll: { name: '귀환 주문서', kind: 'consumable', weight: 0.01, price: 10 },
};
const TIER_LEVEL = { 2: 5, 3: 10, 4: 15 };
// Tables are base stats; instances vary only through affixes, never hidden stat rolls.
for (const [slot, hp, weight] of [['head', 4, 2], ['hands', 3, 1.5], ['feet', 3, 1.5]]) {
  for (const [armorClass, scale] of [['light', 1], ['medium', 1.5], ['heavy', 2]]) {
    for (const [rarity, tier] of [['common', 1], ['fine', 1], ['fine', 2], ['fine', 3]]) {
      const id = `${slot}_${armorClass}_${rarity}_t${tier}`;
      ITEMS[id] = { name: `${{head:'머리',hands:'장갑',feet:'신발'}[slot]} · ${armorClass} T${tier}`,
        kind: slot, slot, material: slot === 'head' || armorClass === 'heavy' ? 'metal' : 'leather', armorClass, rarity, huntTier: tier,
        ac: toAc(Math.round(hp * scale * tier * ECONOMY.rarityPower[rarity])),
        weight: weight * scale, requiredLevel: TIER_LEVEL[tier] ?? (rarity === 'common' ? 1 : 2) };
    }
  }
}
// Add rarity variants for every existing base, retaining original IDs and original stats.
for (const [id, base] of Object.entries(ITEMS)) {
  if (!SLOTS.includes(base.kind)) continue;
  base.baseId = id;
  base.basePrice = ECONOMY.slotPrice[base.slot] * base.huntTier;
  for (const rarity of ['common', 'fine', 'rare', 'epic']) {
    if (rarity === base.rarity) continue;
    const ratio = ECONOMY.rarityPower[rarity] / ECONOMY.rarityPower[base.rarity];
    ITEMS[`${id}_${rarity}`] = { ...base, rarity,
      ...(base.power !== undefined ? { power: base.power * ratio } : { ac: base.ac ? Math.round(base.ac * ratio) : toAc(ECONOMY.starterBodyHp[rarity]) }),
      requiredLevel: TIER_LEVEL[base.huntTier] ?? { common: 1, fine: 2, rare: 4, epic: 6 }[rarity] };
  }
}
// cocy 10-11 16:04: no level gates at all. Heavy gear asks for strength instead — the weight is the reason.
// [제안] Weapons from 12 kg, heavy armor of any slot; the hunting tier adds 2 per tier so tier-3 heavy
// gear still lands mid-game. Light/medium gear and bows/wands stay free.
// cocy 10-12 stat scale: the 10-11 values (old points) map to base + 6 x (old - 5) — same timing.
const oldStrToNew = (old) => old ? BALANCE.stats.base + BALANCE.stats.pointScale * (old - 5) : 0;
export function strRequirement(def) {
  const tierStep = 2 * ((def?.huntTier || 1) - 1);
  if (def?.kind === 'weapon') return oldStrToNew(def.weight >= 12 ? 4 + (def.weight - 10) + tierStep : 0);
  if (def?.armorClass !== 'heavy') return 0;
  return oldStrToNew(def.kind === 'body' ? 4 + (def.weight - 8) + tierStep : 6 + tierStep);
}
for (const item of Object.values(ITEMS)) {
  if (!SLOTS.includes(item.kind)) continue;
  // T4's authored band is metadata, never a runtime gate (meetsRequirement below).
  if (item.huntTier !== 4) item.requiredLevel = 1;
  item.requiredStr = strRequirement(item);
}
export const meetsRequirement = (save, def) => (save.stats?.str ?? BALANCE.stats.base) >= (def?.requiredStr || 0);
export const requirementLabel = (def) => def?.requiredStr ? `힘 ${def.requiredStr}` : '';
// cocy 10-11: one ungraded stone + the greater stone. enhance_stone_2 is legacy only (old receipts);
// SaveStore.load converts held mid stones into plain stones.
ITEMS.enhance_stone_1 = { name: '강화석', kind: 'material', weight: 0.1, sell: 2 };
ITEMS.enhance_stone_2 = { name: '중급 강화석', kind: 'material', weight: 0.1, sell: 2, legacy: true };
ITEMS.enhance_stone_3 = { name: '상급 강화석', kind: 'material', weight: 0.1, sell: 25 };
ITEMS.scroll_enchant_weapon = { name: '무기 강화 주문서', kind: 'material', weight: 0, sell: 8, enchant: 'weapon' };
ITEMS.scroll_enchant_armor = { name: '방어구 강화 주문서', kind: 'material', weight: 0, sell: 8, enchant: 'armor' };
ITEMS.scroll_blessed_weapon = { name: '축복받은 무기 강화 주문서', kind: 'material', weight: 0, sell: 30, enchant: 'weapon', blessed: true };
ITEMS.scroll_blessed_armor = { name: '축복받은 방어구 강화 주문서', kind: 'material', weight: 0, sell: 30, enchant: 'armor', blessed: true };
export const instance = (uid, id, seed = 0, affixes = rollAffixes(ITEMS[id].rarity, ITEMS[id].huntTier, seed)) =>
  ({ uid, id, enhance: 0, affixes, rolledAt: seed >>> 0 });

export const START_WEAPONS = { blade: 'training_sword', bow: 'short_bow', focus: 'apprentice_wand' };
export const CONSUMABLES = ['potion', 'mana_potion', 'return_scroll'];
export { RECIPES, enhanceMultiplier } from './economy.js';
// Lineage-style: every armor enchant level is +1 AC on that piece.
export const armorAc = (item) => item && ITEMS[item.id]?.power === undefined ? (ITEMS[item.id]?.ac || 0) + (item.enhance || 0) : 0;
// Strength requirements remain tied to the definition’s original weight.
export const effectiveWeight = (item) => (ITEMS[item?.id]?.weight || 0) * (1 - 0.03 * (item?.enhance || 0));
export const cloneSave = (save) => structuredClone(save);
export const equippedItem = (save, slot) => save.items.find((item) => item.uid === save.equipped[slot]);

export function capacity(save) {
  return 100 + BALANCE.stats.capacity * eff(effectiveStats(save).str) + affixTotals(SLOTS.map((slot) => equippedItem(save, slot))).capacity_flat;
}

export function lootWeight(loot) {
  return loot.items.reduce((sum, item) => sum + effectiveWeight(item), 0)
    + Object.entries(loot.stacks).reduce((sum, [id, count]) => sum + ITEMS[id].weight * count, 0);
}

export function carriedWeight(save, tempLoot = { items: [], stacks: {} }) {
  const equipped = SLOTS.reduce((sum, slot) => sum + effectiveWeight(equippedItem(save, slot)), 0);
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
  if (!SLOTS.includes(definition.kind)) throw new Error('장비가 아닙니다.');
  if (!meetsRequirement(save, definition)) throw new Error(`힘 ${definition.requiredStr} 이상이어야 장착할 수 있습니다.`);
  const next = cloneSave(save);
  next.equipped[definition.kind] = uid;
  if (carriedWeight(next) > capacity(next) * 1.2) throw new Error('장착 후 무게가 120%를 넘습니다.');
  return next;
}

export const dismantleMaterial = (item) => MATERIAL_STACK[ITEMS[item.id].material];

export function dismantleRefund(item) {
  // Craft provenance stays in the UID; affixes never increase salvage.
  if (item.uid.startsWith('craft:')) return Math.floor(RECIPES[item.id][dismantleMaterial(item)] * ECONOMY.craftRefundFraction);
  return SALVAGE[ITEMS[item.id].rarity];
}

// Enhanced gear also returns stones; primary material stays tied to rarity/provenance above.
export const dismantleStones = (item) => ({
  [STONE]: ENCHANT.dismantleStones[item.enhance] || 0,
  [GREATER_STONE]: ENCHANT.dismantleGreater[item.enhance] || 0,
});

export function dismantle(save, uid) {
  const matches = save.items.filter((candidate) => candidate.uid === uid);
  if (matches.length > 1) throw new Error('장비 식별자가 중복됩니다.');
  const item = matches[0];
  if (!item || !SLOTS.includes(ITEMS[item.id]?.kind)) throw new Error('분해할 장비가 없습니다.');
  if (Object.values(save.equipped).includes(uid)) throw new Error('장착한 장비는 분해할 수 없습니다.');
  const next = cloneSave(save);
  next.items = next.items.filter((candidate) => candidate.uid !== uid);
  const material = dismantleMaterial(item);
  next.stacks[material] = (next.stacks[material] || 0) + dismantleRefund(item);
  for (const [id, count] of Object.entries(dismantleStones(item))) if (count) next.stacks[id] = (next.stacks[id] || 0) + count;
  return next;
}

function spend(save, cost) {
  if (!Number.isSafeInteger(cost.gold) || cost.gold < 0 || Object.entries(cost).some(([id, count]) =>
    id !== 'gold' && (!Number.isSafeInteger(count) || count < 1 || ITEMS[id]?.kind !== 'material'))) {
    throw new Error('재료 수량이 올바르지 않습니다.');
  }
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
  next.items.push(instance(uniqueUid(save, `craft:${id}`), id, save.createdAt ^ save.items.length));
  return next;
}

export function shopPrice(save, id) {
  if (!CONSUMABLES.includes(id)) throw new Error('판매하지 않는 물품입니다.');
  const discount = Math.min(BALANCE.stats.discountCap, BALANCE.stats.discount * eff(effectiveStats(save).cha));
  return Math.max(1, Math.ceil(ITEMS[id].price * (1 - discount)));
}

export function buy(save, id, count = 1) {
  if (!Number.isSafeInteger(count) || count < 1) throw new Error('구매 수량이 올바르지 않습니다.');
  const next = spend(save, { gold: shopPrice(save, id) * count });
  next.stacks[id] = (next.stacks[id] || 0) + count;
  if (carriedWeight(next) > capacity(next)) throw new Error('구매 후 소지 무게가 100%를 넘습니다. 창고에 보급을 맡겨 주세요.');
  return next;
}

export function moveConsumable(save, id, count, destination) {
  if (!CONSUMABLES.includes(id) || !['bag', 'stash'].includes(destination)) throw new Error('옮길 소모품을 확인하세요.');
  const source = destination === 'stash' ? save.stacks : save.stash.stacks;
  if (!Number.isSafeInteger(count) || count < 1 || count > (source[id] || 0)) throw new Error('이동 수량이 올바르지 않습니다.');
  const next = cloneSave(save);
  const from = destination === 'stash' ? next.stacks : next.stash.stacks;
  const to = destination === 'stash' ? next.stash.stacks : next.stacks;
  from[id] -= count;
  to[id] = (to[id] || 0) + count;
  if (destination === 'bag') {
    if (carriedWeight(next) > capacity(next)) throw new Error('가방 소지 무게가 100%를 넘습니다.');
  }
  return next;
}

export function dropSeed(roundSeed, killIndex) {
  return (roundSeed ^ Math.imul(killIndex + 1, 0x9e3779b9)) >>> 0;
}

function legacyDrops(monsterType, seed, materialBonus = 0, gearMultiplier = 1) {
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
    if (random() < Math.min(1, chance + (ITEMS[id].kind === 'material' ? materialBonus / 100 : 0))) loot.stacks[id] = count;
  };
  const gear = (id, chance) => {
    if (random() < Math.min(1, chance * gearMultiplier)) loot.items.push(instance(`drop:${seed >>> 0}:${id}`, id, seed));
  };
  const table = NEW_MONSTER_DROPS[monsterType];
  if (table) {
    loot.gold = integer(...table.gold);
    for (const entry of table.stacks) stack(entry.id, entry.count, entry.chance ?? 1);
    for (const entry of table.items) if (!entry.exclusive) gear(entry.id, entry.chance);
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
      stack('wood', 1, 0.5);
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

// Additive M1.5 stream: legacy probabilities/seed order remain intact.
export function rollDrops(monsterType, seed, ctx = {}) {
  const bonusSum = Math.max(0, (ctx.goldBonus || 0) + (ctx.materialBonus || 0));
  const capScale = bonusSum > ECONOMY.dropBonusCap ? ECONOMY.dropBonusCap / bonusSum : 1;
  const materialBonus = Math.max(0, ctx.materialBonus || 0) * capScale;
  const threat = threatMultipliers(ctx.threat ?? 1);
  const loot = legacyDrops(monsterType, seed, materialBonus, threat.drop);
  if (monsterType === 'scarecrow') return loot;
  const random = rng(seed ^ 0xa521d937);
  const tier = Math.max(1, Math.min(4, ctx.huntTier ?? (NEW_MONSTER_DROPS[monsterType] ? 2 : 1)));
  const boss = monsterType === 'goblin_chief' || ctx.boss === true;
  const elite = ctx.elite ?? false;
  const chance = boss ? 1 : elite ? ECONOMY.eliteGearChance : ECONOMY.gearChance;
  // LUK raises the gear drop chance (cocy 10-12); same single draw, so seeds stay aligned.
  if (random() < Math.min(1, chance * threat.drop * (1 + Math.max(0, ctx.dropLuck || 0)))) {
    const count = boss ? 1 + (random() < ECONOMY.bossExtraChance ? 1 : 0) : 1;
    for (let i = 0; i < count; i++) {
      let rarity = weighted(Object.entries((ctx.threat ?? 1) === 1 ? (boss ? ECONOMY.bossRarity : ECONOMY.normalRarity) : (boss ? threat.bossRarity : threat.rarity)), random);
      if (boss && i === 0 && (ctx.rarelessRounds || 0) >= ECONOMY.pityRounds && rarity === 'fine') rarity = 'rare';
      const slot = weighted(SLOTS.map((slot) => [slot, SLOT_BIASES[monsterType]?.[slot] || 1]), random);
      // I1 authored no T4 head/hands/feet. Retain slot odds, falling back to existing T3 gear.
      const slotTier = tier === 4 && !['weapon', 'body'].includes(slot) ? 3 : tier;
      let pool = Object.entries(ITEMS).filter(([, item]) => item.slot === slot && item.rarity === rarity
        && item.huntTier === slotTier && !item.craftOnly && !item.dropOnly);
      if (monsterType === 'spirit' && slot === 'weapon') pool = pool.filter(([, item]) => item.family === 'focus');
      const [id] = pool[Math.floor(random() * pool.length)];
      const rollSeed = (seed ^ Math.imul(i + 1, 0x7f4a7c15)) >>> 0;
      loot.items.push(instance(`drop:${seed >>> 0}:rolled:${i}:${id}`, id, rollSeed));
    }
  }
  const stoneChance = boss ? 1 : elite ? ECONOMY.eliteStoneChance : ECONOMY.stoneChance;
  if (random() < Math.min(1, stoneChance * threat.drop + materialBonus / 100)) {
    const count = boss ? 1 + (random() < ECONOMY.bossExtraChance ? 1 : 0) : 1;
    // A drop event is either a pile of plain stones (5 = one scroll) or a single greater stone.
    const [min, max] = ENCHANT.stoneCount[boss ? 'boss' : elite ? 'elite' : 'normal'];
    for (let i = 0; i < count; i++) {
      const stone = weighted([[STONE, ECONOMY.stoneWeights[Math.min(tier, 3)][0]], [GREATER_STONE, ECONOMY.stoneWeights[Math.min(tier, 3)][1]]], random);
      const amount = stone === STONE ? min + Math.floor(random() * (max - min + 1)) : 1;
      loot.stacks[stone] = (loot.stacks[stone] || 0) + amount;
    }
  }
  // Blessed scrolls use their own stream so earlier gear/stone/gold rolls keep their seeds.
  const blessedRandom = rng(seed ^ 0x5b1e55ed);
  if (blessedRandom() < ENCHANT.blessedChance[boss ? 'boss' : elite ? 'elite' : 'normal'] * threat.drop) {
    const id = blessedRandom() < 0.5 ? 'scroll_blessed_weapon' : 'scroll_blessed_armor';
    loot.stacks[id] = (loot.stacks[id] || 0) + 1;
  }
  // Guardian-only rewards use an isolated stream: adding them cannot shift old loot rolls.
  const exclusiveRandom = rng(seed ^ 0x741d4a91);
  for (const entry of NEW_MONSTER_DROPS[monsterType]?.items || []) {
    if (entry.exclusive && exclusiveRandom() < Math.min(1, entry.chance * threat.drop * (1 + Math.max(0, ctx.dropLuck || 0)))) {
      loot.items.push(instance(`drop:${seed >>> 0}:${entry.id}`, entry.id, seed));
    }
  }
  // Seeded stochastic rounding retains small bonuses without fractional save currency.
  const stage = BALANCE.stages[ctx.stageId];
  const curve = stage ? BALANCE.rewardCurve ** ((stage.rewardRank ?? Number(ctx.stageId.slice(1))) - 1) : 1;
  const scaled = loot.gold * (boss ? 1 : BALANCE.normalGold) * curve * threat.gold;
  // Dedicated stream: material/gear bonus branches must not alter baseline gold rounding.
  const goldRandom = rng(seed ^ 0x43e7a129);
  const baseGold = Math.floor(scaled) + (goldRandom() < scaled % 1 ? 1 : 0);
  const gold = baseGold * (1 + Math.max(0, ctx.goldBonus || 0) * capScale / 100);
  loot.gold = Math.floor(gold) + (goldRandom() < gold % 1 ? 1 : 0);
  return loot;
}
