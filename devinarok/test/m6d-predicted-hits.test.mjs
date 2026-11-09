import assert from 'node:assert/strict';
import test from 'node:test';
import { ENEMIES } from '../js/content/enemies.js';
import { predictStrikeHits } from '../js/net/predicted-hits.js';
import { Predictor } from '../js/net/predictor.js';
import { PartyClient } from '../js/ui/party.js';
import { BUTTONS, createStageWorld, step, stepPlayerMotion } from '../js/sim/world.js';

function enemy(id, x, z, fields = {}) {
  return {
    id,
    kind: 'enemy',
    enemyKind: 'minion',
    x,
    z,
    radius: 0.1,
    dead: false,
    state: 'idle',
    invulnerable: false,
    spawnTicksLeft: 0,
    ...fields,
  };
}

function strike(castId, shape, fields = {}) {
  return { castId, shape, ...fields };
}

function makeCombatWorld() {
  const world = createStageWorld({
    seed: 1701,
    stageId: 'C1',
    playerId: 'self',
    inputDriven: true,
  });
  const player = world.entities.find((entity) => entity.kind === 'player');
  const target = world.entities.find((entity) => entity.kind === 'enemy');
  world.entities = [player, target];
  world.roomEnemyIds = [target.id];
  world.enemyHistory = [];
  player.facing = 0;
  player.previousButtons = 0;
  player.attack = null;
  target.x = player.x + 1;
  target.z = player.z;
  target.hp = 10000;
  target.maxHp = 10000;
  target.dead = false;
  target.state = 'idle';
  target.invulnerable = false;
  target.spawnTicksLeft = 0;
  target.stunnedTicks = 1000;
  target.attackPhase = null;
  target.attackShape = null;
  target.attackCooldownTicks = 1000;
  return { world, player, target };
}

test('sector predictions hit enemies inside the shape and miss enemies outside it', () => {
  const hits = predictStrikeHits({
    attackStrike: strike('sword:1', {
      type: 'sector',
      originX: 0,
      originZ: 0,
      angle: 0,
      range: 2,
      halfAngle: 0.6,
    }),
  }, [
    enemy(1, 1, 0.2),
    enemy(2, 1, 1.5),
  ], { hitKeys: new Set() });

  assert.deepEqual(hits, [{ castId: 'sword:1', targetId: 1, skill: 0 }]);
});

test('predictions skip dead, invulnerable, spawning, and inactive enemies', () => {
  const active = enemy(5, 0.5, 0, { radius: undefined });
  const hits = predictStrikeHits({
    skillStrike: strike('staff:1', {
      type: 'circle',
      originX: 0,
      originZ: 0,
      radius: 0.2,
    }),
  }, [
    enemy(1, 0, 0, { dead: true }),
    enemy(2, 0, 0, { state: 'dead' }),
    enemy(3, 0, 0, { invulnerable: true }),
    enemy(4, 0, 0, { spawnTicksLeft: 1 }),
    active,
    enemy(6, 0.5, 0),
  ], { activeEnemyIds: [5], hitKeys: new Set() });

  assert.ok(ENEMIES[active.enemyKind].radius > 0.2);
  assert.deepEqual(hits, [{ castId: 'staff:1', targetId: 5, skill: 0 }]);
});

test('finite line strikes select the nearest targets along the line, then by id', () => {
  const hits = predictStrikeHits({
    attackStrike: strike('crossbow:1', {
      type: 'line',
      originX: 0,
      originZ: 0,
      angle: 0,
      length: 10,
      width: 0.5,
    }, { maxTargets: 2 }),
  }, [
    enemy(21, 2, 0),
    enemy(3, 4, 0),
    enemy(10, 2, 0),
  ], { hitKeys: new Set() });

  assert.deepEqual(hits.map(({ targetId }) => targetId), [10, 21]);
});

test('the same cast and target pair is predicted only once', () => {
  const shape = { type: 'circle', originX: 0, originZ: 0, radius: 2 };
  const hits = predictStrikeHits({
    skillStrikes: [strike('staff:2', shape, { skillId: 1 })],
    attackStrike: strike('staff:2', shape, { skillId: 1 }),
  }, [enemy(1, 1, 0)], { hitKeys: new Set() });

  assert.deepEqual(hits, [{ castId: 'staff:2', targetId: 1, skill: 1 }]);
});

test('predicted hit keys retain only the newest 512 entries in FIFO order', () => {
  const hitKeys = new Set();
  const hits = predictStrikeHits({
    attackStrike: strike('sword:bounded', {
      type: 'circle',
      originX: 0,
      originZ: 0,
      radius: 2,
    }),
  }, Array.from({ length: 513 }, (_, index) => enemy(index + 1, 0.5, 0)), { hitKeys });

  assert.equal(hits.length, 513);
  assert.equal(hitKeys.size, 512);
  assert.equal(hitKeys.has('sword:bounded|1'), false);
  assert.equal(hitKeys.has('sword:bounded|2'), true);
});

