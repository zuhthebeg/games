import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {ATLAS_IDS,DIRECTIONS,atlasAnimation,atlasFrame,atlasScale} from '../js/render/atlas-state.js';
import {AtlasLibrary} from '../js/render/atlas-library.js';
import {VisualProvider} from '../js/render/visual-provider.js';
import {createWorld,spawnMonster} from '../js/sim/world.js';
const base=new URL('../assets/sprites/',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('manifest.json',base)));
const kit=manifest.find(k=>k.id==='scarecrow');
test('scarecrow only adds complete eight-octant 128px clips within existing atlas memory budget',async()=>{
 assert.equal(ATLAS_IDS.scarecrow,'scarecrow');assert.ok(kit);assert.deepEqual(kit.content_ids,['scarecrow']);
 assert.deepEqual(kit.animations,['idle','run','attack','hit','death']);
 assert.ok(kit.anchor.x>.35&&kit.anchor.x<.65);assert.ok(kit.anchor.y>.5&&kit.anchor.y<1);
 let bytes=0,decoded=0,frames=0;const groups={};
 for(const file of kit.sheets){const url=new URL(`scarecrow/${file}`,base),s=JSON.parse(await readFile(url));Object.assign(groups,s.animations);
  assert.match(s.meta.image,/\.webp$/);assert.ok(s.meta.size.w<=2048&&s.meta.size.h<=2048);decoded+=s.meta.size.w*s.meta.size.h*4;
  bytes+=(await stat(url)).size+(await stat(new URL(`scarecrow/${s.meta.image}`,base))).size;
  for(const f of Object.values(s.frames)){frames++;assert.deepEqual(f.sourceSize,{w:128,h:128});assert.deepEqual(f.anchor,kit.anchor);assert.equal(f.trimmed,false);}
 }
 assert.equal(frames,264);assert.equal(bytes,kit.bytes);assert.ok(bytes<=1500000);assert.ok(decoded<=18*1024*1024);
 for(const state of kit.animations)for(const d of DIRECTIONS)assert.equal(groups[`${state}_${d}`].length,{idle:8,run:8,attack:8,hit:3,death:6}[state]);
});
test('scarecrow remains spawn-lazy, shares its promise, releases and has stable failure fallback',async()=>{
 const calls=[],unloaded=[];const lib=new AtlasLibrary({baseUrl:base,fetchManifest:async()=>manifest,loadSheet:async url=>{calls.push(url);return JSON.parse(await readFile(new URL(url)));},unloadSheet:async url=>unloaded.push(url)});
 lib.beginRound(['blade']);assert.deepEqual(calls,[]);assert.deepEqual(lib.status().loaded,[]);
 const [a,b]=await Promise.all([lib.load('scarecrow'),lib.load('scarecrow')]);assert.equal(a,b);assert.equal(a.id,'scarecrow');assert.equal(calls.length,kit.sheets.length);assert.ok(calls.every(u=>u.includes('/scarecrow/')));
 lib.beginRound(['blade']);await Promise.all([...lib.releasing.values()]);assert.equal(unloaded.length,calls.length);assert.deepEqual(lib.status().loaded,[]);
 for(const failure of ['http','decode','missing-direction']){let attempts=0;const broken=new AtlasLibrary({baseUrl:base,fetchManifest:async()=>manifest,loadSheet:async()=>{attempts++;if(failure==='missing-direction')return{animations:{}};throw Error(failure);},unloadSheet:async()=>{}});
  broken.beginRound(['scarecrow']);assert.equal(await broken.load('scarecrow'),null);const n=attempts;assert.equal(await broken.load('scarecrow'),null);assert.equal(attempts,n);assert.ok(broken.status().failed.scarecrow);
 }
});
test('scarecrow physical entity, authoritative timing and procedural fallback are unchanged',()=>{
 const e=spawnMonster(createWorld({seed:42}),'scarecrow',500,430,{stageId:'S1'}),before=JSON.stringify(e);Object.freeze(e);
 const provider=new VisualProvider({atlases:false}),v=provider.createVisual(e);assert.equal(v.debug.mode,'procedural');assert.equal(v.debug.key,'scarecrow');assert.ok(v.container.children.length>0);assert.equal(JSON.stringify(e),before);v.destroy();
 const active=Object.freeze({...e,act:Object.freeze({elapsed:12,def:Object.freeze({windupMs:600,lockMs:100,activeMs:100,recoveryMs:400})})});
 assert.equal(atlasAnimation(active,{hurt:0}),'attack');assert.equal(atlasFrame('attack',8,99,8,active),2);assert.equal(atlasScale(active),e.sizeScale||1);
 assert.equal(atlasAnimation({...e,dead:true},{hurt:0}),'death');assert.equal(atlasAnimation({...e,staggerLeft:1},{hurt:0}),'hit');
});

test('scarecrow delivery is bound to reopened original geometry, opaque bounds, exact alpha and ground projection',async()=>{
 const source=JSON.parse(await readFile(new URL('../tools/art/scarecrow/source-validation.json',import.meta.url)));
 const d=JSON.parse(await readFile(new URL('../tools/art/scarecrow/delivered-validation.json',import.meta.url)));
 assert.equal(source.ok,true);const s=source.results[0];assert.equal(s.id,'scarecrow');assert.equal(s.ok,true);assert.equal(s.frames_checked,264);assert.equal(s.max_ground_error_px,0);assert.equal(s.min_idle_vertex_z,0);assert.equal(s.no_ground_mesh,true);assert.equal(s.no_baked_shadow,true);
 for(const state of kit.animations){assert.ok(s.skinned_clip_motion[state].max_skinned_rms_world>.001);assert.equal(d.unique_direction_hashes[state],8);}
 for(const dir of DIRECTIONS)assert.ok(s.direction_vectors[dir].dot>.99);
 assert.equal(d.frames,264);assert.equal(d.lossless_alpha_matches_pose_evidence,264);assert.equal(d.clipped_frames,0);assert.equal(d.t_pose_frames,0);assert.equal(d.bind_pose_frames,0);assert.ok(d.alpha_coverage_percent[0]>=5);assert.ok(d.max_idle_center_drift_px<6);assert.equal(d.total_bytes,kit.bytes);
});
