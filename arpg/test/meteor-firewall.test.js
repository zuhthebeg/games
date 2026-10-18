import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, addPlayer, spawnMonster, step, emptyInput, startStage } from '../js/sim/world.js';
import { ABILITIES, canUseSkill, weaponAttackMultiplier } from '../js/content/combat.js';
import { createSave, validateSave } from '../js/meta/save.js';
import { learnSkill, equipSkill, BOOKS } from '../js/meta/skills.js';
import { trackMastery, validMastery } from '../js/meta/skill-mastery.js';
import { trained } from './fixtures/trained.js';
import { encodeSnapshot, decodeSnapshot } from '../js/net/protocol.js';
const fixture = id => { const w=createWorld({seed:123}); const p=addPlayer(w,{pid:'p',weapon:'focus',x:300,y:400,mods:{skills:[id],mpRegen:0}}); return {w,p}; };
const mob=(w,x=500,y=400)=>{const t=spawnMonster(w,'ghoul',x,y);t.spawnLeft=0;t.frozenUntil=10000;t.hp=t.maxHp=10000;return t;};
const cast=w=>step(w,{p:{...emptyInput(),skillEdge:true}});
const run=(w,n)=>Array.from({length:n},()=>step(w)).flat();
for(const id of ['meteor','firewall']) {
 test(`${id} book requirements, cost, three slots, save/mastery and focus-only scaling`,()=>{
  assert.ok(BOOKS[id]);let s=trained(createSave({name:'fire',answers:[0,0,0,0,0],weapon:'focus',createdAt:1}));s.gold=1000;
  const before=s.gold;s=equipSkill(learnSkill(s,id),'focus',id);assert.equal(s.gold,before-BOOKS[id].price);assert.ok(s.loadout.includes(id));assert.ok(validateSave(s));assert.ok(validMastery({[id]:1}));
  assert.equal(canUseSkill(id,'blade'),false);assert.equal(canUseSkill(id,'focus'),true);assert.equal(weaponAttackMultiplier(true,id,'undead',2),1);
  const poor=structuredClone(s);poor.learned=[];poor.gold=0;assert.throws(()=>learnSkill(poor,id));const low=createSave({name:'low',answers:[0,0,0,0,0],weapon:'focus',createdAt:1});low.gold=1000;assert.throws(()=>learnSkill(low,id));
 });
 test(`${id} insufficient mana rejects atomically; cost and cooldown charged once`,()=>{
  const {w,p}=fixture(id);p.mp=ABILITIES[id]?.manaCost-1;cast(w);assert.equal(p.act,null);assert.equal(w.zones?.length||0,0);
  p.mp=100;cast(w);assert.equal(p.mp,100-ABILITIES[id].manaCost);run(w,100);assert.equal(p.mp,100-ABILITIES[id].manaCost);assert.ok(p.cds[id]>0);assert.equal(cast(w).filter(e=>e.type==='act').length,0);
 });
}
test('meteor target locks initially, delayed impact is dodgeable and does not follow moving enemies',()=>{
 const {w,p}=fixture('meteor');const t=mob(w);cast(w);const target={x:t.x,y:t.y};run(w,15);assert.equal(w.zones.length,1);assert.equal(w.zones[0].x,target.x);assert.equal(t.hp,10000);
 t.x=1000;const events=run(w,40);assert.equal(t.hp,10000);assert.equal(w.zones.length,0);assert.ok(events.some(e=>e.type==='explode'&&e.ability==='meteor'&&e.x===target.x));
});
test('meteor hits once per hostile, allied safe, fire focus scaling and no silver/twohand spell bonus',()=>{
 const {w,p}=fixture('meteor');p.dmgMult.focus=2;p.silverWeapon=true;p.handedness=2;const t=mob(w);const ally=mob(w);ally.team=p.team;
 cast(w);const es=run(w,50);const hs=es.filter(e=>e.type==='hit'&&e.ability==='meteor'&&!e.periodic);assert.equal(hs.length,1);assert.equal(hs[0].dmg,200);assert.equal(ally.hp,10000);
});
test('firewall finite eight pulses spaced 15 ticks, no duplicate target, crit RNG, poise, burn or ally damage',()=>{
 const {w,p}=fixture('firewall');p.critChance=1;p.critMult=99;const t=mob(w);t.poise=999;const ally=mob(w);ally.team=p.team;cast(w);const trace=[];
 for(let i=0;i<150;i++)for(const e of step(w))if(e.type==='hit'&&e.ability==='firewall')trace.push([w.tick-1,e]);
 assert.equal(trace.length,8);for(let i=1;i<8;i++)assert.equal(trace[i][0]-trace[i-1][0],15);assert.ok(trace.every(([,e])=>e.dmg===12&&!e.crit&&e.zonePulse));assert.equal(t.hp,10000-96);assert.equal(t.poise,999);assert.equal(t.burn,undefined);assert.equal(ally.hp,10000);assert.equal(w.zones.length,0);
 const tr={};trackMastery(tr,[{type:'act',id:p.id,ability:'firewall'},...trace.map(([,e])=>e)],{entities:w.entities,round:{stageId:'S1'}},'p');assert.equal(tr.skillMastery.firewall,1);
});
test('zone cleanup: dead/terminal/missing caster and stopped/restarted round; cancel before release',()=>{
 for(const mode of ['dead','terminal','missing','stop','restart']){const {w,p}=fixture('firewall');cast(w);run(w,12);assert.equal(w.zones.length,1);if(mode==='dead')p.dead=true;if(mode==='terminal')p.terminal='extract';if(mode==='missing')w.entities=[];if(mode==='stop')w.round={state:'won',pending:[]};if(mode==='restart')startStage(w,'S1');step(w);assert.equal(w.zones.length,0,mode);}
 const {w,p}=fixture('meteor');cast(w);p.dead=true;run(w,50);assert.equal(w.zones?.length||0,0);
});
test('snapshots carry bounded optional zones and reject malformed zones',()=>{
 const {w}=fixture('meteor');startStage(w,'S1');cast(w);run(w,15);const packet=encodeSnapshot(w);assert.equal(packet.zones.length,1);assert.deepEqual(decodeSnapshot(packet,'p').zones,packet.zones);delete packet.zones;assert.deepEqual(decodeSnapshot(packet,'p').zones,[]);packet.zones=[{id:1,x:NaN}];assert.equal(decodeSnapshot(packet,'p'),null);
});
test('seeded zone traces deterministic and finite',()=>{
 const play=()=>{const {w}=fixture('firewall');mob(w);cast(w);const trace=run(w,180);assert.equal(w.zones.length,0);return JSON.stringify(trace);};assert.equal(play(),play());
});
test('same skill recovery cannot restart a zone cast before cooldown',()=>{
 for(const id of ['meteor','firewall']){const {w,p}=fixture(id);cast(w);while(p.act?.phase!=='recovery')step(w);const before=p.mp;assert.equal(cast(w).some(e=>e.type==='act'),false);assert.equal(p.mp,before);}
});
test('fire skill UI has unique glyphs and exact duration/range/cost tooltip, no firewall burn promise',async()=>{
 const {skillIcon,skillCardHtml}=await import('../js/ui/skill-view.js');const s=trained(createSave({name:'ui',answers:[0,0,0,0,0],weapon:'focus',createdAt:1}));s.gold=2000;
 assert.match(skillIcon('meteor'),/<path/);assert.match(skillIcon('firewall'),/<path/);assert.notEqual(skillIcon('meteor'),skillIcon('firewall'));
 const meteor=skillCardHtml('meteor',s),wall=skillCardHtml('firewall',s);assert.match(meteor,/0.7초/);assert.match(meteor,/125/);assert.match(wall,/4초/);assert.match(wall,/0.5초/);assert.match(wall,/220/);assert.doesNotMatch(wall,/화상 3초/);
});
test('fire zone presentation retains bounded geometry normal/reduced and never mutates host state',async()=>{
 const {paintSpellZones}=await import('../js/render/spell-zones.js');const {Graphics}=await import('../vendor/pixi-8.22.0.min.mjs');
 for(const id of ['meteor','firewall']){const {w}=fixture(id);cast(w);run(w,15);const before=JSON.stringify(w);for(const reduced of [false,true]){const g=new Graphics();paintSpellZones(g,w,reduced);assert.ok(g.context.instructions.length>0);assert.equal(JSON.stringify(w),before);g.destroy();}}
});
test('fire audio cast/meteor impact uses shipped sounds and firewall pulses stay silent',async()=>{
 const {eventCues}=await import('../js/audio-profile.js');for(const id of ['meteor','firewall'])assert.equal(eventCues({type:'act',id:1,ability:id},1)[0].name,'fire-cast');assert.deepEqual(eventCues({type:'hit',src:1,dst:2,ability:'firewall',zonePulse:true},1),[]);assert.equal(eventCues({type:'explode',ability:'meteor'},1)[0].name,'fire-impact');
});
test('meteor and wall honor hostile skeleton teams and player dodge without touching allies',()=>{
 for(const id of ['meteor','firewall']){const {w,p}=fixture(id);const foe=addPlayer(w,{pid:'skeleton',x:500,y:400,mods:{maxHp:1000,mpRegen:0}});foe.skeletal=true;foe.team=3;const ally=addPlayer(w,{pid:'ally',x:510,y:410});cast(w);foe.dodge.iframeLeft=100;run(w,id==='meteor'?40:20);assert.equal(foe.hp,1000);foe.dodge.iframeLeft=0;const es=run(w,120);assert.equal(ally.hp,ally.maxHp);if(id==='firewall')assert.ok(es.some(e=>e.type==='hit'&&e.dst===foe.id));}
});
test('wall crossing into and out of finite perpendicular segment samples only contact on pulse',()=>{
 const {w}=fixture('firewall');const t=mob(w,800);cast(w);run(w,12);const z=w.zones[0];t.x=z.x;t.y=z.y+200;assert.equal(run(w,15).filter(e=>e.type==='hit').length,0);t.y=z.y;assert.equal(run(w,15).filter(e=>e.type==='hit').length,1);t.x=z.x+200;assert.equal(run(w,15).filter(e=>e.type==='hit').length,0);
});
test('remote cast through two real CoopSessions produces host-only damage and coherent snapshots/journal',async()=>{
 const {CoopSession}=await import('../js/net/session.js');const {createMemoryTransport}=await import('../js/net/loopback.js');
 for(const id of ['meteor','firewall']){const network=createMemoryTransport(),sessions={},events={host:[],guest:[]};
  for(const uid of ['host','guest']){const transport=network.connect(uid,(from,p)=>p.t==='action'?sessions[uid].action(p.action):sessions[uid].rt(from,p));sessions[uid]=new CoopSession({uid,host:'host',players:['host','guest'],profile:{name:uid,level:1,weapon:'focus',mods:{skills:[id],mpRegen:0},threats:{S2:1}},config:{stageId:'S2',threat:1,seed:33},...transport,onFrame:(view,es)=>events[uid].push(...es)});}
  sessions.guest.update(34,emptyInput());const w=sessions.host.world,p=w.entities.find(e=>e.pid==='guest');w.round.pending=[];const t=mob(w,p.x+160,p.y); // explicit unit fixture, never browser injection
  const send=sessions.host.sendRt;sessions.host.sendRt=()=>{};sessions.guest.update(34,{...emptyInput(),skillEdge:true});
  for(let i=0;i<20;i++)sessions.host.update(34,emptyInput());assert.ok(w.zones?.some(z=>z.ownerId===p.id));assert.equal(sessions.guest.world,null);assert.equal(events.guest.filter(e=>e.type==='hit'&&e.ability===id).length,0);
  const packet=encodeSnapshot(w);assert.equal(decodeSnapshot(packet,'guest').zones[0].abilityId,id);
  for(let i=0;i<150;i++)sessions.host.update(34,emptyInput());assert.equal(p.mp,100-ABILITIES[id].manaCost);assert.ok(t.hp<10000);
  sessions.host.sendRt=send;sessions.host.broadcast();w.tick++;sessions.host.broadcast();
  const confirmed=events.guest.filter(e=>e.type==='hit'&&e.ability===id);assert.ok(confirmed.length>0);assert.equal(confirmed.length,events.host.filter(e=>e.type==='hit'&&e.ability===id).length);assert.equal(sessions.guest.world,null);
 }
});
test('zone capacity and hostile team changes bound active state without charge on full capacity',()=>{
 const {w,p}=fixture('firewall');const z={id:99,ownerId:p.id,team:p.team,abilityId:'firewall',x:500,y:400,facing:0,startTick:0,activeTick:0,endTick:120,nextTick:0,dmgMult:1};w.zones=Array.from({length:32},(_,i)=>({...z,id:99+i}));cast(w);assert.equal(p.mp,100);assert.equal(p.act,null);assert.ok(w.zones.length<=32);p.team=3;step(w);assert.equal(w.zones.length,0);
});
test('restart during meteor windup cannot release a stale zone into new round',()=>{
 const{w,p}=fixture('meteor');cast(w);startStage(w,'S1');run(w,15);assert.equal(w.zones?.length||0,0);assert.notEqual(p.act?.id,'meteor');
});
test('manual cast point uses existing cursor distance, clamps range/arena and stays locked after movement',()=>{
 const{w,p}=fixture('meteor');step(w,{p:{...emptyInput(),skillEdge:true,aimX:80,aimY:0}});assert.deepEqual(p.act.zonePoint,{x:380,y:400});step(w,{p:{...emptyInput(),mx:1,aimX:600,aimY:0}});assert.deepEqual(p.act.zonePoint,{x:380,y:400});
 const f=fixture('firewall');f.p.x=1300;step(f.w,{p:{...emptyInput(),skillEdge:true,aimX:1000,aimY:0}});assert.deepEqual(f.p.act.zonePoint,{x:1400,y:400});
});
