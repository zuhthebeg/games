import { knightFormName } from '../content/player-lineages.js';
import { REGIONS, REGION_EDGES, MAPS, mapUnlocked, mapState, availableStages, regionFor } from '../content/world-map.js';
import { SIDE_QUESTS, OBJECTIVE_QUESTS } from '../content/quest-expansion.js';
import { acceptQuest, questOffered, questState } from '../meta/quest-progress.js';
import { BALANCE, attackRate } from '../content/balance.js';
import { unlockedThreat, clearedThreat, selectThreat } from '../meta/run.js';
import { SLOTS, ECONOMY } from '../meta/economy.js';
import { shopStock, buyGear, sellItem, refreshShop, refreshPrice, gearPrice, stackSellPrice, sellStack } from '../meta/shop.js';
import { compareItems } from '../meta/compare.js';
import { MONSTER_VARIANTS } from '../content/monsters.js';
import { STAGES, ABILITIES, canUseSkill, WEAPONS, weaponAttackMultiplier, SILVER_UNDEAD_MULTIPLIER } from '../content/combat.js';
import { BOOKS, DEFAULT_SKILLS, hasSkill, learnSkill, equipSkill, SKILL_DISPLAY, characterSkills, loadoutOf, setSlot, slotOf, weaponFamily, weaponForm, weaponLoadoutCandidate } from '../meta/skills.js';
import { loadEffects } from '../sim/world.js';
import { QUESTIONS, resolve, FAMILIES, WEAPON_NAMES } from '../meta/quiz.js';
import { STAT_KEYS, STAT_NAMES, cap, deriveMods, allocateStats, effectiveStats } from '../meta/stats.js';
import { xpSpan, MAX_LEVEL } from '../meta/progression.js';
import {
  ITEMS, RECIPES, equippedItem, carriedWeight, capacity, effectiveWeight,
  buy, equip, craft, dismantle, dismantleMaterial, dismantleRefund, dismantleStones, shopPrice, moveConsumable,
} from '../meta/items.js';
import { enchant, enchantPreview, crackGreaterStone } from '../meta/enchant.js';
import { noteMaterials, seenMaterials, recipeRevealed } from '../meta/recipe-discovery.js';
import { ENCHANT, STONE, GREATER_STONE, ENCHANT_STONES } from '../meta/economy.js';
import { createSave, DEFAULT_AUTO_BUY, RETIRED_SCROLLS } from '../meta/save.js';
import { AUTO_USE_LEVELS, autoUseSettings, validAutoUse } from '../meta/auto-use.js';
import { icon, itemIcon } from './icons.js';
import { ACADEMY, FAMILY_LABELS, skillIcon, skillCardHtml, loadoutHtml, weaponWarnHtml, skillUse } from './skill-view.js';
import { supplyQuote, purchaseLedgerHtml, autoBuySupplies } from './shop-view.js';
import { playEnchantFx, ritualCircleHtml } from './enchant-fx.js';
import {
  escape, amount, itemLabel, dropOriginHtml, emblem, isWorn, SLOT_NAMES, GRADES, GRADE_ORDER,
  linesHtml, splitComparisonHtml, comparisonFor, cardHtml, portraitHtml, socketsHtml, itemDetailsHtml,
} from './gear-view.js';

import { setPortraitDirection, PORTRAIT_DIRECTIONS } from '../render/paperdoll-portrait.js';

export { getHeroPortrait } from './gear-view.js';

const button = (label, action, extra = '', disabled = false) =>
  `<button type="button" data-action="${action}" ${extra} ${disabled ? 'disabled' : ''}>${label}</button>`;

const sellPrice = item => Math.floor(gearPrice(item) * ECONOMY.sellFraction);
const UNDEAD_RECOMMENDATION = '<p class="undead-recommendation">언데드 다수 출현 · 성속성·턴 언데드·은 무기 추천 (일반 무기도 가능, 보스에게 턴 언데드는 낮은 확률)</p>';
const SILVER_SOURCE = `<p class="silver-source">은 주괴 · ${escape(ITEMS.silver_ingot.description)}</p>`;
const silverSourceStage = id => BALANCE.stages[id]?.huntTier >= 2
  && STAGES[id]?.spawns.some(s => MONSTER_VARIANTS[s.monster]?.lifeState === 'construct'
    && !MONSTER_VARIANTS[s.monster].speciesTags.includes('trainingDummy'));
const SUPPLIES = ['potion', 'mana_potion', 'return_scroll'];
const pct = (value) => `${Math.round(value * 100)}%`;

// Actual local SDXL art; labels and all actions remain native DOM elements.
const innImage = (subject, className = 'facility-art', size = 160) =>
  `<img class="${className}" src="assets/inn/${subject}.webp" width="${size}" height="${size}" alt="" decoding="async" draggable="false">`;
