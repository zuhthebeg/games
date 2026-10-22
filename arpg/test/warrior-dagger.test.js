import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {AtlasLibrary} from '../js/render/atlas-library.js';
import {ATLAS_IDS,DIRECTIONS,atlasAnimation,atlasFrame} from '../js/render/atlas-state.js';
import {STAGES,MONSTERS} from '../js/content/combat.js';
const base=new URL('../assets/sprites/',import.meta.url),manifest=JSON.parse(await readFile(new URL('manifest.json',base)));
function library(){const urls=[],released=[];return{urls,released,lib:new AtlasLibrary({baseUrl:base,fetchManifest:async()=>manifest,loadSheet:async u=>{urls.push(u);return JSON.parse(await readFile(new URL(u)));},unloadSheet:async u=>released.push(u)})};}
test('ordinary skeleton warrior loads all 368 real directional dagger frames; hit/dodge remain explicit idle fallback',async()=>{
 const{lib}=library();lib.beginRound(['skeleton_warrior']);const a=await lib.load('skeleton_warrior');assert.equal(a.id,'warrior-dagger');
 for(const[clip,n]of Object.entries({idle:13,run:10,attack:13,death:10}))for(const d of DIRECTIONS)assert.equal(a.animations[`${clip}_${d}`].length,n);
 const proof=JSON.parse(await readFile(new URL('../tools/art/warrior-dagger/provenance.json',import.meta.url)));
 assert.equal(Object.keys(proof.delivery.perFrameSHA256).length,368);for(const clip of ['idle','run','attack','death']){const hashes=DIRECTIONS.map(d=>proof.delivery.perFrameSHA256[`${clip}_${d}_003`]);assert.equal(new Set(hashes).size,8,'no S-only alias or mirrored copies');}
 assert.equal(a.animations.hit_E,undefined);assert.equal(a.animations.dodge_E,undefined);assert.equal(atlasAnimation({staggerLeft:1},{hurt:0}),'hit');assert.equal(atlasFrame('death',10,.6,12,{},a.animation_durations.death),9);
 assert.ok(proof.delivery.decodedBytes<=8*1024**2);assert.ok(proof.delivery.bytes<1.5*1024**2);
});
test('normal S21 roster and unchanged combat identity encounter dagger naturally, without new monster/save IDs',()=>{
 assert.equal(ATLAS_IDS.skeleton_warrior,'warrior-dagger');assert.ok(JSON.stringify(STAGES.S21).includes('skeleton_warrior'));assert.equal(MONSTERS.skeleton_warrior.hp,150);assert.equal(MONSTERS.skeleton_warrior.r,18);
});
test('boss old art, human player and DK remain independent across load/release/failure',async()=>{
 const{lib,urls,released}=library();lib.beginRound(['skeleton_warrior','necropolis_lord','blade','death_knight']);
 const[a,b,h,dk]=await Promise.all(['skeleton_warrior','necropolis_lord','blade','death_knight'].map(k=>lib.load(k)));
 assert.equal(a.id,'warrior-dagger');assert.equal(b.id,'skeleton-warrior');assert.equal(h.id,'hero-sword');assert.equal(dk.id,'player-death-knight');assert.notEqual(a,b);
 lib.beginRound(['necropolis_lord']);await Promise.all(lib.releasing.values());assert.ok(released.some(u=>u.includes('/warrior-dagger/')));assert.ok(!released.some(u=>u.includes('/skeleton-warrior/')));assert.equal(await lib.load('necropolis_lord'),b);
 const fail=new AtlasLibrary({baseUrl:base,fetchManifest:async()=>manifest,loadSheet:async()=>{throw Error('offline')},unloadSheet:async()=>{}});assert.equal(await fail.load('skeleton_warrior'),null);assert.equal(await fail.load('skeleton_warrior'),null);assert.equal(fail.failed.get('skeleton_warrior'),'offline');
});
