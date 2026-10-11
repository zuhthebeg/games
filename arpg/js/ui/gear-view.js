import { ITEMS, equippedItem, meetsRequirement, enhanceMultiplier, effectiveWeight } from '../meta/items.js';
import { AFFIX_LABELS, AFFIX_UNITS } from '../meta/affixes.js';
import { compareItems } from '../meta/compare.js';
import { icon, itemIcon } from './icons.js';
import { equipmentVisual, paperdollEnabled } from '../render/paperdoll-state.js';
import { installPaperdollPortraits, PORTRAIT_DIRECTIONS, PORTRAIT_FRAMES } from '../render/paperdoll-portrait.js';

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
  const change = line.section === 'affix' && line.from > 0 && line.to === 0 ? '사라짐'
    : line.section === 'affix' && line.from === 0 && line.to > 0 ? '새로 추가' : line.delta > 0 ? '증가' : '감소';
  const unit = line.unit === '%' ? '%p' : line.unit ? ` ${line.unit}` : '';
  return `${line.delta > 0 ? '▲+' : '▼−'}${amount(Math.abs(line.delta))}${unit} · ${change} · ${line.good ? '이득' : '손해'}`;
}

export const lineValue = (line, value) => `${line.prefix || ''}${amount(value)}${line.unit && !line.prefix ? `${line.unit === '%' ? '' : ' '}${line.unit}` : ''}`;

export function linesHtml(comparison) {
  const rows = comparison.lines.filter(line => line.delta !== 0).map(line => `<div data-line="${escape(line.key)}" data-from="${line.from}" data-to="${line.to}" data-delta="${line.delta}" data-section="${line.section || ''}">`
    + `<dt>${escape(line.label)}</dt><dd><span>${escape(lineValue(line,line.from))} → <b>${escape(lineValue(line,line.to))}</b></span>`
    + `<small class="${line.delta === 0 ? '' : line.good ? 'gain' : 'loss'}">${deltaText(line)}</small></dd></div>`);
  return `<dl class="p2-lines">${rows.join('')}</dl>`;
}

