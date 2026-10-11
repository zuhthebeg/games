import { REGIONS, REGION_EDGES, mapUnlocked, mapState, availableStages, regionFor } from '../content/world-map.js';
import { BALANCE, attackRate } from '../content/balance.js';
import { unlockedThreat, clearedThreat, selectThreat } from '../meta/run.js';
import { SLOTS, ECONOMY } from '../meta/economy.js';
import { shopStock, buyGear, sellItem, refreshShop, refreshPrice, gearPrice, stackSellPrice, sellStack } from '../meta/shop.js';
import { compareItems } from '../meta/compare.js';
import { STAGES, ABILITIES } from '../content/combat.js';
import { BOOKS, DEFAULT_SKILLS, hasSkill, equippedSkill, learnSkill, equipSkill, SKILL_DISPLAY, characterSkills } from '../meta/skills.js';
import { loadEffects } from '../sim/world.js';
import { QUESTIONS, resolve, FAMILIES, WEAPON_NAMES } from '../meta/quiz.js';
import { STAT_KEYS, STAT_NAMES, cap, deriveMods, allocateStats } from '../meta/stats.js';
import { xpSpan, MAX_LEVEL } from '../meta/progression.js';
import {
  ITEMS, RECIPES, equippedItem, carriedWeight, capacity,
  buy, equip, craft, dismantle, dismantleRefund, dismantleStones, shopPrice, moveConsumable,
} from '../meta/items.js';
import { enchant, enchantPreview, scrollsFor, craftScroll, crackGreaterStone } from '../meta/enchant.js';
import { ENCHANT, STONE, GREATER_STONE, SCROLLS } from '../meta/economy.js';
import { createSave } from '../meta/save.js';
import { icon, itemIcon } from './icons.js';
import { playEnchantFx, ritualCircleHtml } from './enchant-fx.js';
import {
  escape, amount, itemLabel, emblem, isWorn, SLOT_NAMES, GRADES, GRADE_ORDER,
  linesHtml, comparisonFor, cardHtml, portraitHtml, socketsHtml, itemDetailsHtml,
} from './gear-view.js';

export { getHeroPortrait } from './gear-view.js';

const button = (label, action, extra = '', disabled = false) =>
  `<button type="button" data-action="${action}" ${extra} ${disabled ? 'disabled' : ''}>${label}</button>`;

const sellPrice = item => Math.floor(gearPrice(item) * ECONOMY.sellFraction);
const SUPPLIES = ['potion', 'mana_potion', 'return_scroll'];
const pct = (value) => `${Math.round(value * 100)}%`;

// Static inn interior (ui-mock "잿빛 여관"); the hero portrait and five sockets sit on top of it.
const ROOM_ART = `<svg class="room-art" viewBox="0 0 358 250" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  <defs><pattern id="inn-floor" width="80" height="30" patternUnits="userSpaceOnUse" patternTransform="skewX(-25)">
    <rect width="80" height="30" fill="#292822"/><path d="M0 0h80v30H0z" stroke="#403d32" stroke-width="1"/></pattern></defs>
  <path d="M0 0h358v172L180 239 0 174z" fill="#20231e"/>
  <path d="M0 174 178 118 358 172v78H0z" fill="url(#inn-floor)"/>
  <path d="M0 19 179 0l179 19M40 0v153M312 0v153M0 105l178-28 180 28" stroke="#4c493a" fill="none" stroke-width="10"/>
  <path d="M149 29h69v110h-69z" fill="#413e33" stroke="#6c6450" stroke-width="3"/>
  <path d="M160 83q24-33 47 0v48h-47z" fill="#141712"/>
  <path class="hearth-flame" d="M173 125q-8-18 4-32-2 17 8 15 9-9 6-21 22 22 8 39z" fill="#c18a4f"/>
  <path d="M181 125q-5-12 6-22 10 11 5 22z" fill="#efcc88"/>
  <path d="M148 139h74M141 145h88" stroke="#78705b" stroke-width="6"/>
  <path d="M20 119 92 113l21 25-72 8z" fill="#4a4030" stroke="#8a7250"/>
  <path d="m40 147 2 28m60-35 1 29" stroke="#4a4030" stroke-width="8"/>
  <path d="M268 117h55v43h-55z" fill="#3a3226" stroke="#8a7250"/>
  <path d="M274 126h42m-42 9h28m-28 9h34" stroke="#beaa7e"/>
  <path d="m115 217 58-24 64 20-59 27z" fill="#574936" stroke="#7c674b"/></svg>`;

// The save schema intentionally has no transient HP/MP fields.
export function restoreInnVitals(player) {
  if (!player) return;
  player.hp = player.maxHp;
  player.mp = player.maxMp;
}

export function weightDescription(weight, limit) {
  const ratio = weight / limit;
  const effects = loadEffects(ratio);
  if (ratio < 0.8) return { tier: 'light', text: '가벼움 · 기동성 정상' };
  if (ratio <= 1) return { tier: 'loaded', text: '짐이 많음 · 회피 재사용 +15%' };
  return {
    tier: 'heavy',
    text: `과중량 · 이동 −${Math.round((1 - effects.speed) * 100)}% · 회피 재사용 +30%`,
  };
}

export class HubUI {
  constructor({ save, persist, startRound, resetSave, onOverlay, recoverVitals = () => {} }) {
    this.save = save;
    this.persist = persist;
    this.startRound = startRound;
    this.resetSave = resetSave;
    this.onOverlay = onOverlay;
    this.recoverVitals = recoverVitals;
    this.selectedUid = null;
    this.root = document.querySelector('#meta-screen');
    this.dev = new URLSearchParams(location.search).get('dev') === '1';
    this.answers = [];
    this.name = '';
    this.receipt = save?.lastReceipt ?? null;
    this.pendingReceipt = null;
    this.panel = null;
    this.resetStep = 0;
    this.draft = {};
    this.shopId = 'potion';
    this.shopCount = 1;
    this.root.addEventListener('click', (event) => {
      const target = event.target.closest('[data-action]');
      if (!target || target.disabled) return;
      try {
        this.action(target.dataset.action, target.dataset);
      } catch (error) {
        this.error(error.message);
      }
    });
    // Long-press on a bag card opens the same comparison sheet as a tap (mock §7.3).
    let pressTimer;
    let pressOrigin;
    this.root.addEventListener('pointerdown', (event) => {
      const node = event.target.closest('[data-action="open-item"]');
      if (!node || node.disabled) return;
      pressOrigin = { x: event.clientX, y: event.clientY };
      pressTimer = setTimeout(() => this.action('open-item', node.dataset), 500);
    });
    this.root.addEventListener('pointermove', (event) => {
      if (pressOrigin && Math.hypot(event.clientX - pressOrigin.x, event.clientY - pressOrigin.y) > 8) clearTimeout(pressTimer);
    });
    for (const type of ['pointerup', 'pointercancel']) this.root.addEventListener(type, () => clearTimeout(pressTimer));
    this.root.addEventListener('submit', (event) => {
      event.preventDefault();
      if (event.target.id !== 'name-form') return;
      const name = new FormData(event.target).get('name').trim();
      if (Array.from(name).length < 1 || Array.from(name).length > 12) {
        this.error('이름은 1~12자입니다.');
        return;
      }
      this.name = name;
      this.showQuiz();
    });
    this.root.addEventListener('change', (event) => {
      if (event.target.id !== 'shop-count') return;
      this.shopCount = Math.max(1, Math.min(99, Number(event.target.value) || 1));
      this.showShop();
    });
  }

  ready() {
    if (this.save) this.showInn();
    else this.showIntro();
  }

  show(html, page, { shell = false } = {}) {
    this.enchantFx?.close();
    this.root.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
    this.onOverlay();
    document.querySelector('#hud').hidden = true;
    this.root.hidden = false;
    this.root.dataset.page = page;
    this.root.classList.toggle('shell-mode', shell);
    this.root.innerHTML = html;
    this.root.scrollTop = 0;
    this.sheetOrigin = null;
    const heading = this.root.querySelector('h1, h2');
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
  }

  error(message) {
    const node = this.root.querySelector('dialog[open] #sheet-error') || this.root.querySelector('#meta-error');
    if (node) node.textContent = message;
  }

  commit(next) {
    this.persist(next);
    this.save = next;
  }

  // --- Story panels (intro, name, quiz) keep the centred card layout. ---

  panelHtml(title, content, eyebrow = '') {
    return `<div class="story-panel">${eyebrow ? `<p class="eyebrow">${eyebrow}</p>` : ''}<h2>${title}</h2>${content}
      <p id="meta-error" role="alert"></p></div>`;
  }

  showIntro() {
    this.show(this.panelHtml('문 너머의 불빛', `
      <p class="story">이세계로 소환되었다.<br>낯선 하늘 아래, 꺼지지 않은 여관의 불빛이 보인다.<br>
      손등의 인장이 당신에게 이름을 묻는다.</p>
      ${button('인장에 이름 새기기', 'name')}`, 'UNTITLED · M1'), 'intro');
  }

