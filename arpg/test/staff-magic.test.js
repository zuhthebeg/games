import test from 'node:test';
import assert from 'node:assert/strict';
import {ABILITIES, canUseSkill} from '../js/content/combat.js';
import {createWorld, addPlayer, step, emptyInput} from '../js/sim/world.js';
import {predictPlayerTick} from '../js/net/player-prediction.js';
import {skillCardHtml, weaponWarnHtml} from '../js/ui/skill-view.js';
import {weaponLoadoutCandidate} from '../js/meta/skills.js';
import {equip} from '../js/meta/items.js';
import {validateSave, SaveStore} from '../js/meta/save.js';
import {trained} from './weapon-loadout-fixture.js';

for (const id of ['turn_undead','flame_ring']) {
 test(`${id} requires wand/staff but ordinary magic remains usable with blade/bow`,()=>{
  for(const weapon of ['blade','bow']) assert.equal(canUseSkill(id,weapon),false);
  for(const form of ['wand','staff']) assert.equal(canUseSkill(id,'focus',form),true);
  for(const weapon of ['blade','bow','focus']) for(const ordinary of ['ember_bolt','frost_lance','healing_light','protective_shield']) assert.equal(canUseSkill(ordinary,weapon),true);
 });
 test(`${id} blocked host and guest inputs consume no MP/cooldown, cast or RNG in any slot`,()=>{
  for(const weapon of ['blade','bow']) for(let slot=0;slot<3;slot++) {
   const w=createWorld({seed:17}), skills=[null,null,null];skills[slot]=id;
   const p=addPlayer(w,{pid:'p',weapon,x:500,y:400,mods:{skills,mpRegen:0}});
   const predicted=structuredClone(p), control=structuredClone(w);
   const input={...emptyInput(),[['skillEdge','skill2Edge','skill3Edge'][slot]]:true};
   const prediction=predictPlayerTick(predicted,input,{arena:w.arena});
   const events=step(w,{p:input});step(control);
   assert.equal(p.mp,100);assert.equal(prediction.mp,100);assert.equal(p.act,null);assert.equal(prediction.act,null);
   assert.equal(events.some(e=>e.type==='act'),false);assert.equal(w.rng,control.rng);assert.equal(w.projectiles.length,0);assert.ok(!p.cds[id]);
  }
 });
 test(`${id} focus cast pays usual MP and produces requested act`,()=>{
  for(const form of ['wand','staff']) {
   const w=createWorld(),p=addPlayer(w,{pid:'p',weapon:'focus',mods:{skills:[id],weaponForm:form,mpRegen:0}});
   const events=step(w,{p:{...emptyInput(),skillEdge:true}});
   assert.equal(p.mp,100-ABILITIES[id].manaCost);assert.ok(events.some(e=>e.type==='act'&&e.ability===id));
  }
 });
}
test('staff-only spell remembers blocked weapon loadouts without deleting learned skills or refunding books',()=>{
 let s=trained();s.loadout=['turn_undead','flame_ring','protective_shield'];
 s.weaponLoadouts={'blade:sword':['turn_undead','flame_ring','protective_shield']};s.equipped.weapon='wand';
 const before=structuredClone(s);s=weaponLoadoutCandidate(s,equip(s,'sword')).save;
 assert.deepEqual(s.loadout,before.weaponLoadouts['blade:sword']);assert.deepEqual(s.learned,before.learned);assert.equal(s.gold,before.gold);assert.ok(validateSave(s));
 const storage=new Map(),store=new SaveStore({getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)});store.save(s);assert.deepEqual(store.load().weaponLoadouts,s.weaponLoadouts);
});
test('skill UI explains staff requirement and shield exemption without preventing learning',()=>{
 const s=trained();s.equipped.weapon='sword';
 for(const id of ['turn_undead','flame_ring']) {
  assert.match(skillCardHtml(id,s),/지팡이 필수/);assert.match(weaponWarnHtml(id,s),/지팡이 100%/);
  assert.doesNotMatch(weaponWarnHtml(id,s),/검 60%|활 60%/);
 }
 assert.match(weaponWarnHtml('protective_shield',s),/100%/);
});

