import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import * as combat from '../js/content/combat.js';
import * as identity from '../js/content/monsters.js';
import {ATLAS_IDS,DIRECTIONS} from '../js/render/atlas-state.js';
import {createWorld,addPlayer,spawnMonster,step} from '../js/sim/world.js';
import {rollDrops} from '../js/meta/items.js';
import {validateContent} from '../tools/validate-content.mjs';
const ids=['demon','goleling','slime'];
const read=p=>readFileSync(new URL(p,import.meta.url)),json=p=>JSON.parse(read(p));
const sha=b=>createHash('sha256').update(b).digest('hex');
const proof=()=>json('../tools/art/m2b/delivered-validation.json');
test('M2b exact three registry mappings are the only approved renderer delta',()=>{
 const p='arpg/js/render/atlas-state.js';const old=execFileSync('git',['show','0c64a94:'+p],{encoding:'utf8'});
 assert.equal(read('../js/render/atlas-state.js').toString(),old.replace("  ghoul: 'ghoul', ghost: 'ghost', bat: 'bat',","  ghoul: 'ghoul', ghost: 'ghost', bat: 'bat',\n  demon: 'demon', goleling: 'goleling', slime: 'slime',"));
 const r=json('../tools/art/m2b/registration-validation.json');assert.equal(r.ok,true);assert.equal(r.status,'REGISTERED');assert.equal(r.manifest_fetch_calls,1);assert.equal(r.sheet_load_calls,3);assert.equal(r.atlas_registry_only_three_mappings,true);
 for(const [p,h] of Object.entries(r.unchanged_files_sha256)){
  if(p==='arpg/index.html'){
   const baseline=execFileSync('git',['show','0c64a94:'+p],{encoding:'utf8'});
   assert.equal(sha(baseline),h,p+' source proof');
   let stamped=baseline;
   for(const module of ['js/content/combat.js','js/content/loot.js','js/content/monsters.js','js/render/atlas-state.js']){
    const hash=sha(read('../'+module)).slice(0,10);
    stamped=stamped.replace(new RegExp('(\\./'+module.replaceAll('.','\\.')+'\\?v=)[a-f0-9]{10}'),'$1'+hash);
   }
   const current=read('../index.html').toString();
   const approved=execFileSync('git',['show','ded59e3:'+p],{encoding:'utf8'});
   assert.ok(current===approved||current===stamped,p+' only approved ded59e3 index or exact parent-owned stamps allowed');
  }else if(p==='arpg/js/content/loot.js'){
   const current=read('../js/content/loot.js').toString();
   assert.equal(sha(current.replace(/  \/\/ M2b placement:[\s\S]*?  \/\/ M2b placement end\.\n/,'')),h,p+' only exact new tables allowed');
  }else assert.equal(sha(read('../'+p.replace(/^arpg\//,''))),h,p);
 }
});
test('M2b hostile identities use existing abilities, are minimally placed and have valid drops',()=>{
 assert.deepEqual(validateContent(),[]);
 for(const id of ids){assert.equal(ATLAS_IDS[id],id);assert.ok(identity.MONSTER_MODELS.includes(id));assert.ok(identity.MONSTER_NAMES[id]);const v=identity.MONSTER_VARIANTS[id];assert.equal(v.baseModelId,id);assert.equal(v.disposition,'hostile');assert.equal(v.lifeState,combat.MONSTERS[id].lifeState);assert.deepEqual(identity.MONSTER_PALETTES[v.paletteId],[0xffffff]);assert.ok(combat.MONSTERS[id].abilities.every(a=>combat.ABILITIES[a]));assert.ok(!combat.MONSTERS[id].heavyPoise);assert.ok(Number.isSafeInteger(rollDrops(id,0,{huntTier:3}).gold));}
 assert.deepEqual(Object.entries(combat.STAGES).flatMap(([stage,s])=>s.spawns.filter(e=>ids.includes(e.monster)).map(e=>[stage,e.monster])),[['S8','slime'],['S12','goleling'],['S17','demon']]);
 assert.deepEqual(combat.MONSTERS.demon.abilities,['goblin_slash']);assert.deepEqual(combat.MONSTERS.goleling.abilities,['goblin_hop','goblin_slash']);assert.deepEqual(combat.MONSTERS.slime.abilities,['wolf_bite']);
});
test('M2b actual host archetypes spawn and run without simulation edits',()=>{
 for(const id of ids){const w=createWorld({seed:42});addPlayer(w,{pid:'a',x:400,y:400,mods:{maxHp:10000}});const e=spawnMonster(w,id,480,400);e.spawnLeft=0;for(let i=0;i<150;i++)step(w);assert.equal(e.type,id);assert.ok([e.x,e.y,e.hp].every(Number.isFinite));}
});
test('M2b individual CC0 pages bind retained originals and legal text',()=>{
 const l=json('../tools/art/m2b/license-evidence.json'),s=json('../tools/art/m2b/source-validation.json');assert.deepEqual(l.map(v=>v.id),ids);
 for(const v of l){assert.equal(v.license,'CC0-1.0');assert.equal(v.author,'Quaternius');assert.equal(sha(read('../tools/art/m2b/LICENSE-CC0-1.0.txt')),v.legal_text_sha256);assert.match(v.individual_page_text,/Public Domain \(CC0\)/);assert.equal(v.files.find(f=>f.file===v.id+'.glb').sha256,s.results.find(r=>r.id===v.id).original_sha256);assert.ok(read('../tools/art/m2b/'+v.id+'-page-license.txt').toString().includes(v.model_page));}
});
test('M2b delivered alpha, native 40 clips and ground/grip/anatomy are byte bound',()=>{
 const p=proof(),s=json('../tools/art/m2b/source-validation.json');assert.equal(p.ok,true);assert.equal(p.total_frames,576);assert.equal(p.empty_frames,0);assert.equal(p.identical_silhouettes,0);assert.equal(s.ok,true);
 for(const [file,h] of Object.entries(p.file_sha256))assert.equal(sha(read('../assets/sprites/'+file)),h,file);
 for(const r of p.results){const a=s.results.find(v=>v.id===r.name);assert.equal(r.clipped_frames,0);assert.equal(r.frames,r.lossless_alpha_matches_pose_evidence);assert.equal(a.frames_checked,r.frames);assert.ok(a.max_ground_error_px<.001);assert.ok(r.max_idle_center_drift_px<6);assert.equal(Object.keys(r.animated_silhouettes).length,40);for(const state of ['idle','run','attack','hit','death']){assert.equal(r.unique_direction_hashes[state],8);assert.ok(a.skinned_clip_motion[state].max_skinned_rms_world>.001);for(const d of DIRECTIONS)assert.ok(r.animated_silhouettes[state+'_'+d].unique_aligned_masks>1);}for(const d of DIRECTIONS)assert.ok(a.direction_vectors[d].dot>.9);}
 assert.ok(s.results.find(v=>v.id==='demon').trident_joint_local_max_error<.001);assert.ok(Object.values(s.results.find(v=>v.id==='goleling').wing_motion_radians).every(v=>v>.001));
});
test('M2b GPU RGBA budget uses full decoded sheet capacity, not compressed bytes',()=>{
 const manifest=json('../assets/sprites/manifest.json');for(const r of proof().results){let bytes=0;for(const sheet of manifest.find(e=>e.id===r.name).sheets){const m=json('../assets/sprites/'+r.name+'/'+sheet).meta;assert.ok(m.size.w<=2048&&m.size.h<=2048);bytes+=m.size.w*m.size.h*4;}assert.equal(r.gpu_rgba_bytes,bytes);assert.equal(r.gpu_rgba_mib,bytes/1048576);assert.ok(bytes<=16*1048576);assert.ok(bytes<=20*1048576);}
});
test('M2b historical art-only registration retains its 243 identical host traces (placement tested separately)',()=>{
 const r=json('../tools/art/m2b/registration-validation.json');assert.equal(r.host_traces,243);assert.equal(r.host_trace_equal,true);const a=read('../tools/art/m2b/host-trace-before.json'),b=read('../tools/art/m2b/host-trace-after.json');assert.deepEqual(a,b);assert.equal(sha(a),r.host_trace_sha256);
});
test('M2b native desktop/mobile actual registered entity loading, motion and fallback error zero',()=>{
 const r=json('../tools/art/m2b/browser-validation.json');assert.equal(r.ok,true);assert.equal(r.consoleErrors,0);assert.equal(r.screenshots,0);assert.deepEqual(r.results.map(v=>v.viewport),[[1280,800],[390,844]]);
 for(const row of r.results){assert.equal(row.gpu.contextLost,false);assert.deepEqual(row.live.map(v=>v.key),ids);for(const kit of row.proof){const expected=proof().results.find(v=>v.name===kit.id);assert.equal(kit.rgbaBytes,expected.gpu_rgba_bytes);assert.deepEqual(kit.textureDimensions,expected.atlas_dimensions);assert.equal(kit.samples.length,40);assert.equal(kit.procedural,true);assert.equal(kit.frozenEntityUnchanged,true);for(const state of ['idle','run','attack','hit','death']){assert.deepEqual(kit.samples.filter(v=>v.state===state).map(v=>v.direction),DIRECTIONS);assert.ok(state==='attack'?new Set(kit.motion[state].frames).size>1:kit.motion[state].uniqueFrames>1);}}}
});