  showName() {
    this.show(this.panelHtml('어떤 이름으로 불릴까', `
      <form id="name-form"><label for="hero-name">이름 · 1~12자</label>
      <input id="hero-name" name="name" autocomplete="off" maxlength="24" required>
      <button type="submit" id="name-next">기억을 따라가기</button></form>`), 'name');
    this.root.querySelector('input').focus();
  }

  showQuiz() {
    const index = this.answers.length;
    const question = QUESTIONS[index];
    const dots = QUESTIONS.map((_, position) =>
      `<i class="${position <= index ? 'lit' : ''}" aria-hidden="true"></i>`).join('');
    const choices = question.options.map((option, choice) =>
      button(escape(option.text), 'answer', `data-choice="${choice}" class="quiz-option"`)).join('');
    this.show(this.panelHtml(escape(question.text), `
      <div class="quiz-dots" aria-label="문답 ${index + 1} / 5">${dots}</div>
      <div class="choice-list">${choices}</div>`, `소환 문답 · ${index + 1} / 5`), 'quiz');
  }

  showQuizResult() {
    const result = resolve(this.answers);
    this.chosenWeapon ??= result.weapon;
    const bars = STAT_KEYS.map((key) => `
      <div class="stat-preview"><span>${STAT_NAMES[key]}</span><meter min="0" max="3"
      value="${result.points[key]}"></meter><b>5 + ${result.points[key]}</b></div>`).join('');
    const choices = FAMILIES.map((family) => button(WEAPON_NAMES[family], 'override',
      `data-family="${family}" aria-pressed="${family === this.chosenWeapon}"`)).join('');
    this.show(this.panelHtml('인장이 응답했다', `
      <p>${escape(this.name)}, 당신에게 이끌린 무기는 <b>${WEAPON_NAMES[result.weapon]}</b>.</p>
      ${bars}<p class="muted">초기 능력치 6점은 그대로 유지된다. 무기만 바꿀 수 있다.</p>
      <div class="weapon-choices">${choices}</div>
      ${button('소환 시험으로 · 30초', 'create', 'id="quiz-start"')}`), 'quiz-result');
  }

  // --- Brass-ledger shell: header → scrolling content → one primary action. ---

  money() {
    return `<span class="money" id="inn-gold" aria-label="골드 ${this.save.gold}">${icon('gold')}${this.save.gold}</span>`;
  }

  topBar() {
    const save = this.save;
    const ratio = save.level === MAX_LEVEL ? 1 : save.xp / xpSpan(save.level);
    return `<header class="game-header"><div class="identity"><span class="seal" aria-hidden="true">${save.level}</span>
      <div><strong id="inn-name">${escape(save.name)} <span class="muted" id="inn-level">Lv.${save.level}</span></strong>
      <div class="xp-line" role="meter" aria-label="경험치" aria-valuemin="0" aria-valuemax="100"
        aria-valuenow="${Math.round(ratio * 100)}"><i style="width:${ratio * 100}%"></i></div></div></div>
      ${this.money()}
      <button type="button" data-sound-toggle class="icon-button" aria-label="음소거" aria-pressed="false">${icon('sound')}</button>
      ${button(icon('settings'), 'settings', 'class="icon-button" aria-label="설정"')}</header>`;
  }

  panelHeader(title, eyebrow, back) {
    return `<header class="game-header panel-header">${back ? button(icon('back'), back, 'class="icon-button back-button" aria-label="뒤로"') : ''}
      <div>${eyebrow ? `<small>${escape(eyebrow)}</small>` : ''}<h2>${escape(title)}</h2></div>${this.money()}</header>`;
  }

  shellHtml(header, content, footer = '') {
    return `<div class="inn-shell">${header}<div class="content">${content}<p id="meta-error" role="alert"></p></div>`
      + `${footer ? `<footer class="action-footer">${footer}</footer>` : ''}</div>`;
  }

  showInnPanel(title, content, panel, footer = '', { eyebrow = '', back = 'inn' } = {}) {
    this.panel = panel;
    this.show(this.shellHtml(this.panelHeader(title, eyebrow, back), content, footer), panel, { shell: true });
  }

  weightHtml(weight = carriedWeight(this.save), limit = capacity(this.save)) {
    const tier = weightDescription(weight, limit);
    return `<div class="p2-weight ${tier.tier}"><span>${icon('load')}소지 <b>${amount(weight)} / ${amount(limit)} kg</b></span>`
      + `<meter min="0" max="${limit * 1.2}" low="${limit * 0.8}" high="${limit}" optimum="0" value="${weight}" aria-label="소지 무게"></meter><small>${tier.text}</small></div>`;
  }

  // --- Inn: the room shows the hero with five equipment sockets; NPCs sit below. ---

  showInn() {
    this.panel = null;
    this.recoverVitals();
    const mods = deriveMods(this.save);
    const pins = SLOTS.map(slot => `<i class="pin-${slot} ${equippedItem(this.save, slot) ? 'worn' : ''}"></i>`).join('');
    const portrait = button(`${portraitHtml(this.save)}${this.save.statPoints ? `<b class="badge alert">${this.save.statPoints}</b>` : ''}`, 'character',
      `class="character-portrait" aria-label="캐릭터${this.save.statPoints ? ` · 미분배 ${this.save.statPoints}점` : ''}"`);
    const room = `<div class="p2-room">${ROOM_ART}${portrait}<div class="body-sockets" aria-hidden="true">${pins}</div>${socketsHtml(this.save)}</div>`;
    const npcs = [
      ['shop', '만물상', 'potion'], ['merchant', '장비상', 'weapon'], ['forge', '대장장이', 'forge'],
      ['trainer', '교관', 'trainer'], ['inventory', '창고', 'load'], ['bag', '가방', 'load'],
    ].map(([action, name, glyph]) => button(`${icon(glyph)}<strong>${name}</strong>`, action, `class="hotspot hotspot-${action}"`)).join('');
    const devMenu = this.dev ? `<details class="dev-menu"><summary>M0 개발 메뉴</summary>
      <label>무기<select id="dev-weapon">${FAMILIES.map(family => `<option value="${family}">${family}</option>`).join('')}</select></label>
      <label>스테이지<select id="dev-stage">${Object.keys(STAGES).map(id => `<option>${id}</option>`).join('')}</select></label>
      ${button('개발 전투 확인', 'dev-start')}</details>` : '';
    const content = `<h1 class="sr-only">잿빛 여관</h1>${room}
      <p class="recovery inn-recovery">${icon('clear')}<strong>HP·MP 회복</strong>
        <span>HP <b>${amount(mods.maxHp)}</b> · 공격 <b>×${amount(mods.dmgMult[mods.family])}</b></span></p>
      ${this.weightHtml()}<nav class="npc-grid" aria-label="여관 사람들">${npcs}</nav>${devMenu}`;
    this.show(this.shellHtml(this.topBar(), content, button(`<span>퀘스트 고르기</span>${icon('depart')}`, 'board', 'class="primary"')), 'inn', { shell: true });
  }

  characterHtml() {
    const mods = deriveMods(this.save);
    const weight = carriedWeight(this.save), limit = capacity(this.save);
    const rate = attackRate(mods.attackSpeedBonus, mods.weaponWeight, weight / limit);
    return `<section class="character-summary"><h3>${escape(this.save.name)} · Lv.${this.save.level}</h3>
      <p class="minor">XP ${amount(this.save.xp)} / ${this.save.level === MAX_LEVEL ? 'MAX' : xpSpan(this.save.level)}</p>
      <div class="ledger"><div><span>HP / MP</span><b>${amount(mods.maxHp)} / ${amount(mods.maxMp)}</b></div>
      <div><span>공격 배율</span><b>×${amount(mods.dmgMult[mods.family])}</b></div>
      <div><span>공격 속도</span><b>×${amount(rate)}</b></div>
      <div><span>장착 기술</span><b>${escape(ABILITIES[equippedSkill(this.save, mods.family)].name)}</b></div></div>${this.weightHtml()}</section>
      <h3 class="section-title">능력치 분배</h3>`;
  }

  // --- Bag / weightless stash ---

  stackRowsHtml(stacks, { source = 'bag', sell = false, destination = null, kind = null } = {}) {
    const rows = Object.entries(stacks).filter(([id, count]) => count > 0 && (!kind || ITEMS[id].kind === kind)).map(([id, count]) => {
      const args = `data-id="${id}" data-source="${source}"${destination ? ` data-destination="${destination}"` : ''}`;
      const controls = (sell || destination) ? `<div class="stack-counts" role="group" aria-label="${ITEMS[id].name} ${sell ? '판매' : '이동'} 수량">${[1, 5, count].map((n, i) =>
        button(i === 2 ? '전부' : String(n), sell ? 'sell-stack' : 'move-stack', `${args} data-count="${n}"`, n > count)).join('')}</div>` : '';
      return `<article class="stack-row"><div class="stack-heading"><span class="item-emblem">${itemIcon(id, ITEMS[id])}</span>
        <div><strong>${ITEMS[id].name}</strong><small>${count}개${sell ? ` · 개당 ${stackSellPrice(id)} G` : destination ? ` · ${destination === 'stash' ? '창고로 맡기기' : '가방으로 꺼내기'}` : ''}</small></div></div>${controls}</article>`;
    }).join('');
    return `<div class="stack-list">${rows || '<p class="muted">보관 중인 물품이 없다.</p>'}</div>`;
  }

