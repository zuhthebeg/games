import test from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE, attackRate } from '../js/content/balance.js';

test('player attack rate is scaled 30% slower while DEX/weight caps keep their proportions', () => {
  assert.equal(BALANCE.attackBase, .7);
  assert.equal(attackRate(0, 8, .5), .7);
  assert.ok(Math.abs(attackRate(999, 0, 0) - .7 * BALANCE.attackSpeed.max) < 1e-12);
  assert.ok(Math.abs(attackRate(.2, 8, 0) - .84) < 1e-12);
  assert.equal(attackRate(0, 24, 1.2, 1000), .7 * BALANCE.attackSpeed.min);
});
