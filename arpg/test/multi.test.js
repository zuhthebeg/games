import test from 'node:test';
import assert from 'node:assert/strict';
import { ABILITIES } from '../js/content/combat.js';
import { createWorld, addPlayer, startStage, step, emptyInput, spawnMonster } from '../js/sim/world.js';
import { InputSender, InputLatch, encodeSnapshot, decodeSnapshot, SnapshotBuffer, partyHpScale } from '../js/net/protocol.js';
import { CoopSession } from '../js/net/session.js';
import { CoopLobby } from '../js/net/lobby.js';
import { createMemoryTransport } from '../js/net/loopback.js';
import { createSave, validateSave } from '../js/meta/save.js';
import { buildRoundMods, createTracker, trackRound, usedConsumables, settleRound } from '../js/meta/run.js';

const makeWorld = (partyHpMult = 1) => {
  const w = createWorld({ seed: 11, partyHpMult }); addPlayer(w, { pid: 'host' }); addPlayer(w, { pid: 'guest', weapon: 'bow' }); startStage(w, 'S2'); step(w); return w;
};
test('input serialization preserves auto attack and all cumulative edges across drops/reordering/duplicates', () => {
  const tx = new InputSender(), rx = new InputLatch();
  const p1 = tx.packet({ mx: .33333, autoAttack: true, dodgeEdge: true, skillEdge: true });
  tx.packet({ dodgeEdge: true, potionEdge: true, manaEdge: true, scrollEdge: true }); // lost
  const p3 = JSON.parse(JSON.stringify(tx.packet({ dodgeEdge: true, attack: true, autoAttack: true })));
  assert.ok(rx.receive(p3, 10)); assert.equal(rx.receive(p1), false); assert.equal(rx.receive(p3), false);
  const a = rx.consume(20), b = rx.consume(20), c = rx.consume(20), d = rx.consume(20);
  assert.equal(a.autoAttack, true); assert.equal(a.attack, true);
  for (const key of ['skillEdge', 'potionEdge', 'manaEdge', 'scrollEdge']) { assert.equal(a[key], true); assert.equal(b[key], false); }
  assert.deepEqual([a.dodgeEdge, b.dodgeEdge, c.dodgeEdge, d.dodgeEdge], [true, true, true, false]);
  const stale = rx.consume(1100); assert.equal(stale.autoAttack, false); assert.equal(stale.mx, 0);
});
test('snapshot JSON roundtrip covers personal HUD, projectiles, action phases and telegraph geometry without sim internals', () => {
  const w = makeWorld();
  w.entities[0].act = { id: 'slash', phase: 'windup', elapsed: 1, total: 10, facing: 1, def: { private: true }, hitIds: new Set([22]) };
  w.projectiles = [{ id: 42, abilityId: 'arrow', x: 4.124, y: 12.123, r: 3, vx: 20, vy: 10 }];
  const p = encodeSnapshot(w), v = decodeSnapshot(JSON.parse(JSON.stringify(p)), 'guest');
  assert.equal(v.entities[0].pid, 'guest'); assert.equal(v.tick, w.tick); assert.equal(v.round.pending.length, w.round.pending.length);
  assert.equal(v.entities.find(e => e.pid === 'host').act.phase, 'windup');
  assert.equal(v.entities.find(e => e.pid === 'host').act.def, ABILITIES.slash);
  assert.deepEqual(v.projectiles[0], { id: 42, abilityId: 'arrow', x: 4.12, y: 12.12, r: 3, vx: 20, vy: 10 });
  assert.equal('rng' in p, false); assert.equal('hitIds' in p.entities[0].act, false); assert.equal('def' in p.entities[0].act, false);
  assert.deepEqual(encodeSnapshot({ ...v, round: { ...v.round, pending: w.round.pending } }), p.entities[0].pid === 'guest' ? p : { ...p, entities: [p.entities[1], p.entities[0], ...p.entities.slice(2)] });
});
test('snapshot interpolation clamps, ignores stale packets, and keeps newest telegraphs authoritative', () => {
  const w = makeWorld(), a = encodeSnapshot(w), buffer = new SnapshotBuffer('guest', 100, { adaptive: false });
  const t0 = w.tick * 1000 / 30;
  buffer.push(a, t0); w.tick += 3; w.entities[1].x += 100;
  const b = encodeSnapshot(w); b.telegraphs = [{ id: 3, phase: 'lock', ox: 100, oy: 200 }]; buffer.push(b, t0 + 100);
  assert.equal(buffer.push(a, t0 + 110), false);
  // Playback is on the host tick clock: halfway between the two ticks = halfway position.
  assert.ok(Math.abs(buffer.sample(t0 + 150).entities[0].x - (a.entities[1].x + 50)) < 1e-6);
  assert.equal(new SnapshotBuffer('guest', 100, { adaptive: false }).sample(0), null);
  // Starvation holds at the newest authoritative frame instead of extrapolating.
  const far = new SnapshotBuffer('guest', 100, { adaptive: false }); far.push(a, t0); far.push(b, t0 + 100);
  assert.ok(Math.abs(far.sample(t0 + 900).entities[0].x - b.entities[1].x) < 1e-6);
  assert.deepEqual(buffer.sample(t0 + 150).telegraphs, b.telegraphs);
});
test('snapshot sampling returns newest active/recovery copies for each passed cast', () => {
  const world = makeWorld(), buffer = new SnapshotBuffer('guest', 0, { adaptive: false });
  const host = world.entities.find(entity => entity.pid === 'host'), stepTicks = { windup: 5, lock: 0, active: 3, recovery: 8 };
  const setAct = (step, phase, elapsed) => {
    host.act = { id: 'slash', step, phase, elapsed, left: 1, total: 5, facing: 0,
      castTick: world.tick - elapsed, phaseTicks: stepTicks, def: ABILITIES.slash };
  };
  const push = (tick, step, phase, elapsed) => {
    world.tick = tick; setAct(step, phase, elapsed);
    return buffer.push(encodeSnapshot(world), tick * 1000 / 30);
  };
  world.tick = 100;
  const firstTick = world.tick;
  setAct(1, 'windup', 4);
  buffer.push(encodeSnapshot(world), firstTick * 1000 / 30);
  buffer.sample(firstTick * 1000 / 30);
  push(firstTick + 1, 1, 'active', 5);
  push(firstTick + 5, 1, 'recovery', 9);
  push(firstTick + 14, 2, 'active', 6);
  const sampled = buffer.sample((firstTick + 14) * 1000 / 30);
  assert.deepEqual(sampled.passedActs.map(row => [row.entityId, row.act.step, row.act.phase]), [
    [host.id, 1, 'recovery'], [host.id, 2, 'active']
  ]);
});
test('party size HP scale is 1.4/1.8/2.15 at stage level (cocy 10-14 softer), party mean level, single unchanged', () => {
  assert.deepEqual([1, 2, 3, 4].map(n => partyHpScale(n, 2, 'S2')), [1, 1.4, 1.8, 2.15]);
  assert.ok(partyHpScale(2, 8, 'S2') > partyHpScale(2, 2, 'S2'));
  const single = makeWorld(1), party = makeWorld(1.6);
  const a = single.entities.find(e => e.kind === 'monster'), b = party.entities.find(e => e.kind === 'monster');
  assert.ok(Math.abs(b.maxHp - a.maxHp * 1.6) <= 1, 'spawn rounds HP only after applying party scale');
});
function pair() {
  const network = createMemoryTransport(), sessions = {}, saves = {}, trackers = {}, receipts = {};
  for (const uid of ['host', 'guest']) {
    const save = createSave({ name: uid, answers: [0,0,0,0,0], weapon: 'blade', createdAt: uid === 'host' ? 1 : 2 });
    saves[uid] = save; trackers[uid] = createTracker(uid === 'host' ? 111 : 222);
    const transport = network.connect(uid, (from, p) => p.t === 'action' ? sessions[uid].action(p.action) : sessions[uid].rt(from, p));
    sessions[uid] = new CoopSession({ uid, host: 'host', players: ['host', 'guest'],
      profile: { name: uid, level: save.level, weapon: 'blade', mods: buildRoundMods(save), threats: { S2: 1 } },
      config: { stageId: 'S2', threat: 1, seed: 11 }, ...transport,
      onFrame: (view, events) => {
        trackers[uid] = trackRound(save, trackers[uid], events, usedConsumables(save, view.entities[0])).tracker;
        if (view.entities[0].terminal && !receipts[uid]) receipts[uid] = settleRound(save, { stageId: 'S2', terminal: view.entities[0].terminal,
          depositedXp: trackers[uid].depositedXp, tempLoot: trackers[uid].tempLoot, used: usedConsumables(save, view.entities[0]) });
      } });
  }
  sessions.guest.update(34, emptyInput());
  return { sessions, saves, trackers, receipts };
}
test('loopback host owns sim, guest input moves relay pid; kill rewards independent; personal return spectates', () => {
  const { sessions: s, trackers, receipts } = pair();
  assert.equal(s.host.phase, 'running'); assert.equal(s.guest.world, null);
  const p = s.host.world.entities.find(e => e.pid === 'guest'), x = p.x;
  s.guest.update(34, { ...emptyInput(), mx: 1, autoAttack: true }); s.host.update(34, emptyInput());
  assert.ok(p.x > x);
  assert.ok(s.host.world.entities.every(e => Number.isFinite(e.x) && Number.isFinite(e.y)));
  // Independent roll reducers, not killer-only ownership; identical delivered kill once per peer.
  const kill = { type: 'kill', monster: 'goblin_grunt', xp: 5, threat: 1, stageId: 'S2', x: 1, y: 2 };
  s.host.journal.push({ seq: ++s.host.eventSeq, event: kill, participants: ['host', 'guest'] });
  s.host.onFrame(s.host.view(), [kill]); s.host.broadcast(); s.host.broadcast();
  assert.equal(trackers.host.killIndex, 1); assert.equal(trackers.guest.killIndex, 1);
  assert.notDeepEqual(trackers.host.tempLoot, trackers.guest.tempLoot);
  p.terminal = 'return_scroll'; s.host.update(34, emptyInput()); s.host.broadcast();
  assert.equal(s.host.world.round.state, 'running'); assert.equal(receipts.guest.receipt.terminal, 'return_scroll');
  assert.ok(validateSave(receipts.guest.save));
  s.host.world.entities.find(e => e.pid === 'host').terminal = 'return_scroll';
  s.host.update(34, emptyInput()); s.host.broadcast();
  assert.equal(s.guest.phase, 'ended'); assert.equal(receipts.host.receipt.terminal, 'return_scroll');
});
test('guest departure removes only that player; host departure notifies guest with no migration', () => {
  const { sessions: s } = pair();
  s.host.roster({ hostUser: 'host', players: [{ user: 'host' }] });
  assert.equal(s.host.world.entities.some(e => e.pid === 'guest'), false);
  let lost = ''; s.guest.onLost = message => { lost = message; };
  s.guest.roster({ hostUser: 'guest', players: [{ user: 'guest' }] });
  assert.match(lost, /방장이 나갔다/); assert.equal(s.guest.world, null); assert.equal(s.guest.host, 'host');
});
test('unacknowledged event journal repeats until guest receives and acks, never double deposits', () => {
  const { sessions: s, trackers } = pair();
  const send = s.host.sendRt; s.host.sendRt = () => {};
  const m = spawnMonster(s.host.world, 'goblin_grunt', 340, 400);
  s.host.journal.push({ seq: ++s.host.eventSeq, event: { type: 'kill', monster: m.type, xp: 5, stageId: 'S2', threat: 1 }, participants: ['host','guest'] });
  s.host.broadcast(); assert.equal(trackers.guest.killIndex, 0);
  s.host.sendRt = send; s.host.world.tick++; s.host.broadcast();
  assert.equal(trackers.guest.killIndex, 1);
  s.host.world.tick++; s.host.broadcast(); assert.equal(trackers.guest.killIndex, 1);
  s.guest.update(34, emptyInput()); s.host.broadcast(); assert.equal(s.host.journal.length, 0);
});
test('personal death is settled once, party continues; spectators do not roll later kills', () => {
  const { sessions: s, trackers, receipts } = pair();
  const p = s.host.world.entities.find(e => e.pid === 'guest');
  p.hp = 0; p.dead = true; p.terminal = 'death';
  s.host.update(34, emptyInput()); s.host.broadcast();
  assert.equal(receipts.guest.receipt.terminal, 'death');
  assert.equal(s.host.world.round.state, 'running');
  const index = trackers.guest.killIndex;
  s.host.journal.push({ seq: ++s.host.eventSeq, event: { type: 'kill', monster: 'goblin_grunt', xp: 5, stageId: 'S2' }, participants: ['host'] });
  s.host.world.tick++; s.host.broadcast();
  assert.equal(trackers.guest.killIndex, index);
  assert.ok(validateSave(receipts.guest.save));
});
test('silent host timeout reports one honest return path with no guest sim', () => {
  const { sessions: s } = pair();
  let lost = 0; s.guest.onLost = () => lost++;
  for (let i = 0; i < 45; i++) s.guest.update(250, emptyInput());
  assert.equal(lost, 1); assert.equal(s.guest.world, null);
});
test('lobby keeps startConfig callable and catches started-before-hook without onGameStart', async () => {
  const originals = Object.fromEntries(['window', 'location', 'document'].map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  let options, timer, attached;
  class FakeLobby {
    constructor(opts) {
      options = opts; this._roster = { hostUser: 'host', started: false, players: [{ user: 'host' }, { user: 'guest' }] };
      this._ws = { _started: true, getMyUserId: () => 'host', sendRt() {}, sendAction() {}, leave() {} };
    }
    _syncLobby() {} _renderLobby() {} _hideModeSelect() {} _hideLobby() {} _hideResult() {}
  }
  try {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { MultiplayerLobby: FakeLobby } });
    Object.defineProperty(globalThis, 'location', { configurable: true, value: { search: '' } });
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { querySelector: () => null } });
    let resolveReady;
    const ready = new Promise((resolve, reject) => { resolveReady = resolve; timer = setTimeout(() => reject(new Error('hook did not catch ws._started')), 1000); });
    attached = new CoopLobby({ profile: { level: 1 }, config: { stageId: 'S2', threat: 1 }, onLeave() {}, onSession: resolveReady });
    attached.open();
    assert.equal(typeof options.startConfig, 'function'); assert.deepEqual(options.startConfig(), { stageId: 'S2', threat: 1, invasion: false });
    const session = await ready;
    assert.equal(session.host, 'host'); assert.equal(session.uid, 'host'); assert.equal(session.phase, 'prepare');
  } finally {
    clearTimeout(timer); attached?.close();
    for (const [k, descriptor] of Object.entries(originals)) if (descriptor) Object.defineProperty(globalThis, k, descriptor); else delete globalThis[k];
  }
});