  showBag() {
    const worn = SLOTS.map(slot => {
      const item = equippedItem(this.save, slot);
      return button(`<span>${SLOT_NAMES[slot]}</span><strong>${item ? escape(itemLabel(item)) : '비어 있음'}</strong>`, 'socket', `data-slot="${slot}" class="bag-equipped"`);
    }).join('');
    this.showInnPanel('가방', `${this.weightHtml()}<h3 class="section-title">착용 장비</h3><div class="bag-equipment">${worn}</div>
      <h3 class="section-title">소지 소모품</h3><p class="minor">사냥에 가져갈 보급 · 수량을 눌러 창고로 맡기기</p>
      ${this.stackRowsHtml(this.save.stacks, { destination: 'stash', kind: 'consumable' })}`, 'bag', '', { eyebrow: '출정 시 가져가는 물품' });
  }

  showInventory() {
    this.stashTab ??= 'gear';
    const tabs = [['gear', '장비'], ['material', '재료'], ['consumable', '소모품']].map(([tab, label]) =>
      button(label, 'stash-tab', `data-tab="${tab}" aria-pressed="${this.stashTab === tab}"`)).join('');
    const tabHtml = `<div class="p2-merchant-tabs" role="group" aria-label="창고 종류">${tabs}</div>`;
    if (this.stashTab !== 'gear') {
      const supplies = this.stashTab === 'consumable';
      return this.showInnPanel('창고', `${tabHtml}<p class="minor">${supplies ? '수량을 눌러 가방으로 꺼내기 · 소지 무게 100%까지' : '제작·강화 재료 · 소지 무게에 포함하지 않음'}</p>
        ${this.stackRowsHtml(supplies ? this.save.stash.stacks : this.save.stacks, { source: supplies ? 'stash' : 'bag', kind: this.stashTab, destination: supplies ? 'bag' : null })}`,
      'inventory', '', { eyebrow: '창고 · 무게 없음' });
    }
    this.filter ??= 'all';
    this.sort ??= 'grade';
    const items = this.save.items.filter(item => !isWorn(this.save, item.uid) && (this.filter === 'all' || ITEMS[item.id].slot === this.filter));
    const rank = item => GRADE_ORDER.indexOf(ITEMS[item.id].rarity);
    items.sort((a, b) => {
      if (this.sort === 'weight') return ITEMS[a.id].weight - ITEMS[b.id].weight;
      if (this.sort === 'recent') return this.save.items.indexOf(b) - this.save.items.indexOf(a);
      return rank(b) - rank(a) || b.enhance - a.enhance;
    });
    const filters = ['all', ...SLOTS].map(slot => button(slot === 'all' ? '전체' : SLOT_NAMES[slot], 'filter',
      `data-slot="${slot}" aria-pressed="${this.filter === slot}"`)).join('');
    const cards = items.map(item => cardHtml(item, this.save, { compact: true, note: isWorn(this.save, item.uid) ? '착용 중' : '' })).join('');
    this.showInnPanel('창고', `${tabHtml}<div class="p2-filters" role="group" aria-label="부위">${filters}</div>
      <div class="p2-toolbar"><span>${items.length}개</span>${button(`정렬 · ${{ grade: '등급', recent: '최근', weight: '무게' }[this.sort]}`, 'sort')}</div>
      <div class="p2-grid">${cards || '<p class="muted">비어 있음 · 몬스터 드랍이나 장비상에서 얻는다</p>'}</div>
      <p class="minor">탭하면 착용 장비와 비교 · 착용 중인 장비는 가방에 표시</p>`, 'inventory', '', { eyebrow: '창고 · 무게 없음' });
  }

  // --- Comparison sheet: current → candidate per line, then one primary action. ---

  dialogHtml(title, body, footer = '') {
    return `<dialog class="p2-sheet" aria-label="${escape(title)}"><header><h2>${escape(title)}</h2>${button(icon('back') + '닫기', 'close-sheet', 'class="sheet-close"')}</header>`
      + `<div class="p2-sheet-body">${body}<p id="sheet-error" role="alert"></p></div>${footer ? `<footer>${footer}</footer>` : ''}</dialog>`;
  }

  mountSheet(html) {
    const origin = this.sheetOrigin || document.activeElement;
    this.root.querySelector('dialog')?.close();
    this.root.querySelector('dialog')?.remove();
    this.root.insertAdjacentHTML('beforeend', html);
    const dialog = this.root.querySelector('dialog');
    this.sheetOrigin = origin;
    dialog.addEventListener('close', () => {
      if (this.root.querySelector('dialog[open]')) return;
      if (origin?.isConnected) origin.focus({ preventScroll: true });
      this.sheetOrigin = null;
    });
    dialog.showModal();
  }

  closeSheet() {
    this.root.querySelector('dialog[open]')?.close();
  }

  comparisonHtml(item) {
    const comparison = comparisonFor(item, this.save);
    return `${linesHtml(comparison)}<div class="p2-weight-after" data-weight-after="${comparison.weightAfter}">장착 후 소지 <b>${amount(comparison.weightAfter)} / ${amount(comparison.weightLimit)} kg</b>`
      + `<small>${weightDescription(comparison.weightAfter, comparison.weightLimit).text}</small></div>`
      + `${comparison.locked ? `<p class="p2-lock">${icon('lock')}장착 불가 · ${escape(comparison.lockReason)}</p>` : ''}`;
  }

  showSocket(slot) {
    const current = equippedItem(this.save, slot);
    const items = this.save.items.filter(item => ITEMS[item.id].slot === slot && item.uid !== current?.uid);
    const head = current
      ? `<div class="p2-item-heading">${emblem(current)}<div><h3>${escape(itemLabel(current))}</h3><small>착용 중 · ${GRADES[ITEMS[current.id].rarity]}</small></div></div>`
      : `<p class="minor">${SLOT_NAMES[slot]} · 비어 있음</p>`;
    const list = items.map(item => cardHtml(item, this.save)).join('')
      || `<p class="muted">교체할 ${SLOT_NAMES[slot]} 장비 없음</p>`;
    this.mountSheet(this.dialogHtml(`${SLOT_NAMES[slot]} 장비`, `${head}${current ? itemDetailsHtml(current) + this.comparisonHtml(current) : ''}<h3>장비 변경 · 보유 목록</h3><div class="p2-stock">${list}</div>`,
      button(`${icon('weapon')}장비상 둘러보기`, 'merchant', `data-tab="${slot === 'weapon' ? 'weapon' : 'armor'}"`)));
  }

  findOffer(uid) {
    return shopStock(this.save.createdAt >>> 0, this.save.shopRefresh).find(item => item.uid === uid);
  }

  openItem(uid, mode = 'equip') {
    const item = mode === 'buy' ? this.findOffer(uid) : this.save.items.find(candidate => candidate.uid === uid);
    if (!item) throw new Error('장비를 찾을 수 없습니다.');
    this.selectedUid = mode === 'buy' ? this.selectedUid : uid;
    const def = ITEMS[item.id];
    const comparison = comparisonFor(item, this.save);
    const worn = isWorn(this.save, uid);
    const current = equippedItem(this.save, def.slot);
    const args = `data-uid="${escape(uid)}"`;
    let footer;
    if (mode === 'buy') {
      const sold = this.save.shopBought.includes(uid);
      const short = this.save.gold < item.price;
      footer = button(sold ? '품절' : short ? `골드 부족 · ${item.price} G` : `구매 · ${item.price} G`, 'buy-gear', `${args} class="primary"`, sold || short);
    } else if (mode === 'sell') {
      footer = button(`판매 · ${sellPrice(item)} G`, 'sell-shop', `${args} class="primary"`, worn);
    } else {
      const label = worn ? '착용 중' : comparison.locked ? `장착 불가 · ${comparison.lockReason}` : '장착';
      footer = `<div class="p2-two">${button(`판매 ${sellPrice(item)} G`, 'sell', args, worn)}`
        + `${button(`분해 · 고철 ${dismantleRefund(item)}`, 'dismantle', `${args} class="quiet-danger"`, worn)}</div>`
        + button(label, 'equip', `${args} class="primary"`, worn || comparison.locked);
    }
    const otherFamily = def.family && current && ITEMS[current.id].family !== def.family;
    const body = `<div class="p2-item-heading">${emblem(item)}<div><h3>${escape(itemLabel(item))}</h3>`
      + `<small>${GRADES[def.rarity]} · ${SLOT_NAMES[def.slot]}${def.requiredStr ? ` · 힘 ${def.requiredStr}` : ''} · ${def.weight} kg</small></div></div>`
      + ` ${itemDetailsHtml(item)}<p class="compare-from">${current ? escape(itemLabel(current)) : '빈 슬롯'} → 이것</p>${this.comparisonHtml(item)}`
      + `${otherFamily ? '<p class="p2-hint">다른 무기 계열 · 조작이 바뀐다</p>' : ''}`
      + `${mode === 'buy' ? `<p class="minor">구매 후 ${this.save.gold - item.price} G · 창고 보관</p>` : ''}`;
    this.mountSheet(this.dialogHtml({ buy: '구매 전 비교', sell: '매입', equip: '장비 비교' }[mode], body, footer));
  }