test('an active-tick stepPlayerMotion strike predicts the same target as server hit events', () => {
  const predicted = makeCombatWorld();
  const authoritative = makeCombatWorld();
  const predictedHits = [];
  let activeMotion = null;

  for (let seq = 1; seq <= 20 && !activeMotion; seq += 1) {
    const input = {
      seq,
      moveX: 0,
      moveZ: 0,
      aim: 0,
      buttons: seq === 1 ? BUTTONS.ATTACK : 0,
    };
    predicted.world.tick = authoritative.world.tick + 1;
    const motion = stepPlayerMotion(predicted.world, predicted.player, input);
    if (motion.attackStrike) {
      activeMotion = motion;
      predictedHits.push(...predictStrikeHits(
        motion,
        predicted.world.entities,
        { activeEnemyIds: predicted.world.roomEnemyIds, hitKeys: new Set() },
      ));
    }
    step(authoritative.world, { self: input });
  }

  assert.ok(activeMotion?.attackStrike);
  const castId = activeMotion.attackStrike.castId;
  const serverStrike = authoritative.world.events.find((event) => (
    event.type === 'strike' && event.castId === castId
  ));
  const serverHits = authoritative.world.events.filter((event) => (
    event.type === 'hit' && event.sourceId === authoritative.player.id && event.castId === castId
  ));
  assert.deepEqual(serverStrike.shape, activeMotion.attackStrike.shape);
  assert.deepEqual(
    predictedHits.map(({ targetId }) => targetId),
    serverHits.map(({ targetId }) => targetId),
  );
  assert.deepEqual(serverHits.map(({ targetId }) => targetId), [authoritative.target.id]);
});

test('PartyClient queues attack casts and immediate hits only from local input, then annotates confirmations', () => {
  const { world, player, target } = makeCombatWorld();
  const client = Object.create(PartyClient.prototype);
  const predictor = new Predictor({
    player: structuredClone(player),
    playerId: player.playerId,
    ctx: {
      arena: world.arena,
      openDoors: world.openDoors,
      tick: world.tick,
      entities: world.entities,
    },
  });
  const viewEntities = structuredClone(world.entities);
  const receivedEvents = [];
  Object.assign(client, {
    playerId: player.playerId,
    runSnapshotReady: true,
    status: 'connected',
    inputTerminated: false,
    versionMismatch: false,
    result: null,
    predictor,
    session: {
      queueInput: () => {},
      clock: { getEstimate: (now) => now },
      setEventAck: () => {},
    },
    castTimeline: { predictInput: () => {}, ingestEvents: () => {} },
    interpolation: {
      addSnapshot: () => {},
      sample: () => ({ entities: viewEntities }),
    },
    stageWorld: world,
    lastSnapshot: { tick: 73, activeEnemyIds: [target.id], openDoors: world.openDoors },
    predictedEvents: [],
    predictedCastIds: new Set(),
    predictedHitKeys: new Set(),
    snapshotArrivalAt: null,
    snapshotArrivalTick: null,
    serverTickRateSamples: [],
    eventIds: new Set(),
    seenEventIds: new Set(),
    reviveProgress: new Map(),
    frameTelemetry: [],
    onEvents: (events) => receivedEvents.push(...events),
    onSnapshot: () => {},
  });

  for (let seq = 1; seq <= 20; seq += 1) {
    client.sendInput({
      seq,
      moveX: 0,
      moveZ: 0,
      aim: 0,
      buttons: seq === 1 ? BUTTONS.ATTACK : 0,
      autoAim: true,
    }, {
      now: seq * 10,
      viewTick: 73,
      sample: { entities: viewEntities },
    });
    if (client.predictedHitKeys.has(`self:1|${target.id}`)) break;
  }

  const predictedEvents = client.consumePredictedEvents();
  const predictedCast = predictedEvents.find((event) => event.type === 'cast');
  const predictedHit = predictedEvents.find((event) => event.type === 'predictedHit');
  assert.equal(predictedCast.castId, 'self:1');
  assert.equal(predictedCast.tick, 73);
  assert.equal(predictedCast.predicted, true);
  assert.equal(predictedHit.castId, 'self:1');
  assert.equal(predictedHit.targetId, target.id);
  assert.equal(client.consumePredictedEvents().length, 0);

  const localEntityId = player.id;
  const otherPlayerId = localEntityId + 100;
  client.handleSnapshot({
    t: 'snap',
    tick: 74,
    ack: 0,
    full: false,
    activeEnemyIds: [target.id],
    openDoors: world.openDoors,
    ents: viewEntities,
    ev: [
      { eventId: 1, type: 'cast', castId: 'self:1' },
      { eventId: 2, type: 'hit', castId: 'self:1', sourceId: localEntityId, targetId: target.id },
      { eventId: 3, type: 'hit', castId: 'self:1', sourceId: otherPlayerId, targetId: target.id },
      { eventId: 4, type: 'hit', castId: 'self:1', sourceId: localEntityId, targetId: target.id + 1 },
    ],
  });

  assert.equal(receivedEvents[0].predictedLocally, true);
  assert.equal(receivedEvents[1].predictedLocally, true);
  assert.equal(receivedEvents[2].predictedLocally, undefined);
  assert.equal(receivedEvents[3].predictedLocally, undefined);
  assert.equal(client.consumePredictedEvents().length, 0);
});
