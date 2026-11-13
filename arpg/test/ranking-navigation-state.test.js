import test from 'node:test';
import assert from 'node:assert/strict';
import { HubUI } from '../js/ui/hub.js';
import { CloudSave } from '../js/meta/cloud-save.js';
import { createSave, validateSave } from '../js/meta/save.js';

// Actual menu actions, show/showInnPanel, HTML, CloudSave.rankings and commit.
// Only the browser adapter, deferred HTTP boundary and round callbacks are synthetic.
function harness(t) {
  const originals = new Map(['document', 'localStorage', 'MutationObserver', 'requestAnimationFrame', 'matchMedia']
    .map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  t.after(() => { for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
  } });
  const root = { hidden: false, dataset: {}, classList: { toggle() {} },
    querySelector: selector => selector === '#sortie-reduced' ? { checked: false } : null,
    querySelectorAll: () => [], contains: () => false };
  const hud = { hidden: false };
  globalThis.document = { activeElement: null, body: { dataset: {} }, querySelectorAll: () => [],
    querySelector: selector => selector === '#hud' ? hud : null };
  const state = { writes: 0, overlays: 0, starts: 0, input: true, resets: 0, visible: true, warning: true };
  const storage = { getItem: () => null, setItem() { state.writes++; }, removeItem() { state.writes++; } };
  globalThis.localStorage = storage;
  globalThis.MutationObserver = class { observe() {} };
  globalThis.requestAnimationFrame = () => 0;
  globalThis.matchMedia = () => ({ matches: false });
  const requests = [];
  const cloud = new CloudSave({ storage, fetcher(url) {
    assert.equal(url, 'https://relay.cocy.io/api/rankings/arpg');
    return new Promise((resolve, reject) => requests.push({ resolve, reject }));
  } });
  const save = createSave({ name: 'RN1', answers: [0, 0, 0, 0, 0], weapon: 'blade', createdAt: 1 });
  assert.ok(validateSave(save));
  const h = Object.assign(Object.create(HubUI.prototype), { save, cloud, root,
    persist() { state.writes++; }, recoverVitals() {},
    onOverlay() { state.overlays++; state.resets++; state.input = false; state.visible = false; state.warning = false; },
    startRound() { state.starts++; state.input = true; state.visible = true; state.warning = true; hud.hidden = false; },
  });
  const snapshot = () => ({ html: root.innerHTML, page: root.dataset.page, hidden: root.hidden,
    hudHidden: hud.hidden, panel: h.panel, state: { ...state }, save: JSON.stringify(h.save) });
  return { h, root, state, requests, snapshot };
}
function finish(request, outcome, nickname = 'current-row') {
  if (outcome === 'reject') return request.reject(new Error('synthetic network failure'));
  request.resolve({ ok: outcome === 'success', json: async () => ({ rankings: [
    { rank: 1, userId: 'synthetic', nickname, country: 'KR', level: 1, stage: 'S1', power: 10 },
  ] }) });
}

for (const outcome of ['success', 'http-error', 'reject']) {
  test('staying on ranking renders ' + outcome + ' without saving', async t => {
    const { h, root, state, requests } = harness(t), raw = JSON.stringify(h.save);
    const pending = h.action('cloud-ranking', {});
    assert.match(root.innerHTML, /불러오는 중/);
    finish(requests[0], outcome); await pending;
    assert.equal(root.dataset.page, 'cloud-ranking'); assert.equal(root.hidden, false);
    assert.match(root.innerHTML, outcome === 'success' ? /current-row/ : /불러오지 못함/);
    assert.equal(state.overlays, 2); assert.equal(state.writes, 0); assert.equal(JSON.stringify(h.save), raw);
  });
  for (const destination of ['inn', 'bag', 'character-choice', 'sortie', 'launch']) {
    test('late ' + outcome + ' cannot replace ' + destination + ' or reset its input/render state', async t => {
      const { h, state, requests, snapshot } = harness(t);
      const pending = h.action('cloud-ranking', {});
      if (destination === 'sortie') h.action('sortie', { stage: 'S1' });
      else if (destination === 'launch') h.launch('S1'); // Hide without show(): page name remains ranking.
      else h.action(destination, {});
      const before = snapshot();
      assert.equal(state.writes, destination === 'launch' ? 1 : 0);
      finish(requests[0], outcome); await pending;
      assert.deepEqual(snapshot(), before, 'completion must not change page, overlay, input, renderer or resources');
    });
  }
}

for (const reenter of [false, true]) for (const oldOutcome of ['success', 'http-error', 'reject']) {
  for (const newOutcome of ['success', 'http-error', 'reject']) {
    test((reenter ? 'leave/reenter' : 'refresh') + ': B ' + newOutcome + ' then A ' + oldOutcome + ' keeps only B', async t => {
      const { h, root, state, requests, snapshot } = harness(t), raw = JSON.stringify(h.save);
      const a = h.action('cloud-ranking', {});
      if (reenter) h.action('inn', {});
      const b = h.action('cloud-ranking', {});
      finish(requests[1], newOutcome, 'row-B'); await b;
      assert.match(root.innerHTML, newOutcome === 'success' ? /row-B/ : /불러오지 못함/);
      const before = snapshot();
      finish(requests[0], oldOutcome, 'row-A'); await a;
      assert.deepEqual(snapshot(), before); assert.doesNotMatch(root.innerHTML, /row-A/);
      assert.equal(state.writes, 0); assert.equal(JSON.stringify(h.save), raw);
    });
  }
}

for (const oldOutcome of ['success', 'http-error', 'reject']) {
  test('old ' + oldOutcome + ' while B is loading is ignored before B renders', async t => {
    const { h, root, state, requests, snapshot } = harness(t);
    const a = h.action('cloud-ranking', {}); h.action('inn', {});
    const b = h.action('cloud-ranking', {}), before = snapshot();
    finish(requests[0], oldOutcome, 'row-A'); await a;
    assert.deepEqual(snapshot(), before); assert.match(root.innerHTML, /불러오는 중/);
    finish(requests[1], 'success', 'row-B'); await b;
    assert.match(root.innerHTML, /row-B/); assert.doesNotMatch(root.innerHTML, /row-A/);
    assert.equal(state.writes, 0); assert.equal(JSON.stringify(h.save), before.save);
  });
}
