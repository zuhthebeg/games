import test from 'node:test';
import assert from 'node:assert/strict';
import { HubUI } from '../js/ui/hub.js';
import { createSave } from '../js/meta/save.js';

// Real constructor listeners, action, page rendering and openItem; only DOM/time are adapters.
function harness(t) {
  const keys = ['document', 'location', 'setTimeout', 'clearTimeout', 'MutationObserver', 'requestAnimationFrame'];
  const originals = keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  t.after(() => { for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
  } });
  const listeners = {}, timers = new Map(); let timerId = 0, sheet = null, sheets = 0, writes = 0;
  const root = { hidden: false, dataset: {}, classList: { toggle() {} },
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    querySelector(selector) { return selector === 'dialog' ? sheet : null; },
    querySelectorAll: () => [], contains: node => node?.isConnected === true,
    insertAdjacentHTML(_where, html) { sheets++; sheet = { html, addEventListener() {}, showModal() {}, close() {}, remove() { sheet = null; } }; },
  };
  globalThis.document = { hidden: false, activeElement: null, body: { dataset: {} }, addEventListener() {},
    querySelector: selector => selector === '#meta-screen' ? root : { hidden: false } };
  globalThis.location = { search: '' };
  globalThis.MutationObserver = class { observe() {} };
  globalThis.requestAnimationFrame = () => 0;
  document.querySelectorAll = () => [];
  globalThis.setTimeout = fn => { timers.set(++timerId, fn); return timerId; };
  globalThis.clearTimeout = id => timers.delete(id);
  const save = createSave({ name: 'press-A', answers: [0,0,0,0,0], createdAt: 1 });
  const h = new HubUI({ save, persist() { writes++; }, startRound() {}, resetSave() {}, onOverlay() {} });
  h.showBag();
  const node = { dataset: { uid: save.items[0].uid }, disabled: false, isConnected: true };
  const emit = (type, extra = {}) => { for (const fn of listeners[type] || []) fn({
    target: { closest: selector => selector === '[data-action="open-item"]' ? node : null }, clientX: 0, clientY: 0, ...extra,
  }); };
  const fire = () => { const queued = [...timers.values()]; timers.clear(); for (const fn of queued) fn(); };
  return { h, root, node, emit, fire, sheets: () => sheets, writes: () => writes };
}

test('current bag long press opens the actual item sheet without saving', t => {
  const x = harness(t), before = JSON.stringify(x.h.save);
  x.emit('pointerdown'); x.fire();
  assert.equal(x.sheets(), 1); assert.equal(x.h.itemContext.uid, x.node.dataset.uid);
  assert.equal(x.writes(), 0); assert.equal(JSON.stringify(x.h.save), before);
});

for (const destination of ['inn', 'bag-reentry', 'hidden', 'detached', 'replacement-character']) {
  test('pending bag long press cannot outlive ' + destination, t => {
    const x = harness(t); x.emit('pointerdown');
    if (destination === 'inn') x.h.action('inn', {});
    if (destination === 'bag-reentry') { x.h.action('inn', {}); x.h.action('bag', {}); }
    if (destination === 'hidden') x.root.hidden = true;
    if (destination === 'detached') x.node.isConnected = false;
    if (destination === 'replacement-character') {
      x.h.save = createSave({ name: 'press-B', answers: [0,0,0,0,0], createdAt: 2 });
      x.h.showBag();
    }
    const before = { html: x.root.innerHTML, page: x.root.dataset.page, save: JSON.stringify(x.h.save), uid: x.h.selectedUid };
    assert.doesNotThrow(x.fire, 'revoked timer must not execute openItem against another character');
    assert.equal(x.sheets(), 0, 'old card must not mount a sheet on the current screen');
    assert.deepEqual({ html: x.root.innerHTML, page: x.root.dataset.page, save: JSON.stringify(x.h.save), uid: x.h.selectedUid }, before);
    assert.equal(x.writes(), 0);
  });
}
for (const cancel of ['pointerup', 'pointercancel', 'pointermove']) {
  test(cancel + ' still cancels long press', t => {
    const x = harness(t); x.emit('pointerdown'); x.emit(cancel, { clientX: 20 }); x.fire(); assert.equal(x.sheets(), 0);
  });
}
