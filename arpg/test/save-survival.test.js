import test from 'node:test';
import assert from 'node:assert/strict';
import { createSave, SaveStore, SAVE_KEY, SAVE_VERSION } from '../js/meta/save.js';
import { createSlotStorage, SLOT_SAVE_KEYS } from '../js/meta/character-slots.js';
import { CharacterStores } from '../js/meta/selected-character.js';
import { reloadIfStale } from '../js/build-freshness.js';

const fresh = () => createSave({ name: '용사', answers: [0, 0, 0, 0, 0], createdAt: 123 });
// A newer build's character: valid structure, but an item id this (older) build has never heard of.
const newerBuild = () => { const s = fresh(); s.items.push({ ...s.items[0], uid: 'future:1', id: 'item_from_the_future' }); return s; };
function memory(entries = []) {
  const data = new Map(entries);
  return { data, get length() { return data.size; }, key: i => [...data.keys()][i] ?? null,
    getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k) };
}

test('newer-build save is locked, never deleted or backed up over; writes refuse until the user discards', () => {
  const raw = JSON.stringify(newerBuild()), mem = memory([[SAVE_KEY, raw]]);
  const store = new SaveStore(mem, () => 7);
  assert.equal(store.load(), null);
  assert.ok(store.locked);
  assert.equal(mem.getItem(SAVE_KEY), raw);
  assert.equal(mem.getItem(`${SAVE_KEY}.corrupt.7`), null);
  assert.throws(() => store.save(fresh()), /덮어쓰지/);
  assert.equal(mem.getItem(SAVE_KEY), raw);
  store.discardLocked();
  assert.equal(mem.getItem(SAVE_KEY), null);
  assert.equal(mem.getItem(`${SAVE_KEY}.corrupt.7`), raw);
  store.save(fresh());
});

test('discardLocked refuses when the slot changed underneath (another tab wrote)', () => {
  const mem = memory([[SAVE_KEY, JSON.stringify(newerBuild())]]), store = new SaveStore(mem);
  store.load();
  mem.setItem(SAVE_KEY, JSON.stringify(fresh()));
  assert.throws(() => store.discardLocked(), /변경/);
  assert.ok(mem.getItem(SAVE_KEY));
});

test('genuine garbage (bad JSON, old versions) still quarantines to a backup', () => {
  for (const raw of ['{broken', '{"version":2}', JSON.stringify({ version: 1, name: 'x' })]) {
    const mem = memory([[SAVE_KEY, raw]]), store = new SaveStore(mem, () => 9);
    assert.equal(store.load(), null);
    assert.equal(store.locked, null);
    assert.equal(mem.getItem(`${SAVE_KEY}.corrupt.9`), raw);
    assert.equal(mem.getItem(SAVE_KEY), null);
  }
});

test('character quarantined by a stale build returns when a current build loads (slot storage)', () => {
  const mem = memory(), good = JSON.stringify(fresh());
  mem.setItem(`${SLOT_SAVE_KEYS.human}.corrupt.50`, '{broken');
  mem.setItem(`${SLOT_SAVE_KEYS.human}.corrupt.100`, good);
  mem.setItem(`${SLOT_SAVE_KEYS.skeleton_knight}.corrupt.200`, JSON.stringify({ ...fresh(), lineage: 'skeleton_knight' }));
  const stores = new CharacterStores(mem);
  const save = stores.selectHuman();
  assert.equal(save.name, '용사');
  assert.equal(mem.getItem(SLOT_SAVE_KEYS.human), good);
  assert.equal(mem.getItem(SLOT_SAVE_KEYS.skeleton_knight), null);
});

test('restore picks the newest valid backup and skips unreadable ones', () => {
  const older = fresh(), newer = { ...fresh(), name: '최신' };
  const mem = memory([[`${SAVE_KEY}.corrupt.10`, JSON.stringify(older)], [`${SAVE_KEY}.corrupt.20`, JSON.stringify(newer)], [`${SAVE_KEY}.corrupt.30`, '{broken']]);
  const store = new SaveStore(createSlotStorage(mem, 'human'));
  assert.equal(store.load().name, '최신');
});

test('deliberate reset is not undone by a restore', () => {
  const mem = memory(), stores = new CharacterStores(mem);
  mem.setItem(SAVE_KEY, JSON.stringify(fresh()));
  mem.setItem(`${SAVE_KEY}.corrupt.5`, JSON.stringify(fresh()));
  stores.selectHuman();
  stores.reset();
  assert.equal(new CharacterStores(mem).selectHuman(), null);
});

const page = importmap => ({ querySelector: () => ({ textContent: importmap }) });
const reply = html => async () => ({ ok: true, text: async () => html });
const wrap = map => `<html><script type="importmap">${map}</script></html>`;
const guard = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };

test('reloads once when the server build differs from the cached page', async () => {
  let reloads = 0; const storage = guard();
  const args = { doc: page('{"a":"1"}'), fetchFn: reply(wrap('{"a":"2"}')), storage, reload: () => reloads++, now: () => 100000 };
  assert.equal(await reloadIfStale(args), true);
  assert.equal(await reloadIfStale({ ...args, now: () => 101000 }), false);
  assert.equal(reloads, 1);
});

test('no reload when builds match, offline, or the server errors', async () => {
  let reloads = 0; const reload = () => reloads++;
  assert.equal(await reloadIfStale({ doc: page('{"a": "1"}'), fetchFn: reply(wrap('{"a":"1"}')), storage: guard(), reload }), false);
  assert.equal(await reloadIfStale({ doc: page('{"a":"1"}'), fetchFn: async () => { throw new Error('offline'); }, storage: guard(), reload }), false);
  assert.equal(await reloadIfStale({ doc: page('{"a":"1"}'), fetchFn: async () => ({ ok: false }), storage: guard(), reload }), false);
  assert.equal(reloads, 0);
});

test('other forms of newer content (stack ids, stages, future version) also lock instead of quarantine', () => {
  const variants = [s => { s.stacks.future_dust = 2; }, s => { s.stageThreat.S99 = 0; }, s => { s.version = SAVE_VERSION + 1; }];
  for (const edit of variants) {
    const save = fresh(); edit(save);
    const raw = JSON.stringify(save), mem = memory([[SAVE_KEY, raw]]), store = new SaveStore(mem, () => 3);
    assert.equal(store.load(), null);
    assert.ok(store.locked);
    assert.equal(mem.getItem(SAVE_KEY), raw);
  }
});
