import test from 'node:test';
import assert from 'node:assert/strict';
import {CoopSession} from '../js/net/session.js';
import {encodeSnapshot,decodeSnapshot,partyHpScale} from '../js/net/protocol.js';
import {createWorld,addPlayer,startStage,emptyInput} from '../js/sim/world.js';
import {createMemoryTransport} from '../js/net/loopback.js';
const id='M_MINE_CART', dt=1000/30;
const profile={combatVersion:3,level:11,weapon:'bow',mods:{maxHp:10000},threats:{[id]:1}};
function pair(stageId=id){
 const wire=createMemoryTransport(),frames={host:[],guest:[]};const sessions={};
 for(const uid of ['host','guest']){
  const transport=wire.connect(uid,(from,data)=>data.t==='action'?sessions[uid].action(data.action):sessions[uid].rt(from,data));
  sessions[uid]=new CoopSession({uid,host:'host',players:['host','guest'],profile,config:{stageId,threat:1,seed:42},...transport,onFrame:(w,e)=>frames[uid].push({w:structuredClone(w),e})});
 }
 const start={config:{stageId,threat:1},seed:42,profiles:{host:profile,guest:profile}};
 sessions.guest.begin(start);sessions.host.begin(start);return {...sessions,frames};
}
const player=(s,pid)=>s.world.entities.find(e=>e.pid===pid);
const move=(p,pos)=>{p.x=pos.x;p.y=pos.y;p.moving=false;};
function ticks(p,n){for(let i=0;i<n;i++){p.guest.update(dt,emptyInput());p.host.update(dt,emptyInput());}}
function pickup(p,pid='host'){move(player(p.host,pid),p.host.world.round.objective.token);ticks(p,15);assert.equal(p.host.world.round.objective.carrier,pid);}
test('objective snapshot deep copy + guest decode, explicit recommendation',()=>{
 const w=createWorld();addPlayer(w,{pid:'h'});startStage(w,id);const packet=encodeSnapshot(w);w.round.objective.token.x=0;assert.notEqual(packet.objective.token.x,0);const guest=decodeSnapshot(packet,'h');assert.deepEqual(guest.round.objective,packet.objective);assert.equal(partyHpScale(2,11,id),1.4);
});
test('guest consumes complete only once; retransmission/rejoin cannot duplicate settlement',()=>{
 const p=pair();pickup(p);move(player(p.host,'host'),p.host.world.round.objective.entry);ticks(p,15);
 assert.equal(p.host.phase,'ended');assert.equal(p.guest.phase,'ended');assert.equal(p.guest.world,null);
 assert.equal(p.guest.buffer.frames.at(-1).world.entities[0].terminal,'clear');assert.equal(p.frames.guest.flatMap(f=>f.e).filter(e=>e.type==='objectiveComplete').length,1);
 p.host.broadcast();assert.equal(p.frames.guest.flatMap(f=>f.e).filter(e=>e.type==='objectiveComplete').length,1);
 p.guest.begin(p.host.startData);assert.equal(p.guest.phase,'ended');assert.equal(p.guest.world,null);
});
for(const terminal of ['death','return_scroll'])test(`host carrier ${terminal}, guest recovers and clears, terminal host excluded`,()=>{
 const p=pair();pickup(p);const carrier=player(p.host,'host');carrier.terminal=terminal;carrier.dead=terminal==='death';const pos={x:carrier.x,y:carrier.y};ticks(p,1);assert.equal(p.host.world.round.objective.carrier,null);
 move(player(p.host,'guest'),pos);ticks(p,15);assert.equal(p.host.world.round.objective.carrier,'guest');move(player(p.host,'guest'),p.host.world.round.objective.entry);ticks(p,15);
 assert.equal(player(p.host,'host').terminal,terminal);assert.equal(p.guest.buffer.frames.at(-1).world.entities[0].terminal,'clear');
 assert.equal(p.frames.host.flatMap(f=>f.e).filter(e=>e.type==='objectiveComplete').length,0);assert.equal(p.frames.guest.flatMap(f=>f.e).filter(e=>e.type==='objectiveComplete').length,1);
});
test('dead/returned guest does not receive complete event or clear; ignored client flags',()=>{
 const p=pair();const g=player(p.host,'guest');g.terminal='return_scroll';p.host.rt('guest',{t:'objective',carried:true,visited:true});assert.equal(p.host.world.round.objective.carrier,null);
 pickup(p);move(player(p.host,'host'),p.host.world.round.objective.entry);ticks(p,15);assert.equal(p.guest.buffer.frames.at(-1).world.entities[0].terminal,'return_scroll');assert.equal(p.frames.guest.flatMap(f=>f.e).filter(e=>e.type==='objectiveComplete').length,0);
});
test('guest roster departure releases token; late join cannot recreate character',()=>{
 const p=pair();pickup(p,'guest');const pos={...p.host.world.round.objective.token};p.host.roster({players:['host'],hostUser:'host'});assert.equal(p.host.world.round.objective.carrier,null);assert.deepEqual(p.host.world.round.objective.token,pos);
 p.host.roster({players:['host','guest'],hostUser:'host'});assert.equal(player(p.host,'guest'),undefined);
});
test('same-tick final retransmission repairs journal gap without duplicate objective event',()=>{
 const w=createWorld();addPlayer(w,{pid:'guest'});startStage(w,id);w.tick=30;w.round.state='clear';w.round.objective.state='complete';w.entities[0].terminal='clear';
 const frames=[],g=new CoopSession({uid:'guest',host:'host',players:['host','guest'],profile,config:{stageId:id,threat:1},onFrame:(w,e)=>frames.push(e)});
 g.begin({config:{stageId:id,threat:1},seed:42,profiles:{host:profile,guest:profile}});
 const row1={seq:1,event:{type:'tokenPicked',pid:'guest'},participants:[]},row2={seq:2,event:{type:'objectiveComplete',participants:['guest']},participants:['guest']};
 const packet={...encodeSnapshot(w),eventSeq:2,events:[row2]};g.rt('host',packet);assert.equal(frames.length,0);assert.equal(g.phase,'running');
 g.rt('host',{...packet,events:[row1,row2]});assert.equal(g.phase,'ended');assert.equal(frames.flat().filter(e=>e.type==='objectiveComplete').length,1);
 g.rt('host',{...packet,events:[row1,row2]});assert.equal(frames.length,1);
});
test('host repeats objective final packet until event ack without advancing frozen sim',()=>{
 const p=pair();pickup(p);move(player(p.host,'host'),p.host.world.round.objective.entry);ticks(p,15);
 const w=JSON.stringify(p.host.world),count=p.host.snapshots;
 p.host.update(250,emptyInput());assert.ok(p.host.snapshots>count);assert.equal(JSON.stringify(p.host.world),w);
 p.guest.update(dt,emptyInput());p.host.update(250,emptyInput());assert.equal(p.host.journal.length,0);
 const last=p.host.snapshots;p.host.update(250,emptyInput());assert.equal(p.host.snapshots,last);
});

