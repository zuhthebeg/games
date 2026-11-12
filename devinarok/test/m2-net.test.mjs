import assert from 'node:assert/strict';
import test from 'node:test';
import { AttackInputAssistant, buildPartyAssistedInput } from '../js/core/attack-assist.js';
import { InputLayer } from '../js/core/input.js';
import { ServerClock } from '../js/net/clock.js';
import { ClockInputScheduler } from '../js/net/clock-input-scheduler.js';
import { CastTimeline, castVisualKey } from '../js/net/cast-timeline.js';
import { escapeHtml } from '../js/ui/escape-html.js';
import { handlePauseKey } from '../js/ui/pause-menu.js';
import { InterpolationBuffer } from '../js/net/interp.js';
import { isCounterCast, scoreCastHitAgreement } from '../js/net/hit-agreement.js';
import { InputQueue } from '../js/net/input-queue.js';
import { NetSession } from '../js/net/net-session.js';
import { computeBotPolicy } from '../js/net/bot-policy.js';
import { PartyClient, partyServerUrl } from '../js/ui/party.js';
import { partyHttpBase, partyRoomsMarkup, quickJoinParty, sortPartyRooms } from '../js/ui/party-finder.js';
import { Predictor } from '../js/net/predictor.js';
import { playerModelKey } from '../js/render/player-look.js';
import { decodeMessage, encodeMessage, PROTOCOL_VERSION, roundToHundredth } from '../js/net/protocol.js';
import { BUTTONS, createStageWorld } from '../js/sim/world.js';
import { effectiveStageLevel, STAGE_LIST, STAGES } from '../js/content/stages.js';

test('server counter upgrades a predicted basic cast instead of being deduplicated', () => {
  const timeline = new CastTimeline({ playerId: 'hero' });
  const predicted = timeline.predictInput({ seq: 9, buttons: BUTTONS.ATTACK }, 0);
  const basicKey = castVisualKey(predicted);
  const counterEvent = {
    eventId: 1,
    type: 'cast',
    castId: 'hero:9',
    playerId: 'hero',
    skillId: 'counter',
    family: 'sword',
  };

  const result = timeline.ingestEvents([counterEvent], 20);
  assert.equal(result.spawned.length, 0);
  assert.equal(result.attached[0], predicted);
  assert.equal(predicted.skillId, 'counter');
  assert.equal(predicted.skill, 'counter');
  assert.equal(predicted.kind, 'counter');
  assert.equal(predicted.confirmed, true);
  assert.notEqual(basicKey, castVisualKey(counterEvent));
  assert.equal(castVisualKey(predicted), castVisualKey(counterEvent));
});

test('hit agreement classifies server and client-predicted counters separately', () => {
  assert.equal(isCounterCast({ serverStrikeTicks: [{ skill: 'counter' }] }), true);
  assert.equal(isCounterCast({ clientCastStep: 'counter' }), true);
  assert.equal(isCounterCast({ clientSteps: [{ playerState: { castStep: 'counter' } }] }), true);
  assert.equal(isCounterCast({ serverStrikeTicks: [{ skill: 0 }], clientCastStep: 1 }), false);
});

test('protocol round trips compact snapshots and rounds spatial values', () => {
  const message = {
    t: 'snap',
    v: PROTOCOL_VERSION,
    tick: 88,
    ack: 9,
    ents: [{
      id: 12,
      kind: 'player',
      x: 1.234,
      z: -2.345,
      facing: 1.239,
      hp: 75,
      playerId: 'hero',
      characterKind: 'knight',
      look: { weapon: '2H_Sword', helmet: true, cape: true, weaponRarity: 'rare' },
      motion: { x: 1.235, z: -2.345, facing: -1.236 },
      counterReadyTicks: 42,
      counterAttackerId: 8,
      perfectPaid: true,
      dodgeStartTick: 17,
    }],
    events: [{ eventId: 4, type: 'hit', shape: { originX: 0.129, originZ: 1.999, angle: 2.345 } }],
  };
  const result = decodeMessage(encodeMessage(message));
  assert.equal(result.ents[0].x, roundToHundredth(message.ents[0].x));
  assert.equal(result.ents[0].z, roundToHundredth(message.ents[0].z));
  assert.equal(result.ents[0].facing, roundToHundredth(message.ents[0].facing));
  assert.equal(result.ents[0].counterReadyTicks, 42);
  assert.equal(result.ents[0].counterAttackerId, 8);
  assert.equal(result.ents[0].perfectPaid, true);
  assert.equal(result.ents[0].dodgeStartTick, 17);
  assert.equal(result.ents[0].motion.x, roundToHundredth(message.ents[0].motion.x));
  assert.equal(result.ents[0].playerId, 'hero');
  assert.equal(result.events[0].shape.angle, roundToHundredth(message.events[0].shape.angle));
  assert.equal(result.v, PROTOCOL_VERSION);
});

test('remote player model selection falls back to knight for older snapshots', () => {
  assert.equal(playerModelKey({ kind: 'player' }), 'knight');
  assert.equal(playerModelKey({ kind: 'player', characterKind: 'Rogue_Hooded' }), 'Rogue_Hooded');
});

test('snapshot encoding preserves potion loot type for full and incremental frames', () => {
  for (const full of [true, false]) {
    const decoded = decodeMessage(encodeMessage({
      t: 'snap',
      full,
      ents: [{ id: 12, kind: 'loot', x: 1.23, z: -4.56, ownerId: 'hero', lootType: 'potion' }],
    }));
    assert.equal(decoded.ents[0].lootType, 'potion');
    assert.equal(decoded.ents[0].ownerId, 'hero');
  }
});

test('snapshot delta merging preserves a newly seen player look', () => {
  const received = [];
  const session = new NetSession({
    autoFlushInputs: false,
    autoPing: false,
    onMessage: (message) => received.push(message),
  });
  const socket = { close() {} };
  session.socket = socket;
  const player = {
    id: 12,
    kind: 'player',
    playerId: 'remote',
    characterKind: 'knight',
    look: { weapon: '2H_Sword', helmet: true, cape: true, weaponRarity: 'legendary' },
    x: 1,
    z: 2,
  };
  const receive = (message) => session.handleSocketMessage(socket, { data: encodeMessage(message) });
  receive({ t: 'snap', full: true, tick: 10, ents: [] });
  receive({ t: 'snap', full: false, tick: 12, baseTick: 10, ents: [player] });
  receive({ t: 'snap', full: false, tick: 14, baseTick: 12, ents: [{ id: 12, hp: 80 }] });

  assert.deepEqual(received[1].ents[0].look, player.look);
  assert.equal(received[2].ents[0].characterKind, 'knight');
  assert.deepEqual(received[2].ents[0].look, player.look);
  session.close();
});

test('escapeHtml encodes peer-controlled names before HTML insertion', () => {
  assert.equal(escapeHtml(`<img src=x onerror="alert('x')">&`), '&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;&amp;');
});

