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
