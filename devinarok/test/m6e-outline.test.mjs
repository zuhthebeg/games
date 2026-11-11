import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ENEMY_SILHOUETTES,
  OUTLINE_STYLES,
  outlineKindFor,
  silhouetteScale,
  smoothOutlineNormals,
} from '../js/render/outline-style.js';
import { QUALITY_PRESETS } from '../js/render/quality.js';

test('outlineKindFor selects only the current enemy target and bounty targets', () => {
  assert.equal(outlineKindFor({ kind: 'loot' }), null);
  assert.equal(outlineKindFor({ kind: 'enemy', dead: true }), null);
  assert.equal(outlineKindFor({ kind: 'enemy', state: 'dead' }), null);
  assert.equal(outlineKindFor({ kind: 'unknown' }), null);
  assert.equal(outlineKindFor({ kind: 'player', family: 'crossbow' }), null);
  assert.equal(outlineKindFor({ kind: 'enemy', id: 'other' }, null, 'target'), null);
  assert.equal(outlineKindFor({ kind: 'enemy', id: 'target' }, null, 'target'), 'enemy');
  assert.equal(outlineKindFor({ kind: 'enemy', id: 'bounty', bounty: true }, null, 'other'), 'bounty');
  assert.equal(outlineKindFor({ kind: 'enemy', id: 'target' }, {
    objective: { type: 'hunt', state: 'active', targetId: 'target' },
  }, 'other'), 'bounty');
  assert.equal(outlineKindFor({ kind: 'enemy', id: 'target' }, {
    objective: { type: 'hunt', state: 'failed', targetId: 'target' },
  }, 'target'), 'enemy');
  assert.deepEqual(Object.keys(OUTLINE_STYLES), ['enemy', 'bounty']);
});

test('silhouetteScale applies enemy proportions and preserves the uniform base scale elsewhere', () => {
  assert.deepEqual(silhouetteScale({ kind: 'enemy', enemyKind: 'rogue', modelScale: 2 }), [1.8, 2.12, 1.8]);
  assert.deepEqual(silhouetteScale({ kind: 'enemy', enemyKind: 'minion' }), [0.95 * 0.88, 0.95 * 0.86, 0.95 * 0.88]);
  assert.deepEqual(silhouetteScale({ kind: 'enemy', enemyKind: 'unknown', modelScale: 1.2 }), [1.2, 1.2, 1.2]);
  assert.deepEqual(silhouetteScale({ kind: 'enemy', enemyKind: 'brute', boss: true }), [0.95, 0.95, 0.95]);
  assert.deepEqual(silhouetteScale({ kind: 'player', modelScale: 1.1 }), [1.1, 1.1, 1.1]);
  assert.equal(Object.hasOwn(ENEMY_SILHOUETTES, 'brute'), true);
});

test('smoothOutlineNormals averages coincident vertices to a shared unit normal', () => {
  const result = smoothOutlineNormals(
    [0, 0, 0, 0, 0, 0],
    [1, 0, 0, 0, 1, 0],
  );
  const diagonal = Math.SQRT1_2;
  for (const offset of [0, 3]) {
    assert.ok(Math.abs(result[offset] - diagonal) < 1e-6);
    assert.ok(Math.abs(result[offset + 1] - diagonal) < 1e-6);
    assert.equal(result[offset + 2], 0);
  }
});

test('smoothOutlineNormals preserves lone and zero-sum normals', () => {
  const result = smoothOutlineNormals(
    [1, 2, 3, 0, 0, 0, 0, 0, 0],
    [0, 0, 2, 1, 0, 0, -1, 0, 0],
  );
  assert.deepEqual(Array.from(result), [0, 0, 2, 1, 0, 0, -1, 0, 0]);
});

test('outline quality is disabled on low and enabled on medium and high', () => {
  assert.equal(QUALITY_PRESETS.low.outlines, false);
  assert.equal(QUALITY_PRESETS.medium.outlines, true);
  assert.equal(QUALITY_PRESETS.high.outlines, true);
});
