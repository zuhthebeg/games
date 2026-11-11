import test from 'node:test';
import assert from 'node:assert/strict';
import {Sim,FIXED_DT,MA} from '../js/sim.js';
import {QUESTS} from '../js/data.js';
const save={weapon:'gs',w:{gs:1,db:1,bow:1},armor:1};
for(const q of QUESTS.slice(0,3))for(const enr of [false,true])for(const role of ['world','owner'])test('bite three physical ticks/contact once '+q.mon+'/'+enr+'/'+role,()=>{
 const s=new Sim(q,save,1,{role,localId:'p1',partySize:2});
 Object.assign(s.m,{x:0,z:0,yaw:0,enr,enrT:100});Object.assign(s.p,{x:0,z:6});s.startMonAtk('bite');
 const contacts=[];s.hurtPlayers=()=>contacts.push({tick:s.tick,x:s.m.x,z:s.m.z});
 const W=MA.bite.w*(enr?.85:1),moves=[];let active=0;
 for(let i=0;i<100;i++){const z=s.m.z;s.tick++;s.updMon(FIXED_DT);s.drainEvents();if(s.m.state==='atk'&&s.m.t>=W&&s.m.t<W+MA.bite.a)active++;if(Math.abs(s.m.z-z)>1e-9)moves.push({tick:s.tick,v:s.m.z-z});if(s.m.flag===2)break;}
 assert.equal(moves.length,3);moves.forEach(r=>assert.ok(Math.abs(r.v-1.4*s.def.scale/3)<1e-9));
 assert.equal(contacts.length,1);assert.equal(contacts[0].tick,moves[2].tick);assert.equal(contacts[0].z,s.m.z);
 assert.ok(moves[0].tick*FIXED_DT>=W);assert.ok(W>=.1);
 let expected=0,t=0;for(let i=0;i<100;i++){t+=FIXED_DT;if(t>=W&&t<W+MA.bite.a)expected++;}
 assert.equal(active,expected,'full original active window');
});
test('solo bite retains original single lunge/contact tick and snapshot shape',()=>{
 const s=new Sim(QUESTS[0],save);Object.assign(s.m,{x:0,z:0,yaw:0});Object.assign(s.p,{x:0,z:6});s.startMonAtk('bite');const contacts=[];s.hurtPlayers=()=>contacts.push(s.tick);const moves=[];
 for(let i=0;i<80;i++){const z=s.m.z;s.tick++;s.updMon(FIXED_DT);if(s.m.z!==z)moves.push(s.tick);s.drainEvents();}
 assert.equal(moves.length,1);assert.deepEqual(contacts,moves);assert.equal(s.m.z,1.4);assert.ok(!Object.hasOwn(s.m,'biteTicks'));
});

import {attackRun,sessionRun,summarize} from './raw-gate.mjs';
for(const hz of [30,60,120])test('all coop attacks tick-indexed draw/contact oracle '+hz+'Hz',()=>{
 const dts=Array(hz*5).fill(1/hz);
 for(const q of QUESTS.slice(0,3))for(const k of Object.keys(new Sim(q,save).def.atks))for(const enr of [false,true])for(const range of ['near','far',...(k==='leap'?['arena']:[])]){
  const r=attackRun(q,k,enr,range,dts);assert.equal(r.contactMatch,true,q.mon+'/'+k);assert.equal(r.summary.continuous.residual.max,0);
  assert.equal(r.summary.continuous.frames+r.summary.reentry.frames,dts.length-1);
  if(k==='bite')assert.equal(r.fixed.over1,0);
 }
 const fight=Array(hz*20).fill(1/hz);fight[hz*10]=1;const r=sessionRun(fight);
 assert.ok(r.recovery.count>=1);assert.ok(r.summary.reentry.frames>0);assert.equal(r.ownerCorrections,0);
 assert.equal(r.summary.continuous.frames+r.summary.reentry.frames,fight.length-1);assert.ok(r.claims.sent>0);assert.equal(r.claims.rate,1);
});
test('epoch and invisible samples are retained in their own column',()=>{
 const frames=[{x:0,z:0,dt:.02,epoch:0,visible:true,residual:0},{x:29,z:0,dt:.02,epoch:1,visible:false,residual:29},{x:30,z:0,dt:.02,epoch:1,visible:true,residual:1},{x:32,z:0,dt:.02,epoch:1,visible:true,residual:2}];
 const r=summarize(frames);assert.equal(r.reentry.frames,2);assert.equal(r.reentry.over1,1);assert.equal(r.reentry.movement.max,29);assert.equal(r.continuous.over1,1);
});
test('bite contact uses arena-clamped final tick position and snapshot continuation',()=>{
 const s=new Sim(QUESTS[0],save,1,{role:'owner',localId:'p1'});Object.assign(s.m,{x:0,z:39.6,yaw:0});Object.assign(s.p,{x:0,z:42});s.startMonAtk('bite');
 let before;while(!before){s.tick++;s.updMon(FIXED_DT);s.drainEvents();if(s.m.biteTicks===1)before=s.snapshot();}
 const restored=new Sim(QUESTS[0],save).restore(before),contacts=[];
 s.hurtPlayers=()=>contacts.push({tick:s.tick,z:s.m.z});
 for(let i=0;i<20;i++){s.tick++;restored.tick++;s.updMon(FIXED_DT);restored.updMon(FIXED_DT);s.drainEvents();restored.drainEvents();assert.deepEqual(s.m,restored.m);}
 assert.equal(contacts.length,1);assert.equal(contacts[0].tick,before.tick+2);assert.equal(contacts[0].z,40);assert.equal(s.m.z,40);
});
test('late bite event retains 100ms windup then all three physical contact ticks',()=>{
 const world=new Sim(QUESTS[0],save,1,{role:'world',partySize:2}),s=new Sim(QUESTS[0],save,1,{role:'owner',localId:'p1'});
 world.startMonAtk('bite');const e=world.drainEvents().find(e=>e.type==='monsterState');s.receiveMonsterEvent(e,1000);const start=s.m.t,contacts=[];s.hurtPlayers=()=>contacts.push(s.tick);
 for(let i=0;i<40;i++){s.tick++;s.updMon(FIXED_DT);s.drainEvents();}
 assert.ok(MA.bite.w-start>=.1-1e-10);assert.equal(s.m.biteTicks,3);assert.equal(contacts.length,1);assert.ok(contacts[0]>=8);
});

test('real owner HP changes on bite movement completion, never first two active ticks',()=>{
 const s=new Sim(QUESTS[0],save,1,{role:'owner',localId:'p1'});Object.assign(s.m,{x:0,z:0,yaw:0});Object.assign(s.p,{x:0,z:5.5});s.startMonAtk('bite');const hp=s.p.hp;
 for(let i=0;i<60;i++){s.tick++;s.updMon(FIXED_DT);s.drainEvents();if(s.m.biteTicks===1||s.m.biteTicks===2)assert.equal(s.p.hp,hp);if(s.m.biteTicks===3)break;}
 assert.equal(s.m.biteTicks,3);assert.ok(s.p.hp<hp);const hitHp=s.p.hp;
 for(let i=0;i<20;i++){s.p.inv=0;s.p.state='idle';s.tick++;s.updMon(FIXED_DT);s.drainEvents();assert.equal(s.p.hp,hitHp);}
});