const qsId='M_MARSH_MARKERS';
function netVisit(p,pid,i){move(player(p.host,pid),p.host.world.round.objective.markers[i]);ticks(p,15);}
test('QS1 snapshot deep-copies visited bitset, positions and per-player dwell; guest cannot mutate host',()=>{
 const w=createWorld();addPlayer(w,{pid:'h'});startStage(w,qsId);w.round.objective.visited=1;w.round.objective.progress['h:1']=8;
 const packet=encodeSnapshot(w),g=decodeSnapshot(packet,'h');assert.deepEqual(g.round.objective,w.round.objective);g.round.objective.markers[1].x=0;g.round.objective.progress['h:1']=0;assert.notEqual(w.round.objective.markers[1].x,0);assert.equal(w.round.objective.progress['h:1'],8);assert.equal(partyHpScale(2,12,qsId),1.4);
});
test('QS1 guest receives divided party visits, final event once, repeat final ack and no sim ownership',()=>{
 const p=pair(qsId);assert.equal(p.guest.world,null);p.host.rt('guest',{t:'objective',visited:7});assert.equal(p.host.world.round.objective.visited,0);
 netVisit(p,'host',0);netVisit(p,'guest',1);assert.equal(p.host.world.round.objective.visited,3);assert.equal(p.guest.buffer.frames.at(-1).world.round.objective.visited,3);
 netVisit(p,'guest',2);assert.equal(p.host.phase,'ended');assert.equal(p.guest.phase,'ended');assert.equal(p.guest.buffer.frames.at(-1).world.round.objective.visited,7);
 for(const uid of ['host','guest'])assert.equal(p.frames[uid].flatMap(f=>f.e).filter(e=>e.type==='objectiveComplete').length,1);
 const frozen=JSON.stringify(p.host.world);p.host.broadcast();p.host.update(250,emptyInput());assert.equal(JSON.stringify(p.host.world),frozen);assert.equal(p.frames.guest.flatMap(f=>f.e).filter(e=>e.type==='objectiveComplete').length,1);
 p.guest.update(dt,emptyInput());p.host.update(250,emptyInput());assert.equal(p.host.journal.length,0);p.guest.begin(p.host.startData);assert.equal(p.guest.phase,'ended');
});
for(const terminal of ['death','return_scroll'])test(`QS1 ${terminal} guest retains terminal and receives no clear eligibility`,()=>{
 const p=pair(qsId);netVisit(p,'guest',0);const g=player(p.host,'guest');g.terminal=terminal;g.dead=terminal==='death';netVisit(p,'host',1);netVisit(p,'host',2);
 assert.equal(g.terminal,terminal);assert.equal(p.host.world.round.objective.visited,7);assert.equal(p.guest.buffer.frames.at(-1).world.entities[0].terminal,terminal);assert.equal(p.frames.guest.flatMap(f=>f.e).filter(e=>e.type==='objectiveComplete').length,0);
});
test('QS1 same-tick missing marker journal repaired by retransmit without duplicate settlement',()=>{
 const w=createWorld();addPlayer(w,{pid:'guest'});startStage(w,qsId);w.tick=30;w.round.state='clear';w.round.objective.state='complete';w.round.objective.visited=7;w.entities[0].terminal='clear';
 const frames=[],g=new CoopSession({uid:'guest',host:'host',players:['host','guest'],profile,config:{stageId:qsId,threat:1},onFrame:(w,e)=>frames.push(e)});g.begin({config:{stageId:qsId,threat:1},seed:42,profiles:{host:profile,guest:profile}});
 const row1={seq:1,event:{type:'markerVisited',marker:2,pid:'guest'},participants:[]},row2={seq:2,event:{type:'objectiveComplete',participants:['guest']},participants:['guest']};const packet={...encodeSnapshot(w),eventSeq:2,events:[row2]};g.rt('host',packet);assert.equal(g.phase,'running');assert.equal(frames.length,0);
 g.rt('host',{...packet,events:[row1,row2]});assert.equal(g.phase,'ended');assert.equal(g.buffer.frames.at(-1).world.round.objective.visited,7);g.rt('host',{...packet,events:[row1,row2]});assert.equal(frames.flat().filter(e=>e.type==='objectiveComplete').length,1);
});


