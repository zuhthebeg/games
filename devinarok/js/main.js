import { createSaveRepository } from './save/repository.js';
import { InputLayer } from './core/input.js';
import { FixedStepLoop } from './core/loop.js';
import { ArenaRenderer } from './render/renderer.js';
import { AudioManager } from './render/audio.js';
import { PartyClient } from './ui/party.js';
import { escapeHtml } from './ui/escape-html.js';
import { handlePauseKey } from './ui/pause-menu.js';
import { computeBotPolicy } from './net/bot-policy.js';
import { AFFIXES } from './content/affixes.js';
import { ITEMS, RARITIES } from './content/items.js';
import { rekeySettlementItems } from './save/ops.js';
import { HUB_ARENA, STAGE_LIST } from './content/stages.js';
import {
  BUTTONS, COMBO_TIMELINES, calculatePlayerStats, completeStage, createHubWorld,
  createStageWorld, retreatStage, rollStageItem, step,
} from './sim/world.js';

const $ = (selector) => document.querySelector(selector);
const DEV_MODE = new URLSearchParams(location.search).get('dev') === '1';
const DEV_COLLISION_OVERLAY = DEV_MODE && new URLSearchParams(location.search).get('collide') === '1';
const titleScreen = $('#title-screen');
const gameScreen = $('#game-screen');
const createForm = $('#create-form');
const characterCard = $('#character-card');
const pauseMenu = $('#pause-menu');
const hubUi = $('#hub-ui');
const hubPanel = $('#hub-panel');
const resultPanel = $('#result-panel');
let saves;
let character;
let inventory = [];
let world;
let renderer;
let input;
let loop;
let frame;
let settled = false;
let settlementId = null;
let soundMuted = false;
let audioLoaded = false;
const audio = new AudioManager();
let currentStageId = null;
let partyClient = null;
let partyFrame = null;
let partyPreviousWorld = null;
let partyLastTime = 0;
let partyLastRenderTime = 0;
let partyAccumulator = 0;
let partyInputTimer = null;
let partyInputLastTime = 0;
let partyInputAccumulator = 0;
let partyInputDriverStats = {};
let inviteRoomHandled = false;
let reviveText = new Map();
let partyHudCaptureFrozen = false;

async function reloadCharacter() {
  character = await saves.loadCharacter(character.id);
  inventory = await saves.listItems(character.id);
}

async function refreshTitle() {
  character = (await saves.listCharacters()).sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;
  inventory = character ? await saves.listItems(character.id) : [];
  $('#save-warning').hidden = saves.persistent;
  $('#save-warning').textContent = saves.persistent ? '' : '저장이 브라우저 메모리에만 남습니다. 브라우저를 닫으면 기록이 사라질 수 있어요.';
  createForm.hidden = Boolean(character);
  characterCard.hidden = !character;
  if (character) {
    $('#character-name').textContent = character.name;
    $('#character-level').textContent = `기사 · Lv.${character.level} · 경험치 ${character.xp}`;
  }
}

function stopWorld() {
  if (frame) cancelAnimationFrame(frame);
  if (partyFrame) cancelAnimationFrame(partyFrame);
  frame = null;
  partyFrame = null;
  partyPreviousWorld = null;
  partyLastTime = 0;
  partyLastRenderTime = 0;
  partyAccumulator = 0;
  partyHudCaptureFrozen = false;
  if (partyInputTimer !== null) clearInterval(partyInputTimer);
  partyInputTimer = null;
  partyInputLastTime = 0;
  partyInputAccumulator = 0;
  loop?.stop();
  input?.destroy();
  renderer?.destroy();
  loop = input = renderer = null;
}

function showTitle() {
  stopWorld();
  partyClient?.close();
  partyClient = null;
  titleScreen.hidden = false;
  gameScreen.hidden = true;
  resultPanel.hidden = true;
  refreshTitle();
}

function commit(ops) {
  return saves.commit({ characterId: character.id, baseRev: character.rev, ops });
}

async function applyOps(ops) {
  character = await commit(ops);
  inventory = await saves.listItems(character.id);
  return character;
}

function equippedItems() {
  const ids = new Set(Object.values(character.equipment ?? {}).filter(Boolean));
  return inventory.filter((item) => ids.has(item.uid));
}

function stageIsUnlocked(stageId) {
  if (stageId === 'C1') return true;
  const index = STAGE_LIST.findIndex((stage) => stage.id === stageId);
  return index > 0 && character.clearedStages.includes(STAGE_LIST[index - 1].id);
}