import {ITEMS, instance} from '../js/meta/items.js';
import {effectiveStats, deriveMods, eff} from '../js/meta/stats.js';
import {BALANCE} from '../js/content/balance.js';
import {itemDetailsHtml} from '../js/ui/gear-view.js';
import {spawnMonster} from '../js/sim/world.js';
const cast = (w,p) => {const events=[];for(let i=0;i<40;i++)events.push(...step(w,{[p.pid]:{...emptyInput(),skillEdge:i===0}}));return events;};
test('all real focus item forms and rarity variants carry innate +6 INT/WIS; only equipped definitions contribute once',()=>{
 let s=trained(),raw=structuredClone(s.stats);s.equipped.weapon='sword';const plain=effectiveStats(s);
 for(const [id,def] of Object.entries(ITEMS).filter(([,d])=>d.family==='focus')) {
  assert.deepEqual(def.innateStats,{int:6,wis:6},id);
  const it=instance('new',id);it.enhance=9;it.affixes=[{k:'int_flat',v:3},{k:'wis_flat',v:4}];s.items.push(it);s.equipped.weapon='new';
  assert.equal(effectiveStats(s).int,plain.int+9,id);assert.equal(effectiveStats(s).wis,plain.wis+10,id);
  assert.match(itemDetailsHtml(it),/지능.*\+6/);assert.match(itemDetailsHtml(it),/지혜.*\+6/);
  assert.deepEqual(s.stats,raw);s.items.pop();
 }
 for(let i=0;i<5;i++) {s=equip(s,'wand');assert.equal(effectiveStats(s).int,plain.int+6);s=equip(s,'sword');assert.deepEqual(effectiveStats(s),plain);}
 assert.deepEqual(s.stats,raw);
});
test('staff INT/WIS naturally raise real magic, MP and regen; cross-family damage still applies exactly once',()=>{
 const s=trained();s.level=1;s.stats={...s.stats,int:10,wis:10};
 for(const [uid,id,family] of [['sword','training_sword','blade'],['bow','short_bow','bow'],['wand','apprentice_wand','focus']]) {
  s.equipped.weapon=uid;const m=deriveMods(s),int=family==='focus'?16:10;
  assert.equal(m.effectiveInt,int);assert.equal(m.dmgMult.focus,ITEMS[id].power*(family==='focus'?1:.6)*(1+BALANCE.stats.focusDamage*eff(int)));
  const w=createWorld(),p=addPlayer(w,{pid:'p',weapon:family,x:500,y:400,mods:{...m,skills:['ember_bolt'],critChance:0,mpRegen:0}}),t=spawnMonster(w,'ghoul',570,400,{hpMult:100});t.spawnLeft=0;t.thinkLeft=10000;
  assert.equal(cast(w,p).find(e=>e.type==='hit'&&e.dst===t.id).dmg,Math.round(60*m.dmgMult.focus));
 }
 s.equipped.weapon='sword';const sword=deriveMods(s);s.equipped.weapon='wand';const wand=deriveMods(s);assert.ok(wand.maxMp>sword.maxMp);assert.ok(wand.mpRegen>sword.mpRegen);
});
test('real healing scales by effective INT only (not weapon power/share), holy once and missing HP cap',()=>{
 for(const weapon of ['blade','bow','focus']) for(const intelligence of [10,100]) for(const holy of [false,true]) {
  const w=createWorld(),p=addPlayer(w,{pid:'p',weapon,x:500,y:400,mods:{skills:['healing_light'],effectiveInt:intelligence,staffAffinity:holy?'holy':undefined,dmgMult:{focus:99},mpRegen:0}});
  const ally=addPlayer(w,{pid:'a',x:520,y:400,mods:{maxHp:1000}});ally.hp=1;
  cast(w,p);assert.equal(ally.hp,1+Math.round(300*(1+BALANCE.stats.focusDamage*eff(intelligence))*(holy?1.2:1)));
  p.cds={};ally.hp=999.5;cast(w,p);assert.equal(ally.hp,1000);
 }
});
test('INT and weapon family never amplify or weaken shield radius, duration, MP or block count',()=>{
 for(const weapon of ['blade','bow','focus']) for(const effectiveInt of [10,100]) {
  const w=createWorld(),p=addPlayer(w,{pid:'p',weapon,x:500,y:400,mods:{skills:['protective_shield'],effectiveInt,mpRegen:0}});
  const near=addPlayer(w,{pid:'a',x:659,y:400}),far=addPlayer(w,{pid:'b',x:661,y:400});
  const events=cast(w,p),shield=events.find(e=>e.type==='shield'&&e.dst===near.id);assert.ok(shield);assert.equal(far.shieldUntil,undefined);assert.equal(p.mp,78);
  assert.ok(near.shieldUntil>w.tick);assert.equal(ABILITIES.protective_shield.shield.durationMs,8000);
 }
});

