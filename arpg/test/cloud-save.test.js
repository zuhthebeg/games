import test from 'node:test';
import assert from 'node:assert/strict';
import { createSave } from '../js/meta/save.js';
import { createSkeletonSave } from '../js/meta/character-creation.js';
import { snapshot, restoreSnapshot, compareProgress, combatPower, CloudSave } from '../js/meta/cloud-save.js';
const human = () => createSave({ name: 'Test', answers: [0,0,0,0,0], createdAt: 12345 });
test('human and knight snapshots restore through strict save validation', () => {
  for (const save of [human(), createSkeletonSave({ lineage: 'skeleton_knight', name: 'Bone', answers: [0,0,0,0,0], createdAt: 12345 })]) {
    const data = snapshot(save), restored = restoreSnapshot(data);
    assert.ok(new TextEncoder().encode(JSON.stringify(data)).length < 8192);
    assert.equal(restored.name, save.name);
    assert.equal(restored.equipped.weapon, save.equipped.weapon);
    assert.equal(restored.items.length, save.items.length);
    assert.equal(combatPower(data), Number(combatPower(data)));
  }
});
test('progress compares level, clear count, then XP', () => {
  const a = human(), b = human(); b.xp = 1; assert.equal(compareProgress(b,a),1);
  b.xp = 0; b.cleared.S1 = true; assert.equal(compareProgress(b,a),1);
  b.level = 2; assert.equal(compareProgress(b,a),1);
});
test('cloud store debounces and skips unchanged snapshots', async () => {
  const storage = { getItem: () => null }, calls = [], tasks = new Map(); let id = 0, now = 100000;
  globalThis.window = { MultiplayerClient: { getInstance: () => ({ ensureAuth: async () => {}, token: 'test' }) } };
  const cloud = new CloudSave({ storage, now: () => now, timer: (fn, delay) => { tasks.set(++id,{fn,delay}); return id; }, cancelTimer: key => tasks.delete(key), fetcher: async (url, init) => { calls.push(init); return {ok:true,status:200}; } });
  const save = human(); cloud.changed(save); cloud.changed(save);
  assert.equal(tasks.size, 1);
  const task = [...tasks.values()][0]; assert.equal(task.delay, 300); tasks.clear(); task.fn(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.length,1);
  cloud.changed(save); assert.equal(tasks.size, 0);
  save.gold++; cloud.changed(save); assert.ok([...tasks.values()].some(t => t.delay === 60000));
});
test('newer cloud save is offered but local bytes remain until restore', async () => {
  const local = human(), remote = human(); remote.level = 1; remote.xp = 10;
  const bytes = JSON.stringify(local), map = new Map([['arpg.save.v1', bytes]]);
  const storage = { getItem: k => map.get(k) ?? null, setItem: (k,v) => map.set(k,v) };
  globalThis.window = { MultiplayerClient: { getInstance: () => ({ ensureAuth: async () => {}, token: 'test' }) } };
  const cloud = new CloudSave({ storage, fetcher: async () => ({ ok: true, json: async () => ({ characters: [{ charId: 'human', data: snapshot(remote) }] }) }) });
  await cloud.load(); assert.equal(map.get('arpg.save.v1'), bytes);
  assert.equal(cloud.offer('human').save.xp, 10);
  cloud.restore('human'); assert.equal(JSON.parse(map.get('arpg.save.v1')).xp, 10);
  assert.ok([...map.keys()].some(k => k.startsWith('arpg.save.v1.cloud-backup.')));
});
