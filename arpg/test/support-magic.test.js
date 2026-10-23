import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, addPlayer, spawnMonster, step, emptyInput, turnUndeadChance } from '../js/sim/world.js';
import { ABILITIES, MONSTERS } from '../js/content/combat.js';
import { rand, ticks } from '../js/sim/core.js';
import { ITEMS, instance } from '../js/meta/items.js';
import { createSave, validateSave } from '../js/meta/save.js';
import { trained } from './fixtures/trained.js';
import { deriveMods } from '../js/meta/stats.js';
import { learnSkill, setSlot } from '../js/meta/skills.js';
import { encodeSnapshot, decodeSnapshot } from '../js/net/protocol.js';
import { itemDetailsHtml } from '../js/ui/gear-view.js';
import { skillCardHtml } from '../js/ui/skill-view.js';
import { BALANCE as ATTACK_BASE_FIXTURE } from '../js/content/balance.js'; ATTACK_BASE_FIXTURE.attackBase = 1; // fixtures assume the unscaled player attack rate
const fixture = (skill='frost_lance', mods={}) => { const w=createWorld();const p=addPlayer(w,{pid:'p',weapon:'focus',x:500,y:400,mods:{skill,mpRegen:0,...mods}});return {w,p};};
const mob = (w,type='ghoul',x=570) => {const t=spawnMonster(w,type,x,400,{hpMult:10});t.spawnLeft=0;t.thinkLeft=10000;return t;};
const cast = (w,p,slot='skillEdge') => {const events=step(w,{[p.pid]:{...emptyInput(),[slot]:true}});for(let i=0;i<40;i++)events.push(...step(w));return events;};
function shot(w,src,t,id='frost_lance',damage=48,periodic=false) {
 const def={...ABILITIES[id],damage,knockback:0,poise:0};w.projectiles.push({id:w.nextId++,ownerId:src.id,ownerKind:src.kind,ownerType:src.weapon||src.type,team:src.team,abilityId:id,def,x:t.x-10,y:t.y,vx:300,vy:0,r:3,travelled:0,range:30,pierce:0,hit:[],dmgMult:1,poiseMult:1});return step(w);
}
const seedBelow = chance => {for(let seed=1;seed<100000;seed++)if(rand({rng:seed})<chance)return seed;throw Error('seed');};
test('staff affinity uses actual equipped item, rarity variants inherit, inventory and academy explain effects',()=>{
 const save=trained(createSave({name:'staff',weapon:'focus',answers:[0,0,0,0,0],createdAt:1}));
 for(const [id,element] of [['apprentice_wand',undefined],['ember_wand','fire'],['soulfire_wand','fire'],['seal_staff','frost'],['altar_staff','holy'],['gravekeeper_staff','holy']]){
  const it=instance('equipped-'+id,id);save.items.push(it);save.equipped.weapon=it.uid;
  assert.equal(deriveMods(save).staffAffinity,element,id);
  if(element){assert.equal(ITEMS[id+'_epic'].affinity,element);assert.match(itemDetailsHtml(it),/속성/);}
 }
 save.items.push(instance('bag-fire','ember_wand'));assert.equal(deriveMods(save).staffAffinity,'holy');
 assert.match(skillCardHtml('frost_lance',save),/빙결/);assert.match(skillCardHtml('ember_bolt',save),/화상/);
});
test('matching frost/fire staves boost only matching spells and holy boosts healing',()=>{
 for(const affinity of ['fire','frost',undefined])for(const id of ['ember_bolt','frost_lance']){
  const {w,p}=fixture(id,{staffAffinity:affinity});const t=mob(w);const events=cast(w,p);const expected=Math.round(ABILITIES[id].damage*(affinity===ABILITIES[id].element?1.25:1));
  assert.equal(events.find(e=>e.type==='hit'&&e.dst===t.id)?.dmg,expected,`${affinity}/${id}`);
 }
 const {w,p}=fixture('healing_light',{staffAffinity:'holy'});p.hp=1;const ally=addPlayer(w,{pid:'a',x:520,y:400});ally.hp=1;cast(w,p);assert.equal(ally.hp,37);
});
test('boss turn chance always below 1% including holy and INT extremes, bosses can execute',()=>{
 assert.equal(turnUndeadChance(30,true),.0016);assert.equal(turnUndeadChance(10000,true,true),.009);assert.ok(Math.abs(turnUndeadChance(0,false,true)-.15)<1e-12);assert.equal(turnUndeadChance(10000,false,true),.7);
 const {w,p}=fixture('turn_undead',{effectiveInt:10000,staffAffinity:'holy'});const t=mob(w);t.boss=true;t.frozenUntil=1000;w.rng=seedBelow(.009);
 const events=cast(w,p);assert.equal(t.dead,true);assert.equal(events.filter(e=>e.type==='kill').length,1);assert.ok(p.cds.turn_undead>0);assert.match(skillCardHtml('turn_undead',trained(createSave({name:'boss',weapon:'focus',answers:[0,0,0,0,0],createdAt:1}))),/보스.*0\./);
});
test('frost freezes from seeded valid hits, halts movement/attack, heavy direct hit breaks, small hit does not',()=>{
 const {w,p}=fixture();const t=mob(w,'goblin_grunt');w.rng=seedBelow(.3);shot(w,p,t);
 assert.ok(t.frozenUntil>w.tick);const x=t.x,y=t.y;for(let i=0;i<5;i++)step(w);assert.equal(t.x,x);assert.equal(t.y,y);assert.equal(t.act,null);
 shot(w,p,t,'focus_pulse',10);assert.ok(t.frozenUntil>w.tick);shot(w,p,t,'focus_pulse',100);assert.equal(t.frozenUntil,undefined);
});
test('boss freeze is short, expiry releases, invulnerable/dead/friendly hits do not apply or roll statuses',()=>{
 const {w,p}=fixture();const t=mob(w);t.boss=true;w.rng=seedBelow(.1);shot(w,p,t);assert.ok(t.frozenUntil-w.tick<=ticks(500));for(let i=0;i<20;i++)step(w);assert.equal(t.frozenUntil,undefined);
 w.entities=w.entities.filter(e=>e===p);const dummy=mob(w,'scarecrow',600);const control=structuredClone(w);step(control);shot(w,p,dummy);assert.equal(dummy.frozenUntil,undefined);assert.equal(w.rng,control.rng);
});
test('fire refreshes single burn, DOT credits kill, vulnerability applies and DOT never breaks freeze',()=>{
 const {w,p}=fixture('ember_bolt');const t=mob(w);shot(w,p,t,'ember_bolt',1);assert.ok(t.burn);const end=t.burn.expiresTick;shot(w,p,t,'ember_bolt',1);assert.ok(t.burn.expiresTick>end);
 const hp=t.hp;shot(w,p,t,'focus_pulse',20);assert.equal(hp-t.hp,22);
 t.frozenUntil=w.tick+100;for(let i=0;i<16;i++)step(w);assert.ok(t.frozenUntil>w.tick);assert.ok(t.hp<hp-22);
 t.hp=1;const events=[];for(let i=0;i<100;i++)events.push(...step(w));assert.equal(t.dead,true);assert.equal(t.burn,undefined);assert.equal(t.frozenUntil,undefined);assert.equal(events.filter(e=>e.type==='kill'&&e.id===t.id&&e.by===p.id).length,1);
});
test('shield party radius, mana/cooldown, dodge and iframes preserve it, Lv1 one damaging hostile hit breaks',()=>{
 const {w,p}=fixture('protective_shield');const ally=addPlayer(w,{pid:'a',x:540,y:400}),far=addPlayer(w,{pid:'far',x:900,y:400});const t=mob(w,'goblin_grunt',560);
 cast(w,p);assert.equal(p.mp,78);assert.ok(p.cds.protective_shield>0);assert.ok(p.shieldUntil>w.tick);assert.ok(ally.shieldUntil>w.tick);assert.equal(ally.shieldCharges,1);assert.equal(far.shieldUntil,undefined);
 ally.dodge.iframeLeft=4;shot(w,t,ally,'sling_stone',10);assert.ok(ally.shieldUntil>w.tick);ally.dodge.iframeLeft=0;ally.hurtInvuln=3;shot(w,t,ally,'sling_stone',10);assert.ok(ally.shieldUntil>w.tick);
 ally.hurtInvuln=0;const hp=ally.hp;const events=shot(w,t,ally,'sling_stone',10);assert.equal(ally.hp,hp);assert.equal(ally.shieldUntil,undefined);assert.ok(events.some(e=>e.type==='shieldBreak'));shot(w,t,ally,'sling_stone',10);assert.ok(ally.hp<hp);
 for(let i=0;i<250;i++)step(w);assert.equal(p.shieldUntil,undefined);
});
test('support three-slot build survives learning, equip, save validation, and snapshot statuses',()=>{
 let save=trained(createSave({name:'support',weapon:'focus',answers:[0,0,0,0,0],createdAt:1}));save.gold=1000;
 for(const [i,id]of ['healing_light','protective_shield','turn_undead'].entries()){save=learnSkill(save,id);save=setSlot(save,'focus',i,id);}assert.ok(validateSave(save));
 const {w,p}=fixture('healing_light',{...deriveMods(save),skills:save.loadout});assert.deepEqual(p.skills,save.loadout);cast(w,p,'skill2Edge');assert.ok(p.shieldUntil>w.tick);
 const t=mob(w);t.frozenUntil=w.tick+45;t.burn={expiresTick:w.tick+90,nextTick:w.tick+15};
 w.round={stageId:'S1',state:'running',pending:[],goal:'timer'};const guest=decodeSnapshot(encodeSnapshot(w),'p');assert.equal(guest.entities[0].shieldUntil,p.shieldUntil);assert.equal(guest.entities.find(e=>e.id===t.id).frozenUntil,t.frozenUntil);assert.equal(guest.entities.find(e=>e.id===t.id).burn.expiresTick,t.burn.expiresTick);
});
test('shield refreshes without stacking, canceled cast/death cannot shield, and expires on the authoritative tick',()=>{
 const {w,p}=fixture('protective_shield');cast(w,p);const first=p.shieldUntil;p.cds={};cast(w,p);assert.ok(p.shieldUntil>first);
 const until=p.shieldUntil;while(w.tick<until)step(w);step(w);assert.equal(p.shieldUntil,undefined);
 p.cds={};step(w,{p:{...emptyInput(),skillEdge:true}});p.dead=true;p.hp=0;for(let i=0;i<40;i++)step(w);assert.equal(p.shieldUntil,undefined);
});
test('burn emits six half-second ticks, scales with captured fire affinity, and never rolls critical or refreezes',()=>{
 const {w,p}=fixture('ember_bolt',{staffAffinity:'fire'});const t=mob(w,'ghoul',570);t.frozenUntil=10000;
 const events=cast(w,p);const direct=events.find(e=>e.type==='hit'&&e.dst===t.id);assert.equal(direct.dmg,75);
 const all=[...events];p.staffAffinity=undefined;p.dmgMult.focus=100;p.critChance=1;p.critMult=100;
 for(let i=0;i<110;i++)all.push(...step(w));const dots=all.filter(e=>e.type==='hit'&&e.dst===t.id&&e!==direct);
 assert.equal(dots.length,6);assert.ok(dots.every(e=>e.dmg===6&&!e.crit));assert.equal(t.burn,undefined);assert.ok(t.frozenUntil>w.tick);
});
test('guest party shield is host-only, snapshots deliver statuses, dropped/duplicate packets do not recast',async()=>{
 const [{CoopSession},{createMemoryTransport}]=await Promise.all([import('../js/net/session.js'),import('../js/net/loopback.js')]);
 const net=createMemoryTransport(),sessions={},events=[];
 for(const uid of ['host','guest']){
  const transport=net.connect(uid,(from,p)=>p.t==='action'?sessions[uid].action(p.action):sessions[uid].rt(from,p));
  sessions[uid]=new CoopSession({uid,host:'host',players:['host','guest'],config:{stageId:'S1',seed:1,threat:1},profile:{name:uid,level:1,weapon:'focus',mods:{skill:'protective_shield',mpRegen:0},threats:{S1:1}},...transport,onFrame:uid==='guest'?(_v,es)=>events.push(...es):()=>{}});
 }
 sessions.guest.update(34,emptyInput());const w=sessions.host.world;w.round.pending=[];
 const guest=w.entities.find(e=>e.pid==='guest');const send=sessions.host.sendRt;sessions.host.sendRt=()=>{};
 sessions.guest.update(34,{...emptyInput(),skillEdge:true});for(let i=0;i<40;i++)sessions.host.update(34,emptyInput());
 assert.equal(guest.mp,78);assert.ok(w.entities.filter(e=>e.kind==='player').every(e=>e.shieldUntil>w.tick));assert.equal(sessions.guest.world,null);
 const t=mob(w);t.frozenUntil=w.tick+30;t.burn={expiresTick:w.tick+90,nextTick:w.tick+15};
 sessions.host.sendRt=send;sessions.host.broadcast();w.tick++;sessions.host.broadcast();const view=sessions.guest.view();
 assert.equal(view.entities[0].mp,78);assert.equal(events.filter(e=>e.type==='shield'&&e.dst===guest.id).length,1);assert.ok(view.entities[0].shieldUntil>w.tick);assert.equal(view.entities.find(e=>e.id===t.id).burn.expiresTick,t.burn.expiresTick);assert.equal(view.entities.find(e=>e.id===t.id).frozenUntil,t.frozenUntil);
});
test('frozen targets remain fixed when overlapping bodies separate',()=>{
 const {w,p}=fixture();const t=mob(w);t.frozenUntil=100;const x=t.x,y=t.y;
 const other=mob(w,'ghoul',t.x+10);other.frozenUntil=100;step(w);assert.equal(t.x,x);assert.equal(t.y,y);
 p.x=t.x-10;step(w);assert.equal(t.x,x);assert.equal(t.y,y);
});
test('support skill detail sheets explain real targeting and non-damage effects without shape assumptions',async()=>{
 const {HubUI}=await import('../js/ui/hub.js');let save=trained(createSave({name:'sheets',weapon:'focus',answers:[0,0,0,0,0],createdAt:1}));save.gold=1000;for(const id of ['protective_shield','turn_undead'])save=learnSkill(save,id);
 const hub=Object.assign(Object.create(HubUI.prototype),{save,mountSheet(html){this.html=html;}});
 hub.openSkill('turn_undead');assert.match(hub.html,/160 px/);assert.match(hub.html,/가장 가까운 적 언데드/);assert.doesNotMatch(hub.html,/<dt>피해<\/dt><dd>0/);
 hub.openSkill('protective_shield');assert.match(hub.html,/160 px/);assert.match(hub.html,/8초/);assert.doesNotMatch(hub.html,/<dt>피해<\/dt><dd>0/);
});
test('old burn tick cannot claim a new cast mastery success before its direct hit',async()=>{
 const {trackMastery}=await import('../js/meta/skill-mastery.js');const {w,p}=fixture('ember_bolt');const target=mob(w);w.round={stageId:'S21'};const tracker={};
 trackMastery(tracker,[{type:'act',id:p.id,ability:'ember_bolt'},{type:'hit',src:p.id,dst:target.id,ability:'ember_bolt',periodic:true}],w,p.pid);assert.equal(tracker.skillMastery.ember_bolt||0,0);
 trackMastery(tracker,[{type:'hit',src:p.id,dst:target.id,ability:'ember_bolt'}],w,p.pid);assert.equal(tracker.skillMastery.ember_bolt,1);
});
test('only actual boss markers select boss execution and freeze rules; elite/heavy-poise alone stay normal',()=>{
 const seedBetween=(lo,hi)=>{for(let seed=1;seed<100000;seed++){const n=rand({rng:seed});if(n>=lo&&n<hi)return seed;}throw Error('seed');};
 const cases=[['heavyPoise',false],['elite',false],['eliteVariant',false],['entityBoss',true],['definitionBoss',true],['goblin_chief',true],['throne_dragon',true]];
 for(const [mode,boss]of cases){
  const type=['goblin_chief','throne_dragon'].includes(mode)?mode:'ghoul';const original=MONSTERS[type];
  MONSTERS[type]={...original,lifeState:'undead',...(mode==='heavyPoise'?{heavyPoise:true}:{}),...(mode==='elite'?{elite:true}:{}),...(mode==='definitionBoss'?{boss:true}:{})};
  try {
   const mark=t=>{if(mode==='entityBoss')t.boss=true;if(mode==='eliteVariant')t.eliteVariant=true;};
   const execute=fixture('turn_undead',{effectiveInt:10000,staffAffinity:'holy'}),target=mob(execute.w,type);mark(target);target.frozenUntil=10000;execute.w.rng=seedBetween(.1,.3);
   cast(execute.w,execute.p);assert.equal(target.dead,!boss,mode+' execution');
   const freeze=fixture(),frozen=mob(freeze.w,type,1000);mark(frozen);freeze.w.rng=seedBetween(.1,.3);shot(freeze.w,freeze.p,frozen);
   assert.equal(frozen.frozenUntil!==undefined,!boss,mode+' freeze chance');if(!boss)assert.equal(frozen.frozenUntil,freeze.w.tick-1+ticks(1500),mode+' normal duration');
   if(boss){freeze.w.rng=seedBelow(.1);shot(freeze.w,freeze.p,frozen);assert.equal(frozen.frozenUntil,freeze.w.tick-1+ticks(500),mode+' boss duration');}
  }finally{MONSTERS[type]=original;}
 }
});