test('healing light hostile undead damage keeps source magic share exactly once while healing uses INT only',()=>{
 for(const weapon of ['blade','bow','focus']) {
  const s=trained();s.level=1;s.stats.int=100;s.equipped.weapon={blade:'sword',bow:'bow',focus:'wand'}[weapon];const mods=deriveMods(s);
  const w=createWorld(),p=addPlayer(w,{pid:'p',weapon,x:500,y:400,mods:{...mods,skills:['healing_light'],mpRegen:0,critChance:0}}),t=spawnMonster(w,'ghoul',550,400,{hpMult:10});t.spawnLeft=0;t.thinkLeft=10000;
  assert.equal(cast(w,p).find(e=>e.type==='hit'&&e.dst===t.id).dmg,Math.round(48*mods.dmgMult.focus));
 }
});
test('learning staff-only spells with sword is allowed and preserves ordinary stat/price requirements',async()=>{
 const {learnSkill}=await import('../js/meta/skills.js');let s=trained();s.equipped.weapon='sword';s.learned=[];s.loadout=['lunge',null,null];s.statPoints-=45-s.stats.int;s.stats.int=45;
 const raw=structuredClone(s.stats);
 for(const id of ['turn_undead','flame_ring']) {const before=s.gold;s=learnSkill(s,id);assert.ok(s.learned.includes(id));assert.ok(s.gold<before);}
 assert.deepEqual(s.stats,raw);assert.ok(validateSave(s));
});
test('actual guest staff-locked requests are rejected by host, while guest INT healing settles once and snapshots carry HP',async()=>{
 const [{CoopSession},{createMemoryTransport}]=await Promise.all([import('../js/net/session.js'),import('../js/net/loopback.js')]);
 const net=createMemoryTransport(),sessions={};
 for(const uid of ['host','guest']) {
  const transport=net.connect(uid,(from,p)=>p.t==='action'?sessions[uid].action(p.action):sessions[uid].rt(from,p));
  sessions[uid]=new CoopSession({uid,host:'host',players:['host','guest'],config:{stageId:'S1',seed:1,threat:1},profile:{name:uid,level:1,weapon:'blade',mods:{skills:['turn_undead','flame_ring','healing_light'],effectiveInt:100,mpRegen:0},threats:{S1:1}},...transport});
 }
 sessions.guest.update(34,emptyInput());const w=sessions.host.world;w.round.pending=[];
 const h=w.entities.find(e=>e.pid==='host'),g=w.entities.find(e=>e.pid==='guest');h.hp=1;g.hp=1;
 for(const edge of ['skillEdge','skill2Edge']) {sessions.guest.update(34,{...emptyInput(),[edge]:true});for(let i=0;i<40;i++)sessions.host.update(34,emptyInput());assert.equal(g.mp,100);assert.equal(g.act,null);assert.ok(!g.cds.turn_undead&&!g.cds.flame_ring);}
 sessions.guest.update(34,{...emptyInput(),skill3Edge:true});for(let i=0;i<40;i++)sessions.host.update(34,emptyInput());assert.equal(g.mp,72);assert.equal(g.hp,42);assert.equal(h.hp,42);
 sessions.host.broadcast();w.tick++;sessions.host.broadcast();assert.equal(sessions.guest.world,null);assert.equal(sessions.guest.view().entities.find(e=>e.pid==='guest').hp,42);
});
