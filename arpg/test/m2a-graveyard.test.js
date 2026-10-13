import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import * as combat from '../js/content/combat.js';
import * as identity from '../js/content/monsters.js';
import {ATLAS_IDS,DIRECTIONS,atlasAnimation,atlasDirection} from '../js/render/atlas-state.js';
import {createWorld,addPlayer,spawnMonster,step} from '../js/sim/world.js';
import {rollDrops} from '../js/meta/items.js';
import {validateContent} from '../tools/validate-content.mjs';
const ids=['ghoul','ghost','bat'];
const read=p=>readFileSync(new URL(p,import.meta.url));
const json=p=>JSON.parse(read(p));
const sha=v=>createHash('sha256').update(v).digest('hex');
const stable=v=>typeof v==='function'?v.toString():JSON.stringify(v);
const proof=json('../tools/art/m2a/delivered-validation.json');
const source=json('../tools/art/m2a/source-validation.json');
const preservation=json('../tools/art/m2a/preservation-validation.json');
const manifest=json('../assets/sprites/manifest.json');

test('M2a adds three hostile graveyard identities, role-scaled T4 numbers and only existing abilities',()=>{
 assert.deepEqual(validateContent(),[]);
 const roles={ghoul:'skeleton_warrior',ghost:'skeleton_mage',bat:'skeleton_rogue'};
 for(const id of ids){
  assert.ok(identity.MONSTER_MODELS.includes(id));assert.equal(ATLAS_IDS[id],id);
  assert.ok(identity.MONSTER_NAMES[id]);const variant=identity.MONSTER_VARIANTS[id];
  assert.equal(variant.disposition,'hostile');assert.equal(variant.baseArchetypeId,id);assert.equal(variant.baseModelId,id);
  assert.equal(variant.lifeState,id==='bat'?'beast':'undead');assert.equal(combat.MONSTERS[id].lifeState,variant.lifeState);
  assert.deepEqual(identity.MONSTER_PALETTES[variant.paletteId],[0xffffff]);
  assert.equal(combat.MONSTERS[id].hp/combat.MONSTERS[roles[id]].hp,1.5);
  assert.ok(combat.MONSTERS[id].abilities.every(a=>preservation.other_combat_exports_sha256.ABILITIES&&combat.ABILITIES[a]));
  assert.throws(()=>rollDrops(id,0),/unknown drop table/);
 }
 assert.deepEqual(combat.MONSTERS.ghoul.abilities,['goblin_slash']);assert.deepEqual(combat.MONSTERS.ghost.abilities,['sling_stone']);assert.deepEqual(combat.MONSTERS.bat.abilities,['goblin_hop','goblin_slash']);
 assert.ok(combat.MONSTERS.ghoul.poise>combat.MONSTERS.skeleton_warrior.poise);
 assert.ok(combat.MONSTERS.ghoul.speed<combat.MONSTERS.skeleton_warrior.speed);assert.ok(combat.MONSTERS.bat.speed>combat.MONSTERS.skeleton_rogue.speed);
 assert.deepEqual(combat.MONSTERS.ghost.keepRange,[230,330]);
 for(const stage of Object.values(combat.STAGES))assert.ok(stage.spawns.every(e=>!ids.includes(e.monster)));
});

test('M2a real host spawns and runs all three archetypes without simulation changes',()=>{
 for(const id of ids){const w=createWorld({seed:42});addPlayer(w,{pid:'a',x:400,y:400,mods:{maxHp:10000}});const e=spawnMonster(w,id,480,400);e.spawnLeft=0;for(let i=0;i<150;i++)step(w);assert.equal(e.type,id);assert.ok(Number.isFinite(e.hp));assert.ok(Number.isFinite(e.x)&&Number.isFinite(e.y));}
});

