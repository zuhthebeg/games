import test from 'node:test';
import assert from 'node:assert/strict';
import {MONSTERS} from '../js/content/combat.js';
import {createWorld,addPlayer,startStage,step,emptyInput,spawnMonster} from '../js/sim/world.js';
const fixture=level=>{const w=createWorld({seed:4});const p=addPlayer(w,{pid:'p',x:300,y:400,skillMasteryLevels:{lunge:level},mods:{mpRegen:0}});startStage(w,'S2');w.entities=[p];w.round.pending=[];w.round.goal='timer';w.round.timerTicks=10000;return {w,p};};
test('mastery20 automatic two actual dash segments with three host ticks between',()=>{for(const level of [19,20,30]){const {w,p}=fixture(level);const movements=[];for(let i=0;i<40;i++){const x=p.x;step(w,{p:{...emptyInput(),aimX:1,skillEdge:i===0}});movements.push(p.x-x);}const runs=[];for(const n of movements){if(n>0){if(!runs.length||runs.at(-1).gap)runs.push({ticks:0,distance:0});runs.at(-1).ticks++;runs.at(-1).distance+=n;}else if(runs.length)runs.at(-1).gap=(runs.at(-1).gap||0)+1;}assert.equal(runs.length,level<20?1:2);assert.ok(Math.abs(p.x-490)<1e-9);if(level>=20){assert.ok(Math.abs(runs[0].distance-95)<1e-9);assert.ok(Math.abs(runs[1].distance-95)<1e-9);assert.equal(runs[0].gap,3);}assert.equal(p.mp,p.maxMp-16);assert.equal(p.dodge.iframeLeft,0);}});
import {encodeSnapshot,decodeSnapshot} from '../js/net/protocol.js';
import {predictPlayerTick} from '../js/net/player-prediction.js';
import {trackMastery} from '../js/meta/skill-mastery.js';
import {CoopSession} from '../js/net/session.js';
import {createMemoryTransport} from '../js/net/loopback.js';
test('evolved prediction codec before/between/after segments, speed, walls, live metadata cannot grant',()=>{
 for(const level of [19,20,30])for(const speed of [0,.7,10])for(const x of [300,980]){
  const {w,p}=fixture(level);p.x=x;p.attackSpeedBonus=speed;
  for(let i=0;i<45;i++){
   const inp={...emptyInput(),aimX:1,aimY:i>7?1:0,skillEdge:i===0};
   const view=decodeSnapshot(encodeSnapshot(w),'p');assert.ok(view);
   const predicted=predictPlayerTick(view.entities[0],inp,{arena:w.arena,tick:w.tick});
   step(w,{p:inp});assert.ok(Math.abs(predicted.x-p.x)<.0051);assert.ok(Math.abs(predicted.y-p.y)<.0051);
   for(const k of ['phase','left','elapsed'])assert.equal(predicted.act?.[k],p.act?.[k]);
   assert.equal(predicted.mp,p.mp);assert.ok(p.x<=w.arena.w-p.r);
   if(i===2)p.skillMasteryLevels.lunge=level===19?30:1;
  }
 }
});
test('same target exact odd damage/crit budget and once cast mastery; new targets half allocations',()=>{
 for(const chance of [0,1])for(const which of ['first','second','both']){
  const {w,p}=fixture(20);p.critChance=chance;p.critMult=1.5;p.dmgMult.blade=53/52;
  const g=spawnMonster(w,'goblin_grunt',340,400);g.spawnLeft=0;g.hp=g.maxHp=10000;g.frozenUntil=1000;g.r=1;
  const events=[], tracker={};
  for(let i=0;i<32;i++){
   const segment=p.act?.phase==='active'?p.act.phaseTicks.active-p.act.left<3?1:p.act.phaseTicks.active-p.act.left<6?0:2:0;
   g.x=(which==='both'||which==='first'&&segment===1||which==='second'&&segment===2)?p.x+20:800;
   g.y=400;g.kx=g.ky=0;
   const es=step(w,{p:{...emptyInput(),aimX:1,skillEdge:i===0}});events.push(...es);trackMastery(tracker,es,w,'p');
  }
  const hits=events.filter(e=>e.type==='hit'&&e.ability==='lunge');
  const B=chance?80:53;
  assert.equal(hits.length,which==='both'?2:1);
  assert.equal(hits.reduce((s,e)=>s+e.dmg,0),which==='first'?Math.floor(B/2):which==='second'?Math.ceil(B/2):B);
  assert.equal(tracker.skillMastery.lunge,1);assert.equal(events.filter(e=>e.type==='act'&&e.ability==='lunge').length,1);
 }
});
test('codec rejects malformed evolution fields',()=>{const {w,p}=fixture(20);step(w,{p:{...emptyInput(),skillEdge:true}});for(const change of [e=>e.lunge20=2,e=>e.act.id='whirl',e=>e.act.left=999,e=>e.act.phaseTicks.active=1]){const packet=encodeSnapshot(w);change(packet.entities[0]);assert.equal(decodeSnapshot(packet,'p'),null);}});
test('session freezes lunge power against live RT/setMastery and rejects old combat profiles',()=>{
 const net=createMemoryTransport(),s={};for(const uid of ['h','g']){const tr=net.connect(uid,(from,d)=>d.t==='action'?s[uid].action(d.action):s[uid].rt(from,d));s[uid]=new CoopSession({uid,host:'h',players:['h','g'],profile:{weapon:'blade',level:1,mods:{},skillMasteryLevels:{lunge:uid==='h'?20:19}},config:{stageId:'S2',seed:1,threat:1},...tr});}
 s.g.update(34,emptyInput());assert.equal(s.h.phase,'running');const [h,g]=s.h.world.entities;
 s.g.setMastery({lunge:30});s.h.setMastery({lunge:1});assert.equal(h.lunge20,true);assert.equal(g.lunge20,undefined);
 const a=new CoopSession({uid:'h',host:'h',players:['h','g'],profile:{weapon:'blade'},config:{stageId:'S2',threat:1}});
 assert.equal(a.negotiate({h:a.profile,g:{weapon:'blade'}}),false);
});
test('pending second segment cancels on death stun return and state expires',()=>{
 for(const reason of ['dead','terminal','staggerLeft','channel']){
  const {w,p}=fixture(20);for(let i=0;i<8;i++)step(w,{p:{...emptyInput(),aimX:1,skillEdge:i===0}});
  p[reason]=reason==='terminal'?'return_scroll':reason==='dead'?true:10;
  const x=p.x;step(w,{p:emptyInput()});assert.equal(p.act,null);assert.equal(p.x,x);
 }
});
test('boss resistance and odd poise/knockback split once per segment',()=>{
 const {w,p}=fixture(20);const g=spawnMonster(w,'goblin_chief',340,400);g.spawnLeft=0;g.hp=g.maxHp=10000;g.thinkLeft=999;g.r=1;g.poise=10000;g.maxPoise=0;
 let sum=0, hits=0;for(let i=0;i<30;i++){g.x=p.x+20;g.y=p.y;g.kx=g.ky=0;const es=step(w,{p:{...emptyInput(),aimX:1,skillEdge:i===0}});if(es.some(e=>e.type==='hit'&&e.ability==='lunge')){sum+=Math.hypot(g.kx,g.ky);hits++;}}
 assert.equal(hits,2);assert.ok(Math.abs(sum-260*(1-MONSTERS.goblin_chief.kbResist)/30*2.2*.82)<1e-9);assert.equal(g.poise,9960);
});
test('distinct first and second recipients each receive only their allocated half',()=>{
 const {w,p}=fixture(20);const targets=[340,470].map(x=>{const g=spawnMonster(w,'goblin_grunt',x,400);Object.assign(g,{spawnLeft:0,hp:10000,maxHp:10000,frozenUntil:1000,r:1});return g;});
 const hits=[];for(let i=0;i<30;i++){const a=p.act,t=a?.phase==='active'?a.phaseTicks.active-a.left:-1;targets.forEach((g,j)=>{g.x=t>=0&&(j===0?t<3:t>=6)?p.x+20:900;g.kx=g.ky=0;});hits.push(...step(w,{p:{...emptyInput(),aimX:1,skillEdge:i===0}}).filter(e=>e.type==='hit'&&e.ability==='lunge'));}
 assert.deepEqual(hits.map(e=>[e.dst,e.dmg]),targets.map(g=>[g.id,26]));
});
test('actual host guest midpoint resume plus duplicated input admits one cast and one MP cost',()=>{
 const net=createMemoryTransport(),s={};for(const uid of ['h','g']){const tr=net.connect(uid,(from,d)=>d.t==='action'?s[uid].action(d.action):s[uid].rt(from,d));s[uid]=new CoopSession({uid,host:'h',players:['h','g'],profile:{weapon:'blade',level:1,mods:{mpRegen:0},skillMasteryLevels:{lunge:20}},config:{stageId:'S2',seed:1,threat:1},...tr});}
 s.g.update(34,emptyInput());const w=s.h.world;w.round.pending=[];w.round.goal='timer';w.round.timerTicks=10000;const p=w.entities.find(e=>e.pid==='g');
 let acts=0,resumed=false;for(let t=0;t<50;t++){
  s.g.update(34,{...emptyInput(),aimX:1,skillEdge:t===0});s.h.update(34,emptyInput());acts+=w.events.filter(e=>e.type==='act'&&e.id===p.id&&e.ability==='lunge').length;
  if(p.act?.lunge20&&p.act.phase==='active'&&p.act.left===6&&!resumed){s.g.suspend();s.g.resume();resumed=true;}
 }
 assert.ok(resumed);assert.equal(acts,1);assert.equal(p.mp,p.maxMp-16);assert.equal(s.g.world,null);assert.equal(s.g.awaitingResync,false);
});
test('duplicate guest input packet retains one accepted lunge with one resource transaction',()=>{
 const net=createMemoryTransport(),s={};for(const uid of ['h','g']){const tr=net.connect(uid,(from,d)=>d.t==='action'?s[uid].action(d.action):s[uid].rt(from,d));s[uid]=new CoopSession({uid,host:'h',players:['h','g'],profile:{weapon:'blade',mods:{mpRegen:0},skillMasteryLevels:{lunge:20}},config:{stageId:'S2',seed:1,threat:1},...tr});}
 s.g.update(34,emptyInput());const w=s.h.world,p=w.entities.find(e=>e.pid==='g');w.round.pending=[];w.round.goal='timer';w.round.timerTicks=10000;
 const packet=s.g.sender.packet({...emptyInput(),aimX:1,skillEdge:true},w.tick,0);for(let i=0;i<20;i++)s.h.rt('g',packet);
 let acts=0;for(let i=0;i<40;i++){s.h.update(34,emptyInput());acts+=w.events.filter(e=>e.type==='act'&&e.id===p.id&&e.ability==='lunge').length;}
 assert.equal(acts,1);assert.equal(p.mp,p.maxMp-16);
});
import {createSave,validateSave} from '../js/meta/save.js';
import {createTracker,trackRound,settleRound} from '../js/meta/run.js';
test('actual kill hit journal settles old save skill mastery once, no raw count migration',()=>{
 const save=createSave({name:'pilot',weapon:'blade',answers:[0,0,0,0,0],createdAt:1});save.skillMastery.lunge=500;
 const {w,p}=fixture(20);const g=spawnMonster(w,'goblin_grunt',340,400);Object.assign(g,{spawnLeft:0,hp:40,maxHp:40,frozenUntil:1000,r:1});
 let tracker=createTracker(4),kills=0;for(let i=0;i<30;i++){g.x=p.x+20;g.y=p.y;g.kx=g.ky=0;const events=step(w,{p:{...emptyInput(),aimX:1,skillEdge:i===0}});kills+=events.filter(e=>e.type==='kill').length;tracker=trackRound(save,tracker,events,{},w,'p').tracker;}
 assert.equal(kills,1);assert.equal(tracker.killIndex,1);assert.equal(tracker.skillMastery.lunge,1);
 const settled=settleRound(save,{stageId:'S2',terminal:'return_scroll',depositedXp:tracker.depositedXp,tempLoot:tracker.tempLoot,skillMastery:tracker.skillMastery});
 assert.equal(settled.save.skillMastery.lunge,501);assert.equal(save.skillMastery.lunge,500);assert.ok(validateSave(settled.save));
});
