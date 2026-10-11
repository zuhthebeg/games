import { Application } from '../vendor/pixi-8.22.0.min.mjs';
import { createWorld, addPlayer, startStage, step, setLoad } from './sim/world.js';
import { CoopLobby } from './net/lobby.js';
import { equipmentVisual } from './render/paperdoll-state.js';
import { emptyInput } from './sim/world.js';
import { selectThreat, unlockedThreat } from './meta/run.js';
import { STAGES } from './content/combat.js';
import { TICK_MS } from './sim/core.js';
import { InputLayer } from './input.js';
import { CombatAudio, bindAudioControls } from './audio.js';
import { ArenaRenderer } from './render/renderer.js';
import { HUD } from './ui/hud.js';
import { HubUI, restoreInnVitals } from './ui/hub.js';
import { SaveStore } from './meta/save.js';
import { equippedItem, ITEMS } from './meta/items.js';
import { buildRoundMods, createTracker, trackRound, usedConsumables, settleRound, currentLoad } from './meta/run.js';

let world = null;
let running = false;
let hidden = document.hidden;
let accumulator = 0;
let lastTime = performance.now();
let tracker = null;
let roundSave = null;
let developmentRound = false;
let debug = null;
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
  const store = new SaveStore(localStorage);
  const saved = store.load();
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
  // Pointer-only toggle; tapping it must not leak into combat input.
  for (const node of document.querySelectorAll('[data-auto-toggle]')) {
    node.addEventListener('pointerdown', (event) => event.stopPropagation());
    node.addEventListener('click', () => input.setAutoAttack(!input.autoAttack));
  }
  input.setAutoAttack(input.autoAttack);
  const hud = new HUD();
  const audio = new CombatAudio();
  bindAudioControls(audio, document);
  const hub = new HubUI({
    save: saved,
    recoverVitals: () => restoreInnVitals(world?.entities[0]),
    persist: (save) => store.save(save),
    resetSave: () => {
      store.reset();
      world = null;
      renderer.root.visible = false;
    },
    onOverlay: () => {
      input.reset();
      input.enabled = false;
      renderer.root.visible = false;
      renderer.warning.visible = false;
    },
    startRound: (stageId, reduced, overrideWeapon) => {
      closeCoop();
      audio.stop();
      input.reset();
      roundSave = structuredClone(hub.save);
      developmentRound = Boolean(overrideWeapon);
      const seed = developmentRound ? 11 : crypto.getRandomValues(new Uint32Array(1))[0];
      world = createWorld({ seed, arena: { w: 1400, h: 860 } });
      const weapon = overrideWeapon || ITEMS[equippedItem(roundSave, 'weapon').id].family;
      addPlayer(world, { pid: 'local', weapon, mods: buildRoundMods(roundSave) });
      startStage(world, stageId);
      tracker = createTracker(seed);
      const load = currentLoad(roundSave, tracker);
      setLoad(world, 'local', load.ratio);
      renderer.reset(world, reduced, roundSave);
      renderer.root.visible = true;
      renderer.warning.visible = true;
      input.enabled = true;
      hud.begin(world);
      hud.meta(load, tracker);
      running = true;
      accumulator = 0;
      lastTime = performance.now();
    },
  });
  function closeCoop() {
    coop?.close(); coop = null; coopSession = null;
    document.querySelector('#coop-status').hidden = true;
  }
  function settleCoopPlayer() {
    if (coopResult || !world) return;
    const player = world.entities[0];
    if (!player.terminal) return;
    coopResult = settleRound(roundSave, {
      stageId: world.round.stageId, terminal: player.terminal,
      depositedXp: tracker.depositedXp, tempLoot: tracker.tempLoot, used: usedConsumables(roundSave, player),
    });
    store.save(coopResult.save);
    input.reset(); input.enabled = false;
  }
  function finishCoop() {
    if (coopFinished) return;
    if (!coopResult) settleCoopPlayer();
    if (!coopResult) return;
    coopFinished = true;
    running = false;
    hub.finish(coopResult.save, coopResult.receipt, hud.deathExplanation(world));
    if (coopNote) {
      const note = document.createElement('p'); note.className = 'risk-note'; note.textContent = coopNote;
      hub.root.prepend(note);
    }
  }
  function startCoop(stageId, threat) {
    closeCoop();
    if (!hub.save) return;
    // The host chooses on the existing departure panel; guests retain their own build/save.
    const localSave = structuredClone(hub.save);
    const weapon = ITEMS[equippedItem(localSave, 'weapon').id].family;
    const load = currentLoad(localSave, createTracker(0));
    const profile = { name: localSave.name, level: localSave.level, weapon,
      mods: buildRoundMods(localSave), equipmentVisual: equipmentVisual(localSave, weapon), load: load.ratio,
      threats: Object.fromEntries(Object.keys(STAGES).map(id => [id, unlockedThreat(localSave, id)])),
      stages: Object.keys(STAGES).filter((id, i, all) => i === 0 || localSave.cleared[all[i - 1]]) };
    coopResult = null; coopNote = ''; coopRenderReady = false; coopFinished = false; developmentRound = false;
    world = null; tracker = null; roundSave = null;
    running = false; input.reset(); input.enabled = false; renderer.root.visible = false;
    coop = new CoopLobby({ profile, config: { stageId, threat: stageId === 'S1' ? 1 : threat },
      onSession: session => {
        coopSession = session;
        hub.root.hidden = false; hub.root.replaceChildren();
        const panel = document.createElement('div'); panel.className = 'story-panel';
        const message = document.createElement('p'); message.id = 'coop-preparing'; message.textContent = '동료의 빌드를 동기화하는 중…';
        const leave = document.createElement('button'); leave.textContent = '나가기'; leave.onclick = () => { closeCoop(); hub.showBoard(); };
        panel.append(message, leave); hub.root.append(panel);
      },
      onStatus: message => { const node = document.querySelector('#coop-preparing'); if (node) node.textContent = message; },
      onLeave: () => { closeCoop(); hub.showBoard(); },
      onBegin: config => {
        roundSave = selectThreat(localSave, config.stageId, config.threat);
        tracker = createTracker(crypto.getRandomValues(new Uint32Array(1))[0]);
        coopLoad = currentLoad(roundSave, tracker).ratio;
        hub.root.hidden = true; audio.stop(); input.reset(); running = true;
      },
      onBeforeTick: view => renderer.snapshot(view),
      onFrame: (view, events) => {
        if (coopFinished) return;
        world = view;
        if (!coopRenderReady) {
          renderer.reset(view, matchMedia('(prefers-reduced-motion: reduce)').matches);
          renderer.root.visible = renderer.warning.visible = true;
          hud.begin(view); input.enabled = true; coopRenderReady = true;
        }
        const progress = trackRound(roundSave, tracker, events, usedConsumables(roundSave, view.entities[0]));
        tracker = progress.tracker; coopLoad = progress.load.ratio;
        if (coopSession.isHost) setLoad(coopSession.world, coopSession.uid, coopLoad);
        renderer.events(view, [...events, ...progress.fx]);
        audio.events(events, view.entities[0].id);
        hud.events([...events.filter(e => e.id === view.entities[0].id || e.type === 'drop'), ...progress.fx]);
        hud.meta(progress.load, tracker);
        settleCoopPlayer();
        if (view.round.state !== 'running') finishCoop();
      },
      onLost: message => {
        if (!world || !tracker) {
          closeCoop(); hub.showBoard();
          const note = document.createElement('p'); note.className = 'risk-note'; note.textContent = message; hub.root.prepend(note);
          return;
        }
        coopNote = message;
        if (!world.entities[0].terminal) world.entities[0].terminal = 'return_scroll';
        settleCoopPlayer(); finishCoop(); closeCoop();
      },
    });
    coop.open();
  }
  hub.startCoop = startCoop;
  let coopPageHidden = false;
  window.addEventListener('pagehide', () => { if (coop) { coopPageHidden = true; running = false; closeCoop(); } });
  window.addEventListener('pageshow', event => { if (event.persisted && coopPageHidden) { coopPageHidden = false; hub.showInn(); } });
  const coopStatus = document.createElement('div'); coopStatus.id = 'coop-status'; coopStatus.hidden = true;
  document.querySelector('#hud').append(coopStatus);
  // Network ticks continue while a phone/tab is backgrounded. Single-player pause remains unchanged.
  let netTime = performance.now();
  setInterval(() => {
    const now = performance.now(), elapsed = now - netTime; netTime = now;
    if (coopSession) coopSession.update(elapsed, hidden || !input.enabled ? emptyInput() : input.consume(), coopLoad);
  }, TICK_MS);
  document.addEventListener('click', event => {
    if (event.target.closest('[data-action="result-inn"]') && coop) closeCoop();
  });
  Object.defineProperty(window, '__arpg', {
    value: Object.freeze({
      get world() { return readonly(world); },
      get multi() { return readonly(coopSession ? {
        uid: coopSession.uid, host: coopSession.host, isHost: coopSession.isHost,
        phase: coopSession.phase, ownsSim: !!coopSession.world, rtt: coopSession.rtt,
        bytes: coopSession.bytes, snapshots: coopSession.snapshots,
        telegraphs: renderer.telegraphs.length, views: renderer.views.size,
      } : null); },
      get save() { return readonly(hub.save); },
      get tracker() { return readonly(tracker); },
      get feedback() {
        return readonly({
          trauma: renderer.trauma, slowLeft: renderer.slowLeft,
          frozen: [...renderer.views].filter(([, view]) => view.anim.frozen).map(([id]) => id),
          particles: renderer.particles.filter(particle => particle.left > 0).length,
          pools: { particles: renderer.particles.length, numbers: renderer.numbers.length, effects: renderer.effects.length },
          audio: { muted: audio.muted, state: audio.context?.state || 'locked', loaded: [...audio.buffers.keys()], voices: audio.voices.size },
        });
      },
      get art() {
        return readonly({
          ...renderer.provider.atlases.status(),
          visuals: [...renderer.views].map(([id, view]) => ({ id, ...view.visual.debug })),
        });
      },
    }),
  });
  document.querySelector('#boot').hidden = true;
  hub.ready();
  if (saved && new URLSearchParams(location.search).has('room')) startCoop('S2', 1);
  const debugQuery = new URLSearchParams(location.search).get('debug');
  let debugEnabled = debugQuery === '1';
  try {
    if (debugQuery === '0' || debugQuery === '1') localStorage.setItem('arpg.debug', debugQuery);
    debugEnabled = debugQuery === '1' || (debugQuery !== '0' && localStorage.getItem('arpg.debug') === '1');
  } catch { /* Storage denied: explicit URL still works. */ }
  if (debugEnabled) {
    const { mountDebug } = await import('./debug/index.js');
    debug = mountDebug({ hub, store, renderer, input,
      get world() { return world; }, get save() { return hub.save; },
      get running() { return running; }, get tracker() { return tracker; } });
  }
  const inputs = { local: null };
  document.addEventListener('visibilitychange', () => {
    hidden = document.hidden;
    accumulator = 0;
    lastTime = performance.now();
    input.reset();
    if (hidden) audio.stop();
    hud.pause(hidden && running && !coopSession);
  });

  function finishRound() {
    running = false;
    input.reset();
    accumulator = 0;
    const player = world.entities[0];
    const result = settleRound(roundSave, {
      stageId: world.round.stageId,
      terminal: player.terminal,
      depositedXp: tracker.depositedXp,
      tempLoot: tracker.tempLoot,
      used: usedConsumables(roundSave, player),
    });
    // Development kit overrides never grant progression or consume real supplies.
    const nextSave = developmentRound ? hub.save : result.save;
    store.save(nextSave);
    hub.finish(nextSave, result.receipt, hud.deathExplanation(world));
    if (result.receipt.levelsGained > 0) audio.play('level-up');
  }

  function frame(now) {
    const elapsed = Math.min(250, Math.max(0, now - lastTime));
    lastTime = now;
    if (coopSession && running && coopRenderReady && !hidden) {
      const renderNow = coopSession.now + Math.max(0, now - netTime);
      const view = coopSession.view(renderNow);
      if (view) {
        if (!coopSession.isHost) renderer.snapshot(view);
        renderer.render(view, coopSession.isHost ? Math.min(1, (coopSession.tickLeft + Math.max(0, now - netTime)) / TICK_MS) : 1, elapsed / 1000);
        hud.update(world, elapsed / 1000);
        coopStatus.hidden = false;
        const player = world.entities[0];
        coopStatus.textContent = `${player.terminal ? '관전 · 개인 정산 완료 · ' : ''}${[...coopSession.players].length}인 · ${coopSession.isHost ? '방장' : `RTT ${coopSession.rtt === null ? '—' : Math.round(coopSession.rtt) + 'ms'}`} · ${world.entities.filter(e => e.kind === 'player').map(p => `${p.name || p.pid}${p.terminal ? ' (관전)' : ''}`).join(' / ')}`;
      }
    } else if (!coopSession && !hidden && world && running) {
      accumulator += elapsed * (debug?.speed || 1);
      let count = 0;
      while (accumulator >= TICK_MS && count < 5) {
        debug?.beforeTick();
        renderer.snapshot(world);
        inputs.local = input.consume();
        const events = step(world, inputs);
        const progress = trackRound(roundSave, tracker, events, usedConsumables(roundSave, world.entities[0]));
        tracker = progress.tracker;
        setLoad(world, 'local', progress.load.ratio);
        renderer.events(world, [...events, ...progress.fx]);
        audio.events(events, world.entities[0].id);
        hud.events([...events, ...progress.fx]);
        hud.meta(progress.load, tracker);
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