test('Escape and R toggle the co-op pause menu without a solo loop', () => {
  const state = { loop: null, partyClient: {}, world: { mode: 'stage' }, pauseMenu: { hidden: true } };
  assert.equal(handlePauseKey('Escape', state), true);
  assert.equal(state.pauseMenu.hidden, false);
  assert.equal(handlePauseKey('KeyR', state), true);
  assert.equal(state.pauseMenu.hidden, true);
});

test('hit agreement excuses client targets dead by the last authoritative strike only', () => {
  const score = scoreCastHitAgreement({
    clientWouldHit: [1, 2, 3],
    serverHitSet: [2, 4],
    serverStrikeTicks: [{ tick: 10 }, { tick: 12 }],
    enemyDeathEvents: [
      { entityId: 1, tick: 12 },
      { entityId: 3, tick: 13 },
      { entityId: 4, tick: 9 },
    ],
  });
  assert.equal(score.lastServerStrikeTick, 12);
  assert.deepEqual(score.rawDisagreementTargets, [1, 3, 4]);
  assert.deepEqual(score.excusedTargets, [1]);
  assert.deepEqual(score.disagreementTargets, [3, 4]);
  assert.equal(score.exactMatch, false);

  const noStrikes = scoreCastHitAgreement({
    clientWouldHit: [1],
    serverHitSet: [],
    enemyDeathEvents: [{ entityId: 1, tick: 1 }],
  });
  assert.deepEqual(noStrikes.excusedTargets, []);
  assert.equal(noStrikes.lastServerStrikeTick, null);
});

test('hit agreement excuses a single-target line when every client target died before the strike', () => {
  const score = scoreCastHitAgreement({
    clientWouldHit: [22],
    serverHitSet: [27],
    serverStrikeTicks: [{ tick: 100 }],
    enemyDeathEvents: [{ entityId: 22, tick: 99 }],
  });
  assert.equal(score.allClientTargetsDead, true);
  assert.deepEqual(score.disagreementTargets, []);
  assert.equal(score.exactMatch, true);
});

test('party server URL appends the room path and honors local overrides', () => {
  assert.equal(
    partyServerUrl('ABC234', ''),
    'wss://relay-do-poc.zuhejbeg.workers.dev/devinarok/ABC234',
  );
  assert.equal(
    partyServerUrl('ABC234', '?server=ws%3A%2F%2F127.0.0.1%3A8788'),
    'ws://127.0.0.1:8788/devinarok/ABC234',
  );
  assert.equal(
    partyServerUrl('ABC234', '?server=ws%3A%2F%2Flocalhost%2Fdevinarok'),
    'ws://localhost/devinarok/ABC234',
  );
  assert.equal(
    partyServerUrl('ABC234', '?dev=1&netDebug=1&server=ws%3A%2F%2F127.0.0.1%3A8798'),
    'ws://127.0.0.1:8798/devinarok/ABC234?debug=1',
  );
  assert.equal(
    partyServerUrl('ABC234', '?netDebug=1&server=ws%3A%2F%2F127.0.0.1%3A8798'),
    'ws://127.0.0.1:8798/devinarok/ABC234',
  );
});

test('party finder derives HTTP base, sorts rooms, and escapes host names', () => {
  assert.equal(partyHttpBase('?server=ws://127.0.0.1:8787'), 'http://127.0.0.1:8787');
  assert.equal(partyHttpBase('?server=wss://example.test/devinarok/ABC234'), 'https://example.test');
  const rooms = sortPartyRooms([
    { roomId: 'devinarok:A', players: 1, updatedAt: 20, meta: { hostName: '<script>', code: 'ABC234', stageId: 'C1' } },
    { roomId: 'devinarok:B', players: 2, updatedAt: 10, meta: { hostName: '기사', code: 'BCD345', stageId: 'C2', difficulty: 'nightmare' } },
  ]);
  assert.equal(rooms[0].meta.code, 'BCD345');
  const markup = partyRoomsMarkup(rooms, 1);
  assert.ok(!markup.includes('<script>'));
  assert.ok(markup.includes('&lt;script&gt;'));
  assert.ok(markup.includes('권장 Lv.'));
  assert.ok(markup.includes('악몽'));
  const nightmareLevel = effectiveStageLevel(STAGE_LIST.find((stage) => stage.id === 'C2'), 'nightmare');
  assert.equal(markup.split(`권장 Lv.${nightmareLevel}`).length - 1, 2);
  assert.ok(markup.includes('class="party-row-join">참가</b>'));
  const riftMarkup = partyRoomsMarkup([
    { roomId: 'devinarok:RIFT7', players: 1, meta: { stageId: 'R7', difficulty: 'normal' } },
  ], 1);
  assert.ok(riftMarkup.includes('심연 균열 7층'));
  assert.ok(riftMarkup.includes(`권장 Lv.${STAGES.R7.recommendedLevel}`));
});

test('quick join joins a match, creates when empty, and retries a failed room once', async () => {
  const joined = [];
  const created = [];
  const joinedResult = await quickJoinParty({
    httpBase: 'http://local',
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ roomId: 'devinarok:ABC234', meta: { code: 'ABC234' } }),
    }),
    joinRoom: async (code) => joined.push(code),
    createRoom: async () => 'NEW234',
  });
  assert.deepEqual(joined, ['ABC234']);
  assert.deepEqual(joinedResult, { code: 'ABC234', created: false });

  const emptyResult = await quickJoinParty({
    httpBase: 'http://local',
    fetchImpl: async () => ({ ok: true, json: async () => ({ roomId: null }) }),
    joinRoom: async () => assert.fail('must not join an empty match'),
    createRoom: async () => { created.push(true); return 'NEW234'; },
  });
  assert.deepEqual(emptyResult, { code: 'NEW234', created: true });
  assert.equal(created.length, 1);

  let fetchCount = 0;
  let attempts = 0;
  const retryResult = await quickJoinParty({
    httpBase: 'http://local',
    fetchImpl: async () => {
      fetchCount += 1;
      return {
        ok: true,
        json: async () => ({
          roomId: `devinarok:ABC23${fetchCount}`,
          meta: { code: `ABC23${fetchCount}` },
        }),
      };
    },
    joinRoom: async () => {
      attempts += 1;
      throw new Error('room-full');
    },
    createRoom: async () => 'NEW234',
  });
  assert.deepEqual(retryResult, { code: 'NEW234', created: true });
  assert.equal(fetchCount, 2);
  assert.equal(attempts, 2);
});

test('quick join reports lookup failures instead of creating a room', async () => {
  const failures = [
    ['HTTP error', async () => ({ ok: false, status: 503 })],
    ['network error', async () => { throw new Error('offline'); }],
    ['invalid JSON', async () => ({ ok: true, json: async () => { throw new SyntaxError('bad JSON'); } })],
  ];
  for (const [label, fetchImpl] of failures) {
    let created = false;
    await assert.rejects(quickJoinParty({
      httpBase: 'http://local',
      fetchImpl,
      joinRoom: async () => assert.fail(`${label} must not join a room`),
      createRoom: async () => { created = true; return 'NEW234'; },
    }), { code: 'match-lookup-failed' });
    assert.equal(created, false, `${label} must not create a room`);
  }
});

