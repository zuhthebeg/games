import test from 'node:test';import assert from 'node:assert/strict';
import {CoopSession} from '../js/net/session.js';import {createMemoryTransport} from '../js/net/loopback.js';
import {emptyInput} from '../js/sim/world.js';import {botInput} from '../tools/balance/bot.js';
import {throneLateSave} from './fixtures/throne-late.js';import {buildRoundMods,createTracker,trackRound,settleRound,usedConsumables} from '../js/meta/run.js';
import {validateSave} from '../js/meta/save.js';import {rollDrops,ITEMS} from '../js/meta/items.js';
for(const count of [2,4])test(`TD1 ${count}-player real Session transport: only host simulates attacks, guest exact cues/hit journal and one kill settlement`,()=>{
 const uids=['host','guest','third','fourth'].slice(0,count),network=createMemoryTransport(),sessions={},saves={},trackers={},kills={},hits=new Set(),cues=new Set();
 for(const uid of uids){const save=throneLateSave(uid);saves[uid]=save;trackers[uid]=createTracker(uid==='host'?11:79);kills[uid]=0;
  const transport=network.connect(uid,(from,data)=>data.t==='action'?sessions[uid]?.action(data.action):sessions[uid]?.rt(from,data));
  sessions[uid]=new CoopSession({uid,host:'host',players:uids,profile:{name:uid,level:save.level,weapon:'blade',mods:buildRoundMods(save),threats:{TD1:1}},config:{stageId:'TD1',threat:1,seed:11},...transport,
   onFrame(view,events){for(const e of events){if(e.type==='kill')kills[uid]++;if(e.type==='hit'&&e.ability.startsWith('dragon_'))hits.add(e.ability);}
    trackers[uid]=trackRound(save,trackers[uid],events,usedConsumables(save,view.entities.find(e=>e.pid===uid))).tracker;
   }});
 }
 for(const uid of uids.slice(1))sessions[uid].update(34,emptyInput());
 const host=sessions.host,guest=sessions.guest;assert.ok(host.world);assert.equal(guest.world,null);assert.deepEqual(host.world.arena,{w:1680,h:1000});
 const approach=(view,uid,attack)=>{const p=view?.entities.find(e=>e.pid===uid),d=view?.entities.find(e=>e.type==='throne_dragon'&&!e.dead);if(!p||!d)return emptyInput();const dx=d.x-p.x,dy=d.y-p.y,dist=Math.hypot(dx,dy);return {...emptyInput(),mx:dist>(attack?95:175)?dx/dist:0,my:dist>(attack?95:175)?dy/dist:0,autoAttack:attack,potionEdge:p.hp<p.maxHp*.5};};
 let elapsed=0;for(;elapsed<10000&&host.phase==='running';elapsed++){
  const attack=elapsed>=900;
  for(const uid of uids.slice(1))sessions[uid].update(1000/30,approach(sessions[uid].view(),uid,attack));
  host.update(1000/30,approach(host.view(),'host',attack));
  const latest=guest.buffer.frames.at(-1)?.world;
  if(latest?.telegraphs.length){for(const tg of latest.telegraphs)cues.add(tg.ability);
   // Network decoding preserves the exact host sector, even when remote sprite interpolation runs.
   for(const tg of latest.telegraphs){assert.ok(tg.ability.startsWith('dragon_'));if(tg.ability==='dragon_tail')assert.equal(tg.shape.facingOffsetDeg,180);}
  }
  assert.equal(guest.world,null);
 }
 host.broadcast();assert.equal(host.world.round.state,'clear');assert.deepEqual([...cues].sort(),['dragon_flame','dragon_stomp','dragon_tail']);assert.ok(hits.size>=2);
 for(const uid of uids){assert.equal(kills[uid],1,uid);const p=host.world.entities.find(e=>e.pid===uid);assert.equal(p.terminal,'clear');
  const out=settleRound(saves[uid],{stageId:'TD1',terminal:p.terminal,...trackers[uid],used:usedConsumables(saves[uid],p)});
  assert.ok(validateSave(out.save));assert.ok(out.receipt.lootKept.items.length<=2);assert.equal(out.save.cleared.S20,true);
 }
 // Guests cannot submit arbitrary HP or attack-event packets to gain host authority.
 const before=JSON.stringify(host.world);host.rt('guest',{t:'hit',dst:host.world.entities[0].id,dmg:999999});assert.equal(JSON.stringify(host.world),before);
});
test('TD1 reward stream is finite and bounded, existing T3 plus guardian-only T4 items; 100 seeds ×3 threats',()=>{
 for(let seed=0;seed<100;seed++)for(let threat=1;threat<=3;threat++){
  const drop=rollDrops('throne_dragon',seed,{stageId:'TD1',huntTier:3,threat});assert.ok(Number.isSafeInteger(drop.gold)&&drop.gold>=0&&drop.gold<=250);
  for(const item of drop.items){assert.ok(ITEMS[item.id]);assert.equal(ITEMS[item.id].huntTier,ITEMS[item.id].slot==='offhand'?3:ITEMS[item.id].dropOnly==='throne_dragon'?4:3);}
  for(const id of Object.keys(drop.stacks))assert.ok(ITEMS[id]);
 }
});
