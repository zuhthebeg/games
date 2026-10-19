import {ITEMS} from '../meta/items.js';
import {itemIcon} from './icons.js';
import {escape, itemLabel, GRADES} from './gear-view.js';

// Only the already committed item enters this presentation. No transaction callback.
export function playCraftFx(root, item) {
  const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;
  const origin = document.activeElement;
  const dialog = document.createElement('dialog');
  dialog.className = `p2-sheet craft-fx${reduced ? ' reduced' : ''}`;
  dialog.setAttribute('aria-label', '제작 완료');
  dialog.innerHTML = `<button type="button" class="craft-reveal" aria-label="제작 완료 닫기"><span class="craft-spark" aria-hidden="true">✦</span>${itemIcon(item.id, ITEMS[item.id])}<strong>${escape(itemLabel(item))}</strong><small>${GRADES[ITEMS[item.id].rarity] || ''} · 제작 완료</small></button>`;
  root.append(dialog); dialog.showModal();
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true; clearTimeout(timer); observer.disconnect();
    dialog.close(); dialog.remove();
    if (origin?.isConnected) origin.focus({preventScroll:true});
  };
  const timer = setTimeout(close, reduced ? 850 : 1400);
  const observer = new MutationObserver(() => { if (!dialog.isConnected) close(); });
  observer.observe(root, {childList:true});
  dialog.addEventListener('click', close);
  dialog.addEventListener('cancel', e => {e.preventDefault(); close();});
  document.dispatchEvent(new CustomEvent('arpg:presentation-sound', {detail:'level-up'}));
  return {close, get active() {return !closed;}};
}
