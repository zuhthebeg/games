import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { advanceDeathKnightPlayback, deathKnightAnimation } from '../js/render/death-knight-playback.js';
import { atlasFrame, atlasAnimation, DIRECTIONS, ATLAS_IDS } from '../js/render/atlas-state.js';
import { installKnightPresentation, showKnightArtStatus } from '../js/solo/knight-presentation.js';
import { AtlasLibrary } from '../js/render/atlas-library.js';
import { dodgeStart, dashPosition } from '../js/sim/movement.js';
const base=new URL('../assets/sprites/',import.meta.url),read=p=>JSON.parse(readFileSync(new URL(p,base)));
const descriptor=read('player-death-knight/kit-descriptor.json'),manifest=read('manifest.json');
test('honest form-only registry, all56 groups, real six-pose endpoint at5/30, no legacy classes',()=>{
 assert.equal(ATLAS_IDS.death_knight,'player-death-knight');assert.deepEqual(descriptor.content_ids,['death_knight']);assert.equal(descriptor.lineage,'skeleton_knight');assert.equal(descriptor.form,'death_knight');
 const sheets=descriptor.sheets.map(f=>read('player-death-knight/'+f));const sheet={frames:Object.assign({},...sheets.map(s=>s.frames)),animations:Object.assign({},...sheets.map(s=>s.animations))};assert.equal(Object.keys(sheet.frames).length,584);assert.equal(Object.keys(sheet.animations).length,56);
 for(const d of DIRECTIONS){assert.equal(sheet.animations['dodge_'+d].length,6);const clock={},entity={dodge:{startedTick:1}};const frames=[];
  for(let i=0;i<7;i++)frames.push(atlasFrame('dodge',6,advanceDeathKnightPlayback(clock,entity,'dodge',1/30),12,entity,.2));assert.deepEqual(frames,[0,1,2,3,4,5,5]);}
 assert.equal(descriptor.animation_durations.dodge,.2);assert.equal(descriptor.dodge_contract.source,'Dodge_Forward');
});
test('same-state repeated startedTick resets; hidden/frozen cannot advance; terminal ignores lingering dash',()=>{
 const clock={},entity={dodge:{startedTick:7,dashLeft:6},moving:true};advanceDeathKnightPlayback(clock,entity,'dodge',.03);advanceDeathKnightPlayback(clock,entity,'dodge',.12);
 assert.equal(advanceDeathKnightPlayback(clock,entity,'dodge',10,{frozen:true}),.12);assert.equal(advanceDeathKnightPlayback(clock,entity,'dodge',10,{hidden:true}),.12);
 const repeated={...entity,dodge:{startedTick:19,dashLeft:6}};assert.equal(advanceDeathKnightPlayback(clock,repeated,'dodge',.03),0);
 for(const terminal of ['clear','return_scroll'])assert.equal(deathKnightAnimation({...entity,terminal},{},atlasAnimation),'idle');
 assert.equal(deathKnightAnimation({...entity,terminal:'death',dead:true},{},atlasAnimation),'death');assert.equal(deathKnightAnimation(entity,{},atlasAnimation),'dodge');
 const end={...entity,dodge:{...entity.dodge,dashLeft:0}};const c={state:'dodge',startedTick:7,age:5/30};assert.equal(deathKnightAnimation(end,{},atlasAnimation,c),'dodge');assert.equal(deathKnightAnimation(end,{hurt:.1},atlasAnimation,c),'hit');assert.equal(deathKnightAnimation(end,{},atlasAnimation,{...c,age:.2}),'run');
});
test('authoritative six consumed dash ticks expose all poses even during perfect-dodge visual slow',()=>{
 const clock={},frames=[];let e={x:0,y:0,dodge:{},iframeBonusMs:0,dodgeCdMult:1,loadRatio:0};
 Object.assign(e,dodgeStart(e,[1,0],4));
 for(let i=0;i<6;i++){
  e={...e,...dashPosition(e)};
  if(i>0)e.dodge.cdLeft--;
  const age=advanceDeathKnightPlayback(clock,e,'dodge',1/30*.16);
  frames.push(atlasFrame('dodge',6,age,12,e,.2));
 }
 assert.deepEqual(frames,[0,1,2,3,4,5]);
 const before=clock.age;assert.equal(advanceDeathKnightPlayback(clock,e,'dodge',10,{frozen:true}),before);
 e.dodge.cdLeft--;advanceDeathKnightPlayback(clock,e,'dodge',1/30*.16);
 assert.ok(clock.age>=.2);assert.equal(deathKnightAnimation({...e,moving:true},{},atlasAnimation,clock),'run');
 const again={...e,...dodgeStart(e,[0,1],45)};
 assert.equal(advanceDeathKnightPlayback(clock,again,'dodge',.01),0);
});
test('only actual loaded kit removes mask; load failure stays explicit; restoration exact',()=>{
 for(const evolved of [false,true])for(const loaded of [false,true]){
  const updates=[],original=new Map();for(const key of ['blade','bow','focus','skeleton_warrior','death_knight'])original.set(key,(e,o)=>({debug:{mode:loaded?'atlas':'procedural',id:key==='death_knight'?'player-death-knight':'skeleton-warrior',loadFailure:loaded?null:'offline'},container:{},update:s=>updates.push(s)}));
  const provider={factories:new Map(original),register(k,v){this.factories.set(k,v);}};const restore=installKnightPresentation(provider,{lineage:'skeleton_knight',level:30,permanentDeathKnight:evolved});
  const state=Object.freeze({dodge:Object.freeze({startedTick:2,dashLeft:6})}),visual=provider.factories.get('blade')(state,{});visual.update(state,{},.03);
  assert.equal(updates[0].dodge.dashLeft,evolved&&loaded?6:0);assert.equal(visual.debug.artFallback===null,evolved&&loaded);assert.equal(visual.debug.dodgeFallback===null,evolved&&loaded);
  const hud={stage:'S1 · 데스나이트',nodes:{'stage-name':{},notice:{}}};showKnightArtStatus(hud,visual.debug);if(evolved&&!loaded)assert.match(hud.nodes.notice.textContent,/로드 실패/);
  restore();restore();assert.deepEqual(provider.factories,original);
 }
});
test('public library loads candidate and handles failed asset without pretending success',async()=>{
 for(const fail of [false,true]){const lib=new AtlasLibrary({baseUrl:base,fetchManifest:async()=>manifest,loadSheet:async url=>{if(fail)throw Error('missing DK sheet');return read('player-death-knight/'+new URL(url).pathname.split('/').at(-1));},unloadSheet:async()=>{}});lib.beginRound(['death_knight']);const asset=await lib.load('death_knight');assert.equal(asset?.id||null,fail?null:'player-death-knight');assert.equal(!!lib.status().failed.death_knight,fail);}
});
