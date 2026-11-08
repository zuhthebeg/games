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
  const bytes = new Map(), storage = { getItem: k => bytes.get(k) ?? null, setItem: (k,v) => bytes.set(k,v) }, calls = [], tasks = new Map(); let id = 0, now = 100000;
  globalThis.window = { MultiplayerClient: { getInstance: () => ({ ensureAuth: async () => {}, token: 'test' }) } };
  const cloud = new CloudSave({ storage, now: () => now, timer: (fn, delay) => { tasks.set(++id,{fn,delay}); return id; }, cancelTimer: key => tasks.delete(key), fetcher: async (url, init) => { if (url.endsWith('/me')) return {ok:true,status:200,json:async()=>({id:'A'})}; calls.push(init); return {ok:true,status:200}; } });
  const save = human(); bytes.set('relay_token','synthetic-A'); bindFixture(bytes, save); await cloud.token(); cloud.changed(save); cloud.changed(save);
  assert.equal(tasks.size, 1);
  const task = [...tasks.values()][0]; assert.equal(task.delay, 300); tasks.clear(); task.fn(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.length,1);
  cloud.changed(save); assert.equal(tasks.size, 0);
  save.gold++; bindFixture(bytes, save); cloud.changed(save); assert.ok([...tasks.values()].some(t => t.delay === 60000));
});
test('newer cloud save is offered but local bytes remain until restore', async () => {
  const local = human(), remote = human(); remote.level = 1; remote.xp = 10;
  const bytes = JSON.stringify(local), map = new Map([['arpg.save.v1', bytes]]);
  const storage = { getItem: k => map.get(k) ?? null, setItem: (k,v) => map.set(k,v) };
  globalThis.window = { MultiplayerClient: { getInstance: () => ({ ensureAuth: async () => {}, token: 'test' }) } };
  map.set('relay_token','synthetic-A'); bindFixture(map, local);
  const cloud = new CloudSave({ storage, fetcher: async url => ({ ok: true, json: async () => url.endsWith('/me') ? {id:'A'} : ({ characters: [{ charId: 'human', data: snapshot(remote) }] }) }) });
  await cloud.load(); assert.equal(map.get('arpg.save.v1'), bytes);
  assert.equal(cloud.offer('human').save.xp, 10);
  cloud.restore('human'); assert.equal(JSON.parse(map.get('arpg.save.v1')).xp, 10);
  assert.ok([...map.keys()].some(k => k.startsWith('arpg.save.v1.cloud-backup.')));
});

