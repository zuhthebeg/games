import {isBossType} from '../content/boss-tuning.js';
import { eff, effectiveStats, setBonuses } from './stats.js';
import { SLOTS, LEGACY_SLOTS, MATERIAL_STACK, SALVAGE, ECONOMY, ENCHANT, STONE, BLESSED_STONE, CURSED_STONE, rng, weighted, SLOT_BIASES, RECIPES, enhanceMultiplier } from './economy.js';
import { rollAffixes, affixTotals } from './affixes.js';
export { rollAffixes, DEFERRED_AFFIXES } from './affixes.js';
import { BALANCE, threatMultipliers } from '../content/balance.js';
import { MONSTER_VARIANTS } from '../content/monsters.js';
import { NEW_MONSTER_DROPS } from '../content/loot.js';
import { knightEquipmentAllowed, KNIGHT_ARMOR_LEVELS } from './knight-equipment.js';
import { lineageAllowsWeapon } from '../content/player-lineages.js';

const weapon = (name, family, rarity, power, weight, form) => ({
  name, kind: 'weapon', slot: 'weapon', handedness:1, huntTier: 1, material: family === 'blade' ? 'metal' : 'wood', family, rarity, power, weight, form,
  ...(family === 'focus' ? { innateStats: { int: 6, wis: 6 } } : {}),
  requiredLevel: { common: 1, fine: 2, rare: 4 }[rarity],
});
// AC = old armor HP × 2/3: keeps effective HP within ~10% of the old HP model across hunting tiers.
const toAc = (hp) => Math.round(hp * 2 / 3);
const armor = (name, rarity, hp, weight, material = 'leather') => ({
  name, kind: 'body', slot: 'body', huntTier: 1, material, armorClass: weight <= 4 ? 'light' : weight <= 8 ? 'medium' : 'heavy', rarity, ac: toAc(hp), weight,
  requiredLevel: rarity === 'common' ? 1 : 2,
});

