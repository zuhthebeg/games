import { ITEMS } from '../meta/items.js';
import { itemIcon } from './icons.js';

// Presentation only: a committed result is the sole input; no save/world reference.
export function enchantPresentation(result, reduced = false) {
  const crack = Number.isInteger(result.count);
  const destroyed = result.outcome === 'destroyed';
  return {
    kind: crack ? 'crack' : destroyed ? 'destroyed' : 'success',
    chargeMs: reduced ? 80 : crack ? 500 : result.risky ? 1200 : 120,
    holdMs: reduced ? 700 : crack ? 600 : result.risky ? 1100 : 220,
    title: crack ? `주문서 ${result.count}장` : destroyed ? '장비가 산산조각 났다' : `+${result.to}${result.risky ? ' 성공' : ''}`,
    detail: crack ? ITEMS[result.id].name : destroyed ? `남은 강화석 ${result.refund?.enhance_stone_1 || 0}개` : ITEMS[result.id].name,
    sound: destroyed ? 'kill' : 'level-up',
  };
}

export function playEnchantFx(root, result, scrollId) {
  const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;
  const view = enchantPresentation(result, reduced);
  const origin = document.activeElement;
  const dialog = document.createElement('dialog');
  dialog.className = `enchant-fx ${view.kind} ${result.risky ? 'risky' : ''} ${reduced ? 'reduced' : ''}`;
  dialog.dataset.enchantFx = view.kind;
  dialog.dataset.phase = 'charge';
  dialog.setAttribute('aria-label', '강화 결과');
  dialog.style.setProperty('--charge', `${view.chargeMs}ms`);
  const scroll = scrollId || result.id;
  dialog.innerHTML = `<button type="button" class="enchant-stage" aria-label="연출 건너뛰기">`
    + `<span class="enchant-scroll" aria-hidden="true">${itemIcon(scroll, ITEMS[scroll])}</span>`
    + `<span class="enchant-gear" aria-hidden="true">${itemIcon(result.id, ITEMS[result.id])}</span>`
    + `<span class="enchant-burst" aria-hidden="true"></span>`
    + `<span class="enchant-shards" aria-hidden="true">${Array.from({length: 12}, (_, i) => `<i style="--angle:${i * 30}deg;--distance:${55 + i % 3 * 18}px"></i>`).join('')}</span>`
    + `<strong class="enchant-result" role="status" aria-live="off"></strong>`
    + `<span class="enchant-detail"></span><small class="enchant-skip">탭 또는 Esc · 건너뛰기</small></button>`;
  root.append(dialog);
  dialog.showModal();
  const button = dialog.querySelector('button');
  button.focus({preventScroll: true});
  const title = dialog.querySelector('.enchant-result');
  const detail = dialog.querySelector('.enchant-detail');
  let timer, frame, finished = false, revealed = false;
  function close() {
    if (finished) return;
    finished = true;
    clearTimeout(timer); cancelAnimationFrame(frame);
    dialog.close(); dialog.remove();
    if (origin?.isConnected) origin.focus({preventScroll: true});
  }
  function reveal() {
    if (finished || revealed) return;
    revealed = true;
    clearTimeout(timer); cancelAnimationFrame(frame);
    dialog.dataset.phase = 'result';
    title.setAttribute('aria-live', 'polite');
    title.textContent = view.title; detail.textContent = view.detail;
    button.setAttribute('aria-label', '강화 결과 닫기');
    dialog.querySelector('.enchant-skip').textContent = '탭 또는 Esc · 닫기';
    document.dispatchEvent(new CustomEvent('arpg:presentation-sound', {detail: view.sound}));
    timer = setTimeout(close, view.holdMs);
  }
  function skip() { if (revealed) close(); else reveal(); }
  dialog.addEventListener('click', skip);
  dialog.addEventListener('cancel', event => {event.preventDefault(); skip();});
  if (view.kind === 'crack' && !reduced) {
    const start = performance.now();
    const count = () => {
      const text = `주문서 ${Math.min(result.count, Math.floor((performance.now() - start) / view.chargeMs * result.count))}장`;
      if (title.textContent !== text) title.textContent = text;
      if (!revealed && !finished) frame = requestAnimationFrame(count);
    };
    frame = requestAnimationFrame(count);
  }
  timer = setTimeout(reveal, view.chargeMs);
  return { get active() { return !finished; }, close };
}
