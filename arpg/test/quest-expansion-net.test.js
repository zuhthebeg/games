import test from 'node:test';
import assert from 'node:assert/strict';
import {CoopSession} from '../js/net/session.js';
import {encodeSnapshot,decodeSnapshot,partyHpScale} from '../js/net/protocol.js';
import {createWorld,addPlayer,startStage,emptyInput} from '../js/sim/world.js';
import {createMemoryTransport} from '../js/net/loopback.js';
const id='M_MINE_CART', dt=1000/30;
const profile={level:11,weapon:'bow',mods:{maxHp:10000},threats:{[id]:1}};
function pair(){
 const wire=createMemoryTransport(),frames={host:[],guest:[]};const sessions={};
 for(const uid of ['host','guest']){
  const transport=wire.connect(uid,(from,data)=>data.t==='action'?sessions[uid].action(data.action):sessions[uid].rt(from,data));
  sessions[uid]=new CoopSession({uid,host:'host',players:['host','guest'],profile,config:{stageId:id,threat:1,seed:42},...transport,onFrame:(w,e)=>frames[uid].push({w:structuredClone(w),e})});
 }
 const start={config:{stageId:id,threat:1},seed:42,profiles:{host:profile,guest:profile}};
 sessions.guest.begin(start);sessions.host.begin(start);return {...sessions,frames};
}
const player=(s,pid)=>s.world.entities.find(e=>e.pid===pid);
const move=(p,pos)=>{p.x=pos.x;p.y=pos.y;p.moving=false;};
function ticks(p,n){for(let i=0;i<n;i++){p.guest.update(dt,emptyInput());p.host.update(dt,emptyInput());}}
function pickup(p,pid='host'){move(player(p.host,pid),p.host.world.round.objective.token);ticks(p,15);assert.equal(p.host.world.round.objective.carrier,pid);}
test('objective snapshot deep copy + guest decode, explicit recommendation',()=>{
 const w=createWorld();addPlayer(w,{pid:'h'});startStage(w,id);const packet=encodeSnapshot(w);w.round.objective.token.x=0;assert.notEqual(packet.objective.token.x,0);const guest=decodeSnapshot(packet,'h');assert.deepEqual(guest.round.objective,packet.objective);assert.equal(partyHpScale(2,11,id),1.6);
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
