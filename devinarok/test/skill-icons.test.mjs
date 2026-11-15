import test from 'node:test';
import assert from 'node:assert/strict';
import { SKILLS } from '../js/content/skills.js';
import { SKILL_ICON_CELLS, skillIconPosition } from '../js/content/skill-icons.js';
import { FixedPool, particleLimitForQuality } from '../js/render/vfx-pool.js';

test('every skill and basic attack family has a skill icon', () => {
  for (const key of Object.keys(SKILLS)) {
    assert.ok(Number.isInteger(SKILL_ICON_CELLS[key]), `${key} is missing an icon cell`);
    assert.match(skillIconPosition(key), /^\d+(\.\d+)?% \d+(\.\d+)?%$/);
  }
  for (const family of ['sword', 'crossbow', 'staff']) {
    assert.ok(Number.isInteger(SKILL_ICON_CELLS[`basic:${family}`]));
  }
});

test('VFX particle cap follows quality and reuses the oldest particle', () => {
  assert.equal(particleLimitForQuality('high'), 700);
  assert.equal(particleLimitForQuality('medium'), 380);
  assert.equal(particleLimitForQuality('low'), 160);
  assert.equal(particleLimitForQuality('high', true), 350);
  assert.equal(particleLimitForQuality('medium', true), 190);
  assert.equal(particleLimitForQuality('low', true), 80);

  const pool = new FixedPool(3);
  const first = pool.acquire();
  const second = pool.acquire();
  const third = pool.acquire();
  assert.equal(pool.acquire(), first);
  assert.deepEqual(pool.active, [second, third, first]);
  pool.setLimit(2);
  assert.equal(pool.active.length, 2);
  assert.equal(pool.acquire(), third);
  pool.setLimit(0);
  assert.equal(pool.acquire(), null);
});
