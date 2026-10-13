import { ABILITIES, SKILL_USE, canUseSkill, skillDamageShare } from '../content/combat.js';
import { masteryLabel } from '../meta/skill-mastery.js';
import { BOOKS, SKILL_DISPLAY, hasSkill, slotOf, bookRequirement, loadoutOf, weaponFamily, weaponForm } from '../meta/skills.js';
import { STAT_NAMES } from '../meta/stats.js';
import { WEAPON_NAMES } from '../meta/quiz.js';
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
  ground_slam:'<path d="M25 9h18v13H25zM32 22v19m-17 3 17 8 17-8M17 30l-7 7m39-7 7 7M23 52l-4 6m22-6 4 6"/>',
  armor_break:'<path d="m17 14 15-6 15 6v18L32 53 17 32zm18 2-9 13 12 6-9 13M8 10l8 8m32 22 8 8"/>',
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
  ground_slam:'둔기 · 범위', armor_break:'둔기 · 파쇄',
  pierce_shot:'원거리 · 관통', blast_arrow:'원거리 · 폭발', ember_bolt:'원거리 · 화염',
  frost_lance:'관통 · 서리', flame_ring:'범위 · 화염', healing_light:'회복',
};
export function skillIcon(id, art = SKILL_ART) {
  const family = ABILITIES[id].family;
  const face = art[id] ? `<img src="${escape(art[id])}" alt="" width="64" height="64">`
    : `<svg viewBox="0 0 64 64" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">${SILHOUETTES[id]}</svg>`;
  return `<span class="skill-icon faculty-${family}" data-skill-icon="${id}">${face}</span>`;
}
export const FAMILY_LABELS = { blade:'검술', bow:'궁술', focus:'마법' };
// Damage share of a skill with the equipped weapon: 1 full, <1 weakened, undefined = cannot fire.
export const skillUse = skillDamageShare;
const useClass = (id, weapon, form) => { const use = skillUse(id, weapon, form); return use === undefined ? ' use-blocked' : use < 1 ? ' use-weak' : ''; };
export function weaponWarnHtml(id, save) {
  const weapon = weaponFamily(save), form = weaponForm(save), use = skillUse(id, weapon, form), table = SKILL_USE[ABILITIES[id].family];
  const allowed = ABILITIES[id].requiresForm ? '둔기 100%' : Object.entries(table).map(([w, v]) => `${WEAPON_NAMES[w]} ${Math.round(v * 100)}%`).join(' · ');
  return `<dl class="p2-lines weapon-warn${useClass(id, weapon, form)}"><div><dt>현재 무기</dt><dd>${form === 'blunt' ? '둔기' : WEAPON_NAMES[weapon]}</dd></div>`
    + `<div><dt>${use === undefined ? '사냥 중 사용' : '위력'}</dt><dd>${use === undefined ? '불가' : `${Math.round(use * 100)}%`}</dd></div>`
    + `<div><dt>사용 가능 무기</dt><dd>${allowed}</dd></div></dl>`;
}
// Direct slot choice on every learned card: tap a number to put the skill there, tap the lit number to take it out.
export function slotPickHtml(id, save, context) {
  const slot = slotOf(save,id), name = escape(ABILITIES[id].name);
  return `<div class="slot-pick" role="group" aria-label="${name} 장착 슬롯">${loadoutOf(save).map((_, i) => `<button type="button" data-action="skill-slot" data-id="${id}" data-slot="${i}" data-context="${context}" aria-pressed="${slot === i}" aria-label="${name} 슬롯 ${i + 1}${slot === i ? ' 빼기' : ' 장착'}">${i + 1}</button>`).join('')}</div>`;
}
// Filled slots open the skill sheet only where the sheet returns (character tab); elsewhere they are a read-out.
export function loadoutHtml(save, { interactive = true } = {}) {
  const weapon = weaponFamily(save);
  return `<div class="loadout" aria-label="기술 슬롯">${loadoutOf(save).map((id, i) => {
    if (!id) return `<div class="loadout-slot empty" id="loadout-slot-${i + 1}"><b>${i + 1}</b><span>비어 있음</span></div>`;
    const usable = canUseSkill(id, weapon, weaponForm(save)), use = skillUse(id, weapon, weaponForm(save));
    const face = `<b>${i + 1}</b>${skillIcon(id)}<span>${escape(ABILITIES[id].name)}</span>${usable ? '' : '<i class="slot-blocked" aria-label="이 무기로 사용 불가">✕</i>'}${usable && use < 1 ? `<i class="slot-weak" aria-label="이 무기로 위력 ${Math.round(use * 100)}%">${Math.round(use * 100)}%</i>` : ''}`;
    const cls = `loadout-slot${usable ? use < 1 ? ' weak' : '' : ' blocked'}`;
    return interactive ? `<button type="button" data-action="skill-detail" id="loadout-slot-${i + 1}" data-id="${id}" class="${cls}">${face}</button>`
      : `<div id="loadout-slot-${i + 1}" data-id="${id}" class="${cls}">${face}</div>`;
  }).join('')}</div>`;
}
export function skillCardHtml(id, save, { context = 'academy' } = {}) {
  const a = ABILITIES[id], book = BOOKS[id], known = hasSkill(save,id);
  const state = known ? '' : ` · 미습득 · ${book.price} G`;
  const stats = [a.heal ? `회복 최대 HP ${Math.round(a.heal.maxHpFrac * 100)}%` : `피해 ${a.damage}`, `${a.manaCost || 0} MP`, `재사용 ${amount(a.cooldownMs / 1000)}초`, ...(a.requiresForm ? ['무기 둔기'] : []), ...(a.sunder ? ['받는 피해 +15%', '파쇄 5초'] : []), ...(book?.req && !known ? [`요구 ${STAT_NAMES[book.req.stat]} ${book.req.value}`] : [])];
  const copy = `${skillIcon(id)}<span class="skill-copy"><strong>${escape(a.name)}</strong><span class="skill-type">${SKILL_TYPES[id]}</span><span class="skill-chips">${stats.map(s=>`<span>${s}</span>`).join('')}</span><small class="skill-mastery" data-mastery="${id}">${masteryLabel(save, id)}</small><small class="skill-state">${SKILL_DISPLAY[id].label}${state}</small></span>`;
  if (context === 'character') {
    const weapon = weaponFamily(save), form = weaponForm(save), use = skillUse(id, weapon, form), mark = useClass(id, weapon, form);
    const warn = mark ? `<button type="button" class="skill-warn" data-action="skill-warn" data-id="${id}" aria-label="무기 경고 · ${use === undefined ? '사용 불가' : `위력 ${Math.round(use * 100)}%`}">${use === undefined ? '✕' : `${Math.round(use * 100)}%`}</button>` : '';
    return `<article class="skill-card character-skill faculty-${a.family}${mark}" data-id="${id}" data-grade="${SKILL_DISPLAY[id].grade}"><button type="button" class="skill-card-main" data-action="skill-detail" data-id="${id}">${copy}</button><div class="slot-row">${slotPickHtml(id, save, 'character')}${warn}</div></article>`;
  }
  const req = !known && book ? bookRequirement(save,id) : null, blocked = !known && (save.gold < book.price || !req.ok);
  const formBlocked = a.requiresForm && !canUseSkill(id, weaponFamily(save), weaponForm(save));
  const control = context === 'detail' ? '' : known ? slotPickHtml(id, save, 'academy')
    : `<button type="button" data-action="learn-skill" data-id="${id}" ${blocked ? 'disabled' : ''}>배우기</button>`;
  const lack = !known ? [req && !req.ok ? req.label : '', save.gold < book.price ? '골드 부족' : ''].filter(Boolean) : [];
  return `<article class="skill-card faculty-${a.family}${formBlocked ? ' use-blocked' : ''}" data-skill="${id}" data-grade="${SKILL_DISPLAY[id].grade}"><div class="skill-card-main">${copy}${formBlocked ? '<i class="slot-blocked" aria-label="무기: 둔기">✕</i>' : ''}</div>${control}${lack.length ? `<small class="loss">${lack.join(' · ')}</small>` : ''}</article>`;
}