test('quick join does not create after an unrelated room-join failure', async () => {
  let created = false;
  await assert.rejects(quickJoinParty({
    httpBase: 'http://local',
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ roomId: 'devinarok:ABC234' }),
    }),
    joinRoom: async () => { throw new Error('connect-failed'); },
    createRoom: async () => { created = true; return 'NEW234'; },
  }), { message: 'connect-failed' });
  assert.equal(created, false);
});

test('quick join cancellation does not create a room', async () => {
  const controller = new AbortController();
  let created = false;
  await assert.rejects(quickJoinParty({
    httpBase: 'http://local',
    signal: controller.signal,
    fetchImpl: async () => {
      controller.abort();
      throw new Error('aborted');
    },
    joinRoom: async () => {},
    createRoom: async () => { created = true; return 'NEW234'; },
  }), { name: 'AbortError' });
  assert.equal(created, false);
});

test('party client sends an explicit leave message', () => {
  const sent = [];
  const client = Object.create(PartyClient.prototype);
  client.session = { send: (message) => { sent.push(message); return true; } };

  assert.equal(client.leave(), true);
  assert.deepEqual(sent, [{ t: 'leave' }]);
});

test('party hello character includes saved mastery and talents', () => {
  const originalConnect = NetSession.prototype.connect;
  let session;
  NetSession.prototype.connect = function connect() {
    session = this;
    return null;
  };
  const client = new PartyClient({
    character: {
      name: 'Hero',
      level: 4,
      potions: 2,
      clearedStages: ['C1'],
      mastery: { spin: 73 },
      talents: { sword: { 'sw-edge': 2 }, crossbow: {}, staff: {} },
    },
  });

  try {
    assert.equal(client.joinRoom('ABC234'), 'ABC234');
    assert.deepEqual(session.character, {
      level: 4,
      lineage: 'human',
      equipment: [],
      potions: 2,
      clearedStages: ['C1'],
      mastery: { spin: 73 },
      talents: { sword: { 'sw-edge': 2 }, crossbow: {}, staff: {} },
    });
  } finally {
    client.close();
    NetSession.prototype.connect = originalConnect;
  }
});

test('party rendering does not mutate the predictor player position', () => {
  const player = { id: 1, kind: 'player', playerId: 'self', x: 1, z: 2 };
  const interpolation = new InterpolationBuffer();
  interpolation.addSnapshot({ tick: 100, receivedAt: 1000, entities: [] });
  interpolation.addSnapshot({ tick: 102, receivedAt: 1067, entities: [] });
  const client = Object.create(PartyClient.prototype);
  client.stageWorld = { tick: 7, entities: [] };
  client.playerId = 'self';
  client.predictor = {
    getPlayer: () => player,
    getVisualPosition: () => ({ x: 9, z: 8 }),
  };
  client.session = { clock: { getEstimate: () => 104 } };
  client.interpolation = interpolation;
  client.reviveProgress = new Map();
  client.frameTelemetry = [];
  const objective = { type: 'hunt', state: 'active', roomIndex: 2, endsTick: 900 };
  client.lastSnapshot = { tick: 7, ev: [], roomIndex: 0, openDoors: [], objective };

  const view = client.viewWorld(1100);
  assert.equal(view.entities[0].x, 9);
  assert.equal(view.entities[0].z, 8);
  assert.equal(view.objective, objective);
  assert.equal(player.x, 1);
  assert.equal(player.z, 2);
  assert.ok(client.frameTelemetry[0].renderTick < interpolation.snapshots.at(-1).tick);
});

test('party auto-attack targets a live enemy snapshot in a two-player party', () => {
  const stageWorld = createStageWorld({
    seed: 251,
    stageId: 'C1',
    playerId: 'self',
    inputDriven: true,
    party: [{ playerId: 'self' }, { playerId: 'ally' }],
  });
  const player = stageWorld.entities.find((entity) => entity.kind === 'player' && entity.playerId === 'self');
  const ally = stageWorld.entities.find((entity) => entity.kind === 'player' && entity.playerId === 'ally');
  const enemy = stageWorld.entities.find((entity) => entity.kind === 'enemy');
  player.facing = 0;
  Object.assign(enemy, { dead: true, state: 'dead', x: player.x + 50, spawnTicksLeft: 0 });
  const sampledTicks = [];
  const client = Object.create(PartyClient.prototype);
  client.stageWorld = stageWorld;
  client.playerId = 'self';
  client.runSnapshotReady = true;
  client.status = 'connected';
  client.inputTerminated = false;
  client.versionMismatch = false;
  client.result = null;
  client.predictor = {
    getPlayer: () => player,
    getVisualPosition: () => ({ x: player.x, z: player.z }),
    applyLocalInput: () => {},
  };
  client.session = { clock: { getEstimate: () => 100 }, queueInput: () => {} };
  client.castTimeline = { predictInput: () => {} };
  client.interpolation = {
    snapshots: [],
    sample: () => ({
      renderTick: 104.6,
      entities: [
        { ...ally },
        {
          ...enemy,
          dead: false,
          state: 'idle',
          invulnerable: false,
          spawnTicksLeft: 0,
          x: player.x + 1.5,
          z: player.z,
        },
      ],
    }),
    sampleAtRenderTick: (tick) => {
      sampledTicks.push(tick);
      return {
        renderTick: tick,
        entities: [
          { ...ally },
          {
            ...enemy,
            dead: false,
            state: 'idle',
            invulnerable: false,
            spawnTicksLeft: 0,
            x: player.x + 1,
            z: player.z + 0.5,
          },
        ],
      };
    },
  };
  client.lastSnapshot = {
    tick: 20,
    ev: [],
    roomIndex: 0,
    openDoors: stageWorld.openDoors,
    activeEnemyIds: [enemy.id],
  };
  client.reviveProgress = new Map();
  client.frameTelemetry = [];

  const world = client.viewWorld(100);
  const viewedEnemy = world.entities.find((entity) => entity.id === enemy.id);
  assert.deepEqual(
    {
      kind: viewedEnemy.kind,
      dead: viewedEnemy.dead,
      state: viewedEnemy.state,
      invulnerable: viewedEnemy.invulnerable,
      spawnTicksLeft: viewedEnemy.spawnTicksLeft,
      x: viewedEnemy.x,
      z: viewedEnemy.z,
    },
    {
      kind: 'enemy',
      dead: false,
      state: 'idle',
      invulnerable: false,
      spawnTicksLeft: 0,
      x: player.x + 1.5,
      z: player.z,
    },
  );
  const inputView = client.getInputViewSample(100);
  assert.equal(inputView.viewTick, 105);
  const input = buildPartyAssistedInput(
    new AttackInputAssistant(),
    { seq: 1, moveX: 0, moveZ: 0, aim: 192, buttons: 0, attackHeld: false },
    client,
    player,
    { autoAttack: true, inputView },
  );
  assert.equal(input.buttons & BUTTONS.ATTACK, BUTTONS.ATTACK);
  assert.equal(input.aim, 19);
  const sent = client.sendInput(input, inputView);
  assert.equal(sent.viewTick, 105);
  assert.deepEqual(sampledTicks, [sent.viewTick]);
});