test('index.html loads the shared relay + lobby libs before the game module (merge regression 10-11)', async () => {
  const { readFile } = await import('node:fs/promises');
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const at = s => html.indexOf(s);
  assert.ok(at('/lib/multiplayer.js') > 0, 'multiplayer.js script tag missing');
  assert.ok(at('/lib/mp-lobby.js') > at('/lib/multiplayer.js'), 'mp-lobby.js must load after multiplayer.js');
  assert.ok(at('src="js/main.js') > at('/lib/mp-lobby.js'), 'lobby must load before the game module');
});
test('melee guard: blade pawns take ×0.8 direct hits, bow/focus unchanged (cocy 10-14)', async () => {
  const { createWorld, addPlayer, spawnMonster, step, emptyInput } = await import('../js/sim/world.js');
  const hit = weapon => {
    const w = createWorld({ seed: 3 }); const p = addPlayer(w, { pid: 'a', weapon, x: 400, y: 400, mods: { maxHp: 10000 } });
    const m = spawnMonster(w, 'goblin_grunt', 440, 400); m.spawnLeft = 0;
    for (let i = 0; i < 300 && p.hp === p.maxHp; i++) step(w, { a: emptyInput() });
    return p.maxHp - p.hp;
  };
  const blade = hit('blade'), bow = hit('bow');
  assert.ok(bow > 0);
  assert.equal(blade, Math.max(1, Math.round(bow * 0.8)));
  assert.equal(addPlayer(createWorld(), { pid: 'x', weapon: 'bow' }).guard, undefined);
});
