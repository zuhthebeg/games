import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as combat from '../js/content/combat.js';
import {createWorld,addPlayer,startStage,spawnMonster,step,emptyInput,turnUndeadChance} from '../js/sim/world.js';
import {encodeSnapshot,decodeSnapshot} from '../js/net/protocol.js';
import {predictPlayerTick} from '../js/net/player-prediction.js';
import {combatRun,historicalDamage,ORDINARY_CASES} from './fixtures/silver-combat.js';
const pair={revenant_blade:'silver_blade',ossuary_maul:'silver_maul',bone_bow:'silver_bow',soulfire_wand:'silver_wand',gravekeeper_staff:'silver_staff'};
test('C shared silver multiplier classifies weapon hits only, not living/heal/turn/spells/DOT',()=>{
 assert.equal(combat.SILVER_UNDEAD_MULTIPLIER,1.5);assert.equal(typeof combat.weaponAttackMultiplier,'function');
 for(const [id,def]of Object.entries(combat.ABILITIES)){
  const eligible=(def.family==='blade'||def.family==='bow'||id==='focus_pulse')&&id!=='shield_bash'&&!def.heal&&!def.executeUndead&&!def.shield;
  assert.equal(combat.weaponAttackMultiplier(true,id,'undead'),eligible?1.5:1,id);
  assert.equal(combat.weaponAttackMultiplier(true,id,'living'),1,id);assert.equal(combat.weaponAttackMultiplier(false,id,'undead'),1,id);
 }
});
test('C actual weapon basics/skills boost undead only; focus spells, healing, turn and DOT unchanged',()=>{
 for(const [base,ability]of ORDINARY_CASES)for(const target of ['ghoul','goblin_grunt']){
  const old=combatRun(base,ability,target),silver=combatRun(pair[base],ability,target);
  const hits=old.events.filter(e=>e.type==='hit'),newHits=silver.events.filter(e=>e.type==='hit');assert.equal(newHits.length,hits.length,`${base}/${ability}/${target}`);
  const id=ability==='basic'?combat.WEAPONS[old.p.weapon].basic:ability;
  const eligible=(combat.ABILITIES[id].family!=='focus'||id==='focus_pulse')&&id!=='shield_bash'&&!combat.ABILITIES[id].heal&&!combat.ABILITIES[id].executeUndead&&!combat.ABILITIES[id].shield;
  for(let i=0;i<hits.length;i++){
   if(target==='ghoul'&&eligible&&!hits[i].periodic)assert.ok(Math.abs(newHits[i].dmg-hits[i].dmg*1.5)<=1,`${base}/${ability}: ${hits[i].dmg} -> ${newHits[i].dmg}`);
   else assert.deepEqual(newHits[i],hits[i],`${base}/${ability}/${target}`);
  }
  if(!eligible||target!=='ghoul')assert.deepEqual(silver.events,old.events);
  assert.equal(silver.rng,old.rng);
 }
 for(const boss of [false,true])for(const seed of [1,9,123,9876])assert.deepEqual(combatRun('silver_staff','turn_undead','ghoul',seed,{boss}).events,combatRun('gravekeeper_staff','turn_undead','ghoul',seed,{boss}).events);
 assert.equal(turnUndeadChance(10000,true,true),.009);
});
test('C non-silver damage/event/RNG traces remain exactly historical across 800 seeded real casts',()=>{
 const hash=createHash('sha256').update(JSON.stringify(historicalDamage())).digest('hex');console.log('C historical non-silver damage SHA256',hash);assert.equal(hash,'8a9df5a6379d8e5182a77ed4bed6619dbc1b671b41553fe4f5f67f92141a8cd3');
});
for(const [base,silver]of Object.entries(pair))test(`C ${silver}: same-seed host determinism and snapshot prediction every tick`,()=>{
 const mods=combatRun(silver,'basic').mods;assert.equal(mods.silverWeapon,true);
 const setup=()=>{const w=createWorld({seed:777,multiplayerDodge:true});const p=addPlayer(w,{pid:'g',weapon:mods.family,x:400,y:400,mods:{...mods,skills:[combat.WEAPONS[mods.family].skill]}});startStage(w,'S2');w.entities=w.entities.filter(e=>e.kind==='player');w.round.pending=[];w.round.goal='timer';w.round.timerTicks=1e6;const t=spawnMonster(w,'ghoul',1300,100,{hpMult:1000});t.spawnLeft=0;t.thinkLeft=100000;t.frozenUntil=100000;return{w,p};};
 const a=setup(),b=setup();assert.equal(a.p.silverWeapon,true);
 for(let tick=0;tick<600;tick++){
  const inp={...emptyInput(),mx:tick%100<20?.3:0,my:tick%97<15?.2:0,aimX:1,attack:tick%50<25,skillEdge:tick%150===0,dodgeEdge:tick%123===5};
  const packet=encodeSnapshot(a.w,{g:tick}),view=decodeSnapshot(JSON.parse(JSON.stringify(packet)),'g'),before=view.entities[0];assert.equal(before.silverWeapon,true);
  const predicted=predictPlayerTick(before,inp,{arena:a.w.arena,others:view.entities.slice(1),tick:a.w.tick,multiplayerDodge:true});assert.equal(predicted.silverWeapon,a.p.silverWeapon);
  for(const id of ['slash','arrow','focus_pulse','healing_light','turn_undead','ember_bolt'])assert.equal(combat.weaponAttackMultiplier(predicted.silverWeapon,id,'undead'),combat.weaponAttackMultiplier(a.p.silverWeapon,id,'undead'));
  const ea=step(a.w,{g:inp}),eb=step(b.w,{g:inp});assert.deepEqual(ea,eb);assert.deepEqual(a.w,b.w);
  assert.ok(Math.abs(predicted.x-a.p.x)<=.0051&&Math.abs(predicted.y-a.p.y)<=.0051,`${silver}/${tick}`);
  for(const key of ['phase','left','id'])assert.equal(predicted.act?.[key],a.p.act?.[key],`${silver}/${tick}/${key}`);
  assert.equal(predicted.dodge.cdLeft,a.p.dodge.cdLeft);assert.equal(predicted.dodge.iframeLeft,a.p.dodge.iframeLeft);assert.equal(predicted.mp,a.p.mp);
 }
});

