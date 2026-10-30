import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, addPlayer, startStage, spawnMonster } from '../js/sim/world.js';
import { SnapshotBuffer, encodeSnapshot } from '../js/net/protocol.js';
import { LocalPrediction } from '../js/net/prediction.js';
import { comboDef } from '../js/sim/basic-combo.js';

const T = 1000 / 30;
function packet(world, tick, x) {
  world.tick = tick;
  world.entities.find(entity => entity.pid === 'host').x = x;
  return encodeSnapshot(world);
}
function fixture() {
  const world = createWorld({ seed: 11 });
  addPlayer(world, { pid: 'guest' });
  addPlayer(world, { pid: 'host' });
  startStage(world, 'S2');
  return world;
}

test('snapshot playback rebases after host stall/backlog without freezing, rewinding, or sticking to the old delay', () => {
  const world = fixture(), buffer = new SnapshotBuffer('guest', 100), arrivals = [];
  for (let tick = 0; tick <= 60; tick += 2)
    arrivals.push({ tick, at: tick * T + 60 });
  for (let index = 0; index < 5; index++)
    arrivals.push({ tick: 62 + index, at: 60 * T + 60 + 400 + index * 5 });
  for (let tick = 68; tick <= 180; tick += 2)
    arrivals.push({ tick, at: tick * T + 360 });
  arrivals.sort((a, b) => a.at - b.at);

  let next = 0, previousX = null, frozenMs = 0, resumeAt = 60 * T + 60 + 400;
  let afterResume = null, delayRecoveredAt = null;
  for (let now = 0; now <= 6000; now += 1000 / 60) {
    while (next < arrivals.length && arrivals[next].at <= now) {
      const { tick, at } = arrivals[next++];
      buffer.push(packet(world, tick, tick), at);
    }
    const view = buffer.sample(now);
    if (!view) continue;
    const x = view.entities.find(entity => entity.pid === 'host').x;
    if (previousX !== null && x < previousX - 1e-6)
      assert.fail(`remote position rewound at ${now.toFixed(1)}ms: ${previousX} -> ${x}`);
    if (now >= resumeAt && previousX !== null && Math.abs(x - previousX) < 1e-6)
      frozenMs += 1000 / 60;
    previousX = x;
    if (now >= resumeAt + 1500 && afterResume === null)
      afterResume = { latest: buffer.frames.at(-1).world.tick, play: buffer.play, current: buffer.currentTick(now) };
    if (now >= resumeAt && now <= resumeAt + 3000 && buffer.delay < 200 && delayRecoveredAt === null)
      delayRecoveredAt = now;
  }

  assert.ok(buffer.stats.rebases > 0, `no timeline rebase: ${JSON.stringify(buffer.stats)}`);
  assert.ok(frozenMs < 500, `frozen ${frozenMs.toFixed(1)}ms after resume`);
  assert.ok(afterResume, 'captured playback state after resume');
  assert.ok(afterResume.latest - afterResume.play >= 0 && afterResume.latest - afterResume.play <= 10,
    JSON.stringify(afterResume));
  assert.ok(afterResume.current >= afterResume.latest && afterResume.current <= afterResume.latest + 3,
    JSON.stringify(afterResume));
  assert.ok(delayRecoveredAt !== null, `delay remained ${buffer.delay.toFixed(1)}ms after resume`);
  assert.ok(delayRecoveredAt <= resumeAt + 3000, `delay recovered at ${delayRecoveredAt - resumeAt}ms`);
});

test('steady packet jitter keeps warmed playback steps within ten percent of real time', () => {
  const world = fixture(), buffer = new SnapshotBuffer('guest'), steps = [];
  const arrivals = Array.from({ length: 90 }, (_, index) => ({
    tick: index * 2,
    at: index * 2 * T + 60 + ((index * 17) % 15)
  }));
  let next = 0, previous = null;
  for (let now = 0; now <= 5000; now += 1000 / 60) {
    while (next < arrivals.length && arrivals[next].at <= now) {
      const { tick, at } = arrivals[next++];
      buffer.push(packet(world, tick, tick), at);
    }
    const view = buffer.sample(now);
    if (!view) continue;
    const x = view.entities.find(entity => entity.pid === 'host').x;
    if (now >= 1000 && previous !== null) {
      const latest = buffer.frames.at(-1).world.tick;
      steps.push({ step: x - previous, aheadOfData: buffer.play > latest - 1 + 1e-9 });
    }
    previous = x;
  }
  assert.ok(steps.length > 100);
  const inData = steps.filter(({ aheadOfData }) => !aheadOfData);
  assert.ok(inData.every(({ step }) => step > .45 && step < .55),
    JSON.stringify(inData.filter(({ step }) => !(step > .45 && step < .55)).slice(0, 10)));
});