const qcId='M_THRONE_GARGOYLE';
function netKillTarget(p){
 const w=p.host.world,t=w.entities.find(e=>e.id===w.round.objective.targetId),h=player(p.host,'host');
 h.x=t.x-45;h.y=t.y;h.dmgMult.blade=1000;h.dmgMult.bow=1000;
 for(let i=0;i<60&&!t.dead;i++){p.guest.update(dt,emptyInput());p.host.update(dt,{...emptyInput(),autoAttack:true});}
 assert.equal(t.dead,true);
}
test('QC1 bound target snapshot and host real combat kill journal arrive once, retransmit/ack and rejoin preserve completion',()=>{
 const p=pair(qcId);ticks(p,2);const o=p.host.world.round.objective;
 assert.ok(o.targetId!==null);assert.equal(p.guest.world,null);assert.deepEqual(p.guest.buffer.frames.at(-1).world.round.objective,o);
 p.host.rt('guest',{t:'objective',targetKilled:true,targetId:o.targetId});assert.equal(o.state,'waiting');
 netKillTarget(p);assert.equal(p.host.phase,'ended');assert.equal(p.guest.phase,'ended');assert.equal(p.guest.buffer.frames.at(-1).world.round.objective.state,'complete');
 for(const uid of ['host','guest'])assert.equal(p.frames[uid].flatMap(f=>f.e).filter(e=>e.type==='objectiveComplete').length,1);
 const frozen=JSON.stringify(p.host.world);p.host.broadcast();p.host.update(250,emptyInput());assert.equal(JSON.stringify(p.host.world),frozen);assert.equal(p.frames.guest.flatMap(f=>f.e).filter(e=>e.type==='objectiveComplete').length,1);
 p.guest.update(dt,emptyInput());p.host.update(250,emptyInput());assert.equal(p.host.journal.length,0);p.guest.begin(p.host.startData);assert.equal(p.guest.phase,'ended');
});
for(const terminal of ['death','return_scroll'])test(`QC1 net ${terminal} guest excluded from objective journal and retains terminal`,()=>{
 const p=pair(qcId);ticks(p,2);const g=player(p.host,'guest');g.terminal=terminal;g.dead=terminal==='death';netKillTarget(p);
 assert.equal(g.terminal,terminal);assert.equal(p.guest.buffer.frames.at(-1).world.entities[0].terminal,terminal);assert.equal(p.frames.guest.flatMap(f=>f.e).filter(e=>e.type==='objectiveComplete').length,0);assert.equal(p.frames.host.flatMap(f=>f.e).filter(e=>e.type==='objectiveComplete').length,1);
});
test('QC1 final kill journal gap must be repaired before guest completes; duplicate final snapshot never repeats event',()=>{
 const w=createWorld();addPlayer(w,{pid:'guest'});startStage(w,qcId);w.tick=30;w.round.state='clear';w.round.objective.state='complete';w.round.objective.targetId=2;w.entities[0].terminal='clear';
 const frames=[],g=new CoopSession({uid:'guest',host:'host',players:['host','guest'],profile,config:{stageId:qcId,threat:1},onFrame:(w,e)=>frames.push(e)});g.begin({config:{stageId:qcId,threat:1},seed:42,profiles:{host:profile,guest:profile}});
 const row1={seq:1,event:{type:'kill',id:2,monster:'gargoyle',stageId:qcId,xp:36},participants:['guest']},row2={seq:2,event:{type:'objectiveComplete',questId:'QC1',participants:['guest']},participants:['guest']};const packet={...encodeSnapshot(w),eventSeq:2,events:[row2]};g.rt('host',packet);assert.equal(g.phase,'running');assert.equal(frames.length,0);
 g.rt('host',{...packet,events:[row1,row2]});assert.equal(g.phase,'ended');assert.equal(g.buffer.frames.at(-1).world.round.objective.targetId,2);g.rt('host',{...packet,events:[row1,row2]});assert.equal(frames.flat().filter(e=>e.type==='objectiveComplete').length,1);
});
