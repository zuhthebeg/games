import assert from 'node:assert/strict';
import test from 'node:test';
import { isPerfectDodgeWindowActive } from '../js/render/dodge-window.js';

test('perfect-dodge rendering ends at the solo window boundary', () => {
  const player = { dodgeStartTick: 20 };
  assert.equal(isPerfectDodgeWindowActive({ tick: 24, partySize: 1 }, player), true);
  assert.equal(isPerfectDodgeWindowActive({ tick: 25, partySize: 1 }, player), false);
  assert.equal(isPerfectDodgeWindowActive({ tick: 24, partySize: 1 }, { dodgeStartTick: null }), false);
});

test('perfect-dodge rendering uses the longer party window', () => {
  const player = { dodgeStartTick: 20 };
  assert.equal(isPerfectDodgeWindowActive({ tick: 26, partySize: 2 }, player), true);
  assert.equal(isPerfectDodgeWindowActive({ tick: 27, partySize: 2 }, player), false);
});