export const ITEMS = {
  round_shield: { name: '원형 방패', kind: 'offhand', slot: 'offhand', form: 'shield', material: 'metal', rarity: 'common', huntTier: 1, ac: 0, weight: 4, requiredLevel: 1 },
  buckler: { name:'버클러',kind:'offhand',slot:'offhand',form:'shield',material:'metal',rarity:'common',huntTier:1,ac:0,weight:2,requiredLevel:1,shieldType:'buckler' },
  kite_shield: { name:'카이트 실드',kind:'offhand',slot:'offhand',form:'shield',material:'metal',rarity:'fine',huntTier:2,ac:2,weight:5,requiredLevel:5,shieldType:'kite_shield' },
  tower_shield: { name:'타워 실드',kind:'offhand',slot:'offhand',form:'shield',material:'metal',rarity:'fine',huntTier:3,ac:5,weight:10,requiredLevel:10,shieldType:'tower_shield' },
  bone_shield: { name:'해골 뼈방패',kind:'offhand',slot:'offhand',form:'shield',material:'bone',rarity:'fine',huntTier:3,ac:3,weight:5,requiredLevel:10,shieldType:'bone_shield' },
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
  silver_ingot: { name: '은 주괴', kind: 'material', weight: 0.3, sell: 6, description: 'T2 이상 구조물 몬스터(고링·룬 수호자·가고일·태엽 기계)에게서 획득 · 은 무기 제작 재료' },
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
// One runtime multiplier, never double the authored tier power.
ITEMS.warden_blade.handedness=2;
ITEMS.warden_maul.handedness=2;
for(const [id,base,name] of [
  ['rune_greatsword','rune_blade','룬철 양손검'],
  ['revenant_greatsword','revenant_blade','망자의 양손검'],
  ['rune_warhammer','rune_maul','룬철 양손망치'],
  ['ossuary_warhammer','ossuary_maul','납골당 양손망치'],
]) ITEMS[id]={...ITEMS[base],name,handedness:2,craftOnly:false};
export const permitsShield = def => (def?.family === 'blade' || def?.family === 'focus' && def.form === 'wand') && def.handedness !== 2;
// Authored focus affinities propagate through the existing rarity-variant generator.
for (const [id, affinity] of Object.entries({ember_wand:'fire', soulfire_wand:'fire', seal_staff:'frost', altar_staff:'holy', gravekeeper_staff:'holy'})) ITEMS[id].affinity = affinity;
// Craft-only silver counterparts inherit exactly the authored T4 weapon stats.
for (const [id, base, name] of [
  ['silver_blade', 'revenant_blade', '은 장검'], ['silver_maul', 'ossuary_maul', '은 철퇴'],
  ['silver_bow', 'bone_bow', '은촉 장궁'], ['silver_wand', 'soulfire_wand', '은장 완드'],
  ['silver_staff', 'gravekeeper_staff', '은장 지팡이'],
]) {
  ITEMS[id] = { ...ITEMS[base], name, craftOnly: true, silverWeapon: true };
  // Bone bow has hide rather than rune as its secondary ingredient.
  const secondary = RECIPES[base].rune_shard ? 'rune_shard' : 'hide';
  RECIPES[id] = { ...RECIPES[base], [secondary]: RECIPES[base][secondary] - 6, silver_ingot: 6 };
}
const TIER_LEVEL = { 2: 5, 3: 10, 4: 15 };
const ARMOR_NAMES = {
  head: { light: '가죽 두건', medium: '철 투구', heavy: '강철 대투구' },
  hands: { light: '천 장갑', medium: '가죽 장갑', heavy: '강철 건틀릿' },
  feet: { light: '천 신발', medium: '가죽 장화', heavy: '강철 군화' },
};
// Tables are base stats; instances vary only through affixes, never hidden stat rolls.
for (const [slot, hp, weight] of [['head', 4, 2], ['hands', 3, 1.5], ['feet', 3, 1.5]]) {
  for (const [armorClass, scale] of [['light', 1], ['medium', 1.5], ['heavy', 2]]) {
    for (const [rarity, tier] of [['common', 1], ['fine', 1], ['fine', 2], ['fine', 3]]) {
      const id = `${slot}_${armorClass}_${rarity}_t${tier}`;
      ITEMS[id] = { name: `${['', '', '단련된 ', '정예 '][tier]}${ARMOR_NAMES[slot][armorClass]}`,
        kind: slot, slot, material: slot === 'head' || armorClass === 'heavy' ? 'metal' : 'leather', armorClass, rarity, huntTier: tier,
        ac: toAc(Math.round(hp * scale * tier * ECONOMY.rarityPower[rarity])),
        weight: weight * scale, requiredLevel: TIER_LEVEL[tier] ?? (rarity === 'common' ? 1 : 2) };
    }
  }
}
// Craft-only five-part set. No shield or rarity variants: every part is a deliberate investment.
ITEMS.undead_bone = { name: '언데드의 뼈', kind: 'material', material: 'bone', weight: 0.2, sell: 2 };
for (const [slot, base, bones, gold] of [
  ['weapon', 'rune_blade', 24, 180], ['head', 'head_light_fine_t2', 12, 90],
  ['body', 'woven_armor', 20, 150], ['hands', 'hands_light_fine_t2', 10, 75], ['feet', 'feet_light_fine_t2', 10, 75],
]) {
  const id = `bone_set_${slot}`;
  ITEMS[id] = { ...ITEMS[base], name: `뼈 ${ {weapon:'검',head:'투구',body:'갑옷',hands:'장갑',feet:'장화'}[slot] }`,
    material: 'bone', ...(slot === 'weapon' ? { weight: 8 } : {}), boneSet: true, craftOnly: true };
  RECIPES[id] = { undead_bone: bones, gold };
}
// Attainable three-slot boar set; warden uses its existing weapon/body pair.
for (const [slot,base,bones,gold] of [['head','head_medium_fine_t1',6,50],['feet','feet_medium_fine_t1',8,60]]) {
  const id = `boar_${slot === 'head' ? 'cap' : 'boots'}`;
  ITEMS[id] = {...ITEMS[base],name:slot === 'head' ? '멧돼지 가죽 모자' : '멧돼지 가죽 장화',material:'leather',craftOnly:true};
  RECIPES[id] = {hide:bones,fang:2,gold};
}
for (const [id,def] of Object.entries(ITEMS)) {
  const setId=def.boneSet ? 'bone' : ['boar_hide_armor','boar_cap','boar_boots'].includes(id) ? 'boar'
    : ['warden_blade','warden_maul','warden_plate'].includes(id) ? 'warden'
    : ['hunter_bow','leather_vest'].includes(id) ? 'hunter'
    : ['ossuary_maul','ossuary_plate'].includes(id) ? 'ossuary'
    : ['soulfire_wand','gravekeeper_staff','shroud_robe'].includes(id) ? 'soulfire'
    : ['dragonfang_blade','dragon_scale_armor'].includes(id) ? 'dragon' : null;
  if(setId)Object.assign(def,{setId,setName:{bone:'뼈',boar:'멧돼지',warden:'파수꾼',hunter:'사냥꾼',ossuary:'납골당',soulfire:'넋불',dragon:'수호룡'}[setId]});
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
      ...(base.power !== undefined ? { power: base.power * ratio } : { ac: base.kind === 'offhand' ? Math.round((base.ac || 0) * ratio) : base.ac ? Math.round(base.ac * ratio) : toAc(ECONOMY.starterBodyHp[rarity]) }),
      requiredLevel: TIER_LEVEL[base.huntTier] ?? { common: 1, fine: 2, rare: 4, epic: 6 }[rarity] };
  }
}
// Cover the whole T2+ catalogue, including generated rarity variants, without
// making guardian dropOnly trophies craftable. Authored recipes remain untouched.
for (const [id, def] of Object.entries(ITEMS)) {
  if (!def.slot || def.huntTier < 2 || def.dropOnly || RECIPES[id]) continue;
  if (id !== def.baseId) continue;
  const primary = MATERIAL_STACK[def.material], tier = def.huntTier;
  const slotScale = ECONOMY.slotPrice[def.slot] / ECONOMY.slotPrice.weapon;
  const budget = tier === 2 ? { main: 16, rune: 4, frost: 2, gold: 140 } : { main: 24, rune: 8, frost: 4, gold: 240 };
  RECIPES[id] = { [primary]: Math.max(1, Math.ceil(budget.main * slotScale)), gold: Math.ceil(budget.gold * slotScale) };
  // Never overwrite a rune-primary ingredient with a smaller secondary requirement.
  if (primary !== 'rune_shard') RECIPES[id].rune_shard = Math.ceil(budget.rune * slotScale);
  RECIPES[id].frost_shard = Math.ceil(budget.frost * slotScale);
}
for (const [id, def] of Object.entries(ITEMS)) {
  if (!def.slot || def.huntTier < 2 && def.baseId !== 'buckler' || def.dropOnly || RECIPES[id]) continue;
  const base = ITEMS[def.baseId], recipe = RECIPES[def.baseId];
  const materialScale = ECONOMY.rarityPower[def.rarity] / ECONOMY.rarityPower[base.rarity];
  const goldScale = ECONOMY.rarityPrice[def.rarity] / ECONOMY.rarityPrice[base.rarity];
  RECIPES[id] = Object.fromEntries(Object.entries(recipe).map(([key, count]) =>
    [key, Math.max(1, Math.ceil(count * (key === 'gold' ? goldScale : materialScale)))]));
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
export const meetsRequirement = (save, def) => lineageAllowsWeapon(save, def) && knightEquipmentAllowed(save, def)
  && (save.stats?.str ?? BALANCE.stats.base) >= (def?.requiredStr || 0);
export const requirementLabel = (def) => def?.requiredStr ? `힘 ${def.requiredStr}` : '';
// One ungraded stone. enhance_stone_2 is legacy only (old receipts);
// SaveStore.load converts held mid stones into plain stones.
ITEMS.enhance_stone_1 = { name: '강화석', kind: 'material', weight: 0.1, sell: 2 };
ITEMS.enhance_stone_2 = { name: '중급 강화석', kind: 'material', weight: 0.1, sell: 2, legacy: true };
// Deprecated: no drops or refunds. Save loading removes retired entries without compensation.
// Definition retained only for historical save/receipt validation.
ITEMS.enhance_stone_3 = { name: '상급 강화석', kind: 'material', weight: 0.1, sell: 25 };
ITEMS[BLESSED_STONE] = { name: '축복받은 강화석', kind: 'material', weight: 0, sell: 30, blessed: true };
ITEMS[CURSED_STONE] = { name: '저주받은 강화석', kind: 'material', weight: 0, sell: 30, cursed: true };
export const instance = (uid, id, seed = 0, affixes = rollAffixes(ITEMS[id].rarity, ITEMS[id].huntTier, seed)) =>
  ({ uid, id, enhance: 0, affixes, rolledAt: seed >>> 0 });

export const START_WEAPONS = { blade: 'training_sword', bow: 'short_bow', focus: 'apprentice_wand' };
export const CONSUMABLES = ['potion', 'mana_potion', 'return_scroll'];
export { RECIPES, enhanceMultiplier } from './economy.js';
// Lineage-style: every armor enchant level is +1 AC on that piece.
export const armorAc = (item) => item && ITEMS[item.id]?.power === undefined ? (ITEMS[item.id]?.ac || 0) + (ITEMS[item.id]?.kind === 'offhand' ? 0 : item.enhance || 0) : 0;
// Strength requirements remain tied to the definition’s original weight.
export const effectiveWeight = (item) => (ITEMS[item?.id]?.weight || 0) * (1 - 0.03 * (item?.enhance || 0));
export const cloneSave = (save) => structuredClone(save);
export const equippedItem = (save, slot) => save.items.find((item) => item.uid === save.equipped[slot]);

export function capacity(save) {
  return 100 + BALANCE.stats.capacity * eff(effectiveStats(save).str) + affixTotals(SLOTS.map((slot) => equippedItem(save, slot))).capacity_flat + (setBonuses(save).capacity || 0);
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
  if (!lineageAllowsWeapon(save, definition)) throw new Error('이 계보는 해당 무기를 장착할 수 없습니다.');
  if (!knightEquipmentAllowed(save, definition)) throw new Error(`해골 방어구는 Lv.${KNIGHT_ARMOR_LEVELS[definition.kind]}부터 장착할 수 있습니다.`);
  if (!meetsRequirement(save, definition)) throw new Error(`힘 ${definition.requiredStr} 이상이어야 장착할 수 있습니다.`);
  const next = cloneSave(save);
  if (definition.kind === 'offhand' && !permitsShield(ITEMS[equippedItem(save, 'weapon')?.id])) throw new Error('방패는 한손 검·한손 둔기·한손 완드와 함께 장착합니다.');
  next.equipped[definition.kind] = uid;
  if (definition.kind === 'weapon' && !permitsShield(definition) && next.equipped.offhand) next.equipped.offhand = null;
  if (carriedWeight(next) > capacity(next) * 1.2) throw new Error('장착 후 무게가 120%를 넘습니다.');
  // Candidate only: normal HubUI.commit persists final equipment + permanent state in one write.
  if (next.lineage === 'skeleton_knight' && next.level === 30 && LEGACY_SLOTS.every(slot => {
    const worn = equippedItem(next, slot);
    return worn && ITEMS[worn.id]?.kind === slot;
  })) next.permanentDeathKnight = true;
  return next;
}

export const dismantleMaterial = (item) => MATERIAL_STACK[ITEMS[item.id].material];

// Craft UID records the recipe actually paid, even when LUK upgrades the output rarity.
export function craftRecipeId(item) {
  const paid=item.uid?.split(':')[1];
  return RECIPES[paid] && ITEMS[paid]?.baseId === ITEMS[item.id]?.baseId ? paid : null;
}
export function dismantleRefund(item) {
  // Craft provenance stays in the UID; affixes never increase salvage.
  if (item.uid.startsWith('craft:')) return Math.floor(RECIPES[craftRecipeId(item) || item.id][dismantleMaterial(item)] * ECONOMY.craftRefundFraction);
  return SALVAGE[ITEMS[item.id].rarity];
}

// Enhanced gear also returns stones; primary material stays tied to rarity/provenance above.
export const dismantleStones = (item) => ({
  [STONE]: (ENCHANT.dismantleStones[item.enhance] || 0),
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

const CRAFT_GRADES = ['common','fine','rare','epic'];
const CRAFT_VARIANTS = new Map(Object.entries(ITEMS).filter(([,d])=>d.slot).map(([id,d])=>[`${d.baseId}:${d.rarity}`,id]));
// Catalogue keeps legacy rarity IDs/costs for old crafted provenance and direct callers.
// The smith offers only each authored base recipe, at its original material/gold budget.
export const craftingRecipes = () => Object.entries(RECIPES).filter(([id]) => !ITEMS[id]?.slot || ITEMS[id].baseId === id);
export function craftPreview(id) {
  if (!RECIPES[id] || !ITEMS[id]?.slot) return null;
  return { uid: `recipe:${ITEMS[id].baseId}`, id: CRAFT_VARIANTS.get(`${ITEMS[id].baseId}:fine`), enhance: 0, affixes: [], rolledAt: 0 };
}
export function craftOdds(save, id) {
  if (!RECIPES[id]) throw new Error('없는 제작법입니다.');
  const def=ITEMS[id];
  if (!def.slot) return [{id,rarity:def.rarity,chance:1}];
  const floor=craftPreview(id).id,rank=1,luck=Math.max(0,Math.min(1,(effectiveStats(save).luk-10)/90));
  const upgrades=[.1+.15*luck,.01+.04*luck,.001+.009*luck],odds=new Map([[floor,1-upgrades.reduce((a,b)=>a+b,0)]]);
  for(let step=1;step<=3;step++) {
    const rarity=CRAFT_GRADES[Math.min(3,rank+step)];
    const output=CRAFT_VARIANTS.get(`${def.baseId}:${rarity}`)||id;
    odds.set(output,(odds.get(output)||0)+upgrades[step-1]);
  }
  return [...odds].map(([id,chance])=>({id,rarity:ITEMS[id].rarity,chance}));
}
export function craft(save, id) {
  if(save.craftCount !== undefined && (!Number.isSafeInteger(save.craftCount) || save.craftCount < 0))throw new Error('제작 순번을 확인하세요.');
  const odds=craftOdds(save,id),count=(save.craftCount||0)+1;
  if(!Number.isSafeInteger(count)||count>0xffffffff)throw new Error('제작 순번을 확인하세요.');
  const next = spend(save, RECIPES[id]);
  let hash=0x811c9dc5;for(const c of id)hash=Math.imul(hash^c.charCodeAt(0),0x01000193);
  const seed=(save.createdAt^hash^Math.imul(count,0x9e3779b9))>>>0;
  const output=weighted(odds.map(o=>[o.id,o.chance]),rng(seed));
  next.items.push(instance(uniqueUid(save, `craft:${id}:${count}`), output, seed));
  next.craftCount=count;
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
    if (random() < Math.min(1, chance * gearMultiplier * ECONOMY.gearRarityMultiplier[ITEMS[id].rarity])) loot.items.push(instance(`drop:${seed >>> 0}:${id}`, id, seed));
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

// Craft-first gear rolls; gold, consumable and stone draws retain their pre-B streams.
export function rollDrops(monsterType, seed, ctx = {}) {
  const bonusSum = Math.max(0, (ctx.goldBonus || 0) + (ctx.materialBonus || 0));
  const capScale = bonusSum > ECONOMY.dropBonusCap ? ECONOMY.dropBonusCap / bonusSum : 1;
  const materialBonus = Math.max(0, ctx.materialBonus || 0) * capScale;
  const threat = threatMultipliers(ctx.threat ?? 1);
  const tier = Math.max(1, Math.min(4, ctx.huntTier ?? (NEW_MONSTER_DROPS[monsterType] ? 2 : 1)));
  const boss = isBossType(monsterType) || ctx.boss === true;
  const elite = ctx.elite ?? false;
  const rank = boss ? 'boss' : elite ? 'elite' : 'normal';
  const tierMultiplier = ECONOMY.gearTierMultiplier[tier];
  const gearMultiplier = threat.drop * (boss ? 0.5 : elite ? 0.16 / 0.35 : 0.4) * tierMultiplier;
  const loot = legacyDrops(monsterType, seed, materialBonus, gearMultiplier);
  if (monsterType === 'scarecrow') return loot;
  const random = rng(seed ^ 0xa521d937);
  const chance = boss ? 1 : elite ? ECONOMY.eliteGearChance : ECONOMY.gearChance;
  // LUK raises the gear drop chance (cocy 10-12); same single draw, so seeds stay aligned.
  if (random() < Math.min(1, chance * (boss ? 1 : tierMultiplier) * threat.drop * (1 + Math.max(0, ctx.dropLuck || 0)))) {
    const count = boss ? 1 + (random() < ECONOMY.bossExtraChance ? 1 : 0) : 1;
    for (let i = 0; i < count; i++) {
      const rarityPool = (ctx.threat ?? 1) === 1 ? (boss ? ECONOMY.bossRarity : ECONOMY.normalRarity) : (boss ? threat.bossRarity : threat.rarity);
      let rarity = weighted(Object.entries(rarityPool).filter(([key]) => !boss || ['rare','epic'].includes(key)).map(([key, weight]) => [key, weight * ECONOMY.gearRarityMultiplier[key]]), random);
      if (boss && i === 0 && (ctx.rarelessRounds || 0) >= ECONOMY.pityRounds && rarity === 'fine') rarity = 'rare';
      const slot = weighted(SLOTS.map((slot) => [slot, SLOT_BIASES[monsterType]?.[slot] || 1]), random);
      // I1 authored no T4 head/hands/feet. Retain slot odds, falling back to existing T3 gear.
      const slotTier = tier === 4 && !['weapon', 'body'].includes(slot) ? 3 : tier;
      let pool = Object.entries(ITEMS).filter(([, item]) => item.slot === slot && item.rarity === rarity
        && item.huntTier === slotTier && !item.craftOnly && !item.dropOnly);
      if (monsterType === 'spirit' && slot === 'weapon') pool = pool.filter(([, item]) => item.family === 'focus');
      // Sparse authored tiers can lack a slot/grade. Boss floor never falls to fine.
      if (!pool.length && boss) pool = Object.entries(ITEMS).filter(([,item]) => item.slot && ['rare','epic'].includes(item.rarity) && !item.craftOnly && !item.dropOnly);
      if (!pool.length) continue;
      const [id] = pool[Math.floor(random() * pool.length)];
      const rollSeed = (seed ^ Math.imul(i + 1, 0x7f4a7c15)) >>> 0;
      loot.items.push(instance(`drop:${seed >>> 0}:rolled:${i}:${id}`, id, rollSeed));
    }
  }
  // Previously gear and ordinary stones shared one stream. Replay only its draw count
  // using the OLD gates, so lower gear odds/rarity never reroll a stone or its amount.
  const stoneRandom = rng(seed ^ 0xa521d937);
  if (stoneRandom() < Math.min(1, (boss ? 1 : elite ? 0.35 : 0.1) * threat.drop * (1 + Math.max(0, ctx.dropLuck || 0)))) {
    const oldCount = boss ? 1 + (stoneRandom() < 0.5 ? 1 : 0) : 1;
    for (let i = 0; i < oldCount * 3; i++) stoneRandom();
  }
  const stoneChance = boss ? 1 : elite ? ECONOMY.eliteStoneChance : ECONOMY.stoneChance;
  if (stoneRandom() < Math.min(1, stoneChance * threat.drop + materialBonus / 100)) {
    const count = boss ? 1 + (stoneRandom() < ECONOMY.stoneExtraChance ? 1 : 0) : 1;
    // Retired greater outcomes award nothing; plain pile chances/counts and RNG draws stay unchanged.
    const [min, max] = ENCHANT.stoneCount[boss ? 'boss' : elite ? 'elite' : 'normal'];
    for (let i = 0; i < count; i++) {
      const event = weighted([[STONE, ECONOMY.stoneWeights[Math.min(tier, 3)][0]], [null, ECONOMY.stoneWeights[Math.min(tier, 3)][1]]], stoneRandom);
      if (event !== STONE) continue;
      const amount = min + Math.floor(stoneRandom() * (max - min + 1));
      loot.stacks[STONE] = (loot.stacks[STONE] || 0) + amount;
    }
  }
  // Special stones have independent streams so legacy gear/stone/gold rolls stay unchanged.
  const blessedRandom = rng(seed ^ 0x5b1e55ed);
  if (blessedRandom() < ENCHANT.blessedChance[rank] * threat.drop) {
    loot.stacks[BLESSED_STONE] = (loot.stacks[BLESSED_STONE] || 0) + 1;
  }
  const cursedRandom = rng(seed ^ 0xc075ed01);
  const cursedArea = /^S2[1-7]$/.test(ctx.stageId || '');
  if ((MONSTER_VARIANTS[monsterType]?.lifeState === 'undead' || cursedArea)
    && cursedRandom() < ENCHANT.cursedChance[rank] * threat.drop) {
    loot.stacks[CURSED_STONE] = (loot.stacks[CURSED_STONE] || 0) + 1;
  }
  // Guardian-only rewards use an isolated stream: adding them cannot shift old loot rolls.
  const exclusiveRandom = rng(seed ^ 0x741d4a91);
  for (const entry of NEW_MONSTER_DROPS[monsterType]?.items || []) {
    if (entry.exclusive && exclusiveRandom() < Math.min(1, entry.chance * gearMultiplier * ECONOMY.gearRarityMultiplier[ITEMS[entry.id].rarity] * (1 + Math.max(0, ctx.dropLuck || 0)))) {
      loot.items.push(instance(`drop:${seed >>> 0}:${entry.id}`, entry.id, seed));
    }
  }
  // Legacy and exclusive side rolls obey the same floor without advancing a stream.
  if (boss) loot.items = loot.items.map(item => {
    if (['rare','epic'].includes(ITEMS[item.id].rarity)) return item;
    const def = ITEMS[item.id], base = def.baseId || item.id, id = `${base}_rare`;
    return ITEMS[id] ? instance(item.uid, id, item.rolledAt) : item;
  });
  // Monsters were using gear lost by earlier adventurers. One independent roll per
  // instance (not the loot-order index), shared by ordinary, legacy and exclusive gear.
  for (const item of loot.items) item.enhance = Number(weighted(
    ECONOMY.dropEnhanceWeights[rank].map((weight, level) => [level, weight]), rng(item.rolledAt ^ 0xd09e6a31)));
  // Stochastic 1.5x quantities preserve each old material/consumable gate and RNG order.
  const materialRandom = rng(seed ^ 0xba51c150);
  for (const id of ['scrap', 'hide', 'wood', 'web', 'fang']) {
    const scaled = (loot.stacks[id] || 0) * 1.5;
    if (scaled) loot.stacks[id] = Math.floor(scaled) + (materialRandom() < scaled % 1 ? 1 : 0);
  }
  // Retire guaranteed legacy rune/frost piles in favor of the rare T2+ material pool.
  // Still consumed the old table draws above; dragon_scale remains exactly unchanged.
  delete loot.stacks.rune_shard;
  delete loot.stacks.frost_shard;
  const premiumRandom = rng(seed ^ 0x9e771a15);
  if (tier >= 2) for (const id of ['rune_shard', 'frost_shard']) {
    if (boss) loot.stacks[id] = 1 + Math.floor(premiumRandom() * 2);
    else if (premiumRandom() < (elite ? 0.08 : 0.01) * threat.drop) loot.stacks[id] = 1;
  }
  // Independent stream: ordinary loot remains unchanged.
  if (MONSTER_VARIANTS[monsterType]?.lifeState === 'undead') {
    const boneRandom = rng(seed ^ 0xb0ae2026);
    if (boss) loot.stacks.undead_bone = 2 + Math.floor(boneRandom() * 2);
    else if (boneRandom() < (elite ? 0.6 : 0.25)) loot.stacks.undead_bone = 1;
  }
  // Silver is a construct-only T2+ reward; this stream never advances any old roll.
  const silverRandom = rng(seed ^ 0x5117e201);
  if (tier >= 2 && MONSTER_VARIANTS[monsterType]?.lifeState === 'construct') {
    const silverBoss = boss || MONSTER_VARIANTS[monsterType].speciesTags.includes('boss');
    if (silverBoss) loot.stacks.silver_ingot = 1 + Math.floor(silverRandom() * 2);
    else if (silverRandom() < (elite ? 0.12 : 0.03) * threat.drop) loot.stacks.silver_ingot = 1;
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
