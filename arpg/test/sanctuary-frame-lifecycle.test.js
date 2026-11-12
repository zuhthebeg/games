import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Execute the shipped frame and exit function, not a copied lifecycle implementation.
const source = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
const exit = source.slice(source.indexOf('  function exitSanctuary() {'), source.indexOf('  function exitCoopSanctuary('));
const frame = source.slice(source.indexOf('  function frame(now) {'), source.lastIndexOf('  requestAnimationFrame(frame);'));
function fixture({ sanctuary = true, edge = {}, hidden = false, terminal = false } = {}) {
  const calls = { ticks: 0, renders: [], snapshots: [], app: 0, raf: 0, hud: 0, status: 0, saves: 0, debug: 0 };
  const original = { entities: [{ id: 'local', terminal: null }], round: { goal: sanctuary ? 'sanctuary' : 'timer', state: 'running' } };
  const context = {
    world: original, running: true, tracker: {}, roundSave: {}, roundOwner: {}, accumulator: 0, lastTime: 0,
    coopSession: null, hidden, undead: null, debug: { beforeTick() {}, frame() { calls.debug++; } }, TICK_MS: 30, inputs: {}, ritualState: {},
    resultPresentation: { update() {}, pending: false }, advanceRitual() {},
    input: { consume: () => edge, reset() {}, enabled: true }, resetRituals() {},
    hub: { root: {}, showInn() {} }, document: { querySelector: () => ({}) },
    renderer: { root: {}, warning: {}, views: new Map(), snapshot(w) { assert.ok(w); calls.snapshots.push(w); },
      render(w) { assert.ok(w, 'renderer must never receive a disposed/null world'); calls.renders.push(w); }, events() {}, leaveSanctuary() {} },
    handleRitualInput: () => false, movementOnlyInput: x => x, ritualMovement: (_r, x) => x,
    combatInput: () => ({}), step(w) { calls.ticks++; if (terminal) w.round.state = 'clear'; return []; },
    trackRound: (_s, tracker) => ({ tracker, load: { ratio: 0 }, fx: [] }), usedConsumables: () => ({}), setLoad() {},
    audio: { events() {} }, hud: { events() {}, meta() {}, update() { calls.hud++; }, syncRitual() {} }, nearestRitual() {},
    showKnightArtStatus() { calls.status++; }, finishRound() { calls.saves++; context.running = false; context.accumulator = 0; },
    app: { render() { calls.app++; } }, requestAnimationFrame() { calls.raf++; },
  };
  vm.createContext(context);
  vm.runInContext(exit + frame + ';globalThis.runFrame = frame;', context);
  return { calls, context, original, run: now => context.runFrame(now) };
}
for (const edge of ['escapeEdge', 'scrollEdge']) {
  test('SE1 ' + edge + ': disposal skips world presentation, retains one common frame tail and relaunch', () => {
    const f = fixture({ edge: { [edge]: true } });
    f.run(150); // Enough accumulated time for five ticks; exit must stop at the first.
    assert.equal(f.context.world, null);
    assert.equal(f.context.running, false);
    assert.equal(f.calls.ticks, 0);
    assert.equal(f.calls.renders.length, 0);
    assert.equal(f.calls.status, 0);
    assert.equal(f.calls.app, 1);
    assert.equal(f.calls.raf, 1);
    assert.equal(f.calls.debug, 1);
    f.run(180); // Inn idle still owns exactly one RAF.
    assert.equal(f.calls.app, 2); assert.equal(f.calls.raf, 2);
    f.context.world = { entities: [{ id: 'local' }], round: { goal: 'timer', state: 'running' } };
    f.context.running = true;
    f.run(210);
    assert.equal(f.calls.ticks, 1);
    assert.equal(f.calls.renders.length, 1);
    assert.equal(f.calls.hud, 1);
    assert.equal(f.calls.app, 3); assert.equal(f.calls.raf, 3);
    assert.equal(f.calls.saves, 0);
  });
}
for (const sanctuary of [true, false]) test('SE1 normal ' + (sanctuary ? 'sanctuary' : 'combat') + ' tick/render path preserved', () => {
  const f = fixture({ sanctuary }); f.run(60);
  assert.equal(f.calls.ticks, 2); assert.equal(f.calls.renders[0], f.original);
  assert.equal(f.calls.hud, 1); assert.equal(f.calls.status, 1);
  assert.equal(f.calls.app, 1); assert.equal(f.calls.raf, 1); assert.equal(f.calls.saves, 0);
});
test('SE1 terminal round still renders its retained world exactly once after settlement', () => {
  const f = fixture({ sanctuary: false, terminal: true }); f.run(60);
  assert.equal(f.calls.ticks, 1); assert.equal(f.calls.saves, 1);
  assert.equal(f.calls.renders[0], f.original); assert.equal(f.calls.renders.length, 1);
  assert.equal(f.calls.hud, 0); assert.equal(f.calls.app, 1); assert.equal(f.calls.raf, 1);
});
test('SE1 hidden frame preserves no-render and single RAF behavior', () => {
  const f = fixture({ hidden: true }); f.run(60);
  assert.equal(f.calls.ticks, 0); assert.equal(f.calls.renders.length, 0);
  assert.equal(f.calls.app, 0); assert.equal(f.calls.raf, 1);
});
