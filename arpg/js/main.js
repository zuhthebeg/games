import { victoryResultDelay } from './ui/victory-result-delay.js';
import { playerForm } from './content/player-lineages.js';
import { Application } from '../vendor/pixi-8.22.0.min.mjs';
import { createWorld, addPlayer, startStage, step, setLoad } from './sim/world.js';
import { CoopLobby, roomEntry } from './net/lobby.js';
import { equipmentVisual } from './render/paperdoll-state.js';
import { emptyInput } from './sim/world.js';
import { selectThreat, unlockedThreat } from './meta/run.js';
import { availableStages, arrivalNotice } from './content/world-map.js';
import { STAGES } from './content/combat.js';
import { TICK_MS } from './sim/core.js';
import { InputLayer } from './input.js';
import { applyAutoUse, autoUseSettings } from './meta/auto-use.js';
import { loadoutOf } from './meta/skills.js';
import { masteryLevels, setMasteryLevel } from './meta/skill-mastery.js';
import { CombatAudio, bindAudioControls } from './audio.js';
import { bindBattleSettings } from './ui/battle-settings.js';
import { ArenaRenderer } from './render/renderer.js';
import { HUD } from './ui/hud.js';
import { HubUI, restoreInnVitals } from './ui/hub.js';
import { CharacterStores } from './meta/selected-character.js';
import { installKnightPresentation, showKnightArtStatus, HUMAN_PRESENTATIONS, ORIGINAL_PRESENTATIONS } from './solo/knight-presentation.js';
import { equippedItem, ITEMS } from './meta/items.js';
import { buildRoundMods, createTracker, trackRound, usedConsumables, settleRound, settleInvasion, emptyLoot, currentLoad } from './meta/run.js';

let world = null;
let running = false;
let hidden = document.hidden;
let accumulator = 0;
let lastTime = performance.now();
let tracker = null;
let roundSave = null;
let developmentRound = false;
let debug = null;
let undead = null;
let undeadEncounter = null;
let undeadStarting = false;
let undeadHuman = null;
let undeadRendererChanged = false;
let roundOwner = null;
let restoreKnightArt = null;
let coop = null;
let coopSession = null;
let coopResult = null;
let coopNote = '';
let coopLoad = 0;
let coopRenderReady = false;
let coopFinished = false;

// Live read-only debug view. Even nested objects cannot mutate authoritative simulation/meta state.
const proxies = new WeakMap();
function readonly(value) {
  if (!value || typeof value !== 'object') return value;
  if (!proxies.has(value)) {
    proxies.set(value, new Proxy(value, {
      get: (target, key) => readonly(Reflect.get(target, key)),
      set() { throw new TypeError('read-only simulation'); },
      deleteProperty() { throw new TypeError('read-only simulation'); },
      defineProperty() { throw new TypeError('read-only simulation'); },
      getOwnPropertyDescriptor(target, key) {
        const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
        if (descriptor?.configurable && 'value' in descriptor) descriptor.value = readonly(descriptor.value);
        return descriptor;
      },
      preventExtensions() { throw new TypeError('read-only simulation'); },
      setPrototypeOf() { throw new TypeError('read-only simulation'); },
    }));
  }
  return proxies.get(value);
}

