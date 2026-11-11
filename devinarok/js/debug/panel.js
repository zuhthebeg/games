import { ITEM_BASES, ITEMS, RARITIES } from '../content/items.js';
import { FAMILY_SKILLS } from '../content/skills.js';
import { isStageUnlocked, STAGES, STAGE_LIST } from '../content/stages.js';
import { createHubWorld, completeStage, rollStageItem } from '../sim/world.js';
import { escapeHtml } from '../ui/escape-html.js';
import { debugKillRoomEnemies, debugSpawnRoomEnemy } from './combat.js';
import {
  applyDebugSpeed, debugCloudSaveReason, debugShortcutOperations, debugStageSaveReason, loadRecentActions,
  partyActionReason, recordRecentAction, resetDebugSpeed, TwoTapGate,
} from './state.js';

const FAMILY_LABELS = { sword: '검', crossbow: '석궁', staff: '지팡이' };
const SLOTS = [
  ['weapon', '무기'],
  ['head', '머리'],
  ['body', '몸'],
  ['hands', '손'],
  ['feet', '발'],
];
const FAMILIES = Object.keys(FAMILY_LABELS);
const BOSS_STAGES = new Set(['CB', 'FB', 'KB']);
const BACKUP_KEY = 'devinarok.debug.backup';
const ACTION_LABELS = {
  'preset-boss': '보스 테스트',
  'preset-set': '풀세트 지급',
  'toggle-invulnerable': '무적 토글',
  'room-clear': '방 정리',
  'instant-clear': '즉시 클리어',
  'level-down': '레벨 낮추기',
  'level-up': '레벨 올리기',
  'set-level': '레벨 설정',
  'mastery-max': '숙련도 최대',
  'mastery-reset': '숙련도 초기화',
  'gold-1000': '골드 +1,000',
  'gold-10000': '골드 +10,000',
  potions: '물약 가득 채우기',
  speed: '전투 속도 설정',
  'grant-item': '장비 지급',
  'family-sword': '검 계열 전환',
  'family-crossbow': '석궁 계열 전환',
  'family-staff': '지팡이 계열 전환',
  'unlock-stages': '모든 스테이지 해금',
  'tutorial-replay': '튜토리얼 다시 보기',
  'reset-progress': '진행 초기화',
  'toggle-one-hit': '원킬 토글',
  'toggle-no-cooldown': '쿨다운 없음 토글',
  'summon-enemy': '적 소환',
  'toggle-hitboxes': '히트박스 표시',
  'toggle-attacks': '적 공격 범위 표시',
  'toggle-dodge-window': '완벽 회피 창 표시',
  'start-stage': '바로 시작',
  'copy-json': 'JSON 복사',
  'import-json': 'JSON 불러오기',
  'backup-save': '백업 저장',
  'restore-backup': '백업 복원',
  'reset-save': '세이브 리셋',
  info: '정보 오버레이',
};
const DESTRUCTIVE_ACTIONS = new Set(['reset-progress', 'import-json', 'restore-backup', 'reset-save']);

