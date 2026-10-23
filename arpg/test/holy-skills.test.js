import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, addPlayer, spawnMonster, step, emptyInput } from '../js/sim/world.js';
import { ABILITIES, MONSTERS } from '../js/content/combat.js';
import { rand, ticks } from '../js/sim/core.js';
import { createSave, validateSave } from '../js/meta/save.js';
import { deriveMods, eff } from '../js/meta/stats.js';
import { learnSkill, equipSkill } from '../js/meta/skills.js';
import { trained } from './fixtures/trained.js';
import { BALANCE as ATTACK_BASE_FIXTURE } from '../js/content/balance.js'; ATTACK_BASE_FIXTURE.attackBase = 1; // fixtures assume the unscaled player attack rate
const fixture = (skill, int = 100) => { const world = createWorld(); const p = addPlayer(world, {pid:'p',weapon:'focus',x:500,y:400,mods:{skill,effectiveInt:int,mpRegen:0}}); return {world,p}; };
const mob = (w,type,x=550) => {const t=spawnMonster(w,type,x,400);t.spawnLeft=0;t.thinkLeft=1000; return t;};
const cast = (world,p) => { const events=step(world,{p:{...emptyInput(),skillEdge:true}}); for(let i=0;i<50;i++) events.push(...step(world));return events; };
test('heal harms hostile undead once and heals friendly skeleton players, not living or friendly monsters',()=>{
 const {world,p}=fixture('healing_light');p.hp=10; p.dmgMult.focus=2;
 const ally=addPlayer(world,{pid:'ally',x:520,y:400});ally.hp=10;ally.lifeState='undead';
 const undead=mob(world,'ghoul'),living=mob(world,'goblin_grunt',560),friendly=mob(world,'skeleton_minion',570);friendly.team=p.team;
 const events=cast(world,p);assert.equal(undead.hp,129);assert.equal(living.hp,62);assert.equal(friendly.hp,62);assert.equal(ally.hp,10+Math.round(30*(1+.04*eff(100))));assert.equal(p.hp,ally.hp);assert.equal(events.filter(e=>e.type==='hit'&&e.dst===undead.id).length,1);
});
test('turn undead consumes mana, executes one nearest undead on success and sets success cooldown',()=>{
 const {world,p}=fixture('turn_undead',120);const near=mob(world,'ghoul'),far=mob(world,'ghoul',570);mob(world,'goblin_grunt',510);
 // Select a seed whose first draw passes the capped 70% chance.
 world.rng=1;assert.ok(rand({rng:1})<.7);
 const events=cast(world,p);assert.equal(p.mp,76);assert.equal(near.dead,true);assert.equal(far.dead,false);assert.equal(events.filter(e=>e.type==='kill').length,1);assert.equal(events.filter(e=>e.type==='hit').length,1);assert.ok(p.cds.turn_undead>0);assert.equal(events.filter(e=>e.type==='turnUndead'&&e.success).length,1);
});
test('failed or missing turn target has no cooldown, consumes MP, and never damages living creatures',()=>{
 for(const eligible of [false,true]) { const {world,p}=fixture('turn_undead',0); const t=mob(world,eligible?'ghoul':'goblin_grunt');world.rng=1;
 const events=cast(world,p);assert.equal(p.mp,76);assert.equal(p.cds.turn_undead||0,0);assert.equal(t.dead,false);assert.equal(events.filter(e=>e.type==='hit').length,0);assert.equal(events.filter(e=>e.type==='turnUndead'&&!e.success).length,1); }
});
test('effective INT reaches simulation; academy book and three-slot save work',()=>{
 const save=trained(createSave({name:'holy',answers:[0,0,0,0,0],weapon:'focus',createdAt:1}));save.gold=500;
 assert.equal(deriveMods(save).effectiveInt,save.stats.int+6);const learned=learnSkill(save,'turn_undead'),equipped=equipSkill(learned,'focus','turn_undead');assert.ok(equipped.loadout.includes('turn_undead'));assert.ok(validateSave(equipped));assert.equal(learned.gold,300);assert.equal(ABILITIES.turn_undead.manaCost,24);
});

