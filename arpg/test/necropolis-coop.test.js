import test from 'node:test';
import assert from 'node:assert/strict';
import {CoopSession} from '../js/net/session.js';
import {createMemoryTransport} from '../js/net/loopback.js';
import {emptyInput} from '../js/sim/world.js';
import {botInput} from '../tools/balance/bot.js';
import {preset} from '../tools/balance/botsim.mjs';
import {STAGES} from '../js/content/combat.js';
import {buildRoundMods,createTracker,trackRound,settleRound,usedConsumables} from '../js/meta/run.js';
import {validateSave} from '../js/meta/save.js';
for(const id of ['S24','S25','S26','S27'])for(const count of [2,4])test(`Necropolis ${id} ${count}-player existing transport: host-only simulation, all kill journals and bounded independent settlement`,()=>{
 const uids=['host','guest','third','fourth'].slice(0,count),network=createMemoryTransport(),sessions={},saves={},trackers={},kills={};
 for(const [i,uid] of uids.entries()){
  const save=preset(id);save.cleared.S20=save.cleared.S23=true;for(let stage=24;stage<Number(id.slice(1));stage++)save.cleared['S'+stage]=true;saves[uid]=save;trackers[uid]=createTracker(i*73+11);kills[uid]=0;
  const transport=network.connect(uid,(from,data)=>data.t==='action'?sessions[uid]?.action(data.action):sessions[uid]?.rt(from,data));
  sessions[uid]=new CoopSession({uid,host:'host',players:uids,profile:{name:uid,level:save.level,weapon:'blade',mods:buildRoundMods(save),threats:{[id]:1}},config:{stageId:id,threat:1,seed:11},...transport,
   onFrame(view,events){kills[uid]+=events.filter(e=>e.type==='kill').length;const p=view.entities.find(e=>e.pid===uid);trackers[uid]=trackRound(save,trackers[uid],events,usedConsumables(save,p)).tracker;}});
 }
 for(const uid of uids.slice(1))sessions[uid].update(34,emptyInput());
 const host=sessions.host;assert.ok(host.world);for(const uid of uids.slice(1))assert.equal(sessions[uid].world,null);
 for(let t=0;t<18000&&host.phase==='running';t++){
  for(const uid of uids.slice(1)){const view=sessions[uid].view(),p=view?.entities.find(e=>e.pid===uid);sessions[uid].update(1000/30,p?botInput(view,p):emptyInput());}
  host.update(1000/30,botInput(host.view(),host.world.entities.find(e=>e.pid==='host')));
 }
 host.broadcast();assert.equal(host.world.round.state,'clear');
 for(const uid of uids){const p=host.world.entities.find(e=>e.pid===uid);assert.equal(p.terminal,'clear');assert.equal(kills[uid],STAGES[id].spawns.length,uid);
  const out=settleRound(saves[uid],{stageId:id,terminal:p.terminal,...trackers[uid],used:usedConsumables(saves[uid],p)});assert.ok(validateSave(out.save));assert.ok(out.save.cleared[id]);assert.ok(out.receipt.lootKept.items.length<=2);assert.ok(out.receipt.goldGained>0);
 }
 for(const uid of uids.slice(1))assert.equal(sessions[uid].world,null);
 const before=JSON.stringify(host.world);host.rt('guest',{t:'kill',monster:'skeleton_mage',stageId:id});assert.equal(JSON.stringify(host.world),before);
});
