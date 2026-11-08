import test from 'node:test';
import assert from 'node:assert/strict';
import { CloudSave, snapshot } from '../js/meta/cloud-save.js';
import { CharacterStores } from '../js/meta/selected-character.js';
import { createSave } from '../js/meta/save.js';
import { createSkeletonSave } from '../js/meta/character-creation.js';
import { SLOT_SAVE_KEYS } from '../js/meta/character-slots.js';
const slots = ['human', 'skeleton_knight'];
const side = slot => SLOT_SAVE_KEYS[slot] + '.cloud-owner.v1';
const fresh = slot => (slot === 'human' ? createSave : createSkeletonSave)({ lineage: slot, name: 'Lifecycle', answers: [0,0,0,0,0], createdAt: 10 });
const tick = () => new Promise(r => setImmediate(r));
function rig(bytes = new Map([['relay_token', 'A1']])) {
  const puts = [], writes = []; let hook = () => {}, remote = slots.map(slot => ({ charId: slot, data: snapshot(fresh(slot)) }));
  const storage = {
    getItem: key => bytes.get(key) ?? null,
    setItem(key, value) { hook(key, value); writes.push([key, value]); bytes.set(key, value); },
    removeItem: key => bytes.delete(key), key: i => [...bytes.keys()][i] ?? null,
    get length() { return bytes.size; },
  };
  globalThis.window = { addEventListener() {} };
  const cloud = new CloudSave({ storage, timer: () => 0, cancelTimer() {}, fetcher: async (url, init) => {
    if (url.endsWith('/me')) return { ok: true, json: async () => ({ id: init.headers.Authorization === 'Bearer B1' ? 'B' : 'A' }) };
    if (init.method === 'PUT') { puts.push({ data: JSON.parse(init.body), auth: init.headers.Authorization }); return { ok: true, status: 200 }; }
    return { ok: true, json: async () => ({ characters: remote }) };
  } });
  const characters = new CharacterStores(cloud.characterStorage());
  return { bytes, storage, cloud, characters, puts, writes, hook: fn => hook = fn, remote: rows => remote = rows };
}
const select = (h, slot) => slot === 'human' ? h.characters.selectHuman() : h.characters.selectKnight();
async function restored(slot) { const h = rig(); await h.cloud.load(); h.cloud.restore(slot); const save = select(h, slot); return { h, save }; }
async function upload(h, save) { h.cloud.changed(save); await tick(); await h.cloud.flush({ hidden: true }); }
for (const slot of slots) {
  test('CS2 real restore -> SaveStore progression -> reload -> same-owner refresh: ' + slot, async () => {
    const { h, save } = await restored(slot), captured = h.characters.active;
    save.gold += 7; save.xp += 1; h.characters.persist(save, captured); await upload(h, save);
    assert.equal(h.puts.length, 1); assert.equal(h.puts[0].data.gold, save.gold);
    const r = rig(h.bytes); await r.cloud.load(); const latest = select(r, slot);
    r.bytes.set('relay_token', 'A2'); await r.cloud.token(); latest.gold += 9; latest.xp += 1;
    r.characters.persist(latest, r.characters.active); await upload(r, latest);
    assert.equal(r.puts.length, 1); assert.equal(r.puts[0].data.gold, latest.gold); assert.equal(r.puts[0].auth, 'Bearer A2');
    assert.equal(JSON.parse(r.bytes.get(side(slot))).content, JSON.stringify(snapshot(latest)));
  });
  test('CS2 raw foreign replacement without storage event stays HOLD: ' + slot, async () => {
    const { h, save } = await restored(slot); save.name = 'Foreign'; save.gold++;
    h.bytes.set(SLOT_SAVE_KEYS[slot], JSON.stringify(save)); const next = select(h, slot); next.gold++;
    h.characters.persist(next); await upload(h, next); assert.equal(h.puts.length, 0);
    const r = rig(h.bytes); await r.cloud.load(); await upload(r, select(r, slot)); assert.equal(r.puts.length, 0);
  });
  test('CS2 reset same-timestamp new slot and backup do not first-bind: ' + slot, async () => {
    const { h, save } = await restored(slot); h.characters.reset();
    assert.equal(JSON.parse(h.bytes.get(side(slot))).committed, false);
    const backup = SLOT_SAVE_KEYS[slot] + '.corrupt.123'; h.bytes.set(backup, JSON.stringify(save));
    const store = slot === 'human' ? h.characters.human : h.characters.knight;
    assert.ok(store.restoreBackup()); await upload(h, save); assert.equal(h.puts.length, 0);
    select(h, slot); h.characters.reset(); select(h, slot);
    const created = slot === 'human' ? fresh(slot) : h.characters.createKnight({ name: 'Lifecycle', answers: [0,0,0,0,0], createdAt: 10 });
    if (slot === 'human') h.characters.persist(created);
    await upload(h, created); assert.equal(h.puts.length, 0);
  });
}
for (const failure of ['stage', 'local', 'final']) test('CS2 trusted write failure preserves correct bytes/proof: ' + failure, async () => {
  const { h, save } = await restored('human'), old = h.bytes.get(SLOT_SAVE_KEYS.human), proof = h.bytes.get(side('human'));
  save.gold++; h.hook((key, value) => {
    if ((failure === 'local' && key === SLOT_SAVE_KEYS.human) || (failure !== 'local' && key === side('human') && JSON.parse(value).committed === (failure === 'final'))) throw Error('quota');
  });
  assert.throws(() => h.characters.persist(save)); h.hook(() => {});
  assert.equal(h.bytes.get(SLOT_SAVE_KEYS.human), failure === 'final' ? JSON.stringify(save) : old);
  assert.equal(h.bytes.get(side('human')), failure === 'stage' ? proof : JSON.stringify({ v: 1, owner: 'A', content: JSON.stringify(snapshot(save)), committed: false }));
  await upload(h, save); assert.equal(h.puts.length, 0);
});
for (const phase of ['stage', 'local']) test('CS2 auth change inside synchronous write cannot commit: ' + phase, async () => {
  const { h, save } = await restored('human'); save.gold++;
  h.hook(key => { if (key === (phase === 'stage' ? side('human') : SLOT_SAVE_KEYS.human)) h.bytes.set('relay_token', 'B1'); });
  assert.throws(() => h.characters.persist(save)); h.hook(() => {}); await h.cloud.token();
  assert.equal(JSON.parse(h.bytes.get(side('human'))).committed, false); await upload(h, save); assert.equal(h.puts.length, 0);
});
test('CS2 B trusted local progression never relabels A proof', async () => {
  const { h, save } = await restored('human'), proof = h.bytes.get(side('human'));
  h.bytes.set('relay_token', 'B1'); await h.cloud.token(); save.gold++; h.characters.persist(save);
  await upload(h, save); assert.equal(h.puts.length, 0); assert.equal(h.bytes.get(side('human')), proof);
});
for (const absent of [false, true]) test('CS2 failed invalidation refuses reset/new-slot and preserves backups: ' + absent, async () => {
  const { h, save } = await restored('human'), original = h.bytes.get(SLOT_SAVE_KEYS.human);
  h.bytes.set(SLOT_SAVE_KEYS.human + '.corrupt.123', original); if (absent) h.bytes.delete(SLOT_SAVE_KEYS.human);
  h.hook(key => { if (key === side('human')) throw Error('quota'); });
  if (absent) assert.throws(() => h.characters.human.save(save));
  else assert.throws(() => h.characters.reset());
  assert.equal(h.bytes.get(SLOT_SAVE_KEYS.human), absent ? undefined : original);
  assert.equal(h.bytes.get(SLOT_SAVE_KEYS.human + '.corrupt.123'), original);
});
test('CS2 fresh human and direct knight creation remain unbound with no proof minted', async () => {
  const h = rig(); await h.cloud.token(); select(h, 'human'); const a = fresh('human'); h.characters.persist(a); await upload(h, a);
  select(h, 'skeleton_knight'); const b = h.characters.createKnight({ name: 'NewKnight', answers: [0,0,0,0,0], createdAt: 10 }); await upload(h, b);
  assert.equal(h.puts.length, 0); for (const slot of slots) assert.equal(h.bytes.has(side(slot)), false);
});