  confirmDismantle(uid) {
    const item = this.save.items.find(candidate => candidate.uid === uid);
    if (!item || isWorn(this.save, uid)) throw new Error('착용 장비는 분해할 수 없습니다.');
    this.mountSheet(this.dialogHtml('분해', `<div class="p2-item-heading">${emblem(item)}<div><h3>${escape(itemLabel(item))}</h3>`
      + `<small>${this.dismantleText(item)} · 되돌릴 수 없음</small></div></div>`,
    `<div class="p2-two">${button('취소', 'close-sheet')}${button(`분해 · ${this.dismantleText(item)}`, 'confirm-dismantle', `data-uid="${escape(uid)}" class="quiet-danger"`)}</div>`));
  }

  dismantleText(item) {
    const stones = dismantleStones(item);
    return [`고철 ${dismantleRefund(item)}`, stones[STONE] && `강화석 ${stones[STONE]}`, stones[GREATER_STONE] && `상급 강화석 ${stones[GREATER_STONE]}`]
      .filter(Boolean).join(' · ');
  }

  // --- Merchant: seeded stock, paid refresh, 25% buy-back. ---

  gearShopHtml() {
    const mode = this.merchantTab || 'weapon';
    const bought = this.save.shopBought;
    const stock = mode === 'sell'
      ? this.save.items.filter(item => !isWorn(this.save, item.uid))
      : shopStock(this.save.createdAt >>> 0, this.save.shopRefresh)
        .filter(item => (mode === 'weapon') === (ITEMS[item.id].slot === 'weapon'));
    const cards = stock.map(item => cardHtml(item, this.save, {
      extra: `data-mode="${mode === 'sell' ? 'sell' : 'buy'}"`,
      note: mode === 'sell' ? `매입 ${sellPrice(item)} G` : bought.includes(item.uid) ? '품절' : `${item.price} G`,
      disabled: mode !== 'sell' && bought.includes(item.uid),
    })).join('');
    const tabs = [['weapon', '무기'], ['armor', '방어구'], ['sell', '매입']].map(([tab, label]) =>
      button(label, 'merchant-tab', `data-tab="${tab}" aria-pressed="${mode === tab}"`)).join('');
    const cost = refreshPrice(this.save);
    return `<div class="p2-merchant-tabs" role="group" aria-label="상점 종류">${tabs}</div>
      ${mode === 'sell' ? '<p class="minor">구매가의 25% · 착용 장비 제외</p>' : `<div class="p2-refresh"><span>새 물건까지 ${3 - this.save.completedRounds % 3}판</span>${button(`${icon('gold')}${cost} G 갱신`, 'refresh-shop', '', this.save.gold < cost)}</div>`}
      <div class="p2-stock">${cards || '<p class="muted">팔 장비가 없다</p>'}</div>`;
  }

  showMerchant() {
    this.showInnPanel('장비상', this.gearShopHtml(), 'merchant', '', { eyebrow: '일반 · 양질만 취급' });
  }

  // --- Supply shop ---

  showShop() {
    this.shopTab ??= 'buy';
    const tabs = `<div class="p2-two" role="group" aria-label="만물상 거래">${[['buy', '구매'], ['sell', '판매']].map(([tab, label]) =>
      button(label, 'shop-tab', `data-tab="${tab}" aria-pressed="${this.shopTab === tab}"`)).join('')}</div>`;
    if (this.shopTab === 'sell') {
      return this.showInnPanel('만물상', `${tabs}<p class="minor">수량을 눌러 판매 · 장비 매입은 장비상에서</p>
        <h3 class="section-title">가방 소모품</h3>${this.stackRowsHtml(this.save.stacks, { sell: true, kind: 'consumable' })}
        <h3 class="section-title">창고 소모품</h3>${this.stackRowsHtml(this.save.stash.stacks, { sell: true, source: 'stash' })}
        <h3 class="section-title">창고 재료</h3>${this.stackRowsHtml(this.save.stacks, { sell: true, kind: 'material' })}`,
      'shop', '', { eyebrow: '보급 · 재료 매입' });
    }
    const price = shopPrice(this.save, this.shopId) * this.shopCount;
    const weight = carriedWeight(this.save) + ITEMS[this.shopId].weight * this.shopCount;
    const limit = capacity(this.save);
    const tooMany = this.shopId === 'return_scroll' && (this.save.stacks.return_scroll || 0) + this.shopCount > 2;
    const disabled = this.save.gold < price || weight > limit || tooMany;
    const reason = this.save.gold < price ? '골드 부족' : tooMany ? '귀환서는 최대 2장' : weight > limit ? '소지 무게 100% 초과 · 창고에 맡겨 주세요' : '';
    const tone = { potion: 'hp-tone', mana_potion: 'mp-tone' };
    const cards = SUPPLIES.map(id => button(`<span class="item-emblem ${tone[id] || ''}">${itemIcon(id, ITEMS[id])}</span>`
      + `<span class="item-name"><strong>${ITEMS[id].name}</strong><small>보유 ${this.save.stacks[id] || 0}${id === 'return_scroll' ? ' / 2' : ''}</small></span>`
      + `<span class="item-price">${shopPrice(this.save, id)} G</span>`, 'shop-select',
    `data-id="${id}" class="shop-item" aria-pressed="${id === this.shopId}"`)).join('');
    const tier = weightDescription(weight, limit);
    this.showInnPanel('만물상', `${tabs}<p class="npc-line">“돌아올 몫까지 챙겨 가게.”</p><p class="minor">소모품은 가방에 바로 넣는다 · 소지 무게 100%까지</p><div class="shop-items">${cards}</div>
      <div class="quantity-row"><label for="shop-count">수량</label><div class="stepper">
        ${button('−', 'shop-count', 'data-step="-1" aria-label="수량 줄이기"', this.shopCount <= 1)}
        <input id="shop-count" type="number" inputmode="numeric" value="${this.shopCount}" min="1" max="99">
        ${button('+', 'shop-count', 'data-step="1" aria-label="수량 늘리기"', this.shopCount >= 99)}</div></div>
      <div class="ledger"><div><span>총액</span><strong><span id="shop-total">${price}</span> G</strong></div>
        <div><span>구매 후 골드</span><b class="${this.save.gold < price ? 'loss' : ''}">${this.save.gold - price} G</b></div>
        <div><span>구매 후 소지</span><b class="${tier.tier === 'light' ? '' : 'loss'}">${amount(weight)} / ${amount(limit)} kg</b></div></div>
      <p class="safe-note ${tier.tier === 'light' ? '' : 'loss'}">${icon(tier.tier === 'light' ? 'clear' : 'lock')}${tier.text}</p>`,
    'shop', button(disabled ? reason : `${price} G · 구매`, 'buy', 'id="shop-buy" class="primary"', disabled), { eyebrow: '보급' });
  }

  // --- Forge workspaces: enchant ritual, scroll workshop, crafting and salvage. ---