test('snapshot playback time-dilates catch-up after a 700ms packet gap', () => {
  const world = fixture(), buffer = new SnapshotBuffer('guest'), arrivals = [];
  for (let tick = 0; tick <= 60; tick += 2)
    arrivals.push({ tick, at: tick * T + 60 });
  for (let tick = 82; tick <= 180; tick += 2)
    arrivals.push({ tick, at: tick * T + 60 });

  const resumeAt = 82 * T + 60, nominalStep = .5;
  let next = 0, previousX = null, maxResumeStep = 0, catchup = null;
  for (let now = 0; now <= resumeAt + 2500; now += 1000 / 60) {
    while (next < arrivals.length && arrivals[next].at <= now) {
      const { tick, at } = arrivals[next++];
      buffer.push(packet(world, tick, tick), at);
    }
    const view = buffer.sample(now);
    if (!view) continue;
    const x = view.entities.find(entity => entity.pid === 'host').x;
    if (now >= resumeAt && previousX !== null)
      maxResumeStep = Math.max(maxResumeStep, x - previousX);
    if (now >= resumeAt + 2000 && catchup === null) {
      const target = (now - buffer.clock - buffer.delay) / T;
      if (target - buffer.play <= 2) catchup = { gap: target - buffer.play, now };
    }
    previousX = x;
  }

  assert.ok(maxResumeStep <= nominalStep * 1.6,
    `resume step ${maxResumeStep.toFixed(3)}px exceeded ${nominalStep * 1.6}px`);
  assert.ok(catchup && Math.abs(catchup.gap) <= 2, JSON.stringify(catchup));
});

test('velocity change after the latest frame stays continuous without extrapolation', () => {
  const world = fixture(), buffer = new SnapshotBuffer('guest', 125, { adaptive: false });
  const velocity = 24, resumeAt = 10 * T + 60 + 150;
  const arrivals = [0, 2, 4].map(tick => ({ tick, x: 500, at: tick * T + 60 }));
  arrivals.push({ tick: 10, x: 500 + (10 - 4) * velocity, at: resumeAt });
  let next = 0, previousX = null, previousPlay = null, maxStep = 0, maxExcess = 0, convergence = null;
  for (let now = 0; now <= resumeAt + 350; now += T / 2) {
    while (next < arrivals.length && arrivals[next].at <= now) {
      const { tick, x, at } = arrivals[next++];
      buffer.push(packet(world, tick, x), at);
    }
    const view = buffer.sample(now);
    if (!view) continue;
    const x = view.entities.find(entity => entity.pid === 'host').x;
    if (now >= resumeAt && previousX !== null) {
      const step = Math.abs(x - previousX), nominal = velocity * Math.max(0, buffer.play - previousPlay);
      maxStep = Math.max(maxStep, step);
      maxExcess = Math.max(maxExcess, step - nominal);
    }
    if (now >= resumeAt + 300) {
      const trueX = 500 + (Math.min(buffer.play, 10) - 4) * velocity;
      convergence = Math.abs(x - trueX);
    }
    previousX = x; previousPlay = buffer.play;
  }
  assert.ok(maxExcess <= 32 + 1e-6, `max step ${maxStep.toFixed(1)}px, excess ${maxExcess.toFixed(1)}px`);
  assert.ok(convergence !== null && convergence <= 1, `sampled path error ${convergence}`);
});

test('a constant dash remains raw interpolation across a 120ms frame gap', () => {
  const world = fixture(), buffer = new SnapshotBuffer('guest', 0, { adaptive: false });
  const frameGap = 120, velocity = 24;
  for (let frame = 0; frame <= 5; frame++) {
    const tick = frame * 4, at = frame * frameGap;
    buffer.push(packet(world, tick, tick * velocity), at);
    const view = buffer.sample(at), host = view.entities.find(entity => entity.pid === 'host');
    assert.equal(buffer.visual, undefined);
    assert.ok(Math.abs(host.x - view.positionTick * velocity) < 1e-9,
      `frame ${frame}: ${host.x} != ${view.positionTick * velocity}`);
  }
});

test('moving entities remain raw interpolation during playback catch-up', () => {
  const world = fixture(), buffer = new SnapshotBuffer('guest', 0, { adaptive: false });
  buffer.push(packet(world, 0, 0), 0);
  const initial = buffer.sample(0), hostId = initial.entities.find(entity => entity.pid === 'host').id;
  const initialPlay = buffer.play, elapsed = 150;
  buffer.push(packet(world, 20, 20 * 24), elapsed);
  const view = buffer.sample(elapsed), host = view.entities.find(entity => entity.id === hostId);
  const played = buffer.play - initialPlay;
  assert.ok(Math.abs(played / (elapsed / T) - 1.5) < 1e-9, `playback rate ${played / (elapsed / T)}`);
  assert.equal(buffer.stats.resets, 0);
  assert.equal(buffer.visual, undefined);
  assert.ok(Math.abs(host.x - view.positionTick * 24) < 1e-9);
});