test('party resets run prediction state to each first full snapshot', () => {
  let now = 50000;
  const client = Object.create(PartyClient.prototype);
  client.session = new NetSession({
    now: () => now,
    autoFlushInputs: false,
    autoPing: false,
  });
  client.playerId = 'self';
  client.status = 'connected';
  client.inputTerminated = false;
  client.character = { name: 'Hero', level: 1, potions: 3 };
  client.equipment = [];
  client.onSnapshot = () => {};
  client.onEvents = () => {};
  client.reviveProgress = new Map();
  client.eventIds = new Set();
  client.seenEventIds = new Set();
  client.runId = null;
  client.result = null;

  const beginRun = (runId) => client.startRun({
    runId,
    seed: 17,
    stageId: 'C1',
    tick: 0,
    party: [
      { playerId: 'self', name: 'Hero', level: 1 },
      { playerId: 'other', name: 'Ally', level: 1 },
    ],
  });
  const receiveFirstFull = () => {
    const entities = structuredClone(client.stageWorld.entities);
    client.handleSnapshot({
      t: 'snap',
      full: true,
      tick: 0,
      ack: 0,
      ents: entities,
      openDoors: client.stageWorld.openDoors,
      ev: [],
    });
  };

  client.session.inputs.set(7, { seq: 7 });
  client.session.clock.makePing(now);
  client.session.clock.observePong({ c: now, t: 1500 }, now + 100);
  beginRun('run-1');
  assert.equal(client.session.inputs.size, 0);
  assert.equal(client.session.clock.samples, 0);
  assert.equal(client.predictor, null);
  assert.equal(client.runSnapshotReady, false);
  receiveFirstFull();
  assert.equal(client.predictor.getPlayer().playerId, 'self');
  assert.equal(client.interpolation.snapshots.length, 1);
  assert.equal(client.inputReady, true);

  const firstRunPing = client.session.clock.makePing(now);
  now += 100;
  client.session.clock.observePong({ c: firstRunPing.c, t: 3 }, now);
  assert.equal(client.inputReady, true);
  client.castTimeline.predictInput({ seq: 1, buttons: BUTTONS.ATTACK }, now);
  client.session.queueInput({ seq: 7 });
  client.seenEventIds.add(1);
  const firstPredictor = client.predictor;

  beginRun('run-2');
  assert.equal(client.session.inputs.size, 0);
  assert.equal(client.session.clock.samples, 0);
  assert.equal(client.predictor, null);
  assert.equal(client.interpolation.snapshots.length, 0);
  assert.equal(client.castTimeline.casts.size, 0);
  assert.equal(client.seenEventIds.size, 0);
  receiveFirstFull();
  assert.notEqual(client.predictor, firstPredictor);
  assert.equal(client.interpolation.snapshots.length, 1);
  assert.equal(client.inputReady, true);
  client.session.close();
});

test('party clears queued inputs and blocks submission after reconnect expiry', () => {
  const client = Object.create(PartyClient.prototype);
  client.status = 'connected';
  client.inputTerminated = false;
  client.versionMismatch = false;
  client.runSnapshotReady = true;
  client.result = null;
  client.session = {
    inputs: new Map([[1, { seq: 1 }]]),
    clock: { samples: 1 },
  };
  client.onStatus = () => {};

  client.handleStatus('disconnected');
  assert.equal(client.inputReady, false);
  assert.equal(client.session.inputs.size, 0);
  assert.equal(client.sendInput({ seq: 2, buttons: BUTTONS.ATTACK }), null);
  assert.equal(client.session.inputs.size, 0);
});

test('downed local prediction ignores movement and actions, including pending replay', () => {
  const player = {
    id: 1,
    playerId: 'self',
    x: 2,
    z: 3,
    downed: true,
    attack: null,
    skillCast: null,
    previousButtons: BUTTONS.ATTACK,
    lastInput: { seq: 0, moveX: 0, moveZ: 0, aim: 0, buttons: BUTTONS.ATTACK },
  };
  const predictor = new Predictor({ player, ctx: { arena: {}, tick: 10 } });
  const result = predictor.applyLocalInput({
    seq: 1,
    moveX: 127,
    moveZ: -127,
    buttons: BUTTONS.ATTACK,
  });
  assert.equal(result.motion, null);
  assert.equal(result.player.x, 2);
  assert.equal(result.player.z, 3);
  assert.equal(result.player.attack, null);
  assert.deepEqual(predictor.pendingInputs[0], {
    seq: 1,
    moveX: 0,
    moveZ: 0,
    aim: 0,
    buttons: 0,
  });
  predictor.reconcile({
    tick: 11,
    ack: 0,
    player: { ...player },
  });
  assert.equal(predictor.getPlayer().x, 2);
  assert.equal(predictor.getPlayer().z, 3);
  assert.equal(predictor.getPlayer().attack, null);
});

test('predictor reconcile keeps the visual path continuous and converges to authority', () => {
  const predictor = new Predictor({
    player: { id: 1, playerId: 'self', x: 0, z: 0, facing: 0 },
    ctx: { arena: {}, tick: 0 },
  });
  predictor.simulate = function simulate() {
    this.ctx.tick += 1;
    this.player.x += 1;
  };

  for (let seq = 1; seq <= 3; seq += 1) {
    predictor.applyLocalInput({ seq }, (seq - 1) * 1000 / 30);
  }
  const beforeCorrection = predictor.getVisualPosition(100);
  const authoritative = { ...predictor.getPlayer(), x: 2.8, z: 0 };
  const result = predictor.reconcile({
    tick: 3,
    ack: 3,
    player: authoritative,
  }, 100);

  assert.equal(result.snapped, false);
  assert.ok(Math.abs(predictor.getVisualPosition(100).x - beforeCorrection.x) < 1e-9);
  assert.ok(predictor.getVisualPosition(160).x < beforeCorrection.x);
  assert.ok(Math.abs(predictor.getVisualPosition(220).x - authoritative.x) < 1e-9);
});

