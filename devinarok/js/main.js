import { createSaveRepository, DEFAULT_SETTINGS } from './save/repository.js';
import { RemoteSync } from './save/remote-sync.js';
import { InputLayer } from './core/input.js';
import { AttackInputAssistant, autoAttackDefault, buildPartyAssistedInput } from './core/attack-assist.js';
import { FixedStepLoop } from './core/loop.js';
import { ArenaRenderer } from './render/renderer.js';
import { AudioManager } from './render/audio.js';
import { PartyClient } from './ui/party.js';
import { ClockInputScheduler } from './net/clock-input-scheduler.js';
import { partyHttpBase, partyRoomsMarkup, quickJoinParty, sortPartyRooms } from './ui/party-finder.js';
import { escapeHtml } from './ui/escape-html.js';
import { applyHubEquipmentLook } from './ui/hub-player.js';
import { refreshStagePlayerCharacter } from './ui/stage-player.js';
import { handlePauseKey } from './ui/pause-menu.js';
import {
  createTutorialState, resolveTutorialSortie, shouldRenderTutorialCard, TUTORIAL_COPY, transitionTutorial,
} from './ui/tutorial.js';
import { createTapToggle, initializeDebugMode, persistDebugMode } from './core/debug-toggle.js';
import { SANCTUARY_ARENA } from './sanctuary/arena.js';
import { SanctuaryVfx } from './sanctuary/vfx.js';
import {
  BURN_DONE, BURN_NOTE, CHIAO_FOOTER, INCENSE_DONE, RITUAL_CANCEL_HINT,
  advanceRitual, cancelRitual, createRitualState, nearestRitual, resetRitual,
  ritualMovement, startRitual, throwChiao,
} from './sanctuary/state.js';
import { computeBotPolicy } from './net/bot-policy.js';
import { buildRangedAimInput } from './net/ranged-aim.js';
import { SIM_HASH } from './net/sim-version.js';
import { AFFIXES } from './content/affixes.js';
import { contractDayFirst, contractDescription, contractsFor, kstDateKey } from './content/contracts.js';
import { OBJECTIVE_LABELS, objectiveBonusGold } from './content/objectives.js';
import { equipmentLook, FAMILY_STARTER_WEAPONS, ITEM_SETS, ITEMS, RARITIES } from './content/items.js';
import { FAMILY_SKILLS, SKILLS } from './content/skills.js';
import {
  MASTERY_MAX_XP, MASTERY_THRESHOLDS, masteryBonus, masteryRank, nextThreshold,
} from './content/mastery.js';
import { rekeySettlementItems } from './save/ops.js';
import { acquireSettlement } from './save/settlement-lock.js';
import {
  DIFFICULTIES, HUB_ARENA, effectiveStageLevel, isDifficultyUnlocked, isStageUnlocked, latestStage, stageClearKey, STAGE_LIST,
} from './content/stages.js';
import {
  BUTTONS, COMBO_TIMELINES, DODGE_COOLDOWN_TICKS, calculatePlayerStats, completeStage, createHubWorld,
  createStageWorld, retreatStage, rollStageItem, step,
} from './sim/world.js';

const $ = (selector) => document.querySelector(selector);
const query = new URLSearchParams(location.search);
const DEV_MODE = query.get('dev') === '1';
const DEV_COLLISION_OVERLAY = DEV_MODE && query.get('collide') === '1';
let debugEnabled = initializeDebugMode(query, localStorage);
let debugController = null;
let debugPanelModule = null;
let debugModulePromise = null;
const titleScreen = $('#title-screen');
const gameScreen = $('#game-screen');
const createForm = $('#create-form');
const characterCard = $('#character-card');
const pauseMenu = $('#pause-menu');
const hubUi = $('#hub-ui');
const hubPanel = $('#hub-panel');
const resultPanel = $('#result-panel');
let saves;
let remoteSync;
let character;
let inventory = [];
let inventoryFilter = 'all';
let inventoryTab = 'equipment';
let world;
let renderer;
let input;
let loop;
let frame;
const settlementState = { settled: false };
let firstForestUnlock = false;
let settlementId = null;
let settings = { ...DEFAULT_SETTINGS };
let settingsReturnToPause = false;
let tutorialState = null;
let tutorialSaveChain = Promise.resolve();
let tutorialLastX = null;
let tutorialLastZ = null;
const audio = new AudioManager();
const attackInputAssistant = new AttackInputAssistant();
let currentStageId = null;
let currentStageDifficulty = 'normal';
let boardDifficulty = 'normal';
let boardTab = 'quests';
let blacksmithTab = 'enhance';
let selectedReforgeUid = null;
let selectedReforgeIndex = null;
const OBJECTIVE_ENEMY_NAMES = {
  warrior: '해골 전사',
  brute: '무너진 거한',
};
let reforgeResult = null;
let partyClient = null;
let partyFrame = null;
let partyPreviousWorld = null;
let partyLastRenderTime = 0;
let partyRendererReady = false;
let partyLobbySelection = { hostId: null, difficulty: null, wasHost: false };
let partyInputTimer = null;
let partyInputDriverStats = {};
const partyInputScheduler = new ClockInputScheduler();
let inviteRoomHandled = false;
let reviveText = new Map();
let partyHudCaptureFrozen = false;
let partyFinderTimer = null;
let partyFinderRooms = [];
let partyFinderState = 'loading';
let partyFinderLastRefresh = 0;
let partyQuickJoining = false;
let partyQuickLookupFailed = false;
let partyQuickAbortController = null;
let partyFeedbackMessage = '';
let partyFeedbackIsError = false;
let sanctuaryState = null;
let sanctuaryVfx = null;
let sanctuaryBurnAudio = null;
let actionToastTimer = null;
let counterPunchTimer = null;
let counterToastTimer = null;
let lastGoldPickupSoundAt = -Infinity;

function suppressGameGesture(event) {
  if (!world && !partyClient?.runId) return;
  if (event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
  event.preventDefault();
}

for (const type of ['contextmenu', 'selectstart', 'dragstart', 'gesturestart']) {
  gameScreen.addEventListener(type, suppressGameGesture, { passive: false });
}

function autoAttackEnabled() {
  return settings.autoAttack ?? autoAttackDefault({
    coarsePointer: window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0,
  });
}

function showActionToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  clearTimeout(actionToastTimer);
  actionToastTimer = setTimeout(() => {
    if (toast.textContent === message) toast.textContent = '';
  }, 1500);
}

function updateCloudLogoutButton() {
  const button = $('#cloud-logout-button');
  const disabled = Boolean(remoteSync?.userId) && (world?.mode === 'stage' || Boolean(partyClient));
  const label = disabled ? '여관에서 로그아웃할 수 있어요' : '로그아웃';
  button.disabled = disabled;
  button.textContent = label;
  button.title = disabled ? label : '';
}

function renderCloudAccount(state = remoteSync?.snapshot) {
  if (!state) return;
  const label = state.status === 'syncing' ? '동기화 중'
    : state.status === 'offline' ? '오프라인 · 기기에 저장됨'
      : state.status === 'error' ? `동기화 오류 · ${state.error ?? '다시 시도해 주세요'}`
        : state.loggedIn
          ? `${state.accountName} · ${state.lastSyncAt ? `마지막 동기화 ${new Date(state.lastSyncAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}` : '서버 저장 준비됨'}`
          : '게스트 저장 · 이 기기만';
  $('#cloud-account-state').textContent = label;
  $('#cloud-account-prompt').hidden = state.loggedIn;
  $('#cloud-login-button').hidden = state.loggedIn;
  $('#cloud-sync-button').hidden = !state.loggedIn;
  $('#cloud-sync-button').disabled = state.status === 'syncing';
  $('#cloud-logout-button').hidden = !state.loggedIn;
  updateCloudLogoutButton();
  const badge = $('#cloud-save-badge');
  badge.hidden = !['offline', 'error'].includes(state.status);
  badge.textContent = state.status === 'offline' ? '오프라인 저장' : '동기화 오류';

  const chooser = $('#cloud-character-chooser');
  chooser.replaceChildren();
  chooser.hidden = !state.needsChooser;
  if (!state.needsChooser) return;
  for (const [title, entries, action, labelText] of [
    ['서버 캐릭터', state.serverCharacters, 'useServer', '이 캐릭터 사용'],
    ['이 기기 캐릭터', state.deviceCharacters, 'uploadDevice', '서버에 올리기'],
  ]) {
    if (!entries.length) continue;
    const group = document.createElement('section');
    group.className = 'cloud-character-group';
    const heading = document.createElement('strong');
    heading.textContent = title;
    group.append(heading);
    for (const entry of entries) {
      const info = entry.character ?? entry;
      const row = document.createElement('div');
      row.className = 'cloud-character-entry';
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset[action] = info.id;
      const name = document.createElement('span');
      name.textContent = info.name;
      const level = document.createElement('small');
      level.textContent = `Lv.${info.level} · ${labelText}`;
      button.append(name, level);
      row.append(button);
      if (entry.importFailure) {
        const reason = document.createElement('small');
        reason.className = 'cloud-import-failure';
        reason.textContent = entry.importFailure.message;
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.dataset.retryImport = info.id;
        retry.textContent = '다시 시도';
        row.append(reason, retry);
      }
      group.append(row);
    }
    chooser.append(group);
  }
}

let cloudLoginWatcher = null;
let sharedWalletLoadPromise = null;

async function loadSharedWallet() {
  window.SharedWalletConfig = { ...(window.SharedWalletConfig ?? {}), autoGuest: false };
  if (!sharedWalletLoadPromise) {
    sharedWalletLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = new URL('../lib/shared-wallet.js', window.location.href).href;
      script.dataset.noUi = '';
      script.addEventListener('load', resolve, { once: true });
      script.addEventListener('error', () => {
        script.remove();
        sharedWalletLoadPromise = null;
        reject(new Error('로그인 모듈을 불러오지 못했어요'));
      }, { once: true });
      document.head.append(script);
    });
  }
  await sharedWalletLoadPromise;
  const wallet = typeof SharedWallet !== 'undefined' ? SharedWallet : null;
  if (!wallet) throw new Error('로그인 모듈을 불러오지 못했어요');
  if (wallet._initPromise) await wallet._initPromise;
  return wallet;
}

async function openCloudLogin() {
  try {
    const wallet = await loadSharedWallet();
    wallet.showLogin();
    clearInterval(cloudLoginWatcher);
    cloudLoginWatcher = setInterval(async () => {
      if (!remoteSync.readIdentity()) return;
      clearInterval(cloudLoginWatcher);
      cloudLoginWatcher = null;
      await remoteSync.loginCompleted();
      await refreshTitle();
    }, 400);
  } catch (error) {
    showActionToast(error?.message ?? '로그인을 시작하지 못했어요');
  }
}

function showCounterToast(player) {
  const toast = $('#counter-toast');
  const point = renderer?.projectWorldPosition(player?.x, 2.3, player?.z);
  if (!point?.visible) return;
  clearTimeout(counterToastTimer);
  toast.textContent = '반격!';
  toast.style.left = `${point.left}px`;
  toast.style.top = `${point.top}px`;
  toast.hidden = false;
  toast.classList.remove('active');
  void toast.offsetWidth;
  toast.classList.add('active');
  counterToastTimer = setTimeout(() => {
    toast.classList.remove('active');
    toast.hidden = true;
  }, 600);
}

function showCounterPresentation() {
  if (reducedMotionEnabled()) return;
  const camera = renderer?.camera;
  const property = camera && Number.isFinite(camera.fov) ? 'fov' : 'zoom';
  const initial = camera?.[property];
  if (Number.isFinite(initial)) {
    camera[property] = property === 'fov' ? initial + 2 : initial * 1.06;
    camera.updateProjectionMatrix();
  }
  document.body.classList.add('counter-flash');
  clearTimeout(counterPunchTimer);
  counterPunchTimer = setTimeout(() => {
    if (camera && renderer?.camera === camera && Number.isFinite(initial)) {
      camera[property] = initial;
      camera.updateProjectionMatrix();
    }
    document.body.classList.remove('counter-flash');
  }, 120);
}

async function reloadCharacter() {
  character = await saves.loadCharacter(character.id);
  inventory = await saves.listItems(character.id);
}

async function enableDebugMode({ announce = true } = {}) {
  debugEnabled = true;
  persistDebugMode(true, localStorage);
  debugModulePromise ??= import('./debug/panel.js');
  debugPanelModule ??= await debugModulePromise;
  if (!debugEnabled) return null;
  if (!debugController) debugController = debugPanelModule.mountDebugPanel(createDebugContext());
  if (announce) showActionToast('디버그 모드 켜짐');
  return debugController;
}

function disableDebugMode({ announce = true } = {}) {
  debugEnabled = false;
  persistDebugMode(false, localStorage);
  debugController?.destroy();
  debugController = null;
  if (announce) showActionToast('디버그 모드 꺼짐');
}

function toggleDebugMode() {
  if (debugEnabled) disableDebugMode();
  else void enableDebugMode();
}

function createDebugContext() {
  return {
    get world() { return world; },
    get renderer() { return renderer; },
    get loop() { return loop; },
    get input() { return input; },
    get character() { return character; },
    get inventory() { return inventory; },
    get partyClient() { return partyClient; },
    get currentStageId() { return currentStageId; },
    get debugEnabled() { return debugEnabled; },
    get simHash() { return SIM_HASH; },
    get assetVersion() {
      return new URL(document.querySelector('script[type="module"][src*="main.js"]')?.src ?? location.href)
        .searchParams.get('v') ?? 'local';
    },
    applyOps: (ops) => {
      if (character?.cloudUserId && ops.some((operation) => ['resetProgress', 'resetCharacter'].includes(operation.type))) {
        throw new Error('클라우드 캐릭터에서는 사용할 수 없어요');
      }
      return applyOps(ops, { context: { kind: 'debug' } });
    },
    reloadCharacter,
    exportSave: () => saves.export(),
    async importSave(payload) {
      if (character?.cloudUserId) {
        throw new Error('클라우드 캐릭터에서는 사용할 수 없어요');
      }
      await saves.import(payload);
      await refreshTitle();
      if (character) await applyOps([{ type: 'markDebug' }], { context: { kind: 'debug' } });
    },
    async replayTutorial() {
      if (!tutorialState) return false;
      const next = transitionTutorial(tutorialState, { type: 'replay' });
      tutorialState = next;
      renderTutorialCard();
      await applyOps(
        [{ type: 'updateTutorial', state: next }, { type: 'markDebug' }],
        { context: { kind: 'debug' } },
      );
      return true;
    },
    startStage,
    settleStage,
    async clearStage(outcome) {
      if (!world || partyClient || world.mode !== 'stage') return false;
      await applyOps([{ type: 'markDebug' }], { context: { kind: 'debug' } });
      completeStage(world, outcome);
      return settleStage(outcome);
    },
    stepWorld(inputs) {
      if (loop?.stepOnce) return loop.stepOnce(inputs);
      return step(world, inputs);
    },
    closeDebugPanel: () => debugController?.close(),
    localStorage,
    getPartyPing() {
      return partyClient ? ($('#party-rtt').textContent || null) : null;
    },
    getPartyColos() {
      return partyClient
        ? { serverColo: partyClient.serverColo, edgeColo: partyClient.edgeColo }
        : null;
    },
    showToast: showActionToast,
    onDisable: () => disableDebugMode(),
  };
}

function installDebugVersionToggle() {
  const button = $('#settings-version-toggle');
  const script = document.querySelector('script[type="module"][src*="main.js"]');
  const version = new URL(script?.src ?? location.href).searchParams.get('v') ?? 'local';
  $('#settings-asset-version').textContent = version;
  button.addEventListener('click', createTapToggle(toggleDebugMode));
}