function randomSeed() {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

function uniqueId() {
  return globalThis.crypto?.randomUUID?.()
    ?? `debug-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function button(action, label, reason = null, attributes = '') {
  return `<div class="debug-action"><button type="button" data-debug-action="${action}" ${reason ? 'disabled' : ''} ${attributes}>${label}</button>${reason ? `<small class="debug-reason">${escapeHtml(reason)}</small>` : ''}</div>`;
}

function options(entries, selected) {
  return entries.map(([value, label]) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('');
}

function sortByLevel(items) {
  return items.sort((left, right) => left.requiredLevel - right.requiredLevel);
}

function itemFamily(item) {
  return item ? ITEMS[item.itemId]?.family ?? null : null;
}

function renderItemGrant(world, family, slot, rarity, ilvl, characterLevel, equip) {
  const requiredLimit = equip ? Math.min(ilvl, characterLevel) : ilvl;
  const eligible = sortByLevel(ITEM_BASES.filter((item) => (
    item.slot === slot
    && item.requiredLevel <= requiredLimit
    && (slot !== 'weapon' || item.family === family)
  )));
  if (!eligible.length) throw new Error('현재 레벨에 맞는 장비가 없습니다.');
  const tier = eligible.at(-1).requiredLevel;
  const base = eligible.filter((item) => item.requiredLevel === tier)[Math.floor(Math.random() * eligible.filter((item) => item.requiredLevel === tier).length)];
  const rollWorld = createHubWorld({ seed: randomSeed() });
  const rolled = rollStageItem(rollWorld, { stageLevel: ilvl, forcedRarity: rarity });
  const uid = uniqueId();
  const ops = [{
    type: 'grantItem',
    uid,
    itemId: base.id,
    rarity,
    ilvl,
    enhance: 0,
    affixes: rolled.affixes,
    legendaryId: rolled.legendaryId,
  }];
  if (equip) ops.push({ type: 'equip', uid, slot });
  return { ops, base };
}

export function mountDebugPanel(context) {
  const abort = new AbortController();
  const { signal } = abort;
  const storage = context.localStorage;
  const recent = loadRecentActions(storage);
  const confirmation = new TwoTapGate({ windowMs: 3000 });
  const trigger = document.createElement('button');
  trigger.id = 'debug-trigger';
  trigger.className = 'debug-trigger';
  trigger.type = 'button';
  trigger.textContent = 'DBG';
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', 'debug-panel');

  const panel = document.createElement('section');
  panel.id = 'debug-panel';
  panel.className = 'debug-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', '디버그 모드');
  panel.hidden = true;
  panel.innerHTML = `
    <button class="debug-drag-handle" type="button" aria-label="아래로 끌어 닫기"><span></span></button>
    <header class="debug-header"><strong>디버그 모드</strong><button type="button" data-debug-close aria-label="닫기">닫기</button></header>
    <nav class="debug-tabs" role="tablist" aria-label="디버그 메뉴">
      <button type="button" role="tab" id="debug-tab-quick" aria-controls="debug-tab-content" data-debug-tab="quick">빠른</button>
      <button type="button" role="tab" id="debug-tab-character" aria-controls="debug-tab-content" data-debug-tab="character">캐릭터</button>
      <button type="button" role="tab" id="debug-tab-combat" aria-controls="debug-tab-content" data-debug-tab="combat">전투</button>
      <button type="button" role="tab" id="debug-tab-stages" aria-controls="debug-tab-content" data-debug-tab="stages">스테이지</button>
      <button type="button" role="tab" id="debug-tab-save" aria-controls="debug-tab-content" data-debug-tab="save">세이브</button>
      <button type="button" role="tab" id="debug-tab-info" aria-controls="debug-tab-content" data-debug-tab="info">정보</button>
    </nav>
    <div id="debug-tab-content" class="debug-content" role="tabpanel" tabindex="0"></div>
  `;
  const info = document.createElement('pre');
  info.id = 'debug-info';
  info.className = 'debug-info';
  info.hidden = true;
  document.querySelector('#game-screen').append(trigger, panel, info);

  const state = {
    activeTab: 'quick',
    invulnerable: false,
    oneHit: false,
    noCooldown: false,
    speed: 1,
    hitboxes: false,
    attacks: false,
    dodgeWindow: false,
    infoVisible: false,
    selectedBossStage: 'CB',
    seed: '',
    family: (() => {
      const weapon = context.inventory.find((item) => item.slot === 'weapon');
      return itemFamily(weapon) ?? 'sword';
    })(),
    slot: 'weapon',
    rarity: 'rare',
    ilvl: context.character?.level ?? 1,
    equip: true,
    enemyKind: 'Skeleton_Minion',
    jsonText: '',
  };
  const content = panel.querySelector('.debug-content');
  let pausedByPanel = false;
  let dragStartY = null;
  let infoFrameCount = 0;
  let infoLastTime = performance.now();
  let fps = 0;
  const confirmationTimers = new Map();
  const characterFamily = () => {
    const weapon = context.inventory.find((item) => item.slot === 'weapon');
    return itemFamily(weapon) ?? 'sword';
  };
  const inParty = () => Boolean(context.partyClient || context.world?.partySize > 1);
  const soloStage = () => context.world?.mode === 'stage' && !inParty();
  const partyReason = () => inParty() ? '파티 중에는 사용할 수 없어요' : null;
  const characterReason = () => partyReason() ?? (!context.character ? '캐릭터가 없어요' : null);
  const combatReason = () => partyReason() ?? (!soloStage() ? '전투 중에만 사용할 수 있어요' : null);
  const itemCapacityReason = (count = 1) => (
    context.inventory.length + count > 40 ? '가방이 가득 찼어요' : null
  );

  function remember(action) {
    const next = recordRecentAction(recent, action, storage);
    recent.splice(0, recent.length, ...next);
  }

  function allFamilySetOps(family, ilvl, rarity = 'rare') {
    const ops = [];
    for (const [slot] of SLOTS) {
      const { ops: itemOps } = renderItemGrant(null, family, slot, rarity, ilvl, context.character.level, true);
      ops.push(...itemOps);
    }
    return ops;
  }

  async function commitDebugOps(ops = []) {
    if (!context.character) throw new Error('캐릭터가 없어요');
    const operations = [...ops];
    if (!operations.some((operation) => operation.type === 'markDebug')) {
      operations.push({ type: 'markDebug' });
    }
    await context.applyOps(operations);
  }

  function currentSeed() {
    const value = state.seed.trim();
    if (!value) return null;
    const seed = Number(value);
    if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) {
      throw new Error('시드는 0~4294967295 사이 정수여야 합니다.');
    }
    return seed >>> 0;
  }

  function reasonFor(action) {
    const partyBlock = partyActionReason(inParty(), action);
    if (partyBlock) return partyBlock;
    const stageSaveBlock = debugStageSaveReason(action, context.world?.mode);
    if (stageSaveBlock) return stageSaveBlock;
    const cloudSaveBlock = debugCloudSaveReason(action, context.character);
    if (cloudSaveBlock) return cloudSaveBlock;
    if (['toggle-invulnerable', 'toggle-one-hit', 'toggle-no-cooldown', 'room-clear', 'instant-clear', 'summon-enemy'].includes(action)) {
      return combatReason();
    }
    if (['preset-boss', 'preset-set'].includes(action)) {
      return characterReason() ?? itemCapacityReason(5);
    }
    if (action === 'grant-item') {
      return characterReason() ?? itemCapacityReason(state.slot === 'all' ? 5 : 1);
    }
    if (['level-down', 'level-up', 'set-level', 'gold-1000', 'gold-10000', 'potions', 'family-sword', 'family-crossbow', 'family-staff', 'unlock-stages', 'tutorial-replay', 'reset-progress', 'reset-save'].includes(action)) {
      return characterReason();
    }
    if (action === 'grant-item') return characterReason() ?? itemCapacityReason();
    if (action.startsWith('start-stage:')) return characterReason();
    if (['toggle-hitboxes', 'toggle-attacks', 'toggle-dodge-window'].includes(action)) return combatReason();
    return null;
  }

  function actionMarkup(action, label = ACTION_LABELS[action] ?? action) {
    if (label === action && action.startsWith('start-stage:')) {
      const stage = STAGES[action.slice('start-stage:'.length)];
      label = stage ? `바로 시작 · ${stage.name}` : '바로 시작';
    }
    const reason = reasonFor(action);
    return button(action, escapeHtml(label), reason);
  }

  function renderQuick() {
    const recentMarkup = recent.length
      ? recent.map((action) => actionMarkup(action)).join('')
      : '<p class="debug-muted">최근 실행한 동작이 여기에 표시됩니다.</p>';
    return `<section><h2>최근 동작</h2><div class="debug-action-list">${recentMarkup}</div></section>
      <section><h2>빠른 프리셋</h2><div class="debug-action-list">
        ${actionMarkup('preset-boss')}
        ${actionMarkup('preset-set')}
        ${actionMarkup('toggle-invulnerable')}
        ${actionMarkup('room-clear')}
        ${actionMarkup('instant-clear')}
      </div></section>`;
  }

  function renderCharacter() {
    const reason = characterReason();
    const level = context.character?.level ?? 1;
    const family = characterFamily();
    const selectedFamily = state.family || family;
    return `<section><h2>능력치</h2><p>현재 레벨 ${level} · 경험치 ${context.character?.xp ?? 0}</p>
      <div class="debug-grid">
        ${actionMarkup('level-down', '−1 레벨')}
        ${actionMarkup('level-up', '+1 레벨')}
        ${actionMarkup('mastery-max', '숙련도 최대')}
        ${actionMarkup('mastery-reset', '숙련도 초기화')}
        <label>레벨<select data-debug-setting="level" ${reason ? 'disabled' : ''}>${options(Array.from({ length: 20 }, (_, index) => [String(index + 1), `Lv.${index + 1}`]), String(level))}</select></label>
        ${actionMarkup('gold-1000')}
        ${actionMarkup('gold-10000')}
        ${actionMarkup('potions')}
      </div></section>
      <section><h2>장비 지급</h2><div class="debug-grid">
        <label>계열<select data-debug-setting="family">${options(FAMILIES.map((id) => [id, FAMILY_LABELS[id]]), selectedFamily)}</select></label>
        <label>부위<select data-debug-setting="slot">${options([...SLOTS, ['all', '전체']], state.slot)}</select></label>
        <label>희귀도<select data-debug-setting="rarity">${options(Object.keys(RARITIES).map((id) => [id, RARITIES[id].name]), state.rarity)}</select></label>
        <label>아이템 레벨<input data-debug-setting="ilvl" type="number" min="1" max="20" value="${state.ilvl}" inputmode="numeric"></label>
      </div><label class="debug-check"><input data-debug-setting="equip" type="checkbox" ${state.equip ? 'checked' : ''}> 지급 후 바로 착용</label>
      ${actionMarkup('grant-item')}
      <h3>계열 전환</h3><div class="debug-action-list">${FAMILIES.map((id) => actionMarkup(`family-${id}`)).join('')}</div></section>
      <section><h2>진행</h2><div class="debug-action-list">
        ${actionMarkup('unlock-stages')}
        ${actionMarkup('tutorial-replay')}
        ${actionMarkup('reset-progress')}
      </div></section>`;
  }

  function renderCombat() {
    const reason = combatReason();
    const toggle = (action, label, enabled) => actionMarkup(action, `${label} · ${enabled ? '켜짐' : '꺼짐'}`);
    const kinds = [
      ['Skeleton_Minion', '해골 하수인'],
      ['Skeleton_Warrior', '해골 전사'],
    ];
    return `<section><h2>전투 치트</h2><div class="debug-action-list">
        ${toggle('toggle-invulnerable', '무적', state.invulnerable)}
        ${toggle('toggle-one-hit', '원킬', state.oneHit)}
        ${toggle('toggle-no-cooldown', '쿨다운 없음', state.noCooldown)}
      </div><label>속도<select data-debug-setting="speed" ${reason ? 'disabled' : ''}>${options([['0.5', '0.5×'], ['1', '1×'], ['2', '2×']], String(state.speed))}</select></label></section>
      <section><h2>전투 동작</h2><div class="debug-action-list">
        ${actionMarkup('room-clear')}
        ${actionMarkup('instant-clear')}
        <label>적 종류<select data-debug-setting="enemy">${options(kinds, state.enemyKind)}</select></label>
        ${actionMarkup('summon-enemy')}
      </div></section>
      <section><h2>표시</h2><div class="debug-action-list">
        ${toggle('toggle-hitboxes', '히트박스·충돌 발자국', state.hitboxes)}
        ${toggle('toggle-attacks', '적 공격 범위', state.attacks)}
        ${toggle('toggle-dodge-window', '완벽 회피 창', state.dodgeWindow)}
      </div></section>`;
  }

  function renderStages() {
    const regions = [...new Set(STAGE_LIST.map((stage) => stage.region))];
    const grouped = regions.map((region) => {
      const stages = STAGE_LIST.filter((stage) => stage.region === region);
      return `<section><h2>${region}지역</h2>${stages.map((stage) => {
        const boss = BOSS_STAGES.has(stage.id);
        const locked = !isStageUnlocked(stage.id, context.character?.clearedStages ?? []);
        const label = `${escapeHtml(stage.name)}${boss ? ' · 보스' : ''}${locked ? ' · 잠김' : ''}`;
        const action = `start-stage:${stage.id}`;
        return `<div class="debug-stage-row"><div><strong>${label}</strong><small>권장 Lv.${stage.recommendedLevel}</small></div>${actionMarkup(action, '바로 시작')}</div>`;
      }).join('')}</section>`;
    }).join('');
    const riftActions = [1, 5, 10, 20]
      .map((floor) => actionMarkup(`start-stage:R${floor}`, `${floor}층 바로 시작`))
      .join('');
    return `<section><h2>재현 시드</h2><label>시드<input data-debug-setting="seed" type="number" min="0" max="4294967295" inputmode="numeric" placeholder="무작위" value="${escapeHtml(state.seed)}"></label><label>보스 테스트 대상<select data-debug-setting="boss-stage">${options(STAGE_LIST.filter((stage) => BOSS_STAGES.has(stage.id)).map((stage) => [stage.id, stage.name]), state.selectedBossStage)}</select></section>${grouped}<section><h2>균열</h2><div class="debug-action-list">${riftActions}</div></section>`;
  }

  function renderSave() {
    const backupAvailable = (() => {
      try { return Boolean(storage.getItem(BACKUP_KEY)); } catch { return false; }
    })();
    const restoreReason = reasonFor('restore-backup') ?? (!backupAvailable ? '저장된 백업이 없어요' : null);
    return `<section><h2>JSON 저장</h2><div class="debug-action-list">
      ${actionMarkup('copy-json')}
      ${actionMarkup('import-json')}
      </div><textarea data-debug-setting="json" aria-label="세이브 JSON">${escapeHtml(state.jsonText)}</textarea></section>
      <section><h2>백업</h2><div class="debug-action-list">
        ${actionMarkup('backup-save')}
        ${button('restore-backup', ACTION_LABELS['restore-backup'], restoreReason)}
      </div></section>
      <section><h2>초기화</h2>${actionMarkup('reset-save')}</section>`;
  }

  function renderInfo() {
    const colos = context.getPartyColos?.();
    const ping = String(context.getPartyPing() ?? '—').replace(/\s*ms$/i, '');
    return `<section><h2>실행 정보</h2><p>SIM_HASH ${escapeHtml(context.simHash.slice(0, 8))} · 자산 ${escapeHtml(context.assetVersion)}</p><p>현재 시드 ${context.world?.seed ?? '—'} · 설정 시드 ${escapeHtml(state.seed || '무작위')}</p>
      <p>서버 ${escapeHtml(colos?.serverColo ?? '—')} · 접속 ${escapeHtml(colos?.edgeColo ?? '—')} · ping ${escapeHtml(ping)}ms</p>
      <label class="debug-check"><input data-debug-setting="info" type="checkbox" ${state.infoVisible ? 'checked' : ''}> 정보 오버레이 표시</label>
      <p>파티 중에는 정보 확인만 가능합니다.</p>
      <div class="debug-action-list">${button('disable-debug', '디버그 끄기')}</div></section>`;
  }

  function renderTab() {
    const tab = state.activeTab;
    for (const buttonElement of panel.querySelectorAll('[data-debug-tab]')) {
      buttonElement.setAttribute('aria-selected', String(buttonElement.dataset.debugTab === tab));
    }
    const contentHtml = {
      quick: renderQuick,
      character: renderCharacter,
      combat: renderCombat,
      stages: renderStages,
      save: renderSave,
      info: renderInfo,
    }[tab]?.() ?? '';
    content.innerHTML = contentHtml;
    if (inParty() && tab !== 'info') {
      for (const control of content.querySelectorAll('input, select, textarea')) control.disabled = true;
    }
  }

  function setInfoVisible(visible) {
    state.infoVisible = Boolean(visible);
    info.hidden = !state.infoVisible;
  }

  function setRendererFlags() {
    context.renderer?.setDebugOverlays?.({
      hitboxes: !inParty() && state.hitboxes,
      attacks: !inParty() && state.attacks,
      dodgeWindow: !inParty() && state.dodgeWindow,
    });
  }

  async function action(action, buttonElement = null) {
    if (action === 'disable-debug') {
      context.onDisable();
      return;
    }
    if (action === 'info') {
      setInfoVisible(!state.infoVisible);
      context.showToast(`정보 오버레이 ${state.infoVisible ? '켜짐' : '꺼짐'}`);
      renderTab();
      return;
    }
    if (DESTRUCTIVE_ACTIONS.has(action) && !confirmation.request(action)) {
      context.showToast('한 번 더 누르면 실행');
      if (buttonElement) {
        buttonElement.textContent = '한 번 더 누르면 실행';
        clearTimeout(confirmationTimers.get(action));
        confirmationTimers.set(action, setTimeout(() => {
          confirmation.clear(action);
          if (state.activeTab) renderTab();
        }, 3000));
      }
      return;
    }
    const blocked = reasonFor(action);
    if (blocked) {
      context.showToast(blocked);
      return;
    }

    let toast = '완료';
    if (action === 'preset-boss' || action === 'preset-set') {
      const bossTest = action === 'preset-boss';
      const stage = BOSS_STAGES.has(state.selectedBossStage)
        ? STAGES[state.selectedBossStage]
        : STAGES.CB;
      const level = bossTest ? stage.recommendedLevel : context.character.level;
      const family = characterFamily();
      const ops = [];
      if (bossTest) ops.push({ type: 'setLevel', level });
      ops.push(...allFamilySetOps(family, level, 'rare'));
      await context.applyOps(debugShortcutOperations(context.character, action, ops));
      if (bossTest) {
        context.closeDebugPanel();
        await context.startStage(stage.id, { seed: currentSeed() });
        toast = `레벨 ${level} · 희귀 장비 5개 · ${stage.name}`;
      } else toast = `${FAMILY_LABELS[family]} · 희귀 장비 5개 지급`;
    } else if (action === 'toggle-invulnerable') {
      state.invulnerable = !state.invulnerable;
      await commitDebugOps();
      toast = `무적 ${state.invulnerable ? '켜짐' : '꺼짐'}`;
    } else if (action === 'toggle-one-hit') {
      state.oneHit = !state.oneHit;
      await commitDebugOps();
      toast = `원킬 ${state.oneHit ? '켜짐' : '꺼짐'}`;
    } else if (action === 'toggle-no-cooldown') {
      state.noCooldown = !state.noCooldown;
      await commitDebugOps();
      toast = `쿨다운 없음 ${state.noCooldown ? '켜짐' : '꺼짐'}`;
    } else if (action === 'toggle-hitboxes' || action === 'toggle-attacks' || action === 'toggle-dodge-window') {
      const key = { 'toggle-hitboxes': 'hitboxes', 'toggle-attacks': 'attacks', 'toggle-dodge-window': 'dodgeWindow' }[action];
      state[key] = !state[key];
      setRendererFlags();
      await commitDebugOps();
      toast = `${ACTION_LABELS[action]} ${state[key] ? '켜짐' : '꺼짐'}`;
    } else if (action === 'room-clear') {
      await commitDebugOps();
      const killed = debugKillRoomEnemies(context.world, (inputs) => context.stepWorld(inputs));
      if (context.world.outcome) context.closeDebugPanel();
      toast = `방 정리 · 적 ${killed}마리 처치`;
    } else if (action === 'instant-clear') {
      await commitDebugOps();
      const killed = debugKillRoomEnemies(context.world, (inputs) => context.stepWorld(inputs));
      context.closeDebugPanel();
      completeStage(context.world, 'clear');
      await context.settleStage('clear');
      toast = `즉시 클리어 · 적 ${killed}마리 처치 · 정산 완료`;
    } else if (action === 'summon-enemy') {
      await commitDebugOps();
      const player = context.world.entities.find((entity) => entity.kind === 'player' && entity.playerId === context.character.id);
      if (!player) throw new Error('플레이어가 없습니다.');
      debugSpawnRoomEnemy(context.world, state.enemyKind, {
        x: player.x + Math.cos(player.facing) * 3,
        z: player.z + Math.sin(player.facing) * 3,
      });
      toast = '적 1마리 소환';
    } else if (action === 'level-down' || action === 'level-up') {
      const level = context.character.level + (action === 'level-up' ? 1 : -1);
      await commitDebugOps([{ type: 'setLevel', level }]);
      toast = `레벨 ${context.character.level}`;
    } else if (action === 'set-level') {
      await commitDebugOps([{ type: 'setLevel', level: Number(panel.querySelector('[data-debug-setting="level"]').value) }]);
      toast = `레벨 ${context.character.level}`;
    } else if (action === 'mastery-max' || action === 'mastery-reset') {
      const family = characterFamily();
      const xp = action === 'mastery-max' ? 300 : 0;
      await commitDebugOps((FAMILY_SKILLS[family] ?? FAMILY_SKILLS.sword).map((skill) => ({
        type: 'setMastery',
        skill,
        xp,
      })));
      toast = action === 'mastery-max' ? '현재 계열 숙련도 최대' : '현재 계열 숙련도 초기화';
    } else if (action === 'gold-1000' || action === 'gold-10000') {
      const amount = action === 'gold-1000' ? 1000 : 10000;
      await commitDebugOps([{ type: 'grantGold', amount }]);
      toast = `골드 +${amount.toLocaleString('ko-KR')}`;
    } else if (action === 'potions') {
      await commitDebugOps([{ type: 'setPotions', count: 5 }]);
      toast = '물약 5개 보유';
    } else if (action === 'grant-item') {
      const selectedSlot = state.slot;
      const targetSlots = selectedSlot === 'all' ? SLOTS.map(([slot]) => slot) : [selectedSlot];
      if (context.inventory.length + targetSlots.length > 40) throw new Error('가방이 가득 찼어요');
      const ops = [];
      const descriptions = [];
      for (const slot of targetSlots) {
        const { ops: itemOps, base } = renderItemGrant(
          context.world, state.family, slot, state.rarity, state.ilvl, context.character.level, state.equip,
        );
        ops.push(...itemOps);
        descriptions.push(base.name);
      }
      ops.push({ type: 'markDebug' });
      await context.applyOps(ops);
      toast = `장비 ${descriptions.length}개 지급${state.equip ? ' · 착용' : ''}`;
    } else if (action.startsWith('family-')) {
      const family = action.slice('family-'.length);
      const owned = context.inventory
        .filter((item) => itemFamily(item) === family && (item.requiredLevel ?? 1) <= context.character.level)
        .sort((left, right) => (
          (ITEMS[right.itemId]?.value ?? 0) + (right.enhance ?? 0)
          - (ITEMS[left.itemId]?.value ?? 0) - (left.enhance ?? 0)
        ))[0];
      if (owned) {
        await commitDebugOps([{ type: 'equip', uid: owned.uid, slot: 'weapon' }]);
        toast = `${FAMILY_LABELS[family]} 계열 · ${ITEMS[owned.itemId]?.name ?? '무기'} 착용`;
      } else {
        if (context.inventory.length >= 40) throw new Error('가방이 가득 찼어요');
        const { ops } = renderItemGrant(context.world, family, 'weapon', 'rare', context.character.level, context.character.level, true);
        await commitDebugOps(ops);
        toast = `${FAMILY_LABELS[family]} 희귀 무기 지급 · 착용`;
      }
    } else if (action === 'unlock-stages') {
      await context.applyOps(debugShortcutOperations(
        context.character,
        action,
        STAGE_LIST.map((stage) => ({ type: 'clearStage', stageId: stage.id })),
      ));
      toast = `모든 스테이지 해금 · ${STAGE_LIST.length}개`;
    } else if (action === 'tutorial-replay') {
      if (!await context.replayTutorial()) throw new Error('튜토리얼 상태가 없습니다.');
      toast = '튜토리얼 다시 보기';
    } else if (action === 'reset-progress') {
      await commitDebugOps([{ type: 'resetProgress' }]);
      toast = '진행 초기화 완료';
    } else if (action.startsWith('start-stage:')) {
      const stageId = action.slice('start-stage:'.length);
      const stage = STAGES[stageId];
      if (!stage) throw new Error('스테이지를 찾을 수 없습니다.');
      const seed = currentSeed();
      await context.applyOps(debugShortcutOperations(context.character, action));
      context.closeDebugPanel();
      await context.startStage(stage.id, { seed });
      toast = `${stage.name} 시작${seed === null ? '' : ` · 시드 ${seed}`}`;
    } else if (action === 'copy-json') {
      if (context.character) await commitDebugOps();
      state.jsonText = JSON.stringify(await context.exportSave(), null, 2);
      renderTab();
      try {
        await navigator.clipboard.writeText(state.jsonText);
        toast = 'JSON을 클립보드에 복사했습니다.';
      } catch {
        const textarea = content.querySelector('[data-debug-setting="json"]');
        textarea?.focus();
        textarea?.select();
        toast = '클립보드를 사용할 수 없어요. JSON을 선택해 복사하세요.';
      }
    } else if (action === 'import-json') {
      const textarea = panel.querySelector('[data-debug-setting="json"]');
      state.jsonText = textarea?.value ?? state.jsonText;
      await context.importSave(JSON.parse(state.jsonText));
      state.jsonText = '';
      toast = 'JSON 세이브를 불러왔습니다.';
    } else if (action === 'backup-save') {
      if (context.character) await commitDebugOps();
      storage.setItem(BACKUP_KEY, JSON.stringify(await context.exportSave()));
      toast = '로컬 백업을 저장했습니다.';
    } else if (action === 'restore-backup') {
      const backup = storage.getItem(BACKUP_KEY);
      if (!backup) throw new Error('저장된 백업이 없어요.');
      await context.importSave(JSON.parse(backup));
      toast = '백업을 복원했습니다.';
    } else if (action === 'reset-save') {
      await commitDebugOps([{ type: 'resetCharacter' }]);
      toast = '캐릭터 세이브를 초기화했습니다.';
    } else {
      return;
    }
    remember(action);
    if (action === 'import-json' || action === 'reset-save' || action === 'reset-progress') confirmation.clear(action);
    context.showToast(toast);
    renderTab();
  }

  function open() {
    panel.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    context.input?.setEnabled?.(false);
    const loop = context.loop;
    pausedByPanel = Boolean(context.world?.mode === 'stage' && !inParty() && loop && !loop.paused);
    if (pausedByPanel) loop.pause();
    renderTab();
    panel.querySelector('[data-debug-tab="quick"]')?.focus({ preventScroll: true });
  }

  function close() {
    panel.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    context.input?.setEnabled?.(true);
    if (pausedByPanel) context.loop?.resume();
    pausedByPanel = false;
  }

  trigger.addEventListener('click', () => {
    if (panel.hidden) open();
    else close();
  }, { signal });
  panel.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-debug-tab]');
    if (tab) {
      state.activeTab = tab.dataset.debugTab;
      renderTab();
      return;
    }
    if (event.target.closest('[data-debug-close]')) {
      close();
      return;
    }
    const actionButton = event.target.closest('[data-debug-action]');
    if (actionButton) void action(actionButton.dataset.debugAction, actionButton).catch((error) => {
      context.showToast(error.message ?? '동작을 실행하지 못했습니다.');
    });
  }, { signal });
  panel.addEventListener('change', (event) => {
    const target = event.target.closest('[data-debug-setting]');
    if (!target) return;
    const setting = target.dataset.debugSetting;
    if (setting === 'family' || setting === 'slot' || setting === 'rarity' || setting === 'enemy') state[setting] = target.value;
    else if (setting === 'ilvl') state.ilvl = Math.max(1, Math.min(20, Number(target.value) || 1));
    else if (setting === 'equip') state.equip = target.checked;
    else if (setting === 'seed') state.seed = target.value;
    else if (setting === 'boss-stage') state.selectedBossStage = target.value;
    else if (setting === 'speed') {
      state.speed = Number(target.value);
      applyDebugSpeed(context.loop, state.speed, inParty());
      remember('speed');
      void commitDebugOps().then(() => context.showToast(`속도 ${state.speed}×`));
    } else if (setting === 'level') {
      void action('set-level');
    } else if (setting === 'info') {
      setInfoVisible(target.checked);
      context.showToast(`정보 오버레이 ${state.infoVisible ? '켜짐' : '꺼짐'}`);
      renderTab();
    } else if (setting === 'json') state.jsonText = target.value;
  }, { signal });
  panel.addEventListener('pointerdown', (event) => event.stopPropagation(), { signal });
  panel.addEventListener('pointermove', (event) => event.stopPropagation(), { signal });
  panel.addEventListener('pointerup', (event) => event.stopPropagation(), { signal });
  panel.addEventListener('keydown', (event) => {
    if (event.code === 'Escape') {
      event.preventDefault();
      close();
    }
    event.stopPropagation();
  }, { signal });
  const handle = panel.querySelector('.debug-drag-handle');
  handle.addEventListener('pointerdown', (event) => {
    dragStartY = event.clientY;
    handle.setPointerCapture(event.pointerId);
    event.preventDefault();
  }, { signal });
  handle.addEventListener('pointerup', (event) => {
    if (dragStartY !== null && event.clientY - dragStartY > 70) close();
    dragStartY = null;
  }, { signal });
  renderTab();

  return {
    get isOpen() { return !panel.hidden; },
    get activeTab() { return state.activeTab; },
    applySpeed(loop = context.loop) {
      applyDebugSpeed(loop, state.speed, inParty());
    },
    beforeStep(world) {
      if (!soloStage() || world !== context.world) return;
      const player = world.entities.find((entity) => entity.kind === 'player' && entity.playerId === context.character?.id);
      if (player && state.invulnerable) player.hp = player.maxHp;
      if (player && state.noCooldown) {
        player.skillCooldowns = { 1: 0, 2: 0, 3: 0 };
        player.dodgeCooldownTicks = 0;
        player.potionCooldownTicks = 0;
      }
      if (state.oneHit) {
        for (const enemy of world.entities) {
          if (enemy.kind === 'enemy' && !enemy.dead) enemy.hp = 1;
        }
      }
    },
    frame(world, renderer, now = performance.now()) {
      setRendererFlags();
      infoFrameCount += 1;
      if (now - infoLastTime >= 500) {
        fps = Math.round(infoFrameCount * 1000 / Math.max(1, now - infoLastTime));
        infoFrameCount = 0;
        infoLastTime = now;
      }
      if (!state.infoVisible || !world) return;
      const player = world.entities.find((entity) => entity.kind === 'player' && entity.playerId === context.character?.id);
      const stats = renderer?.renderer?.info?.render;
      info.textContent = [
        `${fps} FPS · ${stats?.calls ?? 0} DC · ${(stats?.triangles ?? 0).toLocaleString('ko-KR')} tris`,
        `tick ${world.tick} · ${world.stageId ?? '허브'} / seed ${world.seed}`,
        `ping ${context.getPartyPing() ?? '—'} · entities ${world.entities.length}`,
        `HP ${player?.hp ?? '—'}/${player?.maxHp ?? '—'} · iF ${player?.iFrames ?? '—'} · dodge ${player?.dodgeCooldownTicks ?? '—'} · counter ${player?.counterReadyTicks ?? '—'}`,
        `SIM ${context.simHash.slice(0, 8)} · assets ${context.assetVersion}`,
      ].join('\n');
    },
    setInfoVisible,
    close,
    refresh: renderTab,
    destroy() {
      if (!panel.hidden) close();
      abort.abort();
      context.renderer?.setDebugOverlays?.({});
      resetDebugSpeed(context.loop);
      for (const timer of confirmationTimers.values()) clearTimeout(timer);
      trigger.remove();
      panel.remove();
      info.remove();
    },
  };
}
