import test from 'node:test';
import assert from 'node:assert/strict';
import {ABILITIES,MONSTERS,STAGES} from '../js/content/combat.js';
import {MAPS,REGIONS,mapUnlocked} from '../js/content/world-map.js';
import {ATLAS_IDS} from '../js/render/atlas-state.js';
import {MONSTER_VARIANTS} from '../js/content/monsters.js';
import {createWorld,addPlayer,startStage,step,emptyInput,getTelegraphs} from '../js/sim/world.js';
import {encodeSnapshot,decodeSnapshot} from '../js/net/protocol.js';
import {createSave,validateSave} from '../js/meta/save.js';
import {stageXp} from '../js/meta/progression.js';
import {settleRound,createTracker,trackRound} from '../js/meta/run.js';
const rows=[['D_EMBER','ember_dragon','cinder','S30','ember_breath'],['D_FROST','frost_dragon','frost','S33','frost_breath'],['D_VENOM','venom_dragon','mire','S36','venom_breath']];
const fresh=()=>createSave({name:'용사냥',answers:[0,0,0,0,0],createdAt:1});
for(const [id,monster,region,gate,breath] of rows){
 test(id+' ordinary gated sidehunt, identity and lazy art',()=>{
  assert.ok(STAGES[id]);assert.equal(STAGES[id].goal,'killAll');assert.equal(STAGES[id].spawns[0].monster,monster);
  assert.equal(MAPS[id].regionId,region);assert.ok(REGIONS.find(r=>r.id===region).maps.includes(id));
  const s=fresh();s.level=30;assert.equal(mapUnlocked(s,id),false);for(const prior of ['S20','S27','S30','S33','S36'])s.cleared[prior]=true;
  delete s.cleared[gate];assert.equal(mapUnlocked(s,id),false);s.cleared[gate]=true;assert.equal(mapUnlocked(s,id),true);
  assert.ok(MONSTERS[monster].abilities.includes(breath));assert.ok(MONSTERS[monster].abilities.length>=2);assert.equal(MONSTER_VARIANTS[monster].speciesTags.includes('boss'),false);
  assert.equal(ATLAS_IDS[monster],monster.replace('_','-'));
 });
 test(id+' first XP only, controlled attributed loot and valid persisted clear',()=>{
  const s=fresh();const tracked=trackRound(s,createTracker(11),[{type:'kill',monster,xp:MONSTERS[monster].xp,stageId:id,threat:1,x:800,y:500}]);
  assert.ok(tracked.tracker.tempLoot.gold<=40);assert.ok(tracked.tracker.tempLoot.items.length<=2);
  const out=settleRound(s,{stageId:id,terminal:'clear',depositedXp:tracked.tracker.depositedXp,tempLoot:tracked.tracker.tempLoot});
  assert.ok(validateSave(out.save));assert.equal(out.save.cleared[id],true);assert.ok(out.receipt.stageXp>0);assert.equal(stageXp(out.save,id),0);
  assert.ok(validateSave(JSON.parse(JSON.stringify(out.save))));
 });
 test(breath+' actual AI cue/contact/recovery and authoritative late snapshot',()=>{
  const w=createWorld({seed:11});const p=addPlayer(w,{pid:'a',mods:{maxHp:10000}});startStage(w,id);
  while(!w.entities.some(e=>e.type===monster))step(w,{a:emptyInput()});const m=w.entities.find(e=>e.type===monster);
  p.x=m.x-190;p.y=m.y;m.spawnLeft=0;m.thinkLeft=0;for(const other of MONSTERS[monster].abilities)if(other!==breath)m.cds[other]=99999;
  step(w,{a:emptyInput()});assert.equal(m.act?.id,breath);assert.deepEqual(getTelegraphs(w)[0].shape,ABILITIES[breath].shape);
  const hp=p.hp;while(m.act?.phase!=='active')step(w,{a:emptyInput()});assert.equal(p.hp,hp);
  step(w,{a:emptyInput()});assert.ok(p.hp<hp);if(breath==='venom_breath')assert.ok(p.poison);
  const guest=decodeSnapshot(encodeSnapshot(w),'a');assert.deepEqual(guest.telegraphs,getTelegraphs(w));assert.equal(guest.entities.find(e=>e.id===m.id).act.def,ABILITIES[breath]);
  if(breath==='venom_breath'){m.dead=true;for(let t=0;t<180;t++)step(w,{a:emptyInput()});assert.ok(!p.poison);}
 });
}

