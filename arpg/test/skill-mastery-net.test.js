import test from 'node:test';
import assert from 'node:assert/strict';
import { CoopSession } from '../js/net/session.js';
import { createMemoryTransport } from '../js/net/loopback.js';
import { encodeSnapshot, decodeSnapshot } from '../js/net/protocol.js';
import { emptyInput } from '../js/sim/world.js';
import { createTracker, trackRound } from '../js/meta/run.js';
import { createSave } from '../js/meta/save.js';
const config={stageId:'S2',seed:42,threat:1};
const make = (levels=true) => {
 const net=createMemoryTransport(),sessions={};
 for(const uid of ['h','g']) {
  const transport=net.connect(uid,(from,data)=>data.t==='action'?sessions[uid].action(data.action):sessions[uid].rt(from,data));
  const profile={level:1,weapon:'focus',mods:{maxHp:10000},threats:{S2:1},...(levels?{skillMasteryLevels:{ember_bolt:uid==='h'?3:5}}:{})};
  sessions[uid]=new CoopSession({uid,host:'h',players:['h','g'],profile,config,...transport});
 }
 sessions.g.update(34,emptyInput()); return sessions;
};
test('round profile/snapshot carries each caster level, never the sim pawn/mods; decoration is a copy',()=>{
 const a=make(),b=make(false);
 assert.deepEqual(a.h.world,b.h.world);
 const before=JSON.stringify(a.h.world),view=a.h.view(); assert.equal(view.entities[0].skillMasteryLevels.ember_bolt,3); assert.equal(view.entities[1].skillMasteryLevels.ember_bolt,5); assert.equal(JSON.stringify(a.h.world),before);
 const packet=encodeSnapshot(a.h.world,null,a.h.profiles); assert.equal(packet.entities[1].skillMasteryLevels.ember_bolt,5);
 packet.entities[1].skillMasteryLevels.ember_bolt=2; assert.equal(a.h.profiles.g.skillMasteryLevels.ember_bolt,5);
 assert.equal(decodeSnapshot(encodeSnapshot(a.h.world,null,a.h.profiles),'g').entities[0].skillMasteryLevels.ember_bolt,5);
 for(let n=0;n<100;n++) {const input={...emptyInput(),skillEdge:n===0};a.g.update(34,input);b.g.update(34,input);a.h.update(34,input);b.h.update(34,input);}
 assert.deepEqual(a.h.world,b.h.world);
});
test('debug levels use a separate render message, update remote display, reject malformed payload, leave sim unchanged',()=>{
 const a=make(),before=JSON.stringify(a.h.world);
 a.g.setMastery({ember_bolt:1}); assert.equal(a.h.profiles.g.skillMasteryLevels.ember_bolt,1);
 a.h.update(34,emptyInput()); a.h.update(34,emptyInput()); assert.equal(a.g.view().entities[0].skillMasteryLevels.ember_bolt,1);
 const world=JSON.stringify(a.h.world); a.h.rt('g',{t:'mastery',levels:{ember_bolt:8}}); assert.equal(a.h.profiles.g.skillMasteryLevels.ember_bolt,1); assert.equal(JSON.stringify(a.h.world),world);
 a.h.setMastery({ember_bolt:5}); assert.equal(JSON.stringify(a.h.world),world); assert.equal(a.h.view().entities.find(e=>e.pid==='h').skillMasteryLevels.ember_bolt,5);
 assert.ok(before);
});
test('guest journal duplicate packets never count the same host cast twice',()=>{
 const a=make(),g=a.g,save=createSave({name:'g',weapon:'focus',answers:[0,0,0,0,0],createdAt:1}); let tracker=createTracker(1);
 g.onFrame=(w,events)=>{tracker=trackRound(save,tracker,events,{},w,'g').tracker;};
 const p=a.h.world.entities.find(e=>e.pid==='g');
 const packet={...encodeSnapshot(a.h.world,null,a.h.profiles),tick:100,eventSeq:2,events:[{seq:1,event:{type:'act',id:p.id,ability:'ember_bolt',masteryPid:'g'}},{seq:2,event:{type:'hit',src:p.id,dst:999,ability:'ember_bolt',masteryPid:'g',masteryEnemy:true}}]};
 g.rt('h',packet,100);g.rt('h',packet,100);assert.equal(tracker.skillMastery.ember_bolt,1);assert.equal(g.eventAck,2);
});
