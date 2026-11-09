import assert from 'node:assert/strict';
import test from 'node:test';
import { acquireSettlement } from '../js/save/settlement-lock.js';

test('only one settlement attempt starts while the simulation is awaiting saves', () => {
  const state = { settled: false };
  let paused = false;

  assert.equal(acquireSettlement(state, () => { paused = true; }), true);
  assert.equal(state.settled, true);
  assert.equal(paused, true);
  assert.equal(acquireSettlement(state, () => assert.fail('loop paused more than once')), false);
});