for (const phase of ['stage-drop', 'local-drop', 'final-drop', 'stage-read', 'local-read', 'sidecar-replaced']) test('CS2 readback failure/foreign interleave is fail-closed: ' + phase, async () => {
  const { h, save } = await restored('human'), key = SLOT_SAVE_KEYS.human, before = h.bytes.get(key);
  const write = h.storage.setItem, read = h.storage.getItem; let failRead = false;
  h.storage.setItem = (k, v) => {
    if (phase === 'stage-drop' && k === side('human') && !JSON.parse(v).committed) return;
    if (phase === 'local-drop' && k === key) return;
    if (phase === 'final-drop' && k === side('human') && JSON.parse(v).committed) return;
    write(k, v);
    if (phase === 'stage-read' && k === side('human')) failRead = true;
    if (phase === 'local-read' && k === key) failRead = true;
    if (phase === 'sidecar-replaced' && k === key) h.bytes.set(side('human'), JSON.stringify({ v: 1, committed: false }));
  };
  h.storage.getItem = k => { if (failRead) throw Error('read unavailable'); return read(k); };
  save.gold++;
  if (phase === 'final-drop') h.characters.persist(save);
  else assert.throws(() => h.characters.persist(save));
  h.storage.setItem = write; h.storage.getItem = read;
  assert.equal(h.bytes.get(key), ['stage-drop', 'local-drop', 'stage-read'].includes(phase) ? before : JSON.stringify(save));
  await upload(h, save); assert.equal(h.puts.length, 0);
});
for (const mode of ['backup', 'new-human', 'new-knight']) test('CS2 absent-slot operation invalidates residual committed proof: ' + mode, async () => {
  const slot = mode === 'new-knight' ? 'skeleton_knight' : 'human', { h, save } = await restored(slot), key = SLOT_SAVE_KEYS[slot];
  assert.equal(JSON.parse(h.bytes.get(side(slot))).committed, true); h.bytes.delete(key);
  if (mode === 'backup') { h.bytes.set(key + '.corrupt.123', JSON.stringify(save)); assert.ok(h.characters.human.restoreBackup()); }
  else if (mode === 'new-human') h.characters.human.save(fresh(slot));
  else { select(h, slot); h.characters.createKnight({ name: 'Lifecycle', answers: [0,0,0,0,0], createdAt: 10 }); }
  assert.equal(JSON.parse(h.bytes.get(side(slot))).committed, false); await upload(h, select(h, slot)); assert.equal(h.puts.length, 0);
});
test('CS2 failed restore cannot be rehabilitated by trusted SaveStore write', async () => {
  const h = rig(); await h.cloud.load(); const write = h.storage.setItem;
  h.storage.setItem = (k,v) => { if (k === SLOT_SAVE_KEYS.human) throw Error('quota'); write(k,v); };
  assert.throws(() => h.cloud.restore('human')); h.storage.setItem = write;
  const save = fresh('human'); h.characters.human.save(save); await upload(h, save);
  assert.equal(h.puts.length, 0); assert.equal(JSON.parse(h.bytes.get(side('human'))).committed, false);
});
test('CS2 CharacterStores captured round guard and non-slot forwarding remain intact', async () => {
  const { h, save } = await restored('human'), captured = h.characters.active;
  select(h, 'skeleton_knight'); assert.throws(() => h.characters.persist(save, captured));
  const adapter = h.cloud.characterStorage(); adapter.setItem('settings', 'unchanged'); assert.equal(adapter.getItem('settings'), 'unchanged');
  assert.equal(adapter.length, h.storage.length); assert.equal(adapter.key(0), h.storage.key(0)); adapter.removeItem('settings'); assert.equal(h.bytes.has('settings'), false);
});

test('CS2 sidecar read failure aborts trusted write without changing original', async () => {
  const { h, save } = await restored('human'), old = h.bytes.get(SLOT_SAVE_KEYS.human), read = h.storage.getItem;
  h.storage.getItem = key => { if (key === side('human')) throw Error('unavailable'); return read(key); };
  save.gold++; assert.throws(() => h.characters.persist(save)); h.storage.getItem = read;
  assert.equal(h.bytes.get(SLOT_SAVE_KEYS.human), old); await upload(h, save); assert.equal(h.puts.length, 0);
});
test('CS2 predecessor replacement during stage is not overwritten or committed', async () => {
  const { h, save } = await restored('human'), foreign = fresh('human'); foreign.name = 'Foreign';
  const raw = JSON.stringify(foreign); h.hook(key => { if (key === side('human')) h.bytes.set(SLOT_SAVE_KEYS.human, raw); });
  save.gold++; assert.throws(() => h.characters.persist(save)); h.hook(() => {});
  assert.equal(h.bytes.get(SLOT_SAVE_KEYS.human), raw); assert.equal(JSON.parse(h.bytes.get(side('human'))).committed, false);
  await upload(h, save); assert.equal(h.puts.length, 0);
});
