import { Application } from '../vendor/pixi-8.22.0.min.mjs';
import { createWorld, addPlayer, startStage, step, setLoad } from './sim/world.js';
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
      renderer.reset(world, reduced);
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
  Object.defineProperty(window, '__arpg', {
    value: Object.freeze({
      get world() { return readonly(world); },
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
  const inputs = { local: null };
  document.addEventListener('visibilitychange', () => {
    hidden = document.hidden;
    accumulator = 0;
    lastTime = performance.now();
    input.reset();
    if (hidden) audio.stop();
    hud.pause(hidden && running);
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
    if (!hidden && world && running) {
      accumulator += elapsed;
      let count = 0;
      while (accumulator >= TICK_MS && count < 5) {
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
    if (!hidden) app.render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
} catch (error) {
  document.querySelector('#boot-error').textContent = `초기화 실패: ${error.message}`;
  console.error(error);
}