import {spawnMonster} from '../js/sim/world.js';
import {shapeHitsCircle,ticks} from '../js/sim/core.js';
import {snapshot,restoreSnapshot} from '../js/meta/cloud-save.js';
import {AtlasLibrary} from '../js/render/atlas-library.js';
import {huntDragonFrame,paintHuntDragonVfx} from '../js/render/dragon-hunt-presentation.js';
import {readFileSync} from 'node:fs';
import {preset} from '../tools/balance/botsim.mjs';
import {buildRoundMods} from '../js/meta/run.js';
import {botInput} from '../tools/balance/bot.js';
const kitIds=rows.flatMap(([,type])=>MONSTERS[type].abilities);
function isolated(type,id){const w=createWorld({seed:11});const p=addPlayer(w,{pid:'a',x:500,y:430,mods:{maxHp:10000}});const m=spawnMonster(w,type,690,430);m.spawnLeft=0;m.thinkLeft=0;for(const a of MONSTERS[type].abilities)if(a!==id)m.cds[a]=99999;step(w,{a:emptyInput()});assert.equal(m.act?.id,id);return{w,p,m};}
for(const [,type] of rows)for(const id of MONSTERS[type].abilities){
 test(id+' fair committed cue, contact and shared perfect dodge counter',()=>{
  const {w,p,m}=isolated(type,id),act=m.act;let lockFacing,contacts=0;
  while(m.act===act){const phase=act.phase,hp=p.hp;if(phase==='lock')lockFacing??=act.facing;
   const ev=step(w,{a:emptyInput()});contacts+=ev.filter(e=>e.type==='hit'&&e.ability===id&&e.dst===p.id).length;
   if(['windup','lock'].includes(phase))assert.equal(p.hp,hp);
   if(lockFacing!==undefined&&m.act===act)assert.equal(act.facing,lockFacing);
  }
  assert.ok(contacts>=1);assert.ok(contacts<=(id==='venom_breath'?3+Math.ceil((ABILITIES[id].activeMs+ABILITIES[id].recoveryMs)/1000):1), 'three zone contacts plus bounded one-second poison ticks');assert.ok(m.cds[id]>0);assert.ok(ABILITIES[id].recoveryMs>=1700);
  const dodge=isolated(type,id);while(dodge.m.act.phase!=='active')step(dodge.w,{a:emptyInput()});const hp=dodge.p.hp;
  const ev=step(dodge.w,{a:{...emptyInput(),dodgeEdge:true,mx:0,my:.01}});assert.equal(dodge.p.hp,hp);assert.ok(ev.some(e=>e.type==='perfectDodge'&&e.ability===id));assert.ok(dodge.p.pendingCounter);
 });
 test(id+' exact safe-side geometry and enemy team exclusion',()=>{
  const def=ABILITIES[id],facing=def.aimOffsetDeg?Math.PI:0;assert.equal(shapeHitsCircle(def.shape,0,0,facing,150,0,1),true);assert.equal(shapeHitsCircle(def.shape,0,0,facing,-350,0,1),false);
  const {w,p,m}=isolated(type,id);p.team=m.team;const before=p.hp;for(let i=0;i<150;i++)step(w,{a:emptyInput()});assert.equal(p.hp,before);assert.ok(!p.poison);
 });
}
test('normal dragon poison refresh is bounded, cleans on expiry and terminal, no phantom slow',()=>{
 const {w,p,m}=isolated('venom_dragon','venom_breath');while(m.act.phase!=='active')step(w,{a:emptyInput()});
 let maxLeft=0;for(let i=0;i<72;i++){step(w,{a:emptyInput()});maxLeft=Math.max(maxLeft,p.poison?.left||0);}
 assert.ok(maxLeft<=ticks(3000));assert.equal(p.slow,undefined);m.dead=true;for(let i=0;i<150;i++)step(w,{a:emptyInput()});assert.ok(!p.poison);
 const frost=isolated('frost_dragon','frost_breath');for(let i=0;i<120;i++)step(frost.w,{a:emptyInput()});assert.equal(frost.p.slow,undefined);
});
for(const [id,type] of rows)test(id+' deterministic natural clear freezes terminal contacts and client cloud roundtrip preserves old/new flags',()=>{
 const run=()=>{const save=preset(id,{level:30,rarity:'epic',enhance:4});for(let n=1;n<=36;n++)save.cleared['S'+n]=true;
  const w=createWorld({seed:42}),p=addPlayer(w,{pid:'a',mods:buildRoundMods(save)});startStage(w,id);let tracker=createTracker(42),events=[];
  for(let t=0;t<1800&&w.round.state==='running';t++){const ev=step(w,{a:botInput(w,p)});events.push(...ev);tracker=trackRound(save,tracker,ev).tracker;}
  assert.equal(w.round.state,'clear');assert.equal(p.terminal,'clear');assert.ok(w.entities.find(e=>e.type===type).dead);const hp=p.hp;
  for(let i=0;i<120;i++)assert.equal(step(w,{a:{...emptyInput(),attack:true,skillEdge:true}}).filter(e=>e.type==='hit'&&e.dst===p.id).length,0);assert.equal(p.hp,hp);assert.ok(!p.poison);
  const out=settleRound(save,{stageId:id,terminal:'clear',depositedXp:tracker.depositedXp,tempLoot:tracker.tempLoot});assert.ok(validateSave(out.save));
  const restored=restoreSnapshot(snapshot(out.save));assert.deepEqual(restored.cleared,snapshot(out.save).cleared);assert.deepEqual(restored.stageThreat,snapshot(out.save).stageThreat);assert.equal(restored.cleared[id],true);assert.equal(restored.cleared.S20,true);
  assert.equal(stageXp(restored,id),0);assert.equal(tracker.depositedXp,0);return JSON.stringify({w,events,receipt:out.receipt});};assert.equal(run(),run());
});
test('prepared art is independently registered, complete 8-direction 5-state, lazy and decode rejection is recoverable',async()=>{
 const manifest=JSON.parse(readFileSync(new URL('../assets/sprites/manifest.json',import.meta.url)));let fetched=0,loaded=[];
 const lib=new AtlasLibrary({baseUrl:'http://local/',fetchManifest:async()=>{fetched++;return manifest;},loadSheet:async(url)=>{loaded.push(url);throw Error('decode rejected');},unloadSheet:async()=>{}});
 assert.equal(fetched,0);for(const [,type]of rows){const entry=manifest.find(e=>e.id===ATLAS_IDS[type]);assert.ok(entry);assert.deepEqual(entry.animations,['idle','run','attack','hit','death']);
  const animations={};for(const file of entry.sheets)Object.assign(animations,JSON.parse(readFileSync(new URL('../assets/sprites/'+entry.id+'/'+file,import.meta.url))).animations);
  for(const state of entry.animations)for(const dir of ['E','SE','S','SW','W','NW','N','NE'])assert.ok(animations[state+'_'+dir]?.length);
  assert.equal(await lib.load(type),null);assert.ok(lib.status().failed[type]);}
 assert.equal(loaded.length,3);assert.equal(fetched,1);assert.ok(loaded.every(url=>/ember-dragon|frost-dragon|venom-dragon/.test(url)));
});
test('generic six-frame attack fallback synchronizes anticipation/commit/contact/recovery without invented clips',()=>{
 const act={def:ABILITIES.ember_breath,phaseTicks:{windup:42,lock:12,active:18,recovery:54}};
 for(const [phase,elapsed,expected] of [['windup',0,0],['lock',42,2],['active',54,3],['recovery',72,5]])assert.equal(huntDragonFrame({...act,phase,elapsed},6),expected);
 const colors=[];for(const id of ['ember_breath','frost_breath','venom_breath']){const calls=[];const g=new Proxy({}, {get:(_,k)=>(...args)=>{calls.push([k,args]);return g;}});paintHuntDragonVfx(g,{ability:id,shape:ABILITIES[id].shape,phase:'active'},1);assert.ok(calls.length);colors.push(JSON.stringify(calls.filter(c=>c[0]==='fill')));}
 assert.equal(new Set(colors).size,3);
});

