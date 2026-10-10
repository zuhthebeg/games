import { ITEMS, equippedItem } from '../meta/items.js';
import { compareItems } from '../meta/compare.js';
import { icon, itemIcon } from './icons.js';

export const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
export const amount = value => Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
export const SLOT_NAMES = { weapon:'무기', head:'머리', body:'몸', hands:'손', feet:'발' };
export const GRADES = { common:'일반', fine:'양질', rare:'희귀', epic:'영웅' };
export const itemLabel = item => `${ITEMS[item.id].name} +${item.enhance}`;
export const emblem = item => `<span class="p2-emblem ${ITEMS[item.id].rarity}">${itemIcon(item.id, ITEMS[item.id])}<span class="grade-mark">${GRADES[ITEMS[item.id].rarity]}</span><b class="enhance-badge">+${item.enhance}</b></span>`;
export const comparisonFor = (item, save) => compareItems(equippedItem(save, ITEMS[item.id].slot), item, save);
export function deltaText(line) {
  return line.delta === 0 ? '= 0 유지' : `${line.delta > 0 ? '▲+' : '▼−'}${amount(Math.abs(line.delta))} · ${line.good ? '이득' : '손해'}`;
}
export function linesHtml(comparison) {
  return `<dl class="p2-lines">${comparison.lines.map(line => `<div data-line="${escape(line.key)}" data-from="${line.from}" data-to="${line.to}" data-delta="${line.delta}"><dt>${escape(line.label)}</dt><dd><span>${amount(line.from)} → <b>${amount(line.to)}</b></span><small class="${line.delta === 0 ? '' : line.good ? 'gain' : 'loss'}">${deltaText(line)}</small></dd></div>`).join('')}</dl>`;
}
export function summaryHtml(item, save) {
  const lines = comparisonFor(item, save).lines.filter(line => line.delta !== 0).slice(0, 2);
  return lines.length ? lines.map(line => `${escape(line.label)} ${deltaText(line)}`).join(' · ') : '동일 능력치';
}
export function cardHtml(item, save, { action='open-item', compact=false, extra='', note='', disabled=false } = {}) {
  const def = ITEMS[item.id];
  return `<button type="button" class="p2-card ${compact ? 'compact' : ''}" data-action="${action}" data-uid="${escape(item.uid)}" ${extra} ${disabled ? 'disabled' : ''}>${emblem(item)}<span class="p2-card-copy"><strong>${escape(def.name)}</strong><small>${SLOT_NAMES[def.slot]} · Lv${def.requiredLevel}${note ? ` · ${escape(note)}` : ''}</small>${compact ? '' : `<span class="p2-delta">${summaryHtml(item, save)}</span>`}</span></button>`;
}
// P5 replacement seam: return a portrait descriptor, never mutate save or choose gear visuals elsewhere.
export function getHeroPortrait(save) {
  const family = ITEMS[equippedItem(save, 'weapon')?.id]?.family || 'blade';
  const kit = { blade:'sword', bow:'bow', focus:'focus' }[family];
  return { url:`assets/sprites/hero-${kit}/atlas-0.webp`, frame:'idle_SW_000', x:128, y:256, width:128, height:128, atlasWidth:2048, atlasHeight:2048 };
}
export function portraitHtml(save) {
  const p = getHeroPortrait(save);
  return `<div class="sprite p2-hero" role="img" aria-label="현재 무기 기사" style="background-image:url('${p.url}');background-position:-${p.x}px -${p.y}px;background-size:${p.atlasWidth}px ${p.atlasHeight}px"></div>`;
}
export function socketsHtml(save) {
  return Object.keys(SLOT_NAMES).map(slot => {
    const item = equippedItem(save, slot);
    return `<button type="button" class="p2-socket socket-${slot} ${item ? '' : 'empty'}" data-action="socket" data-slot="${slot}" aria-label="${SLOT_NAMES[slot]} · ${item ? escape(itemLabel(item)) : '비어 있음'}">${item ? emblem(item) : `<span class="p2-emblem">${icon(slot === 'weapon' ? 'weapon' : slot)}</span>`}<span>${SLOT_NAMES[slot]}${item ? '' : ' · 빈 슬롯'}</span></button>`;
  }).join('');
}