test('30 Hz predictor interpolation removes repeated poses in 60 Hz sampling', () => {
  const predictor = new Predictor({
    player: { id: 1, playerId: 'self', x: 0, z: 0, facing: 0 },
    ctx: { arena: {}, tick: 0 },
  });
  predictor.simulate = function simulate() {
    this.ctx.tick += 1;
    this.player.x += 1;
  };

  const frameIntervalMs = 1000 / 60;
  const legacyPositions = [];
  const interpolatedPositions = [];
  for (let frame = 0; frame < 120; frame += 1) {
    const now = frame * frameIntervalMs;
    if (frame % 2 === 0) predictor.applyLocalInput({ seq: frame / 2 + 1 }, now);
    legacyPositions.push(predictor.getPlayer().x);
    interpolatedPositions.push(predictor.getVisualPosition(now).x);
  }
  const repeatedFrames = (positions) => positions.slice(1).filter((position, index) => (
    Math.abs(position - positions[index]) < 1e-9
  )).length * 100 / (positions.length - 1);

  assert.ok(Math.abs(repeatedFrames(legacyPositions) - 50) < 1);
  assert.equal(repeatedFrames(interpolatedPositions), 0);
});

test('shared bot policy targets, dodges telegraphs, and enters cleared-room doors', () => {
  const player = {
    x: 0,
    z: 0,
    hp: 100,
    maxHp: 100,
    potions: 0,
    radius: 0.32,
    lastInput: { aim: 0 },
    attack: null,
    skillCast: null,
    dodgeCooldownTicks: 0,
  };
  const target = { id: 2, kind: 'enemy', x: 1, z: 0, state: 'idle' };
  const viewed = { entities: [target], activeEnemyIds: [target.id] };
  const attack = computeBotPolicy({ player, viewed });
  assert.equal(attack.buttons, BUTTONS.ATTACK);

  const threat = {
    id: 3,
    kind: 'enemy',
    x: 1,
    z: 0,
    attackPhase: 'windup',
    attackRemaining: 2,
    attackShape: { type: 'circle', originX: 0, originZ: 0, radius: 2 },
  };
  const dodge = computeBotPolicy({
    player,
    viewed: { entities: [threat], activeEnemyIds: [threat.id] },
  });
  assert.equal(dodge.buttons, BUTTONS.DODGE);
  assert.ok(Math.hypot(dodge.moveX, dodge.moveZ) > 0);

  const door = computeBotPolicy({
    player,
    viewed,
    roomCleared: true,
    door: { x: 2, z: 0 },
  });
  assert.equal(door.buttons, 0);
  assert.equal(door.moveX, 127);
  assert.equal(door.moveZ, 0);
});

test('dev input provider drives numbered InputLayer ticks', () => {
  const hadWindow = Object.hasOwn(globalThis, 'window');
  const originalWindow = globalThis.window;
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  const canvas = { addEventListener() {}, removeEventListener() {} };
  const controls = { querySelector: () => null };
  const input = new InputLayer({ canvas, controls });
  const providerSequences = [];
  try {
    input.setDevInputProvider((seq) => {
      providerSequences.push(seq);
      return {
        moveX: 64,
        moveZ: -64,
        aim: 32,
        buttons: BUTTONS.ATTACK,
        seq: 99,
      };
    });
    assert.deepEqual(input.nextTick(), {
      moveX: 64,
      moveZ: -64,
      aim: 32,
      buttons: BUTTONS.ATTACK,
      seq: 1,
    });
    assert.equal(input.nextTick().seq, 2);
    assert.deepEqual(providerSequences, [1, 2]);
    input.setDevInputProvider(null);
    assert.deepEqual(input.nextTick(), {
      seq: 3,
      moveX: 0,
      moveZ: 0,
      aim: 192,
      buttons: 0,
    });
  } finally {
    input.destroy();
    if (hadWindow) globalThis.window = originalWindow;
    else delete globalThis.window;
  }
});

test('protocol omits default fields in full keyframes and restores them on decode', () => {
  const fullWire = JSON.parse(encodeMessage({
    t: 'snap',
    full: true,
    ents: [{ id: 1, dead: false, attackRemaining: 0, dodge: false }],
  }));
  assert.equal(JSON.stringify(fullWire.ents[0]).includes('false'), false);
  const decodedFull = decodeMessage(JSON.stringify(fullWire));
  assert.equal(decodedFull.ents[0].dead, false);
  assert.equal(decodedFull.ents[0].attackRemaining, 0);

  const delta = decodeMessage(encodeMessage({
    t: 'snap',
    full: false,
    ents: [{ id: 1, dead: false, attackRemaining: 0 }],
  }));
  assert.equal(delta.ents[0].dead, false);
  assert.equal(delta.ents[0].attackRemaining, 0);
});

test('input queue waits for gaps without repeating or skipping inputs', () => {
  const queue = new InputQueue({ lastAppliedSeq: 0 });
  assert.equal(queue.enqueue({ seq: 2, mx: 22, mz: 0, b: BUTTONS.ATTACK, ad: 3.26 }), true);
  assert.equal(queue.enqueue({ seq: 2, mx: 99 }), false);
  assert.deepEqual(queue.consumeForTick().inputs, []);

  assert.equal(queue.enqueue({ seq: 1, mx: 11, mz: 0, b: 0 }), true);
  assert.deepEqual(queue.consumeForTick().inputs.map((input) => input.seq), [1]);
  const second = queue.consumeForTick().inputs[0];
  assert.equal(second.seq, 2);
  assert.equal(second.ad, 3.3);
  assert.equal(queue.enqueue({ seq: 2, mx: 0 }), false);
  assert.deepEqual(queue.consumeForTick().inputs, []);
});

test('input queue drains two inputs per tick while backlog exceeds two', () => {
  const queue = new InputQueue();
  for (let seq = 1; seq <= 5; seq += 1) queue.enqueue({ seq, mx: seq });

  assert.deepEqual(queue.consumeForTick().inputs.map((input) => input.seq), [1, 2]);
  assert.equal(queue.pendingCount, 3);
  assert.deepEqual(queue.consumeForTick().inputs.map((input) => input.seq), [3, 4]);
  assert.equal(queue.pendingCount, 1);
  assert.deepEqual(queue.consumeForTick().inputs.map((input) => input.seq), [5]);
  assert.equal(queue.pendingCount, 0);
});

test('input queue hard cap drops the oldest input and requests a full resync', () => {
  const queue = new InputQueue({ maxPending: 90 });
  for (let seq = 1; seq <= 91; seq += 1) queue.enqueue({ seq, mx: seq });

  assert.equal(queue.pendingCount, 90);
  assert.equal(queue.skipped, 1);
  assert.equal(queue.lastAppliedSeq, 1);
  assert.equal(queue.consumeForTick().fullResync, true);
  assert.equal(queue.takeFullResyncRequest(), true);
  assert.equal(queue.takeFullResyncRequest(), false);
});