import {CoopSession} from '../js/net/session.js';
import {createMemoryTransport} from '../js/net/loopback.js';
import {availableStages} from '../js/content/world-map.js';
function dragonParty(stageId){
 const network=createMemoryTransport(),sessions={},profiles={};
 for(const uid of ['host','guest']){const save=preset(stageId,{level:30,rarity:'epic',enhance:4});save.name=uid;for(let n=1;n<=36;n++)save.cleared['S'+n]=true;
  profiles[uid]={name:save.name,level:save.level,weapon:'blade',lineage:'human',role:'hunter',rewardSave:save,mods:buildRoundMods(save),stages:availableStages(save),threats:{[stageId]:1}};
 }
 for(const uid of ['host','guest']){const transport=network.connect(uid,(from,p)=>p.t==='action'?sessions[uid].action(p.action):sessions[uid].rt(from,p));sessions[uid]=new CoopSession({uid,host:'host',players:['host','guest'],config:{stageId,threat:1,seed:42},profile:profiles[uid],...transport});}
 sessions.guest.update(34,emptyInput());return {sessions,network,profiles};
}
for(const [id,type] of rows)test(id+' real Session memory transport owns damage only on host, rejects forged clear and reconnects new ability snapshots',()=>{
 const {sessions:s}=dragonParty(id);assert.equal(s.host.phase,'running');assert.equal(s.guest.phase,'running');assert.equal(s.guest.world,null);
 const seen=new Set();let checked=false;
 for(let t=0;t<600&&s.host.world.round.state==='running';t++){
  const w=s.host.world,p=w.entities.find(e=>e.pid==='host'),g=w.entities.find(e=>e.pid==='guest');
  s.guest.update(34,botInput(w,g));s.host.update(34,botInput(w,p));
  const m=w.entities.find(e=>e.type===type);if(m?.act){seen.add(m.act.id);if(!checked){
   s.host.broadcast();const snap=s.guest.buffer.frames.at(-1).world;assert.equal(snap.entities.find(e=>e.id===m.id).act.def,ABILITIES[m.act.id]);
   const before=JSON.stringify(w),guestBefore=JSON.stringify(s.guest.buffer.frames);const fake={...encodeSnapshot(w),round:{...w.round,state:'clear'}};
   s.host.rt('guest',fake);s.guest.rt('guest',fake);assert.equal(JSON.stringify(w),before);assert.equal(JSON.stringify(s.guest.buffer.frames),guestBefore);
   s.guest.suspend();s.guest.resume();assert.equal(s.guest.awaitingResync,false);assert.equal(s.guest.world,null);assert.equal(s.guest.buffer.frames.at(-1).world.entities.find(e=>e.id===m.id).type,type);checked=true;
  }}
 }
 assert.ok(checked);assert.ok(seen.size);assert.equal(s.host.world.round.state,'clear');s.host.broadcast();assert.equal(s.guest.buffer.frames.at(-1).world.round.state,'clear');
 const latest=s.guest.buffer.frames.at(-1).world;for(const e of s.host.world.entities)assert.equal(latest.entities.find(g=>g.id===e.id).hp,Math.round(e.hp*100)/100);assert.equal(s.guest.world,null);
});
