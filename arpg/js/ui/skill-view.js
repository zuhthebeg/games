import { ABILITIES } from '../content/combat.js';
import { BOOKS, SKILL_DISPLAY, hasSkill, slotOf, bookRequirement } from '../meta/skills.js';
import { STAT_NAMES } from '../meta/stats.js';
import { escape, amount } from './gear-view.js';

// Register generated local art here only when the file ships; absent entries never request an image.
export const SKILL_ART = {};
export const ACADEMY = {
  blade: { name:'검술관', mark:'lunge', quote:'칼끝보다 먼저, 발걸음을 다스려라.' },
  bow: { name:'궁술관', mark:'volley', quote:'바람을 읽고, 한 발에 뜻을 담아라.' },
  focus: { name:'마법학당', mark:'healing_light', quote:'불꽃과 서리, 생명의 빛도 같은 배움에서 시작하지.' },
};
const SILHOUETTES = {
  lunge:'<path d="m17 43 27-27 5 5-27 27m-8-10 12 12m-12-22 13-7M34 45l15-9"/>',
  whirl:'<path d="M17 24a19 19 0 1 1-2 18m-2-24 4 6 7-3m-2 20 19-20m-22 15 9 9"/>',
  heavy_cleave:'<path d="m31 12 8 25-9 3-8-25zm-11 27 11 7 12-7M31 46l-5 8m5-8 7 9m-19-7-7 3m31-4 9 4"/>',
  volley:'<path d="m13 49 30-30m-13-3 13 3 3 13M12 35l21-21m-10 0h10v10M27 52l23-23m-10 0h10v10"/>',
  pierce_shot:'<path d="M10 32h43m-11-9 11 9-11 9M23 15v12m0 10v12m15-34v12m0 10v12"/>',
  blast_arrow:'<path d="m12 50 21-21m-10 0h10v10m7-28 3 10 11-2-7 9 8 8-12-1-2 12-6-9m-21 5-5 7"/>',
  ember_bolt:'<path d="M24 45C8 26 37 23 34 10c19 18 19 28 7 37-8 6-16 0-12-8 3-7 7-8 7-14M12 48l9-5m-5 11 9-6"/>',
  frost_lance:'<path d="m14 51 28-37 8-3-1 10-32 33M32 25l-11-4m17-3-2-9m3 25 12 1m-26 6-8-2"/>',
  flame_ring:'<path d="M13 40c-5-14 12-19 9-31 11 8 9 15 14 17 2-9 9-9 10-16 14 18 10 34-2 41M20 43a12 8 0 1 0 24 0 12 8 0 1 0-24 0"/>',
  healing_light:'<circle cx="32" cy="32" r="19"/><path d="M32 21v22M21 32h22M32 6v5m0 42v5M6 32h5m42 0h5M14 14l4 4m28 28 4 4m0-36-4 4M18 46l-4 4"/>',
};
export const SKILL_TYPES = {
  lunge:'근접 · 돌진', whirl:'범위', heavy_cleave:'근접 · 범위', volley:'원거리',
  pierce_shot:'원거리 · 관통', blast_arrow:'원거리 · 폭발', ember_bolt:'원거리 · 화염',
  frost_lance:'관통 · 서리', flame_ring:'범위 · 화염', healing_light:'회복',
};
export function skillIcon(id, art = SKILL_ART) {
  const family = ABILITIES[id].family;
  const face = art[id] ? `<img src="${escape(art[id])}" alt="" width="64" height="64">`
    : `<svg viewBox="0 0 64 64" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">${SILHOUETTES[id]}</svg>`;
  return `<span class="skill-icon faculty-${family}" data-skill-icon="${id}">${face}</span>`;
}
export function skillCardHtml(id, save, { context = 'academy' } = {}) {
  const a = ABILITIES[id], book = BOOKS[id], known = hasSkill(save,id), slot = slotOf(save,id), selected = slot >= 0;
  const state = selected ? `슬롯 ${slot + 1}` : known ? '배움' : `미습득 · ${book.price} G`;
  const stats = [a.heal ? `회복 최대 HP ${Math.round(a.heal.maxHpFrac * 100)}%` : `피해 ${a.damage}`, `${a.manaCost || 0} MP`, `재사용 ${amount(a.cooldownMs / 1000)}초`, ...(book?.req && !known ? [`요구 ${STAT_NAMES[book.req.stat]} ${book.req.value}`] : [])];
  const copy = `${skillIcon(id)}<span class="skill-copy"><strong>${escape(a.name)}</strong><span class="skill-type">${SKILL_TYPES[id]}</span><span class="skill-chips">${stats.map(s=>`<span>${s}</span>`).join('')}</span><small class="skill-state">${SKILL_DISPLAY[id].label} · ${state}</small></span>`;
  if (context === 'character') return `<button type="button" class="skill-card character-skill faculty-${a.family}" data-action="skill-detail" data-id="${id}" data-grade="${SKILL_DISPLAY[id].grade}">${copy}</button>`;
  const req = !known && book ? bookRequirement(save,id) : null, blocked = !known && (save.gold < book.price || !req.ok);
  const control = context === 'detail' ? '' : `<button type="button" data-action="${known ? 'equip-skill' : 'learn-skill'}" data-id="${id}" ${known ? `data-family="${a.family}" aria-pressed="${selected}"` : ''} ${selected || blocked ? 'disabled' : ''}>${selected ? '장착 중' : known ? '장착' : '배우기'}</button>`;
  const lack = !known ? [req && !req.ok ? req.label : '', save.gold < book.price ? '골드 부족' : ''].filter(Boolean) : [];
  return `<article class="skill-card faculty-${a.family}" data-skill="${id}" data-grade="${SKILL_DISPLAY[id].grade}"><div class="skill-card-main">${copy}</div>${control}${lack.length ? `<small class="loss">${lack.join(' · ')}</small>` : ''}</article>`;
}
