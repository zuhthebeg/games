import { ITEMS, equippedItem, meetsRequirement, enhanceMultiplier } from '../meta/items.js';
import { AFFIX_LABELS } from '../meta/affixes.js';
import { compareItems } from '../meta/compare.js';
import { icon, itemIcon } from './icons.js';
import { equipmentVisual, paperdollEnabled } from '../render/paperdoll-state.js';
import { installPaperdollPortraits } from '../render/paperdoll-portrait.js';

// Pure HTML builders shared by the inn, bag, merchant, forge and reveal screens (ui-mock §7.4).
export const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
export const amount = value => Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
export const SLOT_NAMES = { weapon:'무기', head:'머리', body:'몸', hands:'손', feet:'발' };
export const GRADES = { common:'일반', fine:'양질', rare:'희귀', epic:'영웅' };
export const GRADE_ORDER = ['common', 'fine', 'rare', 'epic'];
export const itemLabel = item => `${ITEMS[item.id].name} +${item.enhance}`;
export const isWorn = (save, uid) => Object.values(save.equipped).includes(uid);

export const emblem = item => {
  const rarity = ITEMS[item.id].rarity;
  return `<span class="p2-emblem ${rarity}" data-enhance="${Math.min(10, item.enhance)}">${itemIcon(item.id, ITEMS[item.id])}`
    + `<span class="grade-mark">${GRADES[rarity]}</span>`
    + `${item.enhance ? `<b class="enhance-badge" data-enhance="${Math.min(10, item.enhance)}">+${item.enhance}</b>` : ''}</span>`;
};

export const comparisonFor = (item, save) => compareItems(equippedItem(save, ITEMS[item.id].slot), item, save);

export function deltaText(line) {
  if (line.delta === 0) return '= 유지';
  return `${line.delta > 0 ? '▲+' : '▼−'}${amount(Math.abs(line.delta))} · ${line.good ? '이득' : '손해'}`;
}

export function linesHtml(comparison) {
  const rows = comparison.lines.map(line => `<div data-line="${escape(line.key)}" data-from="${line.from}" data-to="${line.to}" data-delta="${line.delta}">`
    + `<dt>${escape(line.label)}</dt><dd><span>${amount(line.from)} → <b>${amount(line.to)}</b></span>`
    + `<small class="${line.delta === 0 ? '' : line.good ? 'gain' : 'loss'}">${deltaText(line)}</small></dd></div>`);
  return `<dl class="p2-lines">${rows.join('')}</dl>`;
}

// Two most relevant changes, arrows for direction and colour for judgement (weight ▲ is a loss).
export function summaryHtml(item, save) {
  const lines = comparisonFor(item, save).lines.filter(line => line.delta !== 0).slice(0, 2);
  if (!lines.length) return '<span class="muted">동일 능력치</span>';
  return lines.map(line => `<span class="${line.good ? 'gain' : 'loss'}">${escape(line.label)} ${line.delta > 0 ? '▲' : '▼'}${amount(Math.abs(line.delta))}</span>`).join(' ');
}

export function cardHtml(item, save, { action = 'open-item', compact = false, extra = '', note = '', disabled = false } = {}) {
  const def = ITEMS[item.id];
  const locked = !meetsRequirement(save, def);
  const worn = isWorn(save, item.uid);
  const meta = compact ? (note || GRADES[def.rarity]) : `${SLOT_NAMES[def.slot]} · ${note || `${def.weight} kg`}`;
  return `<button type="button" class="p2-card ${compact ? 'compact' : ''} ${worn ? 'worn' : ''}" data-action="${action}" data-uid="${escape(item.uid)}" ${extra} ${disabled ? 'disabled' : ''}`
    + ` aria-label="${escape(itemLabel(item))}, ${GRADES[def.rarity]}${worn ? ', 착용 중' : ''}">${emblem(item)}`
    + `<span class="p2-card-copy"><strong>${escape(def.name)}</strong><small>${escape(meta)}</small>`
    + `${compact ? '' : `<span class="p2-delta">${summaryHtml(item, save)}</span>`}`
    + `${locked ? `<small class="loss">${icon('lock')}힘 ${def.requiredStr}</small>` : ''}</span></button>`;
}

// P5 replacement seam: return a portrait descriptor, never mutate save or choose gear visuals elsewhere.
export function getHeroPortrait(save) {
  const family = ITEMS[equippedItem(save, 'weapon')?.id]?.family || 'blade';
  const kit = { blade:'sword', bow:'bow', focus:'focus' }[family];
  return { url:`assets/sprites/hero-${kit}/atlas-0.webp`, frame:'idle_SW_000', x:128, y:256, width:128, height:128, atlasWidth:2048, atlasHeight:2048 };
}