function drawHub() {
  if (!renderer || !world || world.mode !== 'hub') return;
  renderer.render(world, world, 1);
  frame = requestAnimationFrame(drawHub);
}

async function enterHub() {
  stopWorld();
  partyClient?.close();
  partyClient = null;
  titleScreen.hidden = true;
  gameScreen.hidden = false;
  hubUi.hidden = false;
  hubPanel.hidden = true;
  pauseMenu.hidden = true;
  resultPanel.hidden = true;
  $('#controls').hidden = true;
  $('#boss-hud').hidden = true;
  $('#party-hud').hidden = true;
  $('#party-rtt').hidden = true;
  $('#party-door-countdown').hidden = true;
  $('#party-downed').hidden = true;
  $('#party-network-overlay').hidden = true;
  $('#stage-name').textContent = '거점 여관';
  $('#hud-name').textContent = character.name;
  world = createHubWorld({ seed: 724103, playerId: character.id });
  renderer = new ArenaRenderer($('#scene'), () => {}, HUB_ARENA, DEV_COLLISION_OVERLAY);
  await Promise.all([renderer.ready, loadAudio()]);
  await audio.unlock();
  audio.setMusic('hub-bgm');
  updateDebugZone('거점 여관');
  frame = requestAnimationFrame(drawHub);
  const inviteCode = new URLSearchParams(location.search).get('room');
  if (inviteCode && !inviteRoomHandled) {
    inviteRoomHandled = true;
    connectParty(inviteCode);
  }
}

function updateDebugZone(areaName) {
  const label = $('#debug-zone');
  label.hidden = !DEV_MODE;
  if (DEV_MODE) label.textContent = `${areaName} · 자산 ${(renderer.getLoadedBytes() / 1024 / 1024).toFixed(2)} MB`;
}

