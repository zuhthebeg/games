import { SLOTS, ECONOMY } from '../meta/economy.js';
import { shopStock, buyGear, sellItem, refreshShop, refreshPrice, gearPrice } from '../meta/shop.js';
import { compareItems } from '../meta/compare.js';
import { STAGES } from '../content/combat.js';
import { loadEffects } from '../sim/world.js';
import { QUESTIONS, resolve, FAMILIES, WEAPON_NAMES } from '../meta/quiz.js';
import { STAT_KEYS, STAT_NAMES, cap, deriveMods, allocateStats } from '../meta/stats.js';
import { xpSpan, MAX_LEVEL } from '../meta/progression.js';
import {
  ITEMS, RECIPES, enhanceCost, equippedItem, carriedWeight, capacity,
  buy, equip, craft, enhance, dismantle, dismantleRefund, shopPrice,
} from '../meta/items.js';
import { createSave } from '../meta/save.js';
import { icon, itemIcon } from './icons.js';

import { escape, amount, itemLabel, emblem, SLOT_NAMES, GRADES, linesHtml, comparisonFor, cardHtml, portraitHtml, socketsHtml } from './gear-view.js';
export { getHeroPortrait } from './gear-view.js';
const button = (label, action, extra = '', disabled = false) =>
  `<button type="button" data-action="${action}" ${extra} ${disabled ? 'disabled' : ''}>${label}</button>`;

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
    let pressTimer;
    let pressOrigin;
    this.root.addEventListener('pointerdown', event => {
      const node = event.target.closest('[data-action="open-item"]');
      if (!node || node.disabled) return;
      pressOrigin = { x:event.clientX, y:event.clientY };
      pressTimer = setTimeout(() => { this.action('open-item', node.dataset); }, 500);
    });
    this.root.addEventListener('pointermove', event => {
      if (pressOrigin && Math.hypot(event.clientX - pressOrigin.x, event.clientY - pressOrigin.y) > 8) clearTimeout(pressTimer);
    });
    for (const type of ['pointerup', 'pointercancel']) this.root.addEventListener(type, () => clearTimeout(pressTimer));
    this.root.addEventListener('submit', (event) => {
      event.preventDefault();
      if (event.target.id === 'name-form') {
        const name = new FormData(event.target).get('name').trim();
        if (Array.from(name).length < 1 || Array.from(name).length > 12) {
          this.error('이름은 1~12자입니다.');
          return;
        }
        this.name = name;
        this.showQuiz();
      }
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

  show(html, page) {
    this.root.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
    this.onOverlay();
    document.querySelector('#hud').hidden = true;
    this.root.hidden = false;
    this.root.dataset.page = page;
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
    const node = this.root.querySelector('#meta-error');
    if (node) node.textContent = message;
  }

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

  commit(next) {
    this.persist(next);
    this.save = next;
  }

  topBar() {
    const save = this.save;
    const ratio = save.level === MAX_LEVEL ? 1 : save.xp / xpSpan(save.level);
    return `<header class="inn-topbar"><div><b id="inn-name">${escape(save.name)}</b>
      <span id="inn-level">Lv.${save.level}</span>
      <div class="xp-track" role="meter" aria-label="경험치" aria-valuemin="0" aria-valuemax="100"
        aria-valuenow="${Math.round(ratio * 100)}" title="XP ${amount(save.xp)}"><i style="width:${ratio * 100}%"></i></div></div>
      <b id="inn-gold" class="icon-count" aria-label="골드 ${save.gold}">${icon('gold')}${save.gold}</b>
      <button data-sound-toggle class="settings-button" aria-label="음소거" aria-pressed="false">${icon('sound')}</button>
      ${button(icon('settings'), 'settings', 'class="settings-button" aria-label="설정"')}</header>`;
  }

  weightHtml(weight = carriedWeight(this.save), limit = capacity(this.save)) {
    const tier = weightDescription(weight, limit);
    return `<div class="p2-weight ${tier.tier}"><span>소지 무게 <b>${amount(weight)} / ${amount(limit)} kg</b></span><meter min="0" max="${limit * 1.2}" value="${weight}" aria-label="소지 무게"></meter><small>${tier.text}</small></div>`;
  }

  screenHtml(title, content, footer, { inn = false, eyebrow = '' } = {}) {
    return `<div class="inn-shell">${this.topBar()}<header class="panel-header">${inn ? '' : button(icon('back'), 'inn', 'class="back-button" aria-label="여관으로"')}<div>${eyebrow ? `<small class="eyebrow">${escape(eyebrow)}</small>` : ''}<h1>${escape(title)}</h1></div></header><div class="content p2-content">${content}<p id="meta-error" role="alert"></p></div>${footer ? `<footer class="action-footer">${footer}</footer>` : ''}</div>`;
  }

  showInn() {
    this.panel = null;
    this.recoverVitals();
    const mods = deriveMods(this.save);
    const scene = `<svg class="room-art" viewBox="0 0 358 250" aria-hidden="true"><defs><pattern id="inn-floor" width="80" height="30" patternUnits="userSpaceOnUse" patternTransform="skewX(-25)"><rect width="80" height="30" fill="#292822"/><path d="M0 0h80v30H0z" stroke="#403d32" stroke-width="1"/></pattern></defs><path d="M0 0h358v172L180 239 0 174z" fill="#20231e"/><path d="M0 174 178 118 358 172v78H0z" fill="url(#inn-floor)"/><path d="M0 19 179 0l179 19M40 0v153M312 0v153M0 105l178-28 180 28" stroke="#4c493a" fill="none" stroke-width="10"/><path d="M149 29h69v110h-69z" fill="#413e33" stroke="#6c6450" stroke-width="3"/><path d="M160 83q24-33 47 0v48h-47z" fill="#141712"/><path d="M173 125q-8-18 4-32-2 17 8 15 9-9 6-21 22 22 8 39z" fill="#c18a4f"/><path d="M181 125q-5-12 6-22 10 11 5 22z" fill="#efcc88"/><path d="M148 139h74M141 145h88" stroke="#78705b" stroke-width="6"/><path d="M20 119 92 113l21 25-72 8z" fill="#4a4030" stroke="#8a7250"/><path d="m40 147 2 28m60-35 1 29" stroke="#4a4030" stroke-width="8"/><path d="M268 117h55v43h-55z" fill="#3a3226" stroke="#8a7250"/><path d="M274 126h42m-42 9h28m-28 9h34" stroke="#beaa7e"/><path d="m115 217 58-24 64 20-59 27z" fill="#574936" stroke="#7c674b"/></svg>${portraitHtml(this.save)}${socketsHtml(this.save)}<div class="body-sockets" aria-hidden="true">${SLOTS.map(slot => `<i class="pin-${slot} ${equippedItem(this.save, slot) ? 'worn' : ''}"></i>`).join('')}</div>`;
    const services = [['owner','주인','지난 여정'],['shop','약사','물약 · 마나 · 귀환서'],['merchant','장비상','무기 · 방어구 · 매입'],['forge','대장장이','강화 · 제작 · 분해'],['trainer','교관',`미분배 ${this.save.statPoints}점`]].map(([action,title,note]) => button(`${icon({merchant:'weapon',shop:'potion'}[action] || action)}<span><strong>${title}</strong><small>${note}</small></span>`, action, 'class="hotspot service-row"')).join('');
    const devMenu = this.dev ? `<details class="dev-menu"><summary>M0 개발 메뉴</summary><label>무기<select id="dev-weapon">${FAMILIES.map(family => `<option>${family}</option>`).join('')}</select></label><label>스테이지<select id="dev-stage">${Object.keys(STAGES).map(id => `<option>${id}</option>`).join('')}</select></label>${button('개발 전투 확인','dev-start')}</details>` : '';
    this.show(this.screenHtml('잿빛 여관', `<div class="p2-room">${scene}</div><div class="p2-stat-summary"><span>HP <b>${amount(mods.maxHp)}</b></span><span>공격 <b>×${amount(mods.dmgMult[mods.family])}</b></span></div><p class="recovery">${icon('clear')} HP·MP 무료 회복 완료</p>${this.weightHtml()}<div class="service-list">${services}${button(`${icon('load')}<span><strong>가방</strong><small>보유 장비 ${this.save.items.length}개</small></span>`, 'inventory')}</div>${devMenu}`, button(`${icon('depart')}계약을 고르기`, 'board', 'class="primary"'), {inn:true}), 'inn');
  }

  showInnPanel(title, content, panel, footer = '') {
    this.panel = panel;
    this.show(this.screenHtml(title, content, footer), panel);
  }

  showOwner() {
    const summary = this.receipt ? this.receiptHtml(this.receipt) : '<p class="muted">지난 여정 없음</p>';
    this.showInnPanel('주인', summary, 'owner');
  }

  comparisonHtml(item) {
    const comparison = comparisonFor(item, this.save);
    return `${linesHtml(comparison)}<div class="p2-weight-after" data-weight-after="${comparison.weightAfter}">장착 후 소지 무게 <b>${amount(comparison.weightAfter)} / ${amount(comparison.weightLimit)} kg</b><small>${weightDescription(comparison.weightAfter, comparison.weightLimit).text}</small></div>${comparison.locked ? `<p class="p2-lock">장착 잠금 · ${escape(comparison.lockReason)}</p>` : ''}`;
  }

  showInventory() {
    this.filter ??= 'all'; this.sort ??= 'grade';
    const grades = ['common','fine','rare','epic'];
    const items = this.save.items.filter(item => this.filter === 'all' || ITEMS[item.id].slot === this.filter).slice();
    items.sort((a,b) => this.sort === 'weight' ? ITEMS[a.id].weight - ITEMS[b.id].weight : this.sort === 'recent' ? b.rolledAt - a.rolledAt : grades.indexOf(ITEMS[b.id].rarity) - grades.indexOf(ITEMS[a.id].rarity));
    this.showInnPanel('가방', `<div class="p2-filters">${['all',...SLOTS].map(slot => button(slot === 'all' ? '전체' : SLOT_NAMES[slot], 'filter', `data-slot="${slot}" aria-pressed="${this.filter === slot}"`)).join('')}</div><div class="p2-toolbar"><span>${items.length}개 장비</span>${button(`정렬 · ${{grade:'등급',recent:'최근',weight:'무게'}[this.sort]}`, 'sort')}</div><div class="p2-grid">${items.map(item => cardHtml(item, this.save, {compact:true, note:Object.values(this.save.equipped).includes(item.uid) ? '착용' : ''})).join('')}</div>`, 'inventory', this.weightHtml());
  }

  dialogHtml(title, body, footer = '') {
    return `<dialog class="p2-sheet" aria-label="${escape(title)}"><header><h2>${escape(title)}</h2>${button('닫기', 'close-sheet')}</header><div class="p2-sheet-body">${body}<p id="sheet-error" role="alert"></p></div>${footer ? `<footer>${footer}</footer>` : ''}</dialog>`;
  }

  mountSheet(html) {
    const origin = this.sheetOrigin || document.activeElement;
    this.root.querySelector('dialog')?.close();
    this.root.querySelector('dialog')?.remove();
    this.root.insertAdjacentHTML('beforeend', html);
    const dialog = this.root.querySelector('dialog');
    this.sheetOrigin = origin;
    dialog.addEventListener('close', () => { if (!this.root.querySelector('dialog[open]')) { if (origin?.isConnected) origin.focus({preventScroll:true}); this.sheetOrigin = null; } });
    dialog.showModal();
  }

  showSocket(slot) {
    const items = this.save.items.filter(item => ITEMS[item.id].slot === slot);
    this.mountSheet(this.dialogHtml(`${SLOT_NAMES[slot]} 보유품`, `<div class="p2-stock">${items.map(item => cardHtml(item,this.save)).join('') || '<p class="muted">보유 장비 없음 · 장비상이나 몬스터 드랍으로 획득</p>'}</div>`));
  }

  openItem(uid, mode = 'equip') {
    const item = mode === 'buy' ? shopStock(this.save.createdAt >>> 0, this.save.shopRefresh).find(item => item.uid === uid) : this.save.items.find(item => item.uid === uid);
    if (!item) throw new Error('장비를 찾을 수 없습니다.');
    this.selectedUid = uid; this.sheetMode = mode;
    const def = ITEMS[item.id], comparison = comparisonFor(item,this.save);
    const worn = Object.values(this.save.equipped).includes(uid), args = `data-uid="${escape(uid)}"`;
    let primary = button(worn ? '착용 중' : '장착', 'equip', `${args} class="primary"`, worn || comparison.locked);
    if (mode === 'buy') primary = button(`구매 · ${item.price} G`, 'buy-gear', `${args} class="primary"`, this.save.shopBought.includes(uid) || this.save.gold < item.price);
    if (mode === 'sell') primary = button(`판매 · ${Math.floor(gearPrice(item) * ECONOMY.sellFraction)} G`, 'sell-shop', `${args} class="primary"`, worn);
    const body = `<div class="p2-item-heading">${emblem(item)}<div><h3>${escape(itemLabel(item))}</h3><small>${GRADES[def.rarity]} · ${SLOT_NAMES[def.slot]} · 필요 Lv${def.requiredLevel}</small></div></div>${this.comparisonHtml(item)}${def.family && def.family !== deriveMods(this.save).family ? '<p class="p2-hint">다른 무기 계열: 기본 배율 비교이며 실전 피해 우열을 뜻하지 않습니다.</p>' : ''}${mode === 'buy' ? `<p class="minor">구매 후 ${this.save.gold - item.price} G · 창고 보관(소지 무게 변화 없음). 레벨·무게 제한은 장착 시 적용.</p>` : ''}`;
    const extra = mode === 'equip' ? `<div class="p2-two">${button(`판매 ${Math.floor(gearPrice(item) * ECONOMY.sellFraction)} G`, 'sell', args, worn)}${button(`분해 · 고철 ${dismantleRefund(item)}`, 'dismantle', `${args} class="quiet-danger"`, worn)}</div>` : '';
    this.mountSheet(this.dialogHtml('장비 비교',body, `${extra}${primary}`));
  }

  gearShopHtml() {
    const mode = this.merchantTab || 'weapon';
    const stock = mode === 'sell' ? this.save.items.filter(item => !Object.values(this.save.equipped).includes(item.uid)) : shopStock(this.save.createdAt >>> 0, this.save.shopRefresh).filter(item => mode === 'weapon' ? ITEMS[item.id].slot === 'weapon' : ITEMS[item.id].slot !== 'weapon');
    return `<div class="p2-merchant-tabs">${[['weapon','무기'],['armor','방어구'],['sell','매입 25%']].map(([tab,label]) => button(label,'merchant-tab',`data-tab="${tab}" aria-pressed="${mode === tab}"`)).join('')}</div><div class="p2-refresh"><span>다음 갱신: ${3 - this.save.completedRounds % 3}판</span>${button(`갱신 ${refreshPrice(this.save)} G`, 'refresh-shop', '', this.save.gold < refreshPrice(this.save))}</div><p class="minor">유료 갱신 20 → 40 → 80 G… · 3판 완료 시 초기화</p><div class="p2-stock">${stock.map(item => cardHtml(item,this.save,{extra:`data-mode="${mode === 'sell' ? 'sell' : 'buy'}"`,note:mode === 'sell' ? `${Math.floor(gearPrice(item)*ECONOMY.sellFraction)} G 매입` : this.save.shopBought.includes(item.uid) ? '품절' : `${item.price} G`, disabled:mode !== 'sell' && this.save.shopBought.includes(item.uid)})).join('') || '<p class="muted">매입 가능한 장비 없음</p>'}</div>`;
  }

  showMerchant() { this.showInnPanel('장비상', this.gearShopHtml(), 'merchant'); }

  showShop() {
    const price = shopPrice(this.save, this.shopId) * this.shopCount;
    const weight = carriedWeight(this.save) + ITEMS[this.shopId].weight * this.shopCount;
    const tooMany = this.shopId === 'return_scroll' && (this.save.stacks.return_scroll || 0) + this.shopCount > 2;
    const disabled = this.save.gold < price || weight > capacity(this.save) * 1.2 || tooMany;
    const cards = ['potion','mana_potion','return_scroll'].map(id => button(`<span class="item-emblem">${itemIcon(id,ITEMS[id])}</span><span class="item-name"><strong>${ITEMS[id].name}</strong><small>보유 ${this.save.stacks[id] || 0}${id === 'return_scroll' ? ' / 최대 2장' : ''}</small></span><span class="item-price">${shopPrice(this.save,id)} G</span>`, 'shop-select', `data-id="${id}" class="shop-item" aria-pressed="${id === this.shopId}"`)).join('');
    this.showInnPanel('약사', `<p class="npc-line">돌아올 몫까지 챙겨 가게.</p><div class="shop-items">${cards}</div><div class="quantity-row"><label for="shop-count">수량</label><input id="shop-count" type="number" value="${this.shopCount}" min="1" max="99"></div><div class="ledger"><div><span>총액</span><strong><span id="shop-total">${price}</span> G</strong></div><div>구매 후 골드 <b>${this.save.gold - price} G</b></div><div>구매 후 무게 <b>${amount(weight)} / ${capacity(this.save)} kg</b></div></div><p class="minor">귀환서 최대 2장 · 무게 120%까지 구매 가능</p>`, 'shop', button('구매', 'buy','id="shop-buy" class="primary"',disabled));
    if (disabled) this.error(this.save.gold < price ? '골드 부족' : tooMany ? '최대 2장' : '무게 초과');
  }

  showForge() {
    const cards = this.save.items.map(item => cardHtml(item,this.save,{action:'select-gear',compact:true,note:Object.values(this.save.equipped).includes(item.uid) ? '착용' : ''})).join('');
    const recipes = Object.entries(RECIPES).map(([id,recipe]) => {
      const available = Object.entries(recipe).every(([key,count]) => (key === 'gold' ? this.save.gold : this.save.stacks[key] || 0) >= count);
      return `<article class="recipe"><b>${itemIcon(id,ITEMS[id])}${ITEMS[id].name}</b><p>${Object.entries(recipe).map(([key,count]) => `${key === 'gold' ? '골드' : ITEMS[key].name} ${count}`).join(' · ')}</p>${button('제작','craft',`data-id="${id}"`,!available)}</article>`;
    }).join('');
    this.showInnPanel('대장장이', `<p class="npc-line">드랍으로 모은 돌을 가져오게.</p><p class="minor">${SLOTS.map(slot => `<span data-slot="${slot}">${SLOT_NAMES[slot]}: ${equippedItem(this.save,slot) ? escape(itemLabel(equippedItem(this.save,slot))) : '빈 슬롯'}</span>`).join(' · ')}</p><div class="p2-grid">${cards}</div>${this.gearSheet()}<details class="craft-list"><summary>제작 · 고철과 재료</summary><div class="recipe-grid">${recipes}</div></details>`, 'forge');
  }

  gearSheet() {
    const item = this.save.items.find(candidate => candidate.uid === this.selectedUid);
    if (!item) return '';
    const worn = Object.values(this.save.equipped).includes(item.uid), comparison = comparisonFor(item,this.save);
    const uid = `data-uid="${escape(item.uid)}"`, maxed = item.enhance >= 5;
    const cost = maxed ? {} : enhanceCost(item.enhance);
    const available = !maxed && Object.entries(cost).every(([id,count]) => (id === 'gold' ? this.save.gold : this.save.stacks[id] || 0) >= count);
    const projected = {...item, enhance:item.enhance + (maxed ? 0 : 1)};
    return `<section class="forge-work"><div class="p2-item-heading">${emblem(item)}<h3>${escape(itemLabel(item))}</h3></div><h3>강화 ${maxed ? 'MAX' : `+${item.enhance} → +${item.enhance+1}`}</h3>${linesHtml(compareItems(item,projected,this.save))}<div class="p2-stones">${[1,2,3].map(tier => { const id = `enhance_stone_${tier}`; return `<div>${icon(id)}<span>${ITEMS[id].name} ${cost[id] || 0}<small>보유 ${this.save.stacks[id] || 0} / 필요 ${cost[id] || 0}</small></span></div>`; }).join('')}</div><p>골드 ${this.save.gold} / 필요 ${cost.gold || 0} G</p>${button(maxed ? '최대 강화' : `강화 · ${cost.gold} G`, 'enhance', `${uid} class="primary"`,!available)}${!available && !maxed ? '<p class="p2-hint">강화석·골드 부족 · 몬스터 드랍으로 획득</p>' : ''}<details class="forge-compare"><summary>현재 착용 장비와 비교</summary>${this.comparisonHtml(item)}</details><div class="p2-three">${button('장착','equip',uid,worn || comparison.locked)}${button(`분해 ${dismantleRefund(item)}`,'dismantle',uid,worn)}${button('판매','sell',uid,worn)}</div></section>`;
  }

  confirmDismantle(uid) {
    const item = this.save.items.find(item => item.uid === uid);
    if (!item || Object.values(this.save.equipped).includes(uid)) throw new Error('착용 장비는 분해할 수 없습니다.');
    this.mountSheet(this.dialogHtml('분해 확인', `<p>${escape(itemLabel(item))}를 잃고 고철 ${dismantleRefund(item)}개를 받습니다. 되돌릴 수 없습니다.</p>`, `<div class="p2-two">${button('취소','close-sheet')}${button('분해 확정','confirm-dismantle',`data-uid="${escape(uid)}" class="quiet-danger"`)}</div>`));
  }

  returnToPanel() {
    if (this.root.dataset.page === 'receipt') return this.showReceipt();
    if (this.panel === 'forge') return this.showForge();
    if (this.panel === 'merchant') return this.showMerchant();
    if (this.panel === 'inventory') return this.showInventory();
    return this.showInn();
  }

  showAllocation(required = false, initialize = true) {
    if (initialize) this.draft = Object.fromEntries(STAT_KEYS.map((key) => [key, 0]));
    this.allocationRequired = required;
    const spent = Object.values(this.draft).reduce((sum, value) => sum + value, 0);
    const remaining = this.save.statPoints - spent;
    const rows = STAT_KEYS.map((key) => `<div class="allocation-row"><span>${STAT_NAMES[key]}</span>
      ${button('−', 'stat-minus', `data-key="${key}" aria-label="${STAT_NAMES[key]} 줄이기"`, this.draft[key] === 0)}
      <b>${this.save.stats[key] + this.draft[key]}</b>
      ${button('+', 'stat-plus', `data-key="${key}" aria-label="${STAT_NAMES[key]} 올리기"`,
        remaining === 0 || this.save.stats[key] + this.draft[key] >= cap(this.save.level))}</div>`).join('');
    const preview = deriveMods(allocateStats(this.save, this.draft));
    const content = `<p id="allocation-left">남은 ${remaining} · 상한 ${cap(this.save.level)}</p>${rows}
      <p class="muted">HP ${amount(preview.maxHp)} · MP ${amount(preview.maxMp)} · 용량 ${preview.capacity} kg</p>
      ${button('확인', 'allocate', 'id="allocation-confirm"', required ? remaining !== 0 : spent === 0)}
      ${required ? '' : button(icon('back'), 'inn', 'class="secondary back-button" aria-label="여관으로"')}`;
    this.show(`<div class="inn-shell">${this.topBar()}${this.panelHtml(required ? '레벨이 올랐다' : '교관',
      content, required ? `Lv.${this.save.level} · 능력치 ${this.save.statPoints}점 획득` : '')}</div>`,
    required ? 'level-up' : 'trainer');
  }

  showBoard() {
    const recommended = [1, 2, 3, 4, 4, 5, 6]; // [제안] Level at entry, before first-clear XP.
    const stages = Object.keys(STAGES).map((id, index, order) => {
      const unlocked = index === 0 || this.save.cleared[order[index - 1]];
      const state = this.save.cleared[id] ? 'clear' : unlocked ? 'depart' : 'lock';
      return button(`${icon(state)}<strong>${id}</strong><small>Lv.${recommended[index]}</small>`, 'sortie',
        `data-stage="${id}" class="stage-card" aria-label="${STAGES[id].name} · 추천 레벨 ${recommended[index]}${!unlocked ? ' · 잠김' : ''}"`, !unlocked);
    }).join('');
    this.showInnPanel('게시판', `<div class="stage-grid">${stages}</div>`, 'board');
  }

  showSortie(stage, devWeapon = null) {
    this.sortieStage = stage;
    this.devWeapon = devWeapon;
    const weight = carriedWeight(this.save);
    const tier = weightDescription(weight, capacity(this.save));
    const supplies = ['potion', 'mana_potion', 'return_scroll'].map((id) =>
      `<span class="icon-count" aria-label="${ITEMS[id].name} ${this.save.stacks[id] || 0}">${itemIcon(id, ITEMS[id])}${this.save.stacks[id] || 0}</span>`).join('');
    this.showInnPanel(`${stage} · ${STAGES[stage].name}`, `
      <div class="sortie-supplies">${supplies}<div class="sortie-weight ${tier.tier}" title="${tier.text}">
        <span class="icon-count">${icon('load')}${amount(weight)}/${capacity(this.save)}</span>
        <meter min="0" max="1.2" value="${weight / capacity(this.save)}" aria-label="출정 무게"></meter></div></div>
      ${button(`${icon('depart')}출정`, 'launch', 'id="sortie-confirm" class="primary"')}
      <details class="help"><summary aria-label="출정 안내">ⓘ</summary>
        <p>${tier.text}. 킬 XP는 완료할 때만 지급. 귀환은 전리품만, 사망은 이번 전리품도 잃는다.</p>
        <label class="check"><input id="sortie-reduced" type="checkbox"
          ${matchMedia('(prefers-reduced-motion: reduce)').matches ? 'checked' : ''}>흔들림·섬광 줄이기</label></details>`, 'sortie');
  }

  launch(stage, reduced = false, weapon = null) {
    this.root.hidden = true;
    this.startRound(stage, reduced, weapon);
  }

  receiptHtml(receipt) {
    const loot = receipt.lootKept;
    const rewards = Object.entries(loot.stacks).filter(([, count]) => count > 0).map(([id, count]) =>
      `<span class="reward" title="${ITEMS[id].name}" aria-label="${ITEMS[id].name} ${count}">${itemIcon(id, ITEMS[id])}×${count}</span>`);
    rewards.push(...loot.items.map((item) => `<span class="reward" title="${itemLabel(item)}"
      aria-label="${itemLabel(item)}">${itemIcon(item.id, ITEMS[item.id])}+${item.enhance}</span>`));
    return `<div class="receipt"><div class="reward-row">
      <span class="reward" aria-label="획득 경험치">${icon('xp')}+${amount(receipt.xpGained)}</span>
      ${receipt.xpLost ? `<span class="reward loss" aria-label="손실 경험치">${icon('xp')}−${amount(receipt.xpLost)}</span>` : ''}
      <span class="reward" aria-label="획득 골드">${icon('gold')}+${loot.gold}</span>${rewards.join('')}</div>${loot.items.map((item) => `<article class="gear-card"><b>${escape(itemLabel(item))}</b>${this.comparisonHtml(item)}</article>`).join('')}
      <details class="help"><summary aria-label="상세 정산">ⓘ</summary>${this.receiptDetails(receipt)}</details></div>`;
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
    return `<div class="receipt"><p>XP +${receipt.xpGained} / −${amount(receipt.xpLost)}
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
    if (receipt.levelsGained > 0) this.showAllocation(true);
    else this.showReceipt();
  }

  showReceipt() {
    const { receipt, cause } = this.pendingReceipt;
    const title = { clear: '완료', return_scroll: '귀환', death: '사망' }[receipt.terminal];
    const glyph = { clear: 'clear', return_scroll: 'return_scroll', death: 'death' }[receipt.terminal];
    this.show(this.panelHtml(title, `<div class="result-icon">${icon(glyph)}</div>
      ${receipt.terminal === 'death' ? `<p id="cause">${escape(cause)}</p>` : ''}${this.receiptHtml(receipt)}
      ${button('여관으로', 'result-inn', 'id="result-back" class="primary"')}`), 'receipt');
  }

  showSettings() {
    this.showInnPanel('설정', `
      <p class="muted">이 캐릭터는 이 브라우저에 저장된다. 전투 중 새로고침은 마지막 여관 상태로 돌아온다.</p>
      <p>초기화하면 이 브라우저의 캐릭터와 보급·장비·진척을 모두 잃는다.</p>
      ${this.resetStep === 0 ? button('저장 초기화', 'reset-first') : this.resetStep === 1
        ? button('캐릭터를 지울까? 한 번 더 확인', 'reset-second')
        : button('최종 확인 · 전부 지우기', 'reset-final', 'class="danger"')}`, 'settings');
  }

  action(action, data) {
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
      case 'inn': return this.showInn();
      case 'result-inn': return this.showInn();
      case 'owner': return this.showOwner();
      case 'shop': return this.showShop();
      case 'shop-select':
        this.shopId = data.id;
        return this.showShop();
      case 'buy':
        this.commit(buy(this.save, this.shopId, this.shopCount));
        return this.showShop();
      case 'buy-gear':
        this.commit(buyGear(this.save, data.uid)); return this.showShop();
      case 'refresh-shop':
        this.commit(refreshShop(this.save)); return this.showShop();
      case 'sell-shop':
        this.commit(sellItem(this.save, data.uid)); return this.showShop();
      case 'sell':
        this.commit(sellItem(this.save, data.uid)); return this.showForge();
      case 'forge':
        this.selectedUid = null;
        return this.showForge();
      case 'select-gear':
        this.selectedUid = data.uid;
        return this.showForge();
      case 'close-gear':
        this.selectedUid = null;
        return this.showForge();
      case 'equip':
        this.commit(equip(this.save, data.uid));
        return this.showForge();
      case 'dismantle':
        this.commit(dismantle(this.save, data.uid));
        return this.showForge();
      case 'enhance':
        this.commit(enhance(this.save, data.uid));
        return this.showForge();
      case 'craft':
        this.commit(craft(this.save, data.id));
        this.selectedUid = this.save.items.at(-1).uid;
        return this.showForge();
      case 'trainer': return this.showAllocation(false);
      case 'stat-plus':
      case 'stat-minus':
        this.draft[data.key] += action === 'stat-plus' ? 1 : -1;
        return this.showAllocation(this.allocationRequired, false);
      case 'allocate':
        this.commit(allocateStats(this.save, this.draft));
        return this.allocationRequired ? this.showReceipt() : this.showInn();
      case 'board': return this.showBoard();
      case 'sortie': return this.showSortie(data.stage);
      case 'launch':
        return this.launch(this.sortieStage, this.root.querySelector('#sortie-reduced').checked, this.devWeapon);
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
        if (!this.dev) return;
        return this.showSortie(
          this.root.querySelector('#dev-stage').value, this.root.querySelector('#dev-weapon').value,
        );
    }
  }
}
