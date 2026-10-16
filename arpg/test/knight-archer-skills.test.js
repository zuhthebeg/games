import test from 'node:test';
import assert from 'node:assert/strict';
import {ABILITIES,MONSTERS} from '../js/content/combat.js';
import {createWorld,addPlayer,spawnMonster,startStage,step,emptyInput} from '../js/sim/world.js';
import {ticks} from '../js/sim/core.js';
import {encodeSnapshot,decodeSnapshot} from '../js/net/protocol.js';
import {predictPlayerTick} from '../js/net/player-prediction.js';
import {createSave,SaveStore} from '../js/meta/save.js';
import {BOOKS,learnSkill,setSlot,loadoutOf,characterSkills} from '../js/meta/skills.js';
import {skillCardHtml,skillIcon} from '../js/ui/skill-view.js';
import {trained} from './fixtures/trained.js';
const press={...emptyInput(),skillEdge:true,aimX:1};
function scene(id,weapon='bow') {
 const w=createWorld();const p=addPlayer(w,{pid:'a',weapon,x:400,y:400,mods:{skills:[id,null,null],weaponForm:weapon==='blade'?'blunt':undefined,maxMp:200,mpRegen:0}});
 startStage(w,'S2');w.round.pending=[];w.round.goal='timer';w.round.timerTicks=1e6;return {w,p};
}
function target(w,x=470,type='goblin_grunt'){const m=spawnMonster(w,type,x,400);m.spawnLeft=0;m.thinkLeft=1e6;m.hp=m.maxHp=10000;m.poise=m.maxPoise=10000;return m;}
function cast(w,p){let ev=[...step(w,{a:press})];for(let n=0;p.act&&n<100;n++)ev.push(...step(w));return ev;}
test('knight keeps lunge ID, ground slam slows real movement 35%, refreshes, expires and snapshots',()=>{
 assert.equal(ABILITIES.lunge.name,'돌진 공격');
 const {w,p}=scene('ground_slam','blade');const m=target(w);cast(w,p);assert.ok(m.slow);assert.equal(m.slow.speedMult,.65);
 const expiry=m.slow.expiresTick;assert.deepEqual(decodeSnapshot(encodeSnapshot(w),'a').entities.find(e=>e.id===m.id).slow,m.slow);
 m.x=800;m.y=400;m.kx=m.ky=0;const before=m.x;step(w);assert.ok(Math.abs((before-m.x)-ABILITIES.ground_slam.slow.speedMult*MONSTERS.goblin_grunt.speed/30)<1e-8);
 m.x=470;p.cds.ground_slam=0;cast(w,p);assert.ok(m.slow.expiresTick>expiry);assert.equal(m.slow.speedMult,.65);
 const until=m.slow.expiresTick;while(w.tick<=until)step(w);assert.equal(m.slow,undefined);
 m.x=800;m.y=400;m.kx=m.ky=0;const normal=m.x;step(w);assert.ok(Math.abs((normal-m.x)-MONSTERS.goblin_grunt.speed/30)<1e-8);
});
test('triple arrow emits exactly three collinear shots on distinct 100ms ticks with one payment',()=>{
 const {w,p}=scene('triple_arrow');assert.equal(p.skills[0],'triple_arrow');const shots=[];let ev=step(w,{a:press});
 for(let i=0;i<50;i++){if(ev.some(e=>e.type==='projectile'&&e.ability==='triple_arrow'))shots.push(w.tick-1);ev=step(w);}
 assert.equal(shots.length,3);assert.deepEqual(shots.slice(1).map((n,i)=>n-shots[i]),[ticks(100),ticks(100)]);
 assert.equal(p.mp,200-ABILITIES.triple_arrow.manaCost);assert.ok(p.cds.triple_arrow>0);
 assert.ok(w.projectiles.every(pr=>pr.abilityId!=='triple_arrow'||Math.abs(pr.vy)<1e-9));
});
test('interrupting triple arrow cancels its remaining shots',()=>{
 const {w,p}=scene('triple_arrow');assert.equal(p.skills[0],'triple_arrow');let ev=step(w,{a:press});while(!ev.some(e=>e.type==='projectile'))ev=step(w);
 const interrupted=step(w,{a:{...emptyInput(),dodgeEdge:true,mx:-1}});assert.ok(interrupted.some(e=>e.type==='actCancel'&&e.ability==='triple_arrow'));const events=[];for(let i=0;i<30;i++)events.push(...step(w));assert.equal(events.filter(e=>e.type==='projectile').length,0);
});
test('evasion shot uses real dodge movement/iframes, aims independently and rejects unavailable dodge',()=>{
 const {w,p}=scene('evasion_shot');const ev=step(w,{a:{...press,mx:-1}});
 assert.ok(p.x<400);assert.ok(p.dodge.iframeLeft>0);assert.ok(p.dodge.cdLeft>0);assert.equal(p.dodge.perfectPaid,false);assert.equal(p.pendingCounter,null);
 assert.equal(ev.filter(e=>e.type==='dodge').length,1);assert.equal(ev.filter(e=>e.type==='projectile'&&e.ability==='evasion_shot').length,1);
 assert.ok(w.projectiles[0].vx>0);assert.equal(p.mp,200-ABILITIES.evasion_shot.manaCost);
 for(const blocked of ['cd','disabled','mana']){const s=scene('evasion_shot');if(blocked==='cd')s.p.dodge.cdLeft=10;if(blocked==='disabled')s.p.dodgeDisabled=true;if(blocked==='mana')s.p.mp=0;
  const before=s.p.mp;assert.equal(step(s.w,{a:press}).some(e=>e.type==='dodge'||e.type==='projectile'),false);assert.equal(s.p.mp,before);}
});
test('guest predicts evasion shot motion and cooldown only, host owns projectiles and snapshot slow',()=>{
 const {w,p}=scene('evasion_shot');const view=decodeSnapshot(encodeSnapshot(w),'a'),input={...press,mx:-1};
 const predicted=predictPlayerTick(view.entities[0],input,{arena:w.arena,tick:w.tick});assert.equal(view.projectiles.length,0);
 step(w,{a:input});assert.equal(predicted.x,p.x);assert.equal(predicted.dodge.iframeLeft,p.dodge.iframeLeft);assert.equal(predicted.mp,p.mp);
 assert.equal(w.projectiles.length,1);assert.equal(decodeSnapshot(encodeSnapshot(w),'a').projectiles[0].abilityId,'evasion_shot');
});
test('both additional bow books learn, show icons/grades/details and survive equipped save reload',()=>{
 let save=trained({...createSave({name:'궁수',answers:[0,0,0,0,0],weapon:'bow',createdAt:1}),gold:10000},30);save.stats.agi=45;
 for(const [i,id] of ['triple_arrow','evasion_shot'].entries()) {assert.ok(BOOKS[id]);save=learnSkill(save,id);save=setSlot(save,'bow',i,id);assert.ok(characterSkills(save).includes(id));assert.doesNotMatch(skillIcon(id),/undefined/);assert.match(skillCardHtml(id,save),/슬롯/);}
 const data=new Map(),store=new SaveStore({getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)});store.save(save);assert.deepEqual(loadoutOf(store.load()).slice(0,2),['triple_arrow','evasion_shot']);
 assert.match(skillCardHtml('triple_arrow',save),/3연사/);assert.match(skillCardHtml('evasion_shot',save),/회피/);
 assert.match(skillCardHtml('armor_break',save),/방어 약화/);assert.match(skillCardHtml('ground_slam',save),/35%/);
});
test('evasion shot grants no perfect reward until real hostile contact, then pays once',()=>{
 const {w,p}=scene('evasion_shot');const m=target(w,900);const ev=step(w,{a:{...press,mx:-1}});assert.equal(ev.some(e=>e.type==='perfectDodge'),false);
 function incoming(){w.projectiles.push({id:w.nextId++,ownerId:m.id,ownerKind:'monster',ownerType:m.type,team:m.team,abilityId:'sling_stone',x:p.x,y:p.y,vx:0,vy:0,r:8,travelled:0,range:500,pierce:0,hit:[],dmgMult:1,poiseMult:1});}
 const hp=p.hp;incoming();const hit=step(w);assert.equal(p.hp,hp);assert.equal(hit.filter(e=>e.type==='perfectDodge').length,1);assert.equal(p.pendingCounter.attackerId,m.id);
 incoming();assert.equal(step(w).some(e=>e.type==='perfectDodge'),false);
});
test('host and guest motion timelines agree for both skills, no predictive projectiles or damage',()=>{
 for(const id of ['triple_arrow','evasion_shot']){const {w,p}=scene(id);let pred=decodeSnapshot(encodeSnapshot(w),'a').entities[0];
  for(let i=0;i<40;i++){const input=i===0?{...press,mx:-1}:emptyInput();pred=predictPlayerTick(pred,input,{arena:w.arena,tick:w.tick});step(w,{a:input});
   assert.ok(Math.abs(pred.x-p.x)<1e-9,`${id} x tick ${i}`);assert.equal(pred.act?.phase,p.act?.phase,`${id} phase tick ${i}`);assert.equal(pred.dodge.iframeLeft,p.dodge.iframeLeft);assert.equal(pred.mp,p.mp);assert.deepEqual(pred.cds,p.cds);}
 }
});
test('triple burst cadence stays three shots at 100ms under fast attack-speed modifiers',()=>{
 const {w,p}=scene('triple_arrow');p.attackSpeedBonus=1;const shots=[];let ev=step(w,{a:press});for(let i=0;i<40;i++){if(ev.some(e=>e.type==='projectile'))shots.push(w.tick-1);ev=step(w);}
 assert.equal(shots.length,3);assert.deepEqual(shots.slice(1).map((n,i)=>n-shots[i]),[3,3]);
});
test('new bow skills retain bow audio identity rather than generic melee swing',async()=>{
 const {skillAudio}=await import('../js/audio-profile.js');for(const id of ['triple_arrow','evasion_shot'])assert.equal(skillAudio(id),'bow');
});
test('two-player loopback routes both new guest skills once through host authority and journal',async()=>{
 const {CoopSession}=await import('../js/net/session.js'),{createMemoryTransport}=await import('../js/net/loopback.js');
 const network=createMemoryTransport(),sessions={},seen={host:[],guest:[]};
 for(const uid of ['host','guest']){const transport=network.connect(uid,(from,p)=>p.t==='action'?sessions[uid].action(p.action):sessions[uid].rt(from,p));
  sessions[uid]=new CoopSession({uid,host:'host',players:['host','guest'],profile:{name:uid,level:30,weapon:'bow',mods:{skills:['triple_arrow','evasion_shot',null],maxMp:200,mpRegen:0},threats:{S2:1}},config:{stageId:'S2',threat:1,seed:11},...transport,onFrame:(view,events)=>seen[uid].push(...events)});
 }
 sessions.guest.update(34,emptyInput());assert.equal(sessions.guest.world,null);assert.equal(sessions.host.phase,'running');
 const w=sessions.host.world;w.round.pending=[];w.round.goal='timer';w.round.timerTicks=1e6;
 for(let i=0;i<65;i++){sessions.guest.update(34,i===0?press:i===30?{...emptyInput(),skill2Edge:true,mx:-1,aimX:1}:emptyInput());sessions.host.update(34,emptyInput());}
 for(const uid of ['host','guest']){const shots=seen[uid].filter(e=>e.type==='projectile');assert.equal(shots.filter(e=>e.ability==='triple_arrow').length,3,uid);assert.equal(shots.filter(e=>e.ability==='evasion_shot').length,1,uid);assert.equal(seen[uid].filter(e=>e.type==='dodge').length,1,uid);}
 const pawn=w.entities.find(e=>e.pid==='guest');assert.equal(pawn.mp,200-ABILITIES.triple_arrow.manaCost-ABILITIES.evasion_shot.manaCost);assert.equal(sessions.guest.world,null);assert.ok(sessions.guest.buffer.frames.length>0);
});
test('pressing triple arrow again mid-burst does not restart it or pay twice',()=>{
 const {w,p}=scene('triple_arrow');let ev=step(w,{a:press}),shots=0;while(!ev.some(e=>e.type==='projectile'))ev=step(w);shots++;
 ev=step(w,{a:press});shots+=ev.filter(e=>e.type==='projectile').length;for(let i=0;i<40;i++)shots+=step(w).filter(e=>e.type==='projectile').length;
 assert.equal(p.mp,200-ABILITIES.triple_arrow.manaCost);assert.equal(shots,3);
});