test('M2a individual model pages bind source hashes, attribution and full legal text',()=>{
 const license=json('../tools/art/m2a/license-evidence.json');const preparation=json('../tools/art/m2a/preparation.json');
 for(const r of preparation)assert.equal(r.prepared_sha256,source.results.find(v=>v.id===r.id).model_sha256);
 assert.deepEqual(preparation.find(r=>r.id==='ghoul').derived_clips,['M2a_Ghoul_CalmIdle','M2a_Ghoul_Recoil','M2a_Ghoul_Death']);
 assert.equal(source.results.find(r=>r.id==='ghoul').skinned_clip_motion.idle.source,'M2a_Ghoul_CalmIdle');
 assert.deepEqual(license.map(r=>r.id),ids);
 for(const r of license){assert.match(r.model_page,/^https:\/\/poly.pizza\/m\//);assert.equal(r.author,'Quaternius');assert.equal(r.license,r.id==='ghoul'?'CC-BY-3.0':'CC0-1.0');assert.match(r.individual_page_text,r.id==='ghoul'?/Creative Commons Attribution/:/Public Domain \(CC0\)/);assert.equal(r.attribution_required,r.id==='ghoul');assert.equal(r.files.find(f=>f.file===r.id+'.glb').sha256,source.results.find(v=>v.id===r.id).original_sha256);assert.ok(r.files.every(f=>/^[a-f0-9]{64}$/.test(f.sha256)));assert.ok(read('../tools/art/m2a/'+r.id+'-page-license.txt').toString().includes(r.model_page));}
 assert.match(read('../assets-ledger.md').toString(),/Animated Zombie by Quaternius.*CC BY 3.0; modified/);
 assert.match(read('../tools/art/m2a/LICENSE-CC-BY-3.0.txt').toString(),/Attribution 3.0 Unported/);
 assert.match(read('../tools/art/m2a/LICENSE-CC0-1.0.txt').toString(),/CC0 1.0 Universal/);
});

test('M2a delivered bytes bind every frame alpha to real articulated geometry and correct ground',()=>{
 assert.equal(proof.ok,true);assert.equal(source.ok,true);assert.equal(proof.empty_frames,0);assert.equal(proof.identical_silhouettes,0);
 assert.equal(proof.results.length,3);assert.equal(proof.total_frames,proof.results.reduce((n,r)=>n+r.frames,0));
 for(const [file,hash] of Object.entries(proof.file_sha256))assert.equal(sha(read('../assets/sprites/'+file)),hash,file);
 for(const r of proof.results){
  const entry=manifest.find(v=>v.id===r.name);const s=source.results.find(v=>v.id===r.name);
  assert.equal(r.frames,r.lossless_alpha_matches_pose_evidence);assert.equal(r.clipped_frames,0);assert.ok(r.min_opaque_pixels_alpha128>=512);assert.ok(r.min_opaque_pixels_alpha250>0);assert.ok(r.max_idle_center_drift_px<6);assert.ok(r.total_bytes<=1500000);assert.equal(entry.bytes,r.total_bytes);
  assert.deepEqual(entry.animations,['idle','run','attack','hit','death']);assert.deepEqual(entry.animation_durations,{hit:.15,death:.6});for(const axis of ['x','y'])assert.ok(Math.abs(entry.anchor[axis]-s.ground_anchor[axis])<1e-6,'independent anchor '+axis);
  for(const state of entry.animations){assert.equal(r.unique_direction_hashes[state],8);assert.ok(s.skinned_clip_motion[state].max_skinned_rms_world>.001);}
  for(const dir of DIRECTIONS)assert.ok(s.direction_vectors[dir].dot>.9);
  assert.equal(s.frames_checked,r.frames);assert.ok(s.max_ground_error_px<.001);assert.equal(s.baked_ground_shadow,false);assert.equal(s.light_shadows,false);
  for(const dims of r.atlas_dimensions)assert.ok(dims.every(v=>v<=2048));
 }
 const bat=source.results.find(v=>v.id==='bat');assert.equal(Object.keys(bat.wing_motion_radians).length,4);assert.ok(Object.values(bat.wing_motion_radians).every(v=>v>.001));assert.ok(bat.min_idle_vertex_z>0);assert.ok(Object.values(bat.idle_body_core_drift_px).every(v=>v<6));
 const winged=proof.results.find(r=>r.name==='bat');assert.equal(winged.idle_center_method,'reopened-rig body/head core');assert.equal(winged.max_idle_center_drift_px,Math.max(...Object.values(bat.idle_body_core_drift_px)));assert.ok(winged.max_idle_bbox_center_drift_px>winged.max_idle_center_drift_px);
 const ghoul=proof.results.find(v=>v.name==='ghoul');assert.equal(ghoul.pose_profile,'humanoid');assert.equal(ghoul.t_pose_frames,0);assert.equal(ghoul.bind_pose_frames,0);assert.ok(ghoul.min_max_arm_degrees_from_bind>10);assert.ok(ghoul.min_skin_rms_from_bind_height>.015);assert.ok(ghoul.alpha_coverage_percent[0]>=5);assert.ok(ghoul.min_opaque_pixels_alpha128>=819);
 assert.equal(proof.silhouette_pairs.length,3);for(const pair of proof.silhouette_pairs){assert.equal(pair.samples,120);assert.ok(pair.min_xor_pixels>0);assert.ok(pair.min_xor_over_union>0);assert.equal(pair.identical_silhouettes,0);assert.equal(pair.all_frame_identical_masks,0);assert.ok(pair.all_frame_min_xor_pixels>0);assert.ok(pair.unique_mask_pairs_checked>0);}
});

test('M2a preserves all main combat/identity entries, sprites, sim/net/renderer/index/loot bytes',()=>{
 assert.equal(preservation.ok,true);assert.equal(preservation.baseline,'fef289f739ed2fa7d2bd86a93e15d3bd39165249');assert.equal(Object.keys(preservation.original_monster_sha256).length,16);
 for(const [id,hash] of Object.entries(preservation.original_monster_sha256))assert.equal(sha(stable(combat.MONSTERS[id])),hash,id);
 for(const [key,hash] of Object.entries(preservation.other_combat_exports_sha256))assert.equal(sha(stable(combat[key])),hash,key);
 for(const [key,baseline] of Object.entries(preservation.identity_baseline)){if(baseline.entries)for(const [id,hash] of Object.entries(baseline.entries))assert.equal(sha(stable(identity[key][id])),hash);else assert.equal(sha(stable(identity[key].slice(0,baseline.prefix_length))),baseline.sha256);}
 for(const [file,hash] of Object.entries({...preservation.unchanged_files_sha256,...preservation.preserved_sprite_sha256})){if(file==='arpg/index.html')assert.equal(sha(read('../index.html').toString().replace(/\?v=[a-f0-9]{10}/g,'?v=STAMP')),preservation.normalized_index_sha256,'parent stamp only');else assert.equal(sha(read('../'+file.replace(/^arpg\//,''))),hash,file);}
 assert.deepEqual(manifest.slice(0,preservation.original_manifest.length),preservation.original_manifest);
 assert.deepEqual(Object.keys(combat.MONSTERS).filter(id=>!Object.hasOwn(preservation.original_monster_sha256,id)),ids);
});

test('M2a preserves every stage host digest across 216 seeded weapon runs',()=>{
 const e=json('../tools/art/m2a/host-trace-validation.json');const a=read('../tools/art/m2a/host-trace-before.json');const b=read('../tools/art/m2a/host-trace-after.json');assert.equal(e.ok,true);assert.equal(e.cmp_equal,true);assert.equal(e.traces,216);assert.deepEqual(e.stage_ids,Object.keys(combat.STAGES));assert.equal(sha(a),e.before_sha256);assert.equal(sha(b),e.after_sha256);assert.deepEqual(a,b);
});

test('M2a states and octants are readonly; humanoid and unknown-profile guards are not relaxed',()=>{
 for(const id of ids)for(const [i,dir] of DIRECTIONS.entries()){const e=Object.freeze({type:id,facing:i*Math.PI/4,dead:false,moving:false,act:null});const a=Object.freeze({hurt:0});assert.equal(atlasDirection(e.facing),dir);assert.equal(atlasAnimation(e,a),'idle');assert.equal(atlasAnimation(Object.freeze({...e,moving:true}),a),'run');assert.equal(atlasAnimation(Object.freeze({...e,act:Object.freeze({elapsed:2})}),a),'attack');assert.equal(atlasAnimation(e,Object.freeze({hurt:.1})),'hit');assert.equal(atlasAnimation(Object.freeze({...e,dead:true}),a),'death');}
 const script=new URL('../tools/art/verify_atlases.py',import.meta.url).pathname;
 assert.equal(execFileSync('python3',['-c',`import runpy\nv=runpy.run_path(${JSON.stringify(script)})['verify_pose']\nr={'name':'negative','pose':{'arm_degrees_from_bind':[0,0],'skin_rms_from_bind_height':0,'armature_modifiers':1}}\nfor profile in ('humanoid','unknown'):\n try:v(r,1,profile)\n except AssertionError:pass\n else:raise AssertionError('weakened '+profile)\nprint('ok')`],{encoding:'utf8'}).trim(),'ok');
});

test('M2a native CDP desktop/mobile debug spawn loads 3 kits, 240 state/octant samples and no errors',()=>{
 const e=json('../tools/art/m2a/browser-validation.json');assert.equal(e.ok,true);assert.equal(e.consoleErrors,0);assert.equal(e.cdpPort,19951);assert.equal(e.httpPort,8971);assert.equal(e.screenshots,0);assert.deepEqual(e.results.map(r=>r.viewport),[[1280,800],[390,844]]);
 for(const r of e.results){assert.equal(r.consoleErrors,0);assert.equal(r.gpu.contextLost,false);assert.deepEqual(r.live.map(v=>v.key),ids);assert.equal(r.proof.length,3);for(const kit of r.proof){assert.equal(kit.samples.length,40);assert.equal(kit.procedural,true);assert.equal(kit.frozenEntityUnchanged,true);for(const state of ['idle','run','attack','hit','death'])assert.deepEqual(kit.samples.filter(s=>s.state===state).map(s=>s.direction),DIRECTIONS);}}
});
