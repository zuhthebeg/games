import test from 'node:test';
import assert from 'node:assert/strict';
import { SANCTUARY_ARENA } from '../js/sanctuary/arena.js';
import {
  BURN_DONE,
  BURN_NOTE,
  CHIAO_RESULTS,
  CHIAO_FOOTER,
  INCENSE_DONE,
  RITUAL_CAPS,
  RITUAL_POINTS,
  advanceRitual,
  cancelRitual,
  chiaoPlan,
  createRitualState,
  nearestRitual,
  pixelsToMeters,
  resultForFaces,
  ritualMovement,
  startRitual,
  throwChiao,
} from '../js/sanctuary/state.js';

test('sanctuary coordinates convert the 1400 by 860 reference into meters', () => {
  assert.deepEqual(pixelsToMeters(0, 0), { x: -7, z: -5 });
  assert.deepEqual(pixelsToMeters(1400, 860), { x: 7, z: 5 });
  assert.equal(RITUAL_POINTS.length, 3);
  assert.equal(nearestRitual(RITUAL_POINTS[0].x, RITUAL_POINTS[0].z).prompt, '척교');
});

test('Chiao faces map to the authored results and deterministic bounce plans', () => {
  assert.equal(resultForFaces(['flat', 'convex']), CHIAO_RESULTS.holy);
  assert.equal(resultForFaces(['convex', 'flat']), CHIAO_RESULTS.holy);
  assert.equal(resultForFaces(['flat', 'flat']), CHIAO_RESULTS.laugh);
  assert.equal(resultForFaces(['convex', 'convex']), CHIAO_RESULTS.dark);
  assert.equal(CHIAO_FOOTER, '전통 의식을 체험하는 연출이며 실제 예언이나 효험을 뜻하지 않아요.');
  for (const seed of [0, 1, 7, 19, 73, 0xffff]) {
    assert.deepEqual(chiaoPlan(['flat', 'convex'], seed), chiaoPlan(['flat', 'convex'], seed));
    const state = createRitualState();
    assert.equal(startRitual(state, 'chiao'), true);
    assert.equal(throwChiao(state, ['flat', 'convex'], seed), true);
    const expectedToks = state.active.plan.reduce((sum, plan) => sum + plan.impactTimes.length, 0);
    while (state.active?.phase === 'flight') advanceRitual(state, 0.1);
    assert.equal(state.pendingToks, expectedToks);
  }
});

test('incense persists through cancellation and clears only on sanctuary reset', () => {
  const state = createRitualState();
  assert.equal(startRitual(state, 'incense'), true);
  advanceRitual(state, 1.2);
  assert.equal(state.feedback.text, INCENSE_DONE);
  assert.equal(state.sticksLeft, RITUAL_CAPS.sticks);
  assert.equal(startRitual(state, 'burn'), true);
  cancelRitual(state);
  assert.equal(state.sticksLeft, RITUAL_CAPS.sticks);
  advanceRitual(state, 80);
  assert.equal(state.sticksLeft, RITUAL_CAPS.sticks);
  state.sticksLeft = 0;
  assert.equal(startRitual(state, 'incense'), true);
  startRitual(state, 'burn');
  assert.equal(state.sticksLeft, RITUAL_CAPS.sticks);
});

test('ritual movement locks and result messages remain exact', () => {
  const state = createRitualState();
  startRitual(state, 'burn');
  assert.deepEqual(ritualMovement(state, { moveX: 1, moveZ: -1, buttons: 255 }), {
    moveX: 0, moveZ: 0, buttons: 255,
  });
  advanceRitual(state, 4);
  assert.equal(state.feedback.text, BURN_DONE);
  assert.equal(state.feedback.note, BURN_NOTE);
  assert.equal(startRitual(state, 'incense'), true);
  advanceRitual(state, 2);
  assert.equal(state.feedback.text, INCENSE_DONE);
});

test('ritual state caps the authored visual pools', () => {
  assert.deepEqual(RITUAL_CAPS, { sticks: 3, embers: 16, blocks: 2 });
});

test('the hall has clear meter-scale spawn and ritual standing spots', () => {
  assert.equal(SANCTUARY_ARENA.width, 14);
  assert.equal(SANCTUARY_ARENA.depth, 10);
  assert.equal(SANCTUARY_ARENA.rooms.length, 1);
  assert.equal(SANCTUARY_ARENA.rooms[0].waves, undefined);
  const clear = (point, radius = 0.32) => SANCTUARY_ARENA.obstacles.every((obstacle) => {
    if (obstacle.type === 'circle') {
      return Math.hypot(point.x - obstacle.x, point.z - obstacle.z) >= radius + obstacle.radius;
    }
    const x = Math.max(obstacle.x - obstacle.width / 2, Math.min(point.x, obstacle.x + obstacle.width / 2));
    const z = Math.max(obstacle.z - obstacle.depth / 2, Math.min(point.z, obstacle.z + obstacle.depth / 2));
    return Math.hypot(point.x - x, point.z - z) >= radius;
  });
  assert.equal(clear(SANCTUARY_ARENA.playerSpawn), true);
  for (const ritual of RITUAL_POINTS) {
    assert.ok(Math.hypot(ritual.stand.x - ritual.x, ritual.stand.z - ritual.z) <= 1.6);
    assert.equal(clear(ritual.stand), true, `${ritual.id} standing spot should be unobstructed`);
  }
});