test('server clock EWMA tracks RTT and offset, schedules startup pings, and never moves backward', () => {
  const clock = new ServerClock();
  assert.equal(clock.makePing(0).c, 0);
  assert.equal(clock.makePing(249), null);
  assert.equal(clock.makePing(250).c, 250);
  assert.equal(clock.makePing(500).c, 500);
  assert.equal(clock.makePing(750).c, 750);
  assert.equal(clock.makePing(1749), null);
  assert.equal(clock.makePing(1750).c, 1750);

  const measured = new ServerClock();
  const firstPing = measured.makePing(0);
  measured.observePong({ c: firstPing.c, t: 3 }, 100);
  assert.equal(measured.rttMs, 100);
  assert.equal(measured.offsetTicks, 1.5);
  const previousEstimate = measured.estimateTick(200);
  const secondPing = measured.makePing(250);
  measured.observePong({ c: secondPing.c, t: 13 }, 350);
  assert.ok(Math.abs(measured.offsetTicks - 2) < 1e-9);
  assert.ok(measured.estimateTick(200) >= previousEstimate);
  const forward = measured.estimateTick(300);
  assert.ok(measured.estimateTick(250) >= forward);
  assert.ok(measured.playbackRate >= 0.95 && measured.playbackRate <= 1.05);
});

test('server clock hard-resyncs when the target is more than six ticks away', () => {
  const clock = new ServerClock();
  clock.reset(1000, 0);
  assert.equal(clock.getEstimate(1000), 0);
  assert.equal(clock.getEstimate(2000), 30);
  const previousEpoch = clock.epoch;
  clock.offsetTicks = -100;
  assert.equal(clock.getEstimate(2000), -40);
  assert.equal(clock.playbackRate, 1);
  assert.equal(clock.epoch, previousEpoch + 1);
});

test('clock input scheduler follows tick estimates, caps catch-up, and resets without bursting', () => {
  const scheduler = new ClockInputScheduler({ leadSmoothing: 1 });
  const clock = {
    samples: 0,
    rttMs: 200,
    epoch: 1,
    estimate: 100,
    getEstimate() { return this.estimate; },
  };

  assert.equal(scheduler.steps(clock, 0), 0);
  assert.equal(scheduler.leadTicks, 4);
  assert.equal(scheduler.lastProducedTick, 104);
  clock.estimate = 101;
  assert.equal(scheduler.steps(clock, 1), 1);
  assert.equal(scheduler.lastProducedTick, 105);
  clock.estimate = 110;
  assert.equal(scheduler.steps(clock, 2), 3);
  assert.equal(scheduler.lastProducedTick, 108);

  clock.epoch += 1;
  clock.estimate = 500;
  assert.equal(scheduler.steps(clock, 3), 0);
  assert.equal(scheduler.lastProducedTick, 504);
});

test('interpolation adapts to jitter, interpolates facing, extrapolates for at most 100ms, and snaps teleports', () => {
  const buffer = new InterpolationBuffer();
  buffer.addSnapshot({
    tick: 0,
    receivedAt: 0,
    activeEnemyIds: [1],
    entities: [{ id: 1, kind: 'enemy', x: 0, z: 0, facing: 3.1 }],
  });
  buffer.addSnapshot({
    tick: 2,
    receivedAt: 70,
    activeEnemyIds: [2],
    entities: [{ id: 1, kind: 'enemy', x: 2, z: 0, facing: -3.1 }],
  });
  const middle = buffer.sample(5);
  assert.ok(Math.abs(middle.entities[0].x - 1) < 0.1);
  assert.ok(Math.abs(Math.abs(middle.entities[0].facing) - Math.PI) < 0.1);
  assert.deepEqual(middle.activeEnemyIds, [1]);
  assert.deepEqual(buffer.sampleAtRenderTick(2).activeEnemyIds, [2]);
  const atRenderTick = buffer.sampleAtRenderTick(1);
  assert.equal(atRenderTick.renderTick, 1);
  assert.ok(Math.abs(atRenderTick.entities[0].x - 1) < 0.1);

  buffer.addSnapshot({ tick: 4, receivedAt: 180, entities: [{ id: 1, x: 4, z: 0, facing: -3.0 }] });
  buffer.addSnapshot({ tick: 6, receivedAt: 300, entities: [{ id: 1, x: 6, z: 0, facing: -2.9 }] });
  assert.ok(buffer.getDelayMs() > 133);
  const extrapolated = buffer.sample(12).entities[0].x;
  assert.ok(extrapolated > 6 && extrapolated <= 9.01);
  buffer.addSnapshot({ tick: 8, receivedAt: 390, entities: [{ id: 1, x: 8, z: 0, facing: -2.8 }] });
  assert.ok(buffer.sample(14).entities[0].x > extrapolated);

  buffer.addSnapshot({
    tick: 10,
    receivedAt: 460,
    teleport: true,
    entities: [{ id: 1, x: 20, z: 0, facing: 0 }],
  });
  const teleported = buffer.sample(16).entities[0];
  assert.ok(teleported.x >= 20);
});

test('interpolation estimate sampler applies delay without rebasing the clock', () => {
  const buffer = new InterpolationBuffer();
  buffer.addSnapshot({
    tick: 100,
    receivedAt: 1000,
    entities: [{ id: 1, kind: 'player', x: 0, z: 0 }],
  });
  buffer.addSnapshot({
    tick: 102,
    receivedAt: 1067,
    entities: [{ id: 1, kind: 'player', x: 2, z: 0 }],
  });

  const estimate = 104;
  const sampled = buffer.sample(estimate);
  const sampledInto = buffer.sampleIntoEstimate(estimate);
  assert.ok(sampled.renderTick < 100);
  assert.equal(sampledInto.renderTick, sampled.renderTick);
});

test('interpolation snaps to newer samples across room changes and large jumps', () => {
  const buffer = new InterpolationBuffer();
  buffer.addSnapshot({
    tick: 0,
    roomIndex: 0,
    entities: [
      { id: 1, x: 0, z: 0, roomIndex: 0 },
      { id: 2, x: 0, z: 0 },
      { id: 3, x: 0, z: 0 },
    ],
  });
  buffer.addSnapshot({
    tick: 10,
    roomIndex: 0,
    entities: [
      { id: 1, x: 1, z: 0, roomIndex: 1 },
      { id: 2, x: 4, z: 0 },
      { id: 3, x: 2, z: 0 },
    ],
  });

  const entities = new Map(buffer.sampleAtRenderTick(5).entities.map((entity) => [entity.id, entity]));
  assert.equal(entities.get(1).x, 1);
  assert.equal(entities.get(2).x, 4);
  assert.equal(entities.get(3).x, 1);
});

test('interpolation frame sampling reuses its output and entity objects', () => {
  const buffer = new InterpolationBuffer();
  buffer.addSnapshot({ tick: 0, entities: [{ id: 1, kind: 'player', x: 0, z: 0 }] });
  buffer.addSnapshot({ tick: 2, entities: [{ id: 1, kind: 'player', x: 2, z: 0 }] });
  const first = buffer.sampleInto(1);
  const entity = first.entities[0];
  const second = buffer.sampleInto(1.5);
  assert.equal(second, first);
  assert.equal(second.entities[0], entity);
  assert.equal(second.entities[0].x, 1.5);
});

