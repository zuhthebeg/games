import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ATLAS_IDS, DIRECTIONS, atlasAnimation, atlasFrame } from '../js/render/atlas-state.js';
const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const evidence = read('../tools/art/u3-wolf/license-evidence.json');
const source = read('../tools/art/u3-wolf/source-validation.json');
const delivered = read('../tools/art/u3-wolf/delivered-validation.json');
const manifest = read('../assets/sprites/manifest.json');

test('wolf exact individual CC0 listing binds downloaded GLB to independently evaluated source', () => {
  assert.equal(evidence.model_page, 'https://poly.pizza/m/P1gU3Qkr9r');
  assert.equal(evidence.license, 'CC0-1.0');
  assert.match(evidence.individual_page_text, /Public Domain \(CC0\)/);
  assert.equal(evidence.files.find(f => f.file === 'Quaternius-Wolf.glb').sha256, source.model_sha256);
  assert.equal(evidence.files.find(f => f.file === 'Quaternius-Wolf.glb').bytes, 986712);
  assert.ok(evidence.files.find(f => f.file === 'poly-wolf-cc0.html').sha256);
  assert.equal(source.ok, true);
  assert.equal(source.checked_mesh, 'Wolf');
  assert.equal(ATLAS_IDS.wolf, 'wolf');
  assert.equal(ATLAS_IDS.poison_spider, undefined);
  assert.equal(ATLAS_IDS.iron_boar, undefined);
});

test('wolf has genuinely moving skinned clips, anatomical eight-facing proof and lossless transparent delivery', () => {
  const entry = manifest.find(e => e.id === 'wolf');
  assert.deepEqual(entry.content_ids, ['wolf']);
  assert.deepEqual(entry.animations, ['idle','run','attack','hit','death']);
  assert.equal(entry.bytes, delivered.total_bytes);
  assert.ok(delivered.total_bytes <= 1_500_000);
  assert.equal(delivered.frames, 576);
  assert.equal(delivered.lossless_alpha_matches_pose_evidence, 576);
  assert.equal(delivered.clipped_frames, 0);
  assert.equal(delivered.pose_profile, 'quadruped');
  for (const direction of DIRECTIONS) assert.ok(source.direction_vectors[direction].dot > .9);
  for (const animation of entry.animations) {
    assert.ok(source.skinned_clip_motion[animation].max_skinned_rms_world > .001);
    assert.equal(delivered.unique_direction_hashes[animation], 8);
  }
});

test('wolf source clip schedule is selected by existing host state without altering frozen state or timing', () => {
  const entity=Object.freeze({kind:'monster',type:'wolf',dead:false,moving:false,staggerLeft:0,
    act:Object.freeze({elapsed:8,def:Object.freeze({windupMs:400,lockMs:100,activeMs:100,recoveryMs:400})})});
  const before=JSON.stringify(entity);
  assert.equal(atlasAnimation(entity, {hurt:0}), 'attack');
  assert.equal(atlasFrame('attack',14,10,10,entity), 3);
  assert.equal(atlasAnimation({...entity,act:null,moving:true}, {hurt:0}), 'run');
  assert.equal(atlasAnimation(entity,{hurt:.1}), 'hit');
  assert.equal(atlasAnimation({...entity,dead:true},{hurt:.1}), 'death');
  assert.equal(JSON.stringify(entity),before);
});

test('wolf flinch and full collapse fit existing visual windows without changing shared fade/host attack', () => {
  const entry=manifest.find(e=>e.id==='wolf');
  assert.deepEqual(entry.animation_durations,{hit:.15,death:.6});
  assert.equal(atlasFrame('death',11,.59,10,{},entry.animation_durations.death),10);
  assert.equal(atlasFrame('hit',7,.14,10,{},entry.animation_durations.hit),6);
  assert.equal(atlasFrame('death',11,.59,10,{}),5,'other kits retain source fps');
  const entity={act:{elapsed:8,def:{windupMs:400,lockMs:100,activeMs:100,recoveryMs:400}}};
  assert.equal(atlasFrame('attack',14,100,10,entity,.1),3,'host-act timing still wins');
});
