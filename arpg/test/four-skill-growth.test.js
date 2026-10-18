import test from 'node:test';
import assert from 'node:assert/strict';
import { skillGrowth, boundedMasteryLevels, growthLabel } from '../js/content/skill-growth.js';
import { createWorld, addPlayer, spawnMonster, emptyInput, step, startStage } from '../js/sim/world.js';
import { ABILITIES } from '../js/content/combat.js';
import { trackMastery, MASTERY_THRESHOLDS } from '../js/meta/skill-mastery.js';
import { encodeSnapshot, decodeSnapshot } from '../js/net/protocol.js';
import { CoopSession } from '../js/net/session.js';
import { createMemoryTransport } from '../js/net/loopback.js';
import { skillCardHtml } from '../js/ui/skill-view.js';
import { createSave } from '../js/meta/save.js';
const ids=['meteor','firewall','rain_arrow','spinning_shot'];
const levels=[1,4,5,10,15,20,25,30];
const fixture=(id,level)=>{const w=createWorld({seed:123});const p=addPlayer(w,{pid:'p',weapon:ABILITIES[id].family,x:500,y:400,skillMasteryLevels:{[id]:level},mods:{skills:[id],mpRegen:0}});return {w,p};};
const cast=w=>step(w,{p:{...emptyInput(),skillEdge:true,aimX:180,aimY:0}});
for(const id of ids)for(const level of levels)test(`${id} Lv${level}: real finite growth, one charge, snapshot, UI`,()=>{
 const {w,p}=fixture(id,level),g=skillGrowth(id,level),tier=level<5?0:Math.floor(level/5);
 assert.equal(g.count,({meteor:1,firewall:8,rain_arrow:4,spinning_shot:12})[id]+tier*(id==='spinning_shot'?2:1));
 const t=spawnMonster(w,'ghoul',680,400);t.spawnLeft=0;t.frozenUntil=10000;t.hp=t.maxHp=100000;
 const ally=spawnMonster(w,'ghoul',680,400);ally.spawnLeft=0;ally.team=p.team;ally.frozenUntil=10000;
 const initial=cast(w),es=[...initial],launches=[],impacts=[];let firstZone;
 // Natural cast only; changing the pawn's level after launch cannot rewrite the cast.
 p.skillMasteryLevels[id]=level===30?1:30;
 for(let n=0;n<240;n++){
  const events=step(w);es.push(...events);
  if(w.zones?.length&&!firstZone){firstZone=structuredClone(w.zones[0]);w.round={stageId:'S1',state:'running',pending:[]};const packet=encodeSnapshot(w);assert.ok(decodeSnapshot(packet,'p'),'grown zones decode');delete w.round;}
  if(events.some(e=>e.type==='projectile'&&e.ability===id))launches.push(w.tick);
  if(events.some(e=>['explode','zonePulse'].includes(e.type)&&e.ability===id))impacts.push(w.tick);
 }
 assert.equal((id==='spinning_shot'?launches:impacts).length,g.count);
 if(id==='meteor'||id==='rain_arrow')for(let i=1;i<impacts.length;i++)assert.equal(impacts[i]-impacts[i-1],9);
 if(id==='firewall'){for(let i=1;i<impacts.length;i++)assert.equal(impacts[i]-impacts[i-1],15);assert.equal(firstZone.endTick-firstZone.startTick,g.durationMs/1000*30);}
 if(id==='spinning_shot')assert.ok(launches.at(-1)-launches[0]<36);
 else assert.equal(es.filter(e=>e.type==='hit'&&e.dst===t.id&&e.ability===id&&!(!e.zonePulse&&e.periodic)).length,g.count);
 assert.equal(ally.hp,ally.maxHp);assert.equal(p.mp,100-ABILITIES[id].manaCost);assert.ok(p.cds[id]>0);assert.equal(es.filter(e=>e.type==='act'&&e.ability===id).length,1);
 assert.equal(w.zones?.length||0,0);assert.equal(w.projectiles.length,0);
 const tracker={};trackMastery(tracker,es,{entities:w.entities,round:{stageId:'S1'}},'p');if(id!=='spinning_shot')assert.equal(tracker.skillMastery[id],1);
 const save=createSave({name:'Growth',answers:[0,0,0,0,0],weapon:ABILITIES[id].family,createdAt:1});save.skillMastery={[id]:MASTERY_THRESHOLDS[level-1]};
 for(const context of ['character','detail'])assert.ok(skillCardHtml(id,save,{context}).includes(growthLabel(id,level)));
});
test('input levels clamp known skills, ignore malformed values, do not rewrite saves',()=>{
 const input={meteor:99,firewall:-5,rain_arrow:'30',spinning_shot:NaN,unknown:30,ember_bolt:5};assert.deepEqual(boundedMasteryLevels(input),{meteor:30,firewall:1,ember_bolt:5});
 for(const bad of [null,[],30,'30'])assert.deepEqual(boundedMasteryLevels(bad),{});
 assert.equal(input.meteor,99);for(const bad of [NaN,Infinity,1.2,'30'])assert.equal(skillGrowth('meteor',bad).count,1);
});
test('pending casts reserve capacity atomically without mana or cooldown loss',()=>{
 const {w,p}=fixture('meteor',30);const g=addPlayer(w,{pid:'g',weapon:'focus',mods:{skills:['meteor'],mpRegen:0}});
 w.zones=Array.from({length:31},(_,i)=>({id:100+i,ownerId:p.id,team:p.team,abilityId:'firewall',startTick:0,activeTick:0,endTick:210,nextTick:200,x:900,y:400,facing:0,dmgMult:1}));
 step(w,{p:{...emptyInput(),skillEdge:true},g:{...emptyInput(),skillEdge:true}});assert.equal(p.mp,68);assert.equal(g.mp,100);assert.equal(g.act,null);assert.equal(g.cds.meteor,undefined);
 for(let i=0;i<110;i++)step(w);assert.ok(w.zones.length<=32);
});
for(const id of ids)test(`${id}: host authority receives guest levels, snapshot+journal agreement, restart persists`,()=>{
 const net=createMemoryTransport(),s={},events={h:[],g:[]};
 for(const uid of ['h','g']){const transport=net.connect(uid,(from,d)=>d.t==='action'?s[uid].action(d.action):s[uid].rt(from,d));s[uid]=new CoopSession({uid,host:'h',players:['h','g'],profile:{level:1,weapon:ABILITIES[id].family,mods:{skills:[id],mpRegen:0,maxHp:10000},skillMasteryLevels:{[id]:uid==='g'?30:1},threats:{S2:1}},config:{stageId:'S2',threat:1,seed:33},...transport,onFrame:(v,es)=>events[uid].push(...es)});}
 s.g.update(34,emptyInput());const w=s.h.world,p=w.entities.find(p=>p.pid==='g');assert.equal(p.skillMasteryLevels[id],30);w.round.pending=[];const target=spawnMonster(w,'ghoul',1100,700);target.spawnLeft=0;target.frozenUntil=10000;target.hp=target.maxHp=100000;
 s.g.update(34,{...emptyInput(),skillEdge:true,aimX:180});for(let n=0;n<245;n++)s.h.update(34,emptyInput());
 const type=id==='meteor'?'explode':id==='spinning_shot'?'projectile':'zonePulse';
 const own=es=>es.filter(e=>e.type===type&&e.ability===id);
 assert.equal(own(events.h).length,skillGrowth(id,30).count);assert.equal(own(events.g).length,own(events.h).length);assert.equal(s.g.world,null);
 assert.equal(s.g.view().entities[0].skillMasteryLevels[id],30);assert.equal(p.mp,100-ABILITIES[id].manaCost);
 startStage(w,'S2');assert.equal(p.skillMasteryLevels[id],30);
});
for(const id of ids)test(`${id} Lv30 rejects insufficient mana atomically, full payment/cooldown unchanged`,()=>{
 const {w,p}=fixture(id,30),cost=ABILITIES[id].manaCost;p.mp=cost-1;cast(w);assert.equal(p.act,null);assert.equal(p.mp,cost-1);assert.deepEqual(p.cds,{});p.mp=cost;cast(w);assert.equal(p.mp,0);for(let i=0;i<230;i++)step(w);assert.equal(p.mp,0);const cd=p.cds[id];assert.ok(cd>0);assert.equal(cast(w).filter(e=>e.type==='act').length,0);assert.equal(p.mp,0);
});
for(const id of ['meteor','firewall','rain_arrow'])test(`${id} Lv30 has base per-hit scaling, staff/silver and complete declared lifetime`,()=>{
 const {w,p}=fixture(id,30);p.silverWeapon=true;p.handedness=2;p.staffAffinity='fire';p.dmgMult[ABILITIES[id].family]=2;
 const target=spawnMonster(w,'ghoul',680,400);target.spawnLeft=0;target.frozenUntil=10000;target.hp=target.maxHp=100000;
 cast(w);let zone,finalZoneTick=-1;const hits=[];
 for(let n=0;n<240;n++){for(const e of step(w))if(e.type==='hit'&&e.ability===id&&(!e.periodic||e.zonePulse))hits.push(e);if(w.zones?.length){zone??=structuredClone(w.zones[0]);finalZoneTick=w.tick-1;}}
 const expected=ABILITIES[id].damage*2*(id==='rain_arrow'?1.5:1.25);
 assert.equal(hits.length,skillGrowth(id,30).count);assert.equal(hits[0].dmg,expected);assert.equal(finalZoneTick,zone.endTick-1);
});
test('Lv30 spin covers uniform full circle within 36 ticks and predicted timeline matches each tick',async()=>{
 const {predictPlayerTick}=await import('../js/net/player-prediction.js');const {w,p}=fixture('spinning_shot',30);let pred=structuredClone(p);const shots=new Map();
 for(let n=0;n<80;n++){const input={...emptyInput(),skillEdge:n===0,aimX:180};pred=predictPlayerTick(pred,input,{arena:w.arena,others:[],tick:w.tick});step(w,{p:input});assert.equal(pred.facing,p.facing);assert.equal(pred.mp,p.mp);assert.equal(pred.act?.phase,p.act?.phase);assert.deepEqual(pred.act?.growth,p.act?.growth);for(const pr of w.projectiles)if(!shots.has(pr.id))shots.set(pr.id,pr);}
 assert.equal(shots.size,24);[...shots.values()].forEach((pr,i)=>{const expected=i*Math.PI*2/24;assert.ok(Math.abs(Math.atan2(pr.vy,pr.vx)-Math.atan2(Math.sin(expected),Math.cos(expected)))<1e-8);});
});
for(const id of ids)test(`${id} Lv30 delayed guest dodge still refunds only dodgeable contact`,async()=>{
 const {enableGuestDodgeLag}=await import('../js/sim/dodge-lag.js');
 const {w,p}=fixture(id,30);const foe=addPlayer(w,{pid:'foe',weapon:'bow',x:680,y:400,mods:{maxHp:1000,mpRegen:0}});foe.team=3;enableGuestDodgeLag(w,'foe');cast(w);
 let contact;
 for(let n=0;n<70&&!contact;n++)contact=step(w).find(e=>e.type==='hit'&&e.dst===foe.id&&e.ability===id);
 assert.ok(contact,'real scheduled hostile contact');const damaged=foe.hp;assert.ok(damaged<1000);const hitTick=w.tick-1;
 const events=step(w,{foe:{...emptyInput(),mx:1,dodgeEdge:true,viewTick:hitTick}});
 assert.ok(events.some(e=>e.type==='dodgeRewind'&&e.pid==='foe'));assert.equal(foe.hp,1000);
});
for(const id of ids)test(`${id}: all milestone MP/CD and act timelines exactly match legacy Lv1`,()=>{
 for(const level of levels){const base=fixture(id,1),grown=fixture(id,level);for(let tick=0;tick<90;tick++){const input={p:{...emptyInput(),skillEdge:tick===0,aimX:180}};step(base.w,input);step(grown.w,input);assert.equal(grown.p.mp,base.p.mp);assert.deepEqual(grown.p.cds,base.p.cds);assert.equal(grown.p.act?.phase,base.p.act?.phase);}}
});
