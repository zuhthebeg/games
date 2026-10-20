import { ABILITIES, SKILL_USE, canUseSkill, skillDamageShare } from '../content/combat.js';
import { skillGrowth, growthLabel } from '../content/skill-growth.js';
import { masteryLevel, masteryLabel } from '../meta/skill-mastery.js';
import { BOOKS, SKILL_DISPLAY, hasSkill, slotOf, bookRequirement, loadoutOf, weaponFamily, weaponForm, skillLineageAllowed } from '../meta/skills.js';
import { ITEMS, equippedItem } from '../meta/items.js';
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
  poison_arrow:'<path d="m10 51 35-35m-13 0h13v13M18 14q-11 13 0 20 11-7 0-20M38 38q-9 11 0 17 9-6 0-17"/>',
  cursed_hands:'<path d="M8 54h48M15 50V31l5-3 3 9V17l5-2 2 22V10h5l2 27 3-20 5 2-1 24 7-8 5 4-11 15M19 44l10 7m14-7-8 7"/>',
  blood_spear:'<path d="m10 54 34-37-3-9 15-3-3 15-7-1-34 37M19 12q-9 12 0 18 9-6 0-18M34 40l9 9"/>',
  dead_explosion:'<path d="m32 5 6 16 17-8-8 18 13 8-20 2-8 19-7-19-20-2 14-9-9-17 16 8zM26 28h12v10H26zm6 10v7"/>',
  poison_field:'<path d="M9 47q23-12 46 0M14 53h36M20 17q-8 10 0 17m12-23q-9 13 0 23m12-17q-8 10 0 17"/>',
  curse:'<path d="M18 14h28v23L32 53 18 37zm3 8 22 15M43 22 21 37M32 8v6"/>',
  invisibility:'<path d="M8 32q24-28 48 0-24 28-48 0M12 53 52 11M26 27a9 9 0 0 0 11 11"/>',
  sword_wave:'<path d="m12 51 27-29 5 5-27 29M29 10q27 14 22 40M35 13q14 11 14 25"/>',
  berserk:'<path d="m13 10 38 39-6 6-38-39m43-6L13 49l6 6 38-39M23 28l9-13 9 13-9 22z"/>',
  lunge:'<path d="m17 43 27-27 5 5-27 27m-8-10 12 12m-12-22 13-7M34 45l15-9"/>',
  whirl:'<path d="M17 24a19 19 0 1 1-2 18m-2-24 4 6 7-3m-2 20 19-20m-22 15 9 9"/>',
  heavy_cleave:'<path d="m31 12 8 25-9 3-8-25zm-11 27 11 7 12-7M31 46l-5 8m5-8 7 9m-19-7-7 3m31-4 9 4"/>',
  ground_slam:'<path d="M25 9h18v13H25zM32 22v19m-17 3 17 8 17-8M17 30l-7 7m39-7 7 7M23 52l-4 6m22-6 4 6"/>',
  armor_break:'<path d="m17 14 15-6 15 6v18L32 53 17 32zm18 2-9 13 12 6-9 13M8 10l8 8m32 22 8 8"/>',
  volley:'<path d="m13 49 30-30m-13-3 13 3 3 13M12 35l21-21m-10 0h10v10M27 52l23-23m-10 0h10v10"/>',
  triple_arrow:'<path d="M10 18h40m-9-7 9 7-9 7M10 32h40m-9-7 9 7-9 7M10 46h40m-9-7 9 7-9 7"/>',
  evasion_shot:'<path d="M10 42a21 21 0 0 1 30-24m-9-8 10 7-8 8M20 44h33m-10-9 10 9-10 9"/>',
  pierce_shot:'<path d="M10 32h43m-11-9 11 9-11 9M23 15v12m0 10v12m15-34v12m0 10v12"/>',
  blast_arrow:'<path d="m12 50 21-21m-10 0h10v10m7-28 3 10 11-2-7 9 8 8-12-1-2 12-6-9m-21 5-5 7"/>',
  ember_bolt:'<path d="M24 45C8 26 37 23 34 10c19 18 19 28 7 37-8 6-16 0-12-8 3-7 7-8 7-14M12 48l9-5m-5 11 9-6"/>',
  frost_lance:'<path d="m14 51 28-37 8-3-1 10-32 33M32 25l-11-4m17-3-2-9m3 25 12 1m-26 6-8-2"/>',
  rain_arrow:'<path d="M13 8v32m-6-8 6 8 6-8M32 6v38m-7-8 7 8 7-8M51 8v32m-6-8 6 8 6-8M8 53q24 9 48 0"/>',
  spinning_shot:'<path d="M12 25a21 21 0 0 1 38-7m0-9v10H40M52 39a21 21 0 0 1-38 7m0 9V45h10M32 15v34m-6-7 6 7 6-7"/>',
  meteor:'<path d="m48 8-9 23M35 9l-8 17m24-2-8 13"/><circle cx="27" cy="39" r="12"/><path d="M10 54h43M23 35l9 8"/>',
  firewall:'<path d="M8 51h48M12 48c-9-13 8-17 4-30 13 12 10 18 7 28m3 2c-8-17 10-21 5-36 14 15 12 25 8 34m4 2c-5-12 8-16 7-26 10 13 9 18 4 25"/>',
  flame_ring:'<path d="M13 40c-5-14 12-19 9-31 11 8 9 15 14 17 2-9 9-9 10-16 14 18 10 34-2 41M20 43a12 8 0 1 0 24 0 12 8 0 1 0-24 0"/>',
  protective_shield:'<path d="M32 8 50 16v16c0 12-10 20-18 24-8-4-18-12-18-24V16zM22 32l7 7 14-16"/>',
  turn_undead:'<path d="M18 28a14 14 0 1 1 28 0v12l-7 5v7H25v-7l-7-5zM25 31h2m10 0h2M32 36v5M11 12l42 42M45 6v12m-6-6h12"/>',
  healing_light:'<circle cx="32" cy="32" r="19"/><path d="M32 21v22M21 32h22M32 6v5m0 42v5M6 32h5m42 0h5M14 14l4 4m28 28 4 4m0-36-4 4M18 46l-4 4"/>',
};
export const SKILL_TYPES = {
  poison_arrow:'궁수 · 중독 화살', cursed_hands:'마법 · 지면 속박', blood_spear:'마법 · 피의 관통창', dead_explosion:'물리 · 생명 희생 폭발',
  poison_field:'해골 · 지속 독 지대', curse:'해골 · 공격/방어 저주', invisibility:'해골 · 적 자동 조준 차단', sword_wave:'검 · 관통 검기', berserk:'양손 근접 · 광전사',
  rain_arrow:'지연 · 연속 화살비', spinning_shot:'회전 · 전방위 사격', meteor:'지연 · 광역 화염', firewall:'지속 · 화염 장벽', lunge:'근접 · 돌진', whirl:'범위', heavy_cleave:'근접 · 범위', volley:'원거리',
  ground_slam:'둔기 · 범위', armor_break:'둔기 · 파쇄',
  triple_arrow:'원거리 · 3연사', evasion_shot:'회피 · 사격',
  pierce_shot:'원거리 · 관통', blast_arrow:'원거리 · 폭발', ember_bolt:'원거리 · 화염',
  protective_shield:'파티 · 피해 방어',
  frost_lance:'관통 · 서리', flame_ring:'범위 · 화염', healing_light:'회복 · 언데드 피해', turn_undead:'언데드 · 확률 즉사',
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
const hands = save => ITEMS[equippedItem(save,'weapon')?.id]?.handedness;
const useClass = (id, weapon, form, save) => { const use = skillUse(id, weapon, form, save?.lineage, save && hands(save)); return use === undefined ? ' use-blocked' : use < 1 ? ' use-weak' : ''; };
export function weaponWarnHtml(id, save) {
  const weapon = weaponFamily(save), form = weaponForm(save), use = skillUse(id, weapon, form, save.lineage, hands(save)), table = SKILL_USE[ABILITIES[id].family];
  const allowed = ABILITIES[id].requiresSkeleton ? (ABILITIES[id].requiresSchool ? `해골 · ${WEAPON_NAMES[ABILITIES[id].family]} 100%` : '해골 계보 · 현재 무기 100%') : id === 'berserk' && save.lineage?.startsWith('skeleton_') ? '해골 · 모든 무기 100%' : ABILITIES[id].requiresTwohand ? '양손 검·양손 둔기 100%' : ABILITIES[id].requiresForm === 'sword' ? '한손 검·양손 검 100%' : ABILITIES[id].requiresFocus ? '지팡이 100%' : ABILITIES[id].shield ? '검 100% · 활 100% · 지팡이 100%' : ABILITIES[id].requiresForm ? '둔기 100%' : Object.entries(table).map(([w, v]) => `${WEAPON_NAMES[w]} ${Math.round(v * 100)}%`).join(' · ');
  return `<dl class="p2-lines weapon-warn${useClass(id, weapon, form, save)}"><div><dt>현재 무기</dt><dd>${form === 'blunt' ? '둔기' : WEAPON_NAMES[weapon]}</dd></div>`
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
    if (!id || !interactive && !skillLineageAllowed(save,id)) return `<div class="loadout-slot empty" id="loadout-slot-${i + 1}"><b>${i + 1}</b><span>비어 있음</span></div>`;
    const usable = canUseSkill(id, weapon, weaponForm(save),save.lineage,hands(save)), use = skillUse(id, weapon, weaponForm(save),save.lineage,hands(save));
    const face = `<b>${i + 1}</b>${skillIcon(id)}<span>${escape(ABILITIES[id].name)}</span>${usable ? '' : '<i class="slot-blocked" aria-label="이 무기로 사용 불가">✕</i>'}${usable && use < 1 ? `<i class="slot-weak" aria-label="이 무기로 위력 ${Math.round(use * 100)}%">${Math.round(use * 100)}%</i>` : ''}`;
    const cls = `loadout-slot${usable ? use < 1 ? ' weak' : '' : ' blocked'}`;
    return interactive ? `<button type="button" data-action="skill-detail" id="loadout-slot-${i + 1}" data-id="${id}" class="${cls}">${face}</button>`
      : `<div id="loadout-slot-${i + 1}" data-id="${id}" class="${cls}">${face}</div>`;
  }).join('')}</div>`;
}
export function skillCardHtml(id, save, { context = 'academy' } = {}) {
  const a = ABILITIES[id], book = BOOKS[id], known = hasSkill(save,id);
  const level = masteryLevel(save.skillMastery?.[id]), growth = skillGrowth(id, level);
  if (['poison_arrow','cursed_hands','blood_spear','dead_explosion'].includes(id)) {
    const req = !known ? bookRequirement(save,id) : null;
    const blocked = !known && (save.gold < book.price || !req.ok);
    const usable = canUseSkill(id,weaponFamily(save),weaponForm(save),save.lineage,hands(save));
    const cost = `${a.manaCost} MP · ${amount(a.cooldownMs/1000)}s${a.hpCostFrac ? ` · HP −${a.hpCostFrac*100}% · ≥${a.minHp}` : ''}`;
    const detail = context === 'detail' ? `<span class="skill-type">${SKILL_TYPES[id]}</span><small class="skill-growth" data-growth="${id}">${growthLabel(id,level)}</small>` : '';
    const copy = `${skillIcon(id)}<span class="skill-copy"><strong>${escape(a.name)}</strong>${detail}<span class="skill-chips"><span>${cost}</span></span><small class="skill-mastery" data-mastery="${id}">Lv${level}</small>${!known ? `<small class="skill-state">${book.price} G · ${STAT_NAMES[req.stat]} ${req.have}/${req.value}</small>` : ''}</span>${usable ? '' : '<i class="slot-blocked" aria-label="필수 무기">✕</i>'}`;
    const action = context === 'character' ? 'skill-detail' : 'skill-book-info';
    const face = context === 'detail' ? `<div class="skill-card-main">${copy}</div>` : `<button type="button" class="skill-card-main" data-action="${action}" data-id="${id}" aria-label="${escape(a.name)}">${copy}</button>`;
    const control = context === 'detail' ? '' : known ? slotPickHtml(id,save,context) : `<button type="button" data-action="learn-skill" data-id="${id}" ${blocked ? 'disabled' : ''}>배우기</button>`;
    return `<article class="skill-card faculty-${a.family}${usable ? '' : ' use-blocked'}" data-skill="${id}" data-grade="${SKILL_DISPLAY[id].grade}">${face}${control}</article>`;
  }
  const state = known ? '' : ` · 미습득 · ${book.price} G`;
  const special = id === 'poison_field' ? [`반경 ${growth.radius} px · ${growth.durationMs/1000}초 · 0.5초마다 피해 8 × 무기 위력`, '적에게만 피해 · 시전 지점 고정'] : id === 'curse' ? ['적 공격 위력 감소 · 방어 약화', '인간 방어력 감소 · 몬스터 받는 피해 증가', '중첩 없음 · 강한 효과 유지/시간 갱신'] : id === 'invisibility' ? ['적에게 모습을 숨김', '공격·다른 기술 사용·피격 시 해제', '이미 발사된 공격·범위 공격에 피격 가능', '자동 공격은 은신 중 일시 정지'] : id === 'sword_wave' ? [`진행형 검기 · 사거리 ${growth.range} px · 최대 ${growth.targets}대상 1회 관통`, '한손 검·양손 검 전용'] : id === 'berserk' ? [save.lineage?.startsWith('skeleton_') ? '해골 · 모든 무기' : '양손 검·양손 둔기 전용', '위력/공격 속도 증가 · 받는 피해 +20%', ...(save.lineage?.startsWith('skeleton_') ? [] : ['무기 교체 시 해제 · 체력 회복 없음'])] : [];
  const stats = [...special, a.executeUndead ? '즉사 10% + 지능×0.5%p (최대 70%) · 보스 0.1% + 지능×0.002%p (최대 0.8%, 신성 포함 0.9%) · 실패 시 쿨타임 없음' : a.shield ? `반경 160 · ${growth.charges}회 방어 · ${Math.round(growth.durationMs / 100) / 10}초` : a.heal ? `회복 최대 HP ${Math.round(a.heal.maxHpFrac * 100)}%` : `피해 ${a.damage}`, ...(a.heal ? ['적 언데드 피해 48 × 마법 위력', '신성 지팡이: 회복 +20%'] : []), ...(id === 'frost_lance' ? ['빙결 30% · 1.5초 (보스 10% · 0.5초)', '강한 직접 타격에 빙결 해제', '서리 지팡이: 피해 +25%'] : []), ...(a.family === 'focus' && a.element === 'fire' && id !== 'firewall' ? ['화상 3초 · 0.5초마다 피해 4 × 마법 위력', '화상 중 받는 피해 +10%', '화염 지팡이: 피해 +25%'] : []), ...(a.executeUndead ? ['신성 지팡이: 일반 +5%p · 보스 +0.1%p (상한 유지)'] : []), ...(a.zone && id !== 'poison_field' ? [`시전 지점 고정 · 사거리 ${a.zone.range} px`, ...(id === 'rain_arrow' ? ['낙하 대기 0.3초 · 반경 90 px', `0.3초마다 피해 16 × 활 위력 · 최대 ${growth.count}회`, '물리 피해 · 치명타·경직 없음'] : id === 'meteor' ? [`낙하 대기 0.7초 · 폭발 반경 125 px`, `고정 지점 ${growth.count}회 낙하 · 0.3초 간격`] : [`지속 ${growth.durationMs / 1000}초 · 길이 220 px · 폭 36 px`, `0.5초마다 피해 12 × 마법 위력 · 최대 ${growth.count}회`, '이동 차단 없음 · 치명타·화상·경직 없음', '화염 지팡이: 피해 +25%'])] : []), `${a.manaCost || 0} MP`, `재사용 ${amount(a.cooldownMs / 1000)}초`, ...(a.requiresFocus ? ['지팡이 필수'] : []), ...(a.heal ? ['지능에 비례해 회복량 증가'] : []), ...(a.requiresForm ? [a.requiresForm === 'sword' ? '무기 검' : '무기 둔기'] : []), ...(a.sunder ? ['방어 약화 · 받는 피해 +15%', '파쇄 5초'] : []), ...(a.slow ? ['이동 속도 35% 감소 · 3초'] : []), ...(a.spin ? [`360° 회전 · 1.2초 동안 ${growth.count}발`, '균등 분산 · 사거리 420 px · 물리 화살'] : a.burst ? ['조준 방향 빠른 3연사 · 0.1초 간격'] : []), ...(a.dodgeShot ? ['회피 이동·무적 중 조준 사격', '회피 재사용 대기 중 사용 불가'] : []), ...(book?.req && !known ? [`요구 ${STAT_NAMES[book.req.stat]} ${book.req.value}`] : [])];
  const copy = `${skillIcon(id)}<span class="skill-copy"><strong>${escape(a.name)}</strong><span class="skill-type">${SKILL_TYPES[id]}</span><span class="skill-chips">${stats.map(s=>`<span>${s}</span>`).join('')}</span><small class="skill-mastery" data-mastery="${id}">${masteryLabel(save, id)}</small>${growth ? `<small class="skill-growth" data-growth="${id}">${growthLabel(id, level)}</small>` : ''}<small class="skill-state">${SKILL_DISPLAY[id].label}${state}</small></span>`;
  if (context === 'character') {
    const weapon = weaponFamily(save), form = weaponForm(save), use = skillUse(id, weapon, form, save.lineage, hands(save)), mark = useClass(id, weapon, form, save);
    const warn = mark ? `<button type="button" class="skill-warn" data-action="skill-warn" data-id="${id}" aria-label="무기 경고 · ${use === undefined ? '사용 불가' : `위력 ${Math.round(use * 100)}%`}">${use === undefined ? '✕' : `${Math.round(use * 100)}%`}</button>` : '';
    return `<article class="skill-card character-skill faculty-${a.family}${mark}" data-id="${id}" data-grade="${SKILL_DISPLAY[id].grade}"><button type="button" class="skill-card-main" data-action="skill-detail" data-id="${id}">${copy}</button><div class="slot-row">${slotPickHtml(id, save, 'character')}${warn}</div></article>`;
  }
  const req = !known && book ? bookRequirement(save,id) : null, blocked = !known && (save.gold < book.price || !req.ok);
  const formBlocked = (a.requiresForm || a.requiresFocus || a.requiresSkeleton || a.requiresHuman || a.requiresTwohand) && !canUseSkill(id, weaponFamily(save), weaponForm(save),save.lineage,hands(save));
  const control = context === 'detail' ? '' : known ? slotPickHtml(id, save, 'academy')
    : `<button type="button" data-action="learn-skill" data-id="${id}" ${blocked ? 'disabled' : ''}>배우기</button>`;
  const lack = !known ? [req && !req.ok ? req.label : '', save.gold < book.price ? '골드 부족' : ''].filter(Boolean) : [];
  return `<article class="skill-card faculty-${a.family}${formBlocked ? ' use-blocked' : ''}" data-skill="${id}" data-grade="${SKILL_DISPLAY[id].grade}"><${context === 'academy' ? `button type="button" data-action="skill-book-info" data-id="${id}" aria-label="${escape(a.name)} 효과"` : 'div'} class="skill-card-main">${copy}${formBlocked ? '<i class="slot-blocked" aria-label="필수 무기">✕</i>' : ''}</${context === 'academy' ? 'button' : 'div'}>${control}${lack.length ? `<small class="loss">${lack.join(' · ')}</small>` : ''}</article>`;
}
