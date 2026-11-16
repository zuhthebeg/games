import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { deathTierForEntity } from '../js/render/death-effects.js';
import {
  emitCriticalConfirmationSparks,
  emitPredictedHitSparks,
} from '../js/render/hit-feedback.js';
import { hitReactionOffset } from '../js/render/hit-reaction.js';

const particleCells = JSON.parse(readFileSync(new URL('../assets/vfx/particles.json', import.meta.url), 'utf8')).cells;

test('enemy hit reaction eases to its peak and returns to zero after 180ms', () => {
  assert.deepEqual(hitReactionOffset(0, 3, 4), { x: 0, z: 0 });
  const peak = hitReactionOffset(60, 3, 4);
  assert.ok(Math.abs(peak.x - 0.072) < 1e-9);
  assert.ok(Math.abs(peak.z - 0.096) < 1e-9);
  assert.deepEqual(hitReactionOffset(180, 3, 4), { x: 0, z: 0 });
});

test('predicted enemy hits emit one spark burst without waiting for server confirmation', () => {
  const bursts = [];
  const vfx = { burst: (spec) => bursts.push(spec), emit: () => null };
  const world = {
    entities: [
      { id: 'player', kind: 'player', x: 0, z: 0, facing: 0 },
      { id: 'enemy', kind: 'enemy', enemyKind: 'minion', x: 1, z: 0, height: 1.7 },
    ],
  };

  const target = emitPredictedHitSparks(vfx, {
    type: 'predictedHit',
    castId: 'cast-1',
    sourceId: 'player',
    targetId: 'enemy',
  }, world);

  assert.equal(target, world.entities[1]);
  assert.equal(bursts.length, 1);
  assert.equal(bursts[0].preset, 'spark');
  assert.equal(bursts[0].count, 6);
});

test('predicted server confirmations add only critical extras', () => {
  const bursts = [];
  const emits = [];
  const vfx = {
    burst: (spec) => bursts.push(spec),
    emit: (...args) => emits.push(args),
  };
  const target = { id: 'enemy', kind: 'enemy', x: 1, z: 0, height: 1.7 };

  emitCriticalConfirmationSparks(vfx, { predictedLocally: true, critical: true }, target);
  emitCriticalConfirmationSparks(vfx, { predictedLocally: true, critical: false }, target);
  emitCriticalConfirmationSparks(vfx, { predictedLocally: false, critical: true }, target);

  assert.equal(bursts.length, 1);
  assert.equal(bursts[0].count, 4);
  assert.equal(emits.length, 1);
  assert.equal(emits[0][4].cell, 'flare_01');
});

test('particle atlas preserves slash_02 and maps procedural bone and crack cells', () => {
  assert.equal(particleCells.slash_02, 14);
  assert.equal(particleCells.bone, 16);
  assert.equal(particleCells.crack_01, 17);
});

test('party death snapshots use cached spawn traits and max-HP fallback', () => {
  const elite = deathTierForEntity(
    { kind: 'enemy', model: 'Skeleton_Minion', maxHp: 60 },
    { enemyKind: 'minion', elite: true, boss: false },
  );
  const boss = deathTierForEntity(
    { kind: 'enemy', model: 'Skeleton_Warrior', maxHp: 900 },
    { enemyKind: 'commander', elite: false, boss: true },
  );
  const eliteFallback = deathTierForEntity({
    kind: 'enemy', enemyKind: 'minion', model: 'Skeleton_Minion', maxHp: 60,
  });
  const bossFallback = deathTierForEntity({
    kind: 'enemy', model: 'Skeleton_Warrior', maxHp: 900,
  });

  assert.deepEqual(elite, { enemyKind: 'minion', boss: false, elite: true });
  assert.deepEqual(boss, { enemyKind: 'commander', boss: true, elite: false });
  assert.equal(eliteFallback.elite, true);
  assert.equal(bossFallback.boss, true);
});