  showForge() {
    const items = this.save.items.slice().sort((a, b) => Number(isWorn(this.save, b.uid)) - Number(isWorn(this.save, a.uid)));
    this.selectedUid ??= this.save.equipped.weapon;
    if (!items.some(item => item.uid === this.selectedUid)) this.selectedUid = this.save.equipped.weapon;
    const worn = SLOTS.map(slot => {
      const item = equippedItem(this.save, slot);
      return `<span data-slot="${slot}" class="${item ? '' : 'muted'}">${SLOT_NAMES[slot]} ${item ? `+${item.enhance}` : '–'}</span>`;
    }).join('');
    const cards = items.map(item => cardHtml(item, this.save, {
      action: 'select-gear', compact: true,
      note: isWorn(this.save, item.uid) ? '착용 중' : '',
      extra: `aria-pressed="${item.uid === this.selectedUid}"`,
    })).join('');
    const recipes = Object.entries(RECIPES).map(([id, recipe]) => {
      const available = Object.entries(recipe).every(([key, count]) => (key === 'gold' ? this.save.gold : this.save.stacks[key] || 0) >= count);
      const parts = Object.entries(recipe).map(([key, count]) => `${key === 'gold' ? 'G' : ITEMS[key].name} ${count}`).join(' · ');
      return `<article class="recipe"><span class="item-emblem">${itemIcon(id, ITEMS[id])}</span><div><b>${ITEMS[id].name}</b><small>${parts}</small></div>`
        + `${button('제작', 'craft', `data-id="${id}"`, !available)}</article>`;
    }).join('');
    this.forgeTab ||= 'enhance';
    const { html, footer } = this.forgeDetail();
    const tabs = `<nav class="forge-tabs" aria-label="대장장이 작업">${[['enhance', '강화'], ['scrolls', '주문서 제작'], ['salvage', '제작·분해']].map(([tab, label]) => button(label, 'forge-tab', `data-tab="${tab}" aria-pressed="${this.forgeTab === tab}"`)).join('')}</nav>`;
    // Plain result line; the enchant animation layer replaces this presentation, not the outcome.
    // forgeNotice is one-shot; lastEnchant/lastCrack stay readable for the FX layer and debugging.
    const notice = this.forgeNotice;
    this.forgeNotice = null;
    const last = notice && !Number.isInteger(notice.count) ? notice : null, crack = notice && Number.isInteger(notice.count) ? notice : null;
    const noticeHtml = last ? (last.outcome === 'destroyed'
      ? `<p class="enchant-notice destroyed" role="status">${escape(ITEMS[last.id].name)} +${last.from} — 강렬하게 빛나더니 산산조각 났다. 강화석 ${last.refund[STONE]}개가 남았다.</p>`
      : `<p class="enchant-notice success" role="status">${escape(ITEMS[last.id].name)} +${last.from} → <b>+${last.to}</b> 강화 성공</p>`)
      : crack ? `<p class="enchant-notice success" role="status">${ITEMS[crack.id].name} ${crack.count}장을 얻었다.</p>` : '';
    const picker = `<div class="forge-selection"><div class="section-caption"><span>장비 선택</span><span>착용 장비 먼저 · 좌우로 넘기기</span></div><div class="forge-picker" role="group" aria-label="강화할 장비">${cards}</div></div>`;
    const content = this.forgeTab === 'scrolls' ? this.scrollWorkshopHtml()
      : this.forgeTab === 'salvage' ? `<p class="forge-worn" aria-label="착용 강화 단계">${worn}</p>${picker}${this.forgeSalvageHtml()}<section class="craft-list"><h3 class="section-title">제작 · 고철과 재료</h3><div class="recipe-grid">${recipes}</div></section>`
        : `${html}${picker}`;
    this.showInnPanel('대장장이', `${tabs}${noticeHtml}<div class="forge-tab-panel" data-forge-tab="${this.forgeTab}">${content}</div>`,
      'forge', this.forgeTab === 'enhance' ? footer : '', { eyebrow: `+${ENCHANT.safe}까지 안전 · 그 위는 파괴 위험` });
  }

  forgeSalvageHtml() {
    const item = this.save.items.find(candidate => candidate.uid === this.selectedUid);
    if (!item) return '<p class="minor">제작한 장비를 여기서 장착·분해·판매할 수 있습니다.</p>';
    const uid = `data-uid="${escape(item.uid)}"`, worn = isWorn(this.save, item.uid);
    return `<section class="forge-salvage"><div class="p2-item-heading">${emblem(item)}<h3>${escape(itemLabel(item))}</h3></div><div class="p2-three">${button('장착', 'equip', uid, worn || comparisonFor(item, this.save).locked)}${button(`분해 · ${this.dismantleText(item)}`, 'dismantle', `${uid} class="quiet-danger"`, worn)}${button(`판매 ${sellPrice(item)} G`, 'sell', uid, worn)}</div></section>`;
  }

  scrollWorkshopHtml() {
    const stones = this.save.stacks[STONE] || 0, greater = this.save.stacks[GREATER_STONE] || 0;
    const rows = Object.entries(SCROLLS).map(([family, ids]) => {
      const label = family === 'weapon' ? '무기' : '방어구';
      return `<article class="recipe scroll-recipe"><span class="item-emblem">${itemIcon(ids.normal, ITEMS[ids.normal])}</span>`
        + `<div><b>${ITEMS[ids.normal].name}</b><small>보유 ${this.save.stacks[ids.normal] || 0}장 · 축복 ${this.save.stacks[ids.blessed] || 0}장</small></div>`
        + `${button(`강화석 ${ENCHANT.stonesPerScroll} → 1장`, 'craft-scroll', `data-family="${family}"`, stones < ENCHANT.stonesPerScroll)}`
        + `${button(`상급 1 → ${ENCHANT.greaterYield.join('~')}장`, 'crack-greater', `data-family="${family}" aria-label="상급 강화석으로 ${label} 주문서 뽑기"`, greater < 1)}</article>`;
    }).join('');
    return `<section class="scroll-workshop"><h3 class="section-title">주문서 제작</h3>
      <p class="minor">${icon(STONE)}강화석 ${stones}개 · ${icon(GREATER_STONE)}상급 강화석 ${greater}개</p><div class="recipe-grid">${rows}</div></section>`;
  }

  forgeDetail() {
    const item = this.save.items.find(candidate => candidate.uid === this.selectedUid);
    if (!item) return { html: '', footer: '' };
    const uid = `data-uid="${escape(item.uid)}"`;
    const worn = isWorn(this.save, item.uid);
    const ids = scrollsFor(item);
    if (!this.forgeScroll || !Object.values(ids).includes(this.forgeScroll)) this.forgeScroll = ids.normal;
    if (!(this.save.stacks[this.forgeScroll] > 0) && this.save.stacks[ids.normal] > 0) this.forgeScroll = ids.normal;
    const preview = enchantPreview(this.save, item.uid, this.forgeScroll);
    const projected = { ...item, enhance: preview.maxed ? item.enhance : preview.outcomes[0] };
    const picker = Object.values(ids).map(id => `<button type="button" data-action="pick-scroll" data-id="${id}" aria-pressed="${id === this.forgeScroll}">`
      + `${itemIcon(id, ITEMS[id])}<span>${ITEMS[id].name}<small>보유 ${this.save.stacks[id] || 0}장</small></span></button>`).join('');
    const target = preview.maxed ? '' : preview.outcomes.length > 1 ? ` → +${preview.outcomes[0]}~+${preview.outcomes.at(-1)}` : ` → +${preview.outcomes[0]}`;
    const odds = preview.maxed ? '최대 강화'
      : preview.risky ? `성공 ${pct(preview.chance)} · 실패 시 장비 파괴 (강화석 ${preview.refund[STONE]}개 남음)`
        : `안전 구간 · 성공 확정${preview.blessed ? ' · 축복: 무작위 +1~+3 (최대 +' + ENCHANT.safe + ')' : ''}`;
    const html = `<section class="forge-work ${preview.risky ? 'risky' : ''} ${preview.blessed ? 'blessed' : ''}" aria-label="강화 의식">
      <div class="forge-item-title"><small>${worn ? '착용 중' : '보관 장비'} · ${GRADES[ITEMS[item.id].rarity]}</small><h3>${escape(ITEMS[item.id].name)}</h3></div>
      <div class="forge-ritual" aria-hidden="true">${ritualCircleHtml()}<span class="forge-hero-art" data-enhance="${Math.min(10, item.enhance)}">${itemIcon(item.id, ITEMS[item.id])}</span><span class="forge-tier">+${item.enhance}</span></div>
      <div class="forge-progress"><b>+${item.enhance}</b><span>→</span><strong>${preview.maxed ? 'MAX' : target.replace(' → ', '')}</strong></div>
      <strong class="forge-odds">${preview.maxed ? '최대 강화' : pct(preview.chance)}<span>${preview.maxed ? '' : ' 성공 확률'}</span></strong>
      <p class="forge-risk-band ${preview.risky && !preview.maxed ? 'loss' : ''}">${odds}</p>
      <div class="p2-stones scroll-picker" role="group" aria-label="사용할 주문서">${picker}</div>
      ${!preview.maxed && preview.have < 1 ? `<p class="p2-hint">주문서 부족 · ${button('주문서 제작으로', 'forge-tab', 'data-tab="scrolls"')}</p>` : ''}
      ${preview.maxed ? '' : `<details class="forge-preview"><summary>강화 후 능력치</summary>${linesHtml(compareItems(item, projected, this.save))}</details>`}</section>`;
    const label = preview.maxed ? '최대 강화' : preview.have < 1 ? '강화 불가 · 주문서 부족'
      : preview.risky ? `강화 · 성공 ${pct(preview.chance)} · 파괴 위험` : '강화 · 주문서 1장';
    return { html, footer: button(label, 'enhance', `${uid} data-scroll="${this.forgeScroll}" class="primary ${preview.risky ? 'danger' : ''}"`, preview.maxed || preview.have < 1) };
  }

  returnToPanel() {
    this.closeSheet();
    if (this.root.dataset.page === 'receipt') return this.showReceipt();
    if (this.panel === 'forge') return this.showForge();
    if (this.panel === 'merchant') return this.showMerchant();
    if (this.panel === 'inventory') return this.showInventory();
    if (this.panel === 'bag') return this.showBag();
    if (this.panel === 'character') return this.showAllocation(false);
    if (this.panel === 'shop') return this.showShop();
    return this.showInn();
  }

