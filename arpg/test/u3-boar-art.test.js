import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { ATLAS_IDS, DIRECTIONS, atlasAnimation, atlasFrame } from '../js/render/atlas-state.js';
const read=path=>JSON.parse(readFileSync(new URL(path,import.meta.url)));
const evidence=read('../tools/art/u3-boar/license-evidence.json');
const source=read('../tools/art/u3-boar/source-validation.json');
const delivered=read('../tools/art/u3-boar/delivered-validation.json');
const manifest=read('../assets/sprites/manifest.json');
test('boar exact individual CC0 pig rig, original attack and separately authored recoil',()=>{
 assert.equal(evidence.model_page,'https://poly.pizza/m/u35l6uP5vj');assert.equal(evidence.license,'CC0-1.0');
 assert.match(evidence.individual_page_text,/Public Domain \(CC0\)/);
 const glb=evidence.files.find(f=>f.file==='Quaternius-Pig.glb');assert.equal(glb.bytes,300940);assert.equal(glb.sha256,source.model_sha256);
 assert.equal(source.ok,true);assert.equal(source.checked_mesh,'Pig');assert.equal(source.local_recoil.name,'U3_Boar_Recoil');
 assert.equal(source.skinned_clip_motion.hit.source,'U3_Boar_Recoil');assert.match(source.skinned_clip_motion.attack.source,/\|Headbutt$/);
 assert.equal(ATLAS_IDS.iron_boar,'iron-boar');assert.equal(ATLAS_IDS.wolf,'wolf');assert.equal(ATLAS_IDS.poison_spider,'poison-spider');
});
test('boar four articulated legs, five moving bone-mounted accessories, eight facings and exact alpha',()=>{
 assert.equal(source.articulated_legs.length,4);for(const leg of source.articulated_legs)assert.ok(source.run_leg_motion_radians[leg]>.001,leg);
 assert.equal(Object.keys(source.bone_attached_accessories).length,5);
 for(const [name,r] of Object.entries(source.bone_attached_accessories)){assert.equal(r.bone,name.startsWith('BoarArmor')?'Body':'Head');assert.ok(r.max_world_motion>.001,name);}
 for(const dir of DIRECTIONS)assert.ok(source.direction_vectors[dir].dot>.9,dir);
 const entry=manifest.find(e=>e.id==='iron-boar');assert.deepEqual(entry.content_ids,['iron_boar']);assert.deepEqual(entry.animations,['idle','run','attack','hit','death']);
 for(const state of entry.animations){assert.ok(source.skinned_clip_motion[state].max_skinned_rms_world>.001,state);assert.equal(delivered.unique_direction_hashes[state],8);}
 assert.equal(delivered.pose_profile,'boar');assert.equal(delivered.t_pose_frames,null);assert.equal(delivered.frames,delivered.lossless_alpha_matches_pose_evidence);
 assert.equal(delivered.clipped_frames,0);assert.ok(delivered.max_idle_center_drift_px<6);assert.ok(delivered.alpha_coverage_percent[0]>=3.125);
 assert.ok(delivered.total_bytes<=1500000);assert.equal(entry.bytes,delivered.total_bytes);for(const size of delivered.atlas_dimensions)assert.ok(size.every(n=>n<=2048));
});
test('boar retains readonly attack timing, full hit/death windows and every prior 9-kit byte',()=>{
 const entry=manifest.find(e=>e.id==='iron-boar');assert.deepEqual(entry.animation_durations,{hit:.15,death:.6});
 const entity=Object.freeze({kind:'monster',type:'iron_boar',act:Object.freeze({elapsed:8,def:Object.freeze({windupMs:400,lockMs:100,activeMs:100,recoveryMs:400})})});
 const before=JSON.stringify(entity);assert.equal(atlasAnimation(entity,{hurt:0}),'attack');assert.equal(atlasFrame('attack',7,100,10,entity,.1),1);
 assert.equal(atlasFrame('death',9,.59,10,{},.6),8);assert.equal(atlasFrame('hit',4,.14,10,{},.15),3);assert.equal(JSON.stringify(entity),before);
 const prior=read('../tools/art/u3-boar/preservation-validation.json');assert.equal(prior.baseline,'f3a6100');assert.equal(prior.manifest.length,9);
 for(const old of prior.manifest)assert.deepEqual(manifest.find(e=>e.id===old.id),old);
 for(const [path,hash] of Object.entries(prior.file_sha256))assert.equal(createHash('sha256').update(readFileSync(new URL('../assets/sprites/'+path,import.meta.url))).digest('hex'),hash,path);
});
test('boar profile does not weaken existing humanoid, wolf, spider or unknown-profile gates',()=>{
 const script=new URL('../tools/art/verify_atlases.py',import.meta.url).pathname;
 const out=execFileSync('python3',['-c',`import runpy\nv=runpy.run_path(${JSON.stringify(script)})['verify_pose']\nr={'name':'test','pose':{'arm_degrees_from_bind':[0,0],'skin_rms_from_bind_height':0,'armature_modifiers':1}}\nfor profile in ('humanoid','unknown'):\n try:v(r,1,profile)\n except AssertionError:pass\n else:raise AssertionError('weakened '+profile)\nfor profile in ('quadruped','arachnid','boar'):v(r,1,profile)\nprint('ok')`],{encoding:'utf8'});assert.equal(out.trim(),'ok');
});
