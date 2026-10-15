import { REGIONS, REGION_EDGES, MAPS, mapUnlocked, mapState, availableStages, regionFor } from '../content/world-map.js';
import { SIDE_QUESTS, OBJECTIVE_QUESTS } from '../content/quest-expansion.js';
import { acceptQuest, questOffered, questState } from '../meta/quest-progress.js';
import { BALANCE, attackRate } from '../content/balance.js';
import { unlockedThreat, clearedThreat, selectThreat } from '../meta/run.js';
import { SLOTS, ECONOMY } from '../meta/economy.js';
import { shopStock, buyGear, sellItem, refreshShop, refreshPrice, gearPrice, stackSellPrice, sellStack } from '../meta/shop.js';
import { compareItems } from '../meta/compare.js';
import { STAGES, ABILITIES, canUseSkill } from '../content/combat.js';
import { BOOKS, DEFAULT_SKILLS, hasSkill, learnSkill, equipSkill, SKILL_DISPLAY, characterSkills, loadoutOf, setSlot, slotOf, weaponFamily, weaponForm, weaponLoadoutCandidate } from '../meta/skills.js';
import { loadEffects } from '../sim/world.js';
import { QUESTIONS, resolve, FAMILIES, WEAPON_NAMES } from '../meta/quiz.js';
import { STAT_KEYS, STAT_NAMES, cap, deriveMods, allocateStats, effectiveStats } from '../meta/stats.js';
import { xpSpan, MAX_LEVEL } from '../meta/progression.js';
import {
  ITEMS, RECIPES, equippedItem, carriedWeight, capacity, effectiveWeight,
  buy, equip, craft, dismantle, dismantleMaterial, dismantleRefund, dismantleStones, shopPrice, moveConsumable,
} from '../meta/items.js';
import { enchant, enchantPreview, scrollsFor, craftScroll, crackGreaterStone } from '../meta/enchant.js';
import { noteMaterials, seenMaterials, recipeRevealed } from '../meta/recipe-discovery.js';
import { ENCHANT, STONE, GREATER_STONE, SCROLLS } from '../meta/economy.js';
import { createSave, DEFAULT_AUTO_BUY } from '../meta/save.js';
import { AUTO_USE_LEVELS, autoUseSettings, validAutoUse } from '../meta/auto-use.js';
import { icon, itemIcon } from './icons.js';
import { ACADEMY, FAMILY_LABELS, skillIcon, skillCardHtml, loadoutHtml, weaponWarnHtml, skillUse } from './skill-view.js';
import { supplyQuote, purchaseLedgerHtml, autoBuySupplies } from './shop-view.js';
import { playEnchantFx, ritualCircleHtml } from './enchant-fx.js';
import {
  escape, amount, itemLabel, emblem, isWorn, SLOT_NAMES, GRADES, GRADE_ORDER,
  linesHtml, splitComparisonHtml, comparisonFor, cardHtml, portraitHtml, socketsHtml, itemDetailsHtml,
} from './gear-view.js';

