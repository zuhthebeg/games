// Dense geometric contract only. The independent 60Hz displacement gate is
// reported by this same oracle; a green unit suite is NOT a continuity PASS.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
test('R21b exact 13 clips and Hunt.syncModels 15 modes x65 satisfy post-clamp geometry and replay gates',()=>{
 const file=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'r21b-clamp-')),'metrics.json');
 execFileSync(process.execPath,[new URL('./r21b-warrok-clamp-measure.mjs',import.meta.url).pathname],{env:{...process.env,R21B_METRICS:file,R21B_TRAJECTORY_ONLY:''},timeout:120000,stdio:'pipe'});
 const m=JSON.parse(fs.readFileSync(file,'utf8')),r=m.variants[2];
 assert.equal(Object.keys(r.exported).length,13);assert.equal(Object.keys(r.production).length,15);
 assert.equal(r.factor,2);assert.equal(r.tipLength,4.86);assert.equal(r.reachLimit,8.0475);
 assert.equal(r.pass,true,JSON.stringify(r.violations));assert.ok(m.triangles<=200,'keep original stricter triangle budget');assert.equal(m.noUnwantedClamp,true);
 for(const rows of [r.exported,r.production])for(const [name,c] of Object.entries(rows)){
  assert.equal(c.samples,65);assert.ok(c.tipMin>=-.02,name+' tip');assert.ok(c.pommelMin>=-.05,name+' pommel');
  assert.ok(c.gripMax<=.02);assert.ok(c.fistMax<=.3);assert.equal(c.finite,true);
  assert.equal(c.frustumMisses,0);assert.equal(c.frustumVertexViolations,0);assert.ok(c.reachMax<=8.0475);
  assert.equal(c.repeatDeltaMax,0);assert.ok(c.minFraction>=.35&&c.minFraction<=1);
 }
 console.log('R21b geometry 1820/1820; separate 60Hz displacement gate: '+(m.continuityViolations.length?m.continuityViolations.length+' clip violations (BLOCKED)':'PASS'));
});