test('remote position teleports follow the newest authoritative interpolation immediately', () => {
  const world = fixture(), buffer = new SnapshotBuffer('guest', 0, { adaptive: false });
  buffer.push(packet(world, 0, 100), 0);
  const before = buffer.sample(0).entities.find(entity => entity.pid === 'host').x;
  buffer.push(packet(world, 2, 350), 2 * T);
  const after = buffer.sample(2 * T).entities.find(entity => entity.pid === 'host').x;
  assert.equal(after, 350);
});

test('sampled remote entities and telegraphs equal their authoritative position-tick interpolation', () => {
  const world = fixture(), monster = spawnMonster(world, 'goblin_grunt', 700, 400);
  monster.spawnLeft = 0;
  monster.act = { id: 'slash', step: 1, phase: 'active', elapsed: 1, total: 3, left: 2, facing: 0, ox: 700, oy: 400, def: comboDef('slash', 1, 'sword') };
  const buffer = new SnapshotBuffer('guest', 100), arrivals = [];
  const send = tick => {
    world.tick = tick;
    world.entities.find(entity => entity.pid === 'host').x = tick <= 30 ? 500 + tick * 4 : 620 + (tick - 30) * 12;
    monster.x = tick <= 30 ? 700 + tick * 3 : 790 + (tick - 30) * 8;
    monster.act.ox = monster.x;
    return encodeSnapshot(world, { guest: 0, host: 0 });
  };
  for (let tick = 0; tick <= 78; tick += 2)
    arrivals.push({ tick, at: tick * T + 60 + (tick % 6) * 7, data: send(tick) });
  for (let tick = 102; tick <= 150; tick += 2)
    arrivals.push({ tick, at: tick * T + 360, data: send(tick) });
  arrivals.sort((a, b) => a.at - b.at);
  let next = 0, samples = 0;
  for (let now = 0; now <= 5000; now += 1000 / 60) {
    while (next < arrivals.length && arrivals[next].at <= now) {
      const row = arrivals[next++];
      buffer.push(row.data, row.at);
    }
    const view = buffer.sample(now);
    if (!view) continue;
    const tick = view.positionTick, frames = buffer.frames;
    let bi = frames.findIndex(frame => tick <= frame.world.tick);
    if (bi < 0) bi = frames.length - 1;
    const b = frames[bi], a = frames[Math.max(0, bi - 1)], span = b.world.tick - a.world.tick;
    const alpha = span > 0 ? (tick - a.world.tick) / span : 0;
    for (const entity of view.entities.filter(e => e.pid === 'host' || e.kind === 'monster')) {
      const from = a.world.entities.find(e => e.id === entity.id), to = b.world.entities.find(e => e.id === entity.id);
      if (!from || !to) continue;
      const x = from.x + (to.x - from.x) * alpha, y = from.y + (to.y - from.y) * alpha;
      assert.ok(Math.abs(entity.x - x) <= 1e-6 && Math.abs(entity.y - y) <= 1e-6,
        `${entity.id} at ${entity.x},${entity.y}; expected ${x},${y} for ${tick}`);
      const latest = frames.at(-1).world.entities.find(e => e.id === entity.id);
      assert.ok(entity.x <= latest.x + 1e-6 && entity.y <= latest.y + 1e-6, 'sample exceeded latest');
    }
    const telegraph = view.telegraphs.find(tg => tg.id === monster.id);
    if (telegraph) {
      const sampledMonster = view.entities.find(entity => entity.id === monster.id);
      assert.ok(Math.abs(telegraph.ox - sampledMonster.x) <= 1e-6);
      assert.ok(Math.abs(telegraph.oy - sampledMonster.y) <= 1e-6);
    }
    samples++;
  }
  assert.ok(samples > 100);
  assert.ok(buffer.stats.rebases > 0, `timeline did not rebase: ${JSON.stringify(buffer.stats)}`);
});

test('displayContact receives the sampled un-offset remote positions', () => {
  const world = fixture(), buffer = new SnapshotBuffer('guest', 100, { adaptive: false });
  world.entities.find(entity => entity.pid === 'host').x = 600;
  buffer.push(encodeSnapshot(world, { guest: 0, host: 0 }), 0);
  const sampled = buffer.sample(0), prediction = new LocalPrediction('guest');
  prediction.reconcile(sampled);
  let received = null;
  const original = prediction.displayContact;
  prediction.displayContact = function (pawn, view, dodge) {
    received = view;
    return original.call(this, pawn, view, dodge);
  };
  prediction.view(sampled);
  assert.ok(received);
  assert.equal(received.entities.find(entity => entity.pid === 'host').x,
    sampled.entities.find(entity => entity.pid === 'host').x);
});
