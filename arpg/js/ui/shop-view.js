import { ITEMS, shopPrice, carriedWeight, capacity } from '../meta/items.js';
import { amount } from './gear-view.js';

// UI projections only; buy() remains the authority for prices, caps and mutations.
export function supplyQuote(save, id, count) {
  const unit = shopPrice(save,id), weight = carriedWeight(save), limit = capacity(save);
  const maxCount = Math.max(0, Math.min(99, Math.floor(save.gold / unit),
    Math.floor((limit - weight + 1e-9) / ITEMS[id].weight),
    id === 'return_scroll' ? 2 - (save.stacks[id] || 0) : 99));
  const total = unit * count, weightAfter = weight + ITEMS[id].weight * count;
  const reasons = [];
  if (total > save.gold) reasons.push('골드 부족');
  if (weightAfter > limit) reasons.push('무게 초과 · 창고에 맡겨 주세요');
  if (id === 'return_scroll' && (save.stacks[id] || 0) + count > 2) reasons.push('귀환서는 최대 2장');
  return { unit, total, remaining:save.gold-total, weightAfter, limit, maxCount, reasons };
}
export function purchaseLedgerHtml(quote, { stash = false } = {}) {
  return `<div class="ledger purchase-ledger" aria-live="polite"><div><span>합계 금액</span><strong><span id="shop-total">${quote.total}</span> G</strong></div>
    <div><span>구매 후 남는 골드</span><b id="shop-remaining" class="${quote.remaining < 0 ? 'loss' : ''}">${quote.remaining} G</b></div>
    <div><span>구매 후 가방 무게</span><b id="shop-weight" class="${quote.weightAfter > quote.limit ? 'loss' : ''}">${amount(quote.weightAfter)} / ${amount(quote.limit)} kg</b></div></div>
    ${stash ? '<p class="minor">창고로 보관 · 구매만으로 가방 무게가 늘지 않는다.</p>' : ''}
    <p id="purchase-reason" class="${quote.reasons.length ? 'loss' : 'minor'}">${quote.reasons.join(' · ') || '구매 가능'}</p>`;
}