async function loadAudio() {
  if (audioLoaded) return;
  await audio.loadAll();
  audioLoaded = true;
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

function formatStat(stat, value, unit = '') {
  return `${STAT_NAMES[stat] ?? AFFIXES[stat]?.name ?? stat} ${value > 0 ? '+' : ''}${value}${unit}`;
}

function itemStat(item) {
  const base = ITEMS[item.itemId];
  if (!base) return '알 수 없는 장비';
  const enhance = item.enhance ?? 0;
  const value = base.value + enhance * Math.max(1, Math.round(base.value * 0.08));
  return `${formatStat(base.stat, value)} · 강화 +${enhance} · 요구 Lv.${item.requiredLevel ?? base.requiredLevel} · ${RARITIES[item.rarity]?.name ?? item.rarity}`;
}

function itemDetails(item) {
  const affixes = (item.affixes ?? []).map((affix) => {
    const definition = AFFIXES[affix.id];
    const unit = definition?.unit ?? (affix.id === 'spinCooldownSeconds' ? '초' : '');
    return `<small class="affix-line">${formatStat(affix.id, affix.value, unit)}</small>`;
  }).join('');
  return `<strong class="item-name rarity-${item.rarity}">${itemName(item)}</strong><small>${itemStat(item)}</small>${affixes || '<small>추가 옵션 없음</small>'}`;
}

function compareDeltas(item) {
  const slot = ITEMS[item.itemId]?.slot ?? 'weapon';
  const current = calculatePlayerStats(character.level, equippedItems());
  const replaced = equippedItems().filter((equipped) => equipped.slot !== slot);
  const next = calculatePlayerStats(character.level, [...replaced, item]);
  const stats = [
    ['attack', '공격력', (value) => Math.round(value)],
    ['defense', '방어력', (value) => Math.round(value)],
    ['maxHp', '최대 체력', (value) => Math.round(value)],
    ['critChance', '치명타 확률', (value) => `${value.toFixed(1)}%`],
    ['critDamage', '치명타 피해', (value) => `${Math.round(value * 100)}%`],
    ['attackSpeed', '공격 속도', (value) => `${value}%`],
    ['moveSpeed', '이동 속도', (value) => value.toFixed(1)],
    ['dodgeCooldownReduction', '회피 재사용 대기시간 감소', (value) => `${value}%`],
    ['skillCooldownReduction', '기술 재사용 대기시간 감소', (value) => `${value}%`],
    ['lifesteal', '흡혈', (value) => `${value}%`],
    ['goldGain', '골드 획득', (value) => `${value}%`],
    ['xpGain', '경험치 획득', (value) => `${value}%`],
    ['spinCooldownSeconds', '회전 기술 재사용 대기시간', (value) => `${value.toFixed(1)}초`],
  ];
  const deltas = stats.flatMap(([key, label, format]) => {
    const delta = next[key] - current[key];
    if (Math.abs(delta) < 1e-9) return [];
    const sign = delta > 0 ? '+' : '';
    return [`<span class="${delta > 0 ? 'delta-up' : 'delta-down'}">${label} ${sign}${format(delta)}</span>`];
  });
  return `<div class="compare-deltas">${deltas.join('') || '<span>능력치 변화 없음</span>'}</div>`;
}

function renderBoard() {
  const rows = STAGE_LIST.map((stage) => {
    const unlocked = stageIsUnlocked(stage.id);
    const cleared = character.clearedStages.includes(stage.id);
    return `<div class="hub-row"><span>${stage.name}<small>권장 Lv.${stage.recommendedLevel} · ${cleared ? '클리어' : unlocked ? '도전 가능' : '잠김'}</small></span><button data-sortie="${stage.id}" ${unlocked ? '' : 'disabled'}>${cleared ? '재도전' : '출정'}</button></div>`;
  }).join('');
  const upcomingRegion = '<div class="hub-row" aria-disabled="true"><span>2지역 · 준비 중<small>다음 업데이트에서 열려요</small></span><button disabled>준비 중</button></div>';
  hubPanel.innerHTML = `<h2>주인 · 출정 게시판</h2><p>골드 ${character.gold} · 해금된 기록에 따라 다음 지역이 열립니다.</p>${rows}${upcomingRegion}<div class="party-entry"><strong>같이 출정</strong><p>동료와 함께 지하묘지로 떠납니다.</p><button data-party-create class="primary">방 만들기</button><form id="party-join-form"><input id="party-code" maxlength="6" pattern="[A-HJ-NP-Z2-9]{6}" placeholder="초대 코드"><button type="submit">코드로 참가</button></form></div><button data-close>닫기</button>`;
}

function inviteLink(code) {
  const url = new URL(location.href);
  url.searchParams.set('room', code);
  return url.toString();
}

function renderPartyLobby() {
  if (!partyClient?.roomCode || hubPanel.hidden) return;
  const party = partyClient.lobby?.players ?? [];
  const local = party.find((member) => member.playerId === partyClient.playerId);
  const isHost = partyClient.lobby?.hostId === partyClient.playerId;
  const allReady = party.length > 0 && party.every((member) => member.connected && member.ready);
  const stage = partyClient.lobby?.stageId ?? 'C1';
  const stageOptions = STAGE_LIST.filter((entry) => isHost ? stageIsUnlocked(entry.id) : entry.id === stage)
    .map((entry) => `<option value="${entry.id}" ${entry.id === stage ? 'selected' : ''}>${entry.name}</option>`).join('');
  const members = party.map((member) => `<div class="party-lobby-member"><span>${escapeHtml(member.name ?? member.playerId)} · Lv.${member.level}</span><span>${member.connected ? member.ready ? '준비 완료' : '대기 중' : '연결 끊김'}</span></div>`).join('');
  const status = partyClient.status === 'reconnecting' ? '재연결 중…' : partyClient.status === 'connecting' ? '연결 중…' : '방에 입장했습니다.';
  hubPanel.dataset.kind = 'party';
  hubPanel.innerHTML = `<section class="party-lobby"><h2>파티 대기실 · ${partyClient.roomCode}</h2><p>${status}</p><div class="party-lobby-members">${members || '<p>파티 정보를 기다리는 중…</p>'}</div><label>출정 지역<select id="party-stage-select" ${isHost ? '' : 'disabled'}>${stageOptions}</select></label><p class="invite-link">초대 링크<br>${inviteLink(partyClient.roomCode)}</p><button data-party-ready>${local?.ready ? '준비 취소' : '준비 완료'}</button><button data-party-start class="primary" ${isHost && allReady ? '' : 'disabled'}>시작</button><button data-party-close>나가기</button></section>`;
}

function connectParty(code = null) {
  partyClient?.close();
  partyClient = new PartyClient({
    character,
    equipment: equippedItems(),
    onLobby: () => renderPartyLobby(),
    onStatus: () => renderPartyLobby(),
    onStart: (message) => { void startPartyStage(message); },
    onSnapshot: (message, client) => updatePartyHud(client, message),
    onEvents: (events) => {
      for (const event of events) {
        if (event.type === 'reviveProgress') reviveText.set(event.entityId, event);
        if (event.type === 'revived' || event.type === 'roomEnter') reviveText.clear();
        if (event.type === 'cast') audio.play(event.skill === 3 ? 'impact' : 'sword-swing');
        if (event.type === 'hit') audio.play('impact');
        if (event.type === 'pickup') audio.play(event.lootType === 'gold' ? 'coins' : 'confirm');
        if (event.type === 'death') audio.play('enemy-death');
      }
    },
    onResult: ({ result, roomCode, runId, playerId }) => {
      void settleStage(result.outcome, result, `${roomCode}:${runId}:${playerId}`);
    },
    onRoomGone: () => {
      $('#party-network-overlay').hidden = true;
      $('#toast').textContent = '방이 종료되어 여관으로 돌아갑니다.';
      void enterHub();
    },
    onError: (error) => { console.error('Party connection failed', error); },
  });
  if (code) partyClient.joinRoom(code);
  else partyClient.createRoom();
  renderPartyLobby();
}

async function startPartyStage(message) {
  if (!partyClient) return;
  stopWorld();
  currentStageId = message.stageId;
  settled = false;
  settlementId = `${partyClient.roomCode}:${message.runId}:${partyClient.playerId}`;
  hubUi.hidden = true;
  hubPanel.hidden = true;
  pauseMenu.hidden = true;
  resultPanel.hidden = true;
  $('#controls').hidden = false;
  $('#party-hud').hidden = false;
  $('#party-rtt').hidden = false;
  $('#boss-hud').hidden = message.stageId !== 'CB';
  $('#stage-name').textContent = STAGE_LIST.find((entry) => entry.id === message.stageId)?.name ?? message.stageId;
  world = partyClient.viewWorld() ?? partyClient.stageWorld;
  input = new InputLayer({ canvas: $('#scene'), controls: $('#controls') });
  renderer = new ArenaRenderer($('#scene'), () => {}, world.arena, DEV_COLLISION_OVERLAY);
  await Promise.all([renderer.ready, loadAudio()]);
  await audio.unlock();
  audio.setMusic('combat-bgm');
  updateDebugZone(world.arena.name);
  partyPreviousWorld = world;
  partyLastTime = 0;
  partyLastRenderTime = 0;
  partyAccumulator = 0;
  partyFrame = requestAnimationFrame(partyLoop);
}

function updatePartyHud(client = partyClient, snapshot = client?.lastSnapshot) {
  if (partyHudCaptureFrozen || !client || !client.stageWorld || !snapshot) return;
  const partyPlayers = (snapshot.ents ?? []).filter((entity) => entity.kind === 'player');
  $('#party-hud').innerHTML = partyPlayers.map((member) => {
    const label = `${escapeHtml(member.name ?? member.playerId)} · Lv.${member.level ?? 1}`;
    return `<div class="party-member"><div class="party-member-row"><span>${label}</span><span>${member.hp}/${member.maxHp}</span></div><div class="hp-track"><i style="width:${member.hp / Math.max(1, member.maxHp) * 100}%"></i></div></div>`;
  }).join('');
  const rtt = Math.round(client.session?.clock.rttMs ?? 0);
  const badge = $('#party-rtt');
  badge.textContent = `${rtt} ms`;
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
  if (!partyClient || !renderer || !input) return;
  if (!input.devInputProvider) {
    if (!partyLastTime) partyLastTime = time;
    partyAccumulator += Math.min(0.25, (time - partyLastTime) / 1000);
    partyLastTime = time;
    let steps = 0;
    while (partyAccumulator >= 1 / 30 && steps < 5) {
      sendPartyInputTick();
      partyAccumulator -= 1 / 30;
      steps += 1;
    }
  }
  if (
    !DEV_MODE ||
    partyInputTimer === null ||
    !partyLastRenderTime ||
    time - partyLastRenderTime >= 200
  ) {
    const nextWorld = partyClient.viewWorld(time) ?? world;
    if (nextWorld) {
      if (!DEV_MODE || partyInputTimer === null) {
        renderer.render(partyPreviousWorld ?? nextWorld, nextWorld, 1);
      }
      partyPreviousWorld = nextWorld;
      world = nextWorld;
      updateHud(nextWorld);
      updatePartyHud();
    }
    partyLastRenderTime = time;
  }
  const overlay = $('#party-network-overlay');
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
  const queued = pauseMenu.hidden ? next : { ...next, moveX: 0, moveZ: 0, buttons: 0 };
  return Boolean(partyClient.sendInput(queued));
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
  partyInputDriverStats.timerTicks += 1;
  if (!partyClient?.inputReady || !input || partyClient.result) {
    partyInputDriverStats.notReady += 1;
    partyInputLastTime = now;
    partyInputAccumulator = 0;
    return;
  }
  if (!partyInputLastTime) partyInputLastTime = now;
  partyInputAccumulator = Math.min(
    3000,
    partyInputAccumulator + Math.max(0, now - partyInputLastTime),
  );
  partyInputLastTime = now;
  const pending = partyClient.session?.inputs.size ?? 0;
  const limit = Math.max(0, Math.min(6, 90 - pending));
  let steps = 0;
  while (partyInputAccumulator >= 1000 / 30 && steps < limit) {
    if (!sendPartyInputTick()) break;
    partyInputAccumulator -= 1000 / 30;
    steps += 1;
  }
  partyInputDriverStats.inputs += steps;
  partyInputDriverStats.catchUpInputs += Math.max(0, steps - 3);
  if (!steps && pending >= 90) partyInputDriverStats.backpressure += 1;
}

function setPartyInputAutoDrive(enabled) {
  if (!DEV_MODE || !(input instanceof InputLayer) || !input.devInputProvider) return false;
  if (partyInputTimer !== null) clearInterval(partyInputTimer);
  partyInputTimer = null;
  partyInputLastTime = 0;
  partyInputAccumulator = 0;
  if (enabled) {
    partyInputDriverStats = {
      timerTicks: 0,
      inputs: 0,
      catchUpInputs: 0,
      notReady: 0,
      backpressure: 0,
    };
    partyInputLastTime = performance.now();
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
  return {
    ...computeBotPolicy({
      player,
      viewed,
      roomCleared: Boolean(client.lastSnapshot.roomCleared),
      door,
    }),
    viewTick,
  };
}

function renderInventory(compareUid = '') {
  const rows = inventory.map((item) => {
    const base = ITEMS[item.itemId];
    const slot = base?.slot ?? 'weapon';
    const equipped = Boolean(item.slot);
    const compare = compareUid === item.uid ? compareDeltas(item) : '';
    return `<div class="item-row ${compare ? 'selected' : ''}"><div class="item-details">${itemDetails(item)}</div><div class="item-actions"><button data-compare="${item.uid}">비교</button>${equipped ? `<button data-unequip="${slot}">해제</button>` : `<button data-equip="${item.uid}" data-slot="${slot}" ${item.requiredLevel > character.level ? 'disabled' : ''}>착용</button>`}<button data-sell="${item.uid}" ${equipped ? 'disabled' : ''}>판매</button></div>${compare}</div>`;
  }).join('');
  hubPanel.innerHTML = `<h2>장비함 · ${inventory.length}/40</h2><p>무기 · 머리 · 몸 · 손 · 발 슬롯을 비교합니다.</p>${rows || '<p>보관 중인 장비가 없습니다.</p>'}<button data-close>닫기</button>`;
}

function renderPanel(kind, compareUid = '') {
  hubPanel.hidden = false;
  hubPanel.dataset.kind = kind;
  if (kind === 'board') renderBoard();
  if (kind === 'inventory') renderInventory(compareUid);
  if (kind === 'blacksmith') {
    const rows = inventory.filter((item) => item.slot).map((item) => `<div class="item-row"><div class="item-details">${itemDetails(item)}</div><div class="item-actions"><span>다음 비용 ${40 * (item.enhance + 1) ** 2}G</span><button data-enhance="${item.uid}" ${item.enhance >= 10 || character.gold < 40 * (item.enhance + 1) ** 2 ? 'disabled' : ''}>강화</button></div></div>`).join('');
    hubPanel.innerHTML = `<h2>대장장이 · 강화</h2><p>실패해도 장비는 파괴되거나 하락하지 않습니다. 보유 골드 ${character.gold}G</p>${rows || '<p>강화할 장비를 먼저 착용하세요.</p>'}<button data-close>닫기</button>`;
  }
  if (kind === 'merchant') {
    const rows = inventory.filter((item) => !item.slot).map((item) => `<div class="hub-row"><span>${itemName(item)}<small>판매가 ${Math.round(({ common: 5, magic: 15, rare: 45, legendary: 150 }[item.rarity] ?? 5) * (1 + item.ilvl / 10))}G</small></span><button data-sell="${item.uid}">판매</button></div>`).join('');
    hubPanel.innerHTML = `<h2>상인</h2><p>골드 ${character.gold}G · 물약 ${character.potions}/5 · 물약 25G</p><button data-buy-potion>물약 구매</button>${rows}<button data-close>닫기</button>`;
  }
  if (kind === 'character') {
    const stats = calculatePlayerStats(character.level, equippedItems());
    hubPanel.innerHTML = `<h2>${character.name} · 기사 Lv.${character.level}</h2><p>경험치 ${character.xp}/${Math.round(60 * character.level ** 1.6)} · 골드 ${character.gold}G</p><p>HP ${stats.maxHp} · 공격 ${stats.attack} · 방어 ${stats.defense} · 치명타 ${stats.critChance}% · 치명타 피해 ${Math.round(stats.critDamage * 100)}%</p><p>이동 속도 ${stats.moveSpeed.toFixed(1)} · 물약 ${character.potions}/5</p><button data-close>닫기</button>`;
  }
}

async function startStage(stageId) {
  if (!stageIsUnlocked(stageId) && !DEV_MODE) return;
  stopWorld();
  partyClient?.close();
  partyClient = null;
  currentStageId = stageId;
  settled = false;
  hubUi.hidden = true;
  hubPanel.hidden = true;
  pauseMenu.hidden = true;
  resultPanel.hidden = true;
  $('#controls').hidden = false;
  $('#boss-hud').hidden = stageId !== 'CB';
  $('#party-hud').hidden = true;
  $('#party-rtt').hidden = true;
  world = createStageWorld({
    seed: crypto.getRandomValues(new Uint32Array(1))[0],
    stageId,
    playerId: character.id,
    character: { level: character.level, potions: character.potions, equipment: equippedItems() },
  });
  input = new InputLayer({ canvas: $('#scene'), controls: $('#controls') });
  renderer = new ArenaRenderer($('#scene'), () => {}, world.arena, DEV_COLLISION_OVERLAY);
  await Promise.all([renderer.ready, loadAudio()]);
  await audio.unlock();
  audio.setMusic('combat-bgm');
  $('#stage-name').textContent = world.arena.name;
  updateDebugZone(world.arena.name);
  if (stageId === 'CB') {
    $('#boss-intro').hidden = false;
    setTimeout(() => { $('#boss-intro').hidden = true; }, 2800);
  }
  let seenEventId = world.nextEventId - 1;
  loop = new FixedStepLoop({
    world,
    playerId: character.id,
    input,
    render: (previous, current, alpha) => renderer?.render(previous, current, alpha),
    onTick: (current) => {
      updateHud(current);
      for (const event of current.events) {
        if (event.eventId <= seenEventId) continue;
        seenEventId = event.eventId;
        if (event.type === 'cast') audio.play(event.skill === 3 ? 'impact' : 'sword-swing');
        if (event.type === 'hit') audio.play('impact');
        if (event.type === 'death' && event.entityId !== current.entities.find((entity) => entity.kind === 'player')?.id) audio.play('enemy-death');
        if (event.type === 'pickup') audio.play(event.lootType === 'gold' ? 'coins' : 'confirm');
        if (event.type === 'doorOpen') audio.play('door-open');
        if (event.type === 'potion') audio.play('potion');
        if (event.type === 'spawn' && event.boss) audio.play('roar', { rate: 0.62 });
        if (event.type === 'spawn' && event.boss) {
          $('#boss-intro').hidden = false;
          setTimeout(() => { $('#boss-intro').hidden = true; }, 2800);
        }
      }
      if (current.outcome && !settled) settleStage(current.outcome);
    },
  });
  loop.start();
}

function updateHud(current) {
  const hero = current.entities.find((entity) => entity.kind === 'player' && entity.playerId === character.id)
    ?? current.entities.find((entity) => entity.kind === 'player');
  if (hero) {
    $('#hud-name').textContent = `${character.name} · Lv.${character.level}`;
    $('#hud-hp').textContent = `HP ${hero.hp} / ${hero.maxHp}`;
    $('#hp-fill').style.width = `${hero.hp / hero.maxHp * 100}%`;
    $('#potion-count').textContent = String(hero.potions);
    for (const [id, buttonValue, max] of [[1, 4, 180], [2, 8, 240], [3, 16, 360]]) {
      const button = $(`#controls [data-button="${buttonValue}"]`);
      if (button) button.style.setProperty('--cooldown', `${(hero.skillCooldowns[id] / max) * 100}%`);
    }
  }
  $('#boss-hud').hidden = current.stageId !== 'CB';
  const boss = current.entities.find((entity) => entity.boss);
  if (boss) $('#boss-fill').style.width = `${boss.hp / boss.maxHp * 100}%`;
}

function buildSettlement(outcome, result) {
  const ops = [
    { type: 'gainXp', amount: result.xp },
    { type: 'grantGold', amount: result.gold },
    { type: 'setPotions', count: result.potions },
  ];
  let autoSold = 0;
  if (outcome === 'clear') {
    const capacity = Math.max(0, 40 - inventory.length);
    const uniqueItems = rekeySettlementItems(result.items, inventory);
    uniqueItems.forEach((item, index) => {
      if (index < capacity) {
        ops.push({ type: 'grantItem', uid: item.uid, itemId: item.itemId, rarity: item.rarity, enhance: item.enhance, ilvl: item.ilvl, affixes: item.affixes, legendaryId: item.legendaryId });
      } else {
        autoSold += Math.round(({ common: 5, magic: 15, rare: 45, legendary: 150 }[item.rarity] ?? 5) * (1 + item.ilvl / 10));
      }
    });
    if (autoSold) ops.push({ type: 'grantGold', amount: autoSold });
    ops.push({ type: 'clearStage', stageId: currentStageId });
  }
  return { ops, autoSold };
}

function renderSettlement(outcome, result, { autoSold = 0, error = null } = {}) {
  const saved = !error;
  const earnedItems = outcome === 'clear' && result.items.length
    ? `<ul class="settlement-items">${result.items.map((item) => `<li class="rarity-${item.rarity}">${itemName(item)} · ${RARITIES[item.rarity]?.name ?? item.rarity}</li>`).join('')}</ul>`
    : '';
  const progression = outcome === 'clear' && currentStageId === 'CB'
    ? '<p>1지역을 정복했어요. 다음 지역은 준비 중이에요.</p>'
    : '';
  const resultContent = $('.overlay #result-panel .panel') ?? $('#result-panel .panel');
  resultContent.innerHTML = `<div class="eyebrow">${outcome === 'clear' ? '작전 성공' : outcome === 'death' ? '전투 불능' : '후퇴'}</div><h2>${STAGE_LIST.find((stage) => stage.id === currentStageId)?.name ?? ''}</h2><p>경험치 +${result.xp} · 획득 골드 ${result.gold}G${result.goldLost ? ` · 손실 ${result.goldLost}G` : ''}</p><p>획득 장비 ${outcome === 'clear' ? result.items.length : 0}개${autoSold ? ` · 가방 초과 자동 판매 +${autoSold}G` : ''}</p>${progression}${earnedItems}${result.lostItems?.length ? `<p>두고 온 장비: ${result.lostItems.map((item) => itemName(item)).join(', ')}</p>` : ''}${saved ? `<p>현재 Lv.${character.level} · 골드 ${character.gold}G</p><button id="result-return" class="primary">여관으로</button>` : '<p class="settlement-error" data-settlement-error></p><button id="result-retry" class="primary">다시 시도</button><button id="result-discard">포기하고 여관으로 (보상 손실)</button>'}`;
  if (!saved) {
    resultContent.querySelector('[data-settlement-error]').textContent = `정산 실패: ${error?.message ?? String(error)}`;
    $('#result-retry').addEventListener('click', () => attemptSettlement(outcome, result, settlementId), { once: true });
    $('#result-discard').addEventListener('click', enterHub, { once: true });
  } else {
    $('#result-return').addEventListener('click', enterHub, { once: true });
  }
  resultPanel.hidden = false;
}

async function attemptSettlement(outcome, result, settlementId) {
  let autoSold = 0;
  try {
    await reloadCharacter();
    const settlement = buildSettlement(outcome, result);
    autoSold = settlement.autoSold;
    character = await saves.commit({
      characterId: character.id,
      baseRev: character.rev,
      ops: settlement.ops,
      idempotencyKey: settlementId,
    });
    inventory = await saves.listItems(character.id);
    renderSettlement(outcome, result, { autoSold });
  } catch (error) {
    console.error('Settlement failed', error);
    renderSettlement(outcome, result, { autoSold, error });
  }
}

async function settleStage(outcome = world?.outcome, result = world?.result, idempotencyKey = null) {
  if (!world || !result || settled) return;
  settled = true;
  loop?.pause();
  settlementId = idempotencyKey ?? crypto.randomUUID();
  await attemptSettlement(outcome, result, settlementId);
}

createForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = new FormData(createForm).get('name');
  const id = crypto.randomUUID();
  await saves.commit({ characterId: id, baseRev: 0, ops: [{ type: 'createCharacter', name, kind: 'knight' }] });
  await refreshTitle();
});
$('#start-button').addEventListener('click', () => enterHub().catch((error) => { console.error(error); $('#toast').textContent = '여관을 열지 못했습니다.'; }));
$('#pause-button').addEventListener('click', () => {
  if (world?.mode !== 'stage') return;
  pauseMenu.hidden = false;
  if (!partyClient) loop?.pause();
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
$('#mute-button').addEventListener('click', (event) => {
  soundMuted = !soundMuted;
  audio.setMuted(soundMuted);
  event.currentTarget.textContent = soundMuted ? '소리 켜기' : '소리 끄기';
});
$('#hub-ui').addEventListener('click', async (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  audio.play('click');
  if (button.hasAttribute('data-party-create')) { connectParty(); return; }
  if (button.hasAttribute('data-party-ready')) {
    const local = partyClient?.lobby?.players?.find((member) => member.playerId === partyClient.playerId);
    partyClient?.setReady(!local?.ready);
    return;
  }
  if (button.hasAttribute('data-party-start')) { partyClient?.start(); return; }
  if (button.hasAttribute('data-party-close')) {
    partyClient?.close();
    partyClient = null;
    renderPanel('board');
    return;
  }
  if (button.dataset.panel) renderPanel(button.dataset.panel);
  if (button.hasAttribute('data-close')) hubPanel.hidden = true;
  if (button.dataset.sortie) startStage(button.dataset.sortie);
  if (button.dataset.compare) renderPanel('inventory', button.dataset.compare);
  if (button.dataset.equip) {
    await applyOps([{ type: 'equip', uid: button.dataset.equip, slot: button.dataset.slot }]);
    renderPanel(hubPanel.dataset.kind);
  }
  if (button.dataset.unequip) {
    await applyOps([{ type: 'unequip', slot: button.dataset.unequip }]);
    renderPanel(hubPanel.dataset.kind);
  }
  if (button.dataset.sell) {
    await applyOps([{ type: 'sellItem', uid: button.dataset.sell }]);
    renderPanel(hubPanel.dataset.kind);
  }
  if (button.dataset.enhance) {
    const roll = crypto.getRandomValues(new Uint32Array(1))[0] % 10000;
    await applyOps([{ type: 'enhanceItem', uid: button.dataset.enhance, roll }]);
    renderPanel('blacksmith');
  }
  if (button.hasAttribute('data-buy-potion')) {
    await applyOps([{ type: 'buyPotion', count: 1 }]);
    renderPanel('merchant');
  }
});
hubUi.addEventListener('submit', (event) => {
  if (event.target.id !== 'party-join-form') return;
  event.preventDefault();
  try { connectParty($('#party-code').value); } catch (error) { $('#toast').textContent = error.message; }
});
hubPanel.addEventListener('change', (event) => {
  if (event.target.id === 'party-stage-select') partyClient?.selectStage(event.target.value);
});
gameScreen.addEventListener('click', (event) => {
  const station = event.target.closest('.npc-hotspot');
  if (!station || world?.mode !== 'hub') return;
  audio.play('click');
  renderPanel(station.dataset.panel);
});
window.addEventListener('pointerdown', (event) => {
  if (event.pointerType === 'touch') document.documentElement.classList.add('touch-mode');
}, { passive: true });
window.addEventListener('keydown', (event) => {
  handlePauseKey(event.code, { loop, partyClient, world, pauseMenu });
});

saves = await createSaveRepository();
await refreshTitle();
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
      }]);
      return uid;
    },
    async grantDevGold(amount = 500) { await applyOps([{ type: 'grantGold', amount }]); return character.gold; },
    addLoot(item = {}) {
      const player = world.entities.find((entry) => entry.kind === 'player');
      const entity = {
        id: world.nextEntityId++,
        kind: 'loot',
        lootType: item.lootType ?? 'item',
        x: item.x ?? player?.x ?? 0,
        z: item.z ?? player?.z ?? 0,
        radius: 0.18,
        item: item.lootType === 'gold' ? null : { itemId: item.itemId ?? 'rusted-sword', rarity: item.rarity ?? 'rare' },
        gold: item.lootType === 'gold' ? item.gold ?? 50 : 0,
      };
      world.entities.push(entity);
      return entity;
    },
    async reloadSave() { await reloadCharacter(); return { character, inventory }; },
  };
}
