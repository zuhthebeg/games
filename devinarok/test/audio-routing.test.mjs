import assert from 'node:assert/strict';
import test from 'node:test';
import { FAMILY_SKILLS, LINEAGE_SKILL_SWAPS, SKILLS, skillsFor } from '../js/content/skills.js';
import { canPlayBoneSnap, castSoundFor, hitSoundLayers } from '../js/render/audio-routing.js';

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
  assert.equal(castSoundFor({ family: 'staff', step: 1 }), 'staff-cast');
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
