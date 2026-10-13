import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { masteryTraces } from './skill-mastery-trace.mjs';
import { MASTERY_SKILLS } from '../js/meta/skill-mastery.js';
test('24 stages × 3 seeds × 1800 ticks: original baseline unchanged for empty and max mastery saves',()=>{
 const baseline=JSON.parse(readFileSync(new URL('./fixtures/skill-mastery-traces.json',import.meta.url)));
 assert.deepEqual(masteryTraces(),baseline);
 assert.deepEqual(masteryTraces(Object.fromEntries(MASTERY_SKILLS.map(id=>[id,500]))),baseline);
});
