import { Application } from '../../vendor/pixi-8.22.0.min.mjs';
import { InputLayer } from '../../js/input.js';
import { step } from '../../js/sim/world.js';
import { ArenaRenderer } from '../../js/render/renderer.js';
import { VisualProvider } from '../../js/render/visual-provider.js';
import { createEncounter } from './encounter.js';
import { installEncounterArt } from './presentation.js';

// Same combat controls and consumed vectors. Preference toggles are in-memory only.
class LabInput extends InputLayer {
  setAutoAttack(on) {
    this.autoAttack = !!on;
    document.querySelector('#attack').textContent = on ? '자동 J' : '공격 J';
    document.querySelector('#movepad').hidden = !on;
    if (!on) this.releaseMovePad();
  }
}
const app = new Application();
await app.init({ resizeTo: window, background: '#202923', antialias: true, resolution: Math.min(devicePixelRatio, 2) });
document.body.prepend(app.canvas);
const provider = new VisualProvider();
installEncounterArt(provider);
const renderer = new ArenaRenderer(app, provider);
let encounter, history, seen, elapsed = 0;
const input = new LabInput(app.canvas, document.querySelector('#actions'), (x, y, value) => renderer.aim(x, y, value));
input.setAutoAttack(input.autoAttack);
function restart() {
  encounter = createEncounter();
  history = []; seen = new Set(); elapsed = 0;
  input.reset(); input.enabled = false;
  renderer.reset(encounter.world, true);
  renderer.root.visible = false;
}
document.querySelector('#restart').addEventListener('click', restart);
restart();
// Read-only copied diagnostics: tests cannot inject inputs, mutate a world or drive ticks.
Object.defineProperty(window, '__undeadEncounter', { value: Object.freeze({ inspect() {
  const { world, player, human } = encounter;
  return structuredClone({ tick: world.tick, player, human, events: history, seen: [...seen],
    views: [...renderer.views].map(([id, v]) => ({ entityId: id, ...v.visual.debug })),
    assets: provider.atlases.status(), autoAttack: input.autoAttack });
} }) });
app.ticker.add(ticker => {
  const { world, player, human } = encounter;
  const artReady = renderer.views.size === 2 && [...renderer.views.values()].every(v => v.visual.debug.mode === 'atlas');
  renderer.root.visible = artReady;
  input.enabled = artReady && !player.dead && !human.dead && !player.terminal;
  elapsed += Math.min(.1, ticker.deltaMS / 1000);
  while (elapsed >= 1 / 30) {
    if (artReady && !player.dead && !human.dead && !player.terminal) {
      renderer.snapshot(world);
      const events = step(world, { skeleton: input.consume() });
      history.push(...events.map(event => ({ ...event, tick: world.tick })));
      renderer.events(world, events);
    } else input.enabled = false;
    elapsed -= 1 / 30;
  }
  renderer.render(world, elapsed * 30, ticker.deltaMS / 1000);
  for (const [id, view] of renderer.views) {
    const art = view.visual.debug;
    if (art.mode === 'atlas') seen.add(`${id}:${art.id}:${art.state}:${art.direction}`);
  }
  const state = !artReady ? (Object.keys(provider.atlases.status().failed).length ? '필수 아틀라스 실패 · 전투 중지' : '아틀라스 준비 중') : human.dead ? '해골 승리' : player.dead ? '인간 AI 승리' : player.terminal ? '전투 종료' : '전투 중';
  document.querySelector('#status').textContent = `${state} · 해골 HP ${Math.ceil(player.hp)} · 인간 HP ${Math.ceil(human.hp)} · ${world.tick}틱`;
});
