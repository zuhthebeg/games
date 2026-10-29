import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, addPlayer, startStage } from '../js/sim/world.js';
import { SnapshotBuffer, encodeSnapshot } from '../js/net/protocol.js';

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
    if (now >= 1000 && previous !== null) steps.push(x - previous);
    previous = x;
  }
  assert.ok(steps.length > 100);
  assert.ok(steps.every(step => step > .45 && step < .55),
    JSON.stringify(steps.filter(step => !(step > .45 && step < .55)).slice(0, 10)));
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
      catchup = { gap: target - buffer.play, now };
    }
    previousX = x;
  }

  assert.ok(maxResumeStep <= nominalStep * 1.6,
    `resume step ${maxResumeStep.toFixed(3)}px exceeded ${nominalStep * 1.6}px`);
  assert.ok(catchup && Math.abs(catchup.gap) <= 2, JSON.stringify(catchup));
});

test('late extrapolation velocity change stays continuous and converges to the sampled path', () => {
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
      const trueX = 500 + (Math.min(buffer.play, 13) - 4) * velocity;
      convergence = Math.abs(x - trueX);
    }
    previousX = x; previousPlay = buffer.play;
  }
  assert.ok(maxExcess <= 32 + 1e-6, `max step ${maxStep.toFixed(1)}px, excess ${maxExcess.toFixed(1)}px`);
  assert.ok(convergence !== null && convergence <= 1, `sampled path error ${convergence}`);
});

test('120ms frame gaps do not offset a constant 24px/tick dash', () => {
  const world = fixture(), buffer = new SnapshotBuffer('guest', 0, { adaptive: false });
  const frameGap = 120, velocity = 24;
  for (let frame = 0; frame <= 5; frame++) {
    const tick = frame * 4, at = frame * frameGap;
    buffer.push(packet(world, tick, tick * velocity), at);
    const view = buffer.sample(at), host = view.entities.find(entity => entity.pid === 'host');
    const visual = buffer.visual.get(host.id);
    assert.ok(Math.abs(visual.ox) < 1e-9 && Math.abs(visual.oy) < 1e-9,
      `frame ${frame} offset ${visual.ox}, ${visual.oy}`);
    assert.ok(Math.abs(host.x - visual.rx) < 1e-9 && Math.abs(host.y - visual.ry) < 1e-9);
  }
});

test('moving entities are not offset during playback catch-up at +50% rate', () => {
  const world = fixture(), buffer = new SnapshotBuffer('guest', 0, { adaptive: false });
  buffer.push(packet(world, 0, 0), 0);
  const initial = buffer.sample(0), hostId = initial.entities.find(entity => entity.pid === 'host').id;
  const initialPlay = buffer.play, elapsed = 150;
  buffer.push(packet(world, 20, 20 * 24), elapsed);
  const view = buffer.sample(elapsed), host = view.entities.find(entity => entity.id === hostId);
  const visual = buffer.visual.get(hostId);
  const played = buffer.play - initialPlay;
  assert.ok(Math.abs(played / (elapsed / T) - 1.5) < 1e-9, `playback rate ${played / (elapsed / T)}`);
  assert.equal(buffer.stats.resets, 0);
  assert.ok(Math.abs(visual.ox) < 1e-9 && Math.abs(visual.oy) < 1e-9);
  assert.ok(Math.abs(host.x - visual.rx) < 1e-9 && Math.abs(host.y - visual.ry) < 1e-9);
});

test('remote position teleports of 200px or more are not visually smoothed', () => {
  const world = fixture(), buffer = new SnapshotBuffer('guest', 0, { adaptive: false });
  buffer.push(packet(world, 0, 100), 0);
  const before = buffer.sample(0).entities.find(entity => entity.pid === 'host').x;
  buffer.push(packet(world, 2, 350), 2 * T);
  const after = buffer.sample(2 * T).entities.find(entity => entity.pid === 'host').x;
  assert.ok(after - before >= 200, `teleport was smoothed: ${before} -> ${after}`);
});
