import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { masteryTraces } from './skill-mastery-trace.mjs';
import { MASTERY_SKILLS } from '../js/meta/skill-mastery.js';
test('27 stages × 3 seeds × 1800 ticks: AV1-enabled baseline unchanged for empty and max mastery saves',()=>{
 const baseline=JSON.parse(readFileSync(new URL('./fixtures/skill-mastery-traces.json',import.meta.url)));
 const ids=[...new Set(Object.keys(baseline.traces).map(key=>key.split('/')[0]))];
 assert.deepEqual(masteryTraces({},ids),baseline);
 assert.deepEqual(masteryTraces(Object.fromEntries(MASTERY_SKILLS.map(id=>[id,500])),ids),baseline);
});