  // --- Skill books / character allocation ---

  characterTabs(tab) {
    return `<div class="p2-two" role="group" aria-label="캐릭터 탭">${[['stats','능력치'],['skills','기술']].map(([id,label]) => button(label, 'character-tab', `data-tab="${id}" aria-pressed="${tab === id}"`)).join('')}</div>`;
  }

  showCharacterSkills() {
    this.panel = 'character-skills';
    const rows = characterSkills(this.save).map(id => {
      const a = ABILITIES[id], selected = equippedSkill(this.save,a.family) === id;
      return button(`<strong>${escape(a.name)}</strong><span>${SKILL_DISPLAY[id].label} · ${WEAPON_NAMES[a.family]}${selected ? ' · 장착 중' : ''}</span>`, 'skill-detail', `data-id="${id}" data-grade="${SKILL_DISPLAY[id].grade}" class="character-skill"`);
    }).join('');
    this.showInnPanel('캐릭터', `${this.characterTabs('skills')}<p class="minor">등급 높은 순 · 교본 단계 표시이며 마법 서클이 아니다</p><div class="character-skills">${rows}</div>`, 'character-skills');
  }

  openSkill(id) {
    if (!SKILL_DISPLAY[id] || !hasSkill(this.save,id)) throw new Error('아직 배우지 않은 기술입니다.');
    const a = ABILITIES[id], p = a.projectile, shape = a.shape;
    const range = p ? `사거리 ${p.rangePx} px · ${p.count}발 · 관통 ${p.pierce}회${p.explode ? ` · 폭발 반경 ${p.explode.radius} px` : ''}`
      : a.dash ? `돌진 거리 ${a.dash.distance} px · 몸 판정 여유 ${a.dash.bodyPad} px`
      : shape.type === 'circle' ? `반경 ${shape.radius} px` : `사거리 ${shape.range} px · 부채꼴 ${shape.arc}°`;
    const effects = `경직 위력 ${a.poise} · 넉백 ${a.knockback}${a.element ? ` · ${a.element === 'fire' ? '화염' : '서리'} 속성` : ''}`;
    const selected = equippedSkill(this.save,a.family) === id;
    this.mountSheet(this.dialogHtml(a.name, `<p>${SKILL_DISPLAY[id].label} · ${WEAPON_NAMES[a.family]} 계열${selected ? ' · 장착 중' : ''}</p><dl class="p2-lines"><div><dt>기본 피해 (타격당)</dt><dd>${a.damage}</dd></div><div><dt>소모 MP</dt><dd>${a.manaCost || 0} MP</dd></div><div><dt>재사용</dt><dd>${amount(a.cooldownMs / 1000)}초</dd></div></dl><p>${range}</p><p>${effects}</p><p class="minor">실전 피해는 기본 피해 × 해당 계열 캐릭터 공격 배율. 다른 계열은 그 무기 장착 시 사용.</p>`, button(selected ? '장착 중' : '기술 장착', 'equip-character-skill', `data-id="${id}" data-family="${a.family}" class="primary"`, selected)));
  }

  showTrainer() {
    const families = FAMILIES.map(family => {
      const current = equippedSkill(this.save, family);
      const ids = [DEFAULT_SKILLS[family], ...Object.keys(BOOKS).filter(id => BOOKS[id].family === family)];
      const rows = ids.map(id => {
        const ability = ABILITIES[id], book = BOOKS[id], known = hasSkill(this.save, id);
        const selected = current === id;
        const control = known ? button(selected ? '장착 중' : '장착', 'equip-skill', `data-id="${id}" data-family="${family}" aria-pressed="${selected}"`, selected)
          : button(`${book.price} G · 배우기`, 'learn-skill', `data-id="${id}"`, this.save.gold < book.price);
        return `<article class="skill-book"><div><strong>${escape(ability.name)}</strong><small>${book?.type || '기본 기술 · 항상 습득'}${book && !known && this.save.gold < book.price ? ' · 골드 부족' : ''}</small>
          <p class="minor">피해 ${ability.damage} · 재사용 ${amount(ability.cooldownMs / 1000)}초 · 마나 ${ability.manaCost || 0}</p></div>${control}</article>`;
      }).join('');
      return `<section class="skill-family"><h3>${WEAPON_NAMES[family]} 계열</h3>${rows}</section>`;
    }).join('');
    this.showInnPanel('교관', `<p class="npc-line">“배운 기술은 잊지 않는다.”</p><p class="minor">교본 구매 즉시 영구 습득 · 무게 없음 · 레벨 제한 없음<br>무기 계열마다 기술 하나를 장착한다. 피해는 기본 수치.</p>${families}`,
      'trainer', '', { eyebrow: '기술교본 · 마법교본' });
  }

  showAllocation(required = false, initialize = true) {
    if (initialize) this.draft = Object.fromEntries(STAT_KEYS.map((key) => [key, 0]));
    this.allocationRequired = required;
    const spent = Object.values(this.draft).reduce((sum, value) => sum + value, 0);
    const remaining = this.save.statPoints - spent;
    const rows = STAT_KEYS.map((key) => `<div class="allocation-row ${this.draft[key] ? 'changed' : ''}"><span>${STAT_NAMES[key]}</span>
      ${button('−', 'stat-minus', `data-key="${key}" aria-label="${STAT_NAMES[key]} 줄이기"`, this.draft[key] === 0)}
      <b>${this.save.stats[key] + this.draft[key]}</b>
      ${button('+', 'stat-plus', `data-key="${key}" aria-label="${STAT_NAMES[key]} 올리기"`,
        remaining === 0 || this.save.stats[key] + this.draft[key] >= cap(this.save.level))}</div>`).join('');
    const before = deriveMods(this.save);
    const after = deriveMods(allocateStats(this.save, this.draft));
    const preview = [['HP', before.maxHp, after.maxHp], ['MP', before.maxMp, after.maxMp], ['소지 kg', before.capacity, after.capacity]]
      .map(([label, from, to]) => `<span>${label} <b>${amount(to)}</b>${to !== from ? `<small class="gain">▲+${amount(to - from)}</small>` : ''}</span>`).join('');
    const tabs = required ? '' : this.characterTabs('stats');
    const content = `${tabs}${required ? '' : this.characterHtml()}<p id="allocation-left" class="points-left"><b>${remaining}</b> 점 남음 <small>상한 ${cap(this.save.level)}</small></p>
      <div class="allocation">${rows}</div><p class="p2-stat-summary">${preview}</p>${required ? '' : `<h3 class="section-title">지난 여정</h3>${this.receipt ? this.receiptHtml(this.receipt) : '<p class="muted">아직 다녀온 여정이 없다.</p>'}`}`;
    const footer = button(required ? '분배 완료' : '확인', 'allocate', 'id="allocation-confirm" class="primary"', required ? remaining !== 0 : spent === 0);
    this.panel = required ? null : 'character';
    this.show(this.shellHtml(this.panelHeader(required ? '레벨이 올랐다' : '캐릭터', required ? `Lv.${this.save.level} · 능력치 ${this.save.statPoints}점` : '인장의 기록', required ? '' : 'inn'), content, footer),
      required ? 'level-up' : 'character', { shell: true });
  }

  // --- Contract board and departure check ---

  showBoard() {
    const current = availableStages(this.save).find(id => !this.save.cleared[id]);
    const selected = REGIONS.find(r => r.id === this.mapRegion) || regionFor(current) || REGIONS[0];
    this.mapRegion = selected.id;
    const paths = REGION_EDGES.map(([a,b]) => {
      const from = REGIONS.find(r => r.id === a).pos, to = REGIONS.find(r => r.id === b).pos;
      return `<line x1="${from[0]}" y1="${from[1]}" x2="${to[0]}" y2="${to[1]}" />`;
    }).join('');
    const nodes = REGIONS.map(r => {
      const done = r.maps.every(id => this.save.cleared[id]), open = r.maps.some(id => mapUnlocked(this.save,id));
      return button(`${icon(done ? 'clear' : open ? 'depart' : 'lock')}<span>${r.name}</span><small>${done ? '완료' : r.maps.includes(current) ? '현재' : open ? '열림' : '잠김'}</small>`, 'map-region',
        `data-region="${r.id}" class="region-node ${done ? 'clear' : open ? 'depart' : 'lock'}" style="left:${r.pos[0]}%;top:${r.pos[1]}%" aria-pressed="${this.mapRegion === r.id}"${r.maps.includes(current) ? ' aria-current="location"' : ''}`);
    }).join('');
    const regions = REGIONS.map(r => `<section class="map-quests" data-region="${r.id}"${r.id === selected.id ? '' : ' hidden'}><h3>${r.name}</h3>${r.maps.map(id => {
      const state = mapState(this.save,id), rec = BALANCE.stages[id]?.rec?.[0] || 1;
      return button(`${icon(state)}<span><strong>${id} · ${escape(STAGES[id].name)}</strong><small>추천 Lv.${rec}</small></span><small>${state === 'clear' ? `위협 ${clearedThreat(this.save,id)}/3 완료` : state === 'lock' ? '잠김' : id === current ? '현재 · 도전 가능' : '도전 가능'}</small>`, 'sortie',
        `data-stage="${id}" class="contract ${state}"${id === current ? ' aria-current="step"' : ''}`, state === 'lock');
    }).join('')}</section>`).join('');
    this.showInnPanel('월드맵', `<button type="button" data-action="coop" class="primary">같이 사냥 · 2~4인</button><p class="minor">출정 한 번에 맵 하나 · 광산 또는 늪을 끝내면 성채 개방</p><div class="world-map" aria-label="지역 지도"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${paths}</svg>${nodes}</div>${regions}`, 'board', '', { eyebrow:`${Object.values(this.save.cleared).filter(Boolean).length} / 20 완료` });
  }

