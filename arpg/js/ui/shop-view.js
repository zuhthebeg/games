import { ITEMS, CONSUMABLES, buy, shopPrice, carriedWeight, capacity } from '../meta/items.js';
import { DEFAULT_AUTO_BUY } from '../meta/save.js';
import { amount } from './gear-view.js';

// UI projections only; buy() remains the authority for prices, weight limits and mutations.
export function supplyQuote(save, id, count, countLimit = 99) {
  const unit = shopPrice(save,id), weight = carriedWeight(save), limit = capacity(save);
  const maxCount = Math.max(0, Math.min(countLimit, Math.floor(save.gold / unit),
    Math.floor((limit - weight + 1e-9) / ITEMS[id].weight)));
  const total = unit * count, weightAfter = Math.round((weight + ITEMS[id].weight * count) * 1000) / 1000;
  const reasons = [];
  if (total > save.gold) reasons.push('골드 부족');
  if (weightAfter > limit) reasons.push('무게 초과');
  return { unit, total, remaining:save.gold-total, weightAfter, limit, maxCount, reasons };
}
export function purchaseLedgerHtml(quote) {
  return `<div class="ledger purchase-ledger" aria-live="polite"><div><span>합계 금액</span><strong><span id="shop-total">${quote.total}</span> G</strong></div>
    <div><span>구매 후 남는 골드</span><b id="shop-remaining" class="${quote.remaining < 0 ? 'loss' : ''}">${quote.remaining} G</b></div>
    <div><span>구매 후 가방 무게</span><b id="shop-weight" class="${quote.weightAfter > quote.limit ? 'loss' : ''}">${amount(quote.weightAfter)} / ${amount(quote.limit)} kg</b></div></div>
    <p id="purchase-reason" class="loss"${quote.reasons.length ? '' : ' hidden'}>${quote.reasons.join(' · ')}</p>`;
}

// Fill carried supplies only, in catalog order; the existing quote and buy own all limits/prices.
export function autoBuySupplies(save) {
  let next = save;
  const targets = { ...DEFAULT_AUTO_BUY, ...save.autoBuy };
  const rows = [], reasons = new Set();
  for (const id of CONSUMABLES) {
    const deficit = Math.max(0, targets[id] - (next.stacks[id] || 0));
    if (!deficit) continue;
    const quote = supplyQuote(next, id, deficit, deficit);
    const count = quote.maxCount;
    if (count) next = buy(next, id, count);
    rows.push(`${ITEMS[id].name} ${count}${count < deficit ? `/${deficit}` : ''}`);
    for (const reason of quote.reasons) reasons.add(reason === '무게 초과' ? '무게 부족' : reason);
  }
  const spent = save.gold - next.gold;
  const result = rows.length ? `${rows.join(' · ')} 구매 · ${spent} G` : '구매 0 · 0 G';
  return { save: next, spent, message: `${result}${reasons.size ? ` · ${[...reasons].join(' · ')}` : ''}` };
}
