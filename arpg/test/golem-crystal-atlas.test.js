import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {ATLAS_IDS,DIRECTIONS,atlasAnimation,atlasFrame,atlasScale} from '../js/render/atlas-state.js';
import {AtlasLibrary} from '../js/render/atlas-library.js';
import {STAGES,ABILITIES} from '../js/content/combat.js';
import {VisualProvider} from '../js/render/visual-provider.js';
import {createWorld,spawnMonster} from '../js/sim/world.js';
const base=new URL('../assets/sprites/',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('manifest.json',base)));
const ids={rune_guardian:'rune-guardian',spirit:'spirit'};

test('original golem/crystal deliver complete 128px WebP octants, fixed foot anchors and bounded metadata',async()=>{
 for(const[key,id]of Object.entries(ids)){
  assert.equal(ATLAS_IDS[key],id);const kit=manifest.filter(k=>k.id===id);assert.equal(kit.length,1);const entry=kit[0];
  assert.deepEqual(entry.content_ids,[key]);assert.equal(entry.monster,true);assert.deepEqual(entry.animations,['idle','run','attack','hit','death']);
  assert.ok(entry.anchor.x>.35&&entry.anchor.x<.65);assert.ok(entry.anchor.y>.5&&entry.anchor.y<1);
  let bytes=0;const animations={};
  for(const file of entry.sheets){
   const url=new URL(`${id}/${file}`,base),data=JSON.parse(await readFile(url));Object.assign(animations,data.animations);
   assert.equal(Number(data.meta.scale),1);assert.equal(data.meta.fps,entry.fps);assert.match(data.meta.image,/\.webp$/);
   bytes+=(await stat(url)).size+(await stat(new URL(`${id}/${data.meta.image}`,base))).size;
   for(const f of Object.values(data.frames)){assert.deepEqual(f.sourceSize,{w:128,h:128});assert.deepEqual(f.anchor,entry.anchor);assert.equal(f.trimmed,false);}
  }
  assert.equal(bytes,entry.bytes);assert.ok(bytes<1_500_000);
  for(const clip of entry.animations)for(const dir of DIRECTIONS)assert.ok(animations[`${clip}_${dir}`].length>=3,`${id} ${clip} ${dir}`);
 }
 for(const stage of ['S9','S19'])for(const key of Object.keys(ids))assert.ok(STAGES[stage].spawns.some(s=>s.monster===key),`${stage} real ${key} spawn`);
});

test('golem/crystal lease requests stay spawn-only, deduplicate, unload and keep stable failure fallback',async()=>{
 const calls=[],unloaded=[];const lib=new AtlasLibrary({baseUrl:base,fetchManifest:async()=>manifest,loadSheet:async url=>{calls.push(url);return JSON.parse(await readFile(new URL(url)));},unloadSheet:async url=>unloaded.push(url)});
 lib.beginRound(['scarecrow']);assert.equal(calls.length,0);
 const [a,b]=await Promise.all([lib.load('rune_guardian'),lib.load('rune_guardian')]);assert.equal(a,b);assert.equal(a.id,'rune-guardian');assert.ok(calls.every(u=>u.includes('/rune-guardian/')));
 await lib.load('spirit');assert.deepEqual(lib.status().loaded,['rune_guardian','spirit']);
 lib.beginRound(['spirit']);assert.deepEqual(lib.status().loaded,['spirit']);await Promise.all([...lib.releasing.values()]);assert.ok(unloaded.some(u=>u.includes('/rune-guardian/')));
 for(const key of Object.keys(ids)){
  let attempts=0;const broken=new AtlasLibrary({baseUrl:base,fetchManifest:async()=>manifest,loadSheet:async()=>{attempts++;throw Error('offline art');},unloadSheet:async()=>{}});
  broken.beginRound([key]);assert.equal(await broken.load(key),null);assert.equal(await broken.load(key),null);assert.equal(attempts,1);assert.equal(broken.status().failed[key],'offline art');
 }
});

test('guardian slam / spirit cast use authoritative attack phase and preserve frozen collision state',()=>{
 for(const type of Object.keys(ids)){
  const entity=Object.freeze({type,kind:'monster',r:24,sizeScale:1,moving:false,act:Object.freeze({elapsed:12,def:Object.freeze({windupMs:600,lockMs:100,activeMs:100,recoveryMs:400})})});
  assert.equal(atlasAnimation(entity,{hurt:0}),'attack');assert.equal(atlasFrame('attack',8,99,8,entity),2);assert.equal(atlasScale(entity),1);assert.equal(entity.r,24);
 }
});

test('original procedural golem and diamond fallbacks remain available at unchanged physical radii',()=>{
 const provider=new VisualProvider({atlases:false});
 for(const type of Object.keys(ids)){
  const e=spawnMonster(createWorld({seed:42}),type,500,430,{stageId:'S9'}),before=JSON.stringify(e);
  Object.freeze(e);const view=provider.createVisual(e);assert.equal(view.debug.mode,'procedural');assert.equal(view.debug.key,type);
  assert.ok(view.container.children.length>0);assert.equal(view.container.children[0].scale.x,e.sizeScale);assert.equal(JSON.stringify(e),before);view.destroy();
 }
});

test('real guardian crush/ring and spirit bolt impact poses align with authoritative phases despite long recovery',()=>{
 for(const [type,id]of [['rune_guardian','guardian_crush'],['rune_guardian','guardian_ring'],['spirit','spirit_bolt']]){
  const def=ABILITIES[id],phaseTicks=Object.freeze(Object.fromEntries(['windup','lock','active','recovery'].map(p=>[p,Math.ceil(def[`${p}Ms`]/(1000/30))])));
  let elapsed=0;const frames={};
  for(const phase of ['windup','lock','active','recovery']){
   const act=Object.freeze({id,def,phaseTicks,phase,elapsed}),e=Object.freeze({type,act});const before=JSON.stringify(e);
   frames[phase]=atlasFrame('attack',8,99,8,e);assert.equal(JSON.stringify(e),before);elapsed+=phaseTicks[phase];
  }
  assert.deepEqual(frames,type==='rune_guardian'?{windup:0,lock:4,active:5,recovery:6}:{windup:0,lock:3,active:4,recovery:5});
  const total=Object.values(phaseTicks).reduce((a,b)=>a+b,0);
  const end=Object.freeze({type,act:Object.freeze({id,def,phaseTicks,phase:'recovery',elapsed:total-1})});assert.equal(atlasFrame('attack',8,0,8,end),7);
  const bounded=Object.freeze({type,act:Object.freeze({id,def,phaseTicks,phase:'active',elapsed:total+999})});assert.ok(atlasFrame('attack',8,0,8,bounded)<8);
 }
});