export function portraitHtml(save) {
  const p = getHeroPortrait(save);
  const enabled = paperdollEnabled();
  if (enabled) installPaperdollPortraits();
  const parts = enabled ? ` data-paperdoll-fallback="${p.url}" data-paperdoll="${escape(JSON.stringify(equipmentVisual(save)))}"` : '';
  const canvas = enabled ? '<canvas width="128" height="128" style="width:100%;height:100%" hidden></canvas>' : '';
  const enhance = Math.min(10, equippedItem(save, 'weapon')?.enhance || 0);
  const kit = ITEMS[equippedItem(save, 'weapon')?.id]?.family || 'blade';
  const glow = enhance >= 6 ? `<span class="portrait-weapon-glow" data-enhance="${enhance}" data-kit="${kit}" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></span>` : '';
  return `<div class="sprite p2-hero"${parts} role="img" aria-label="현재 장비의 기사" style="background-image:${enabled ? 'none' : `url('${p.url}')`};background-position:-${p.x}px -${p.y}px;background-size:${p.atlasWidth}px ${p.atlasHeight}px">${canvas}${glow}</div>`;
}

export function socketsHtml(save) {
  return Object.keys(SLOT_NAMES).map(slot => {
    const item = equippedItem(save, slot);
    const face = item ? emblem(item) : `<span class="p2-emblem empty">${icon(slot === 'weapon' ? 'weapon' : slot)}</span>`;
    return `<button type="button" class="p2-socket socket-${slot} ${item ? '' : 'empty'}" data-action="socket" data-slot="${slot}"`
      + ` aria-label="${SLOT_NAMES[slot]} · ${item ? escape(itemLabel(item)) : '비어 있음'}">${face}`
      + `<span>${item ? escape(ITEMS[item.id].name) : `${SLOT_NAMES[slot]} · 비어 있음`}</span></button>`;
  }).join('');
}

// Actual model contributions, including zeros: own-item details must not disappear into deltas.
export function itemDetailsHtml(item) {
  const def = ITEMS[item.id], mult = enhanceMultiplier(item.enhance);
  const row = (key, label, value) => `<div data-detail="${escape(key)}"><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>`;
  const rows = [row('family', '무기 계열 / 방어구', def.family ? {blade:'검',bow:'활',focus:'지팡이'}[def.family] : {light:'경장',medium:'중장',heavy:'중갑'}[def.armorClass] || SLOT_NAMES[def.slot]),
    row('rarity', '등급', GRADES[def.rarity]), row('str', '필요 힘', def.requiredStr || 0), row('weight', '무게', `${amount(def.weight)} kg`)];
  if (def.power !== undefined) {
    rows.push(row('power', '기본 공격 배율', `×${amount(def.power)}`),
      row('enhance', `강화 +${item.enhance} 공격 기여`, `+${amount(def.power * (mult - 1))} 배율`),
      row('attack', '강화 포함 공격 배율', `×${amount(def.power * mult)}`));
  } else {
    rows.push(row('hp-base', '기본 HP 보호 기여', `${amount(def.hp || 0)} HP`),
      row('enhance', `강화 +${item.enhance} HP 기여`, `+${amount((def.hp || 0) * (mult - 1))} HP`),
      row('hp', '강화 포함 HP 보호 기여', `${amount((def.hp || 0) * mult)} HP`));
  }
  const affixes = (item.affixes || []).map(({k,v}) => row(k, AFFIX_LABELS[k] || k, `+${amount(v)}${k.endsWith('_pct') ? '%' : k === 'capacity_flat' ? ' kg' : k === 'hp_flat' ? ' HP' : ''}`));
  return `<section class="item-details"><h3>장비 상세</h3><dl class="p2-lines">${rows.join('')}</dl><h3>전체 옵션</h3>${affixes.length ? `<dl class="p2-lines">${affixes.join('')}</dl>` : '<p class="minor">추가 옵션 없음</p>'}<p class="minor">방어구는 최대 HP를 더한다. 피해 감소 DEF 수치는 없다.${def.power !== undefined ? ' 실전 피해는 기술 기본 피해 × 캐릭터 공격 배율(레벨·능력치·전체 착용 옵션 포함).' : ''}</p></section>`;
}
