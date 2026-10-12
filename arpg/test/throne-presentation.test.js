import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {atlasAnimation,atlasFrame,atlasScale} from '../js/render/atlas-state.js';
import {paintDragonVfx,DRAGON_CLIPS} from '../js/render/dragon-presentation.js';
import {ABILITIES} from '../js/content/combat.js';
import {ticks} from '../js/sim/core.js';
test('phase-authored dragon clips match host/guest timing, keep charged lock pose and active motion',()=>{
 for(const [id,clip] of Object.entries(DRAGON_CLIPS)){
  const def=ABILITIES[id],phaseTicks=Object.fromEntries(['windup','lock','active','recovery'].map(p=>[p,ticks(def[p+'Ms'])]));
  let elapsed=0;for(const [phase,expected] of [['windup',[0,5]],['lock',[6,6]],['active',[7,8]],['recovery',[9,11]]]){
   for(const [at,wanted] of [[0,expected[0]],[phaseTicks[phase]-1,expected[1]]]){
    const e=Object.freeze({type:'throne_dragon',act:Object.freeze({id,def,phase,elapsed:elapsed+at,phaseTicks})});
    assert.equal(atlasAnimation(e,{hurt:0}),clip);assert.equal(atlasFrame(clip,12,0,10,e),wanted);
    // Guest omits phaseTicks, so presentation reconstructs only display timing from immutable content.
    assert.equal(atlasFrame(clip,12,0,10,{...e,act:{...e.act,phaseTicks:undefined}}),wanted);
   }elapsed+=phaseTicks[phase];
  }
 }
 assert.equal(atlasScale({type:'training_dragon'}),1.2);
 assert.ok(Math.abs((320*atlasScale({type:'throne_dragon'})/8.10292911529541)/(256*1.2/7.964338302612305)-1.5)<1e-6);
});
test('flame ribbons, stomp impact rings, rear sweep arcs are distinct read-only VFX; reduced motion keeps cues',()=>{
 const samples=[];for(const id of Object.keys(DRAGON_CLIPS)){
  const calls=[];const g=new Proxy({}, {get:(_,name)=>(...args)=>{calls.push([name,...args]);return g;}});
  const tg=Object.freeze({ability:id,phase:'active',shape:ABILITIES[id].shape,progress:1});const before=JSON.stringify(tg);
  paintDragonVfx(g,tg,90,true);assert.equal(JSON.stringify(tg),before);assert.ok(calls.length>2);samples.push(JSON.stringify(calls));
  calls.length=0;paintDragonVfx(g,{...tg,phase:'windup',progress:.5},10,true);assert.ok(calls.length>0);
 }
 assert.equal(new Set(samples).size,3);
});
test('actual throne source is original, 504 frames lossless-alpha validated, no clipped/duplicate direction or frozen clips',()=>{
 const proof=JSON.parse(readFileSync(new URL('../tools/art/throne-dragon/validation.json',import.meta.url)));
 assert.equal(proof.ok,true);assert.equal(proof.frames,504);assert.equal(proof.lossless_alpha_verified,504);assert.equal(proof.clipped_frames,0);
 assert.equal(proof.frame_size,320);assert.equal(proof.ground_anchor_constant,true);assert.equal(proof.idle_paw_world_drift,0);
 assert.equal(proof.training_and_legacy_source_unchanged,true);assert.equal(proof.non_dragon_manifest_unchanged,true);
 const source=JSON.parse(readFileSync(new URL('../tools/art/throne-dragon/source-validation.json',import.meta.url)));
 for(const clip of ['breath','stomp','tail'])assert.ok(source.source_clip_mesh_motion[clip]>1,clip);
});