  showSortie(stage, devWeapon = null) {
    if (!devWeapon && !mapUnlocked(this.save, stage)) throw new Error('아직 잠긴 맵입니다.');
    if (this.sortieStage !== stage) this.sortieThreat = 1;
    this.sortieStage = stage;
    this.devWeapon = devWeapon;
    const threat = this.sortieThreat || 1;
    const weight = carriedWeight(this.save);
    const supplies = SUPPLIES.map((id) =>
      `<span class="icon-count ${this.save.stacks[id] ? '' : 'loss'}" aria-label="${ITEMS[id].name} ${this.save.stacks[id] || 0}">${itemIcon(id, ITEMS[id])}${this.save.stacks[id] || 0}</span>`).join('');
    const threats = [1, 2, 3].map(level => {
      const locked = stage === 'S1' ? level > 1 : level > unlockedThreat(this.save, stage);
      const mult = BALANCE.threats[level - 1];
      return button(`<strong>위협 ${level}</strong><small>${locked ? '잠김' : level === 1 ? '기본' : `HP ×${mult.hp} · 골드 ×${mult.gold}`}</small>`,
        'threat', `data-threat="${level}" aria-pressed="${threat === level}"`, locked);
    }).join('');
    this.showInnPanel(`${stage} · ${STAGES[stage].name}`, `
      <div class="departure-check"><h3>보급</h3><div class="sortie-supplies">${supplies}</div>${this.weightHtml(weight)}</div>
      <div class="threat-choices" role="group" aria-label="위협도">${threats}</div>
      <button type="button" data-action="coop" class="primary">같이 사냥 · 이 퀘스트로</button><p class="risk-note">${icon('clear')}완료 · 귀환하면 전리품 확보<br>${icon('death')}사망하면 이번 전리품과 경험치 일부를 잃는다</p>
      <details class="help"><summary>설정</summary>
        <label class="check"><input id="sortie-reduced" type="checkbox"
          ${matchMedia('(prefers-reduced-motion: reduce)').matches ? 'checked' : ''}>흔들림·섬광 줄이기</label></details>`,
    'sortie', button(`<span>출정</span>${icon('depart')}`, 'launch', 'id="sortie-confirm" class="primary"'), { eyebrow: '출정 확인', back: 'board' });
  }

  launch(stage, reduced = false, weapon = null) {
    if (!weapon && !mapUnlocked(this.save, stage)) throw new Error('아직 잠긴 맵입니다.');
    this.commit(selectThreat(this.save, stage, stage === 'S1' ? 1 : this.sortieThreat || 1));
    this.root.hidden = true;
    this.startRound(stage, reduced, weapon);
  }

  // --- Settlement: stamp → ledger → one-by-one gear reveal → inn. ---

  receiptHtml(receipt, includeGear = true) {
    const loot = receipt.lootKept;
    const materials = Object.entries(loot.stacks).filter(([, count]) => count > 0).map(([id, count]) =>
      `<span class="reward" title="${ITEMS[id].name}" aria-label="${ITEMS[id].name} ${count}">${itemIcon(id, ITEMS[id])}×${count}</span>`).join('');
    const gear = loot.items.map(item => `<article class="gear-card">${emblem(item)}<div><b>${escape(itemLabel(item))}</b>${linesHtml(comparisonFor(item, this.save))}</div></article>`).join('');
    return `<div class="receipt"><div class="reward-pair">
      <div><small>경험치</small><strong class="reward" aria-label="획득 경험치">${icon('xp')}+${amount(receipt.xpGained)}</strong>
        ${receipt.xpLost ? `<small class="loss" aria-label="손실 경험치">−${amount(receipt.xpLost)}</small>` : ''}</div>
      <div><small>골드</small><strong class="reward" aria-label="획득 골드">${icon('gold')}+${loot.gold}</strong></div></div>
      ${materials ? `<div class="reward-row">${materials}</div>` : ''}${includeGear && gear ? `<div class="receipt-gear">${gear}</div>` : ''}
      <details class="help"><summary>상세 정산</summary>${this.receiptDetails(receipt)}</details></div>`;
  }

  receiptDetails(receipt) {
    const listLoot = (loot) => {
      const parts = Object.entries(loot.stacks).filter(([, count]) => count > 0)
        .map(([id, count]) => `${ITEMS[id].name} ×${count}`);
      parts.push(...loot.items.map(itemLabel));
      if (loot.gold) parts.unshift(`${loot.gold} G`);
      return parts.length ? parts.map(escape).join(' · ') : '없음';
    };
    const used = Object.entries(receipt.used).filter(([, count]) => count > 0)
      .map(([id, count]) => `${ITEMS[id].name} ${count}`).join(' · ') || '없음';
    const restored = Object.entries(receipt.restored).filter(([, count]) => count > 0)
      .map(([id, count]) => `${ITEMS[id].name} ${count}`).join(' · ');
    return `<div class="receipt-details"><p>XP +${receipt.xpGained} / −${amount(receipt.xpLost)}
      · 예치 포기 ${receipt.xpForfeited}</p><p>레벨 +${receipt.levelsGained} · 능력치 +${receipt.statPointsGained}</p>
      <p>확보: ${listLoot(receipt.lootKept)}</p><p>상실: ${listLoot(receipt.lootLost)}</p>
      <p>사용: ${used}</p>${restored ? `<p>첫 S2 구조 보급: ${restored}</p>` : ''}
      ${receipt.xpDiscarded ? `<p>Lv30 상한으로 받지 못한 XP: ${amount(receipt.xpDiscarded)}</p>` : ''}
      ${receipt.pityGranted ? '<p>첫 대장 격파 보증: 대장의 망치를 창고에 맡겼다.</p>' : ''}</div>`;
  }

  finish(save, receipt, cause) {
    this.save = save;
    this.receipt = receipt;
    this.pendingReceipt = { receipt, cause };
    this.revealed = 0;
    this.lootState = {};
    if (receipt.levelsGained > 0) this.showAllocation(true);
    else this.showReceipt();
  }

  revealHtml(receipt) {
    const items = receipt.lootKept.items;
    if (!items.length) return '';
    const cards = items.slice(0, this.revealed).map(drop => {
      const item = this.save.items.find(candidate => candidate.uid === drop.uid);
      const state = item ? (isWorn(this.save, item.uid) ? '착용 중' : this.lootState[drop.uid] || '') : this.lootState[drop.uid] || '보유하지 않음';
      const rare = ['rare', 'epic'].includes(ITEMS[drop.id].rarity);
      const uid = `data-uid="${escape(drop.uid)}"`;
      const actions = item && !state
        ? `<div class="p2-three">${button('장착', 'loot-equip', uid, comparisonFor(item, this.save).locked)}${button(`판매 ${sellPrice(item)} G`, 'loot-sell', uid, isWorn(this.save, item.uid))}${button(`분해 ${dismantleRefund(item)}`, 'dismantle', `${uid} class="quiet-danger"`)}</div>`
        : `<small class="p2-loot-status" role="status">${state || '보관함'}</small>`;
      return `<article class="p2-loot-card ${rare ? 'sheen' : ''}">${cardHtml(item || drop, this.save, { action: item ? 'open-item' : 'noop', disabled: !item })}${actions}</article>`;
    }).join('');
    const left = items.length - this.revealed;
    return `<section class="reveal"><p class="minor">마을로 돌아가면 자동 보관</p><h3>획득 장비 <span class="muted">${this.revealed} / ${items.length}</span></h3><div class="p2-loot">${cards}</div>
      ${left ? button(`${this.revealed ? '다음 장비' : '장비'} 공개 · ${left}개 남음`, 'reveal', 'class="reveal-button"') : ''}</section>`;
  }