test('C 800 actual silver casts remain same-seed same-tick deterministic including hits, statuses and turn attempts',()=>{
 for(const[base,ability]of ORDINARY_CASES)for(const target of ['ghoul','goblin_grunt'])for(let seed=1;seed<=20;seed++){
  const a=combatRun(pair[base],ability,target,seed),b=combatRun(pair[base],ability,target,seed);assert.deepEqual(a.w,b.w);assert.deepEqual(a.events,b.events);
 }
});
test('C guest silver attack is resolved only by host and delivered as identical authoritative damage/capability',async()=>{
 const[{CoopSession},{createMemoryTransport}]=await Promise.all([import('../js/net/session.js'),import('../js/net/loopback.js')]);
 const net=createMemoryTransport(),sessions={},events=[],mods=combatRun('silver_bow','basic').mods;
 for(const uid of ['host','guest']){const transport=net.connect(uid,(from,p)=>p.t==='action'?sessions[uid].action(p.action):sessions[uid].rt(from,p));sessions[uid]=new CoopSession({uid,host:'host',players:['host','guest'],config:{stageId:'S21',seed:555,threat:1},profile:{name:uid,level:30,weapon:'bow',mods,threats:{S21:1}},...transport,onFrame:uid==='guest'?(_view,es)=>events.push(...es):()=>{}});}
 sessions.guest.update(34,emptyInput());const w=sessions.host.world;w.round.pending=[];w.entities=w.entities.filter(e=>e.kind==='player');const p=w.entities.find(e=>e.pid==='guest');p.x=500;p.y=400;const target=spawnMonster(w,'ghoul',600,400,{hpMult:1000});target.spawnLeft=0;target.thinkLeft=100000;target.frozenUntil=100000;
 sessions.guest.update(34,{...emptyInput(),aimX:1,attack:true});for(let i=0;i<50;i++)sessions.host.update(34,emptyInput());
 const hit=events.find(e=>e.type==='hit'&&e.src===p.id&&e.dst===target.id);assert.ok(hit);assert.equal(hit.dmg,Math.round(combat.ABILITIES.arrow.damage*mods.dmgMult.bow*1.5));assert.equal(sessions.guest.world,null);assert.equal(sessions.guest.view().entities[0].silverWeapon,true);
});

test('C silver sword counter followup reuses 70% of already boosted first damage exactly once',()=>{
 for(const silverWeapon of [false,true]){
  const w=createWorld(),p=addPlayer(w,{pid:'p',weapon:'blade',x:500,y:400,mods:{silverWeapon,mpRegen:0}}),t=spawnMonster(w,'ghoul',550,400,{hpMult:1000});t.spawnLeft=0;t.thinkLeft=100000;t.frozenUntil=100000;p.pendingCounter={attackerId:t.id,dodgeTick:0,expiresTick:100};const events=[];
  for(let i=0;i<60;i++){t.x=550;t.kx=0;t.ky=0;events.push(...step(w));}
  const hits=events.filter(e=>e.type==='hit'&&e.dst===t.id);assert.equal(hits.length,2);assert.equal(hits[0].dmg,Math.round(combat.ABILITIES.slash.damage*2.2*(silverWeapon?1.5:1)));assert.equal(hits[1].dmg,Math.round(hits[0].dmg*.7));
 }
});