import { setPortraitDirection, PORTRAIT_DIRECTIONS } from '../render/paperdoll-portrait.js';

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

  showSkeletonRole() {
    this.show(this.panelHtml('해골의 길', `
      ${button('해골 기사 · 검 · 생성 / 이어하기', 'choose-knight')}
      ${button('해골 마법사 · 준비 중', 'unavailable', '', true)}
      ${button('해골 궁수 · 준비 중', 'unavailable', '', true)}
      <p>기사는 시험 전투만 지원합니다. 성장/보상·캠페인·진화·협동 미연결. 회피 미지원.</p>
      ${button('돌아가기', 'character-choice')}`), 'skeleton-role');
  }

  showSkeletonProfile() {
    const save = this.skeletonProfile;
    this.show(this.panelHtml('해골 기사 · 시험 전투 · 성장/보상 미연결', `
      <p id="skeleton-name">${escape(save.name)} · Lv.${save.level}</p>
      <p>무기: 검 · 독립 저장 완료. 문답 능력치와 보급을 시험 전투에 적용합니다.</p>
      <p>시험 전투 소모품과 승패는 저장에 반영하지 않습니다. 다음 전투는 저장된 보급으로 시작합니다. 회피 미지원.</p>
      ${button('시험 전투 시작 / 재개', 'knight-play')}
      ${button('인간 / 캐릭터 선택', 'character-choice')}`), 'skeleton-profile');
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
    this.show(this.panelHtml(escape(question.text), `
      <div class="quiz-dots" aria-label="문답 ${index + 1} / 5">${dots}</div>
      <div class="choice-list">${choices}</div>${this.initialCharacters ? button('생성 취소 · 캐릭터 선택', 'character-choice') : ''}`, `소환 문답 · ${index + 1} / 5`), 'quiz');
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
      <p>${escape(this.name)}, ${knight ? '해골 기사 · 무기: <b>검</b>' : `당신에게 이끌린 무기는 <b>${WEAPON_NAMES[result.weapon]}</b>`}.</p>
      ${bars}<p class="muted">${knight ? '문답 능력치 그대로 · 기사 무기는 검으로 제한됩니다.</p>' : `초기 능력치 ${BALANCE.stats.startPoints}점은 그대로 유지된다. 무기만 바꿀 수 있다.</p>
      <div class="weapon-choices">${choices}</div>`}
      ${button(knight ? '해골 기사 생성 · 시험 전투로' : '소환 시험으로 · 30초', 'create', 'id="quiz-start"')}${this.initialCharacters ? button('생성 취소 · 캐릭터 선택', 'character-choice') : ''}`), 'quiz-result');
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
      `class="character-portrait" aria-label="캐릭터${this.save.statPoints ? ` · 미분배 ${this.save.statPoints}점` : ''}"`);
    const room = `<div class="p2-room">${ROOM_ART}${portrait}<div class="body-sockets" aria-hidden="true">${pins}</div>${socketsHtml(this.save)}</div>`;
    const npcs = [
      ['shop', '만물상', 'potion'], ['merchant', '장비상', 'weapon'], ['forge', '대장장이', 'forge'],
      ['trainer', '아카데미', 'trainer'], ['inventory', '창고', 'load'], ['bag', '가방', 'load'],
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
    const rate = attackRate(mods.attackSpeedBonus, mods.weaponWeight, weight / limit, mods.armorWeight, mods.family);
    return `<section class="character-summary"><h3>${escape(this.save.name)} · Lv.${this.save.level}</h3>
      <p class="minor">XP ${amount(this.save.xp)} / ${this.save.level === MAX_LEVEL ? 'MAX' : xpSpan(this.save.level)}</p>
      <div class="ledger"><div><span>HP / MP</span><b>${amount(mods.maxHp)} / ${amount(mods.maxMp)}</b></div>
      <div><span>공격 배율</span><b>×${amount(mods.dmgMult[mods.family])}</b></div>
      <div><span>공격 속도</span><b>×${amount(rate)}</b></div>
      <div><span>기술</span><b>${loadoutOf(this.save).filter(Boolean).map(id => escape(ABILITIES[id].name)).join(' · ')}</b></div></div>${this.weightHtml()}</section>
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
      <h3 class="section-title">소지 소모품</h3>
      ${this.stackRowsHtml(this.save.stacks, { destination: 'stash', kind: 'consumable' })}`, 'bag', '', { eyebrow: '출정 시 가져가는 물품' });
  }

  showInventory() {
    this.stashTab ??= 'gear';
    const tabs = [['gear', '장비'], ['material', '재료'], ['consumable', '소모품']].map(([tab, label]) =>
      button(label, 'stash-tab', `data-tab="${tab}" aria-pressed="${this.stashTab === tab}"`)).join('');
    const tabHtml = `<div class="p2-merchant-tabs" role="group" aria-label="창고 종류">${tabs}</div>`;
    if (this.stashTab !== 'gear') {
      const supplies = this.stashTab === 'consumable';
      return this.showInnPanel('창고', `${tabHtml}
        ${this.stackRowsHtml(supplies ? this.save.stash.stacks : this.save.stacks, { source: supplies ? 'stash' : 'bag', kind: this.stashTab, destination: supplies ? 'bag' : null })}`,
      'inventory', '', { eyebrow: '창고 · 무게 없음' });
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
    this.showInnPanel('창고', `${tabHtml}<div class="p2-filters" role="group" aria-label="부위">${filters}</div>
      <div class="p2-toolbar"><span>${items.length}개</span>${button(`정렬 · ${{ grade: '등급', recent: '최근', weight: '무게' }[this.sort]}`, 'sort')}</div>
      <div class="p2-grid">${cards || '<p class="muted">비어 있음 · 몬스터 드랍이나 장비상에서 얻는다</p>'}</div>`, 'inventory', '', { eyebrow: '창고 · 무게 없음' });
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
    const warnings = candidate.before.some(id => id && !canUseSkill(id, weaponFamily(next), weaponForm(next)))
      ? '<p class="p2-hint">사용 불가: 사냥 중 제외 · 빈 슬롯 1: 무기 기본 기술</p>' : '';
    const cost = this.save.gold - next.gold;
    const body = `<dl class="p2-lines"><div><dt>무기</dt><dd>${escape(itemLabel(equippedItem(this.save, 'weapon')))} → ${escape(itemLabel(equippedItem(next, 'weapon')))}</dd></div><div><dt>선택</dt><dd>${reasons[candidate.reason]}</dd></div>${cost ? `<div><dt>구매</dt><dd>${cost} G · 확인 시 결제</dd></div>` : ''}</dl>`
      + `<h3>무기·스킬 장착</h3><dl class="p2-lines">${rows}</dl><details><summary>현재 스킬로 장착</summary><dl class="p2-lines">${current}</dl></details>${warnings}`;
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
    return `${splitComparisonHtml(item, this.save)}<div class="p2-weight-after" data-weight-after="${comparison.weightAfter}">장착 후 소지 <b>${amount(comparison.weightAfter)} / ${amount(comparison.weightLimit)} kg</b>`
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
    this.mountSheet(this.dialogHtml(`${SLOT_NAMES[slot]} 장비`, `${head}${current ? itemDetailsHtml(current) : ''}<h3>교체 후보</h3><div class="p2-stock">${list}</div>`,
      `<div class="socket-actions">${button(`${icon('weapon')}장비상 둘러보기`, 'merchant', `data-tab="${slot === 'weapon' ? 'weapon' : 'armor'}"`)}${button('강화', 'socket-forge', current ? `data-uid="${escape(current.uid)}"` : '', !current || current.enhance >= ENCHANT.max)}</div>`));
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
    this.showInnPanel('장비상', this.gearShopHtml(), 'merchant', '', { eyebrow: '일반 · 양질만 취급' });
  }

  // --- Supply shop ---

  showShop() {
    this.shopTab ??= 'buy';
    const tabs = `<div class="p2-two" role="group" aria-label="만물상 거래">${[['buy', '구매'], ['sell', '판매']].map(([tab, label]) =>
      button(label, 'shop-tab', `data-tab="${tab}" aria-pressed="${this.shopTab === tab}"`)).join('')}</div>`;
    if (this.shopTab === 'sell') {
      return this.showInnPanel('만물상', `${tabs}
        <h3 class="section-title">가방 소모품</h3>${this.stackRowsHtml(this.save.stacks, { sell: true, kind: 'consumable' })}
        <h3 class="section-title">창고 소모품</h3>${this.stackRowsHtml(this.save.stash.stacks, { sell: true, source: 'stash' })}
        <h3 class="section-title">창고 재료</h3>${this.stackRowsHtml(this.save.stacks, { sell: true, kind: 'material' })}`,
      'shop', '', { eyebrow: '보급 · 재료 매입' });
    }
    const tone = { potion:'hp-tone', mana_potion:'mp-tone' };
    const cards = SUPPLIES.map(id => button(`<span class="item-emblem ${tone[id] || ''}">${itemIcon(id, ITEMS[id])}</span>`
      + `<span class="item-name"><strong>${ITEMS[id].name}</strong><small>${shopPrice(this.save,id)} G / 개 · ${ITEMS[id].weight} kg</small><small>보유 ${this.save.stacks[id] || 0} · 창고 ${this.save.stash.stacks[id] || 0}</small></span>`, 'shop-select',
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
    const seen = seenMaterials(this.save);
    const shown = Object.entries(RECIPES).filter(([id]) => recipeRevealed(this.save, id, seen));
    const hiddenCount = Object.keys(RECIPES).length - shown.length;
    const recipes = shown.map(([id, recipe]) => {
      const available = Object.entries(recipe).every(([key, count]) => (key === 'gold' ? this.save.gold : this.save.stacks[key] || 0) >= count);
      const parts = Object.entries(recipe).map(([key, count]) => `${key === 'gold' ? 'G' : ITEMS[key].name}: ${count}`).join(' · ');
      return `<article class="recipe"><span class="item-emblem">${itemIcon(id, ITEMS[id])}</span><div><b>${ITEMS[id].name}</b><small>${parts}</small></div>`
        + `${button('제작', 'craft', `data-id="${id}"`, !available)}</article>`;
    }).join('') + (hiddenCount ? `<p class="minor recipe-hidden">미공개 레시피: ${hiddenCount}</p>` : '');
    this.forgeTab ||= 'enhance';
    const { html, footer } = this.forgeDetail();
    const tabs = `<nav class="forge-tabs" aria-label="대장장이 작업">${[['enhance', '강화'], ['scrolls', '주문서 제작'], ['salvage', '제작·분해']].map(([tab, label]) => button(label, 'forge-tab', `data-tab="${tab}" aria-pressed="${this.forgeTab === tab}"`)).join('')}</nav>`;
    // Plain result line; the enchant animation layer replaces this presentation, not the outcome.
    // forgeNotice is one-shot; lastEnchant/lastCrack stay readable for the FX layer and debugging.
    const notice = this.forgeNotice;
    this.forgeNotice = null;
    const last = notice && !Number.isInteger(notice.count) ? notice : null, crack = notice && Number.isInteger(notice.count) ? notice : null;
    const noticeHtml = last ? (last.outcome === 'destroyed'
      ? `<p class="enchant-notice destroyed" role="status">${escape(ITEMS[last.id].name)} +${last.from} · 산산조각 · 강화석 ${last.refund[STONE]}개</p>`
      : `<p class="enchant-notice success" role="status">${escape(ITEMS[last.id].name)} +${last.from} → <b>+${last.to}</b> 강화 성공</p>`)
      : crack ? `<p class="enchant-notice success" role="status">${ITEMS[crack.id].name}  · ${crack.count}장</p>` : '';
    const picker = `<div class="forge-selection"><div class="section-caption"><span>장비 선택</span><span>착용 · 보관</span></div><div class="forge-picker" role="group" aria-label="강화할 장비">${cards}</div></div>`;
    const content = this.forgeTab === 'scrolls' ? this.scrollWorkshopHtml()
      : this.forgeTab === 'salvage' ? `<p class="forge-worn" aria-label="착용 강화 단계">${worn}</p>${picker}${this.forgeSalvageHtml()}<section class="craft-list"><h3 class="section-title">제작 · 재료</h3><div class="recipe-grid">${recipes}</div></section>`
        : `${html}${picker}`;
    this.showInnPanel('대장장이', `${tabs}${noticeHtml}<div class="forge-tab-panel" data-forge-tab="${this.forgeTab}">${content}</div>`,
      'forge', this.forgeTab === 'enhance' ? footer : '', { eyebrow: `시작 +0~${ENCHANT.safe - 1} · 안전 / +${ENCHANT.safe}~${ENCHANT.max - 1} · 파괴 위험` });
  }

  forgeSalvageHtml() {
    const item = this.save.items.find(candidate => candidate.uid === this.selectedUid);
    if (!item) return '';
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
    const target = preview.outcomes.map(level => `+${level}`).join(' / ');
    const odds = preview.maxed ? '최대 강화' : preview.risky ? `성공 ${pct(preview.chance)}` : '';
    const html = `<section class="forge-work ${preview.risky ? 'risky' : ''} ${preview.blessed ? 'blessed' : ''}" aria-label="강화 의식">
      <div class="forge-item-title"><small>${worn ? '착용 중' : '보관 장비'} · ${GRADES[ITEMS[item.id].rarity]}</small><h3>${escape(ITEMS[item.id].name)}</h3></div>
      <div class="forge-ritual" aria-hidden="true">${ritualCircleHtml()}<span class="forge-hero-art" data-enhance="${Math.min(10, item.enhance)}">${itemIcon(item.id, ITEMS[item.id])}</span><span class="forge-tier">+${item.enhance}</span></div>
      <div class="forge-progress"><b>+${item.enhance}</b><span>→</span><strong>${preview.maxed ? 'MAX' : target}</strong></div>
      ${preview.blessed ? '<p class="forge-blessing">축복 · +1~3</p>' : ''}
      ${odds ? `<strong class="forge-odds">${odds}</strong>` : ''}
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

  showCharacterSkills({ keepScroll = false } = {}) {
    this.panel = 'character-skills';
    const known = characterSkills(this.save);
    this.skillFamily ||= weaponFamily(this.save);
    const family = this.skillFamily;
    const tabs = FAMILIES.map(id => button(`${skillIcon(ACADEMY[id].mark)}<span>${FAMILY_LABELS[id]} ${known.filter(k => ABILITIES[k].family === id).length}</span>`, 'skill-family-tab',
      `data-family="${id}" id="skill-tab-${id}" class="faculty-${id}" role="tab" aria-selected="${family === id}" aria-controls="skill-panel"`)).join('');
    const rows = known.filter(id => ABILITIES[id].family === family).map(id => skillCardHtml(id,this.save,{context:'character'})).join('');
    this.showInnPanel('캐릭터', `${this.characterTabs('skills')}${loadoutHtml(this.save)}<div class="academy-tabs skill-tabs" role="tablist" aria-label="기술 계열">${tabs}</div>`
      + `<section id="skill-panel" class="character-skills faculty-${family}" role="tabpanel" aria-labelledby="skill-tab-${family}">${rows || '<p class="muted">배운 기술 없음</p>'}</section>`, 'character-skills', '', { keepScroll });
  }

  openSkill(id) {
    if (!SKILL_DISPLAY[id] || !hasSkill(this.save,id)) throw new Error('아직 배우지 않은 기술입니다.');
    const a = ABILITIES[id], p = a.projectile, shape = a.shape;
    const range = p ? `사거리 ${p.rangePx} px · ${p.count}발 · 관통 ${p.pierce}회${p.explode ? ` · 폭발 반경 ${p.explode.radius} px` : ''}`
      : a.heal ? `회복 범위 반경 ${a.heal.radius} px · 자신과 범위 안 살아 있는 아군`
      : a.dash ? `돌진 거리 ${a.dash.distance} px · 몸 판정 여유 ${a.dash.bodyPad} px`
      : shape.type === 'circle' ? `반경 ${shape.radius} px` : `사거리 ${shape.range} px · 부채꼴 ${shape.arc}°`;
    const effects = a.heal ? '대상별 최대 HP 비례 회복 · 부활 불가 · 적 회복 없음' : `경직 위력 ${a.poise} · 넉백 ${a.knockback}${a.sunder ? ' · 받는 피해 +15% · 파쇄 5초' : ''}${a.element ? ` · ${a.element === 'fire' ? '화염' : '서리'} 속성` : ''}`;
    const slot = slotOf(this.save,id);
    const slotButtons = `<div class="p2-three" role="group" aria-label="슬롯">${[0, 1, 2].map(i => button(`슬롯 ${i + 1}`, 'skill-slot', `id="skill-slot-${i + 1}" data-id="${id}" data-slot="${i}" aria-pressed="${slot === i}"`)).join('')}</div>`;
    this.mountSheet(this.dialogHtml(a.name, `${skillCardHtml(id,this.save,{context:'detail'})}<p>${SKILL_DISPLAY[id].label} · ${WEAPON_NAMES[a.family]} 계열</p><dl class="p2-lines"><div>${a.heal ? `<dt>회복량</dt><dd>최대 HP ${Math.round(a.heal.maxHpFrac * 100)}%</dd>` : `<dt>피해</dt><dd>${a.damage}</dd>`}</div><div><dt>소모 MP</dt><dd>${a.manaCost || 0} MP</dd></div><div><dt>재사용</dt><dd>${amount(a.cooldownMs / 1000)}초</dd></div></dl><p>${range}</p><p>${effects}</p>${skillUse(id, weaponFamily(this.save), ITEMS[equippedItem(this.save,'weapon')?.id]?.form) === 1 ? '' : weaponWarnHtml(id, this.save)}`, slotButtons));
  }

  showTrainer({ keepScroll = false } = {}) {
    this.academyFamily ||= ITEMS[equippedItem(this.save,'weapon')?.id]?.family || 'blade';
    const family = this.academyFamily, school = ACADEMY[family];
    const tabs = FAMILIES.map(id => button(`${skillIcon(ACADEMY[id].mark)}<span>${ACADEMY[id].name}</span>`, 'academy-tab', `data-family="${id}" id="academy-tab-${id}" class="faculty-${id}" role="tab" aria-selected="${family === id}" aria-controls="academy-panel"`)).join('');
    const ids = [DEFAULT_SKILLS[family],...Object.keys(BOOKS).filter(id => BOOKS[id].family === family)].sort((a,b) => SKILL_DISPLAY[a].grade-SKILL_DISPLAY[b].grade);
    const ladder = [0,1,2].map(grade => `<section class="academy-stage" data-grade="${grade}"><h3><span>${grade+1}</span>${['입문','숙련','상급'][grade]}</h3><div class="academy-stage-cards">${ids.filter(id => SKILL_DISPLAY[id].grade === grade).map(id => skillCardHtml(id,this.save)).join('')}</div></section>`).join('');
    this.showInnPanel('아카데미', `${loadoutHtml(this.save, { interactive: false })}<div class="academy-tabs" role="tablist" aria-label="아카데미 학부">${tabs}</div><section id="academy-panel" class="academy-panel faculty-${family}" role="tabpanel" aria-labelledby="academy-tab-${family}"><p class="npc-line">“${school.quote}”</p><div class="academy-ladder">${ladder}</div></section>`, 'trainer', '', {eyebrow:'검술 · 궁술 · 마법', keepScroll});
  }

  showAllocation(required = false, initialize = true) {
    if (initialize) this.draft = Object.fromEntries(STAT_KEYS.map((key) => [key, 0]));
    this.allocationRequired = required;
    const spent = Object.values(this.draft).reduce((sum, value) => sum + value, 0);
    const remaining = this.save.statPoints - spent;
    const gearStats = effectiveStats(this.save);
    const rows = STAT_KEYS.map((key) => {
      const full = remaining === 0 || this.save.stats[key] + this.draft[key] >= cap(this.save.level);
      const gear = gearStats[key] - this.save.stats[key];
      return `<div class="allocation-row ${this.draft[key] ? 'changed' : ''}"><span>${STAT_NAMES[key]}</span>
      ${button('−', 'stat-minus', `data-key="${key}" aria-label="${STAT_NAMES[key]} 줄이기"`, this.draft[key] === 0)}
      <b>${this.save.stats[key] + this.draft[key]}${gear ? `<small class="gain">+${gear}</small>` : ''}</b>
      ${button('+', 'stat-plus', `data-key="${key}" aria-label="${STAT_NAMES[key]} 올리기"`, full)}
      ${button('+5', 'stat-plus', `data-key="${key}" data-step="5" aria-label="${STAT_NAMES[key]} 5 올리기"`, full)}</div>`;
    }).join('');
    const before = deriveMods(this.save);
    const after = deriveMods(allocateStats(this.save, this.draft));
    const pct = (v) => v * 100;
    const preview = [['HP', before.maxHp, after.maxHp], ['MP', before.maxMp, after.maxMp],
      ['MP/s', before.mpRegen, after.mpRegen], ['HP/s', before.hpRegen, after.hpRegen],
      ['치명 %', pct(before.critChance), pct(after.critChance)], ['소지 kg', before.capacity, after.capacity]]
      .map(([label, from, to]) => `<span>${label} <b>${amount(to)}</b>${to !== from ? `<small class="gain">▲+${amount(to - from)}</small>` : ''}</span>`).join('');
    const tabs = required ? '' : this.characterTabs('stats');
    const content = `${tabs}${required ? '' : this.characterHtml()}<p id="allocation-left" class="points-left"><b>${remaining}</b> 점 남음 <small>상한 ${cap(this.save.level)}</small></p>
      <div class="allocation">${rows}</div><p class="p2-stat-summary">${preview}</p>${required ? '' : `<h3 class="section-title">지난 여정</h3>${this.receipt ? this.receiptHtml(this.receipt) : '<p class="muted">아직 다녀온 여정이 없다.</p>'}`}`;
    const footer = button(required ? '분배 완료' : '확인', 'allocate', 'id="allocation-confirm" class="primary"', required ? remaining !== 0 : spent === 0);
    this.panel = required ? null : 'character';
    this.show(this.shellHtml(this.panelHeader(required ? '레벨이 올랐다' : '캐릭터', required ? `Lv.${this.save.level} · 능력치 ${this.save.statPoints}점` : '인장의 기록', required ? '' : 'inn'), content, footer),
      required ? 'level-up' : 'character', { shell: true, keepScroll: !initialize });
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
      const open = r.maps.some(id => mapUnlocked(this.save,id)), done = open && r.maps.filter(id => !MAPS[id].questId).every(id => this.save.cleared[id]);
      return button(`${icon(done ? 'clear' : open ? 'depart' : 'lock')}<span>${r.name}</span><small>${done ? '완료' : r.maps.includes(current) ? '현재' : open ? '열림' : '잠김'}</small>`, 'map-region',
        `data-region="${r.id}" class="region-node ${done ? 'clear' : open ? 'depart' : 'lock'}" style="left:${r.pos[0]}%;top:${r.pos[1]}%" aria-pressed="${this.mapRegion === r.id}"${r.maps.includes(current) ? ' aria-current="location"' : ''}`);
    }).join('');
    const regions = REGIONS.map(r => `<section class="map-quests" data-region="${r.id}"${r.id === selected.id ? '' : ' hidden'}><h3>${r.name}</h3>${[...r.maps, ...Object.values(OBJECTIVE_QUESTS).filter(q => q.regionId === r.id && !r.maps.includes(q.mapId)).map(q => q.mapId)].map(id => {
      const state = mapState(this.save,id), rec = BALANCE.stages[id]?.rec?.[0] || 1;
      const side = Object.values(OBJECTIVE_QUESTS).find(q => q.mapId === id);
      return button(`${icon(state)}<span><strong>${side ? `곁가지 · ${side.id}` : id} · ${escape(STAGES[id].name)}</strong>${side ? `<small>맵: ${escape(side.mapName)}</small>` : ''}<small>내 Lv.${this.save.level} · 추천 Lv.${rec}</small>${this.save.level < rec ? `<small class="loss">추천보다 ${rec - this.save.level}레벨 낮음</small>` : ''}</span><small>${state === 'clear' ? `위협 ${clearedThreat(this.save,id)}/3 완료` : state === 'lock' ? '잠김' : id === current ? '현재 · 도전 가능' : '도전 가능'}</small>`, 'sortie',
        `data-stage="${id}" class="contract ${state}"${id === current ? ' aria-current="step"' : ''}`, state === 'lock');
    }).join('')}${this.sideQuestsHtml(r.id)}</section>`).join('');
    this.showInnPanel('월드맵', `<button type="button" data-action="coop" class="primary">같이 사냥 · 2~4인</button><div class="world-map" aria-label="지역 지도"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${paths}</svg>${nodes}</div>${regions}`, 'board', '', { eyebrow:`내 레벨 ${this.save.level} · ${Object.entries(this.save.cleared).filter(([id,done]) => done && /^S\d+$/.test(id) && Number(id.slice(1)) <= 20).length} / 20 완료 · 묘지 ${['S21','S22','S23'].filter(id => this.save.cleared[id]).length} / 3` });
  }

  sideQuestsHtml(regionId) {
    return Object.values(SIDE_QUESTS).filter(q => q.regions.includes(regionId) && questOffered(this.save, q.id)).map(q => {
      const state = questState(this.save, q.id), progress = state?.progress || 0;
      const label = `${icon(state?.state === 'done' ? 'clear' : 'depart')}<span><strong>의뢰 · ${escape(q.name)}</strong><small>${escape(ITEMS[q.item].name)} ${progress} / ${q.target} · ${q.maps.join(' · ')}</small><small>보상 XP ${q.rewardXp}</small></span>`;
      if (!state) return button(`${label}<small>수락</small>`, 'quest-accept', `data-quest="${q.id}" class="contract side-contract depart"`);
      return `<div class="contract side-contract ${state.state === 'done' ? 'clear' : 'active'}" data-quest="${q.id}">${label}<small>${state.state === 'done' ? '완료' : '진행 중'}</small></div>`;
    }).join('');
  }

  sideQuestLine(stage) {
    return Object.values(SIDE_QUESTS).filter(q => q.maps.includes(stage) && questState(this.save, q.id)?.state === 'active')
      .map(q => `<p class="quest-level-comparison side-quest-line" data-quest="${q.id}">${escape(q.name)} <b>${questState(this.save, q.id).progress} / ${q.target}</b></p>`).join('');
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
      <div class="departure-check"><p class="quest-level-comparison">내 레벨 <b>${this.save.level}</b> · 추천 레벨 <b>${BALANCE.stages[stage]?.rec?.[0] || 1}</b></p>${this.sideQuestLine(stage)}${STAGES[stage].objective?.kind === 'kill-target' ? '<p>가고일 처치: 0/1 · 몬스터: 가고일·투석병·정령 · 추천: Lv20 / T3</p>' : STAGES[stage].objective?.kind === 'visit-markers' ? '<p>목표: 길 표식 0/3 · 몬스터: 독거미·정령·늑대 · 추천: Lv12 / T3</p>' : STAGES[stage].objective ? '<p>목표: 장부 회수→입구 · 몬스터: 멧돼지·투석병·고블린 · 추천: Lv11 / T3</p>' : ''}<h3>보급</h3><div class="sortie-supplies">${supplies}</div>${this.weightHtml(weight)}</div>
      <div class="threat-choices" role="group" aria-label="위협도">${threats}</div>
      <button type="button" data-action="coop" class="primary">같이 사냥 · 이 퀘스트로</button><p class="risk-note">${icon('clear')}완료 · 귀환하면 전리품 확보<br>${icon('death')}사망하면 이번 전리품과 경험치 일부를 잃는다</p>
      <details class="help"><summary>설정</summary>
        <label class="check"><input id="sortie-reduced" type="checkbox"
          ${matchMedia('(prefers-reduced-motion: reduce)').matches ? 'checked' : ''}>흔들림·섬광 줄이기</label></details>`,
    'sortie', button(`<span>출정</span>${icon('depart')}`, 'launch', 'id="sortie-confirm" class="primary"'), { eyebrow: '출정 확인', back: 'board' });
  }

  launch(stage, reduced = false, weapon = null) {
    if (this.canInteract?.() === false) return;
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
      ${(receipt.masteryRises || []).map(({ id, level }) => `<p class="mastery-rise">숙련 상승: ${escape(ABILITIES[id].name)} Lv${level}</p>`).join('')}
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
        ? `<div class="p2-three">${button('장착', 'loot-equip', uid, comparisonFor(item, this.save).locked)}${button(`판매 ${sellPrice(item)} G`, 'loot-sell', uid, isWorn(this.save, item.uid))}${button(`분해 · ${this.dismantleText(item)}`, 'dismantle', `${uid} class="quiet-danger"`)}</div>`
        : `<small class="p2-loot-status" role="status">${state || '보관함'}</small>`;
      return `<article class="p2-loot-card ${rare ? 'sheen' : ''}">${cardHtml(item || drop, this.save, { action: item ? 'open-item' : 'noop', disabled: !item })}${actions}</article>`;
    }).join('');
    const left = items.length - this.revealed;
    return `<section class="reveal"><p class="minor">마을로 돌아가면 자동 보관</p><h3>획득 장비 <span class="muted">${this.revealed} / ${items.length}</span></h3><div class="p2-loot">${cards}</div>
      ${left ? button(`${this.revealed ? '다음 장비' : '장비'} 공개 · ${left}개 남음`, 'reveal', 'class="reveal-button"') : ''}</section>`;
  }

  questReceiptHtml(receipt) {
    return (receipt.quests || []).filter(q => SIDE_QUESTS[q.id]).map(q => `<p class="side-quest-receipt" data-quest="${q.id}">${icon(q.done ? 'clear' : 'depart')}${escape(SIDE_QUESTS[q.id].name)} · ${escape(ITEMS[SIDE_QUESTS[q.id].item].name)} +${q.gained} · <b>${q.progress} / ${q.target}</b>${q.done ? ` · 완료 · XP +${q.rewardXp}` : ''}</p>`).join('');
  }

  showReceipt() {
    const { receipt, cause } = this.pendingReceipt;
    const title = { clear: '완료', return_scroll: '귀환', death: '사망' }[receipt.terminal];
    const glyph = { clear: 'clear', return_scroll: 'return_scroll', death: 'death' }[receipt.terminal];
    const lost = receipt.terminal === 'death' && (receipt.lootLost.items.length || receipt.lootLost.gold)
      ? `<p class="loss">잃은 전리품: ${receipt.lootLost.gold} G${receipt.lootLost.items.length ? ` · 장비 ${receipt.lootLost.items.length}개` : ''}</p>` : '';
    const content = `<div class="result-intro" data-terminal="${receipt.terminal}"><span class="result-stamp">${icon(glyph)}</span>
      <div><small>${receipt.stageId} · 위협 ${receipt.threat}</small><h1>${title}</h1>${receipt.terminal === 'death' ? `<p id="cause">${escape(cause)}</p>` : ''}</div></div>
      ${this.receiptHtml(receipt, false)}${this.questReceiptHtml(receipt)}${lost}${this.revealHtml(receipt)}`;
    this.panel = null;
    this.show(this.shellHtml('', content, button('<span>여관으로</span>' + icon('depart'), 'result-inn', 'id="result-back" class="primary"')), 'receipt', { shell: true });
  }

  autoUseHtml() {
    const auto = autoUseSettings(this.save);
    const group = (key, label, options) => `<div class="quantity-row"><span>${label}</span></div><div class="${options.length === 3 ? 'p2-three' : 'p2-two'}" role="group" aria-label="${label}">${
      options.map(([value, text]) => button(text, 'auto-use', `id="auto-use-${key}-${value}" data-key="${key}" data-value="${value}" aria-pressed="${auto[key] === value}"`)).join('')}</div>`;
    const onOff = [[true, '켜짐'], [false, '꺼짐']];
    const levels = AUTO_USE_LEVELS.map(level => [level, `${level}%`]);
    return `<section class="auto-use" aria-label="자동 사용">${group('potion', '자동 물약', onOff)}${auto.potion
      ? group('hp', 'HP 기준', levels) + group('mp', 'MP 기준', levels) : ''}${group('recall', '자동 귀환', onOff)}</section>`;
  }

  presentationHtml() {
    const probe = {};
    document.dispatchEvent(new CustomEvent('arpg:sound', { detail: probe }));
    const group = (label, action, options) => `<div class="quantity-row"><span>${label}</span></div><div class="p2-two" role="group" aria-label="${label}">${
      options.map(([value, text, pressed]) => button(text, action, `id="${action}-${value}" data-value="${value}" aria-pressed="${pressed}"`)).join('')}</div>`;
    return `<section class="auto-use" aria-label="화면·소리">${group('사운드', 'set-sound', [['on', '켜짐', probe.muted === false], ['off', '꺼짐', probe.muted === true]])
      }</section>`;
  }

  showSettings() {
    this.showInnPanel('설정', `${this.presentationHtml()}${this.autoUseHtml()}
      <p class="minor">캐릭터는 이 브라우저에 저장된다. 전투 중 새로고침하면 마지막 여관으로 돌아온다.</p>
      <p class="p2-lock">${icon('lock')}초기화하면 캐릭터·보급·장비·진척을 모두 잃는다.</p>
      ${this.resetStep === 0 ? button('저장 초기화', 'reset-first') : this.resetStep === 1
    ? button('캐릭터를 지울까? 한 번 더 확인', 'reset-second')
    : button('최종 확인 · 전부 지우기', 'reset-final', 'class="danger"')}`, 'settings');
  }

  action(action, data) {
    if (this.canInteract?.() === false) return;
    if (this.enchantFx?.active) return;
    if (this.pendingEquipment && !['weapon-confirm', 'weapon-cancel', 'close-sheet'].includes(action)) this.cancelEquipment(false);
    switch (action) {
      case 'character-choice': return this.showCharacterChoice();
      case 'choose-human':
        this.creationLineage = null; this.skeletonProfile = null;
        this.save = this.initialCharacters.human();
        this.receipt = this.save?.lastReceipt ?? null;
        return this.save ? this.showInn() : this.showIntro();
      case 'choose-skeleton': return this.showSkeletonRole();
      case 'choose-knight': {
        const save = this.initialCharacters.read();
        if (save) { this.skeletonProfile = save; return this.showSkeletonProfile(); }
        this.creationLineage = 'skeleton_knight'; this.answers = []; this.chosenWeapon = undefined;
        return this.showName();
      }
      case 'knight-play':
        return this.initialCharacters.play(this.skeletonProfile).catch(error => this.error(error.message));
      case 'weapon-confirm': return this.confirmEquipment(data);
      case 'weapon-cancel': return this.cancelEquipment();
      case 'name': return this.showName();
      case 'answer':
        this.answers.push(Number(data.choice));
        return this.answers.length === 5 ? this.showQuizResult() : this.showQuiz();
      case 'override':
        if (this.creationLineage === 'skeleton_knight') return;
        this.chosenWeapon = data.family;
        return this.showQuizResult();
      case 'create':
        if (this.creationLineage === 'skeleton_knight') {
          this.skeletonProfile = this.initialCharacters.create({lineage: 'skeleton_knight', name: this.name, answers: this.answers, createdAt: Date.now()});
          this.showSkeletonProfile();
          // Show the durable profile first so a failed/cancelled launch can safely return.
          if (this.initialCharacters.play) return this.initialCharacters.play(this.skeletonProfile).catch(error => this.error(error.message));
          return;
        }
        this.commit(createSave({
          name: this.name, answers: this.answers, weapon: this.chosenWeapon, createdAt: Date.now(),
        }));
        return this.launch('S1');
      case 'inn':
      case 'result-inn': return this.showInn();
      case 'character-tab':
        if (data.tab !== 'skills') return this.showAllocation(false);
        this.skillFamily = null;
        return this.showCharacterSkills();
      case 'skill-family-tab':
        if (!FAMILIES.includes(data.family)) return;
        this.skillFamily = data.family;
        this.showCharacterSkills({ keepScroll: true });
        this.root?.querySelector(`[data-action="skill-family-tab"][data-family="${data.family}"]`)?.focus({preventScroll:true});
        return;
      case 'skill-detail': return this.openSkill(data.id);
      case 'skill-warn':
        if (!ABILITIES[data.id] || !hasSkill(this.save, data.id)) return;
        return this.mountSheet(this.dialogHtml(`${ABILITIES[data.id].name} · 무기 경고`, weaponWarnHtml(data.id, this.save)));
      case 'skill-slot': {
        const slot = Number(data.slot);
        // Tapping the slot a skill already occupies takes it out.
        this.commit(setSlot(this.save, weaponFamily(this.save), slot, slotOf(this.save, data.id) === slot ? null : data.id));
        if (data.context === 'academy') return this.showTrainer({ keepScroll: true });
        this.showCharacterSkills({ keepScroll: true });
        return data.context === 'character' ? undefined : this.openSkill(data.id);
      }
      case 'character': return this.showAllocation(false);
      case 'close-sheet': return this.closeSheet();
      case 'noop': return undefined;
      // Supplies
      case 'shop': return this.showShop();
      case 'auto-buy-settings': return this.openAutoBuySettings();
      case 'auto-buy-target': {
        if (!SUPPLIES.includes(data.id) || ![-1, 1].includes(Number(data.step))) return;
        const autoBuy = { ...DEFAULT_AUTO_BUY, ...this.save.autoBuy };
        autoBuy[data.id] = Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, autoBuy[data.id] + Number(data.step)));
        this.commit({ ...this.save, autoBuy });
        return this.openAutoBuySettings();
      }
      case 'auto-buy': {
        const result = autoBuySupplies(this.save);
        this.commit(result.save);
        this.autoBuyResult = result.message;
        return this.showShop();
      }
      case 'shop-tab':
        this.shopTab = data.tab;
        return this.showShop();
      case 'sell-stack':
        this.commit(sellStack(this.save, data.id, Number(data.count), data.source));
        return this.showShop();
      case 'shop-select':
        this.shopId = data.id;
        this.shopCount = 1;
        return this.openSupply();
      case 'shop-count':
        this.shopCount = Math.max(1, Math.min(99, this.shopCount + Number(data.step)));
        return this.openSupply();
      case 'shop-max':
        this.shopCount = Math.max(1,supplyQuote(this.save,this.shopId,this.shopCount).maxCount);
        return this.openSupply();
      case 'buy':
        this.commit(buy(this.save, this.shopId, this.shopCount));
        this.showShop();
        return this.openSupply();
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
      case 'equip': return this.beginEquipment(action, data.uid);
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
      case 'buy-equip': return this.beginEquipment(action, data.uid);
      case 'sell-shop':
        this.commit(sellItem(this.save, data.uid));
        return this.showMerchant();
      case 'refresh-shop':
        this.commit(refreshShop(this.save));
        return this.showMerchant();
      // Forge
      case 'socket-forge': {
        const item = this.save.items.find(candidate => candidate.uid === data.uid);
        if (!item || item.enhance >= ENCHANT.max) return;
        this.forgeTab = 'enhance';
        this.selectedUid = item.uid;
        this.forgeScroll = scrollsFor(item).normal;
        return this.showForge();
      }
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
      case 'loot-equip': return this.beginEquipment(action, data.uid);
      case 'loot-sell':
        this.commit(sellItem(this.save, data.uid));
        this.lootState[data.uid] = '판매함';
        return this.showReceipt();
      // Trainer
      case 'trainer': return this.showTrainer();
      case 'academy-tab':
        if (!ACADEMY[data.family]) return;
        this.academyFamily = data.family;
        this.showTrainer();
        this.root?.querySelector(`[data-action="academy-tab"][data-family="${data.family}"]`)?.focus({preventScroll:true});
        return;
      case 'learn-skill':
        this.commit(learnSkill(this.save, data.id));
        if (loadoutOf(this.save).includes(null)) this.commit(equipSkill(this.save, data.family || ABILITIES[data.id].family, data.id));
        return this.showTrainer({ keepScroll: true });
      case 'equip-skill':
        this.commit(equipSkill(this.save, data.family, data.id));
        return this.showTrainer({ keepScroll: true });
      case 'stat-plus':
      case 'stat-minus':
        if (action === 'stat-minus') this.draft[data.key] -= 1;
        else {
          // +5 stops at whatever is left of the points or the cap.
          const left = this.save.statPoints - Object.values(this.draft).reduce((sum, value) => sum + value, 0);
          const room = cap(this.save.level) - this.save.stats[data.key] - this.draft[data.key];
          this.draft[data.key] += Math.max(0, Math.min(Number(data.step) || 1, left, room));
        }
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
      case 'quest-accept':
        this.commit(acceptQuest(this.save, data.quest));
        return this.showBoard();
      case 'sortie': return this.showSortie(data.stage);
      case 'threat':
        selectThreat(this.save, this.sortieStage, Number(data.threat));
        this.sortieThreat = Number(data.threat);
        return this.showSortie(this.sortieStage, this.devWeapon);
      case 'launch':
        if (!(this.save.stacks.potion || 0)) {
          return this.mountSheet(this.dialogHtml('물약 없음', '',
            button('그냥 출정', 'launch-without-potion', 'class="primary"') + button('상점', 'departure-shop')));
        }
        return this.launch(this.sortieStage, this.root.querySelector('#sortie-reduced').checked, this.devWeapon);
      case 'departure-shop':
        this.shopTab = 'buy';
        return this.showShop();
      case 'launch-without-potion':
        this.closeSheet();
        return this.launch(this.sortieStage, this.root.querySelector('#sortie-reduced').checked, this.devWeapon);
      // Settings
      case 'settings':
        this.resetStep = 0;
        return this.showSettings();
      case 'auto-use': {
        const value = data.value === 'true' ? true : data.value === 'false' ? false : Number(data.value);
        const autoUse = { ...autoUseSettings(this.save), [data.key]: value };
        if (!validAutoUse(autoUse)) return undefined;
        this.commit({ ...this.save, autoUse });
        return this.showSettings();
      }
      case 'set-sound':
        document.dispatchEvent(new CustomEvent('arpg:sound', { detail: { set: data.value === 'off' } }));
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