// Two item columns share each row; the existing comparison model remains the numeric source.
export function splitComparisonHtml(item, save) {
  const current = equippedItem(save, ITEMS[item.id].slot), c = comparisonFor(item, save);
  const line = key => c.lines.find(row => row.key === key);
  const short = { attack:'피해 배율', maxHp:'최대 HP', weight:'무게', basePower:'기본 공격', enhancePower:'강화 공격', ac:'방어력', totalAc:'총 방어력', capacity:'가방 한도', attackRate:'공격 속도', moveSpeed:'이동 속도', dodgeCooldown:'회피 재사용', potionEfficiency:'물약 효율', manaRegen:'마나 재생', goldBonus:'골드 보너스', materialBonus:'재료 보너스' };
  const delta = row => `<small class="compare-delta ${row.delta === 0 ? 'neutral' : row.good ? 'gain' : 'loss'}" aria-label="${escape(deltaText(row))}">${row.delta === 0 ? '= 유지' : `${row.delta > 0 ? '▲+' : '▼−'}${amount(Math.abs(row.delta))}${row.unit === '%' ? '%p' : ''}`}</small>`;
  const value = (row, side) => row.section === 'affix' && !(side === 'from' ? current : item)?.affixes?.some(a => a.k === row.key) ? '—' : lineValue(row,row[side]);
  const rowHtml = row => `<tr data-line="${escape(row.key)}" data-from="${row.from}" data-to="${row.to}" data-delta="${row.delta}" data-section="${row.section || ''}"><td><span>${escape(short[row.key] || row.label)}</span><b>${escape(value(row,'from'))}</b></td><td><span>${escape(short[row.key] || row.label)}</span><b>${escape(value(row,'to'))}</b>${delta(row)}</td></tr>`;
  const extraRow = (key,label,from,to) => rowHtml({key,label,from,to,delta:to-from,good:to === from ? null : key === 'requiredStr' ? to < from : to > from,section:'base',prefix:key === 'enhance' ? '+' : ''});
  const affixes = c.lines.filter(row => row.section === 'affix' && row.delta !== 0);
  const changedOrSet = (from, to) => from !== to;
  const weapon = ITEMS[item.id].power !== undefined;
  const primaryKeys = [...(weapon ? ['attack','basePower'] : ['ac','totalAc']), 'weight', ...(line('maxHp')?.delta ? ['maxHp'] : [])];
  const primary = c.lines.filter(row => primaryKeys.includes(row.key) && row.delta !== 0);
  const table = rows => `<table class="compare-split"><thead><tr><th scope="col">현재 착용<br><strong>${current ? escape(itemLabel(current)) : '빈 슬롯'}</strong></th><th scope="col">후보<br><strong>${escape(itemLabel(item))}</strong></th></tr></thead><tbody>${rows}</tbody></table>`;
  const summary = ['attack','totalAc','maxHp','attackRate','moveSpeed'].map(line).filter(row => row?.delta).map(row => `<span>${short[row.key]} ${delta(row)}</span>`).join(' · ') || '<span>변화 없음</span>';
  const more = affixes.slice(2), derived = c.lines.filter(row => row.section !== 'affix' && !primaryKeys.includes(row.key) && row.delta !== 0);
  return `<section class="compare-sheet" aria-label="현재 착용과 후보 비교"><p class="compare-summary" aria-label="최종 캐릭터 변화">${summary}</p>`
    + table(primary.map(rowHtml).join('')
      + (changedOrSet(current?.enhance || 0, item.enhance || 0) ? extraRow('enhance','강화',current?.enhance || 0,item.enhance || 0) : '')
      + (changedOrSet(ITEMS[current?.id]?.requiredStr || 0, ITEMS[item.id].requiredStr || 0) ? extraRow('requiredStr','필요 힘',ITEMS[current?.id]?.requiredStr || 0,ITEMS[item.id].requiredStr || 0) : '')
      + affixes.slice(0,2).map(rowHtml).join(''))
    + `${more.length ? `<details class="compare-more"><summary>옵션 ${more.length}개 더</summary>${table(more.map(rowHtml).join(''))}</details>` : ''}`
    + `${derived.length ? `<details class="compare-more"><summary>세부 변화 ${derived.length}</summary>${table(derived.map(rowHtml).join(''))}</details>` : ''}</section>`;
}

// Cards are deliberately brief, but explicitly disclose every changed/lost affix count.
export function optionHintHtml(comparison) {
  const changed = comparison.lines.filter(line => line.section === 'affix' && line.delta !== 0);
  if (!changed.length) return '';
  const lost = changed.filter(line => line.from > 0 && line.to === 0).length;
  return `<small class="option-change-hint" data-option-changes="${changed.length}">옵션 ${changed.length}개 변경${lost ? ` · ${lost}개 사라짐` : ''} · 자세히</small>`;
}
// Two headline changes are never a complete recommendation; the full sheet contains all rows.
export function summaryHtml(item, save) {
  const comparison = comparisonFor(item, save);
  const lines = comparison.lines.filter(line => line.delta !== 0).slice(0, 2);
  if (!lines.length) return '<span class="muted">동일 능력치</span>';
  return lines.map(line => `<span class="${line.good ? 'gain' : 'loss'}">${escape(line.label)} ${line.delta > 0 ? '▲' : '▼'}${amount(Math.abs(line.delta))}${line.unit ? ` ${line.unit}` : ''}</span>`).join(' ') + optionHintHtml(comparison);
}

