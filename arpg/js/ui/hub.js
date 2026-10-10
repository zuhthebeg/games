import { BALANCE } from '../content/balance.js';
import { unlockedThreat, selectThreat } from '../meta/run.js';
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

const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
const button = (label, action, extra = '', disabled = false) =>
  `<button type="button" data-action="${action}" ${extra} ${disabled ? 'disabled' : ''}>${label}</button>`;
const itemLabel = (item) => `${ITEMS[item.id].name} +${item.enhance}`;
const amount = (value) => Number.isInteger(value) ? value : value.toFixed(1);

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
    this.onOverlay();
    document.querySelector('#hud').hidden = true;
    this.root.hidden = false;
    this.root.dataset.page = page;
    this.root.innerHTML = html;
    this.root.scrollTop = 0;
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
      <button data-sound-toggle class="settings-button" aria-label="음소거" aria-pressed="false">🔊</button>
      ${button(icon('settings'), 'settings', 'class="settings-button" aria-label="설정"')}</header>`;
  }

  showInn() {
    this.panel = null;
    this.recoverVitals();
    const mods = deriveMods(this.save);
    const hotspots = [
      ['owner', '주인', 'owner'], ['shop', '약사', 'potion'], ['forge', '대장장이', 'forge'],
      ['trainer', '교관', 'trainer'], ['board', '게시판', 'board'],
    ].map(([action, name, glyph]) => `<button class="hotspot hotspot-${action}" data-action="${action}">
      ${icon(glyph)}<strong>${name}</strong>${action === 'trainer' && this.save.statPoints
        ? `<b class="badge" aria-label="미분배 ${this.save.statPoints}점">${this.save.statPoints}</b>` : ''}</button>`).join('');
    const devMenu = this.dev ? `<details class="dev-menu"><summary>M0 개발 메뉴</summary>
      <label>무기<select id="dev-weapon">${FAMILIES.map((family) =>
        `<option value="${family}">${family}</option>`).join('')}</select></label>
      <label>스테이지<select id="dev-stage">${Object.keys(STAGES).map((id) =>
        `<option>${id}</option>`).join('')}</select></label>
      ${button('개발 전투 확인', 'dev-start')}</details>` : '';
    this.show(`<div class="inn-shell">${this.topBar()}<div class="inn-room">
      <h1>잿빛 여관</h1><div class="hearth" aria-hidden="true"><i></i></div>
      <div class="inn-recovery" role="status" aria-label="HP·MP 자동 회복 완료">
        <div class="bar hp" aria-label="HP ${amount(mods.maxHp)}"><i></i></div>
        <div class="bar mp" aria-label="MP ${amount(mods.maxMp)}"><i></i></div></div>
      <div class="hotspots">${hotspots}</div>
      ${button(`${icon('depart')}출정`, 'board', 'class="primary inn-depart"')}${devMenu}
      <p id="meta-error" role="alert"></p></div></div>`, 'inn');
  }

  showInnPanel(title, content, panel) {
    this.panel = panel;
    this.show(`<div class="inn-shell">${this.topBar()}${this.panelHtml(title, `
      ${content}${button(icon('back'), 'inn', 'class="secondary back-button" aria-label="여관으로"')}`)}</div>`, panel);
  }

  showOwner() {
    const summary = this.receipt ? this.receiptHtml(this.receipt) : '<p class="muted">지난 여정 없음</p>';
    this.showInnPanel('주인', summary, 'owner');
  }

  comparisonHtml(item) {
    const compare = compareItems(equippedItem(this.save, ITEMS[item.id].slot), item, this.save);
    return `<div class="gear-comparison">${compare.lines.map((line) =>
      `<p class="${line.good === true ? 'gain' : line.good === false ? 'loss' : ''}">${escape(line.label)} ${amount(line.from)} → ${amount(line.to)} ${line.delta > 0 ? '▲' : line.delta < 0 ? '▼' : '＝'}${amount(Math.abs(line.delta))}</p>`).join('')}
      <small>장착 후 ${amount(compare.weightAfter)}/${compare.weightLimit} kg ${escape(compare.lockReason)}</small></div>`;
  }

  gearShopHtml() {
    return `<h3>장비 상점</h3><div class="gear-grid">${shopStock(this.save.createdAt >>> 0, this.save.shopRefresh)
      .map((item) => `<article class="gear-card"><b>${escape(itemLabel(item))}</b><small>${ITEMS[item.id].rarity}</small>
        ${this.comparisonHtml(item)}${button(`구매 ${item.price} G`, 'buy-gear', `data-uid="${escape(item.uid)}"`,
          this.save.shopBought.includes(item.uid) || this.save.gold < item.price)}</article>`).join('')}</div>
      ${button(`재고 갱신 ${refreshPrice(this.save)} G`, 'refresh-shop', '', this.save.gold < refreshPrice(this.save))}
      <p class="muted">완료 ${this.save.completedRounds}판 · 3판마다 무료 갱신. 장비는 창고로 구매(레벨 잠금은 장착 시 적용).</p>
      <h3>판매</h3>${this.save.items.filter((item) => !Object.values(this.save.equipped).includes(item.uid)).map((item) =>
        button(`${escape(itemLabel(item))} 판매 ${Math.floor(gearPrice(item) * ECONOMY.sellFraction)} G`, 'sell-shop', `data-uid="${escape(item.uid)}"`)).join('')}`;
  }

  showShop() {
    const price = shopPrice(this.save, this.shopId) * this.shopCount;
    const weight = carriedWeight(this.save) + ITEMS[this.shopId].weight * this.shopCount;
    const tooMany = this.shopId === 'return_scroll' && (this.save.stacks.return_scroll || 0) + this.shopCount > 2;
    const disabled = this.save.gold < price || weight > capacity(this.save) * 1.2 || tooMany;
    const names = { potion: '물약', mana_potion: '마나', return_scroll: '귀환서' };
    const cards = Object.keys(names).map((id) => button(`
      ${itemIcon(id, ITEMS[id])}<strong>${names[id]}</strong>
      <span class="icon-count">${icon('gold')}${shopPrice(this.save, id)}</span>
      <small aria-label="보유 ${this.save.stacks[id] || 0}">×${this.save.stacks[id] || 0}</small>`, 'shop-select',
      `data-id="${id}" class="supply-card ${this.save.gold < shopPrice(this.save, id) ? 'unaffordable' : ''}"
       aria-pressed="${id === this.shopId}" aria-label="${ITEMS[id].name}"`)).join('');
    this.showInnPanel('약사', `<div class="supply-grid">${cards}</div>
      <div class="shop-checkout"><label for="shop-count">수량<input id="shop-count" type="number"
        value="${this.shopCount}" min="1" max="99"></label>
      <b id="shop-total" class="icon-count">${icon('gold')}${price}</b></div>
      ${button('구매', 'buy', 'id="shop-buy" class="primary"', disabled)}
      <details class="help"><summary aria-label="구매 안내">ⓘ</summary>
        <p>구매 후 ${this.save.gold - price} G · ${amount(weight)} / ${capacity(this.save)} kg.
        귀환서는 최대 2장. 무게 120%까지 구매 가능. 할인 ${Math.round(deriveMods(this.save).shopDiscount * 100)}%.</p>
      </details>${this.gearShopHtml()}`, 'shop');
    if (disabled) this.error(this.save.gold < price ? '골드 부족' : tooMany ? '최대 2장' : '무게 초과');
  }

  showForge() {
    const cards = this.save.items.map((item) => {
      const equipped = Object.values(this.save.equipped).includes(item.uid);
      return button(`${itemIcon(item.id, ITEMS[item.id])}<strong>${ITEMS[item.id].name}</strong>
        <small>+${item.enhance} ${equipped ? '✓' : ''}</small>`, 'select-gear',
        `data-uid="${escape(item.uid)}" class="gear-card" aria-pressed="${item.uid === this.selectedUid}"`);
    }).join('');
    const recipes = Object.entries(RECIPES).map(([id, recipe]) => {
      const cost = Object.entries(recipe).map(([key, count]) =>
        `<span class="icon-count" aria-label="${key === 'gold' ? '골드' : ITEMS[key].name} ${count}">${icon(key)}${count}</span>`).join('');
      const available = Object.entries(recipe).every(([key, count]) =>
        (key === 'gold' ? this.save.gold : this.save.stacks[key] || 0) >= count);
      return `<article class="recipe"><b>${itemIcon(id, ITEMS[id])}${ITEMS[id].name}</b>
        <div class="recipe-cost">${cost}</div>${button('제작', 'craft', `data-id="${id}"`, !available)}</article>`;
    }).join('');
    const materials = ['scrap', 'hide', 'fang', 'enhance_stone_1', 'enhance_stone_2', 'enhance_stone_3'].map((id) =>
      `<span class="icon-count" aria-label="${ITEMS[id].name} ${this.save.stacks[id] || 0}">${icon(id)}${this.save.stacks[id] || 0}</span>`).join('');
    this.showInnPanel('대장장이', `<p>${SLOTS.map((slot) => `${slot}: ${equippedItem(this.save, slot) ? escape(itemLabel(equippedItem(this.save, slot))) : '빈 슬롯'}`).join(' · ')}</p><div class="material-strip">${materials}</div>
      <div class="gear-grid">${cards}</div>
      <details class="craft-list"><summary>제작</summary><div class="recipe-grid">${recipes}</div></details>
      ${this.gearSheet()}`, 'forge');
  }

  gearSheet() {
    const item = this.save.items.find((candidate) => candidate.uid === this.selectedUid);
    if (!item) return '';
    const definition = ITEMS[item.id];
    const equipped = item.uid === equippedItem(this.save, definition.kind)?.uid;
    const comparison = compareItems(equippedItem(this.save, definition.slot), item, this.save);
    const uid = `data-uid="${escape(item.uid)}"`;
    const maxed = item.enhance >= 5;
    const cost = maxed ? {} : enhanceCost(item.enhance);
    const canEnhance = !maxed && Object.entries(cost).every(([id, count]) => (id === 'gold' ? this.save.gold : this.save.stacks[id] || 0) >= count);
    const canEquip = !equipped && !comparison.locked;
    return `<section class="gear-sheet" aria-label="장비 작업"><header><h3>${itemLabel(item)}</h3>
      ${button('×', 'close-gear', 'aria-label="닫기"')}</header>
      ${this.comparisonHtml(item)}<div class="inline-actions">
        ${button('장착', 'equip', `${uid} ${!equipped ? 'class="primary"' : ''}`, !canEquip)}
        ${button('강화', 'enhance', `${uid} ${equipped ? 'class="primary"' : ''}`, !canEnhance)}
        ${button('분해', 'dismantle', uid, equipped)}${button('판매', 'sell', uid, equipped)}</div>
      <div class="gear-cost"><span>강화 ${maxed ? 'MAX' : Object.entries(cost).map(([id, count]) => `${id === 'gold' ? '골드' : ITEMS[id].name} ${count}`).join(' · ')}</span>
        <span>분해 ${icon('scrap')}+${dismantleRefund(item)}</span></div>
    </section>`;
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
    if (this.sortieStage !== stage) this.sortieThreat = 1;
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
      <div class="weapon-choices" role="group" aria-label="위협도 선택">${[1,2,3].map(threat =>
        button(`위협 ${threat}`, 'threat', `data-threat="${threat}" aria-pressed="${(this.sortieThreat || 1) === threat}" class="${(this.sortieThreat || 1) === threat ? 'primary' : 'secondary'}"`,
          stage === 'S1' ? threat > 1 : threat > unlockedThreat(this.save, stage))).join('')}</div>
      <p>다음 위협도는 현재 위협도 완료 시 해금. 위협 2/3: HP ×${BALANCE.threats[1].hp}/${BALANCE.threats[2].hp} · 골드 ×${BALANCE.threats[1].gold}/${BALANCE.threats[2].gold}.</p>
      ${button(`${icon('depart')}출정`, 'launch', 'id="sortie-confirm" class="primary"')}
      <details class="help"><summary aria-label="출정 안내">ⓘ</summary>
        <p>${tier.text}. 킬 XP는 완료할 때만 지급. 귀환은 전리품만, 사망은 이번 전리품도 잃는다.</p>
        <label class="check"><input id="sortie-reduced" type="checkbox"
          ${matchMedia('(prefers-reduced-motion: reduce)').matches ? 'checked' : ''}>흔들림·섬광 줄이기</label></details>`, 'sortie');
  }

  launch(stage, reduced = false, weapon = null) {
    this.commit(selectThreat(this.save, stage, stage === 'S1' ? 1 : this.sortieThreat || 1));
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
      case 'threat':
        selectThreat(this.save, this.sortieStage, Number(data.threat));
        this.sortieThreat = Number(data.threat);
        return this.showSortie(this.sortieStage, this.devWeapon);
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