try {
  const characters = new CharacterStores(localStorage);
  const store = { load: () => characters.selectHuman(), save: save => characters.persist(save), reset: () => characters.reset() };
  const bootQuery = new URLSearchParams(location.search);
  const { soloSelected, legacyEntry } = roomEntry(bootQuery);
  // Human loading may quarantine old/corrupt bytes: defer until human is selected.
  const saved = legacyEntry ? store.load() : null;
  const app = new Application();
  await app.init({
    resizeTo: window,
    autoDensity: true,
    resolution: Math.min(devicePixelRatio || 1, 2),
    preference: 'webgl',
    background: 0x0b1010,
    antialias: false,
    autoStart: false,
  });
  document.querySelector('#surface').appendChild(app.canvas);
  const renderer = new ArenaRenderer(app);
  const input = new InputLayer(
    document.querySelector('#surface'),
    document.querySelector('#actions'),
    (x, y, vector) => renderer.aim(x, y, vector),
  );
  input.setAutoAttack(input.autoAttack);
  // Auto potions/return become ordinary edges for the local pawn; manual input still wins.
  const combatInput = player => applyAutoUse(input.consume(), player, autoUseSettings(hub.save));
  const coopLocalPlayer = () => {
    if (!coopSession || coopSession.phase !== 'running') return null;
    const own = view => view?.entities.find(e => e.kind === 'player' && e.pid === coopSession.uid) || null;
    if (coopSession.isHost) return own(coopSession.world);
    const prediction = coopSession.prediction;
    return prediction.enabled && prediction.state ? prediction.state : own(coopSession.buffer.frames.at(-1)?.world);
  };
  const hud = new HUD();
  const audio = new CombatAudio();
  bindAudioControls(audio, document);
  bindBattleSettings(document, input);
  const resultPresentation = victoryResultDelay();
  window.addEventListener('pagehide', () => resultPresentation.cancel());
  const hub = new HubUI({
    save: saved,
    recoverVitals: () => restoreInnVitals(world?.entities[0]),
    canInteract: () => !undead && !undeadStarting,
    persist: (save) => {
      if (undead || undeadStarting) throw new Error('언데드 디버그 저장 금지');
      store.save(save);
    },
    resetSave: () => {
      if (undead || undeadStarting) { leaveUndead(); return; }
      store.reset();
      world = null;
      renderer.root.visible = false;
    },
    onOverlay: () => {
      resultPresentation.cancel();
      input.reset();
      input.enabled = false;
      renderer.root.visible = false;
      renderer.warning.visible = false;
    },
    startRound: (stageId, reduced, overrideWeapon) => {
      if (undead || undeadStarting) return;
      resultPresentation.cancel();
      characters.assertOwner();
      roundOwner = characters.active;
      closeCoop();
      audio.stop();
      input.reset();
      roundSave = structuredClone(hub.save);
      developmentRound = Boolean(overrideWeapon);
      const seed = developmentRound ? 11 : crypto.getRandomValues(new Uint32Array(1))[0];
      world = createWorld({ seed, arena: { w: 1400, h: 860 } });
      const weapon = overrideWeapon || ITEMS[equippedItem(roundSave, 'weapon').id].family;
      addPlayer(world, { pid: 'local', weapon, skillMasteryLevels: masteryLevels(roundSave), mods: buildRoundMods(roundSave) });
      const knight = roundSave.lineage === 'skeleton_knight';
      if (knight) { restoreKnightArt?.(); restoreKnightArt = installKnightPresentation(renderer.provider, roundSave); }
      if (!knight) { restoreKnightArt?.(); restoreKnightArt = null; }
      startStage(world, stageId, knight ? { playerSide: 'right' } : {});
      if (knight) world.round.presentation = { lineage: 'skeleton_knight', form: playerForm(roundSave), humans: HUMAN_PRESENTATIONS, originals: ORIGINAL_PRESENTATIONS };
      tracker = createTracker(seed);
      const load = currentLoad(roundSave, tracker);
      setLoad(world, 'local', load.ratio);
      renderer.reset(world, reduced, roundSave);
      renderer.root.visible = true;
      renderer.warning.visible = true;
      input.enabled = true;
      hud.begin(world, loadoutOf(roundSave));
      showArrival(roundSave, stageId);
      hud.meta(load, tracker, roundSave);
      running = true;
      accumulator = 0;
      lastTime = performance.now();
    },
  });
  // Preserve the existing HUD nodes/listeners (including InputLayer button references).
  // Replacing innerHTML here would silently disconnect the original human controls.
  function rememberHud(node) {
    if (!node) return () => {};
    const children = [...node.childNodes];
    const restoreChildren = children.map(rememberHud);
    const attributes = node.attributes && [...node.attributes].map(a => [a.name, a.value]);
    const text = node.nodeValue;
    return () => {
      if (attributes) {
        for (const a of [...node.attributes]) node.removeAttribute(a.name);
        for (const [name, value] of attributes) node.setAttribute(name, value);
        node.replaceChildren(...children);
      } else node.nodeValue = text;
      for (const restore of restoreChildren) restore();
    };
  }
  function rememberHuman() {
    const previous = { world, running, tracker, roundSave, roundOwner, developmentRound, accumulator };
    const rootHidden = hub.root.hidden, inert = hub.root.inert, enabled = input.enabled;
    const visible = renderer.root.visible, warning = renderer.warning.visible, reduced = renderer.reduced;
    const stage = hud.stage, noticeLeft = hud.noticeLeft;
    const restoreHud = rememberHud(document.querySelector('#hud'));
    const restorePause = rememberHud(document.querySelector('#pause'));
    return () => {
      ({ world, running, tracker, roundSave, roundOwner, developmentRound, accumulator } = previous);
      lastTime = performance.now();
      try {
        if (undeadRendererChanged) {
          const idle = world || createWorld();
          if (!world) addPlayer(idle, { pid: 'local' });
          renderer.reset(idle, reduced, roundSave);
        }
      } finally {
        undeadRendererChanged = false;
        renderer.root.visible = visible; renderer.warning.visible = warning;
        restoreHud(); restorePause(); hud.stage = stage; hud.noticeLeft = noticeLeft;
        hub.root.hidden = rootHidden; hub.root.inert = inert;
        input.reset(); input.enabled = enabled;
      }
    };
  }
  async function startUndead() {
    if (undeadStarting) return false;
    if (!undead && (running || coop)) throw new Error('인간 전투/멀티플레이를 끝내고 여관에서 시작하세요.');
    const attempt = {}; // Identity owns both continuation and finally; cancellation never reuses it.
    undeadStarting = attempt;
    if (!undeadHuman) undeadHuman = rememberHuman();
    hud.clearUndeadResult();
    hub.root.hidden = true; hub.root.inert = true;
    input.reset(); input.enabled = false; debug?.reset();
    let session = undead;
    try {
      if (!session) {
        const { createUndeadSession } = await import('./debug/undead-start.js');
        if (undeadStarting !== attempt) return false;
        session = createUndeadSession(renderer.provider);
      }
      const encounter = session.restart();
      undeadRendererChanged = true;
      renderer.reset(encounter.world, matchMedia('(prefers-reduced-motion: reduce)').matches, session.save);
      renderer.root.visible = renderer.warning.visible = false;
      hud.begin(encounter.world, loadoutOf(session.save));
      hud.meta(currentLoad(session.save, createTracker(0)), createTracker(0), session.save);
      hud.nodes['stage-name'].textContent = '언데드 · 해골 · 저장 안 됨';
      hud.nodes.notice.textContent = '디버그 고정 프리셋 · 솔로 1전투 · 회피 미지원 · 보상/저장 없음';
      hud.noticeLeft = Infinity;
      // Exercise the first render inside the transaction, not in the next RAF.
      renderer.render(encounter.world, 0, 0);
      audio.stop();
      undead = session; undeadEncounter = encounter; world = encounter.world;
      roundSave = session.save; tracker = null; developmentRound = false;
      accumulator = 0; lastTime = performance.now(); running = true;
      return true;
    } catch (error) {
      if (undeadStarting !== attempt) return false;
      if (undead) audio.stop(); // A failed active restart may still have encounter voices.
      hud.clearUndeadResult();
      session?.leave(); undead = null; undeadEncounter = null;
      const restore = undeadHuman; undeadHuman = null;
      try { restore?.(); } catch (restoreError) { error.cause = restoreError; }
      throw error;
    } finally {
      if (undeadStarting === attempt) undeadStarting = false;
    }
  }
  function leaveUndead() {
    // Invalidate even when import is unresolved and no session exists yet.
    undeadStarting = false;
    if (!undeadHuman && !undead) return;
    const session = undead;
    hud.clearUndeadResult();
    undead = null; undeadEncounter = null;
    input.reset(); input.enabled = false; debug?.reset();
    if (session) { audio.stop(); session.leave(); }
    const restore = undeadHuman; undeadHuman = null;
    restore?.();
  }
  function frameUndead(elapsed) {
    const ready = renderer.views.size === 2 && [...renderer.views.values()].every(v => v.visual.debug.mode === 'atlas');
    const state = undead.state(undeadEncounter);
    renderer.root.visible = ready;
    input.enabled = ready && state === 'running' && !document.querySelector('#arpg-debug-panel:not([hidden])');
    if (!ready) {
      input.reset(); accumulator = 0;
      hud.nodes.notice.textContent = Object.keys(renderer.provider.atlases.status().failed).length
        ? '필수 아틀라스 실패 · 전투 중지 · 인간으로 돌아가세요' : '아틀라스 준비 중';
    } else {
      hud.nodes.notice.textContent = state === 'running' ? '디버그 고정 프리셋 · 솔로 1전투 · 회피 미지원 · 보상/저장 없음'
        : state === 'victory' ? '해골 승리 · 아래에서 다음 전투 또는 인간 복귀'
        : '전투 종료 · 아래에서 다시 시작 또는 인간 복귀';
      accumulator += elapsed;
      let count = 0;
      while (accumulator >= TICK_MS && count++ < 5 && undead.state(undeadEncounter) === 'running') {
        renderer.snapshot(world);
        const events = step(world, { local: input.enabled ? input.consume() : emptyInput() });
        renderer.events(world, events); hud.events(events);
        audio.events(events, world.entities[0].id, Object.freeze(world.entities.map(e => Object.freeze({ id: e.id, kind: e.kind, type: e.type, weaponForm: e.weaponForm }))));
        accumulator -= TICK_MS;
      }
      if (undead.state(undeadEncounter) !== 'running') { input.reset(); input.enabled = false; accumulator = 0; }
      if (accumulator >= TICK_MS) accumulator %= TICK_MS;
    }
    const result = undead.state(undeadEncounter);
    if (ready && result !== 'running') {
      input.reset(); input.enabled = false; accumulator = 0;
      const retry = () => startUndead().catch(error => hub.error(error.message));
      hud.showUndeadResult(result, { next: retry, restart: retry, leave: leaveUndead });
      const presentation = undead.presentation(world);
      renderer.snapshot(presentation);
      renderer.events(presentation, []);
      renderer.render(presentation, 1, elapsed / 1000);
    } else renderer.render(world, accumulator / TICK_MS, elapsed / 1000);
    hud.update(world, elapsed / 1000);
  }
  function closeCoop() {
    coop?.close(); coop = null; coopSession = null;
    document.querySelector('#coop-status').hidden = true;
  }
  function settleCoopPlayer() {
    if (coopResult || !world) return;
    const player = world.entities[0];
    if (!player.terminal) return;
    if (world.round.invasion && !world.invasionAccount?.terminal) return;
    coopResult = world.round.invasion ? settleInvasion(roundSave, world.invasionAccount) : settleRound(roundSave, {
      stageId: world.round.stageId, terminal: player.terminal,
      depositedXp: tracker.depositedXp, tempLoot: tracker.tempLoot, used: usedConsumables(roundSave, player), skillMastery: tracker.skillMastery,
    });
    characters.persist(coopResult.save, roundOwner);
    input.reset(); input.enabled = false;
  }
  function finishCoop() {
    if (coopFinished) return;
    if (!coopResult) settleCoopPlayer();
    if (!coopResult) return;
    coopFinished = true;
    running = false;
    if (world.round.objective?.kind === 'kill-target') hud.update(world, 0);
    const cause = hud.deathExplanation(world);
    resultPresentation.schedule(coopResult.receipt, () => {
      hub.finish(coopResult.save, coopResult.receipt, cause);
      if (coopNote) {
        const note = document.createElement('p'); note.className = 'risk-note'; note.textContent = coopNote;
        hub.root.prepend(note);
      }
    }, performance.now());
  }
  // Presentation only; no new sim event or save schema. Cleared maps retain historical replay state.
  const arrivedMaps = new Set();
  function showArrival(save, stageId) {
    const seen = arrivedMaps.has(stageId);
    arrivedMaps.add(stageId);
    hud.nodes.notice.textContent = arrivalNotice(seen ? { cleared: { [stageId]: true } } : save, stageId);
    hud.noticeLeft = 4;
  }
  function startCoop(stageId, threat) {
    if (undead || undeadStarting) throw new Error('먼저 인간으로 돌아가세요. 언데드 디버그는 솔로 전용입니다.');
    closeCoop();
    if (!hub.save) return;
    characters.assertOwner();
    resultPresentation.cancel();
    roundOwner = characters.active;
    // The host chooses on the existing departure panel; guests retain their own build/save.
    const localSave = structuredClone(hub.save);
    localSave.activeInvasion = crypto.randomUUID();
    const weapon = ITEMS[equippedItem(localSave, 'weapon').id].family;
    const load = currentLoad(localSave, createTracker(0));
    const boneParts = ['weapon','head','body','hands','feet'].map(slot => equippedItem(localSave, slot)?.id);
    const profile = { ...(boneParts.every(id=>ITEMS[id]?.boneSet) ? { boneParts } : {}), lineage: localSave.lineage || 'human', role: localSave.lineage === 'skeleton_knight' ? 'invader' : 'hunter', rewardSave: localSave, name: localSave.name, level: localSave.level, weapon,
      mods: buildRoundMods(localSave), skillMasteryLevels: masteryLevels(localSave), equipmentVisual: equipmentVisual(localSave, weapon), load: load.ratio,
      threats: Object.fromEntries(Object.keys(STAGES).map(id => [id, unlockedThreat(localSave, id)])),
      stages: availableStages(localSave) };
    coopResult = null; coopNote = ''; coopRenderReady = false; coopFinished = false; developmentRound = false;
    world = null; tracker = null; roundSave = null;
    running = false; input.reset(); input.enabled = false; renderer.root.visible = false;
    const profileOwner = characters.active;
    let lobby;
    const ownsLobby = () => characters.active === profileOwner && coop === lobby;
    coop = lobby = new CoopLobby({ profile, config: { stageId, threat: stageId === 'S1' ? 1 : threat },
      onSession: session => {
        if (!ownsLobby()) return;
        coopSession = session; guestTime = performance.now();
        hub.root.hidden = false; hub.root.replaceChildren();
        const panel = document.createElement('div'); panel.className = 'story-panel';
        const message = document.createElement('p'); message.id = 'coop-preparing'; message.textContent = '동료의 빌드를 동기화하는 중…';
        const leave = document.createElement('button'); leave.textContent = '나가기'; leave.onclick = () => { closeCoop(); hub.showBoard(); };
        panel.append(message, leave); hub.root.append(panel);
      },
      onStatus: message => { if (!ownsLobby()) return; const node = document.querySelector('#coop-preparing'); if (node) node.textContent = message; },
      onLeave: () => { if (!ownsLobby()) return; closeCoop(); hub.showBoard(); },
      onBegin: config => {
        if (!ownsLobby()) return;
        if (config.invasion) { characters.persist(localSave, roundOwner); hub.save = localSave; }
        else delete localSave.activeInvasion;
        roundSave = selectThreat(localSave, config.stageId, config.threat);
        tracker = createTracker(crypto.getRandomValues(new Uint32Array(1))[0]);
        coopLoad = currentLoad(roundSave, tracker).ratio;
        hub.root.hidden = true; audio.stop(); input.reset(); running = true;
      },
      onBeforeTick: view => { if (ownsLobby()) renderer.snapshot(view); },
      onEvents: (view, events) => {
        if (!ownsLobby() || coopFinished || hidden || !coopRenderReady) return;
        renderer.events(view, events);
        audio.events(events, view.entities[0].id, Object.freeze(view.entities.map(e => Object.freeze({ id: e.id, kind: e.kind, type: e.type, weaponForm: e.weaponForm }))));
        hud.events(events.filter(e => e.id === view.entities[0].id));
      },
      onResync: view => {
        if (ownsLobby() && coopRenderReady) renderer.reset(view, matchMedia('(prefers-reduced-motion: reduce)').matches);
      },
      onFrame: (view, events, { silent = false, presentation = events } = {}) => {
        if (!ownsLobby()) return;
        if (coopFinished) return;
        world = view;
        if (!coopRenderReady) {
          renderer.reset(view, matchMedia('(prefers-reduced-motion: reduce)').matches);
          renderer.root.visible = renderer.warning.visible = true;
          hud.begin(view, loadoutOf(roundSave)); showArrival(roundSave, view.round.stageId); input.enabled = true; coopRenderReady = true;
        }
        let progress;
        if (view.round.invasion) {
          const account = view.invasionAccount;
          if (!account) return; // Never fall back to client-rolled rewards.
          tracker = { ...tracker, tempLoot: structuredClone(account.tempLoot), depositedXp: account.depositedXp, skillMastery: account.skillMastery };
          progress = { tracker, fx: [], load: currentLoad(roundSave, tracker, usedConsumables(roundSave, view.entities[0])) };
        } else progress = trackRound(roundSave, tracker, events, usedConsumables(roundSave, view.entities[0]), view, coopSession.uid);
        tracker = progress.tracker; coopLoad = progress.load.ratio;
        if (coopSession.isHost) setLoad(coopSession.world, coopSession.uid, coopLoad);
        if (!silent && !hidden) renderer.events(view, [...presentation, ...progress.fx]);
        if (!silent && !hidden) audio.events(presentation, view.entities[0].id, Object.freeze(view.entities.map(e => Object.freeze({ id: e.id, kind: e.kind, type: e.type, weaponForm: e.weaponForm }))));
        if (!silent && !hidden) hud.events([...presentation.filter(e => e.id === view.entities[0].id || e.type === 'drop'), ...progress.fx]);
        hud.meta(progress.load, tracker, roundSave);
        settleCoopPlayer();
        if (view.round.state !== 'running') finishCoop();
      },
      onLost: message => {
        if (!ownsLobby()) return;
        if (!world || !tracker) {
          closeCoop(); hub.showBoard();
          const note = document.createElement('p'); note.className = 'risk-note'; note.textContent = message; hub.root.prepend(note);
          return;
        }
        coopNote = message;
        if (world.round.invasion && !coopResult) {
          tracker.tempLoot = emptyLoot(); // Host loss never grants cached or guessed ownership.
          world.invasionAccount = { token: roundSave.activeInvasion, stageId: world.round.stageId,
            role: profile.role, terminal: 'return_scroll', tempLoot: emptyLoot(), depositedXp: 0,
            used: usedConsumables(roundSave, world.entities[0]), skillMastery: {} };
          coopNote = '방장 연결 종료: 미확정 전리품은 확보하지 못했습니다. 원래 소지품과 장비는 유지됩니다.';
        }
        if (!world.entities[0].terminal) world.entities[0].terminal = 'return_scroll';
        settleCoopPlayer(); finishCoop(); closeCoop();
      },
    });
    coop.open();
  }
  hub.startCoop = startCoop;
  let coopPageHidden = false;
  window.addEventListener('pagehide', event => { if (coop) { if (event.persisted) coopSession?.suspend(); else { coopPageHidden = true; running = false; closeCoop(); } } });
  window.addEventListener('pageshow', event => { if (event.persisted && coopSession) resumeCoop(); else if (event.persisted && coopPageHidden) { coopPageHidden = false; hub.showInn(); } });
  const coopStatus = document.createElement('div'); coopStatus.id = 'coop-status'; coopStatus.hidden = true;
  document.querySelector('#hud').append(coopStatus);
  // Network ticks continue while a phone/tab is backgrounded. Single-player pause remains unchanged.
  let netTime = performance.now(), guestTime = netTime;
  setInterval(() => {
    const now = performance.now(), elapsed = now - netTime; netTime = now;
    if (coopSession?.isHost) coopSession.update(elapsed, hidden || !input.enabled ? emptyInput() : combatInput(coopLocalPlayer()), coopLoad);
    else if (coopSession && hidden) {
      coopSession.update(now - guestTime, emptyInput(), coopLoad); guestTime = now;
    }
  }, TICK_MS);
  function resumeCoop() {
    const now = performance.now(); netTime = guestTime = lastTime = now;
    accumulator = 0; input.reset(); audio.stop(); coop?.resume();
  }
  document.addEventListener('click', event => {
    if (event.target.closest('[data-action="result-inn"]') && coop) closeCoop();
  });
  Object.defineProperty(window, '__arpg', {
    value: Object.freeze({
      get world() { return readonly(world); },
      get mode() { return undead ? 'undead-debug' : characters.active?.slot || 'human'; },
      get character() { return readonly(undead?.save || hub.save); },
      get multi() { return readonly(coopSession ? {
        uid: coopSession.uid, host: coopSession.host, isHost: coopSession.isHost,
        phase: coopSession.phase, ownsSim: !!coopSession.world, rtt: coopSession.rtt,
        bytes: coopSession.bytes, snapshots: coopSession.snapshots, resync: coopSession.resumeStats, awaitingResync: coopSession.awaitingResync,
        telegraphs: renderer.telegraphs.length, views: renderer.views.size,
        prediction: coopSession.prediction.diagnostics(), delay: coopSession.buffer.delay,
        displayed: coopSession.view()?.entities.map(e => ({ id: e.id, pid: e.pid, kind: e.kind, x: e.x, y: e.y })),
      } : null); },
      get save() { return readonly(hub.save); },
      get tracker() { return readonly(tracker); },
      get feedback() {
        return readonly({
          trauma: renderer.trauma, slowLeft: renderer.slowLeft,
          frozen: [...renderer.views].filter(([, view]) => view.anim.frozen).map(([id]) => id),
          particles: renderer.particles.filter(particle => particle.left > 0).length,
          pools: { particles: renderer.particles.length, numbers: renderer.numbers.length, effects: renderer.effects.length },
          fxRequested: renderer.skillVfx.fxRequested,
          mastery: renderer.skillVfx.status(),
          audio: { muted: audio.muted, state: audio.context?.state || 'locked', loaded: [...audio.buffers.keys()], voices: audio.voices.size },
        });
      },
      get art() {
        return readonly({
          ...renderer.provider.atlases.status(),
          visuals: [...renderer.views].map(([id, view]) => ({ id, ...view.visual.debug, entityId:id,
            outerScale: {x:view.visual.container.scale.x,y:view.visual.container.scale.y},
            displayBounds: (()=>{const b=view.visual.container.getBounds();return {x:b.x,y:b.y,width:b.width,height:b.height};})(),
          })),
        });
      },
    }),
  });
  document.querySelector('#boot').hidden = true;
  hub.roomInvite = bootQuery.has('room');
  {
    // Debug legacy entry uses the same human slot; expose the real slot flow in every mode.
    const chooseUrl = character => {
      const url = new URL(location.href); url.searchParams.set('character', character);
      history.replaceState(null, '', url);
    };
    let humanDraftSelection = null;
    hub.initialCharacters = {
      human: () => {
        const save = characters.selectHuman();
        hub.equipmentNotice=characters.equipmentNotice;
        restoreKnightArt?.(); restoreKnightArt = null;
        world = null; running = false; tracker = null; roundSave = null; roundOwner = null;
        chooseUrl('human'); return save;
      },
      read: (fromQuiz = false) => {
        const owner = characters.active, notice = hub.equipmentNotice;
        const save = characters.selectKnight({ persistRepairs: !fromQuiz });
        if (fromQuiz) humanDraftSelection = { owner, notice };
        hub.equipmentNotice=characters.equipmentNotice;
        world = null; running = false; tracker = null; roundSave = null; roundOwner = null;
        chooseUrl('skeleton_knight'); return save;
      },
      cancel: () => {
        characters.active = humanDraftSelection.owner;
        characters.equipmentNotice = hub.equipmentNotice = humanDraftSelection.notice;
        chooseUrl('human');
      },
      create: options => { const save = characters.createKnight(options); chooseUrl('skeleton_knight'); return save; },
    };
    // Keep debug's direct human/intro startup, without hiding real character selection.
    if (legacyEntry) {
      if (hub.save) hub.showInn(); else hub.showIntro();
    } else {
      hub.ready();
      if (soloSelected) {
        try { hub.action('choose-knight', {}); } catch (error) { hub.error(error.message); }
      } else if (bootQuery.get('character') === 'human') hub.action('choose-human', {});
    }
  }

  const debugQuery = new URLSearchParams(location.search).get('dev') === '1' ? '1' : new URLSearchParams(location.search).get('debug');
  let debugEnabled = debugQuery === '1';
  try {
    if (debugQuery === '0' || debugQuery === '1') localStorage.setItem('arpg.debug', debugQuery);
    debugEnabled = debugQuery === '1' || (debugQuery !== '0' && localStorage.getItem('arpg.debug') === '1');
  } catch { /* Storage denied: explicit URL still works. */ }
  if (debugEnabled) {
    const { mountDebug } = await import('./debug/index.js');
    debug = mountDebug({ hub, store, renderer, input, startUndead, leaveUndead,
      get undead() { return !!undead || !!undeadStarting; },
      get undeadStarting() { return !!undeadStarting; },
      setMastery: (id, level) => {
        if (undead || undeadStarting) throw new Error('언데드 디버그는 저장/숙련 수정 불가');
        const next = setMasteryLevel(hub.save, id, level);
        store.save(next); hub.save = next;
        if (roundSave) roundSave = { ...roundSave, skillMastery: { ...next.skillMastery } };
        const pid = coopSession?.uid || 'local';
        renderer.skillVfx.setMastery(pid, masteryLevels(next));
        if (coopSession) coopSession.setMastery(masteryLevels(next));
        else { const pawn = world?.entities.find(e => e.pid === pid); if (pawn) pawn.skillMasteryLevels = masteryLevels(next); }
        if (!running) hub.showInn();
      },
      get world() { return world; }, get save() { return hub.save; },
      get coop() { return !!coop; },
      get running() { return running; }, get tracker() { return tracker; } });
  }
  const inputs = { local: null };
  document.addEventListener('visibilitychange', () => {
    hidden = document.hidden;
    accumulator = 0;
    lastTime = performance.now();
    input.reset();
    if (hidden) { audio.stop(); coopSession?.suspend(); }
    else if (coopSession) resumeCoop();
    hud.pause(hidden && running && !coopSession);
  });

  function finishRound() {
    if (undead) return;
    const terminalAt = performance.now();
    running = false;
    input.reset(); input.enabled = false;
    accumulator = 0;
    const player = world.entities[0];
    const result = settleRound(roundSave, {
      stageId: world.round.stageId,
      terminal: player.terminal,
      depositedXp: tracker.depositedXp,
      tempLoot: tracker.tempLoot,
      skillMastery: tracker.skillMastery,
      used: usedConsumables(roundSave, player),
    });
    // Development kit overrides never grant progression or consume real supplies.
    const nextSave = developmentRound ? hub.save : result.save;
    characters.persist(nextSave, roundOwner);
    if (world.round.objective?.kind === 'kill-target') hud.update(world, 0);
    const cause = hud.deathExplanation(world);
    resultPresentation.schedule(result.receipt, () => hub.finish(nextSave, result.receipt, cause), terminalAt);
    if (result.receipt.levelsGained > 0) audio.play('level-up');
  }

  function frame(now) {
    if (coopSession && !hidden && now - lastTime > 1000) resumeCoop();
    const elapsed = Math.min(250, Math.max(0, now - lastTime));
    lastTime = now;
    if (undead) {
      if (!hidden) frameUndead(elapsed);
      debug?.frame(now);
      if (!hidden) app.render();
      requestAnimationFrame(frame);
      return;
    }
    resultPresentation.update(now);
    if (coopSession && !coopSession.isHost && !hidden) {
      coopSession.update(Math.max(0, now - guestTime), !input.enabled ? emptyInput() : combatInput(coopLocalPlayer()), coopLoad); guestTime = now;
    }
    if (coopSession && running && coopRenderReady && !hidden) {
      const renderNow = coopSession.isHost ? coopSession.now + Math.max(0, now - netTime) : coopSession.now;
      const view = coopSession.view(renderNow);
      if (view) {
        if (!coopSession.isHost) renderer.snapshot(view);
        renderer.render(view, coopSession.isHost ? Math.min(1, (coopSession.tickLeft + Math.max(0, now - netTime)) / TICK_MS) : 1, elapsed / 1000);
        hud.update(world, elapsed / 1000);
        coopStatus.hidden = false;
        const player = world.entities[0];
        coopStatus.textContent = `${player.terminal ? '관전 · 개인 정산 완료 · ' : ''}${[...coopSession.players].length}인 · ${coopSession.isHost ? '방장' : `RTT ${coopSession.rtt === null ? '—' : Math.round(coopSession.rtt) + 'ms'}`}`;
      }
    } else if (!coopSession && !hidden && world && running) {
      accumulator += elapsed * (debug?.speed || 1);
      let count = 0;
      while (accumulator >= TICK_MS && count < 5) {
        debug?.beforeTick();
        renderer.snapshot(world);
        inputs.local = combatInput(world.entities[0]);
        const events = step(world, inputs);
        const progress = trackRound(roundSave, tracker, events, usedConsumables(roundSave, world.entities[0]), world, 'local');
        tracker = progress.tracker;
        setLoad(world, 'local', progress.load.ratio);
        renderer.events(world, [...events, ...progress.fx]);
        audio.events(events, world.entities[0].id, Object.freeze(world.entities.map(e => Object.freeze({ id: e.id, kind: e.kind, type: e.type, weaponForm: e.weaponForm }))));
        hud.events([...events, ...progress.fx]);
        hud.meta(progress.load, tracker, roundSave);
        accumulator -= TICK_MS;
        count++;
        if (world.round.state !== 'running') {
          try {
            finishRound();
          } catch (error) {
            document.querySelector('#boot').hidden = false;
            document.querySelector('#boot-error').textContent = `정산 저장 실패: ${error.message}`;
          }
          break;
        }
      }
      if (count === 5 && accumulator >= TICK_MS) accumulator %= TICK_MS;
      renderer.render(world, running ? accumulator / TICK_MS : 1, elapsed / 1000);
      if (running) hud.update(world, elapsed / 1000);
      showKnightArtStatus(hud, renderer.views.get(world.entities[0].id)?.visual.debug);
    } else if (!hidden && world && (resultPresentation.pending || (!coopSession && world.entities[0].terminal
      && ['death_knight','skeleton_knight'].includes(renderer.views.get(world.entities[0].id)?.visual.debug.presentation)))) {
      // Result UI owns settlement. Finish this kit's death/idle presentation
      // without stepping the terminal world, tracking loot or saving again.
      renderer.render(world, 1, elapsed / 1000);
    }
    debug?.frame(now);
    if (!hidden) app.render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
} catch (error) {
  document.querySelector('#boot-error').textContent = `초기화 실패: ${error.message}`;
  console.error(error);
}