const ROOM_ART = `${innImage('inn-room', 'room-art', 960)}
  <div class="inn-hearth" aria-hidden="true">${innImage('hearth', 'hearth-art')}
    <div class="inn-fire" aria-hidden="true"><i class="inn-fire-halo"></i>
      <i class="inn-flame inn-flame-outer"></i><i class="inn-flame inn-flame-middle"></i><i class="inn-flame inn-flame-core"></i>
      <i class="inn-ember inn-ember-one"></i><i class="inn-ember inn-ember-two"></i><i class="inn-ember inn-ember-three"></i>
    </div>
  </div>`;

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
  constructor({ save, persist, startRound, resetSave, onOverlay, recoverVitals = () => {}, canInteract = () => true, initialCharacters = null }) {
    this.initialCharacters = initialCharacters;
    this.canInteract = canInteract;
    this.save = save;
    this.persist = persist;
    this.startRound = startRound;
    this.resetSave = resetSave;
    this.onOverlay = onOverlay;
    this.recoverVitals = recoverVitals;
    this.selectedUid = null;
    this.portraitDirection = 'SW';
    this.root = document.querySelector('#meta-screen');
    // CSS animations stop in background tabs, with no per-frame JS or save writes.
    const fireVisibility = () => { this.root.dataset.innFirePaused = String(document.hidden); };
    document.addEventListener('visibilitychange', fireVisibility);
    fireVisibility();
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
      if (target.matches('.character-portrait') && event.detail > 0 && this.portraitDragged) {
        this.portraitDragged = false;
        event.preventDefault();
        return;
      }
      try {
        this.action(target.dataset.action, target.dataset);
      } catch (error) {
        this.error(error.message);
      }
    });
    this.root.addEventListener('keydown', event => {
      const tab = event.target.closest('[data-action="academy-tab"], [data-action="skill-family-tab"]');
      if (!tab || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault();
      const index = FAMILIES.indexOf(tab.dataset.family);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? FAMILIES.length-1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + FAMILIES.length) % FAMILIES.length;
      this.action(tab.dataset.action,{family:FAMILIES[next]});
    });
    // Capture keeps rotation working when a finger leaves the portrait hitbox.
    let rotation;
    this.root.addEventListener('pointerdown', event => {
      const node = event.target.closest('.character-portrait');
      if (!node || !event.isPrimary || event.button !== 0) return;
      this.portraitDragged = false;
      rotation = { node, id: event.pointerId, x: event.clientX,
        index: PORTRAIT_DIRECTIONS.indexOf(this.portraitDirection) };
      node.setPointerCapture(event.pointerId);
    });
    this.root.addEventListener('pointermove', event => {
      if (!rotation || rotation.id !== event.pointerId) return;
      const dx = event.clientX - rotation.x;
      if (Math.abs(dx) < 12 && !this.portraitDragged) return;
      this.portraitDragged = true;
      const step = Math.trunc(dx / 24);
      const index = ((rotation.index + step) % 8 + 8) % 8;
      this.portraitDirection = PORTRAIT_DIRECTIONS[index];
      setPortraitDirection(rotation.node.querySelector('.p2-hero'), this.portraitDirection);
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      this.root.addEventListener(type, event => {
        if (!rotation || rotation.id !== event.pointerId) return;
        rotation = null;
      });
    }
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
      if (event.target.id === 'compare-ignore-enhancement') {
        this.ignoreEnhancement = event.target.checked;
        event.target.defaultChecked = event.target.checked; // Confirmation cancellation restores serialized sheets.
        return this.refreshComparison();
      }
      if (event.target.id !== 'shop-count') return;
      this.shopCount = Math.max(1, Math.min(99, Math.trunc(Number(event.target.value)) || 1));
      this.openSupply();
    });
  }

  ready() {
    if (this.initialCharacters) return this.showCharacterChoice();
    if (this.save) this.showInn();
    else this.showIntro();
  }

  // keepScroll: an in-place re-render of the same page (a +/− or slot tap) keeps the reading position and the pressed control.
  show(html, page, { shell = false, keepScroll = false } = {}) {
    this.pendingEquipment = null;
    const keep = keepScroll && this.root.dataset.page === page;
    const scroll = keep ? this.root.querySelector('.inn-shell>.content')?.scrollTop || 0 : 0;
    const active = keep ? document.activeElement : null;
    const focusKey = active && this.root.contains(active) && !active.closest('dialog') && active.dataset?.action ? { ...active.dataset } : null;
    this.enchantFx?.close();
    this.root.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
    this.onOverlay();
    document.querySelector('#hud').hidden = true;
    this.root.hidden = false;
    this.root.dataset.page = page;
    // Only committed skeleton context owns the theme; selection/creation stays neutral.
    if (shell && this.save?.lineage === 'skeleton_knight') document.body.dataset.theme = 'graveyard';
    else delete document.body.dataset.theme;
    this.root.classList.toggle('shell-mode', shell);
    this.root.innerHTML = html;
    this.root.scrollTop = 0;
    this.sheetOrigin = null;
    const content = keep && this.root.querySelector('.inn-shell>.content');
    if (content) content.scrollTop = scroll;
    const heading = this.root.querySelector('h1, h2');
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
    if (focusKey) {
      const same = [...this.root.querySelectorAll('[data-action]')].find(node => Object.keys(focusKey).length === Object.keys(node.dataset).length
        && Object.entries(focusKey).every(([key, value]) => node.dataset[key] === value));
      if (same && !same.disabled) same.focus({ preventScroll: true });
    }
  }

  error(message) {
    const node = this.root.querySelector('dialog[open] #sheet-error') || this.root.querySelector('#meta-error');
    if (node) node.textContent = message;
  }

  commit(next) {
    if (this.canInteract?.() === false) throw new Error('언데드 디버그 저장 금지');
    next = noteMaterials(next);
    this.persist(next);
    this.save = next;
  }

  // --- Story panels (intro, name, quiz) keep the centred card layout. ---

  panelHtml(title, content, eyebrow = '') {
    return `<div class="story-panel">${eyebrow ? `<p class="eyebrow">${eyebrow}</p>` : ''}<h2>${title}</h2>${content}
      <p id="meta-error" role="alert"></p></div>`;
  }

  showCharacterChoice() {
    this.creationLineage = null; this.answers = []; this.name = ''; this.chosenWeapon = undefined;
    this.show(this.panelHtml('어떤 모습으로 깨어날까', `
      <p>캐릭터는 이 브라우저의 독립 슬롯에 보관됩니다.</p>
      ${button('인간 · 기존 모험 / 이어하기', 'choose-human')}
      ${button('해골 · 생성 / 이어하기', 'choose-skeleton')}`), 'character-choice');
  }

  showIntro() {
    this.show(this.panelHtml('문 너머의 불빛', `
      <p class="story">이세계로 소환되었다.<br>낯선 하늘 아래, 꺼지지 않은 여관의 불빛이 보인다.<br>
      손등의 인장이 당신에게 이름을 묻는다.</p>
      ${button('인장에 이름 새기기', 'name')}${this.initialCharacters ? button('캐릭터 선택', 'character-choice') : ''}`, 'UNTITLED · M1'), 'intro');
  }

  showName() {
    this.show(this.panelHtml('어떤 이름으로 불릴까', `
      <form id="name-form"><label for="hero-name">이름 · 1~12자</label>
      <input id="hero-name" name="name" autocomplete="off" maxlength="24" required>
      <button type="submit" id="name-next">기억을 따라가기</button></form>${this.initialCharacters ? button('생성 취소 · 캐릭터 선택', 'character-choice') : ''}`), 'name');
    this.root.querySelector('input').focus();
  }

  showQuiz() {
    const index = this.answers.length;
    const question = QUESTIONS[index];
    const dots = QUESTIONS.map((_, position) =>
      `<i class="${position <= index ? 'lit' : ''}" aria-hidden="true"></i>`).join('');
    const choices = question.options.map((option, choice) =>
      button(escape(option.text), 'answer', `data-choice="${choice}" class="quiz-option"`)).join('');
    const hiddenChoice = index === 0 && this.initialCharacters && this.creationLineage !== 'skeleton_knight'
      ? button('인간을 증오한다.', 'answer-skeleton', 'class="quiz-option"') : '';
    this.show(this.panelHtml(escape(question.text), `
      <div class="quiz-dots" aria-label="문답 ${index + 1} / 5">${dots}</div>
      <div class="choice-list">${choices}${hiddenChoice}</div>${this.initialCharacters ? button('생성 취소 · 캐릭터 선택', 'character-choice') : ''}`, `소환 문답 · ${index + 1} / 5`), 'quiz');
  }

  showQuizResult() {
    const result = resolve(this.answers);
    this.chosenWeapon ??= result.weapon;
    const bars = STAT_KEYS.map((key) => `
      <div class="stat-preview"><span>${STAT_NAMES[key]}</span><meter min="0" max="${3 * BALANCE.stats.pointScale}"
      value="${result.points[key]}"></meter><b>${BALANCE.stats.base} + ${result.points[key]}</b></div>`).join('');
    const knight = this.creationLineage === 'skeleton_knight';
    const choices = FAMILIES.map((family) => button(WEAPON_NAMES[family], 'override',
      `data-family="${family}" aria-pressed="${family === this.chosenWeapon}"`)).join('');
    this.show(this.panelHtml('인장이 응답했다', `
      <p>${escape(this.name)}, ${knight ? '해골 · 무기: <b>검</b>' : `당신에게 이끌린 무기는 <b>${WEAPON_NAMES[result.weapon]}</b>`}.</p>
      ${bars}<p class="muted">${knight ? '문답 능력치 그대로 · 기존 근접 무기 규칙을 사용합니다.</p>' : `초기 능력치 ${BALANCE.stats.startPoints}점은 그대로 유지된다. 무기만 바꿀 수 있다.</p>
      <div class="weapon-choices">${choices}</div>`}
      ${button(knight ? '해골 생성 · 잊힌 묘지로' : '소환 시험으로 · 30초', 'create', 'id="quiz-start"')}${this.initialCharacters ? button('생성 취소 · 캐릭터 선택', 'character-choice') : ''}`), 'quiz-result');
  }

  // --- Brass-ledger shell: header → scrolling content → one primary action. ---

  // Presentation only: permanent DeathKnight keeps the skeleton lineage/save key.
  hubCopy(human, graveyard) {
    return this.save?.lineage === 'skeleton_knight' ? graveyard : human;
  }

  money() {
    return `<span class="money" id="inn-gold" aria-label="골드 ${this.save.gold}">${icon('gold')}${this.save.gold}</span>`;
  }

  topBar() {
    const save = this.save;
    const ratio = save.level === MAX_LEVEL ? 1 : save.xp / xpSpan(save.level);
    return `<header class="game-header"><div class="identity"><span class="seal" aria-hidden="true">${save.level}</span>
      <div><strong id="inn-name">${escape(save.name)}${save.lineage === 'skeleton_knight' ? ` · ${knightFormName(save)}` : ''} <span class="muted" id="inn-level">Lv.${save.level}</span></strong>
      <div class="xp-line" role="meter" aria-label="경험치" aria-valuemin="0" aria-valuemax="100"
        aria-valuenow="${Math.round(ratio * 100)}"><i style="width:${ratio * 100}%"></i></div></div></div>
      ${this.money()}
      ${this.initialCharacters ? button('캐릭터 선택', 'character-choice') : ''}
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

  showInnPanel(title, content, panel, footer = '', { eyebrow = '', back = 'inn', keepScroll = false } = {}) {
    this.panel = panel;
    this.show(this.shellHtml(this.panelHeader(title, eyebrow, back), content, footer), panel, { shell: true, keepScroll });
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
    const portrait = button(`${portraitHtml(this.save, this.portraitDirection || 'SW')}${this.save.statPoints ? `<b class="badge alert">${this.save.statPoints}</b>` : ''}`, 'character',
      `class="character-portrait" aria-label="${this.hubCopy('캐릭터', '영혼의 제단')}${this.save.statPoints ? ` · 미분배 ${this.save.statPoints}점` : ''}"`);
    const room = `<div class="p2-room">${ROOM_ART}${portrait}<div class="body-sockets" aria-hidden="true">${pins}</div>${socketsHtml(this.save)}</div>`;
    const npcs = [
      ['shop', '만물상', 'supplies'], ['merchant', this.hubCopy('장비상', '도굴꾼'), 'merchant'], ['forge', this.hubCopy('대장장이', '저주받은 대장장이'), 'smith'],
      ['trainer', '아카데미', 'academy'], ['inventory', this.hubCopy('창고', '묘실의 유품함'), 'storage'], ['bag', '가방', 'bag'],
    ].map(([action, name, subject]) => button(`${innImage(subject)}<strong>${name}</strong>`, action, `class="hotspot hotspot-${action}"`)).join('');
    const devMenu = this.dev ? `<details class="dev-menu"><summary>M0 개발 메뉴</summary>
      <label>무기<select id="dev-weapon">${FAMILIES.map(family => `<option value="${family}">${family}</option>`).join('')}</select></label>
      <label>스테이지<select id="dev-stage">${Object.keys(STAGES).map(id => `<option>${id}</option>`).join('')}</select></label>
      ${button('개발 전투 확인', 'dev-start')}</details>` : '';
    const content = `<h1 class="${this.hubCopy('sr-only', 'section-title')}">${this.hubCopy('잿빛 여관', '잊힌 묘지')}</h1>${this.equipmentNotice ? `<p class="equipment-notice" role="status">${escape(this.equipmentNotice)}</p>` : ''}${this.save.lineage === 'skeleton_knight' ? `<p class="minor">${knightFormName(this.save)} · 무기 Lv1 / 손 Lv8 / 발 Lv15 / 몸 Lv22 / 머리 Lv30 · 협동 미지원<br>${this.save.permanentDeathKnight ? '데스나이트 영구 진화 완료 · 장비 해제 후에도 유지' : '다섯 부위 모두 장착하면 데스나이트 영구 진화'}<br>${this.save.permanentDeathKnight ? '데스나이트 전투 아틀라스 로드 · 실패 시 대체 외형/오류 표시' : '맨뼈 기본 외형 · 실제 장착 부위만 표시 · 전용 회피 동작'}<br>인간 AI 외형 · 기존 공격/전투 속성/드랍 유지</p>` : ''}${room}
      <p class="recovery inn-recovery">${icon('clear')}<strong>${this.hubCopy('HP·MP 회복', '관에서 안식')}</strong>
        <span>HP <b>${amount(mods.maxHp)}</b> · 공격 <b>×${amount(mods.dmgMult[mods.family] * weaponAttackMultiplier(false, WEAPONS[mods.family].basic, null, mods.handedness))}</b></span></p>
      ${this.save.retiredScrolls?.length ? `<details class="retired-scrolls"><summary>폐지된 주문서 보관 기록 · 사용·교환 불가</summary><ul>${this.save.retiredScrolls.map(entry => `<li>${escape(RETIRED_SCROLLS[entry.id])} ${amount(entry.count)}개 · ${entry.source === 'stacks' ? '소지품' : entry.source === 'lootKept' ? '직전 전투 획득 기록' : '직전 전투 손실 기록'}</li>`).join('')}</ul></details>` : ''}${this.weightHtml()}<nav class="npc-grid" aria-label="${this.hubCopy('여관 사람들', '묘지의 조력자들')}">${npcs}</nav>${devMenu}`;
    this.show(this.shellHtml(this.topBar(), content, button(`${innImage('map', 'board-art', 56)}<span>${this.hubCopy('퀘스트 고르기', '묘지 밖으로 출정')}</span>${icon('depart')}`, 'board', 'class="primary"')), 'inn', { shell: true });
  }

  characterHtml() {
    const mods = deriveMods(this.save);
    const weight = carriedWeight(this.save), limit = capacity(this.save);
    const rate = attackRate(mods.attackSpeedBonus, mods.weaponWeight, weight / limit, mods.armorWeight, mods.family);
    return `<section class="character-summary"><h3>${escape(this.save.name)}${this.save.lineage === 'skeleton_knight' ? ` · ${knightFormName(this.save)}` : ''} · Lv.${this.save.level}</h3>
      <p class="minor">XP ${amount(this.save.xp)} / ${this.save.level === MAX_LEVEL ? 'MAX' : xpSpan(this.save.level)}</p>
      <div class="ledger"><div><span>HP / MP</span><b>${amount(mods.maxHp)} / ${amount(mods.maxMp)}</b></div>
      <div><span>공격 배율</span><b>×${amount(mods.dmgMult[mods.family] * weaponAttackMultiplier(false, WEAPONS[mods.family].basic, null, mods.handedness))}</b></div>
      <div><span>공격 속도</span><b>×${amount(rate)}</b></div>
      <div><span>기술</span><b>${loadoutOf(this.save).filter(Boolean).map(id => escape(ABILITIES[id].name)).join(' · ')}</b></div></div>${this.weightHtml()}</section>
      <h3 class="section-title">${this.hubCopy('능력치 분배', '영혼의 제단')}</h3>`;
  }

  // --- Bag / weightless stash ---

  stackRowsHtml(stacks, { source = 'bag', sell = false, destination = null, kind = null } = {}) {
    const rows = Object.entries(stacks).filter(([id, count]) => count > 0 && (!kind || ITEMS[id].kind === kind)).map(([id, count]) => {
      const args = `data-id="${id}" data-source="${source}"${destination ? ` data-destination="${destination}"` : ''}`;
      const controls = (sell || destination) ? `<div class="stack-counts" role="group" aria-label="${ITEMS[id].name} ${sell ? '판매' : '이동'} 수량">${[1, 5, count].map((n, i) =>
        button(i === 2 ? '전부' : String(n), sell ? 'sell-stack' : 'move-stack', `${args} data-count="${n}"`, n > count)).join('')}</div>` : '';
      return `<article class="stack-row"><div class="stack-heading"><span class="item-emblem">${itemIcon(id, ITEMS[id])}</span>
        <div><strong>${ITEMS[id].name}</strong><small>${count}개${sell ? ` · 개당 ${stackSellPrice(id)} G` : destination ? ` · ${destination === 'stash' ? this.hubCopy('창고로 맡기기', '유품함으로 맡기기') : '가방으로 꺼내기'}` : ''}</small>${ITEMS[id].description ? `<small>${escape(ITEMS[id].description)}</small>` : ''}</div></div>${controls}</article>`;
    }).join('');
    return `<div class="stack-list">${rows || '<p class="muted">보관 중인 물품이 없다.</p>'}</div>`;
  }

  showBag() {
    const worn = SLOTS.map(slot => {
      const item = equippedItem(this.save, slot);
      return button(`<span>${SLOT_NAMES[slot]}</span><strong>${item ? escape(itemLabel(item)) : '비어 있음'}</strong>`, 'socket', `data-slot="${slot}" class="bag-equipped"`);
    }).join('');
    this.showInnPanel('가방', `${this.weightHtml()}<h3 class="section-title">착용 장비</h3><div class="bag-equipment">${worn}</div>
      <h3 class="section-title">소지 소모품</h3>
      ${this.stackRowsHtml(this.save.stacks, { destination: 'stash', kind: 'consumable' })}`, 'bag', '', { eyebrow: '출정 시 가져가는 물품' });
  }

  showInventory() {
    this.stashTab ??= 'gear';
    const tabs = [['gear', '장비'], ['material', '재료'], ['consumable', '소모품']].map(([tab, label]) =>
      button(label, 'stash-tab', `data-tab="${tab}" aria-pressed="${this.stashTab === tab}"`)).join('');
    const tabHtml = `<div class="p2-merchant-tabs" role="group" aria-label="${this.hubCopy('창고 종류', '유품함 종류')}">${tabs}</div>`;
    if (this.stashTab !== 'gear') {
      const supplies = this.stashTab === 'consumable';
      return this.showInnPanel(this.hubCopy('창고', '묘실의 유품함'), `${tabHtml}
        ${this.stackRowsHtml(supplies ? this.save.stash.stacks : this.save.stacks, { source: supplies ? 'stash' : 'bag', kind: this.stashTab, destination: supplies ? 'bag' : null })}`,
      'inventory', '', { eyebrow: this.hubCopy('창고 · 무게 없음', '유품함 · 무게 없음') });
    }
    this.filter ??= 'all';
    this.sort ??= 'grade';
    const items = this.save.items.filter(item => !isWorn(this.save, item.uid) && (this.filter === 'all' || ITEMS[item.id].slot === this.filter));
    const rank = item => GRADE_ORDER.indexOf(ITEMS[item.id].rarity);
    items.sort((a, b) => {
      if (this.sort === 'weight') return effectiveWeight(a) - effectiveWeight(b);
      if (this.sort === 'recent') return this.save.items.indexOf(b) - this.save.items.indexOf(a);
      return rank(b) - rank(a) || b.enhance - a.enhance;
    });
    const filters = ['all', ...SLOTS].map(slot => button(slot === 'all' ? '전체' : SLOT_NAMES[slot], 'filter',
      `data-slot="${slot}" aria-pressed="${this.filter === slot}"`)).join('');
    const cards = items.map(item => cardHtml(item, this.save, { compact: true, note: isWorn(this.save, item.uid) ? '착용 중' : '' })).join('');
    this.showInnPanel(this.hubCopy('창고', '묘실의 유품함'), `${tabHtml}<div class="p2-filters" role="group" aria-label="부위">${filters}</div>
      <div class="p2-toolbar"><span>${items.length}개</span>${button(`정렬 · ${{ grade: '등급', recent: '최근', weight: '무게' }[this.sort]}`, 'sort')}</div>
      <div class="p2-grid">${cards || `<p class="muted">비어 있음 · 몬스터 드랍이나 ${this.hubCopy('장비상', '도굴꾼')}에서 얻는다</p>`}</div>`, 'inventory', '', { eyebrow: this.hubCopy('창고 · 무게 없음', '유품함 · 무게 없음') });
  }

  // --- Comparison sheet: current → candidate per line, then one primary action. ---

  dialogHtml(title, body, footer = '') {
    return `<dialog class="p2-sheet" aria-label="${escape(title)}"><header><h2>${escape(title)}</h2>${button(icon('back') + '닫기', 'close-sheet', 'class="sheet-close"')}</header>`
      + `<div class="p2-sheet-body">${body}<p id="sheet-error" role="alert"></p></div>${footer ? `<footer>${footer}</footer>` : ''}</dialog>`;
  }

  mountSheet(html) {
    const active = document.activeElement;
    const focusKey = active?.closest('dialog[open]') ? { id:active.id, action:active.dataset.action, step:active.dataset.step } : null;
    const origin = this.sheetOrigin || active;
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
    if (focusKey) {
      const replacement = focusKey.id ? dialog.querySelector(`#${focusKey.id}`) : [...dialog.querySelectorAll('[data-action]')].find(node => node.dataset.action === focusKey.action && node.dataset.step === focusKey.step);
      if (replacement && !replacement.disabled) replacement.focus({preventScroll:true});
    }
  }

  closeSheet() {
    if (this.pendingEquipment) return this.cancelEquipment();
    this.root.querySelector('dialog[open]')?.close();
  }

  equipmentDraft(action, uid) {
    const bought = action === 'buy-equip' ? buyGear(this.save, uid) : this.save;
    const targetUid = action === 'buy-equip' ? bought.items.at(-1).uid : uid;
    return equip(bought, targetUid);
  }

  beginEquipment(action, uid) {
    if (this.pendingEquipment || (action !== 'buy-equip' && uid === this.save.equipped.weapon)) return;
    const next = this.equipmentDraft(action, uid);
    if (next.equipped.weapon === this.save.equipped.weapon) {
      this.commit(next); // Non-weapon gear retains the existing immediate flow.
      return this.finishEquipment(action, uid);
    }
    const candidate = weaponLoadoutCandidate(this.save, next);
    if (candidate.reason === 'same-form' && !(this.save.equipped.offhand && !next.equipped.offhand)) {
      this.commit(candidate.save);
      return this.finishEquipment(action, uid);
    }
    const active = document.activeElement;
    const pending = { action, uid, source: JSON.stringify(this.save),
      token: this.equipmentToken = (this.equipmentToken || 0) + 1,
      returnSheet: this.root.querySelector('dialog[open]')?.outerHTML.replace(' open=""', ''),
      focus: active?.dataset ? { ...active.dataset } : null, origin: active };
    const reasons = { remembered:'이전 세트 복원', current:'현재 스킬 유지', 'same-form':'같은 형태 · 현재 스킬 유지',
      unseen:'첫 형태 · 현재 스킬 유지', unusable:'기억한 스킬 사용 불가 · 현재 스킬 유지' };
    const name = id => id ? escape(ABILITIES[id].name) : '비어 있음';
    const describe = (id, save) => {
      if (!id) return '비어 있음';
      const use = skillUse(id, weaponFamily(save), weaponForm(save));
      return `${name(id)}${use === undefined ? ' · 사용 불가' : use < 1 ? ` · 위력 ${Math.round(use * 100)}%` : ''}`;
    };
    const rows = candidate.before.map((id, i) => `<div><dt>슬롯 ${i + 1}</dt><dd>${describe(id, this.save)} → ${describe(candidate.after[i], next)}${candidate.reason === 'remembered' && candidate.remembered[i] && candidate.after[i] === null ? ' · 사용 불가 제외' : ''}</dd></div>`).join('');
    const current = candidate.before.map((id, i) => `<div><dt>슬롯 ${i + 1}</dt><dd>${describe(id, next)}</dd></div>`).join('');
    const shieldWarning = this.save.equipped.offhand && !next.equipped.offhand ? '<p class="p2-hint">양손무기·활·지팡이 장착 시 방패는 해제되어 가방에 보관됩니다.</p>' : '';
    const warnings = candidate.before.some(id => id && !canUseSkill(id, weaponFamily(next), weaponForm(next)))
      ? '<p class="p2-hint">사용 불가: 사냥 중 제외 · 빈 슬롯 1: 무기 기본 기술</p>' : '';
    const cost = this.save.gold - next.gold;
    const body = `<dl class="p2-lines"><div><dt>무기</dt><dd>${escape(itemLabel(equippedItem(this.save, 'weapon')))} → ${escape(itemLabel(equippedItem(next, 'weapon')))}</dd></div><div><dt>선택</dt><dd>${reasons[candidate.reason]}</dd></div>${cost ? `<div><dt>구매</dt><dd>${cost} G · 확인 시 결제</dd></div>` : ''}</dl>`
      + `<h3>무기·스킬 장착</h3><dl class="p2-lines">${rows}</dl><details><summary>현재 스킬로 장착</summary><dl class="p2-lines">${current}</dl></details>${shieldWarning}${warnings}`;
    this.mountSheet(this.dialogHtml('무기 변경 · 스킬 확인', body,
      button('무기·스킬 장착', 'weapon-confirm', `data-token="${pending.token}" class="primary"`)
      + button('현재 스킬로 장착', 'weapon-confirm', `data-token="${pending.token}" data-current="true"`)
      + button('취소', 'weapon-cancel')));
    this.pendingEquipment = pending;
    const dialog = this.root.querySelector('dialog[open]');
    dialog?.addEventListener('cancel', event => { event.preventDefault(); this.cancelEquipment(); });
    dialog?.addEventListener('close', () => { if (this.pendingEquipment === pending) this.cancelEquipment(); });
  }

  cancelEquipment(restore = true) {
    const pending = this.pendingEquipment;
    if (!pending) return;
    this.pendingEquipment = null;
    this.root.querySelector('dialog[open]')?.close();
    if (!restore) return;
    if (pending.returnSheet) {
      this.mountSheet(pending.returnSheet);
      const same = [...this.root.querySelectorAll('[data-action]')].find(node => node.closest('dialog[open]') && pending.focus
        && Object.entries(pending.focus).every(([key, value]) => node.dataset[key] === value));
      same?.focus({ preventScroll: true });
    } else if (pending.origin?.isConnected) pending.origin.focus({ preventScroll: true });
  }

  confirmEquipment(data) {
    const pending = this.pendingEquipment;
    if (!pending || String(pending.token) !== data.token) return;
    // Clear first: duplicate activation or a failed persistence must never replay a purchase.
    this.pendingEquipment = null;
    if (JSON.stringify(this.save) !== pending.source) {
      this.root.querySelector('dialog[open]')?.close();
      throw new Error('장비·스킬 정보가 변경되었습니다. 다시 선택하세요.');
    }
    const next = this.equipmentDraft(pending.action, pending.uid);
    this.commit(weaponLoadoutCandidate(this.save, next, { keepCurrent: data.current === 'true' }).save);
    return this.finishEquipment(pending.action, pending.uid);
  }

  finishEquipment(action, uid) {
    if (action === 'buy-equip') return this.showMerchant();
    if (action === 'loot-equip') {
      this.lootState[uid] = '장착함';
      return this.showReceipt();
    }
    return this.returnToPanel();
  }

  comparisonHtml(item) {
    const comparison = comparisonFor(item, this.save);
    return `<label class="compare-toggle"><input id="compare-ignore-enhancement" type="checkbox" ${this.ignoreEnhancement ? 'checked' : ''}>강화 제외하고 비교</label>${splitComparisonHtml(item, this.save, { ignoreEnhancement: this.ignoreEnhancement })}<div class="p2-weight-after" data-weight-after="${comparison.weightAfter}">실제 장착 후 소지 <b>${amount(comparison.weightAfter)} / ${amount(comparison.weightLimit)} kg</b>`
      + `<small>${weightDescription(comparison.weightAfter, comparison.weightLimit).text}</small></div>`
      + `<small class="compare-actual">실제 장착 조건 · 실제 무게 적용 / 필요 힘은 기본 장비 기준</small>`
      + `${comparison.locked ? `<p class="p2-lock">${icon('lock')}장착 불가 · ${escape(comparison.lockReason)}</p>` : ''}`;
  }

  refreshComparison() {
    const sheet = this.root.querySelector('.compare-sheet');
    if (!sheet || !this.itemContext) return;
    const { uid, mode } = this.itemContext;
    const item = mode === 'buy' ? this.findOffer(uid) : this.save.items.find(item => item.uid === uid);
    if (!item) return;
    const body = sheet.closest('.p2-sheet-body'), scroll = body.scrollTop;
    this.comparisonExpanded ??= {};
    for (const details of sheet.querySelectorAll('[data-comparison-group]')) this.comparisonExpanded[details.dataset.comparisonGroup] = details.open;
    // The checkbox and actual eligibility/price context stay mounted, preserving focus and state.
    sheet.outerHTML = splitComparisonHtml(item, this.save, { ignoreEnhancement: this.ignoreEnhancement });
    for (const details of this.root.querySelectorAll('.compare-sheet [data-comparison-group]')) details.open = !!this.comparisonExpanded[details.dataset.comparisonGroup];
    body.scrollTop = scroll;
  }

  showSocket(slot) {
    const current = equippedItem(this.save, slot);
    const items = this.save.items.filter(item => ITEMS[item.id].slot === slot && item.uid !== current?.uid);
    const head = current
      ? `<div class="p2-item-heading">${emblem(current)}<div><h3>${escape(itemLabel(current))}</h3><small>착용 중 · ${GRADES[ITEMS[current.id].rarity]}</small></div></div>`
      : `<p class="minor">${SLOT_NAMES[slot]} · 비어 있음</p>`;
    const list = items.map(item => cardHtml(item, this.save)).join('')
      || `<p class="muted">교체할 ${SLOT_NAMES[slot]} 장비 없음</p>`;
    this.mountSheet(this.dialogHtml(`${SLOT_NAMES[slot]} 장비`, `${head}${current ? itemDetailsHtml(current) : ''}<h3>교체 후보</h3><div class="p2-stock">${list}</div>`,
      `<div class="socket-actions">${button(`${icon('weapon')}${this.hubCopy('장비상 둘러보기', '도굴꾼 둘러보기')}`, 'merchant', `data-tab="${slot === 'weapon' ? 'weapon' : 'armor'}"`)}${current && (slot === 'offhand' || this.save.lineage === 'skeleton_knight' && slot !== 'weapon') ? button('장착 해제', 'unequip', `data-slot="${slot}" data-uid="${escape(current.uid)}"`) : ''}</div>${current ? this.enhanceAction(current) : ''}`));
  }

  enhanceAction(item) {
    const maxed = item.enhance >= ENCHANT.max;
    return `<div class="item-enhance-action">${button('강화', 'socket-forge', `data-uid="${escape(item.uid)}" aria-describedby="item-enhance-reason"`, maxed)}`
      + `<small id="item-enhance-reason">${maxed ? `최대 강화 +${ENCHANT.max}` : '대장장이에서 강화 · 주문서와 비용 확인'}</small></div>`;
  }

  findOffer(uid) {
    return shopStock(this.save.createdAt >>> 0, this.save.shopRefresh).find(item => item.uid === uid);
  }

  openItem(uid, mode = 'equip') {
    const item = mode === 'buy' ? this.findOffer(uid) : this.save.items.find(candidate => candidate.uid === uid);
    if (!item) throw new Error('장비를 찾을 수 없습니다.');
    this.itemContext = { uid, mode };
    this.comparisonExpanded = {};
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
      footer = sold || short ? button(sold ? '품절' : '골드 부족', 'buy-gear', `${args} class="primary" aria-describedby="purchase-reason"`, true)
        : `<div class="p2-two">${button(`구매 · ${item.price} G`, 'buy-gear', `${args} aria-describedby="purchase-reason"`)}`
          + `${button(comparison.locked ? `장착 불가 · ${comparison.lockReason}` : '구매 후 장착', 'buy-equip', `${args} class="primary"`, comparison.locked)}</div>`;
    } else if (mode === 'sell') {
      footer = button(`판매 · ${sellPrice(item)} G`, 'sell-shop', `${args} class="primary"`, worn);
    } else {
      const label = worn ? '착용 중' : comparison.locked ? `장착 불가 · ${comparison.lockReason}` : '장착';
      footer = `<div class="p2-two">${button(`판매 ${sellPrice(item)} G`, 'sell', args, worn)}`
        + `${button(`분해 · ${this.dismantleText(item)}`, 'dismantle', `${args} class="quiet-danger"`, worn)}</div>`
        + button(label, 'equip', `${args} class="primary"`, worn || comparison.locked);
    }
    if (mode !== 'buy') footer += this.enhanceAction(item);
    const otherFamily = def.family && current && ITEMS[current.id].family !== def.family;
    const buyQuote = { total:item.price, remaining:this.save.gold-item.price, weightAfter:carriedWeight(this.save), limit:capacity(this.save), reasons:this.save.shopBought.includes(uid) ? ['품절'] : this.save.gold < item.price ? ['골드 부족'] : [] };
    // Compare only when actually choosing against a worn piece (cocy 10-11: no compare while just viewing).
    const choosing = mode !== 'sell' && !worn && !!current;
    const body = (choosing ? `${this.comparisonHtml(item)}${otherFamily ? '<p class="p2-hint">다른 무기 계열</p>' : ''}<details class="compare-more own-details"><summary>상세</summary>${itemDetailsHtml(item)}</details>` : itemDetailsHtml(item))
      + `${mode === 'buy' ? purchaseLedgerHtml(buyQuote) : ''}`;
    this.mountSheet(this.dialogHtml(mode === 'sell' ? '매입' : mode === 'buy' ? '구매' : choosing ? '장비 비교' : '장비 정보', body, footer));
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
    return [`${ITEMS[dismantleMaterial(item)].name}: ${dismantleRefund(item)}`, stones[STONE] && `강화석: ${stones[STONE]}`, stones[GREATER_STONE] && `상급 강화석: ${stones[GREATER_STONE]}`]
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
      note: mode === 'sell' ? `매입 ${sellPrice(item)} G` : `${bought.includes(item.uid) ? '품절' : `${item.price} G / 1개`} · 보유 ${this.save.items.filter(own => own.id === item.id).length} · ${amount(effectiveWeight(item))} kg`,
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
    this.showInnPanel(this.hubCopy('장비상', '도굴꾼'), this.gearShopHtml(), 'merchant', '', { eyebrow: '일반 · 양질만 취급' });
  }

  // --- Supply shop ---

  showShop() {
    this.shopTab ??= 'buy';
    const tabs = `<div class="p2-two" role="group" aria-label="만물상 거래">${[['buy', '구매'], ['sell', '판매']].map(([tab, label]) =>
      button(label, 'shop-tab', `data-tab="${tab}" aria-pressed="${this.shopTab === tab}"`)).join('')}</div>`;
    if (this.shopTab === 'sell') {
      return this.showInnPanel('만물상', `${tabs}
        <h3 class="section-title">가방 소모품</h3>${this.stackRowsHtml(this.save.stacks, { sell: true, kind: 'consumable' })}
        <h3 class="section-title">${this.hubCopy('창고 소모품', '유품함 소모품')}</h3>${this.stackRowsHtml(this.save.stash.stacks, { sell: true, source: 'stash' })}
        <h3 class="section-title">${this.hubCopy('창고 재료', '유품함 재료')}</h3>${this.stackRowsHtml(this.save.stacks, { sell: true, kind: 'material' })}`,
      'shop', '', { eyebrow: '보급 · 재료 매입' });
    }
    const tone = { potion:'hp-tone', mana_potion:'mp-tone' };
    const cards = SUPPLIES.map(id => button(`<span class="item-emblem ${tone[id] || ''}">${itemIcon(id, ITEMS[id])}</span>`
      + `<span class="item-name"><strong>${ITEMS[id].name}</strong><small>${shopPrice(this.save,id)} G / 개 · ${ITEMS[id].weight} kg</small><small>보유 ${this.save.stacks[id] || 0} · ${this.hubCopy('창고', '유품함')} ${this.save.stash.stacks[id] || 0}</small></span>`, 'shop-select',
      `data-id="${id}" class="shop-item" aria-pressed="${id === this.shopId}"`)).join('');
    this.showInnPanel('만물상', `${tabs}<div class="p2-two">${button('자동 구매 설정', 'auto-buy-settings')}${button('자동 구매', 'auto-buy', 'class="primary"')}</div><p role="status" aria-live="polite">${escape(this.autoBuyResult || '')}</p><div class="shop-items">${cards}</div>`, 'shop', '', {eyebrow:'보급'});
  }

  openAutoBuySettings() {
    const targets = { ...DEFAULT_AUTO_BUY, ...this.save.autoBuy };
    const body = SUPPLIES.map(id => `<div class="quantity-row"><span>${ITEMS[id].name}</span><div class="stepper">`
      + button('−', 'auto-buy-target', `id="auto-buy-${id}-minus" data-id="${id}" data-step="-1" aria-label="${ITEMS[id].name} 목표 줄이기"`, targets[id] === 0)
      + `<b data-auto-buy-target="${id}">${targets[id]}</b>`
      + button('+', 'auto-buy-target', `id="auto-buy-${id}-plus" data-id="${id}" data-step="1" aria-label="${ITEMS[id].name} 목표 늘리기"`, targets[id] === Number.MAX_SAFE_INTEGER)
      + '</div></div>').join('');
    this.mountSheet(this.dialogHtml('자동 구매 설정', body));
  }

  openSupply() {
    this.sheetOrigin ||= this.root?.querySelector(`[data-action="shop-select"][data-id="${this.shopId}"]`);
    const quote = supplyQuote(this.save,this.shopId,this.shopCount);
    const body = `<div class="p2-item-heading"><span class="item-emblem">${itemIcon(this.shopId,ITEMS[this.shopId])}</span><div><h3>${ITEMS[this.shopId].name}</h3><small>단가 ${quote.unit} G · 보유 ${this.save.stacks[this.shopId] || 0} · 개당 ${ITEMS[this.shopId].weight} kg</small></div></div>`
      + `<div class="quantity-row"><label for="shop-count">수량</label><div class="stepper">${button('−','shop-count','data-step="-1" aria-label="수량 줄이기"',this.shopCount <= 1)}<input id="shop-count" aria-label="구매 수량" type="number" inputmode="numeric" value="${this.shopCount}" min="1" max="99">${button('+','shop-count','data-step="1" aria-label="수량 늘리기"',this.shopCount >= 99)}${button('최대','shop-max','aria-label="구매 가능한 최대 수량"',quote.maxCount < 1)}</div></div>`
      + purchaseLedgerHtml(quote);
    this.mountSheet(this.dialogHtml('보급 구매',body,button(quote.reasons.length ? quote.reasons.join(' · ') : `구매 · ${quote.total} G`,'buy','id="shop-buy" class="primary" aria-describedby="purchase-reason"',quote.reasons.length > 0)));
  }

  // --- Forge workspaces: enchant ritual, stone workshop, crafting and salvage. ---

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
    const seen = seenMaterials(this.save);
    const shown = Object.entries(RECIPES).filter(([id]) => recipeRevealed(this.save, id, seen));
    const hiddenCount = Object.keys(RECIPES).length - shown.length;
    const recipes = shown.map(([id, recipe]) => {
      const shortages = Object.entries(recipe).flatMap(([key, count]) => {
        const held = key === 'gold' ? this.save.gold : this.save.stacks[key] || 0;
        return held >= count ? [] : [key === 'gold' ? `${count - held} G 부족` : `${ITEMS[key].name} ${count - held}개 부족`];
      });
      const parts = Object.entries(recipe).map(([key, count]) => `${key === 'gold' ? 'G' : ITEMS[key].name}: ${count}`).join(' · ');