// CS1: deterministic clock starts at zero and the first timeout handle is zero.
const settle = () => new Promise(resolve => setImmediate(resolve));
const success = () => ({ ok: true, status: 200 });
const limited = value => ({ ok: false, status: 429, headers: new Headers(value === undefined ? {} : { 'Retry-After': value }) });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
// Persistent fixtures represent already-owned saves; production token verification is not bypassed.
function bindFixture(bytes, save) {
  const key = save.lineage === 'skeleton_knight' ? 'arpg.save.v1.slots.skeleton_knight' : 'arpg.save.v1';
  bytes.set(key, JSON.stringify(save));
  bytes.set(key + '.cloud-owner.v1', JSON.stringify({v:1,owner:'A',content:JSON.stringify(snapshot(save)),committed:true}));
}
async function schedulerHarness(transport = async () => success(), start = 100000) {
  let now = start, id = 0;
  const tasks = new Map(), callbacks = [], calls = [], bytes = new Map();
  const cloud = new CloudSave({ storage: { getItem: k => bytes.get(k) ?? null, setItem: (k,v) => bytes.set(k,v) },
    now: () => now, timer: (fn, delay) => { callbacks.push(fn); tasks.set(id, { fn, at: now + delay }); return id++; },
    cancelTimer: key => tasks.delete(key), fetcher: async (url, init) => {
      if (url.endsWith('/me')) return {...success(),json:async()=>({id: init.headers.Authorization.includes('synthetic-B') ? 'B' : 'A'})};
      calls.push({ at: now, data: init?.body && JSON.parse(init.body), init });
      return transport(url, init);
    } });
  bytes.set('relay_token','synthetic-A');
  bindFixture(bytes, human());
  bindFixture(bytes, createSkeletonSave({lineage:'skeleton_knight',name:'Bone',answers:[0,0,0,0,0],createdAt:12345}));
  await cloud.token();
  // Scheduler-only fixture: each submitted value is independently proven persisted content.
  // This is NOT production first-binding or proof advancement for local progression.
  const changed = cloud.changed.bind(cloud);
  cloud.changed = save => { bindFixture(bytes, save); changed(save); };
  async function advance(ms) {
    const target = now + ms; let count = 0;
    while (true) {
      const next = [...tasks].sort((a,b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > target) break;
      assert.ok(++count < 1000, 'finite wakeups');
      now = next[1].at; tasks.delete(next[0]); next[1].fn(); await settle();
    }
    now = target; await settle();
  }
  return { cloud, tasks, callbacks, calls, bytes, advance, get now() { return now; } };
}
test('CS1 zero clock debounce, handle zero cancellation and stale callbacks', async () => {
  const h = await schedulerHarness(undefined, 0), s = human();
  h.cloud.changed(s); const stale = h.callbacks[0];
  await h.advance(100); s.gold++; h.cloud.changed(s);
  assert.equal(h.tasks.size, 1); stale(); await settle();
  assert.equal(h.calls.length, 0); await h.advance(299); assert.equal(h.calls.length, 0);
  await h.advance(1); assert.equal(h.calls.length, 1); assert.equal(h.calls[0].data.gold, s.gold);
  assert.equal(h.tasks.size, 0); h.cloud.changed(s); assert.equal(h.tasks.size, 0);
});
test('CS1 acceptance1 100 changes and hidden flushes cannot bypass 429 deadline', async () => {
  let n = 0; const h = await schedulerHarness(async () => ++n === 1 ? limited() : success()), s = human();
  h.cloud.changed(s); await h.advance(300); assert.equal(h.calls.length, 1);
  for (let i = 0; i < 100; i++) {
    s.gold++; h.cloud.changed(s); await h.cloud.flush({ hidden: true });
    assert.ok(h.tasks.size <= 1); await h.advance(10);
  }
  await h.advance(29999); assert.equal(h.calls.length, 1);
  await h.advance(1); assert.equal(h.calls.length, 2); assert.equal(h.calls[1].at, 131300);
  assert.equal(h.calls[1].data.gold, s.gold); assert.equal(h.cloud.pending.size, 0); assert.equal(h.tasks.size, 0);
});
test('CS1 acceptance2 delta/date Retry-After and invalid values use exact lower bound', async () => {
  for (const [header, delay] of [['120',120000], [new Date(220000).toUTCString(),119700],
    [undefined,31000], ['invalid',31000], [new Date(0).toUTCString(),31000], ['-2',31000], ['1',31000]]) {
    let n = 0; const h = await schedulerHarness(async () => ++n === 1 ? limited(header) : success()), s = human();
    h.cloud.changed(s); await h.advance(300); s.gold++; h.cloud.changed(s);
    await h.cloud.flush({ hidden: true }); await h.advance(delay - 1); assert.equal(h.calls.length,1, String(header));
    await h.advance(1); assert.equal(h.calls.length,2, String(header)); assert.equal(h.calls[1].data.gold,s.gold);
    assert.equal(h.tasks.size,0);
  }
});
test('CS1 acceptance3 deferred retry fetch preserves latest pending and wakes after success throttle', async () => {
  let n = 0; const reply = deferred();
  const h = await schedulerHarness(async () => ++n === 1 ? limited() : n === 2 ? reply.promise : success()), s = human();
  h.cloud.changed(s); await h.advance(300); await h.advance(31000); assert.equal(h.calls.length,2);
  s.gold++; h.cloud.changed(s); await h.advance(300);
  await h.cloud.flush({ hidden: true }); assert.equal(h.calls.length,2);
  reply.resolve(success()); await settle();
  assert.equal(h.cloud.pending.get('human').data.gold,s.gold); assert.equal(h.tasks.size,1);
  await h.advance(59999); assert.equal(h.calls.length,2); await h.advance(1);
  assert.equal(h.calls.length,3); assert.equal(h.calls[2].data.gold,s.gold);
  assert.equal(h.cloud.pending.size,0); assert.equal(h.tasks.size,0);
});
test('CS1 acceptance4 repeated429 and generic network retry have one non-bypassable wakeup', async () => {
  for (const [delay, failure] of [[31000, () => limited()], [30000, () => { throw new Error('offline'); }],
    [30000, () => ({ ok:false, status:503 })]]) {
    let n = 0; const h = await schedulerHarness(async () => ++n <= 3 ? failure() : success()), s = human();
    h.cloud.changed(s); await h.advance(300);
    for (let round = 0; round < 3; round++) {
      for (let i = 0; i < 5; i++) { s.gold++; h.cloud.changed(s); await h.cloud.flush({ hidden:true }); assert.equal(h.tasks.size,1); }
      await h.advance(delay - 1); assert.equal(h.calls.length,round + 1);
      await h.advance(1); assert.equal(h.calls.length,round + 2);
    }
    assert.equal(h.cloud.pending.size,0); assert.equal(h.tasks.size,0);
    await h.advance(600000); assert.equal(h.calls.length,4);
  }
});
test('CS1 acceptance5 slots have independent timers, deadlines and in-flight exclusion', async () => {
  const held = deferred(); let humanCalls = 0;
  const h = await schedulerHarness(async (url, init) => {
    const slot = JSON.parse(init.body).charId;
    return slot === 'human' && ++humanCalls === 1 ? limited('120') : slot === 'human' && humanCalls === 2 ? held.promise : success();
  });
  const a = human(), b = createSkeletonSave({ lineage:'skeleton_knight',name:'Bone',answers:[0,0,0,0,0],createdAt:12345 });
  h.cloud.changed(a); await h.advance(100); h.cloud.changed(b); assert.equal(h.tasks.size,2);
  await h.advance(200); assert.equal(h.calls.length,1); await h.advance(100); assert.equal(h.calls.length,2);
  b.gold++; h.cloud.changed(b); a.gold++; h.cloud.changed(a); assert.equal(h.tasks.size,2);
  await h.advance(60000); assert.equal(h.calls.length,3); assert.equal(h.calls[2].data.charId,'skeleton_knight');
  await h.advance(59900); assert.equal(h.calls.length,4);
  a.gold++; h.cloud.changed(a); await h.cloud.flush({hidden:true}); assert.equal(h.calls.length,4);
  held.resolve(success()); await settle(); await h.advance(60000);
  assert.equal(h.calls.length,5); assert.equal(h.calls[4].data.gold,a.gold); assert.equal(h.cloud.pending.size,0); assert.equal(h.tasks.size,0);
});
test('CS1 visible success throttle and hidden exception are separate from backoff', async () => {
  const h = await schedulerHarness(), s = human(); h.cloud.changed(s);
  await h.advance(300); s.gold++; h.cloud.changed(s); await h.cloud.flush();
  await h.advance(59999); assert.equal(h.calls.length,1); await h.advance(1); assert.equal(h.calls.length,2);
  s.gold++; h.cloud.changed(s); await h.cloud.flush({ hidden:true }); assert.equal(h.calls.length,3);
  assert.equal(h.calls[2].init.keepalive,true); assert.equal(h.tasks.size,0);
  // A success at clock zero is still a real success, not an absent timestamp.
  const z = await schedulerHarness(undefined, 0); z.cloud.changed(human()); await z.cloud.flush({ hidden:true });
  const next = human(); next.gold++; z.cloud.changed(next); await z.advance(59999); assert.equal(z.calls.length,1);
  await z.advance(1); assert.equal(z.calls.length,2);
});
test('CS1 acceptance6 deferred verified same-owner auth retains flow; CS2 rejects cross-owner retry', async () => {
  const h = await schedulerHarness(), auth = deferred(); let authCalls = 0;
  const transport = h.cloud.fetcher;
  h.cloud.fetcher = async (url, init) => {
    if (url.endsWith('/me')) { authCalls++; if (authCalls === 1) await auth.promise; }
    return transport(url, init);
  };
  const s = human(); h.cloud.changed(s); h.bytes.set('relay_token','synthetic-A2'); await h.advance(300);
  s.gold++; h.cloud.changed(s); await h.advance(300); const flushing = h.cloud.flush({hidden:true});
  assert.equal(authCalls,1); assert.equal(h.calls.length,0);
  auth.resolve(); await flushing; await settle(); assert.equal(h.calls.length,1); assert.equal(h.tasks.size,1);
  await h.advance(60000); assert.equal(h.calls.length,2); assert.equal(h.calls[1].data.gold,s.gold);
  const fake = 'x.' + Buffer.from(JSON.stringify({ sub:'synthetic',exp:Math.floor(Date.now()/1000)+3600 })).toString('base64url') + '.fake';
  h.bytes.set('relay_token',fake); assert.equal(await h.cloud.token(),fake); assert.equal(authCalls,2);
  h.bytes.set('cocy_auth_token','synthetic-B');
  assert.equal(await h.cloud.token(),'synthetic-B'); assert.equal(authCalls,3);
  let n = 0; const r = await schedulerHarness(async () => ++n === 1 ? limited() : success());
  r.cloud.changed(human()); await r.advance(300); r.bytes.set('relay_token','synthetic-B'); await r.advance(31000);
  assert.equal(r.calls[0].init.headers.Authorization,'Bearer synthetic-A');
  assert.equal(r.calls.length,1, 'CS2 supersedes old replay-as-B oracle'); assert.equal(r.cloud.pending.size,0);
});

test('CS1 P1 hidden global flush cannot overwrite latest other-slot success after 31 seconds', async () => {
  const held = deferred(); let remoteGold, lastKnight = -Infinity;
  const h = await schedulerHarness(async (url, init) => {
    const data = JSON.parse(init.body);
    if (data.charId === 'human') return held.promise;
    if (h.now - lastKnight < 30000) return limited();
    lastKnight = h.now; remoteGold = data.gold; return success();
  });
  const a = human(), b = createSkeletonSave({ lineage:'skeleton_knight',name:'Bone',answers:[0,0,0,0,0],createdAt:12345 });
  h.cloud.changed(a); h.cloud.changed(b); const flushing = h.cloud.flush({hidden:true}); await settle();
  b.gold += 5; h.cloud.changed(b); await h.advance(300);
  assert.equal(h.calls.length,2); assert.equal(h.cloud.pending.has('skeleton_knight'),false);
  await h.advance(31000); held.resolve(success()); await flushing;
  assert.equal(h.calls.length,2); assert.equal(remoteGold,b.gold);
  assert.equal(h.cloud.pending.size,0); assert.equal(h.tasks.size,0);
});
test('CS1 P1 visible global flush re-reads latest other-slot pending after await', async () => {
  const held = deferred();
  const h = await schedulerHarness(async (url, init) => JSON.parse(init.body).charId === 'human' ? held.promise : success());
  const a = human(), b = createSkeletonSave({ lineage:'skeleton_knight',name:'Bone',answers:[0,0,0,0,0],createdAt:12345 });
  h.cloud.changed(a); h.cloud.changed(b); const flushing = h.cloud.flush(); await settle();
  b.gold += 5; h.cloud.changed(b); held.resolve(success()); await flushing;
  const calls = h.calls.filter(c => c.data.charId === 'skeleton_knight');
  assert.equal(calls.length,1); assert.equal(calls[0].data.gold,b.gold);
  assert.equal(h.cloud.pending.size,0); assert.equal(h.tasks.size,0);
});
test('CS1 P2 all three HTTP-date forms mean UTC even in a non-UTC process timezone', async () => {
  const oldTZ = process.env.TZ; process.env.TZ = 'Pacific/Honolulu';
  try {
    for (const header of ['Thu, 01 Jan 1970 00:02:00 GMT','Thursday, 01-Jan-70 00:02:00 GMT','Thu Jan  1 00:02:00 1970']) {
      let n = 0; const h = await schedulerHarness(async () => ++n === 1 ? limited(header) : success(),0);
      h.cloud.changed(human()); await h.advance(300);
      await h.advance(119699); assert.equal(h.calls.length,1,header);
      await h.advance(1); assert.equal(h.calls.length,2,header); assert.equal(h.calls[1].at,120000);
    }
  } finally { if (oldTZ === undefined) delete process.env.TZ; else process.env.TZ = oldTZ; }
});
