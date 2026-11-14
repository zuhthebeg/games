import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { CoopLobby } from '../js/net/lobby.js';
import { CoopSession } from '../js/net/session.js';
import { createSave, validateSave } from '../js/meta/save.js';
import { buildRoundMods } from '../js/meta/run.js';
import { availableStages } from '../js/content/world-map.js';
import { validLobbyProfile } from '../js/net/invasion.js';

// Real shared lobby + ARPG session; only DOM, delivery, storage and clock boundaries are synthetic.
async function fixture(t, { uid = 'host', invite = false, closeImmediately = false } = {}) {
  const timers = new Map(), nodes = new Map(), sockets = [], sessions = [], lost = [];
  let seq = 0, leaves = 0;
  class El {
    constructor() { this.style = {}; this.children = []; this.textContent = ''; }
    set innerHTML(s) { this.html = s; for (const m of s.matchAll(/id="([^"]+)"/g)) { const el = new El(); el.id = m[1]; } }
    get innerHTML() { return this.html || ''; }
    set id(id) { this._id = id; nodes.set(id, this); } get id() { return this._id; }
    appendChild(el) { this.children.push(el); }
    querySelector(s) { return nodes.get(s.replace('#', '')) || null; }
    remove() { nodes.delete(this.id); }
  }
  class Socket {
    constructor() {
      this._ws = { readyState: 1, send() {} }; this.sent = []; this.actions = [];
      this.calls = { rt: 0, reconnect: 0, closed: 0 };
      this.onRt = () => this.calls.rt++; this.onReconnected = () => this.calls.reconnect++; this.onRoomClosed = () => this.calls.closed++;
      sockets.push(this);
    }
    getMyUserId() { return uid; }
    sendRt(p) { this.sent.push(p); }
    sendAction(a) { this.actions.push(a); }
    leave() { this.left = true; this._manualClose = true; }
    close() { this.closed = true; }
    start() {}
  }
  const globals = { window: {}, document: { body: new El(), head: new El(), createElement: () => new El(), getElementById: id => nodes.get(id) || null, querySelector: () => null },
    location: { search: invite ? '?room=INVITE' : '', href: 'https://game.cocy.io/arpg/' }, MultiplayerWSClient: Socket,
    localStorage: { getItem: () => null }, sessionStorage: { getItem: () => uid },
    setInterval: (fn, ms) => { timers.set(++seq, { fn, ms }); return seq; }, clearInterval: id => timers.delete(id),
    fetch: async () => ({ json: async () => ({ rooms: [] }) }) };
  const descriptors = new Map(Object.keys(globals).map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  Object.assign(globalThis, globals);
  t.after(() => { c.close(); for (const [k, d] of descriptors) { if (d) Object.defineProperty(globalThis, k, d); else delete globalThis[k]; } });
  vm.runInThisContext(fs.readFileSync(new URL('../../lib/mp-lobby.js', import.meta.url), 'utf8'));
  const save = createSave({ name: 'LR1', answers: [0,0,0,0,0], weapon: 'blade', createdAt: 1 });
  assert.ok(validateSave(save));
  const profile = { name: save.name, lineage: 'human', role: 'hunter', rewardSave: save, weapon: 'blade', mods: buildRoundMods(save), stages: availableStages(save), threats: { S1: 1 } };
  assert.ok(validLobbyProfile(profile));
  const c = new CoopLobby({ profile, config: { stageId: 'S1', threat: 1 }, onSession: s => sessions.push(s), onLeave: () => leaves++, onLost: x => lost.push(x) });
  c.open();
  if (closeImmediately) c.close();
  for (let i = 0; i < 6; i++) await Promise.resolve();
  const tick = ms => { for (const [id, timer] of [...timers]) if (timers.has(id) && (!ms || timer.ms === ms)) timer.fn(); };
  const enter = room => { c.lobby._enterRoom(room); tick(50); return sockets.at(-1); };
  const roster = () => ({ hostUser: 'host', connections: 2, players: [{ user: 'host' }, { user: 'guest', ready: true }] });
  const start = (ws, fallback = false) => { ws.onRoster({ ...roster(), started: fallback }); if (!fallback) ws.onStarted({ config: { stageId: 'S1', threat: 1 } }); };
  const leave = () => nodes.get('mpl-leave').onclick();
  return { c, sockets, sessions, lost, timers, nodes, tick, enter, roster, start, leave, profile, leaves: () => leaves };
}

for (const uid of ['host', 'guest']) test('first/second/third rooms create real sessions for ' + uid, async t => {
  const f = await fixture(t, { uid });
  for (let room = 1; room <= 3; room++) {
    const ws = f.enter('ROOM' + room);
    assert.equal(f.c.transport, ws, 'adapter follows newly entered room');
    assert.equal(typeof ws.onRt, 'function');
    assert.equal([...f.timers.values()].filter(x => x.ms === 50).length, 1);
    assert.equal([...f.timers.values()].filter(x => x.ms === 500).length, 1);
    f.start(ws, room === 3);
    assert.equal(f.sessions.length, room);
    assert.ok(f.c.session instanceof CoopSession);
    assert.equal(f.c.session.isHost, uid === 'host');
    assert.equal([...f.timers.values()].filter(x => x.ms === 500).length, 0);
    const session = f.c.session;
    f.tick(); ws.onStarted({ config: {} });
    assert.equal(f.c.session, session, 'start and polling are idempotent');
    if (room < 3) { f.leave(); f.tick(50); assert.equal(f.c.lobby._ws, null); assert.equal(f.c.session, null); assert.deepEqual(f.c.pending, []); assert.deepEqual(f.c.partyProfiles, {}); }
  }
});

test('old callbacks and queued profile timers cannot affect the next room, even before observation', async t => {
  const f = await fixture(t); const old = f.enter('ONE');
  old.onRoster(f.roster()); old.onRt('guest', { t: 'party-profile', profile: f.profile });
  assert.ok(f.c.partyProfiles.guest);
  const profileTick = [...f.timers.values()].find(x => x.ms === 500).fn;
  f.c.action({ t: 'old-pending' }); f.leave();
  const before = old.sent.length;
  old.onRoster({ ...f.roster(), started: true }); old.onStarted({ config: {} }); old.onRt('guest', { t: 'party-profile', profile: f.profile });
  old.onEvent({ data: { t: 'stale-action' } }); old.onRoomClosed?.({}); old.onReconnected?.(); profileTick();
  assert.equal(f.sessions.length, 0); assert.equal(old.sent.length, before);
  const ws = f.enter('TWO'); assert.deepEqual(Object.keys(f.c.partyProfiles), ['host']); assert.deepEqual(f.c.pending, []);
  old.onRoster({ players: [], hostUser: 'old' }); old.onStarted({ config: {} }); old.onRt('guest', { t: 'party-profile', profile: f.profile }); old.onEvent({ data: { t: 'stale-action' } });
  assert.notEqual(f.c.lobby._roster.hostUser, 'old'); assert.deepEqual(f.c.pending, []);
  f.tick(500); assert.equal(old.sent.length, before); assert.ok(ws.sent.length >= 2);
  f.start(ws); const session = f.c.session;
  old.onRoomClosed?.({}); old.onReconnected?.(); assert.equal(f.c.session, session); assert.deepEqual(f.lost, []);
});

test('same-wrapper reconnect and in-game handoff retain exactly one hook and shared callbacks', async t => {
  const f = await fixture(t);
  const current = f.enter('ONE'); f.start(current); const session = f.c.session;
  const hooks = ['onRoster','onStarted','onRt','onEvent','onReconnected','onRoomClosed'].map(k => current[k]);
  f.c.lobby._inGame = true; f.c.lobby._hideLobby(); f.tick();
  assert.equal(f.c.session, session); assert.equal(f.c.transport, current);
  assert.deepEqual(['onRoster','onStarted','onRt','onEvent','onReconnected','onRoomClosed'].map(k => current[k]), hooks);
  const peer = { ...f.profile, combatVersion: 10 };
  session.begin({ config: { stageId: 'S1', threat: 1 }, profiles: { host: peer, guest: peer }, seed: 1 });
  assert.notEqual(session.phase, 'prepare', 'real session must begin before resume can run');
  current._ws = { readyState: 1 }; current.onReconnected();
  assert.equal(current.calls.reconnect, 1); assert.equal(session.resumeStats.count, 1);
  current.onRt('guest', { t: 'not-a-protocol-message' }); assert.equal(current.calls.rt, 1);
  current.onRoomClosed({}); assert.equal(current.calls.closed, 1); assert.equal(f.lost.length, 1);
  session.sendRt({ t: 'handoff' }); assert.equal(current.sent.at(-1).t, 'handoff');
  assert.equal(f.c.lobby._roster.hostUser, 'host', 'shared roster callback preserved');
});

for (const invite of [false, true]) test('close/invite leave releases timers and stale callbacks cannot resurrect: ' + invite, async t => {
  const f = await fixture(t, { invite }); const ws = invite ? (f.tick(50), f.sockets[0]) : f.enter('ONE');
  const callbacks = ['onRoster','onStarted','onRt','onEvent','onReconnected','onRoomClosed'].map(k => ws[k]);
  const queued = [...f.timers.values()].map(x => x.fn);
  if (invite) f.leave(); else f.c.close();
  assert.equal(f.leaves(), invite ? 1 : 0); assert.equal(f.timers.size, 0);
  callbacks[0](f.roster()); callbacks[1]({ config: {} }); callbacks[2]('guest', { t: 'party-profile', profile: f.profile }); callbacks[3]({ data: {} }); callbacks[4]?.(); callbacks[5]?.({});
  for (const fn of queued) fn();
  assert.equal(f.sessions.length, 0); assert.equal(f.c.session, null); assert.equal(f.timers.size, 0); assert.deepEqual(f.c.pending, []);
  f.c.lobby._enterRoom('LATE'); assert.equal(f.sockets.length, 1, 'closed lobby cannot reconnect');
});

test('new room is hooked before first delivery and cannot inherit old started roster', async t => {
  const f = await fixture(t); const old = f.enter('ONE'); f.start(old, true); f.leave();
  f.c.lobby._enterRoom('TWO'); const ws = f.sockets.at(-1);
  assert.equal(f.c.transport, ws, 'connect attaches synchronously before first delivery');
  assert.equal(f.sessions.length, 1, 'old started roster must not start a new session');
  f.start(ws); assert.equal(f.sessions.length, 2);
});

test('direct wrapper replacement clears room state and retired session sends cannot target the new room', async t => {
  const f = await fixture(t); const old = f.enter('ONE'); f.start(old); const retired = f.c.session;
  f.c.lobby._ws = null; f.c.lobby._connect(); const ws = f.c.lobby._ws; f.tick(50);
  assert.equal(f.c.transport, ws); assert.equal(f.c.session, null);
  assert.deepEqual(Object.keys(f.c.partyProfiles), ['host']);
  const n = ws.sent.length, oldN = old.sent.length;
  retired.sendRt({ t: 'retired' }); retired.sendAction({ t: 'retired' }); retired.onTransportStale();
  assert.equal(ws.sent.length, n); assert.equal(old.sent.length, oldN); assert.deepEqual(ws.actions, []); assert.deepEqual(old.actions, []);
  f.start(ws); assert.equal(f.sessions.length, 2);
});

test('retired shared presence/state/notice callbacks cannot mutate the next lobby', async t => {
  const f = await fixture(t); const old = f.enter('ONE'); f.leave(); const ws = f.enter('TWO');
  ws.onRoster(f.roster()); const roster = f.c.lobby._roster;
  old.onPresence(99); old.onStateChange({}); old.onNotice({ type: 'error' }); old.onOpen(); old.onPreStartFail('error');
  assert.equal(roster.connections, 2); assert.equal(f.c.lobby._inGame, false);
  ws.onPresence(3); assert.equal(roster.connections, 3, 'current shared presence still works');
});

test('closing before asynchronous shared initialization prevents late room entry', async t => {
  const f = await fixture(t, { invite: true, closeImmediately: true });
  assert.equal(f.sockets.length, 0); assert.equal(f.nodes.has('mpl-lobby'), false);
  const sockets = f.sockets.length;
  f.c.lobby._connect(); f.c.lobby._renderModeSelect();
  assert.equal(f.sockets.length, sockets); assert.equal(f.timers.size, 0);
});

test('re-observing a reused wrapper has one live callback generation', async t => {
  const f = await fixture(t); const ws = f.enter('ONE'); f.start(ws); const retired = f.c.session;
  const oldStarted = ws.onStarted, oldRoster = ws.onRoster;
  f.c.lobby._ws = null; f.tick(50);
  f.c.lobby._roster = { players: [], hostUser: null, connections: 1, started: false };
  f.c.lobby._ws = ws; f.tick(50);
  const n = ws.sent.length;
  oldStarted({ config: {} }); oldRoster({ ...f.roster(), started: true }); retired.sendRt({ t: 'retired' });
  assert.equal(f.sessions.length, 1); assert.equal(ws.sent.length, n);
  ws.onRoster(f.roster()); assert.equal(ws.sent.length, n + 1, 'only the current roster hook sends once');
  assert.equal(f.c.lobby._roster.hostUser, 'host', 'original shared callback still runs');
  ws.onStarted({ config: { stageId: 'S1', threat: 1 } }); assert.equal(f.sessions.length, 2);
});

test('close leaves the current replacement even before observer attaches', async t => {
  const f = await fixture(t); f.enter('ONE');
  const ws = new globalThis.MultiplayerWSClient(); f.c.lobby._ws = ws;
  f.c.close(); assert.ok(ws.left); assert.ok(ws.closed); assert.equal(f.timers.size, 0);
});