test('cast timeline deduplicates predicted and server casts and only emits authoritative effects', () => {
  const timeline = new CastTimeline({ playerId: 'hero' });
  const predicted = timeline.predictInput({ seq: 1, buttons: BUTTONS.ATTACK }, 0);
  assert.equal(predicted.castId, 'hero:1');
  assert.equal(timeline.predictInput({ seq: 2, buttons: BUTTONS.ATTACK }, 16), null);
  const events = [
    { eventId: 1, type: 'cast', castId: 'hero:1', playerId: 'hero' },
    { eventId: 2, type: 'damage', targetId: 4, damage: 9 },
    { eventId: 3, type: 'cast', castId: 'other:1', playerId: 'other' },
  ];
  const first = timeline.ingestEvents(events, 32);
  assert.equal(first.attached.length, 1);
  assert.equal(first.spawned.length, 1);
  assert.equal(timeline.ingestEvents(events, 48).spawned.length, 0);
  assert.deepEqual(timeline.consumeAuthoritativeEvents().map((event) => event.type), ['damage']);

  timeline.predictInput({ seq: 3, buttons: 0 }, 50);
  const unconfirmed = timeline.predictInput({ seq: 4, buttons: BUTTONS.ATTACK }, 60);
  assert.ok(unconfirmed);
  assert.equal(timeline.update(510).some((cast) => cast.castId === 'hero:4'), false);
});

test('cast timeline bounds retained authoritative events', () => {
  const timeline = new CastTimeline({ playerId: 'hero' });
  timeline.ingestEvents(
    Array.from({ length: 300 }, (_, index) => ({ eventId: index + 1, type: 'hit' })),
    0,
  );
  assert.equal(timeline.authoritativeEvents.length, 256);
  assert.equal(timeline.authoritativeEvents[0].eventId, 45);
  assert.equal(timeline.authoritativeEvents.at(-1).eventId, 300);
});

class FakeSocket {
  static OPEN = 1;

  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.listeners = new Map();
    this.sent = [];
    FakeSocket.instances.push(this);
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatch(type, event = {}) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  open() {
    this.readyState = FakeSocket.OPEN;
    this.dispatch('open');
  }

  receive(message) {
    this.dispatch('message', { data: encodeMessage(message) });
  }

  end() {
    this.readyState = 3;
    this.dispatch('close', { code: 1006 });
  }

  send(frame) {
    this.sent.push(frame);
  }

  close() {
    this.end();
  }
}

FakeSocket.instances = [];

