import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { ATLAS_IDS, DIRECTIONS, atlasAnimation, atlasFrame } from '../js/render/atlas-state.js';
const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const evidence = read('../tools/art/u3-spider/license-evidence.json');
const source = read('../tools/art/u3-spider/source-validation.json');
const delivered = read('../tools/art/u3-spider/delivered-validation.json');
const manifest = read('../assets/sprites/manifest.json');

test('spider individual CC0 license binds exact original GLB, distinct locally authored recoil', () => {
  assert.equal(evidence.model_page, 'https://poly.pizza/m/yRYJiAJyiM');
  assert.equal(evidence.license, 'CC0-1.0');
  assert.match(evidence.individual_page_text, /Public Domain \(CC0\)/);
  assert.equal(evidence.files.find(f=>f.file==='Quaternius-Spider.glb').sha256,source.model_sha256);
  assert.equal(evidence.files.find(f=>f.file==='Quaternius-Spider.glb').bytes,449008);
  assert.equal(source.ok,true);assert.equal(source.checked_mesh,'Cube');
  assert.equal(source.skinned_clip_motion.hit.source,'U3_Spider_Recoil');
  assert.equal(source.local_recoil.name,'U3_Spider_Recoil');
  assert.equal(ATLAS_IDS.poison_spider,'poison-spider');assert.equal(ATLAS_IDS.wolf,'wolf');
  assert.equal(ATLAS_IDS.iron_boar,undefined);
});

test('spider has eight articulated walking legs, moving clips and all eight anatomical facings',()=>{
  assert.equal(source.articulated_legs.length,8);
  for(const leg of source.articulated_legs)assert.ok(source.walk_leg_motion_radians[leg]>.001,leg);
  for(const dir of DIRECTIONS)assert.ok(source.direction_vectors[dir].dot>.9,dir);
  const entry=manifest.find(e=>e.id==='poison-spider');
  assert.deepEqual(entry.content_ids,['poison_spider']);
  assert.deepEqual(entry.animations,['idle','run','attack','hit','death']);
  for(const state of entry.animations){assert.ok(source.skinned_clip_motion[state].max_skinned_rms_world>.001,state);assert.equal(delivered.unique_direction_hashes[state],8);}
  assert.equal(delivered.pose_profile,'arachnid');assert.equal(delivered.t_pose_frames,null);
  assert.equal(delivered.frames,delivered.lossless_alpha_matches_pose_evidence);
  assert.equal(delivered.clipped_frames,0);assert.ok(delivered.max_idle_center_drift_px<6);
  assert.ok(delivered.alpha_coverage_percent[0]>=3.907);
  assert.ok(delivered.total_bytes<=1500000);assert.equal(entry.bytes,delivered.total_bytes);
  for(const size of delivered.atlas_dimensions)assert.ok(size.every(n=>n<=2048));
});

test('spider uses unchanged readonly host attack selection and full recoil/death presentation windows',()=>{
 const entry=manifest.find(e=>e.id==='poison-spider');
 assert.deepEqual(entry.animation_durations,{hit:.15,death:.6});
 const entity=Object.freeze({kind:'monster',type:'poison_spider',act:Object.freeze({elapsed:8,def:Object.freeze({windupMs:400,lockMs:100,activeMs:100,recoveryMs:400})})});
 const before=JSON.stringify(entity);assert.equal(atlasAnimation(entity,{hurt:0}),'attack');
 assert.equal(atlasFrame('attack',8,100,10,entity,.1),2);
 assert.equal(atlasFrame('death',11,.59,10,{},.6),10);
 assert.equal(atlasFrame('hit',4,.14,10,{},.15),3);
 assert.equal(JSON.stringify(entity),before);
});

test('arachnid verification never relaxes humanoid quaternion/bind gates and rejects unknown profiles',()=>{
 const script=new URL('../tools/art/verify_atlases.py',import.meta.url).pathname;
 const out=execFileSync('python3',['-c',`import runpy\nv=runpy.run_path(${JSON.stringify(script)})['verify_pose']\nr={'name':'test','pose':{'arm_degrees_from_bind':[0,0],'skin_rms_from_bind_height':0,'armature_modifiers':1}}\nfor profile in ('humanoid','unknown'):\n try:v(r,1,profile)\n except AssertionError:pass\n else:raise AssertionError('weakened '+profile)\nv(r,1,'arachnid')\nv(r,1,'quadruped')\nprint('ok')`],{encoding:'utf8'});
 assert.equal(out.trim(),'ok');
});