test('chance rises with effective INT, caps at 70%, clamps invalid input',async()=>{
 const {turnUndeadChance}=await import('../js/sim/world.js');
 assert.deepEqual([0,30,60,120,1000].map(value=>turnUndeadChance(value)),[.1,.25,.4,.7,.7]);
 for(const invalid of [NaN,Infinity,-1,undefined])assert.equal(turnUndeadChance(invalid),.1);
});
test('delivery samples range/life state, avoids invulnerable targets, no irrelevant RNG draw',()=>{
 for(const mode of ['living','outside','dead','invulnerable']){
 const {world,p}=fixture('turn_undead',1000);const t=mob(world,mode==='living'?'goblin_grunt':'ghoul');
 if(mode==='outside')t.x=1000;if(mode==='dead'){t.dead=true;t.hp=0;}if(mode==='boss')t.boss=true;if(mode==='invulnerable')MONSTERS.ghoul.invulnerable=true;
 const control=structuredClone(world);const events=cast(world,p);for(let i=0;i<51;i++)step(control);assert.equal(p.cds.turn_undead||0,0,mode);assert.equal(events.filter(e=>e.type==='kill').length,0,mode);assert.equal(world.rng,control.rng,mode);delete MONSTERS.ghoul.invulnerable;
 }
});
test('equal-distance stable ID selection, successful exact HP ignores critical RNG and exposure; success CD starts after recovery',()=>{
 const {world,p}=fixture('turn_undead',1000);p.critChance=1;p.critMult=100;p.cdMult=.5;
 const a=mob(world,'ghoul',550),b=mob(world,'ghoul',450);a.staggerLeft=1000;world.rng=1;
 const events=step(world,{p:{...emptyInput(),skillEdge:true}});while(p.act){events.push(...step(world));if(p.act)assert.equal(p.cds.turn_undead||0,0);}
 assert.equal(a.dead,true);assert.equal(b.dead,false);const hit=events.find(e=>e.type==='hit');assert.equal(hit.dmg,225);assert.equal(hit.crit,undefined);assert.equal(p.cds.turn_undead,ticks(4000));
 assert.equal(events.filter(e=>e.type==='kill').length,1);
});
test('delivery does not execute a target that left radius during cast',()=>{
 const {world,p}=fixture('turn_undead',1000);const t=mob(world,'ghoul');step(world,{p:{...emptyInput(),skillEdge:true}});t.x=800;
 for(let i=0;i<60;i++)step(world);assert.equal(t.dead,false);assert.equal(p.cds.turn_undead||0,0);assert.equal(p.mp,76);
});

test('guest execution remains host-only; duplicate/lost snapshots do not duplicate damage, kill or success cooldown',async()=>{
 const [{CoopSession},{createMemoryTransport}]=await Promise.all([import('../js/net/session.js'),import('../js/net/loopback.js')]);
 const net=createMemoryTransport(),sessions={},events={host:[],guest:[]};
 for(const uid of ['host','guest']){
 const transport=net.connect(uid,(from,p)=>p.t==='action'?sessions[uid].action(p.action):sessions[uid].rt(from,p));
 sessions[uid]=new CoopSession({uid,host:'host',players:['host','guest'],config:{stageId:'S1',seed:1,threat:1},profile:{name:uid,level:1,weapon:'focus',mods:{skill:'turn_undead',effectiveInt:120,mpRegen:0},threats:{S1:1}},...transport,onFrame:(view,es)=>events[uid].push(...es)});
 }
 sessions.guest.update(34,emptyInput());const world=sessions.host.world;const guest=world.entities.find(e=>e.pid==='guest');
 world.round.pending=[];const t=mob(world,'ghoul',guest.x+50);t.y=guest.y;t.staggerLeft=1000;world.rng=1;
 const send=sessions.host.sendRt;sessions.host.sendRt=()=>{};sessions.guest.update(34,{...emptyInput(),skillEdge:true});
 for(let i=0;i<45;i++)sessions.host.update(34,emptyInput());
 assert.equal(t.dead,true);assert.equal(guest.mp,76);assert.ok(guest.cds.turn_undead>0);assert.equal(events.guest.filter(e=>e.type==='kill'&&e.id===t.id).length,0);
 sessions.host.sendRt=send;sessions.host.broadcast();world.tick++;sessions.host.broadcast();
 assert.equal(events.guest.filter(e=>e.type==='kill'&&e.id===t.id).length,1);assert.equal(events.guest.filter(e=>e.type==='hit'&&e.dst===t.id).length,1);assert.equal(sessions.guest.world,null);
 assert.equal(sessions.guest.view().entities[0].mp,76);assert.ok(sessions.guest.view().entities[0].cds.turn_undead>0);
});

test('holy kills produce one XP-bearing kill and mastery success; failed execution grants none',async()=>{
 const {trackMastery}=await import('../js/meta/skill-mastery.js');
 for(const [skill,int,success] of [['healing_light',120,true],['turn_undead',120,true],['turn_undead',0,false]]){
 const {world,p}=fixture(skill,int);const t=mob(world,'ghoul');t.hp=20;t.staggerLeft=1000;world.rng=1;
 const events=cast(world,p);const tracker={};trackMastery(tracker,events,{entities:world.entities,round:{stageId:'S21'}},p.pid);
 assert.equal(events.filter(e=>e.type==='kill').length,Number(success));if(success)assert.equal(events.find(e=>e.type==='kill').xp,12);
 assert.equal(tracker.skillMastery[skill]||0,Number(success));
 }
});
