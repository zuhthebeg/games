import { ITEMS, instance, cloneSave, uniqueUid } from './items.js';
import { ECONOMY, rng } from './economy.js';
import { affixRange } from './affixes.js';

export function gearPrice(item) {
  const base = ITEMS[item.id];
  const value = (item.affixes || []).reduce((sum, { k, v }) => sum + v / affixRange(k, base.huntTier)[1] * ECONOMY.optionPriceFactor, 0);
  return Math.ceil(base.basePrice * ECONOMY.rarityPrice[base.rarity] * (1 + value));
}
export function shopStock(accountSeed, refreshIndex) {
  const seed = (accountSeed ^ Math.imul(refreshIndex + 1, 0x9e3779b9)) >>> 0;
  const random = rng(seed);
  const stock = [];
  for (const kind of ['weapon', 'armor']) {
    const pool = Object.entries(ITEMS).filter(([, item]) =>
      (kind === 'weapon' ? item.slot === 'weapon' : item.slot && item.slot !== 'weapon')
      && ['common', 'fine'].includes(item.rarity));
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
