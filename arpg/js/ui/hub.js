import { STAGES } from '../content/combat.js';
import { loadEffects } from '../sim/world.js';
import { QUESTIONS, resolve, FAMILIES, WEAPON_NAMES } from '../meta/quiz.js';
import { STAT_KEYS, STAT_NAMES, cap, deriveMods, allocateStats } from '../meta/stats.js';
import { xpSpan, MAX_LEVEL } from '../meta/progression.js';
import {
  ITEMS, RECIPES, ENHANCE_GOLD, ENHANCE_SCRAP, equippedItem, carriedWeight, capacity,
  buy, equip, craft, enhance, dismantle, dismantleRefund, shopPrice,
} from '../meta/items.js';
import { createSave } from '../meta/save.js';

const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
const button = (label, action, extra = '', disabled = false) =>
  `<button type="button" data-action="${action}" ${extra} ${disabled ? 'disabled' : ''}>${label}</button>`;
const itemLabel = (item) => `${ITEMS[item.id].name} +${item.enhance}`;
const amount = (value) => Number.isInteger(value) ? value : value.toFixed(1);

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
  constructor({ save, persist, startRound, resetSave, onOverlay }) {
    this.save = save;
    this.persist = persist;
    this.startRound = startRound;
    this.resetSave = resetSave;
    this.onOverlay = onOverlay;
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
      if (event.target.id === 'shop-item') this.shopId = event.target.value;
      if (event.target.id === 'shop-count') this.shopCount = Math.max(1, Math.min(99, Number(event.target.value) || 1));
      if (event.target.id === 'shop-item' || event.target.id === 'shop-count') this.showShop();
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

  panelHtml(title, content, eyebrow = '잿빛 여관') {
    return `<div class="story-panel"><p class="eyebrow">${eyebrow}</p><h2>${title}</h2>${content}
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
    const weight = carriedWeight(save);
    const tier = weightDescription(weight, capacity(save));
    const xp = save.level === MAX_LEVEL ? 'MAX' : `${amount(save.xp)} / ${xpSpan(save.level)}`;
    const ratio = save.level === MAX_LEVEL ? 1 : save.xp / xpSpan(save.level);
    return `<header class="inn-topbar"><div><b id="inn-name">${escape(save.name)}</b>
      <span id="inn-level">Lv.${save.level}</span><small>XP ${xp}</small>
      <div class="xp-track"><i style="width:${ratio * 100}%"></i></div></div>
      <div class="inn-currency"><b id="inn-gold">${save.gold} G</b>
      <span id="inn-weight" class="${tier.tier}">${amount(weight)} / ${capacity(save)} kg</span></div>
      ${button('⚙', 'settings', 'class="settings-button" aria-label="설정"')}</header>`;
  }

  showInn(intro = false) {
    this.panel = null;
    const hotspots = [
      ['owner', '여관 주인', '쉼과 지난 여정', '♨'],
      ['shop', '행상 약사', '돌아올 준비', '✚'],
      ['forge', '대장장이', '장비와 제작', '⚒'],
      ['trainer', '교관', `남은 능력치 ${this.save.statPoints}점`, '◇'],
      ['board', '게시판', '다음 길을 고르기', '▤'],
    ].map(([action, name, description, icon]) => `
      <button class="hotspot" data-action="${action}"><span class="hotspot-icon" aria-hidden="true">${icon}</span>
      <strong>${name}</strong><small>${description}</small></button>`).join('');
    const devMenu = this.dev ? `<details class="dev-menu"><summary>M0 개발 메뉴</summary>
      <label>무기<select id="dev-weapon">${FAMILIES.map((family) =>
        `<option value="${family}">${family}</option>`).join('')}</select></label>
      <label>스테이지<select id="dev-stage">${Object.keys(STAGES).map((id) =>
        `<option>${id}</option>`).join('')}</select></label>
      ${button('개발 전투 확인', 'dev-start')}</details>` : '';
    this.show(`<div class="inn-shell">${this.topBar()}<div class="inn-room">
      <div class="hearth" aria-hidden="true"><i></i></div>
      <p class="eyebrow">안전 지대 · 장비와 소재는 창고에 자동 보관</p><h1>잿빛 여관</h1>
      <p class="inn-welcome">${intro ? '“왔구나. 인장의 힘은 네가 고르고, 돌아올 길은 우리가 지킨다.”'
        : '비어 있는 의자 하나, 아직 따뜻한 불 하나.'}</p>
      <div class="hotspots">${hotspots}</div>${devMenu}
      <p id="meta-error" role="alert"></p></div></div>`, 'inn');
  }

  showInnPanel(title, content, panel) {
    this.panel = panel;
    this.show(`<div class="inn-shell">${this.topBar()}${this.panelHtml(title, `
      ${content}${button('난로 곁으로', 'inn', 'class="secondary"')}`)}</div>`, panel);
  }

  showOwner() {
    const summary = this.receipt ? this.receiptHtml(this.receipt) : '<p>아직 정산된 여정이 없다.</p>';
    this.showInnPanel('“돌아온 것부터가 잘한 일이지.”', `
      <p>여관에 들어오면 HP와 MP가 전부 회복된다. 다음 출정도 완전 회복 상태로 시작한다.</p>
      ${button('무료 휴식', 'rest')}<h3>지난 여정</h3>${summary}`, 'owner');
  }

  showShop() {
    const price = shopPrice(this.save, this.shopId) * this.shopCount;
    const weight = carriedWeight(this.save) + ITEMS[this.shopId].weight * this.shopCount;
    const tier = weightDescription(weight, capacity(this.save));
    const tooMany = this.shopId === 'return_scroll' && (this.save.stacks.return_scroll || 0) + this.shopCount > 2;
    const disabled = this.save.gold < price || weight > capacity(this.save) * 1.2 || tooMany;
    this.showInnPanel('행상 약사 · 살아 돌아오기', `
      <label>보급품<select id="shop-item">${['potion', 'mana_potion', 'return_scroll'].map((id) =>
        `<option value="${id}" ${id === this.shopId ? 'selected' : ''}>${ITEMS[id].name}</option>`).join('')}
      </select></label>
      <label>수량<input id="shop-count" type="number" value="${this.shopCount}" min="1" max="99"></label>
      <div class="quote"><b id="shop-total">총 ${price} G</b><span>구매 후 골드 ${this.save.gold - price} G</span>
      <span class="${tier.tier}">구매 후 ${amount(weight)} / ${capacity(this.save)} kg · ${tier.text}</span></div>
      <p>HP 물약 ${this.save.stacks.potion || 0} · 마나 물약 ${this.save.stacks.mana_potion || 0}
      · 주문서 ${this.save.stacks.return_scroll || 0} / 2</p>
      <p class="muted">판매 없음. 할인 ${Math.round(deriveMods(this.save).shopDiscount * 100)}% · 소수 가격 올림.</p>
      ${button('구매', 'buy', 'id="shop-buy"', disabled)}`, 'shop');
  }

  showForge() {
    const cards = this.save.items.map((item) => {
      const definition = ITEMS[item.id];
      const current = equippedItem(this.save, definition.kind);
      const equipped = item.uid === current.uid;
      const candidate = structuredClone(this.save);
      candidate.equipped[definition.kind] = item.uid;
      const before = deriveMods(this.save);
      const after = deriveMods(candidate);
      const comparison = definition.kind === 'weapon'
        ? `위력 ×${before.dmgMult[before.family].toFixed(2)} → ×${after.dmgMult[after.family].toFixed(2)}`
        : `최대 HP ${amount(before.maxHp)} → ${amount(after.maxHp)}`;
      const uid = `data-uid="${escape(item.uid)}"`;
      const enhanceCost = item.enhance < 5
        ? `${ENHANCE_SCRAP[item.enhance]} 고철 + ${ENHANCE_GOLD[item.enhance]} G` : '최대 강화';
      return `<article class="item-card"><h3>${itemLabel(item)} ${equipped ? '· 장착' : ''}</h3>
        <p>${definition.rarity} · Lv${definition.requiredLevel} · ${definition.weight} kg</p>
        <p>${comparison} · 운반 ${amount(carriedWeight(this.save))} → ${amount(carriedWeight(candidate))} kg</p>
        <div class="inline-actions">
        ${button('장착', 'equip', uid, equipped || this.save.level < definition.requiredLevel)}
        ${button(`분해 +${dismantleRefund(item)} 고철`, 'dismantle', uid, equipped)}
        ${button(`강화 · ${enhanceCost}`, 'enhance', uid, item.enhance >= 5)}</div></article>`;
    }).join('');
    const recipes = Object.entries(RECIPES).map(([id, recipe]) => {
      const cost = Object.entries(recipe)
        .map(([key, count]) => `${count} ${key === 'gold' ? 'G' : ITEMS[key].name}`).join(' + ');
      const available = Object.entries(recipe).every(([key, count]) =>
        (key === 'gold' ? this.save.gold : this.save.stacks[key] || 0) >= count);
      return `<article class="recipe"><b>${ITEMS[id].name}</b><small>${cost}</small>
        ${button('제작', 'craft', `data-id="${id}"`, !available)}</article>`;
    }).join('');
    this.showInnPanel('대장장이 · 낡은 것에서 새것으로', `
      <p class="muted">창고 장비·소재 무게 0. 장착품과 보급품만 출정 무게에 포함된다.</p>
      <p>고철 ${this.save.stacks.scrap || 0} · 가죽 ${this.save.stacks.hide || 0} · 송곳니 ${this.save.stacks.fang || 0}</p>
      ${cards}<h3>제작</h3>${recipes}
      <p class="muted">제작품 분해는 레시피 고철의 25%만. 강화 투자·골드는 돌려주지 않는다.</p>`, 'forge');
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
    const content = `<p id="allocation-left">남은 ${remaining}점 · 능력치별 상한 ${cap(this.save.level)}</p>${rows}
      <p class="muted">HP ${amount(preview.maxHp)} · MP ${amount(preview.maxMp)} · 용량 ${preview.capacity} kg</p>
      ${button('인장에 새기기 · 확인', 'allocate', 'id="allocation-confirm"', required ? remaining !== 0 : spent === 0)}
      ${required ? '' : button('난로 곁으로', 'inn', 'class="secondary"')}`;
    this.show(`<div class="inn-shell">${this.topBar()}${this.panelHtml(required ? '레벨이 올랐다' : '교관 · 인장의 힘',
      content, required ? `Lv.${this.save.level} · 능력치 ${this.save.statPoints}점 획득` : '재분배는 후속 업데이트')}</div>`,
    required ? 'level-up' : 'trainer');
  }

  showBoard() {
    const stages = Object.keys(STAGES).map((id, index, order) => {
      const unlocked = index === 0 || this.save.cleared[order[index - 1]];
      return `<article class="contract"><div><b>${id} · ${STAGES[id].name}</b>
        <small>${this.save.cleared[id] ? '재도전 · 클리어 XP 25%' : unlocked ? '새로운 계약' : '이전 계약을 완료하세요'}</small></div>
        ${button(unlocked ? '출정 준비' : '잠김', 'sortie', `data-stage="${id}"`, !unlocked)}</article>`;
    }).join('');
    this.showInnPanel('게시판 · 돌아올 길을 남겨라', stages, 'board');
  }

  showSortie(stage, devWeapon = null) {
    this.sortieStage = stage;
    this.devWeapon = devWeapon;
    const weight = carriedWeight(this.save);
    const tier = weightDescription(weight, capacity(this.save));
    const threats = {
      S1: '공격하지 않는 허수아비 · 30초 연습',
      S2: '고블린 2 + 투석병 · 회피와 보급을 익힐 길',
      S3: '철갑 멧돼지 + 고블린 · 붉게 잠긴 돌진의 옆으로',
      S4: '정예 대장 + 고블린 + 투석병 · 사망 시 현재 구간 XP 일부 손실',
    };
    this.showInnPanel(`${stage} · ${STAGES[stage].name}`, `
      <p>${threats[stage]}</p><p>현재 Lv.${this.save.level} · 장착 ${itemLabel(equippedItem(this.save, 'weapon'))}</p>
      <div class="quote ${tier.tier}"><b>${amount(weight)} / ${capacity(this.save)} kg</b>
      <span>${tier.text}</span></div>
      <p>HP 물약 ${this.save.stacks.potion || 0} · 마나 물약 ${this.save.stacks.mana_potion || 0}
      · 귀환 ${this.save.stacks.return_scroll || 0} / 2</p>
      <p class="muted">킬 XP는 완료할 때만 지급. 귀환은 전리품만, 사망은 이번 전리품도 잃는다.</p>
      <label class="check"><input id="sortie-reduced" type="checkbox"
      ${matchMedia('(prefers-reduced-motion: reduce)').matches ? 'checked' : ''}>흔들림·섬광 줄이기</label>
      ${button('확인 · 출정', 'launch', 'id="sortie-confirm"')}`, 'sortie');
  }

  launch(stage, reduced = false, weapon = null) {
    this.root.hidden = true;
    this.startRound(stage, reduced, weapon);
  }

  receiptHtml(receipt) {
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
    const title = { clear: '여정 완료', return_scroll: '귀환 성공', death: '여정 실패' }[receipt.terminal];
    this.show(this.panelHtml(title, `
      <p id="cause">${escape(cause)}</p>${this.receiptHtml(receipt)}
      ${button('여관으로', 'result-inn', 'id="result-back"')}`, `${receipt.stageId} · 여정 정산`), 'receipt');
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
      case 'result-inn': return this.showInn(this.receipt?.stageId === 'S1');
      case 'owner': return this.showOwner();
      case 'rest':
        this.commit(structuredClone(this.save));
        this.showOwner();
        return this.error('HP·MP 회복 완료. 다음 출정 준비가 끝났다.');
      case 'shop': return this.showShop();
      case 'buy':
        this.commit(buy(this.save, this.shopId, this.shopCount));
        return this.showShop();
      case 'forge': return this.showForge();
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
