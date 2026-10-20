import { ITEMS, RECIPES, craftRecipeId, instance, cloneSave, uniqueUid } from './items.js';
import { ECONOMY, rng } from './economy.js';
import { affixRange } from './affixes.js';

export function gearPrice(item) {
  const base = ITEMS[item.id];
  const value = (item.affixes || []).reduce((sum, { k, v }) => sum + v / affixRange(k, base.huntTier)[1] * ECONOMY.optionPriceFactor, 0);
  const price = Math.ceil(base.basePrice * ECONOMY.rarityPrice[base.rarity] * (1 + value));
  const paid = item.uid?.startsWith('craft:') && RECIPES[craftRecipeId(item)]?.gold;
  return paid ? Math.min(price, Math.floor(paid * .9 / ECONOMY.sellFraction)) : price;
}
export function shopStock(accountSeed, refreshIndex) {
  const seed = (accountSeed ^ Math.imul(refreshIndex + 1, 0x9e3779b9)) >>> 0;
  const random = rng(seed);
  const stock = [];
  for (const kind of ['weapon', 'armor']) {
    const pool = Object.entries(ITEMS).filter(([, item]) =>
      (kind === 'weapon' ? item.slot === 'weapon' : item.slot && !['weapon','offhand'].includes(item.slot))
      && ['common', 'fine'].includes(item.rarity) && !item.craftOnly && item.huntTier < 4);
    const count = 3 + (random() < 0.5 ? 1 : 0);
    for (let i = 0; i < count; i++) {
      const [id] = pool.splice(Math.floor(random() * pool.length), 1)[0];
      const item = instance(`stock:${seed}:${kind}:${i}`, id, Math.floor(random() * 4294967296));
      item.affixes = item.affixes.map(({ k, v }) => {
        const [min, max] = affixRange(k, ITEMS[id].huntTier);
        return { k, v: Math.min(v, Math.floor((min + max) / 2)) };
      });
      stock.push({ ...item, price: gearPrice(item) });
    }
  }
  const shield = instance(`stock:${seed}:offhand:0`, 'round_shield');
  stock.push({ ...shield, price: gearPrice(shield) });
  // One rotating affordable offhand offer; legacy round-shield offer/UID is stable.
  const shieldPool=Object.entries(ITEMS).filter(([,d])=>d.shieldType && ['common','fine'].includes(d.rarity));
  const [shieldId]=shieldPool[Math.floor(rng(seed ^ 0x5a1e1d)()*shieldPool.length)];
  const alternative=instance(`stock:${seed}:offhand:1`,shieldId,seed ^ 0x5a1e1d);
  alternative.affixes=alternative.affixes.map(({k,v})=>{const [min,max]=affixRange(k,ITEMS[shieldId].huntTier);return {k,v:Math.min(v,Math.floor((min+max)/2))};});
  stock.push({...alternative,price:gearPrice(alternative)});
  return stock;
}
export function buyGear(save, uid) {
  const item = shopStock(save.createdAt >>> 0, save.shopRefresh).find((item) => item.uid === uid);
  if (!item || save.shopBought.includes(uid)) throw new Error('재고가 없습니다.');
  if (save.gold < item.price) throw new Error('골드가 부족합니다.');
  const next = cloneSave(save);
  next.gold -= item.price;
  next.shopBought.push(uid);
  const { price, ...gear } = item;
  next.items.push({ ...gear, uid: uniqueUid(next, `buy:${uid}`) });
  return next;
}
export function sellItem(save, uid) {
  const item = save.items.find((item) => item.uid === uid);
  if (!item) throw new Error('장비가 없습니다.');
  if (Object.values(save.equipped).includes(uid)) throw new Error('장착한 장비는 판매할 수 없습니다.');
  const next = cloneSave(save);
  next.items = next.items.filter((item) => item.uid !== uid);
  next.gold += Math.floor(gearPrice(item) * ECONOMY.sellFraction);
  return next;
}
export function stackSellPrice(id) {
  const item = Object.hasOwn(ITEMS, id) && ITEMS[id];
  if (!item || !['material', 'consumable'].includes(item.kind)) throw new Error('매입하지 않는 물품입니다.');
  return item.kind === 'material' ? item.sell : Math.floor(item.price * ECONOMY.sellFraction);
}
export function sellStack(save, id, count = 1, source = 'bag') {
  const price = stackSellPrice(id);
  if (!['bag', 'stash'].includes(source) || (source === 'stash' && ITEMS[id].kind !== 'consumable')) {
    throw new Error('판매할 보관 위치를 확인하세요.');
  }
  const stacks = source === 'stash' ? save.stash.stacks : save.stacks;
  if (!Number.isSafeInteger(count) || count < 1 || count > (stacks[id] || 0)) throw new Error('판매 수량이 올바르지 않습니다.');
  const next = cloneSave(save);
  (source === 'stash' ? next.stash.stacks : next.stacks)[id] -= count;
  next.gold += price * count;
  return next;
}
export const refreshPrice = (save) => ECONOMY.refreshGold * 2 ** save.paidRefreshes;
export function refreshShop(save) {
  const cost = refreshPrice(save);
  if (!Number.isSafeInteger(cost) || save.gold < cost) throw new Error('갱신 골드가 부족합니다.');
  const next = cloneSave(save);
  next.gold -= cost;
  next.shopRefresh++;
  next.paidRefreshes++;
  next.shopBought = [];
  return next;
}
