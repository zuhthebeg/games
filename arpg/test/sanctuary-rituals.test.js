import test from 'node:test';
import assert from 'node:assert/strict';
import { SANCTUARY } from '../js/content/sanctuary.js';
import { movementOnlyInput } from '../js/input.js';
import {
  RITUAL_CAPS, RITUAL_POINTS, CHIAO_RESULTS, advanceRitual, cancelRitual, chiaoPlan, createRitualState,
  faceAtPhase, nearestRitual, resultForFaces, ritualMovement, startRitual, throwChiao,
} from '../js/render/ritual-state.js';

test('all four face combinations map to the authored result names', () => {
  assert.equal(CHIAO_RESULTS.holy.name, '聖筊 성교');
  assert.equal(resultForFaces(['flat', 'convex']).name, '聖筊 성교');
  assert.equal(resultForFaces(['convex', 'flat']).name, '聖筊 성교');
  assert.equal(resultForFaces(['flat', 'flat']).name, '笑筊 소교');
  assert.equal(resultForFaces(['convex', 'convex']).name, '陰筊 음교');
});

test('chiao plans always finish on their decided faces', () => {
  for (const reduced of [false, true]) {
    for (let seed = 0; seed < 500; seed++) {
      const faces = [seed & 1 ? 'convex' : 'flat', seed & 2 ? 'convex' : 'flat'];
      const plans = chiaoPlan(faces, seed, reduced);
      assert.equal(faceAtPhase(plans[0].finalPhase), faces[0]);
      assert.equal(faceAtPhase(plans[1].finalPhase), faces[1]);
    }
  }
});

test('busy ritual starts are ignored and cancel resets presentation state', () => {
  const state = createRitualState();
  assert.equal(startRitual(state, 'incense', { origin: { x: 522, y: 602 } }), true);
  for (let i = 0; i < 1000; i++) assert.equal(startRitual(state, 'burn'), false);
  assert.equal(state.sticksLeft, 20);
  cancelRitual(state);
  assert.equal(state.active, null);
  assert.equal(state.sticksLeft, 0);
});

test('fixed ritual pools remain bounded after rapid starts', () => {
  assert.equal(RITUAL_CAPS.sticks, 3);
  assert.equal(RITUAL_CAPS.embers, 16);
  assert.equal(RITUAL_CAPS.blocks, 2);
  const state = createRitualState();
  for (let i = 0; i < 1000; i++) {
    if (!state.active) startRitual(state, i % 2 ? 'incense' : 'burn', { origin: { x: 700, y: 365 } });
    advanceRitual(state, 10);
  }
  assert.ok(state.sticksLeft <= 20);
});

test('movement-only input strips ritual edges and locks movement while busy', () => {
  const input = movementOnlyInput({ mx: 1, my: -1, ritualEdge: true, attack: true });
  assert.equal(input.ritualEdge, false);
  assert.equal(input.attack, false);
  const state = createRitualState();
  startRitual(state, 'burn', { origin: { x: 1175, y: 600 } });
  assert.deepEqual(ritualMovement(state, input), { ...input, mx: 0, my: 0 });
});

test('out-of-range ritual input does nothing', () => {
  assert.equal(nearestRitual(700, 720), null);
  const state = createRitualState();
  assert.equal(startRitual(state, nearestRitual(700, 720)?.id || '', { origin: { x: 700, y: 720 } }), false);
  assert.equal(state.active, null);
});

test('ritual standing spots clear the authored sanctuary obstacles', () => {
  const radius = 16;
  for (const point of RITUAL_POINTS) {
    assert.ok(Math.hypot(point.stand.x - point.x, point.stand.y - point.y) <= 95, `${point.id} stand is out of range`);
    for (const obstacle of SANCTUARY.obstacles) {
      if (obstacle.shape === 'circle') {
        assert.ok(Math.hypot(point.stand.x - obstacle.x, point.stand.y - obstacle.y) >= obstacle.r + radius,
          `${point.id} stand overlaps a circle`);
      } else {
        const x = Math.max(obstacle.x, Math.min(point.stand.x, obstacle.x + obstacle.w));
        const y = Math.max(obstacle.y, Math.min(point.stand.y, obstacle.y + obstacle.h));
        assert.ok(Math.hypot(point.stand.x - x, point.stand.y - y) >= radius,
          `${point.id} stand overlaps a rect`);
      }
    }
  }
});

test('chiao throw decides before entering its animation', () => {
  const state = createRitualState();
  startRitual(state, 'chiao', { origin: { x: 700, y: 400 } });
  assert.equal(throwChiao(state, ['flat', 'convex'], 7), true);
  assert.deepEqual(state.active.faces, ['flat', 'convex']);
  assert.equal(state.active.result.name, '聖筊 성교');
});