  showReceipt() {
    const { receipt, cause } = this.pendingReceipt;
    const title = { clear: '완료', return_scroll: '귀환', death: '사망' }[receipt.terminal];
    const glyph = { clear: 'clear', return_scroll: 'return_scroll', death: 'death' }[receipt.terminal];
    const lost = receipt.terminal === 'death' && (receipt.lootLost.items.length || receipt.lootLost.gold)
      ? `<p class="loss">잃은 전리품: ${receipt.lootLost.gold} G${receipt.lootLost.items.length ? ` · 장비 ${receipt.lootLost.items.length}개` : ''}</p>` : '';
    const content = `<div class="result-intro" data-terminal="${receipt.terminal}"><span class="result-stamp">${icon(glyph)}</span>
      <div><small>${receipt.stageId} · 위협 ${receipt.threat}</small><h1>${title}</h1>${receipt.terminal === 'death' ? `<p id="cause">${escape(cause)}</p>` : ''}</div></div>
      ${this.receiptHtml(receipt, false)}${lost}${this.revealHtml(receipt)}`;
    this.panel = null;
    this.show(this.shellHtml('', content, button('<span>여관으로</span>' + icon('depart'), 'result-inn', 'id="result-back" class="primary"')), 'receipt', { shell: true });
  }

  showSettings() {
    this.showInnPanel('설정', `
      <p class="minor">캐릭터는 이 브라우저에 저장된다. 전투 중 새로고침하면 마지막 여관으로 돌아온다.</p>
      <p class="p2-lock">${icon('lock')}초기화하면 캐릭터·보급·장비·진척을 모두 잃는다.</p>
      ${this.resetStep === 0 ? button('저장 초기화', 'reset-first') : this.resetStep === 1
    ? button('캐릭터를 지울까? 한 번 더 확인', 'reset-second')
    : button('최종 확인 · 전부 지우기', 'reset-final', 'class="danger"')}`, 'settings');
  }

  action(action, data) {
    if (this.enchantFx?.active) return;
    switch (action) {
      case 'name': return this.showName();
      case 'answer':
        this.answers.push(Number(data.choice));
        return this.answers.length === 5 ? this.showQuizResult() : this.showQuiz();
      case 'override':
        this.chosenWeapon = data.family;
        return this.showQuizResult();
      case 'create':
        this.commit(createSave({
          name: this.name, answers: this.answers, weapon: this.chosenWeapon, createdAt: Date.now(),
        }));
        return this.launch('S1');
      case 'inn':
      case 'result-inn': return this.showInn();
      case 'character-tab': return data.tab === 'skills' ? this.showCharacterSkills() : this.showAllocation(false);
      case 'skill-detail': return this.openSkill(data.id);
      case 'equip-character-skill':
        this.commit(equipSkill(this.save, data.family, data.id));
        return this.showCharacterSkills();
      case 'character': return this.showAllocation(false);
      case 'close-sheet': return this.closeSheet();
      case 'noop': return undefined;
      // Supplies
      case 'shop': return this.showShop();
      case 'shop-tab':
        this.shopTab = data.tab;
        return this.showShop();
      case 'sell-stack':
        this.commit(sellStack(this.save, data.id, Number(data.count), data.source));
        return this.showShop();
      case 'shop-select':
        this.shopId = data.id;
        this.shopCount = 1;
        return this.showShop();
      case 'shop-count':
        this.shopCount = Math.max(1, Math.min(99, this.shopCount + Number(data.step)));
        return this.showShop();
      case 'buy':
        this.commit(buy(this.save, this.shopId, this.shopCount));
        return this.showShop();
      // Bag, sockets and comparison
      case 'inventory': return this.showInventory();
      case 'bag': return this.showBag();
      case 'stash-tab':
        this.stashTab = data.tab;
        return this.showInventory();
      case 'move-stack':
        this.commit(moveConsumable(this.save, data.id, Number(data.count), data.destination));
        return this.panel === 'bag' ? this.showBag() : this.showInventory();
      case 'filter':
        this.filter = data.slot;
        return this.showInventory();
      case 'sort':
        this.sort = { grade: 'recent', recent: 'weight', weight: 'grade' }[this.sort || 'grade'];
        return this.showInventory();
      case 'socket': return this.showSocket(data.slot);
      case 'open-item': return this.openItem(data.uid, data.mode || 'equip');
      case 'equip':
        this.commit(equip(this.save, data.uid));
        return this.returnToPanel();
      case 'sell':
        this.commit(sellItem(this.save, data.uid));
        if (this.selectedUid === data.uid) this.selectedUid = null;
        return this.returnToPanel();
      case 'dismantle': return this.confirmDismantle(data.uid);
      case 'confirm-dismantle':
        this.commit(dismantle(this.save, data.uid));
        if (this.lootState) this.lootState[data.uid] = '분해함';
        if (this.selectedUid === data.uid) this.selectedUid = null;
        return this.returnToPanel();
      // Merchant
      case 'merchant':
        if (data.tab) this.merchantTab = data.tab;
        return this.showMerchant();
      case 'merchant-tab':
        this.merchantTab = data.tab;
        return this.showMerchant();
      case 'buy-gear':
        this.commit(buyGear(this.save, data.uid));
        return this.showMerchant();
      case 'sell-shop':
        this.commit(sellItem(this.save, data.uid));
        return this.showMerchant();
      case 'refresh-shop':
        this.commit(refreshShop(this.save));
        return this.showMerchant();
      // Forge
      case 'forge':
        this.forgeTab = 'enhance';
        this.selectedUid = null;
        return this.showForge();
      case 'forge-tab':
        if (!['enhance', 'scrolls', 'salvage'].includes(data.tab)) return;
        this.forgeTab = data.tab;
        return this.showForge();
      case 'select-gear':
        this.selectedUid = data.uid;
        return this.showForge();
      case 'pick-scroll':
        this.forgeScroll = data.id;
        return this.showForge();
      case 'enhance': {
        // Commit first: the outcome is saved before any animation, so reload cannot reroll it.
        const scrollId = data.scroll || this.forgeScroll;
        const { save, result } = enchant(this.save, data.uid, scrollId);
        this.commit(save);
        this.lastEnchant = this.forgeNotice = result;
        if (result.outcome === 'destroyed') this.selectedUid = null;
        this.showForge();
        this.enchantFx = playEnchantFx(this.root, result, scrollId);
        return;
      }
      case 'craft-scroll':
        this.commit(craftScroll(this.save, data.family));
        return this.showForge();
      case 'crack-greater': {
        const { save, result } = crackGreaterStone(this.save, data.family);
        this.commit(save);
        this.lastCrack = this.forgeNotice = result;
        this.showForge();
        this.enchantFx = playEnchantFx(this.root, result);
        return;
      }
      case 'craft':
        this.commit(craft(this.save, data.id));
        this.selectedUid = this.save.items.at(-1).uid;
        this.forgeTab = 'enhance';
        return this.showForge();
      // Settlement reveal
      case 'reveal':
        this.revealed = Math.min(this.revealed + 1, this.pendingReceipt.receipt.lootKept.items.length);
        return this.showReceipt();
      case 'loot-equip':
        this.commit(equip(this.save, data.uid));
        this.lootState[data.uid] = '장착함';
        return this.showReceipt();
      case 'loot-sell':
        this.commit(sellItem(this.save, data.uid));
        this.lootState[data.uid] = '판매함';
        return this.showReceipt();
      // Trainer
      case 'trainer': return this.showTrainer();
      case 'learn-skill':
        this.commit(learnSkill(this.save, data.id));
        return this.showTrainer();
      case 'equip-skill':
        this.commit(equipSkill(this.save, data.family, data.id));
        return this.showTrainer();
      case 'stat-plus':
      case 'stat-minus':
        this.draft[data.key] += action === 'stat-plus' ? 1 : -1;
        return this.showAllocation(this.allocationRequired, false);
      case 'allocate':
        this.commit(allocateStats(this.save, this.draft));
        return this.allocationRequired ? this.showReceipt() : this.showAllocation(false);
      // Board
      case 'coop': {
        const stage = mapUnlocked(this.save, this.sortieStage) ? this.sortieStage : availableStages(this.save).find(id => !this.save.cleared[id]) || 'S1';
        return this.startCoop?.(stage, this.sortieThreat || 1);
      }
      case 'map-region':
        this.mapRegion = data.region;
        return this.showBoard();
      case 'board': return this.showBoard();
      case 'sortie': return this.showSortie(data.stage);
      case 'threat':
        selectThreat(this.save, this.sortieStage, Number(data.threat));
        this.sortieThreat = Number(data.threat);
        return this.showSortie(this.sortieStage, this.devWeapon);
      case 'launch':
        return this.launch(this.sortieStage, this.root.querySelector('#sortie-reduced').checked, this.devWeapon);
      // Settings
      case 'settings':
        this.resetStep = 0;
        return this.showSettings();
      case 'reset-first':
      case 'reset-second':
        this.resetStep++;
        return this.showSettings();
      case 'reset-final':
        if (this.resetStep !== 2) throw new Error('초기화 확인이 필요합니다.');
        this.resetSave();
        this.save = null;
        this.answers = [];
        this.chosenWeapon = null;
        this.receipt = null;
        return this.showIntro();
      case 'dev-start':
        if (!this.dev) return undefined;
        return this.showSortie(
          this.root.querySelector('#dev-stage').value, this.root.querySelector('#dev-weapon').value,
        );
    }
    return undefined;
  }
}