function reducedMotionEnabled() {
  return settings.reducedMotion ?? window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function hapticsEnabled() {
  return settings.haptics ?? typeof navigator.vibrate === 'function';
}

function applySettings() {
  document.body.classList.toggle('large-text', settings.largeText);
  document.body.classList.toggle('reduced-motion', reducedMotionEnabled());
  audio.setBgmVolume(settings.bgmVolume / 100);
  audio.setSfxVolume(settings.sfxVolume / 100);
  audio.setMuted(settings.muted);
  $('#bgm-volume').value = String(settings.bgmVolume);
  $('#sfx-volume').value = String(settings.sfxVolume);
  $('#bgm-volume-value').value = String(settings.bgmVolume);
  $('#sfx-volume-value').value = String(settings.sfxVolume);
  $('#quality-setting').value = settings.quality;
  $('#reduced-motion-setting').checked = reducedMotionEnabled();
  $('#large-text-setting').checked = settings.largeText;
  $('#haptics-setting').checked = hapticsEnabled();
  $('#haptics-setting').disabled = typeof navigator.vibrate !== 'function';
  $('#telegraph-setting').checked = settings.telegraphEmphasis;
  $('#auto-attack-setting').checked = autoAttackEnabled();
  $('#auto-attack-chip').hidden = !autoAttackEnabled();
  $('#settings-mute-button').textContent = settings.muted ? '소리 켜기' : '음소거';
  $('#mute-button').textContent = settings.muted ? '소리 켜기' : '소리 끄기';
  renderer?.setQualityMode(settings.quality);
  renderer?.setReducedMotion(reducedMotionEnabled());
  renderer?.setTelegraphEmphasis(settings.telegraphEmphasis);
  sanctuaryVfx?.setReducedMotion(reducedMotionEnabled());
}

async function saveSetting(key, value) {
  settings = await saves.commitSettings({ [key]: value });
  applySettings();
}

function updateTutorial(event) {
  if (!tutorialState) return;
  const next = transitionTutorial(tutorialState, event);
  if (
    next.step === tutorialState.step
    && next.skipped === tutorialState.skipped
    && next.completed === tutorialState.completed
    && next.combatComplete === tutorialState.combatComplete
    && next.perfectDodgeHintShown === tutorialState.perfectDodgeHintShown
  ) return;
  tutorialState = next;
  renderTutorialCard();
  updateInventoryUpgradeBadge();
  const state = { ...next };
  tutorialSaveChain = tutorialSaveChain.then(async () => {
    if (!character) return;
    character = await commit([{ type: 'updateTutorial', state }]);
  }).catch((error) => console.error('Tutorial save failed', error));
}

function trackTutorialMovement(current) {
  if (!current || tutorialState?.step !== 'movement') return;
  let hero = null;
  for (const entity of current.entities) {
    if (entity.kind === 'player' && entity.playerId === character?.id) {
      hero = entity;
      break;
    }
  }
  if (!hero) return;
  if (
    tutorialLastX !== null
    && (Math.abs(hero.x - tutorialLastX) > 0.02 || Math.abs(hero.z - tutorialLastZ) > 0.02)
  ) updateTutorial({ type: 'movement' });
  tutorialLastX = hero.x;
  tutorialLastZ = hero.z;
}

function renderTutorialCard() {
  const card = $('#tutorial-card');
  const copy = tutorialState?.active ? TUTORIAL_COPY[tutorialState.step] : null;
  card.hidden = Boolean(partyClient?.runId && !partyClient.result)
    || !copy
    || !shouldRenderTutorialCard(world?.mode, tutorialState);
  if (!copy || card.hidden) return;
  $('#tutorial-title').textContent = copy.title;
  const touch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  const messages = touch
    ? {
      movement: '화면 왼쪽 조이스틱으로 이동해 보세요.',
      attack: '화면의 공격 버튼으로 적을 공격하세요.',
      dodge: '적이 공격을 예고하면 위험 표시를 보고 회피하세요.',
      dodgeTelegraph: '회피 버튼을 눌러 위험 표시 밖으로 벗어나세요.',
      skill: '화면의 기술 버튼으로 계열 기술을 사용해 보세요.',
      loot: '적이 떨어뜨린 전리품 가까이 다가가 자동으로 주우세요.',
    }
    : {
      movement: 'WASD 또는 방향키로 이동해 보세요.',
      attack: 'J 키로 적을 공격하세요.',
      dodge: '적이 공격을 예고하면 위험 표시를 보고 회피하세요.',
      dodgeTelegraph: '방향키와 K 키로 위험 표시 밖으로 벗어나세요.',
      skill: '1 키로 계열 기술을 사용해 보세요.',
      loot: '적이 떨어뜨린 전리품 가까이 다가가 자동으로 주우세요.',
    };
  $('#tutorial-message').textContent = messages[tutorialState.step] ?? copy.message;
  $('#tutorial-skip').hidden = false;
}

function playCastSound(event) {
  if (event.skillId === 'counter') {
    if (event.family === 'crossbow') audio.play('crossbow-shot');
    else if (event.family === 'staff') audio.play('staff-cast');
    else audio.play('sword-swing');
  } else if (event.skill !== undefined) {
    const sounds = {
      sword: { 3: 'shield-clang', 4: 'impact' },
      crossbow: { 1: 'crossbow-shot', 2: 'crossbow-shot', 3: 'crossbow-shot', 4: 'crossbow-shot' },
      staff: { 1: 'flame', 2: 'frost', 3: 'blink', 4: 'impact' },
    };
    audio.play(sounds[event.family]?.[event.skill] ?? 'staff-cast');
  } else if (event.family === 'staff') audio.play('staff-cast');
  else if (event.family !== 'crossbow') audio.play('sword-swing');
}

function handleAudioEvent(event, current) {
  const localPlayer = current?.entities.find((entity) => (
    entity.kind === 'player' && entity.playerId === character?.id
  ));
  if (event.type === 'cast') {
    if (!event.predictedLocally) playCastSound(event);
    if (event.skillId === 'counter' && event.playerId === character?.id) {
      showCounterToast(localPlayer);
      showCounterPresentation();
    }
  }
  if (event.type === 'shot') audio.play('crossbow-shot');
  if (event.type === 'impact') audio.play(event.kind === 'flame' ? 'flame' : event.kind === 'frost' ? 'frost' : 'impact');
  if (event.type === 'perfectBlock') audio.play('shield-clang');
  else if (event.type === 'hit') {
    if (event.blocked || event.guarded) audio.play('shield-clang');
    else if (!event.predictedLocally) audio.play('impact');
  }
  if (
    (event.type === 'dodge' && (event.playerId === character?.id || event.entityId === localPlayer?.id))
    || (event.type === 'hit' && event.damage > 0 && event.targetId === localPlayer?.id)
  ) playHaptic();
  if (event.type === 'dodge') audio.play('footstep');
  if (event.type === 'perfectDodge' && event.playerId === character?.id) {
    const firstHint = !tutorialState?.perfectDodgeHintShown;
    updateTutorial({ type: 'perfectDodge' });
    if (firstHint) showActionToast('완벽한 회피! 바로 공격하면 반격해요.');
  }
  if (event.type === 'telegraph') {
    const enemy = current?.entities.find((entity) => entity.id === event.entityId);
    if (enemy?.boss) audio.play('boss-telegraph');
    updateTutorial({ type: 'telegraph' });
  }
  if (event.type === 'bossSummon') audio.play('summon');
  if (event.type === 'bossBlink') audio.play('blink');
  if (event.type === 'objectiveComplete') {
    showActionToast('목표 달성! 보상이 떨어졌어요');
    audio.play('reward-chime');
  }
  if (event.type === 'objectiveFailed') {
    showActionToast('목표 실패');
    audio.play('enemy-death');
  }
  if (event.type === 'death') audio.play('enemy-death');
  if (event.type === 'lootSpawn' && ['rare', 'legendary'].includes(event.item?.rarity)) audio.play('reward-chime');
  if (event.type === 'doorOpen') audio.play('door-open');
  if (event.type === 'potion') audio.play('potion');
  if (event.type === 'pickup') {
    const isLocalPickup = event.playerId === character?.id || event.entityId === localPlayer?.id;
    if (isLocalPickup) {
      if (event.lootType === 'gold') {
        const now = performance.now();
        if (now - lastGoldPickupSoundAt >= 120) {
          audio.play('coins');
          lastGoldPickupSoundAt = now;
        }
      } else {
        audio.play(event.lootType === 'potion' ? 'potion' : 'confirm');
      }
      if (event.lootType === 'item' && ['rare', 'legendary'].includes(event.item?.rarity)) {
        audio.play('reward-chime');
      }
      if (['item', 'potion'].includes(event.lootType)) updateTutorial({ type: 'loot' });
    }
  }
  if (event.type === 'spawn' && event.boss) audio.play('roar', { rate: 0.62 });
  if (event.type === 'cast' && event.step) updateTutorial({ type: 'attack' });
  if (event.type === 'cast' && event.skill !== undefined) updateTutorial({ type: 'skill' });
  if (event.type === 'dodge') updateTutorial({ type: 'dodge' });
  if (event.type === 'spawn' && event.boss) {
    $('#boss-intro').hidden = false;
    setTimeout(() => { $('#boss-intro').hidden = true; }, 2800);
  }
}

function playHaptic() {
  if (!hapticsEnabled()) return;
  try {
    navigator.vibrate?.(24);
  } catch {}
}

async function refreshTitle() {
  const characters = await saves.listCharacters();
  character = (remoteSync ? remoteSync.visibleCharacters(characters) : characters)
    .sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;
  inventory = character ? await saves.listItems(character.id) : [];
  $('#save-warning').hidden = saves.persistent;
  $('#save-warning').textContent = saves.persistent ? '' : '저장이 브라우저 메모리에만 남습니다. 브라우저를 닫으면 기록이 사라질 수 있어요.';
  createForm.hidden = Boolean(character);
  characterCard.hidden = !character;
  if (character) {
    tutorialState = createTutorialState(character.tutorial);
    $('#character-name').textContent = character.name;
    $('#character-level').textContent = `기사 · Lv.${character.level} · 경험치 ${character.xp}`;
    $('#character-debug-used').hidden = !character.debugUsed;
  }
  updateInventoryUpgradeBadge();
}

function stopWorld() {
  if (frame) cancelAnimationFrame(frame);
  if (partyFrame) cancelAnimationFrame(partyFrame);
  frame = null;
  partyFrame = null;
  partyPreviousWorld = null;
  partyLastRenderTime = 0;
  partyRendererReady = false;
  partyInputScheduler.reset();
  partyHudCaptureFrozen = false;
  if (partyInputTimer !== null) clearInterval(partyInputTimer);
  partyInputTimer = null;
  loop?.stop();
  input?.destroy();
  if (sanctuaryState) resetRitual(sanctuaryState);
  sanctuaryState = null;
  sanctuaryVfx?.destroy();
  sanctuaryVfx = null;
  sanctuaryBurnAudio?.stop();
  sanctuaryBurnAudio = null;
  renderer?.destroy();
  loop = input = renderer = null;
}

async function showTitle() {
  stopWorld();
  partyClient?.close();
  partyClient = null;
  world = null;
  $('#hub-party-button').hidden = true;
  titleScreen.hidden = false;
  gameScreen.hidden = true;
  resultPanel.hidden = true;
  updateCloudLogoutButton();
  await refreshTitle();
}

async function commit(ops, context = { kind: 'hub' }) {
  const cloudUserId = character?.cloudUserId === remoteSync?.userId ? remoteSync.userId : undefined;
  const result = await saves.commit({
    characterId: character.id,
    baseRev: character.rev,
    ops,
    context,
    cloudUserId,
  });
  remoteSync?.localCommit();
  return result;
}

async function applyOps(ops, { context = { kind: 'hub' } } = {}) {
  await tutorialSaveChain;
  character = await commit(ops, context);
  inventory = await saves.listItems(character.id);
  $('#character-debug-used').hidden = !character.debugUsed;
  tutorialState = createTutorialState(character.tutorial);
  renderTutorialCard();
  if (world?.mode === 'hub') refreshHubPlayer();
  else if (world?.mode === 'stage' && !partyClient) refreshSoloStagePlayer();
  return character;
}

function refreshSoloStagePlayer() {
  if (!character) return;
  const player = world?.entities.find((entity) => entity.kind === 'player' && entity.playerId === character.id);
  if (!player) return;
  const equipment = equippedItems();
  const stats = calculatePlayerStats(character.level, equipment);
  const look = equipmentLook(equipment);
  refreshStagePlayerCharacter(player, character, equipment, look, stats);
}

function equippedItems() {
  const ids = new Set(Object.values(character.equipment ?? {}).filter(Boolean));
  return inventory.filter((item) => ids.has(item.uid));
}

function refreshHubPlayer() {
  if (!character || world?.mode !== 'hub') return;
  const equipment = equippedItems();
  const player = world.entities.find((entity) => entity.kind === 'player' && entity.playerId === character.id);
  if (!player) return;
  const stats = calculatePlayerStats(character.level, equipment);
  const look = applyHubEquipmentLook(player, equipment);
  Object.assign(player, {
    level: character.level,
    stats,
    maxHp: stats.maxHp,
    hp: stats.maxHp,
  });
  updateInventoryUpgradeBadge();
  updateHud(world);
}

function stageIsUnlocked(stageId, difficulty = 'normal') {
  return isStageUnlocked(stageId, character.clearedStages, difficulty);
}

function drawHub() {
  if (!character || !renderer || !world || world.mode !== 'hub') return;
  updateHud(world);
  renderer.render(world, world, 1);
  debugController?.frame(world, renderer, performance.now());
  frame = requestAnimationFrame(drawHub);
}

async function enterHub() {
  stopPartyFinderPolling();
  stopWorld();
  partyClient?.close();
  partyClient = null;
  updateCloudLogoutButton();
  $('#hub-party-button').hidden = false;
  $('#hub-ui [data-panel="sanctuary"]').disabled = false;
  $('#sanctuary-party-disabled').hidden = true;
  gameScreen.classList.remove('sanctuary-mode');
  $('#sanctuary-hud').hidden = true;
  $('#sanctuary-interact').hidden = true;
  $('#sanctuary-feedback').hidden = true;
  $('#key-hints').textContent = 'WASD 이동 · 조이스틱 이동';
  titleScreen.hidden = true;
  gameScreen.hidden = false;
  hubUi.hidden = false;
  hubPanel.hidden = true;
  pauseMenu.hidden = true;
  resultPanel.hidden = true;
  $('#controls').hidden = false;
  $('#controls').classList.add('hub-controls');
  $('#boss-hud').hidden = true;
  $('#party-hud').hidden = true;
  $('#party-rtt').hidden = true;
  $('#party-door-countdown').hidden = true;
  $('#party-downed').hidden = true;
  $('#party-network-overlay').hidden = true;
  $('#stage-name').textContent = localStorage.getItem('devinarok.lastStageRegion') === '2'
    ? '잿빛 숲 · 거점 여관'
    : '거점 여관';
  $('#hud-name').textContent = character.name;
  world = createHubWorld({
    seed: 724103,
    playerId: character.id,
    level: character.level,
    equipment: equippedItems(),
  });
  const hero = world.entities.find((entity) => entity.kind === 'player' && entity.playerId === character.id);
  if (hero) Object.assign(hero, equipmentLook(equippedItems()));
  input = new InputLayer({ canvas: $('#scene'), controls: $('#controls') });
  renderer = new ArenaRenderer($('#scene'), () => {}, HUB_ARENA, DEV_COLLISION_OVERLAY, world);
  renderer.localPlayerId = character.id;
  const [, music] = await Promise.all([renderer.ready, loadAudioForScene('hub')]);
  applySettings();
  updateInventoryUpgradeBadge();
  updateContractClaimBadge();
  await audio.unlock();
  audio.setMusic(music, { crossfadeMs: 1000 });
  renderTutorialCard();
  $('#hub-ui [data-panel="board"]').classList.toggle('tutorial-pulse', tutorialState?.step === 'board');
  loop = new FixedStepLoop({
    world,
    playerId: character.id,
    input,
    beforeStep: (current) => debugController?.beforeStep(current),
    render: (previous, current, alpha) => {
      updateHud(current);
      renderer?.render(previous, current, alpha);
      debugController?.frame(current, renderer, performance.now());
    },
  });
  debugController?.applySpeed(loop);
  loop.start();
  const inviteCode = new URLSearchParams(location.search).get('room');
  if (inviteCode && !inviteRoomHandled) {
    inviteRoomHandled = true;
    void connectParty(inviteCode).catch((error) => {
      setPartyToast(partyJoinErrorMessage(error), { error: true });
      renderPanel('party-finder');
    });
  }
}

function renderSanctuaryHud(current) {
  if (!character) return;
  const hero = current.entities.find((entity) => entity.kind === 'player' && entity.playerId === character.id);
  sanctuaryState.nearby = hero ? nearestRitual(hero.x, hero.z) : null;
  const interact = $('#sanctuary-interact');
  interact.hidden = Boolean(sanctuaryState.active) || !sanctuaryState.nearby;
  interact.textContent = sanctuaryState.nearby
    ? `상호작용 · ${sanctuaryState.nearby.prompt}`
    : '상호작용';
  $('#sanctuary-cancel').hidden = !sanctuaryState.active;
  const feedback = $('#sanctuary-feedback');
  const result = sanctuaryState.active?.id === 'chiao' && sanctuaryState.active.phase === 'settled'
    ? sanctuaryState.active.result
    : null;
  const message = sanctuaryState.feedback;
  if (result) {
    feedback.innerHTML = `<h2>${result.name}</h2><p>${result.description}</p><small>${CHIAO_FOOTER}</small><small>${RITUAL_CANCEL_HINT}</small>`;
    feedback.hidden = false;
  } else if (message) {
    const note = message.text === BURN_DONE ? `<small>${BURN_NOTE}</small>` : '';
    feedback.innerHTML = `<p>${message.text}</p>${note}<small>${RITUAL_CANCEL_HINT}</small>`;
    feedback.hidden = false;
  } else {
    feedback.hidden = true;
    feedback.replaceChildren();
  }
}

function updateSanctuary(current) {
  if (!sanctuaryState || !sanctuaryVfx) return;
  const wasBurning = sanctuaryState.active?.id === 'burn';
  advanceRitual(sanctuaryState, 1 / 30);
  if (wasBurning && sanctuaryState.active?.id !== 'burn') {
    sanctuaryBurnAudio?.stop();
    sanctuaryBurnAudio = null;
  }
  sanctuaryVfx.update(sanctuaryState);
  renderSanctuaryHud(current);
}

function interactSanctuary() {
  if (partyClient) {
    setPartyToast('파티 중에는 들어갈 수 없어요');
    return;
  }
  const ritual = sanctuaryState?.nearby;
  if (!ritual || sanctuaryState.active) return;
  const hero = world.entities.find((entity) => entity.kind === 'player' && entity.playerId === character.id);
  const origin = { x: hero?.x ?? 0, z: hero?.z ?? 0 };
  if (!startRitual(sanctuaryState, ritual.id, { origin })) return;
  audio.play('confirm');
  if (ritual.id === 'chiao') {
    const random = (Math.imul((world.seed + sanctuaryState.serial) >>> 0, 0x45d9f3b) ^ 0x9e3779b9) >>> 0;
    const faces = [random & 1 ? 'convex' : 'flat', random & 2 ? 'convex' : 'flat'];
    throwChiao(sanctuaryState, faces, random);
  } else if (ritual.id === 'burn') {
    sanctuaryBurnAudio?.stop();
    sanctuaryBurnAudio = audio.play('fire-crackle', { loop: true, gain: 0.42 });
  }
}

function cancelSanctuary() {
  if (!sanctuaryState?.active) return false;
  cancelRitual(sanctuaryState);
  sanctuaryBurnAudio?.stop();
  sanctuaryBurnAudio = null;
  renderSanctuaryHud(world);
  sanctuaryVfx?.update(sanctuaryState);
  return true;
}

async function enterSanctuary() {
  if (partyClient) {
    setPartyToast('파티 중에는 들어갈 수 없어요');
    return;
  }
  stopWorld();
  sanctuaryState = createRitualState();
  titleScreen.hidden = true;
  gameScreen.hidden = false;
  hubUi.hidden = true;
  hubPanel.hidden = true;
  pauseMenu.hidden = true;
  resultPanel.hidden = true;
  $('#tutorial-card').hidden = true;
  $('#boss-hud').hidden = true;
  $('#party-hud').hidden = true;
  $('#party-rtt').hidden = true;
  $('#party-door-countdown').hidden = true;
  $('#party-downed').hidden = true;
  $('#party-network-overlay').hidden = true;
  $('#controls').hidden = false;
  $('#controls').classList.remove('hub-controls');
  $('#sanctuary-hud').hidden = false;
  $('#sanctuary-interact').hidden = true;
  $('#sanctuary-feedback').hidden = true;
  $('#stage-name').textContent = '법당';
  $('#hud-name').textContent = `${character.name} · 법당`;
  $('#key-hints').textContent = '이동 · E 상호작용 · Esc 나가기';
  gameScreen.classList.add('sanctuary-mode');
  world = createHubWorld({
    seed: 724103,
    playerId: character.id,
    level: character.level,
    equipment: equippedItems(),
  });
  world.arena = SANCTUARY_ARENA;
  const hero = world.entities.find((entity) => entity.kind === 'player' && entity.playerId === character.id);
  if (hero) {
    Object.assign(hero, equipmentLook(equippedItems()));
    hero.x = SANCTUARY_ARENA.playerSpawn.x;
    hero.z = SANCTUARY_ARENA.playerSpawn.z;
    hero.facing = -Math.PI / 2;
  }
  input = new InputLayer({ canvas: $('#scene'), controls: $('#controls') });
  renderer = new ArenaRenderer($('#scene'), () => {}, SANCTUARY_ARENA, DEV_COLLISION_OVERLAY, world);
  const [, music] = await Promise.all([renderer.ready, loadAudioForScene('sanctuary')]);
  applySettings();
  await audio.unlock();
  audio.setMusic(music, { crossfadeMs: 1000 });
  sanctuaryVfx = new SanctuaryVfx(renderer.scene, {
    onTok: () => audio.play('impact', { rate: 0.72, gain: 0.48 }),
    reducedMotion: reducedMotionEnabled(),
  });
  renderSanctuaryHud(world);
  loop = new FixedStepLoop({
    world,
    playerId: character.id,
    input,
    buildInput: (rawInput) => ({ ...ritualMovement(sanctuaryState, rawInput), buttons: 0 }),
    render: (previous, current, alpha) => renderer?.render(previous, current, alpha),
    onTick: updateSanctuary,
  });
  loop.start();
}

function updateBossIntro(stageId) {
  const region = STAGE_LIST.find((stage) => stage.id === stageId)?.region ?? 1;
  $('#boss-intro-region').textContent = region === 3 ? '해골 왕의 성채' : region === 2 ? '잿빛 숲' : '무너진 지하묘지';
  $('#boss-intro-name').textContent = stageId === 'KB'
    ? '해골 왕'
    : region === 2 ? '잿빛 숲의 사령술사' : '해골 기사단장';
}

async function loadAudioForScene(scene) {
  const music = musicForScene(scene);
  await audio.loadScene(music);
  return music;
}

function musicForScene(scene) {
  const stageRegion = STAGE_LIST.find((stage) => stage.id === scene)?.region;
  return scene === 'sanctuary' ? 'sanctuary-bgm'
    : stageRegion === 2 ? 'forest-bgm'
      : stageRegion === 3 ? 'castle-bgm'
        : scene === 'hub' ? 'hub-bgm' : 'combat-bgm';
}

function itemName(item) {
  return ITEMS[item.itemId]?.name ?? item.itemId;
}

const STAT_NAMES = {
  attack: '공격력',
  attackPercent: '공격력',
  defense: '방어력',
  maxHp: '최대 체력',
  critChance: '치명타 확률',
  critDamage: '치명타 피해',
  attackSpeed: '공격 속도',
  moveSpeed: '이동 속도',
  dodgeCooldownReduction: '회피 재사용 대기시간 감소',
  skillCooldownReduction: '기술 재사용 대기시간 감소',
  lifesteal: '흡혈',
  goldGain: '골드 획득',
  xpGain: '경험치 획득',
  spinCooldownSeconds: '회전 기술 재사용 대기시간',
};

const FAMILY_NAMES = { sword: '기사', crossbow: '석궁', staff: '지팡이' };
const FAMILY_SKILL_COPY = {
  sword: ['주변을 베어 적을 공격합니다.', '앞으로 돌진해 찌릅니다.', '피해를 줄이고 적의 공격을 막습니다.', '전방에 지진을 일으켜 적을 기절시킵니다.'],
  crossbow: ['직선상의 적을 관통합니다.', '뒤로 물러나며 사격합니다.', '다섯 방향으로 산탄을 발사합니다.', '지정 지점에 화살비를 퍼붓습니다.'],
  staff: ['지점에 화염 장판을 남깁니다.', '주변에 냉기 파동을 퍼뜨려 둔화시킵니다.', '이동 방향으로 순간이동합니다.', '지정 지점에 운석을 떨어뜨립니다.'],
};

function updateFamilySkillControls(family) {
  const names = FAMILY_SKILLS[family] ?? FAMILY_SKILLS.sword;
  const buttonValues = [4, 8, 16, 128];
  names.forEach((name, index) => {
    const button = $(`#controls [data-button="${buttonValues[index]}"]`);
    if (index === 3) {
      if (button?.querySelector('span')) button.querySelector('span').textContent = SKILLS[name].name;
    } else if (button?.querySelector('span')) button.querySelector('span').textContent = SKILLS[name].name;
    else if (button) button.textContent = SKILLS[name].name;
  });
  $('#key-hints').textContent = `J 공격 · K 회피 · 1 ${SKILLS[names[0]].name} · 2 ${SKILLS[names[1]].name} · 3 ${SKILLS[names[2]].name} · 4 ${SKILLS[names[3]].name} · Q 물약`;
}

function showFamilyChangeToast(family) {
  const skills = (FAMILY_SKILLS[family] ?? FAMILY_SKILLS.sword).map((name) => SKILLS[name].name).join(' · ');
  const message = `${FAMILY_NAMES[family]} 계열로 바뀌었어요 · 스킬: ${skills}`;
  if (world?.mode === 'hub' && !hubPanel.hidden) {
    hubPanel.querySelector('.family-change-toast')?.remove();
    const status = document.createElement('p');
    status.className = 'family-change-toast';
    status.setAttribute('role', 'status');
    status.textContent = message;
    hubPanel.prepend(status);
  } else $('#toast').textContent = message;
}

function formatStat(stat, value, unit = '') {
  return `${STAT_NAMES[stat] ?? AFFIXES[stat]?.name ?? stat} ${value > 0 ? '+' : ''}${value}${unit}`;
}

function itemStat(item) {
  const base = ITEMS[item.itemId];
  if (!base) return '알 수 없는 장비';
  const enhance = item.enhance ?? 0;
  const value = base.value + enhance * Math.max(1, Math.round(base.value * 0.08));
  const family = base.family ? `${FAMILY_NAMES[base.family]} 계열 · ` : '';
  return `${family}${formatStat(base.stat, value)} · 강화 +${enhance} · 요구 Lv.${item.requiredLevel ?? base.requiredLevel} · ${RARITIES[item.rarity]?.name ?? item.rarity}`;
}

function itemDetails(item) {
  const affixes = (item.affixes ?? []).map((affix) => {
    const definition = AFFIXES[affix.id];
    const unit = definition?.unit ?? (affix.id === 'spinCooldownSeconds' ? '초' : '');
    return `<small class="affix-line">${formatStat(affix.id, affix.value, unit)}</small>`;
  }).join('');
  const set = ITEM_SETS[ITEMS[item.itemId]?.setId];
  const setLabel = set ? `<small class="set-item-name">세트 · ${escapeHtml(set.name)}</small>` : '';
  return `<strong class="item-name rarity-${item.rarity}">${itemName(item)}</strong><small>${itemStat(item)}</small>${setLabel}${affixes || '<small>추가 옵션 없음</small>'}`;
}

const COMPARISON_STATS = [
  ['attack', '공격', (value) => Math.round(value)],
  ['defense', '방어', (value) => Math.round(value)],
  ['maxHp', '체력', (value) => Math.round(value)],
  ['critChance', '치명타', (value) => `${value.toFixed(1)}%`],
  ['critDamage', '치명타 피해', (value) => `${Math.round(value * 100)}%`],
  ['attackSpeed', '공격 속도', (value) => `${value}%`],
  ['moveSpeed', '이동 속도', (value) => value.toFixed(1)],
  ['dodgeCooldownReduction', '회피 대기시간 감소', (value) => `${value}%`],
  ['skillCooldownReduction', '기술 대기시간 감소', (value) => `${value}%`],
  ['lifesteal', '흡혈', (value) => `${value}%`],
  ['goldGain', '골드 획득', (value) => `${value}%`],
  ['xpGain', '경험치 획득', (value) => `${value}%`],
  ['spinCooldownSeconds', '회전 기술 대기시간', (value) => `${value.toFixed(1)}초`, -1],
];

function itemDeltas(item) {
  const slot = ITEMS[item.itemId]?.slot ?? 'weapon';
  const currentEquipment = equippedItems();
  const current = calculatePlayerStats(character.level, currentEquipment);
  const replaced = currentEquipment.filter((equipped) => equipped.slot !== slot);
  const next = calculatePlayerStats(character.level, [...replaced, item]);
  return COMPARISON_STATS.flatMap(([key, label, format, direction = 1]) => {
    const delta = next[key] - current[key];
    return Math.abs(delta) < 1e-9 ? [] : [{ key, label, delta, good: delta * direction > 0, value: format(delta) }];
  });
}

function compareDeltas(item) {
  const deltas = itemDeltas(item).map(({ label, delta, good, value }) => (
    `<span class="${good ? 'delta-up' : 'delta-down'}">${label} ${delta > 0 ? '+' : ''}${value}</span>`
  ));
  return `<div class="compare-deltas">${deltas.join('') || '<span>능력치 변화 없음</span>'}</div>`;
}

function itemIsUpgrade(item) {
  if (item.slot || (item.requiredLevel ?? ITEMS[item.itemId]?.requiredLevel ?? 1) > character.level) return false;
  const mainStat = ITEMS[item.itemId]?.stat;
  if (!mainStat) return false;
  const deltas = itemDeltas(item);
  return deltas.some((change) => change.key === mainStat && change.delta > 0)
    && deltas.every((change) => change.key === mainStat || change.good);
}

function upgradeStatText(item) {
  const stat = ITEMS[item.itemId]?.stat;
  const change = itemDeltas(item).find((entry) => entry.key === stat && entry.delta > 0);
  return change ? `${change.label} +${change.value}` : '';
}

function updateInventoryUpgradeBadge() {
  const badge = $('#inventory-upgrade-badge');
  if (!badge) return;
  const hasUpgrade = inventory.some((item) => !item.slot && itemIsUpgrade(item));
  badge.hidden = !hasUpgrade;
  $('#hub-ui [data-panel="inventory"]')?.classList.toggle(
    'tutorial-pulse',
    hasUpgrade && tutorialState?.step === 'equipment',
  );
}

const EQUIPMENT_SLOTS = [
  { key: 'weapon', label: '무기', glyph: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19 17 7m-1-4 5 5-4 4-5-5zM4 20l3-1-2-2z"/></svg>' },
  { key: 'head', label: '머리', glyph: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 16h16l-2-7-6-5-6 5zM4 16v3h16v-3M9 9l3 2 3-2"/></svg>' },
  { key: 'body', label: '몸', glyph: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 4-4 3 2 5 2-1v9h8v-9l2 1 2-5-4-3-4 3zM9 4l3 3 3-3"/></svg>' },
  { key: 'hands', label: '손', glyph: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 21V10a1.5 1.5 0 0 1 3 0v4-8a1.5 1.5 0 0 1 3 0v8-6a1.5 1.5 0 0 1 3 0v7l2-2a1.5 1.5 0 0 1 2 2l-4 6z"/></svg>' },
  { key: 'feet', label: '발', glyph: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3v9l-3 5a2 2 0 0 0 2 3h12a2 2 0 0 0 2-2l-2-3-5-2-2-10zM7 17h12"/></svg>' },
];

function renderBoard() {
  const difficulty = boardDifficulty;
  const boardTabs = `<nav class="board-tabs" aria-label="게시판"><button data-board-tab="quests" class="${boardTab === 'quests' ? 'active' : ''}" aria-pressed="${boardTab === 'quests'}">퀘스트</button><button data-board-tab="contracts" class="${boardTab === 'contracts' ? 'active' : ''}" aria-pressed="${boardTab === 'contracts'}">의뢰</button></nav>`;
  if (boardTab === 'contracts') {
    const dateKey = kstDateKey(Date.now());
    const storedDateKey = character.contracts?.dateKey;
    const isBackdated = Boolean(storedDateKey && dateKey < storedDateKey);
    const contractsDateKey = isBackdated ? storedDateKey : dateKey;
    const contracts = contractsFor(character, contractsDateKey);
    const stored = character.contracts?.dateKey === contractsDateKey ? character.contracts : { progress: {}, claimed: [] };
    const cards = contracts.map((contract) => {
      const progress = Math.min(contract.target, stored.progress?.[contract.id] ?? 0);
      const claimed = stored.claimed?.includes(contract.id);
      const complete = progress >= contract.target;
      const tier = { easy: '쉬움', normal: '보통', hard: '어려움' }[contract.tier];
      const progressPercent = (progress / contract.target) * 100;
      const buttonLabel = claimed ? '완료' : complete ? '보상 받기' : '진행 중';
      return `<article class="contract-card tier-${contract.tier}${claimed ? ' claimed' : ''}${complete ? ' complete' : ''}">
        <div class="contract-card-heading"><strong>${tier}</strong><span>${claimed ? '완료' : `${progress}/${contract.target}`}</span></div>
        <p>${contractDescription(contract)}</p>
        <div class="contract-progress" role="progressbar" aria-label="의뢰 진행도" aria-valuemin="0" aria-valuemax="${contract.target}" aria-valuenow="${progress}">
          <span class="contract-progress-fill" style="width:${progressPercent}%"></span>
        </div>
        <small>보상 · ${contract.rewards.gold}G · 정수 ${contract.rewards.essence}${contract.rewards.soul ? ` · 영혼 ${contract.rewards.soul}` : ''}</small>
        <button data-claim-contract="${contract.id}" ${!isBackdated && complete && !claimed ? '' : 'disabled'}>${buttonLabel}</button>
      </article>`;
    }).join('');
    const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const nextMidnight = Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate() + 1) - 9 * 60 * 60 * 1000;
    const minutes = Math.max(0, Math.ceil((nextMidnight - Date.now()) / 60000));
    const footer = isBackdated
      ? '기기 시간을 확인해 주세요'
      : `내일 새 의뢰 · ${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')} 후`;
    hubPanel.innerHTML = `${boardTabs}<h2>매일의 의뢰</h2><div class="contract-list">${cards}</div><p class="contract-footer">${footer}</p><button data-close>닫기</button>`;
    updateContractClaimBadge();
    return;
  }
  const tier = DIFFICULTIES[difficulty];
  const tierUnlocked = isDifficultyUnlocked(difficulty, character.clearedStages);
  const tierLock = difficulty === 'nightmare'
    ? '해골 왕(보통)을 쓰러뜨리면 열려요'
    : difficulty === 'hell' ? '해골 왕(악몽)을 쓰러뜨리면 열려요' : '';
  const tabs = Object.entries(DIFFICULTIES).map(([id, entry]) => {
    const unlocked = isDifficultyUnlocked(id, character.clearedStages);
    const condition = id === 'nightmare'
      ? '해골 왕(보통)을 쓰러뜨리면 열려요'
      : id === 'hell' ? '해골 왕(악몽)을 쓰러뜨리면 열려요' : '';
    return `<button class="difficulty-tab${id === difficulty ? ' active' : ''}${unlocked ? '' : ' locked'}" data-board-difficulty="${id}" aria-pressed="${id === difficulty}">${unlocked ? '' : '잠김 · '}${entry.label}${unlocked ? '' : `<small>${condition}</small>`}</button>`;
  }).join('');
  const recommendedStage = latestStage(difficulty, character.clearedStages);
  const rows = STAGE_LIST.map((stage) => {
    const unlocked = stageIsUnlocked(stage.id, difficulty);
    const key = stageClearKey(stage.id, difficulty);
    const cleared = character.clearedStages.includes(key);
    const section = stage.id === 'C1' ? '<h3>1지역 · 무너진 지하묘지</h3>'
      : stage.id === 'F1' ? '<h3>2지역 · 잿빛 숲</h3>'
        : stage.id === 'K1' ? '<h3>3지역 · 해골 왕의 성채</h3>' : '';
    const newBadge = difficulty === 'normal' && stage.id === 'F1' && character.clearedStages.includes('CB')
      && !localStorage.getItem('devinarok.f1-entered') ? '<b class="stage-new">NEW</b>' : '';
    const regionGate = stage.region === 2 ? 'CB' : stage.region === 3 ? 'FB' : null;
    const previousStage = STAGE_LIST[STAGE_LIST.findIndex((entry) => entry.id === stage.id) - 1];
    const normalLockText = stage.region === 2 && !character.clearedStages.includes('CB')
      ? '기사 전당 클리어 후 열려요'
      : `${previousStage?.name ?? ''} 클리어 후 열려요`;
    const lockText = !tierUnlocked ? tierLock
      : !unlocked && difficulty === 'normal' ? normalLockText
      : !unlocked && regionGate && !character.clearedStages.includes(stageClearKey(regionGate, difficulty))
        ? `${STAGE_LIST.find((entry) => entry.id === regionGate)?.name ?? ''}(${tier.label})을 쓰러뜨리면 열려요`
        : !unlocked ? `${previousStage?.name ?? ''}(${tier.label})을 쓰러뜨리면 열려요`
          : cleared ? '클리어' : '도전 가능';
    const bestTicks = character.records?.[key];
    const bestLabel = Number.isInteger(bestTicks) ? ` · 최고 ${formatClearTime(bestTicks)}` : '';
    const levelLabel = difficulty === 'normal'
      ? `권장 Lv.${stage.recommendedLevel}`
      : `${tier.label} · Lv.${effectiveStageLevel(stage, difficulty)}`;
    const warningLevel = difficulty === 'normal' ? stage.recommendedLevel : effectiveStageLevel(stage, difficulty);
    const warning = character.level < warningLevel - 1 ? ' is-underlevel' : '';
    const action = cleared ? '재도전' : unlocked ? '출정' : '잠김';
    const pulse = unlocked && ['board', 'blacksmith'].includes(tutorialState?.step) ? ' tutorial-pulse' : '';
    const recommendation = stage.id === recommendedStage ? '<b class="stage-recommendation">추천</b>' : '';
    const recommendedClass = stage.id === recommendedStage ? ' is-recommended' : '';
    const objective = stage.rooms.at(-1)?.objective;
    const objectiveBadge = objective ? `<b class="objective-stage-badge">${OBJECTIVE_LABELS[objective.type]}</b>` : '';
    return `${section}<div class="hub-row stage-card difficulty-${difficulty}${warning}${recommendedClass}" data-stage-id="${stage.id}"><span class="hub-stage-info"><span class="hub-stage-name">${stage.name}${newBadge}${recommendation}${objectiveBadge}</span><small>${levelLabel} · ${lockText}${bestLabel}</small></span><button class="hub-sortie${pulse}" data-sortie="${stage.id}" ${unlocked ? '' : 'disabled'}>${action}</button></div>`;
  }).join('');
  const tierNotice = tierUnlocked ? '' : `<p class="difficulty-lock-notice">잠김 · ${tierLock}</p>`;
  hubPanel.innerHTML = `${boardTabs}<h2>주인 · 출정 게시판</h2><p>골드 ${character.gold} · 해금된 기록에 따라 다음 지역이 열립니다.</p><nav class="difficulty-tabs" aria-label="난이도">${tabs}</nav>${tierNotice}${rows}<button data-party-finder class="party-entry"><span><strong>같이 출정</strong><small>동료와 함께 출정합니다.</small></span><b>파티 찾기 →</b></button><button data-close>닫기</button>`;
  hubPanel.querySelector(`[data-stage-id="${recommendedStage}"]`)?.scrollIntoView({
    block: 'center',
    behavior: settings.reducedMotion ? 'instant' : 'smooth',
  });
  updateContractClaimBadge();
}

function updateContractClaimBadge() {
  if (!character) return;
  const dateKey = kstDateKey(Date.now());
  const badges = document.querySelectorAll('[data-contract-claim-badge], #contract-claim-badge');
  const storedDateKey = character.contracts?.dateKey;
  if (storedDateKey && dateKey < storedDateKey) {
    badges.forEach((badge) => {
      badge.hidden = true;
    });
    return;
  }
  const contracts = contractsFor(character, dateKey);
  const stored = character.contracts?.dateKey === dateKey ? character.contracts : { progress: {}, claimed: [] };
  const claimable = contracts.some((contract) => (
    !stored.claimed?.includes(contract.id)
    && (stored.progress?.[contract.id] ?? 0) >= contract.target
  ));
  badges.forEach((badge) => {
    badge.hidden = !claimable;
  });
}

function formatClearTime(ticks) {
  const seconds = Math.floor(ticks / 30);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function stopPartyFinderPolling() {
  if (partyFinderTimer !== null) clearInterval(partyFinderTimer);
  partyFinderTimer = null;
}

function renderPartyFinder() {
  const rooms = sortPartyRooms(partyFinderRooms);
  const busy = partyQuickJoining ? 'disabled' : '';
  const list = partyFinderState === 'loading'
    ? '<div class="party-room-skeleton"></div><div class="party-room-skeleton"></div>'
    : partyFinderState === 'error'
      ? `<div class="party-finder-state"><p>목록을 불러오지 못했어요.</p><button data-party-refresh ${busy}>다시 시도</button></div>`
      : rooms.length
        ? partyRoomsMarkup(rooms, character.level, { disabled: partyQuickJoining })
        : `<div class="party-finder-state"><p>지금 열린 방이 없어요.</p><button data-party-create ${busy}>방 만들고 기다리기</button></div>`;
  const quickLabel = partyQuickJoining ? '<span class="party-spinner"></span> 열린 방을 찾는 중…' : '빠른 참가';
  const updated = partyFinderLastRefresh
    ? `${Math.max(0, Math.floor((Date.now() - partyFinderLastRefresh) / 1000))}초 전 갱신`
    : '갱신 전';
  hubPanel.dataset.kind = 'party-finder';
  const roomRegion = `<div class="party-room-heading"><strong>열린 방 · ${rooms.length}</strong><span>${updated}</span><button data-party-refresh ${busy} aria-label="방 목록 새로고침">↻</button></div>
    <div class="party-room-list">${list}</div>`;
  let finder = hubPanel.querySelector('.party-finder');
  if (!finder) {
    hubPanel.innerHTML = `<section class="party-finder">
      <h2>같이 출정</h2>
      <button data-party-quick class="primary party-quick-button" ${partyQuickJoining ? 'disabled' : ''}>${quickLabel}</button>
      <p class="party-feedback" data-party-feedback role="status" aria-live="polite" hidden></p>
      <div class="party-lookup-actions" data-party-lookup-actions hidden>
        <button data-party-lookup-retry>다시 시도</button>
        <button data-party-lookup-create>새 방 만들기</button>
      </div>
      <div class="party-room-region">${roomRegion}</div>
      <div class="party-finder-actions"><button data-party-create ${busy}>방 만들기</button>
        <details><summary>코드로 참가</summary><form id="party-join-form"><input id="party-code" maxlength="6" pattern="[A-HJ-NP-Z2-9]{6}" placeholder="초대 코드" ${busy}><button type="submit" ${busy}>참가</button></form></details>
      </div><button data-close>닫기</button>
    </section>`;
    finder = hubPanel.querySelector('.party-finder');
  } else {
    finder.querySelector('.party-room-region').innerHTML = roomRegion;
  }
  const quickButton = finder.querySelector('[data-party-quick]');
  quickButton.disabled = partyQuickJoining;
  quickButton.innerHTML = quickLabel;
  for (const button of finder.querySelectorAll('[data-party-create], [data-party-refresh], [data-party-lookup-retry], [data-party-lookup-create]')) {
    button.disabled = partyQuickJoining;
  }
  const codeInput = finder.querySelector('#party-code');
  const codeSubmit = finder.querySelector('#party-join-form button[type="submit"]');
  if (codeInput) codeInput.disabled = partyQuickJoining;
  if (codeSubmit) codeSubmit.disabled = partyQuickJoining;
  const lookupActions = finder.querySelector('[data-party-lookup-actions]');
  lookupActions.hidden = !partyQuickLookupFailed || partyFinderState === 'error';
  syncPartyFeedback();
}

async function refreshPartyRooms({ loading = false } = {}) {
  if (hubPanel.hidden || hubPanel.dataset.kind !== 'party-finder') return;
  if (loading) partyFinderState = 'loading';
  renderPartyFinder();
  try {
    const response = await fetch(`${partyHttpBase()}/coord/rooms?g=devinarok`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`rooms-http-${response.status}`);
    const data = await response.json();
    partyFinderRooms = sortPartyRooms(data.rooms ?? []);
    partyFinderState = 'list';
    partyFinderLastRefresh = Date.now();
  } catch {
    partyFinderState = 'error';
  }
  renderPartyFinder();
}

function openPartyFinder() {
  stopPartyFinderPolling();
  partyQuickAbortController?.abort();
  partyQuickAbortController = null;
  $('#hub-party-button').hidden = true;
  hubPanel.hidden = false;
  partyFinderRooms = [];
  partyFinderState = 'loading';
  partyFinderLastRefresh = 0;
  partyQuickJoining = false;
  partyQuickLookupFailed = false;
  setPartyToast('');
  renderPartyFinder();
  void refreshPartyRooms({ loading: true });
  partyFinderTimer = setInterval(() => {
    if (hubPanel.hidden || hubPanel.dataset.kind !== 'party-finder') {
      stopPartyFinderPolling();
      return;
    }
    void refreshPartyRooms();
  }, 5000);
}

function syncPartyFeedback() {
  const lobby = hubPanel.querySelector('.party-lobby');
  if (lobby && !lobby.querySelector('.sanctuary-party-message')) {
    const notice = document.createElement('p');
    notice.className = 'sanctuary-party-message';
    notice.textContent = '파티 중에는 들어갈 수 없어요';
    lobby.append(notice);
  }
  const status = hubPanel.querySelector('[data-party-feedback]');
  if (!status) return;
  status.textContent = partyFeedbackMessage;
  status.hidden = !partyFeedbackMessage;
  status.classList.toggle('is-error', partyFeedbackIsError);
}

function setPartyToast(message, { error = false } = {}) {
  partyFeedbackMessage = String(message ?? '');
  partyFeedbackIsError = Boolean(error);
  $('#toast').textContent = partyFeedbackMessage;
  syncPartyFeedback();
}

function partyJoinErrorMessage(error) {
  if (['room-full', 'room-started', 'room-gone'].includes(error?.code ?? error?.message)) {
    const code = error.code ?? error.message;
    if (code === 'room-full') return '방이 가득 찼어요';
    return '이미 출정한 방이에요';
  }
  return '방에 연결하지 못했어요. 다시 시도해 주세요.';
}

async function quickJoinFromFinder() {
  if (partyQuickJoining) return;
  stopPartyFinderPolling();
  partyQuickLookupFailed = false;
  setPartyToast('');
  partyQuickJoining = true;
  const abortController = new AbortController();
  partyQuickAbortController = abortController;
  renderPartyFinder();
  try {
    const result = await quickJoinParty({
      httpBase: partyHttpBase(),
      signal: abortController.signal,
      joinRoom: (code) => connectParty(code),
      createRoom: async () => {
        await connectParty();
        return partyClient?.roomCode;
      },
    });
    if (abortController.signal.aborted) return;
    setPartyToast(result.created
      ? '열린 방이 없어 새 방을 만들었어요. 동료를 기다리는 중이에요'
      : '열린 방에 참가했어요');
  } catch (error) {
    if (abortController.signal.aborted) return;
    partyQuickLookupFailed = error?.code === 'match-lookup-failed';
    if (partyQuickLookupFailed) setPartyToast('방 목록을 불러오지 못했어요', { error: true });
    else setPartyToast(partyJoinErrorMessage(error), { error: true });
    renderPartyFinder();
    if (partyFinderTimer === null) partyFinderTimer = setInterval(() => void refreshPartyRooms(), 5000);
  } finally {
    if (partyQuickAbortController === abortController) {
      partyQuickAbortController = null;
      partyQuickJoining = false;
      if (hubPanel.dataset.kind === 'party-finder') renderPartyFinder();
    }
  }
}

function inviteLink(code) {
  const url = new URL(location.href);
  url.searchParams.set('room', code);
  return url.toString();
}

function renderPartyLobby() {
  if (!partyClient?.roomCode || !partyClient.lobby || hubPanel.hidden) return;
  $('#hub-party-button').hidden = true;
  $('#hub-ui [data-panel="sanctuary"]').disabled = true;
  $('#sanctuary-party-disabled').hidden = false;
  stopPartyFinderPolling();
  const party = partyClient.lobby?.players ?? [];
  const local = party.find((member) => member.playerId === partyClient.playerId);
  const isHost = partyClient.lobby?.hostId === partyClient.playerId;
  const guests = party.filter((member) => member.playerId !== partyClient.lobby.hostId);
  const readyGuests = guests.filter((member) => member.connected && member.ready).length;
  const allReady = party.length > 0 && party.every((member) => member.connected) && readyGuests === guests.length;
  const stage = partyClient.lobby?.stageId ?? 'C1';
  const difficulty = partyClient.lobby?.difficulty ?? 'normal';
  const difficultyOptions = Object.entries(DIFFICULTIES)
    .filter(([id]) => isHost ? isDifficultyUnlocked(id, character.clearedStages) : id === difficulty)
    .map(([id, entry]) => `<option value="${id}" ${id === difficulty ? 'selected' : ''}>${entry.label}</option>`).join('');
  const stageOptions = STAGE_LIST.filter((entry) => isHost ? stageIsUnlocked(entry.id, difficulty) : entry.id === stage)
    .map((entry) => `<option value="${entry.id}" ${entry.id === stage ? 'selected' : ''}>${entry.name}</option>`).join('');
  const members = party.map((member) => {
    const name = escapeHtml(String(member.name ?? member.playerId ?? '이름 없는 기사').slice(0, 32));
    const level = Math.max(1, Math.min(99, Number(member.level) || 1));
    const family = ['sword', 'crossbow', 'staff'].includes(member.family) ? member.family : 'sword';
    const state = member.playerId === partyClient.lobby.hostId
      ? '방장'
      : member.connected ? member.ready ? '준비 완료' : '대기 중' : '연결 끊김';
    return `<div class="party-lobby-member"><span>${FAMILY_NAMES[family]} · ${name} · Lv.${level}</span><span>${state}</span></div>`;
  }).join('');
  const status = partyClient.status === 'reconnecting' ? '재연결 중…' : partyClient.status === 'connecting' ? '연결 중…' : '방에 입장했습니다.';
  hubPanel.dataset.kind = 'party';
  const isPublic = partyClient.lobby?.public !== false;
  const startLabel = allReady ? '출정' : `동료 준비를 기다리는 중 (${readyGuests}/${guests.length})`;
  hubPanel.innerHTML = `<section class="party-lobby"><h2>파티 대기실</h2><div class="party-invite"><strong>${escapeHtml(partyClient.roomCode)}</strong><button data-party-share>초대 공유</button></div><p class="party-feedback" data-party-feedback role="status" aria-live="polite" hidden></p><p>${status}</p><div class="party-lobby-members">${members || '<p>파티 정보를 기다리는 중…</p>'}</div><label>난이도<select id="party-difficulty-select" ${isHost ? '' : 'disabled'}>${difficultyOptions}</select></label><label>출정 지역<select id="party-stage-select" ${isHost ? '' : 'disabled'}>${stageOptions}</select></label><a class="invite-link" href="${escapeHtml(inviteLink(partyClient.roomCode))}">${escapeHtml(inviteLink(partyClient.roomCode))}</a>${isHost ? `<label class="party-public-toggle"><input type="checkbox" data-party-public ${isPublic ? 'checked' : ''}> 공개 방</label><small>끄면 목록에 보이지 않고 코드로만 들어올 수 있어요</small>` : ''}${isHost ? '' : `<button data-party-ready class="party-ready-button">${local?.ready ? '준비 취소' : '준비'}</button>`}${isHost ? `<button data-party-start class="primary" ${allReady ? '' : 'disabled'}>${startLabel}</button>` : ''}<button data-party-close>나가기</button></section>`;
  syncPartyFeedback();
}

function connectParty(code = null) {
  partyLobbySelection = { hostId: null, difficulty: null, wasHost: false };
  partyClient?.close();
  $('#hub-party-button').hidden = true;
  $('#hub-ui [data-panel="sanctuary"]').disabled = true;
  $('#sanctuary-party-disabled').hidden = false;
  if (hubPanel.hidden) {
    hubPanel.hidden = false;
    hubPanel.dataset.kind = 'party';
    hubPanel.innerHTML = '<section class="party-lobby"><h2>파티에 연결 중…</h2><p>대기실 정보를 확인하고 있어요.</p><button data-party-close>나가기</button></section>';
  }
  let resolveLobby;
  let rejectLobby;
  let lobbyReceived = false;
  const joined = new Promise((resolve, reject) => {
    resolveLobby = resolve;
    rejectLobby = reject;
  });
  const timeout = setTimeout(() => {
    if (lobbyReceived) return;
    partyClient?.close();
    const error = new Error('connect-failed');
    error.code = 'connect-failed';
    rejectLobby(error);
  }, 8000);
  partyClient = new PartyClient({
    character,
    equipment: equippedItems(),
    onLobby: (lobby) => {
      lobbyReceived = true;
      clearTimeout(timeout);
      const isHost = lobby.hostId === partyClient?.playerId;
      const hostChanged = lobby.hostId !== partyLobbySelection.hostId;
      const difficultyChanged = lobby.difficulty !== partyLobbySelection.difficulty;
      const becameHost = isHost && !partyLobbySelection.wasHost;
      partyLobbySelection = { hostId: lobby.hostId, difficulty: lobby.difficulty, wasHost: isHost };
      if (isHost && (hostChanged || difficultyChanged || becameHost)) {
        const stageId = latestStage(lobby.difficulty, character.clearedStages);
        if (stageId !== lobby.stageId) partyClient.selectStage(stageId, lobby.difficulty);
      }
      renderPartyLobby();
      resolveLobby(partyClient);
    },
    onStatus: (status) => {
      renderPartyLobby();
      if (status === 'disconnected' && !lobbyReceived) {
        clearTimeout(timeout);
        const error = new Error('connect-failed');
        error.code = 'connect-failed';
        rejectLobby(error);
      }
    },
    onStart: (message) => { void startPartyStage(message); },
    onSnapshot: (message, client) => {
      updatePartyHud(client, message);
      trackTutorialMovement(client.viewWorld());
    },
    onEvents: (events) => {
      for (const event of events) {
        if (event.type === 'reviveProgress') reviveText.set(event.entityId, event);
        if (event.type === 'revived' || event.type === 'roomEnter') reviveText.clear();
        handleAudioEvent(event, partyClient?.viewWorld());
        if (event.type === 'pickup') {
          if (event.lootType === 'item' && event.item && itemIsUpgrade(event.item)) {
            setPartyToast(`더 좋은 장비 · ${upgradeStatText(event.item)}`);
          }
        }
      }
    },
    onResult: ({ result, roomCode, runId, playerId }) => {
      void settleStage(result.outcome, result, `${roomCode}:${runId}:${playerId}`);
    },
    onRoomGone: () => {
      clearTimeout(timeout);
      const error = new Error('room-gone');
      error.code = 'room-gone';
      rejectLobby(error);
      if (hubPanel.dataset.kind === 'party-finder') {
        setPartyToast(partyJoinErrorMessage(error), { error: true });
        void refreshPartyRooms({ loading: true });
        return;
      }
      $('#party-network-overlay').hidden = true;
      setPartyToast('방이 종료되어 여관으로 돌아갑니다.', { error: true });
      void enterHub();
    },
    onError: (error) => {
      console.error('Party connection failed', error);
      if (!lobbyReceived) {
        clearTimeout(timeout);
        partyClient?.close();
        rejectLobby(error);
      } else setPartyToast(partyJoinErrorMessage(error), { error: true });
    },
  });
  partyClient.inputScheduler = partyInputScheduler;
  if (code) partyClient.joinRoom(code);
  else partyClient.createRoom();
  renderPartyLobby();
  return joined;
}

async function startPartyStage(message) {
  if (!partyClient) return;
  stopPartyFinderPolling();
  stopWorld();
  $('#hub-party-button').hidden = true;
  currentStageId = message.stageId;
  currentStageDifficulty = message.difficulty ?? 'normal';
  const selectedStage = STAGE_LIST.find((entry) => entry.id === message.stageId);
  localStorage.setItem('devinarok.lastStageRegion', String(selectedStage?.region ?? 1));
  if (message.stageId === 'F1') localStorage.setItem('devinarok.f1-entered', '1');
  settlementState.settled = false;
  settlementId = `${partyClient.roomCode}:${message.runId}:${partyClient.playerId}`;
  hubUi.hidden = true;
  hubPanel.hidden = true;
  pauseMenu.hidden = true;
  resultPanel.hidden = true;
  $('#controls').hidden = false;
  $('#controls').classList.remove('hub-controls');
  $('#party-hud').hidden = false;
  $('#party-rtt').hidden = false;
  $('#boss-hud').hidden = !['CB', 'FB', 'KB'].includes(message.stageId);
  $('#boss-name').textContent = message.stageId === 'KB'
    ? '해골 왕'
    : message.stageId === 'FB' ? '잿빛 숲의 사령술사' : '해골 기사단장';
  updateBossIntro(message.stageId);
  updateFamilySkillControls(equipmentLook(equippedItems()).family);
  $('#stage-name').textContent = STAGE_LIST.find((entry) => entry.id === message.stageId)?.name ?? message.stageId;
  world = partyClient.viewWorld() ?? partyClient.stageWorld;
  tutorialLastX = null;
  tutorialLastZ = null;
  input = new InputLayer({ canvas: $('#scene'), controls: $('#controls') });
  renderer = new ArenaRenderer($('#scene'), () => {}, world.arena, DEV_COLLISION_OVERLAY, world);
  renderer.localPlayerId = partyClient.playerId;
  partyRendererReady = false;
  partyPreviousWorld = world;
  partyLastRenderTime = 0;
  partyInputScheduler.reset();
  partyFrame = requestAnimationFrame(partyLoop);
  const [, music] = await Promise.all([renderer.ready, loadAudioForScene(world.stageId)]);
  applySettings();
  partyRendererReady = true;
  await audio.unlock();
  audio.setMusic(music, { crossfadeMs: 1000 });
}

function updatePartyHud(client = partyClient, snapshot = client?.lastSnapshot) {
  if (partyHudCaptureFrozen || !client || !client.stageWorld || !snapshot) return;
  const partyPlayers = (snapshot.ents ?? []).filter((entity) => entity.kind === 'player');
  const partyHud = $('#party-hud');
  partyHud.innerHTML = partyPlayers.map((member) => {
    const name = escapeHtml(String(member.name ?? member.playerId ?? '이름 없는 기사').slice(0, 32));
    const level = Math.max(1, Math.min(99, Number(member.level) || 1));
    const hp = Math.max(0, Number(member.hp) || 0);
    const maxHp = Math.max(1, Number(member.maxHp) || 1);
    const label = `${name} · Lv.${level}`;
    return `<div class="party-member"><div class="party-member-row"><span>${label}</span><span>${hp}/${maxHp}</span></div><div class="hp-track"><i style="width:${Math.min(100, hp / maxHp * 100)}%"></i></div></div>`;
  }).join('');
  const gameTop = gameScreen.getBoundingClientRect().top;
  $('#toast').style.setProperty(
    '--party-toast-top',
    `${Math.ceil(partyHud.getBoundingClientRect().bottom - gameTop + 8)}px`,
  );
  const rtt = Math.round(client.session?.clock.rttMs ?? 0);
  const badge = $('#party-rtt');
  badge.textContent = `${rtt} ms`;
  badge.title = `서버 ${client.serverColo ?? '—'} · 접속 ${client.edgeColo ?? '—'}`;
  badge.dataset.state = rtt < 100 ? 'green' : rtt < 200 ? 'yellow' : 'red';
  const own = partyPlayers.find((entry) => entry.playerId === client.playerId);
  $('#party-downed').hidden = !own?.downed;
  $('#party-downed').textContent = own?.downed
    ? `쓰러짐 · 부활 진행 ${own.reviveProgress ?? reviveText.get(own.id)?.progress ?? 0}/60`
    : '';
  const countdown = snapshot.doorCountdown;
  $('#party-door-countdown').hidden = !countdown;
  if (countdown) $('#party-door-countdown').textContent = `다음 방으로 이동 ${Math.max(0, Math.ceil((countdown.endsTick - snapshot.tick) / 30))}초`;
}

function renderPartyFrame(time = performance.now()) {
  if (!partyClient || !renderer) return false;
  const nextWorld = partyClient.viewWorld(time) ?? world;
  if (!nextWorld) return false;
  renderer.render(partyPreviousWorld ?? nextWorld, nextWorld, 1);
  debugController?.frame(nextWorld, renderer, time);
  partyPreviousWorld = nextWorld;
  world = nextWorld;
  return true;
}

function setPartyHudCaptureFreeze(frozen) {
  if (!DEV_MODE) return false;
  partyHudCaptureFrozen = Boolean(frozen);
  if (!partyHudCaptureFrozen) updatePartyHud();
  return true;
}

function partyLoop(time) {
  if (!character || !partyClient || !renderer || !input) return;
  if (!input.devInputProvider) driveClockedPartyInputs(time, false);
  const predictedEvents = partyClient.consumePredictedEvents();
  let nextWorld = null;
  if (predictedEvents.length) {
    nextWorld = partyClient.viewWorld(time) ?? world;
    if (nextWorld) renderer.consumePredictedEvents(predictedEvents, nextWorld, time);
    for (const event of predictedEvents) {
      if (event.type === 'cast') playCastSound(event);
      else if (event.type === 'predictedHit') audio.play('impact');
    }
  }
  if (partyRendererReady && (
    !DEV_MODE ||
    partyInputTimer === null ||
    !partyLastRenderTime ||
    time - partyLastRenderTime >= 200
  )) {
    nextWorld ??= partyClient.viewWorld(time) ?? world;
    if (nextWorld) {
      if (!DEV_MODE || partyInputTimer === null) {
        renderer.render(partyPreviousWorld ?? nextWorld, nextWorld, 1);
      }
      debugController?.frame(nextWorld, renderer, time);
      partyPreviousWorld = nextWorld;
      world = nextWorld;
      updateHud(nextWorld);
      updatePartyHud();
    }
    partyLastRenderTime = time;
  }
  const overlay = $('#party-network-overlay');
  $('#tutorial-card').hidden = Boolean(partyClient?.runId && !partyClient.result);
  if (partyClient.versionMismatch) {
    overlay.textContent = '새 버전이 있어요. 새로고침해 주세요';
    overlay.hidden = false;
  } else if (partyClient.status === 'reconnecting') {
    overlay.textContent = '재연결 중…';
    overlay.hidden = false;
  } else overlay.hidden = true;
  partyFrame = requestAnimationFrame(partyLoop);
}

function sendPartyInputTick() {
  if (!partyClient || !partyClient.inputReady || !input || partyClient.result) return false;
  const next = input.nextTick();
  if (!pauseMenu.hidden) {
    attackInputAssistant.reset();
    return Boolean(partyClient.sendInput({ ...next, moveX: 0, moveZ: 0, buttons: 0, attackHeld: false }));
  }
  const player = partyClient.predictor?.getPlayer();
  const inputView = partyClient.getInputViewSample();
  if (!inputView) return false;
  const prepared = player
    ? buildPartyAssistedInput(
      attackInputAssistant,
      next,
      partyClient,
      player,
      { autoAttack: autoAttackEnabled(), inputView },
    )
    : next;
  return Boolean(partyClient.sendInput(prepared, inputView));
}

function driveClockedPartyInputs(now, collectStats = false) {
  if (collectStats) partyInputDriverStats.timerTicks += 1;
  if (!partyClient?.inputReady || !input || partyClient.result) {
    if (collectStats) partyInputDriverStats.notReady += 1;
    return 0;
  }
  const pending = partyClient.session?.inputs.size ?? 0;
  if (pending >= 90) {
    if (collectStats) partyInputDriverStats.backpressure += 1;
    return 0;
  }
  const steps = partyInputScheduler.steps(partyClient.session?.clock, now);
  let sent = 0;
  for (; sent < steps; sent += 1) {
    if (!sendPartyInputTick()) break;
  }
  if (collectStats) {
    partyInputDriverStats.inputs += sent;
    partyInputDriverStats.catchUpInputs += Math.max(0, sent - 1);
  }
  return sent;
}

function setPartyInputProvider(provider) {
  if (!DEV_MODE || !(input instanceof InputLayer)) return false;
  input.setDevInputProvider(provider);
  return true;
}

function tickPartyInput() {
  if (
    !DEV_MODE ||
    !(input instanceof InputLayer) ||
    !input.devInputProvider ||
    !partyClient?.inputReady ||
    partyClient.result
  ) {
    return false;
  }
  sendPartyInputTick();
  return true;
}

function drivePartyInputTimer() {
  const now = performance.now();
  driveClockedPartyInputs(now, true);
}

function setPartyInputAutoDrive(enabled) {
  if (!DEV_MODE || !(input instanceof InputLayer) || !input.devInputProvider) return false;
  if (partyInputTimer !== null) clearInterval(partyInputTimer);
  partyInputTimer = null;
  partyInputScheduler.reset();
  if (enabled) {
    partyInputDriverStats = {
      timerTicks: 0,
      inputs: 0,
      catchUpInputs: 0,
      notReady: 0,
      backpressure: 0,
    };
    partyInputTimer = setInterval(drivePartyInputTimer, 100);
  }
  return true;
}

function getNetBotInput() {
  const client = partyClient;
  if (!client?.stageWorld || !client?.lastSnapshot || !client?.predictor || !client?.session) {
    return { moveX: 0, moveZ: 0, aim: 0, buttons: 0, viewTick: 0 };
  }
  const player = client.predictor.getPlayer();
  if (!player) return { moveX: 0, moveZ: 0, aim: 0, buttons: 0, viewTick: 0 };
  const view = client.interpolation.sample(client.session.clock.getEstimate(performance.now()));
  const viewTick = Math.round(view.renderTick);
  const viewed = client.interpolation.sampleAtRenderTick(viewTick);
  const roomIndex = client.lastSnapshot.roomIndex ?? client.stageWorld.roomIndex;
  const room = client.stageWorld.arena.rooms[roomIndex];
  const door = client.stageWorld.arena.doors.find((entry) => entry.fromRoom === room?.id);
  const policy = computeBotPolicy({
    player,
    viewed,
    roomCleared: Boolean(client.lastSnapshot.roomCleared),
    door,
  });
  return {
    ...buildRangedAimInput({ ...policy, viewTick }, player, viewed),
    viewTick,
  };
}

function renderInventory(compareUid = '', filter = inventoryFilter) {
  inventoryFilter = filter;
  const slotOrder = new Map(EQUIPMENT_SLOTS.map((slot, index) => [slot.key, index]));
  const rarityOrder = { common: 0, magic: 1, rare: 2, legendary: 3, set: 4 };
  const currentEquipment = equippedItems();
  const family = equipmentLook(currentEquipment).family;
  const inventoryTabs = `<nav class="inventory-tabs" aria-label="장비함">${[
    ['equipment', '장비'],
    ['skills', '스킬'],
  ].map(([id, label]) => `<button data-inventory-tab="${id}" class="${inventoryTab === id ? 'active' : ''}" aria-pressed="${inventoryTab === id}">${label}</button>`).join('')}</nav>`;
  if (inventoryTab === 'skills') {
    const skills = (FAMILY_SKILLS[family] ?? FAMILY_SKILLS.sword).map((skillKey, index) => {
      const xp = character.mastery?.[skillKey] ?? 0;
      const rank = masteryRank(xp);
      const next = nextThreshold(xp);
      const current = MASTERY_THRESHOLDS[rank];
      const progress = next === null ? 100 : Math.max(0, Math.min(100, (xp - current) / (next - current) * 100));
      const bonus = masteryBonus(rank);
      const locked = index === 3 && character.level < 7;
      return `<article class="mastery-row${locked ? ' locked' : ''}"><header><strong>${SKILLS[skillKey].name}${locked ? ' · Lv7 잠금' : ''}</strong><span class="mastery-stars" aria-label="숙련도 ${rank}단계">${'★'.repeat(rank)}${'☆'.repeat(5 - rank)}</span></header><div class="mastery-xp"><span>${next === null ? '최대' : `${xp} / ${next}`}</span><div class="mastery-xp-track"><i style="width:${progress}%"></i></div></div><small>피해 +${bonus.damagePct}% · 재사용 −${bonus.cooldownPct}%</small></article>`;
    }).join('');
    hubPanel.innerHTML = `<h2>장비함 · ${inventory.length}/40</h2>${inventoryTabs}<div class="mastery-list">${skills}</div><p class="mastery-footer">적 근처에서 스킬을 쓰면 숙련도가 올라요 · ★5 각성 시 이펙트가 바뀌어요</p><button data-close>닫기</button>`;
    updateInventoryUpgradeBadge();
    return;
  }
  const setCounts = {};
  for (const item of currentEquipment) {
    const setId = ITEMS[item.itemId]?.setId;
    if (ITEM_SETS[setId]) setCounts[setId] = (setCounts[setId] ?? 0) + 1;
  }
  const ownedSetIds = new Set(inventory.map((item) => ITEMS[item.itemId]?.setId).filter((id) => ITEM_SETS[id]));
  const setBonuses = Object.entries(ITEM_SETS).filter(([setId]) => ownedSetIds.has(setId) || setCounts[setId])
    .map(([setId, set]) => {
      const count = setCounts[setId] ?? 0;
      const active = set.family === family;
      const bonuses = set.bonuses.map((bonus) => (
        `<small class="${active && count >= bonus.pieces ? 'set-bonus-active' : ''}">${bonus.pieces}세트 · ${escapeHtml(bonus.description)}</small>`
      )).join('');
      return `<article class="set-bonus-card"><strong class="rarity-set">${escapeHtml(set.name)} · ${count}/5 착용</strong>${bonuses}</article>`;
    }).join('');
  const setBonusSection = setBonuses ? `<section class="set-bonus-list" aria-label="세트 효과">${setBonuses}</section>` : '';
  const filteredItems = inventory
    .filter((item) => filter === 'all' || (ITEMS[item.itemId]?.slot ?? 'weapon') === filter)
    .sort((a, b) => {
      const aGroup = a.slot ? 0 : itemIsUpgrade(a) ? 1 : 2;
      const bGroup = b.slot ? 0 : itemIsUpgrade(b) ? 1 : 2;
      return aGroup - bGroup
        || (slotOrder.get(ITEMS[a.itemId]?.slot ?? 'weapon') ?? 99) - (slotOrder.get(ITEMS[b.itemId]?.slot ?? 'weapon') ?? 99)
        || (rarityOrder[b.rarity] ?? 0) - (rarityOrder[a.rarity] ?? 0);
    });
  const rows = filteredItems.map((item) => {
    const base = ITEMS[item.itemId];
    const slot = base?.slot ?? 'weapon';
    const equipped = Boolean(item.slot);
    const compare = compareUid === item.uid ? compareDeltas(item) : '';
    const upgrade = !equipped && itemIsUpgrade(item);
    const deltas = equipped ? '' : `<div class="inventory-delta-chips">${itemDeltas(item).map(({ label, delta, good, value }) => `<span class="${good ? 'delta-up' : 'delta-down'}">${label} ${delta > 0 ? '+' : ''}${value}</span>`).join('') || '<span>변화 없음</span>'}</div>`;
    return `<div class="item-row ${compare ? 'selected' : ''}"><div class="item-details">${itemDetails(item)}${equipped ? '<span class="equipped-badge">착용 중</span>' : ''}${upgrade ? '<span class="upgrade-badge">▲ 더 좋음</span>' : ''}</div><div class="item-actions"><button data-compare="${item.uid}">비교</button>${equipped ? `<button data-unequip="${slot}">해제</button>` : `<button data-equip="${item.uid}" data-slot="${slot}" ${(item.requiredLevel ?? base?.requiredLevel) > character.level ? 'disabled' : ''}>착용</button>`}<button data-sell="${item.uid}" ${equipped ? 'disabled' : ''}>판매</button></div>${deltas}${compare}</div>`;
  }).join('');
  const slotCards = EQUIPMENT_SLOTS.map((slot) => {
    const equipped = inventory.find((item) => item.slot === slot.key);
    let cardText = '<strong>비어 있음</strong>';
    if (equipped) {
      const base = ITEMS[equipped.itemId];
      const statParts = itemStat(equipped).split(' · ');
      const stat = statParts[base?.family ? 1 : 0];
      const family = base?.family;
      const familyTag = family
        ? `<span class="equipment-family-tag">${escapeHtml(FAMILY_NAMES[family])}</span>`
        : '';
      cardText = `<strong class="rarity-${equipped.rarity}">${escapeHtml(itemName(equipped))}</strong>${familyTag}<small>+${equipped.enhance ?? 0} · ${escapeHtml(stat)}</small>`;
    }
    return `<article class="equipment-slot-card ${equipped ? `rarity-border-${equipped.rarity}` : ''}" data-slot-filter="${slot.key}" tabindex="0" role="button"><div class="slot-glyph">${slot.glyph}<small>${slot.label}</small></div><div class="equipment-slot-info">${cardText}</div><button data-unequip="${slot.key}" ${equipped ? '' : 'hidden'}>해제</button></article>`;
  }).join('');
  const filters = [{ key: 'all', label: '전체' }, ...EQUIPMENT_SLOTS].map((slot) => (
    `<button data-slot-filter="${slot.key}" class="${filter === slot.key ? 'active' : ''}">${slot.label}</button>`
  )).join('');
  hubPanel.innerHTML = `<h2>장비함 · ${inventory.length}/40</h2>${inventoryTabs}<p class="material-counts">재료 · 정수 ${character.materials?.essence ?? 0} · 영혼 ${character.materials?.soul ?? 0}</p>${setBonusSection}<section class="equipped-strip"><strong>착용 중</strong><div class="equipment-slot-grid">${slotCards}</div></section><nav class="inventory-filters" aria-label="장비 슬롯">${filters}</nav><div class="inventory-list">${rows || `<p>${filter === 'all' ? '보관 중인 장비가 없습니다.' : '이 슬롯에 장비가 없습니다.'}</p>`}</div><button data-close>닫기</button>`;
  updateInventoryUpgradeBadge();
}

function renderBlacksmith() {
  const tabs = `<nav class="blacksmith-tabs" aria-label="대장장이">${[
    ['enhance', '강화'],
    ['salvage', '분해'],
    ['reforge', '재련'],
  ].map(([id, label]) => `<button data-blacksmith-tab="${id}" class="${blacksmithTab === id ? 'active' : ''}" aria-pressed="${blacksmithTab === id}">${label}</button>`).join('')}</nav>`;
  const materials = `<p class="material-counts">보유 재료 · 정수 ${character.materials?.essence ?? 0} · 영혼 ${character.materials?.soul ?? 0} · 골드 ${character.gold}G</p>`;
  const cloudOffline = Boolean(character.cloudUserId) && (
    !remoteSync?.userId || !navigator.onLine || remoteSync.status === 'offline'
  );
  if (blacksmithTab === 'enhance') {
    const rows = inventory.filter((item) => item.slot).map((item) => `<div class="item-row"><div class="item-details">${itemDetails(item)}</div><div class="item-actions"><span>다음 비용 ${40 * (item.enhance + 1) ** 2}G</span><button data-enhance="${item.uid}" ${item.enhance >= 10 || character.gold < 40 * (item.enhance + 1) ** 2 || cloudOffline ? 'disabled' : ''} ${cloudOffline ? 'title="연결되면 강화할 수 있어요"' : ''}>강화</button>${cloudOffline ? '<small>연결되면 강화할 수 있어요</small>' : ''}</div></div>`).join('');
    hubPanel.innerHTML = `<h2>대장장이</h2>${materials}${tabs}<p>실패해도 장비는 파괴되거나 하락하지 않습니다.</p>${rows || '<p>강화할 장비를 먼저 착용하세요.</p>'}<button data-close>닫기</button>`;
    return;
  }
  if (blacksmithTab === 'salvage') {
    const yields = { common: 1, magic: 2, rare: 4, legendary: 10, set: 10 };
    const rows = inventory.filter((item) => !item.slot).map((item) => {
      const essence = (yields[item.rarity] ?? 1) + Math.floor((item.enhance ?? 0) / 2);
      const soul = item.rarity === 'legendary' || item.rarity === 'set' ? 1 : 0;
      return `<div class="item-row"><div class="item-details">${itemDetails(item)}<small>분해 획득 · 정수 ${essence}${soul ? ' · 영혼 1' : ''}</small></div><div class="item-actions"><button data-salvage="${item.uid}" data-rarity="${item.rarity}">분해</button></div></div>`;
    }).join('');
    hubPanel.innerHTML = `<h2>대장장이 · 분해</h2>${materials}${tabs}${rows || '<p>분해할 장비가 없습니다.</p>'}<button data-close>닫기</button>`;
    return;
  }
  const eligible = inventory.filter((item) => !item.slot && item.rarity !== 'common');
  const selected = eligible.find((item) => item.uid === selectedReforgeUid);
  const selectedAffix = selected?.affixes?.[selectedReforgeIndex];
  const selectedAffixReforgeable = selectedAffix && selectedAffix.unique == null;
  const essenceCost = { magic: 2, rare: 4, legendary: 8, set: 8 }[selected?.rarity] ?? 0;
  const soulCost = selected?.rarity === 'legendary' || selected?.rarity === 'set' ? 1 : 0;
  const goldCost = selected ? 20 * selected.ilvl : 0;
  const rows = eligible.map((item) => {
    const affixes = (item.affixes ?? []).map((affix, index) => {
      const name = escapeHtml(AFFIXES[affix.id]?.name ?? '고유 능력');
      const label = `${name} · ${affix.value}`;
      if (affix.unique != null) {
        return `<button class="affix-select unique-affix" type="button" disabled><span>${label}</span><small>고유</small></button>`;
      }
      return `<button class="affix-select${selectedReforgeUid === item.uid && selectedReforgeIndex === index ? ' selected' : ''}" data-select-reforge-affix="${item.uid}" data-index="${index}" ${AFFIXES[affix.id] ? '' : 'disabled'}>${label}</button>`;
    }).join('');
    return `<div class="item-row"><div class="item-details">${itemDetails(item)}</div><div class="item-actions"><span>아이템 Lv${item.ilvl}</span></div>${affixes}</div>`;
  }).join('');
  const resultMarkup = reforgeResult && reforgeResult.uid === selectedReforgeUid && reforgeResult.expiresAt > Date.now()
    ? `<p class="reforge-result rarity-${reforgeResult.rarity}">${escapeHtml(reforgeResult.oldName)} ${reforgeResult.oldValue} → ${escapeHtml(reforgeResult.newName)} ${reforgeResult.newValue}</p>`
    : '';
  const action = selectedAffixReforgeable
    ? `<p>재련 비용 · 정수 ${essenceCost} · 영혼 ${soulCost} · 골드 ${goldCost}G</p><button data-reforge-action ${cloudOffline || character.materials?.essence < essenceCost || character.materials?.soul < soulCost || character.gold < goldCost ? 'disabled' : ''}>재련</button>${cloudOffline ? '<small>연결되면 재련할 수 있어요</small>' : ''}`
    : '<p>재련할 장비의 능력치를 선택하세요.</p>';
  const footer = `<div class="reforge-footer">${action}${resultMarkup}<button data-close>닫기</button></div>`;
  hubPanel.innerHTML = `<h2>대장장이 · 재련</h2>${materials}${tabs}<div class="reforge-list">${rows || '<p>재련할 장비가 없습니다.</p>'}</div>${footer}`;
}

function renderPanel(kind, compareUid = '') {
  if (kind !== 'party-finder') stopPartyFinderPolling();
  hubPanel.hidden = false;
  hubPanel.dataset.kind = kind;
  if (kind === 'board') renderBoard();
  if (kind === 'party-finder') openPartyFinder();
  if (kind === 'inventory') renderInventory(compareUid);
  if (kind === 'blacksmith') renderBlacksmith();
  if (kind === 'merchant') {
    const rows = inventory.filter((item) => !item.slot).map((item) => `<div class="hub-row"><span>${itemName(item)}<small>판매가 ${Math.round(({ common: 5, magic: 15, rare: 45, legendary: 150, set: 150 }[item.rarity] ?? 5) * (1 + item.ilvl / 10))}G</small></span><button data-sell="${item.uid}">판매</button></div>`).join('');
    const familyWeapons = FAMILY_STARTER_WEAPONS.map(({ itemId, price }) => (
      `<div class="hub-row"><span>${escapeHtml(ITEMS[itemId].name)}<small>체험 · 공용 · ${price}G</small></span><button data-buy-family-weapon="${itemId}" ${character.gold < price || inventory.length >= 40 ? 'disabled' : ''}>구매</button></div>`
    )).join('');
    hubPanel.innerHTML = `<h2>상인</h2><p>골드 ${character.gold}G · 물약 ${character.potions}/5 · 물약 25G</p><button data-buy-potion>물약 구매</button><h3>계열 체험 무기</h3>${familyWeapons}${rows}<button data-close>닫기</button>`;
  }
  if (kind === 'character') {
    const stats = calculatePlayerStats(character.level, equippedItems());
    const family = equipmentLook(equippedItems()).family;
    const skillNames = FAMILY_SKILLS[family] ?? FAMILY_SKILLS.sword;
    const skillDescriptions = skillNames.map((name, index) => (
      `<li><strong>${SKILLS[name].name}</strong> · ${FAMILY_SKILL_COPY[family][index]}</li>`
    )).join('');
    const gear = EQUIPMENT_SLOTS.map((slot) => {
      const item = inventory.find((entry) => entry.slot === slot.key);
      return `<li>${slot.label}: ${item ? `${escapeHtml(itemName(item))} +${item.enhance ?? 0} · ${escapeHtml(itemStat(item).split(' · ')[0])}` : '비어 있음'}</li>`;
    }).join('');
    hubPanel.innerHTML = `<h2>${escapeHtml(character.name)} · ${FAMILY_NAMES[family]} Lv.${character.level}</h2><p>계열: ${FAMILY_NAMES[family]}</p><p>경험치 ${character.xp}/${Math.round(60 * character.level ** 1.6)} · 골드 ${character.gold}G</p><p>HP ${stats.maxHp} · 공격 ${stats.attack} · 방어 ${stats.defense} · 치명타 ${stats.critChance}% · 치명타 피해 ${Math.round(stats.critDamage * 100)}%</p><p>이동 속도 ${stats.moveSpeed.toFixed(1)} · 물약 ${character.potions}/5</p><h3>계열 기술</h3><ul class="character-equipment">${skillDescriptions}</ul><h3>장착한 장비</h3><ul class="character-equipment">${gear}</ul><button data-close>닫기</button>`;
  }
  hubPanel.focus();
}

async function openBoard() {
  const dateKey = kstDateKey(Date.now());
  const storedDateKey = character.contracts?.dateKey;
  if (!storedDateKey || dateKey > storedDateKey) {
    await applyOps([{ type: 'contractDay', dateKey }]);
  }
  renderPanel('board');
}

async function startStage(stageId, options = {}) {
  const difficulty = options.difficulty ?? 'normal';
  if (!stageIsUnlocked(stageId, difficulty) && !DEV_MODE && !debugEnabled) return;
  const tutorialSortie = debugEnabled
    ? { stageId, beginCombat: false }
    : resolveTutorialSortie(stageId, tutorialState);
  const stageToStart = tutorialSortie.stageId;
  if (tutorialSortie.beginCombat) {
    updateTutorial({ type: 'beginCombat' });
    await tutorialSaveChain;
  }
  const selectedStage = STAGE_LIST.find((entry) => entry.id === stageToStart);
  localStorage.setItem('devinarok.lastStageRegion', String(selectedStage?.region ?? 1));
  if (stageToStart === 'F1') localStorage.setItem('devinarok.f1-entered', '1');
  if (stageToStart === 'K1') localStorage.setItem('devinarok.k1-entered', '1');
  stopWorld();
  partyClient?.close();
  partyClient = null;
  $('#hub-party-button').hidden = true;
  currentStageId = stageToStart;
  currentStageDifficulty = difficulty;
  settlementState.settled = false;
  attackInputAssistant.reset();
  hubUi.hidden = true;
  hubPanel.hidden = true;
  pauseMenu.hidden = true;
  resultPanel.hidden = true;
  $('#controls').hidden = false;
  $('#controls').classList.remove('hub-controls');
  $('#boss-hud').hidden = !['CB', 'FB', 'KB'].includes(stageToStart);
  $('#boss-name').textContent = stageToStart === 'KB'
    ? '해골 왕'
    : stageToStart === 'FB' ? '잿빛 숲의 사령술사' : '해골 기사단장';
  updateBossIntro(stageToStart);
  $('#party-hud').hidden = true;
  $('#party-rtt').hidden = true;
  updateFamilySkillControls(equipmentLook(equippedItems()).family);
  world = createStageWorld({
    seed: options.seed ?? crypto.getRandomValues(new Uint32Array(1))[0],
    stageId: stageToStart,
    difficulty,
    playerId: character.id,
    character: {
      level: character.level,
      potions: character.potions,
      equipment: equippedItems(),
      mastery: character.mastery,
    },
  });
  updateCloudLogoutButton();
  tutorialLastX = null;
  tutorialLastZ = null;
  input = new InputLayer({ canvas: $('#scene'), controls: $('#controls') });
  renderer = new ArenaRenderer($('#scene'), () => {}, world.arena, DEV_COLLISION_OVERLAY, world);
  renderer.localPlayerId = character.id;
  const [, music] = await Promise.all([renderer.ready, loadAudioForScene(stageToStart)]);
  applySettings();
  await audio.unlock();
  audio.setMusic(music, { crossfadeMs: 1000 });
  $('#stage-name').textContent = world.arena.name;
  renderTutorialCard();
  if (['CB', 'FB', 'KB'].includes(stageToStart)) {
    $('#boss-intro').hidden = false;
    setTimeout(() => { $('#boss-intro').hidden = true; }, 2800);
  }
  let seenEventId = world.nextEventId - 1;
  loop = new FixedStepLoop({
    world,
    playerId: character.id,
    input,
    buildInput: (rawInput, current) => {
      const player = current.entities.find((entity) => entity.kind === 'player' && entity.playerId === character.id);
      const aimed = buildRangedAimInput(rawInput, player, current);
      return attackInputAssistant.build(aimed, current, player, { autoAttack: autoAttackEnabled() });
    },
    beforeStep: (current) => debugController?.beforeStep(current),
    render: (previous, current, alpha) => {
      renderer?.render(previous, current, alpha);
      debugController?.frame(current, renderer, performance.now());
    },
    onTick: (current) => {
      if (!character) return;
      updateHud(current);
      trackTutorialMovement(current);
      for (const event of current.events) {
        if (event.eventId <= seenEventId) continue;
        seenEventId = event.eventId;
        handleAudioEvent(event, current);
      }
      if (current.outcome && !settlementState.settled) settleStage(current.outcome);
    },
  });
  debugController?.applySpeed(loop);
  loop.start();
}

function updateHud(current) {
  if (!character || !current) return;
  updateCloudLogoutButton();
  const hero = current.entities.find((entity) => entity.kind === 'player' && entity.playerId === character.id)
    ?? current.entities.find((entity) => entity.kind === 'player');
  if (hero) {
    $('#hud-name').textContent = `${character.name} · Lv.${character.level}`;
    $('#hud-hp').textContent = `HP ${hero.hp} / ${hero.maxHp}`;
    $('#hp-fill').style.width = `${hero.hp / hero.maxHp * 100}%`;
    $('#potion-count').textContent = String(hero.potions);
    const skillNames = FAMILY_SKILLS[hero.family ?? 'sword'] ?? FAMILY_SKILLS.sword;
    for (const [id, buttonValue] of [[1, 4], [2, 8], [3, 16], [4, 128]]) {
      const button = $(`#controls [data-button="${buttonValue}"]`);
      const skill = SKILLS[skillNames[id - 1]];
      const rank = hero.masteryRanks?.[id] ?? hero.mastery?.[id - 1] ?? 0;
      const cooldownBonus = masteryBonus(rank).cooldownPct;
      const max = Math.max(1, Math.round(skill.cooldownTicks
        * (1 - Math.min(60, hero.stats.skillCooldownReduction) / 100)
        * (1 - cooldownBonus / 100)));
      if (button) button.style.setProperty('--cooldown', `${(hero.skillCooldowns[id] / max) * 100}%`);
      const rankBadge = button?.querySelector('.skill-rank-badge');
      if (rankBadge) {
        rankBadge.hidden = rank < 1;
        rankBadge.textContent = String(rank);
      }
      button?.classList.toggle('mastery-rank-five', rank === 5);
      if (id === 4 && button) {
        const locked = character.level < 7;
        button.disabled = locked;
        button.classList.toggle('is-locked', locked);
        button.querySelector('.skill-unlock-badge').hidden = !locked;
        button.setAttribute('aria-label', `${skill.name}${locked ? ', Lv7' : ''}`);
      }
    }
    const dodgeButton = $('#controls [data-button="2"]');
    dodgeButton?.style.setProperty('--cooldown', `${(hero.dodgeCooldownTicks / DODGE_COOLDOWN_TICKS) * 100}%`);
    $('#controls .attack-button')?.classList.toggle('counter-ready', hero.counterReadyTicks > 0);
  }
  $('#boss-hud').hidden = !['CB', 'FB', 'KB'].includes(current.stageId);
  const boss = current.entities.find((entity) => entity.boss);
  if (boss) $('#boss-fill').style.width = `${boss.hp / boss.maxHp * 100}%`;
  updateObjectiveHud(current);
}

function updateObjectiveHud(current) {
  const banner = $('#objective-hud');
  const objective = current?.objective;
  if (
    current?.mode !== 'stage'
    || objective?.state !== 'active'
    || objective.roomIndex !== current.roomIndex
  ) {
    banner.hidden = true;
    banner.innerHTML = '';
    return;
  }
  banner.hidden = false;
  if (objective.type === 'hunt') {
    const seconds = Math.max(0, Math.ceil((objective.endsTick - current.tick) / 30));
    const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    const target = current.entities.find((entity) => entity.id === objective.targetId);
    const targetKind = target?.enemyKind
      ?? current.arena?.rooms?.[objective.roomIndex]?.objective?.target;
    const targetName = OBJECTIVE_ENEMY_NAMES[targetKind] ?? target?.name ?? '표적';
    banner.innerHTML = `<strong>현상수배 · ${targetName} 처치 · ${time}</strong>`;
  } else if (objective.type === 'defend') {
    const percent = Math.max(0, Math.min(100, Math.round(objective.hp / objective.maxHp * 100)));
    banner.innerHTML = `<strong>결계석 방어 · 결계석 ${percent}%</strong><span class="objective-hud-bar"><i style="width:${percent}%"></i></span>`;
  } else {
    const percent = Math.max(0, Math.min(100, Math.floor(objective.progress / objective.required * 100)));
    banner.innerHTML = `<strong>봉인 의식 · 원 안에 머무르세요 · ${percent}%</strong>`;
  }
}

function buildSettlement(outcome, result) {
  firstForestUnlock = false;
  const difficulty = result.difficulty ?? currentStageDifficulty;
  const stageId = result.stageId ?? currentStageId;
  const ops = [
    { type: 'gainXp', amount: result.xp },
    { type: 'grantGold', amount: result.gold },
    { type: 'setPotions', count: result.potions },
  ];
  const masteryProgressLines = [];
  for (const [skill, amount] of Object.entries(result.skillUses ?? {})) {
    if (!Object.hasOwn(SKILLS, skill) || !Number.isInteger(amount) || amount <= 0) continue;
    const beforeXp = character.mastery?.[skill] ?? 0;
    const afterXp = Math.min(MASTERY_MAX_XP, beforeXp + amount);
    const gained = afterXp - beforeXp;
    if (gained <= 0) continue;
    ops.push({ type: 'gainMastery', skill, amount });
    masteryProgressLines.push({
      skill,
      amount: gained,
      previousRank: masteryRank(beforeXp),
      nextRank: masteryRank(afterXp),
    });
  }
  let autoSold = 0;
  let record = false;
  if (outcome === 'clear') {
    const key = stageClearKey(stageId, difficulty);
    const ticks = result.ticks;
    const previousBest = character.records?.[key];
    record = Number.isInteger(ticks) && (!Number.isInteger(previousBest) || ticks < previousBest);
    firstForestUnlock = difficulty === 'normal' && stageId === 'CB' && !character.clearedStages.includes('CB');
    const capacity = Math.max(0, 40 - inventory.length);
    const uniqueItems = rekeySettlementItems(result.items, inventory);
    uniqueItems.forEach((item, index) => {
      if (index < capacity) {
        ops.push({ type: 'grantItem', uid: item.uid, itemId: item.itemId, rarity: item.rarity, enhance: item.enhance, ilvl: item.ilvl, affixes: item.affixes, legendaryId: item.legendaryId, setId: item.setId });
      } else {
        autoSold += Math.round(({ common: 5, magic: 15, rare: 45, legendary: 150, set: 150 }[item.rarity] ?? 5) * (1 + item.ilvl / 10));
      }
    });
    if (autoSold) ops.push({ type: 'grantGold', amount: autoSold });
    ops.push({ type: 'clearStage', stageId: key });
    if (Number.isInteger(ticks)) ops.push({ type: 'recordClear', key, ticks });
  }
  const dateKey = kstDateKey(Date.now());
  const storedDateKey = character.contracts?.dateKey;
  const isBackdated = Boolean(storedDateKey && dateKey < storedDateKey);
  const contracts = isBackdated ? [] : contractsFor(character, dateKey);
  const stored = character.contracts?.dateKey === dateKey ? character.contracts : { progress: {}, claimed: [] };
  const contractProgressLines = [];
  for (const contract of contracts) {
    const current = stored.progress?.[contract.id] ?? 0;
    let amount = contract.type === 'kills'
      ? result.kills?.[contract.enemyKind] ?? 0
      : contract.type === 'perfect'
        ? result.perfectDodges ?? 0
        : 0;
    if (contract.type === 'clear' && outcome === 'clear'
      && result.stageId === contract.stageId && result.difficulty === contract.difficulty) amount = 1;
    if (contract.type === 'noPotion' && outcome === 'clear'
      && result.stageId === contract.stageId && result.difficulty === contract.difficulty
      && result.potionsUsed === 0) amount = 1;
    amount = Math.min(Math.max(0, contract.target - current), amount);
    if (amount <= 0) continue;
    const progress = current + amount;
    ops.push({ type: 'contractProgress', dateKey, contractId: contract.id, amount });
    contractProgressLines.push({ contract, progress, complete: progress >= contract.target });
  }
  return {
    ops: contractDayFirst(character, dateKey, ops),
    autoSold,
    record,
    contractProgressLines,
    masteryProgressLines,
  };
}

function renderSettlement(outcome, result, {
  autoSold = 0,
  record = false,
  error = null,
  newSkill = null,
  contractProgressLines = [],
  masteryProgressLines = [],
} = {}) {
  const saved = !error;
  const difficulty = result.difficulty ?? currentStageDifficulty;
  const stageId = result.stageId ?? currentStageId;
  const earnedItems = outcome === 'clear' && result.items.length
    ? `<ul class="settlement-items">${result.items.map((item) => `<li class="rarity-${item.rarity}">${itemName(item)} · ${RARITIES[item.rarity]?.name ?? item.rarity}</li>`).join('')}</ul>`
    : '';
  const progression = outcome === 'clear' && stageId === 'KB' && difficulty === 'normal'
    ? '<p>모든 지역을 정복했어요 · 악몽 난이도가 열렸어요</p>'
    : outcome === 'clear' && stageId === 'KB' && difficulty === 'nightmare'
      ? '<p>지옥 난이도가 열렸어요</p>'
      : outcome === 'clear' && stageId === 'FB' && difficulty === 'normal'
      ? '<p>3지역 · 해골 왕의 성채가 열렸어요</p>'
      : outcome === 'clear' && firstForestUnlock
        ? '<p>2지역 · 잿빛 숲이 열렸어요</p>'
        : '';
  const stageName = STAGE_LIST.find((stage) => stage.id === stageId)?.name ?? '';
  const recordMarkup = outcome === 'clear' && record ? '<p class="new-record">신기록!</p>' : '';
  const objectiveLabel = OBJECTIVE_LABELS[result.objective?.type];
  const objectiveStage = STAGE_LIST.find((stage) => stage.id === stageId);
  const objectiveMarkup = objectiveLabel
    ? result.objective.success
      ? outcome === 'clear'
        ? `<p class="settlement-objective">목표 · ${objectiveLabel} 달성 (+${objectiveBonusGold(objectiveStage, difficulty)}G · 희귀 장비)</p>`
        : `<p class="settlement-objective">목표 · ${objectiveLabel} 달성 (귀환하지 못해 보상 일부를 잃었어요)</p>`
      : `<p class="settlement-objective">목표 · ${objectiveLabel} 실패</p>`
    : '';
  const resultContent = $('.overlay #result-panel .panel') ?? $('#result-panel .panel');
  resultContent.innerHTML = `<div class="eyebrow">${outcome === 'clear' ? '작전 성공' : outcome === 'death' ? '전투 불능' : '후퇴'}</div><h2>${stageName} · ${DIFFICULTIES[difficulty]?.label ?? difficulty}</h2>${recordMarkup}<p>경험치 +${result.xp} · 획득 골드 ${result.gold}G${result.goldLost ? ` · 손실 ${result.goldLost}G` : ''}</p>${objectiveMarkup}<p>획득 장비 ${outcome === 'clear' ? result.items.length : 0}개${autoSold ? ` · 가방 초과 자동 판매 +${autoSold}G` : ''}</p>${newSkill ? `<p>새 스킬: ${newSkill.name}</p>` : ''}${progression}${earnedItems}${result.lostItems?.length ? `<p>두고 온 장비: ${result.lostItems.map((item) => itemName(item)).join(', ')}</p>` : ''}${saved ? `<p>현재 Lv.${character.level} · 골드 ${character.gold}G</p><button id="result-return" class="primary">여관으로</button>` : '<p class="settlement-error" data-settlement-error></p><button id="result-retry" class="primary">다시 시도</button><button id="result-discard">포기하고 여관으로 (보상 손실)</button>'}`;
  if (contractProgressLines.length) {
    const lines = contractProgressLines.map(({ contract, progress, complete }) => {
      const label = contract.type === 'kills'
        ? contractDescription(contract).replace(` ${contract.target}마리 처치`, '')
        : contract.type === 'perfect' ? '완벽 회피' : contractDescription(contract);
      return `<p class="settlement-contract${complete ? ' complete' : ''}">의뢰 진행 · ${label} ${progress}/${contract.target}</p>`;
    }).join('');
    resultContent.querySelector('h2')?.insertAdjacentHTML('afterend', lines);
  }
  if (masteryProgressLines.length) {
    const lines = masteryProgressLines.map(({ skill, amount, previousRank, nextRank: rank }) => (
      `<p class="settlement-mastery">${SKILLS[skill].name} +${amount}${rank > previousRank
        ? ` <strong class="mastery-rank-up">★${previousRank} → ★${rank}!</strong>`
        : ''}</p>`
    )).join('');
    resultContent.querySelector('h2')?.insertAdjacentHTML('afterend', `<section class="settlement-mastery-list"><strong>숙련도</strong>${lines}</section>`);
  }
  if (!saved) {
    resultContent.querySelector('[data-settlement-error]').textContent = `정산 실패: ${error?.message ?? String(error)}`;
    $('#result-retry').addEventListener('click', () => attemptSettlement(outcome, result, settlementId), { once: true });
    $('#result-discard').addEventListener('click', enterHub, { once: true });
  } else {
    $('#result-return').addEventListener('click', enterHub, { once: true });
  }
  resultPanel.hidden = false;
  resultPanel.querySelector('[role="dialog"]')?.focus();
}

async function attemptSettlement(outcome, result, settlementId) {
  let autoSold = 0;
  let record = false;
  let contractProgressLines = [];
  let masteryProgressLines = [];
  try {
    const previousLevel = character.level;
    await reloadCharacter();
    const settlement = buildSettlement(outcome, result);
    autoSold = settlement.autoSold;
    record = settlement.record;
    contractProgressLines = settlement.contractProgressLines;
    masteryProgressLines = settlement.masteryProgressLines;
    character = await saves.commit({
      characterId: character.id,
      baseRev: character.rev,
      ops: settlement.ops,
      idempotencyKey: settlementId,
      context: {
        kind: 'settlement',
        stageId: result.stageId ?? currentStageId,
        difficulty: result.difficulty ?? currentStageDifficulty,
        partySize: Math.max(1, Math.min(4, Number(
          result.partySize ?? partyClient?.lobby?.players?.length ?? world?.partySize ?? 1,
        ))),
        outcome,
        ticks: result.ticks ?? 0,
        potionsUsed: result.potionsUsed ?? 0,
      },
      cloudUserId: character.cloudUserId === remoteSync?.userId ? remoteSync.userId : undefined,
    });
    remoteSync?.localCommit();
    if (character.level > previousLevel) audio.play('reward-chime');
    inventory = await saves.listItems(character.id);
    const newSkill = previousLevel < 7 && character.level >= 7
      ? SKILLS[FAMILY_SKILLS[equipmentLook(equippedItems()).family]?.[3]]
      : null;
    if (newSkill) showActionToast(`새 스킬: ${newSkill.name}`);
    renderSettlement(outcome, result, {
      autoSold, record, newSkill, contractProgressLines, masteryProgressLines,
    });
  } catch (error) {
    console.error('Settlement failed', error);
    renderSettlement(outcome, result, {
      autoSold, record, error, contractProgressLines, masteryProgressLines,
    });
  }
}

async function settleStage(outcome = world?.outcome, result = world?.result, idempotencyKey = null) {
  if (!world || !result || !acquireSettlement(settlementState, () => loop?.pause())) return;
  if (outcome === 'clear') updateTutorial({ type: 'stageComplete' });
  await tutorialSaveChain;
  settlementId = idempotencyKey ?? crypto.randomUUID();
  await attemptSettlement(outcome, result, settlementId);
}

createForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = new FormData(createForm).get('name');
  const id = crypto.randomUUID();
  await saves.commit({
    characterId: id,
    baseRev: 0,
    ops: [{ type: 'createCharacter', name, kind: 'knight' }],
    context: { kind: 'hub' },
    cloudUserId: remoteSync?.cloudUserIdForNewCharacter(),
  });
  remoteSync?.localCommit();
  await refreshTitle();
});
$('#start-button').addEventListener('click', () => {
  enterHub().catch((error) => { console.error(error); $('#toast').textContent = '여관을 열지 못했습니다.'; });
});
$('#pause-button').addEventListener('click', () => {
  if (world?.mode !== 'stage') return;
  pauseMenu.hidden = false;
  $('#continue-button').focus();
  if (!partyClient) loop?.pause();
});
$('#hub-party-button').addEventListener('click', () => {
  audio.play('click');
  openPartyFinder();
});
$('#continue-button').addEventListener('click', () => { pauseMenu.hidden = true; loop?.resume(); });
$('#retreat-button').addEventListener('click', () => {
  if (world?.mode !== 'stage') return;
  if (partyClient) {
    partyClient.leave();
    pauseMenu.hidden = true;
    return;
  }
  retreatStage(world);
  settleStage('retreat');
});
$('#mute-button').addEventListener('click', () => { void saveSetting('muted', !settings.muted); });
$('#settings-button').addEventListener('click', () => {
  settingsReturnToPause = !pauseMenu.hidden;
  pauseMenu.hidden = true;
  updateCloudLogoutButton();
  $('#settings-panel').hidden = false;
  $('#bgm-volume').focus();
});
function closeSettings() {
  $('#settings-panel').hidden = true;
  pauseMenu.hidden = !settingsReturnToPause;
  settingsReturnToPause = false;
  $('#settings-button').focus();
}
$('#settings-close-button').addEventListener('click', closeSettings);
$('#settings-panel').addEventListener('click', (event) => {
  if (event.target === $('#settings-panel')) closeSettings();
});
for (const [id, key] of [['bgm-volume', 'bgmVolume'], ['sfx-volume', 'sfxVolume']]) {
  const slider = $(`#${id}`);
  slider.addEventListener('input', () => {
    settings = { ...settings, [key]: Number(slider.value) };
    applySettings();
  });
  slider.addEventListener('change', () => { void saveSetting(key, Number(slider.value)); });
}
$('#settings-mute-button').addEventListener('click', () => { void saveSetting('muted', !settings.muted); });
$('#quality-setting').addEventListener('change', (event) => { void saveSetting('quality', event.currentTarget.value); });
$('#reduced-motion-setting').addEventListener('change', (event) => { void saveSetting('reducedMotion', event.currentTarget.checked); });
$('#large-text-setting').addEventListener('change', (event) => { void saveSetting('largeText', event.currentTarget.checked); });
$('#haptics-setting').addEventListener('change', (event) => { void saveSetting('haptics', event.currentTarget.checked); });
$('#telegraph-setting').addEventListener('change', (event) => { void saveSetting('telegraphEmphasis', event.currentTarget.checked); });
$('#auto-attack-setting').addEventListener('change', (event) => { void saveSetting('autoAttack', event.currentTarget.checked); });
$('#cloud-login-button').addEventListener('click', () => { void openCloudLogin(); });
$('#cloud-sync-button').addEventListener('click', async () => {
  try {
    await remoteSync.syncNow();
    await refreshTitle();
    showActionToast('동기화했어요');
  } catch (error) {
    showActionToast(error?.message ?? '동기화에 실패했어요');
  }
});
$('#cloud-logout-button').addEventListener('click', async () => {
  if ($('#cloud-logout-button').disabled) return;
  closeSettings();
  remoteSync.logout();
  await showTitle();
});
$('#cloud-character-chooser').addEventListener('click', async (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  try {
    if (button.dataset.useServer) await remoteSync.useServerCharacter(button.dataset.useServer);
    if (button.dataset.uploadDevice) await remoteSync.uploadLocalCharacter(button.dataset.uploadDevice);
    if (button.dataset.retryImport) await remoteSync.retryLocalCharacter(button.dataset.retryImport);
    await refreshTitle();
  } catch (error) {
    showActionToast(error?.message ?? '캐릭터를 불러오지 못했어요');
  }
});
$('#tutorial-skip').addEventListener('click', () => updateTutorial({ type: 'skip' }));
$('#tutorial-replay-button').addEventListener('click', async () => {
  updateTutorial({ type: 'replay' });
  await tutorialSaveChain;
  await startStage('C1');
});
$('#hub-ui').addEventListener('click', async (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  audio.play('click');
  if (button.dataset.panel === 'sanctuary') {
    if (partyClient) setPartyToast('파티 중에는 들어갈 수 없어요');
    else await enterSanctuary();
    return;
  }
  if (button.dataset.slotFilter) { renderInventory('', button.dataset.slotFilter); return; }
  if (button.dataset.boardTab) {
    boardTab = button.dataset.boardTab;
    await openBoard();
    return;
  }
  if (button.dataset.claimContract) {
    const dateKey = kstDateKey(Date.now());
    if (character.contracts?.dateKey !== dateKey) {
      await openBoard();
      return;
    }
    await applyOps([{
      type: 'claimContract',
      dateKey,
      contractId: button.dataset.claimContract,
    }]);
    updateContractClaimBadge();
    await openBoard();
    return;
  }
  if (button.dataset.blacksmithTab) {
    blacksmithTab = button.dataset.blacksmithTab;
    renderPanel('blacksmith');
    return;
  }
  if (button.dataset.selectReforgeAffix !== undefined) {
    selectedReforgeUid = button.dataset.selectReforgeAffix;
    selectedReforgeIndex = Number(button.dataset.index);
    reforgeResult = null;
    renderPanel('blacksmith');
    return;
  }
  if (button.dataset.salvage) {
    const rarity = button.dataset.rarity;
    if (['rare', 'legendary', 'set'].includes(rarity) && !window.confirm('희귀 이상 장비를 분해할까요?')) return;
    await applyOps([{ type: 'salvageItem', uid: button.dataset.salvage }]);
    updateInventoryUpgradeBadge();
    renderPanel('blacksmith');
    return;
  }
  if (button.hasAttribute('data-reforge-action')) {
    const item = inventory.find((entry) => entry.uid === selectedReforgeUid);
    const oldAffix = item?.affixes?.[selectedReforgeIndex];
    if (!item || !oldAffix) return;
    const oldName = AFFIXES[oldAffix.id]?.name ?? oldAffix.id;
    if (character.cloudUserId) {
      if (!remoteSync?.userId || !navigator.onLine || remoteSync.status === 'offline') {
        showActionToast('연결되면 강화할 수 있어요');
        return;
      }
      try {
        await remoteSync.reforge({
          characterId: character.id,
          uid: item.uid,
          index: selectedReforgeIndex,
        });
        character = await saves.loadCharacter(character.id);
        inventory = await saves.listItems(character.id);
      } catch (error) {
        showActionToast(error?.message === 'offline' ? '연결되면 강화할 수 있어요' : error?.message ?? '재련에 실패했어요');
        return;
      }
    } else {
      const roll = crypto.getRandomValues(new Uint32Array(1))[0];
      await applyOps([{
        type: 'reforgeAffix',
        uid: item.uid,
        index: selectedReforgeIndex,
        roll,
      }]);
    }
    const newAffix = inventory.find((entry) => entry.uid === item.uid)?.affixes?.[selectedReforgeIndex];
    if (newAffix) {
      reforgeResult = {
        uid: item.uid,
        rarity: item.rarity,
        oldName,
        oldValue: oldAffix.value,
        newName: AFFIXES[newAffix.id]?.name ?? newAffix.id,
        newValue: newAffix.value,
        expiresAt: Date.now() + 1500,
      };
    }
    refreshHubPlayer();
    renderPanel('blacksmith');
    window.setTimeout(() => {
      if (reforgeResult?.expiresAt <= Date.now()) {
        reforgeResult = null;
        if (hubPanel.dataset.kind === 'blacksmith' && blacksmithTab === 'reforge') renderPanel('blacksmith');
      }
    }, 1500);
    return;
  }
  if (button.hasAttribute('data-party-finder')) { openPartyFinder(); return; }
  if (button.hasAttribute('data-party-quick')) { await quickJoinFromFinder(); return; }
  if (button.hasAttribute('data-party-lookup-retry')) {
    partyQuickLookupFailed = false;
    setPartyToast('');
    await quickJoinFromFinder();
    return;
  }
  if (button.hasAttribute('data-party-lookup-create')) {
    partyQuickLookupFailed = false;
    setPartyToast('');
    try { await connectParty(); } catch (error) { setPartyToast(partyJoinErrorMessage(error), { error: true }); }
    return;
  }
  if (button.hasAttribute('data-party-refresh')) { await refreshPartyRooms({ loading: true }); return; }
  if (button.dataset.partyJoin) {
    try {
      await connectParty(button.dataset.partyJoin);
    } catch (error) {
      setPartyToast(partyJoinErrorMessage(error), { error: true });
      partyFinderState = 'list';
      renderPartyFinder();
      void refreshPartyRooms({ loading: true });
      if (partyFinderTimer === null) partyFinderTimer = setInterval(() => void refreshPartyRooms(), 5000);
    }
    return;
  }
  if (button.hasAttribute('data-party-create')) {
    try { await connectParty(); } catch (error) { setPartyToast(partyJoinErrorMessage(error), { error: true }); }
    return;
  }
  if (button.hasAttribute('data-party-share')) {
    const url = inviteLink(partyClient.roomCode);
    try {
      if (navigator.share) await navigator.share({ title: '데비나로크 파티 초대', url });
      else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setPartyToast('초대 링크를 복사했어요');
      } else setPartyToast(url);
    } catch {}
    return;
  }
  if (button.hasAttribute('data-party-ready')) {
    const local = partyClient?.lobby?.players?.find((member) => member.playerId === partyClient.playerId);
    partyClient?.setReady(!local?.ready);
    return;
  }
  if (button.hasAttribute('data-party-start')) { partyClient?.start(); return; }
  if (button.hasAttribute('data-party-close')) {
    stopPartyFinderPolling();
    partyClient?.leave();
    partyClient?.close();
    partyClient = null;
    $('#hub-party-button').hidden = false;
    $('#hub-ui [data-panel="sanctuary"]').disabled = false;
    $('#sanctuary-party-disabled').hidden = true;
    await openBoard();
    return;
  }
  if (button.dataset.panel) {
    const tutorialStep = { board: 'board', blacksmith: 'blacksmith', inventory: 'equipment' }[button.dataset.panel];
    if (tutorialStep) updateTutorial({ type: tutorialStep });
    if (button.dataset.panel === 'board') await openBoard();
    else renderPanel(button.dataset.panel);
  }
  if (button.hasAttribute('data-close')) {
    stopPartyFinderPolling();
    const wasQuickJoining = partyQuickJoining;
    partyQuickAbortController?.abort();
    partyQuickAbortController = null;
    partyQuickJoining = false;
    if (wasQuickJoining) {
      partyClient?.leave();
      partyClient?.close();
      partyClient = null;
    }
    $('#hub-party-button').hidden = false;
    hubPanel.hidden = true;
  }
  if (button.dataset.sortie) startStage(button.dataset.sortie, { difficulty: boardDifficulty });
  if (button.dataset.compare) renderPanel('inventory', button.dataset.compare);
  if (button.dataset.equip) {
    const equippedItem = inventory.find((item) => item.uid === button.dataset.equip);
    const previousFamily = equipmentLook(equippedItems()).family;
    await applyOps([{ type: 'equip', uid: button.dataset.equip, slot: button.dataset.slot }]);
    refreshHubPlayer();
    renderPanel(hubPanel.dataset.kind);
    const nextFamily = equipmentLook(equippedItems()).family;
    if (ITEMS[equippedItem?.itemId]?.slot === 'weapon' && previousFamily !== nextFamily) showFamilyChangeToast(nextFamily);
  }
  if (button.dataset.unequip) {
    await applyOps([{ type: 'unequip', slot: button.dataset.unequip }]);
    refreshHubPlayer();
    renderPanel(hubPanel.dataset.kind);
  }
  if (button.dataset.sell) {
    await applyOps([{ type: 'sellItem', uid: button.dataset.sell }]);
    updateInventoryUpgradeBadge();
    renderPanel(hubPanel.dataset.kind);
  }
  if (button.dataset.enhance) {
    if (character.cloudUserId) {
      if (!remoteSync?.userId || !navigator.onLine || remoteSync.status === 'offline') {
        showActionToast('연결되면 강화할 수 있어요');
        return;
      }
      try {
        await remoteSync.enhance({ characterId: character.id, uid: button.dataset.enhance });
        character = await saves.loadCharacter(character.id);
        inventory = await saves.listItems(character.id);
      } catch (error) {
        showActionToast(error?.message === 'offline' ? '연결되면 강화할 수 있어요' : error?.message ?? '강화에 실패했어요');
        return;
      }
    } else {
      const roll = crypto.getRandomValues(new Uint32Array(1))[0] % 10000;
      await applyOps([{ type: 'enhanceItem', uid: button.dataset.enhance, roll }]);
    }
    refreshHubPlayer();
    renderPanel('blacksmith');
  }
  if (button.hasAttribute('data-buy-potion')) {
    await applyOps([{ type: 'buyPotion', count: 1 }]);
    renderPanel('merchant');
  }
  if (button.dataset.buyFamilyWeapon) {
    const starter = FAMILY_STARTER_WEAPONS.find(({ itemId }) => itemId === button.dataset.buyFamilyWeapon);
    if (!starter || character.gold < starter.price || inventory.length >= 40) return;
    await applyOps([
      { type: 'spendGold', amount: starter.price },
      { type: 'grantItem', uid: crypto.randomUUID(), itemId: starter.itemId, rarity: 'common', ilvl: 1, enhance: 0, affixes: [] },
    ]);
    renderPanel('merchant');
  }
});
hubPanel.addEventListener('click', (event) => {
  const inventoryTabButton = event.target.closest('[data-inventory-tab]');
  if (inventoryTabButton) {
    inventoryTab = inventoryTabButton.dataset.inventoryTab;
    renderInventory();
    return;
  }
  const difficultyButton = event.target.closest('[data-board-difficulty]');
  if (difficultyButton) {
    boardDifficulty = difficultyButton.dataset.boardDifficulty;
    renderBoard();
    return;
  }
  const card = event.target.closest('.equipment-slot-card');
  if (!card || event.target.closest('[data-unequip]')) return;
  renderInventory('', card.dataset.slotFilter);
});
hubPanel.addEventListener('keydown', (event) => {
  const card = event.target.closest('.equipment-slot-card');
  if (!card || event.target.closest('button') || !['Enter', ' '].includes(event.key)) return;
  event.preventDefault();
  renderInventory('', card.dataset.slotFilter);
});
hubUi.addEventListener('submit', (event) => {
  if (event.target.id !== 'party-join-form') return;
  event.preventDefault();
  try {
    void connectParty($('#party-code').value).catch((error) => setPartyToast(partyJoinErrorMessage(error), { error: true }));
  } catch (error) { setPartyToast(error.message, { error: true }); }
});
hubPanel.addEventListener('change', (event) => {
  if (event.target.id === 'party-stage-select') {
    partyClient?.selectStage(event.target.value, partyClient.lobby?.difficulty ?? 'normal');
  }
  if (event.target.id === 'party-difficulty-select') {
    const difficulty = event.target.value;
    const stageId = latestStage(difficulty, character.clearedStages);
    partyClient?.selectStage(stageId, difficulty);
  }
  if (event.target.matches('[data-party-public]')) partyClient?.setPublic(event.target.checked);
});
gameScreen.addEventListener('click', (event) => {
  const station = event.target.closest('.npc-hotspot');
  if (!station || world?.mode !== 'hub') return;
  audio.play('click');
  if (station.dataset.panel === 'sanctuary') {
    if (partyClient) setPartyToast('파티 중에는 들어갈 수 없어요');
    else void enterSanctuary();
    return;
  }
  renderPanel(station.dataset.panel);
});
$('#sanctuary-interact').addEventListener('click', interactSanctuary);
$('#sanctuary-cancel').addEventListener('click', cancelSanctuary);
$('#sanctuary-exit').addEventListener('click', async () => {
  resetRitual(sanctuaryState ?? createRitualState());
  sanctuaryState = null;
  stopWorld();
  await enterHub();
});
window.addEventListener('pointerdown', (event) => {
  if (event.pointerType === 'touch') document.documentElement.classList.add('touch-mode');
}, { passive: true });
document.addEventListener('keydown', (event) => {
  const settingsPanel = $('#settings-panel');
  const container = !settingsPanel.hidden ? settingsPanel.querySelector('[role="dialog"]')
    : !pauseMenu.hidden ? pauseMenu.querySelector('[role="dialog"]')
      : !hubPanel.hidden ? hubPanel
        : !resultPanel.hidden ? resultPanel.querySelector('[role="dialog"]') : null;
  if (!container) return;
  if (event.code === 'Escape') {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!settingsPanel.hidden) closeSettings();
    else if (!hubPanel.hidden) hubPanel.querySelector('[data-close], [data-party-close]')?.click();
    else if (!pauseMenu.hidden) {
      pauseMenu.hidden = true;
      loop?.resume();
      $('#pause-button').focus();
    } else ($('#result-return') ?? $('#result-retry') ?? $('#result-discard'))?.click();
    return;
  }
  if (event.key !== 'Tab') return;
  const focusable = [...container.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),summary,[tabindex]:not([tabindex="-1"])')]
    .filter((element) => !element.hidden && element.offsetParent !== null);
  if (!focusable.length) {
    event.preventDefault();
    container.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!container.contains(document.activeElement)) {
    event.preventDefault();
    first.focus();
  } else if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}, true);

const reducedMotionMedia = window.matchMedia('(prefers-reduced-motion: reduce)');
reducedMotionMedia.addEventListener('change', () => {
  if (settings.reducedMotion === null) applySettings();
});

window.addEventListener('keydown', (event) => {
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  const editable = event.target instanceof HTMLElement && event.target.closest('input, select, textarea, [contenteditable="true"]');
  if (
    event.code === 'KeyT' &&
    !event.repeat &&
    !coarsePointer &&
    !editable &&
    pauseMenu.hidden &&
    $('#settings-panel').hidden &&
    hubPanel.hidden &&
    resultPanel.hidden
  ) {
    event.preventDefault();
    const enabled = !autoAttackEnabled();
    void saveSetting('autoAttack', enabled);
    showActionToast(`자동 공격 ${enabled ? '켜짐' : '꺼짐'}`);
    return;
  }
  if (sanctuaryState && world?.arena === SANCTUARY_ARENA) {
    if (event.code === 'KeyE') {
      event.preventDefault();
      interactSanctuary();
      return;
    }
    if (event.code === 'KeyR' || event.code === 'Escape') {
      event.preventDefault();
      if (!cancelSanctuary() && event.code === 'Escape') {
        $('#sanctuary-exit').click();
      }
      return;
    }
  }
  handlePauseKey(event.code, { loop, partyClient, world, pauseMenu });
});

saves = await createSaveRepository();
remoteSync = new RemoteSync({
  repository: saves,
  onChange: (state) => {
    renderCloudAccount(state);
    void refreshTitle().then(() => {
      if (world?.mode === 'hub') refreshHubPlayer();
      else if (world?.mode === 'stage' && !partyClient) refreshSoloStagePlayer();
    });
  },
  onRevert: () => {
    showActionToast('서버 기록으로 되돌렸어요');
    if (!resultPanel.hidden) {
      const panel = resultPanel.querySelector('.panel');
      panel.innerHTML = '<div class="eyebrow">서버 동기화</div><h2>서버 기록으로 되돌렸어요</h2><p>서버에 저장된 캐릭터 기록으로 복원했어요.</p><button id="result-return" class="primary">여관으로</button>';
      $('#result-return').addEventListener('click', enterHub, { once: true });
    }
  },
});
settings = await saves.loadSettings();
applySettings();
await remoteSync.initialize();
renderCloudAccount(remoteSync.snapshot);
await refreshTitle();
installDebugVersionToggle();
if (debugEnabled) await enableDebugMode({ announce: false });
if (DEV_MODE) {
  window.__devinarok = {
    get world() { return world; },
    get renderer() { return renderer; },
    get loop() { return loop; },
    get character() { return character; },
    get inventory() { return inventory; },
    get party() { return partyClient; },
    buttons: BUTTONS,
    comboTimelines: COMBO_TIMELINES,
    stages: STAGE_LIST,
    startStage,
    createParty: () => connectParty(),
    joinParty: (code) => connectParty(code),
    enterPartyCode(code) { return connectParty(code); },
    getPartyWorld() { return partyClient?.viewWorld(); },
    getNetFrameTelemetry() { return partyClient?.frameTelemetry?.slice() ?? []; },
    get partyInputSchedule() {
      return {
        lastProducedTick: partyInputScheduler.lastProducedTick,
        leadTicks: partyInputScheduler.leadTicks,
        clockEpoch: partyInputScheduler.clockEpoch,
      };
    },
    setTutorialStep(step) {
      if (!TUTORIAL_COPY[step]) return false;
      tutorialState = { ...tutorialState, step, active: true, completed: false, skipped: false };
      renderTutorialCard();
      return true;
    },
    getNetBotInput,
    renderPartyFrame,
    setPartyHudCaptureFreeze,
    setPartyInputProvider,
    tickPartyInput,
    setPartyInputAutoDrive,
    get partyInputSeq() { return input?.seq ?? null; },
    get partyInputDriverStats() { return { ...partyInputDriverStats }; },
    enterHub,
    settleStage,
    forceOutcome(outcome = 'clear') { completeStage(world, outcome); return settleStage(outcome); },
    step(inputsByPlayerId) { return world && step(world, inputsByPlayerId); },
    render(previous = world) { if (renderer && world) renderer.render(previous, world, 1); },
    async grantDevItem(item = {}) {
      const uid = item.uid ?? `dev:${character.rev}:${inventory.length}`;
      const rolled = rollStageItem(world, { stageLevel: item.ilvl ?? 1, forcedRarity: item.rarity ?? 'rare' });
      await applyOps([{
        type: 'grantItem',
        uid,
        itemId: item.itemId ?? rolled.itemId,
        rarity: item.rarity ?? rolled.rarity,
        ilvl: item.ilvl ?? rolled.ilvl,
        enhance: item.enhance ?? 0,
        affixes: item.affixes ?? rolled.affixes,
        legendaryId: rolled.legendaryId,
      }, { type: 'markDebug' }], { context: { kind: 'debug' } });
      return uid;
    },
    async grantDevGold(amount = 500) {
      await applyOps([{ type: 'grantGold', amount }, { type: 'markDebug' }], { context: { kind: 'debug' } });
      return character.gold;
    },
    addLoot(item = {}) {
      const player = world.entities.find((entry) => entry.kind === 'player');
      const entity = {
        id: world.nextEntityId++,
        kind: 'loot',
        lootType: item.lootType ?? 'item',
        x: item.x ?? player?.x ?? 0,
        z: item.z ?? player?.z ?? 0,
        radius: 0.18,
        item: ['gold', 'potion'].includes(item.lootType) ? null : { itemId: item.itemId ?? 'rusted-sword', rarity: item.rarity ?? 'rare' },
        gold: item.lootType === 'gold' ? item.gold ?? 50 : 0,
      };
      world.entities.push(entity);
      return entity;
    },
    async reloadSave() { await reloadCharacter(); return { character, inventory }; },
  };
}
