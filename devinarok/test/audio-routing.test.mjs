import assert from 'node:assert/strict';
import test from 'node:test';
import { ENEMIES } from '../js/content/enemies.js';
import { debugKillEnemy } from '../js/debug/combat.js';
import { FAMILY_SKILLS, LINEAGE_SKILL_SWAPS, SKILLS, skillsFor } from '../js/content/skills.js';
import {
  canPlayBoneSnap, castSoundFor, deathSoundLayers, hitSoundLayers, impactSoundFor, predictedHitSoundLayers,
} from '../js/render/audio-routing.js';
import { createStageWorld } from '../js/sim/world.js';

const EXPECTED_SKILL_SOUNDS = {
  spin: 'slash-whoosh',
  dash: 'slash-whoosh',
  guard: 'shield-clang',
  quake: 'heavy-slam',
  deadBurst: 'heavy-slam',
  pierce: 'arrow-flight',
  vault: 'crossbow-shot',
  volley: 'arrow-flight',
  poisonArrow: 'crossbow-shot',
  rain: 'arrow-flight',
  flame: 'flame',
  frost: 'frost',
  cursedHands: 'summon',
  blink: 'blink',
  meteor: 'staff-cast',
};

test('cast routing covers every family and lineage skill plus counters', () => {
  assert.deepEqual(new Set(Object.keys(EXPECTED_SKILL_SOUNDS)), new Set(Object.keys(SKILLS)));
  for (const family of Object.keys(FAMILY_SKILLS)) {
    for (const key of skillsFor(family)) {
      assert.equal(castSoundFor({ family, skillKey: key, skill: SKILLS[key].id }), EXPECTED_SKILL_SOUNDS[key]);
    }
    for (const lineage of Object.keys(LINEAGE_SKILL_SWAPS)) {
      for (const key of skillsFor(family, lineage)) {
        assert.equal(castSoundFor({ family, skillKey: key, skill: SKILLS[key].id }), EXPECTED_SKILL_SOUNDS[key]);
      }
    }
  }
  assert.equal(castSoundFor({ family: 'sword', skillId: 'counter' }), 'sword-swing');
  assert.equal(castSoundFor({ family: 'crossbow', skillId: 'counter' }), 'crossbow-shot');
  assert.equal(castSoundFor({ family: 'staff', skillId: 'counter' }), 'staff-cast');
  assert.equal(castSoundFor({ family: 'staff', step: 1 }), null);
});

test('basic cast routing resolves the source family and avoids duplicate ranged sounds', () => {
  const cast = { type: 'cast', step: 1, entityId: 42 };
  assert.equal(
    castSoundFor(cast, { entities: [{ id: 42, kind: 'player', family: 'sword' }] }),
    'slash-whoosh',
  );
  assert.equal(
    castSoundFor(cast, { entities: [{ id: 42, kind: 'player', family: 'crossbow' }] }),
    null,
  );
  assert.equal(
    castSoundFor(cast, { entities: [{ id: 42, kind: 'player', family: 'staff' }] }),
    null,
  );
  assert.equal(castSoundFor(cast), 'sword-swing');
  assert.equal(
    castSoundFor(
      { step: 1, entityId: 99 },
      { localPlayerId: 'local', entities: [{ id: 7, playerId: 'local', kind: 'player', family: 'staff' }] },
      'sword',
    ),
    null,
  );
});

test('critical hits layer a crit sound and bone snaps obey their minimum interval', () => {
  assert.deepEqual(hitSoundLayers({ critical: true, skill: 1 }, { family: 'sword' }), [
    { name: 'heavy-hit', gain: 1 },
    { name: 'crit-hit', gain: 0.7 },
  ]);
  assert.deepEqual(hitSoundLayers({ critical: false }, { family: 'sword' }), [
    { name: 'impact', gain: 1 },
  ]);
  assert.equal(canPlayBoneSnap(170, 100), true);
  assert.equal(canPlayBoneSnap(169, 100), false);
});

test('predicted party hits route skill damage and defer critical layers', () => {
  const source = { family: 'sword' };
  assert.deepEqual(
    predictedHitSoundLayers({ type: 'predictedHit', skill: 1 }, source).map(({ name }) => name),
    ['heavy-hit'],
  );
  assert.deepEqual(
    predictedHitSoundLayers({ type: 'predictedHit', skill: 0 }, source).map(({ name }) => name),
    ['impact'],
  );
  assert.deepEqual(
    predictedHitSoundLayers({ type: 'predictedHit', skill: 1, critical: true }, source).map(({ name }) => name),
    ['heavy-hit'],
  );
});

test('boss death routing uses solo fields and server-shaped party entities', () => {
  const world = createStageWorld({ seed: 37, stageId: 'KB' });
  const boss = world.entities.find((entity) => entity.kind === 'enemy' && entity.boss);
  assert.ok(boss);
  assert.equal(debugKillEnemy(world, boss), true);
  assert.equal(boss.dead, true);
  assert.equal(world.entities.includes(boss), true);
  assert.equal(boss.boss, true);
  const event = world.events.findLast((entry) => entry.type === 'death' && entry.entityId === boss.id);
  assert.ok(event);
  assert.deepEqual(deathSoundLayers(event, world), ['enemy-death', 'boss-death']);

  const serverBoss = {
    id: boss.id,
    kind: 'enemy',
    model: boss.model,
    maxHp: boss.maxHp,
    hp: 0,
    dead: true,
  };
  assert.equal('boss' in serverBoss, false);
  assert.deepEqual(deathSoundLayers(event, { entities: [serverBoss] }, { boss: true }), ['enemy-death', 'boss-death']);
  assert.deepEqual(deathSoundLayers(event, { entities: [serverBoss] }), ['enemy-death', 'boss-death']);

  const serverMinion = {
    id: 'normal-skeleton',
    kind: 'enemy',
    model: ENEMIES.minion.model,
    maxHp: ENEMIES.minion.hp,
    hp: 0,
    dead: true,
  };
  assert.deepEqual(
    deathSoundLayers({ entityId: serverMinion.id }, { entities: [serverMinion] }),
    ['enemy-death', 'bone-snap'],
  );
});

test('meteor impact kind routes to the meteor sound', () => {
  assert.equal(impactSoundFor({ type: 'impact', kind: 'meteor' }), 'meteor-impact');
  assert.equal(impactSoundFor({ type: 'impact', kind: 'weapon' }), 'impact');
});
