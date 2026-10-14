import {withoutPlacement} from './m2b-placement-trace.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { masteryTraces } from './skill-mastery-trace.mjs';
import { MASTERY_SKILLS } from '../js/meta/skill-mastery.js';
test('27 stages × 3 seeds × 1800 ticks: AV1-enabled legacy-roster baseline unchanged (exact M2b placements reversed) for empty and max mastery saves',()=>{
 const baseline=JSON.parse(readFileSync(new URL('./fixtures/skill-mastery-traces.json',import.meta.url)));
 const ids=[...new Set(Object.keys(baseline.traces).map(key=>key.split('/')[0]))];
 assert.deepEqual(withoutPlacement(()=>masteryTraces({},ids)),baseline);
 assert.deepEqual(withoutPlacement(()=>masteryTraces(Object.fromEntries(MASTERY_SKILLS.map(id=>[id,500])),ids)),baseline);
});