function fakeTimers() {
  let nextId = 0;
  const timers = new Map();
  return {
    timers,
    setTimeoutFn(callback, delay) {
      const id = ++nextId;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeoutFn(id) {
      timers.delete(id);
    },
    runNext() {
      const [id, timer] = [...timers.entries()][0] ?? [];
      if (!timer) return null;
      timers.delete(id);
      timer.callback();
      return timer.delay;
    },
  };
}

test('net session reconnects with exponential backoff and resumes using the same token', () => {
  FakeSocket.instances = [];
  const timers = fakeTimers();
  let now = 0;
  const session = new NetSession({
    url: 'ws://example.invalid/room',
    WebSocketCtor: FakeSocket,
    token: 'resume-token',
    now: () => now,
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
    autoFlushInputs: false,
    autoPing: false,
  });
  const first = session.connect();
  first.open();
  assert.equal(JSON.parse(first.sent[0]).token, 'resume-token');
  first.receive({ t: 'welcome', token: 'server-token' });
  first.end();
  assert.equal([...timers.timers.values()][0].delay, 250);

  now = 250;
  timers.runNext();
  const second = FakeSocket.instances[1];
  second.open();
  assert.equal(JSON.parse(second.sent[0]).token, 'server-token');
  second.end();
  assert.equal([...timers.timers.values()][0].delay, 250);

  session.close();
  assert.equal(timers.timers.size, 0);
});

test('net session reads the authoritative tick from the pong tick field', () => {
  FakeSocket.instances = [];
  let now = 100;
  const session = new NetSession({
    url: 'ws://example.invalid/room',
    WebSocketCtor: FakeSocket,
    now: () => now,
    autoFlushInputs: false,
    autoPing: false,
  });
  const socket = session.connect();
  socket.open();
  const ping = session.clock.makePing(now);
  now = 200;
  socket.receive({ t: 'pong', c: ping.c, tick: 6 });
  assert.equal(session.clock.samples, 1);
  assert.equal(session.clock.rttMs, 100);
  session.close();
});

test('run clock resync discards a high lobby epoch and ignores its delayed pong', () => {
  let now = 100000;
  const session = new NetSession({
    now: () => now,
    autoFlushInputs: false,
    autoPing: false,
  });
  const lobbyPing = session.clock.makePing(now);
  now += 100;
  session.clock.observePong({ c: lobbyPing.c, t: 3002 }, now);
  assert.ok(session.clock.getEstimate(now) > 2999);

  session.resetRunEpoch(0);
  assert.equal(session.clock.samples, 0);
  assert.equal(session.clock.rttMs, 100);
  assert.equal(session.clock.observePong({ c: lobbyPing.c, t: 3002 }, now + 100), false);

  const runPing = session.clock.makePing(now);
  now += 100;
  session.clock.getEstimate(now + 1000);
  session.clock.observePong({ c: runPing.c, t: 60 }, now);
  const estimate = session.clock.getEstimate(now);
  const viewTick = Math.round(new InterpolationBuffer().sample(estimate).renderTick);
  assert.ok(Math.abs(viewTick - 60) <= 2);
  session.close();
});

test('party lobby ping, run start, and first snapshot use the run clock epoch', () => {
  const session = new NetSession({
    autoFlushInputs: false,
    autoPing: false,
  });
  const now = session.now();
  const lobbyPing = session.clock.makePing(now);
  session.clock.observePong({ c: lobbyPing.c, t: 0 }, now + 100);
  assert.ok(session.clock.getEstimate(now + 8100) > 200);

  const client = new PartyClient({
    character: { name: 'Hero', level: 1, potions: 3 },
  });
  client.playerId = 'hero';
  client.session = session;
  client.handleMessage({
    t: 'start',
    runId: 'run-clock-test',
    tick: 0,
    seed: 7,
    stageId: 'C1',
    party: [{ playerId: 'hero', name: 'Hero', level: 1 }],
  });
  client.status = 'connected';
  assert.equal(session.clock.samples, 0);
  assert.ok(Math.abs(session.clock.rttMs - 100) < 1e-9);
  assert.equal(session.clock.observePong({ c: lobbyPing.c, t: 0 }, session.now()), false);
  assert.ok(Math.abs(session.clock.getEstimate(session.now())) < 1);

  const startSnapshot = {
    t: 'snap',
    tick: 0,
    ack: 0,
    full: true,
    roomIndex: 0,
    openDoors: [],
    ev: [],
    ents: client.stageWorld.entities.map((entity) => ({ ...entity })),
  };
  client.handleMessage(startSnapshot);
  assert.equal(client.runSnapshotReady, true);
  assert.equal(session.clock.samples, 0);
  assert.ok(Math.abs(session.clock.rttMs - 100) < 1e-9);
  assert.equal(client.inputReady, true);
  const runPing = session.clock.makePing(session.now());
  session.clock.observePong({ c: runPing.c, t: startSnapshot.tick }, runPing.c + 40);
  assert.ok(Math.abs(session.clock.getEstimate(runPing.c + 40) - startSnapshot.tick) < 6);
  session.close();
});

test('a second run in the same session resets its clock to the new tick epoch', () => {
  let now = 200000;
  const session = new NetSession({
    now: () => now,
    autoFlushInputs: false,
    autoPing: false,
  });
  const firstRunPing = session.clock.makePing(now);
  now += 100;
  session.clock.observePong({ c: firstRunPing.c, t: 6002 }, now);
  assert.ok(session.clock.getEstimate(now) > 5999);

  session.resetRunEpoch(0);
  assert.equal(session.clock.samples, 0);
  assert.equal(session.clock.observePong({ c: firstRunPing.c, t: 6002 }, now + 100), false);
  const secondRunPing = session.clock.makePing(now);
  now += 100;
  session.clock.observePong({ c: secondRunPing.c, t: 45 }, now);
  const estimate = session.clock.getEstimate(now);
  const viewTick = Math.round(new InterpolationBuffer().sample(estimate).renderTick);
  assert.ok(Math.abs(viewTick - 45) <= 2);
  session.close();
});

test('net session defaults to the monotonic clock used by interpolation', () => {
  const session = new NetSession({ autoFlushInputs: false, autoPing: false });
  const ping = session.clock.makePing(session.now());
  const receivedAt = session.now();
  const serverTick = Math.round((ping.c + receivedAt) / 2 * session.clock.tickRate / 1000) + 12;
  session.clock.observePong({ c: ping.c, t: serverTick }, receivedAt);
  assert.ok(Math.abs(session.clock.getEstimate(performance.now()) - serverTick) < 2);
  session.close();
});

test('net session increases reconnect delay when connection attempts keep failing', () => {
  FakeSocket.instances = [];
  const timers = fakeTimers();
  let now = 0;
  const session = new NetSession({
    url: 'ws://example.invalid/room',
    WebSocketCtor: FakeSocket,
    now: () => now,
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
    autoFlushInputs: false,
    autoPing: false,
  });
  session.connect().end();
  assert.equal([...timers.timers.values()][0].delay, 250);
  for (const delay of [250, 500, 1000, 2000]) {
    now += delay;
    timers.runNext();
    FakeSocket.instances.at(-1).end();
    assert.equal([...timers.timers.values()][0].delay, Math.min(delay * 2, 2000));
  }
  session.close();
});

test('net session retains unacknowledged inputs and sends them in sequence order', () => {
  FakeSocket.instances = [];
  const session = new NetSession({
    url: 'ws://example.invalid/room',
    WebSocketCtor: FakeSocket,
    autoFlushInputs: false,
    autoPing: false,
  });
  const socket = session.connect();
  socket.open();
  for (let seq = 1; seq <= 8; seq += 1) {
    session.queueInput({
      seq,
      moveX: seq,
      moveZ: -seq,
      aim: 64,
      ...(seq === 1 ? { ad: 3.26 } : {}),
      buttons: BUTTONS.ATTACK,
    });
  }
  for (let eventId = 1; eventId <= 17; eventId += 1) session.setEventAck(eventId);
  assert.equal(session.flushInputs(), true);
  const sent = decodeMessage(socket.sent.at(-1));
  assert.equal(sent.t, 'in');
  assert.equal(sent.ae, 17);
  assert.deepEqual(sent.inputs.map((input) => input.seq), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(sent.inputs[0].ad, 3.3);
  assert.equal(Object.hasOwn(sent.inputs[1], 'ad'), false);
  socket.receive({ t: 'snap', tick: 0, ack: 4, full: true, ents: [] });
  assert.deepEqual([...session.inputs.keys()].sort((a, b) => a - b), [5, 6, 7, 8]);
  session.close();
});

test('net session acknowledges only contiguous authoritative event ids', () => {
  const session = new NetSession();
  session.setEventAck(1);
  session.setEventAck(3);
  assert.equal(session.eventAck, 1);
  session.setEventAck(2);
  assert.equal(session.eventAck, 3);
  session.setEventAck(3);
  assert.equal(session.eventAck, 3);
});

test('net session reconstructs acknowledged snapshot deltas and requests a full resync without the baseline', () => {
  FakeSocket.instances = [];
  const received = [];
  const session = new NetSession({
    url: 'ws://example.invalid/room',
    WebSocketCtor: FakeSocket,
    autoFlushInputs: false,
    autoPing: false,
    onMessage: (message) => received.push(message),
  });
  const socket = session.connect();
  socket.open();
  socket.receive({
    t: 'snap',
    tick: 0,
    ack: 0,
    full: true,
    roomIndex: 1,
    roomCleared: false,
    doorCountdown: null,
    openDoors: {},
    activeEnemyIds: [4, 5],
    objective: { type: 'defend', state: 'active', roomIndex: 1, hp: 300, maxHp: 300 },
    ents: [{ id: 1, kind: 'player', x: 1, z: 2, dead: false }],
  });
  socket.receive({
    t: 'snap',
    tick: 2,
    ack: 0,
    full: false,
    baseTick: 0,
    activeEnemyIds: [6],
    objective: { type: 'defend', state: 'active', roomIndex: 1, hp: 270, maxHp: 300 },
    ents: [{ id: 1, x: 3 }],
    removed: [],
  });
  assert.equal(received.at(-1).ents[0].x, 3);
  assert.equal(received.at(-1).ents[0].z, 2);
  assert.equal(received.at(-1).ents[0].dead, false);
  assert.equal(received.at(-1).roomIndex, 1);
  assert.equal(received.at(-1).roomCleared, false);
  assert.deepEqual(received.at(-1).activeEnemyIds, [6]);
  assert.deepEqual(received.at(-1).openDoors, {});
  assert.deepEqual(received.at(-1).objective, {
    type: 'defend',
    state: 'active',
    roomIndex: 1,
    hp: 270,
    maxHp: 300,
  });
  assert.equal(session.snapshotAck, 2);
  session.snapshotStates.clear();
  session.snapshotMetadataStates.clear();
  const receivedCount = received.length;
  socket.receive({
    t: 'snap',
    tick: 4,
    ack: 0,
    full: false,
    baseTick: 2,
    ents: [{ id: 1, x: 4 }],
    removed: [],
  });
  assert.equal(received.length, receivedCount);
  assert.equal(session.snapshotResyncRequested, true);
  assert.equal(session.flushInputs(), true);
  const resyncRequest = decodeMessage(socket.sent.at(-1));
  assert.equal(resyncRequest.sa, 2);
  assert.equal(resyncRequest.sr, true);
  session.close();
});