export function cardHtml(item, save, { action = 'open-item', compact = false, extra = '', note = '', disabled = false } = {}) {
  const def = ITEMS[item.id];
  const locked = !meetsRequirement(save, def);
  const worn = isWorn(save, item.uid);
  const meta = compact ? (note || GRADES[def.rarity]) : `${SLOT_NAMES[def.slot]} · ${note || `${amount(effectiveWeight(item))} kg`}`;
  return `<button type="button" class="p2-card ${compact ? 'compact' : ''} ${worn ? 'worn' : ''}" data-action="${action}" data-uid="${escape(item.uid)}" ${extra} ${disabled ? 'disabled' : ''}`
    + ` aria-label="${escape(itemLabel(item))}, ${GRADES[def.rarity]}${worn ? ', 착용 중' : ''}">${emblem(item)}`
    + `<span class="p2-card-copy"><strong>${escape(def.name)}</strong><small>${escape(meta)}</small>`
    + `${compact ? optionHintHtml(comparisonFor(item, save)) : `<span class="p2-delta">${summaryHtml(item, save)}</span>`}`
    + `${locked ? `<small class="loss">${icon('lock')}힘 ${def.requiredStr}</small>` : ''}</span></button>`;
}

// P5 replacement seam: return a portrait descriptor, never mutate save or choose gear visuals elsewhere.
export function getHeroPortrait(save, direction = 'SW') {
  const family = ITEMS[equippedItem(save, 'weapon')?.id]?.family || 'blade';
  const kit = { blade:'sword', bow:'bow', focus:'focus' }[family];
  const index = PORTRAIT_DIRECTIONS.indexOf(direction);
  const [x,y] = PORTRAIT_FRAMES[index < 0 ? 3 : index];
  return { url:`assets/sprites/hero-${kit}/atlas-0.webp`, frame:`idle_${index < 0 ? 'SW' : direction}_000`, x, y, width:128, height:128, atlasWidth:2048, atlasHeight:2048 };
}

export function portraitHtml(save, direction = 'SW') {
  const p = getHeroPortrait(save, direction);
  const enabled = paperdollEnabled();
  if (enabled) installPaperdollPortraits();
  const parts = enabled ? ` data-paperdoll-fallback="${p.url}" data-paperdoll="${escape(JSON.stringify(equipmentVisual(save)))}"` : '';
  const canvas = enabled ? '<canvas width="128" height="128" style="width:100%;height:100%" hidden></canvas>' : '';
  const enhance = Math.min(10, equippedItem(save, 'weapon')?.enhance || 0);
  const kit = ITEMS[equippedItem(save, 'weapon')?.id]?.family || 'blade';
  // With paperdoll art the glow is drawn from the weapon silhouette once composed (pending until then).
  const glow = enhance >= 6 ? `<span class="portrait-weapon-glow" data-enhance="${enhance}" data-kit="${kit}"${enabled ? ' data-pending' : ''} aria-hidden="true">${enabled ? '<canvas width="128" height="128"></canvas>' : ''}<i></i><i></i><i></i><i></i><i></i><i></i></span>` : '';
  return `<div class="sprite p2-hero" data-direction="${p.frame.split('_')[1]}"${parts} role="img" aria-label="현재 장비의 기사" style="background-image:${enabled ? 'none' : `url('${p.url}')`};background-position:-${p.x}px -${p.y}px;background-size:${p.atlasWidth}px ${p.atlasHeight}px">${canvas}${glow}</div>`;
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
  const rows = [row('family', '종류', def.family ? {blade:'검',bow:'활',focus:'지팡이'}[def.family] : {light:'경갑',medium:'중갑',heavy:'판금'}[def.armorClass] || SLOT_NAMES[def.slot]),
    row('rarity', '등급', GRADES[def.rarity]),
    def.power !== undefined ? row('attack', '공격 배율', `×${amount(def.power * mult)}`) : row('ac', '방어력', item.enhance ? `${def.ac || 0} +${item.enhance}` : `${def.ac || 0}`),
    row('weight', '무게', `${amount(effectiveWeight(item))} kg`),
    ...(def.requiredStr ? [row('str', '필요 힘', def.requiredStr)] : [])];
  const affixes = (item.affixes || []).map(({k,v}) => row(k, AFFIX_LABELS[k] || k, `+${amount(v)}${AFFIX_UNITS[k] ? `${AFFIX_UNITS[k] === '%' ? '' : ' '}${AFFIX_UNITS[k]}` : ''}`));
  return `<section class="item-details"><dl class="p2-lines">${rows.join('')}${affixes.join('')}</dl></section>`;
}
