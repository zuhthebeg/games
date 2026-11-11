// Independent 2026-11-11 reviewer probe copy: only fixed invariants/import paths updated.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Sim,selectTarget} from '../js/sim.js';
import {FixedClock,interpolatePose} from '../js/fixed.js';
import {QUESTS,WTYPES} from '../js/data.js';
const save=w=>({weapon:w,w:{gs:1,db:1,bow:1},armor:1});
const hash=s=>createHash('sha256').update(JSON.stringify(s.snapshot())).digest('hex');
const input=i=>({moveX:Math.round(Math.sin(i/83)*110),moveZ:i%600<350?127:-90,aimYaw:Math.sin(i/130)*2,light:i%19===0,heavy:i%233===0,heavyHeld:i%233<87,dodge:i%191===0,potion:i%397===0,lock:i%787===0});
let restores=0;const rows=[];
for(const mon of ['boar','frost','ember'])for(const w of ['gs','db','bow']){
 const q=QUESTS.find(q=>q.mon===mon),a=new Sim(q,save(w),9123),b=new Sim(q,save(w),9123),c=new Sim(q,save(w),2341);let copies=[];
 for(let i=0;i<3600;i++){
  const cmd={p1:input(i)}; for(const s of [a,b,c,...copies]){s.step(cmd);s.drainEvents();}
  assert.equal(hash(a),hash(b));for(const s of copies)assert.equal(hash(a),hash(s));
  if([1,17,303,799,1701,2600].includes(i)){copies.push(new Sim(q,save('bow'),0).restore(JSON.parse(JSON.stringify(a.snapshot()))));restores++;}
 }
 assert.notEqual(hash(a),hash(c));rows.push({mon,w,hash:hash(a)});
}
// Snapshots with actual charge, swing, player arrow and monster projectile in flight.
for(const phase of ['charge','swing','arrow','projectile']){
 const a=new Sim(QUESTS[0],save(phase==='arrow'?'bow':'gs'),77);a.p.inv=1000;
 if(phase==='charge')a.startHeavy(0,false);
 if(phase==='swing')a.startAtk(WTYPES.gs.light[0],0,0,0,false);
 if(phase==='arrow'){a.p.frac=.5;a.p.mv=1;a.fireArrow();}
 if(phase==='projectile')a.spawnProj(20,20,0,24,.7,18,false);
 const b=new Sim(QUESTS[0],save('db'),1).restore(JSON.parse(JSON.stringify(a.snapshot())));a.drainEvents();
 for(let i=0;i<1000;i++){const cmd={p1:input(i)};a.step(cmd);b.step(cmd);assert.equal(hash(a),hash(b));assert.deepEqual(a.drainEvents(),b.drainEvents());}restores++;
}
const cadences=[];for(const hz of [30,60,144]){const clock=new FixedClock(),s=new Sim(QUESTS[0],save('gs'),9);for(let i=0;i<hz*60;i++)clock.advance(1/hz,()=>{s.step({p1:input(s.tick)});s.drainEvents();});assert.equal(s.tick,3600);cadences.push(hash(s));}assert.equal(new Set(cadences).size,1);
const clock=new FixedClock();assert.equal(clock.advance(600,()=>{}),6);clock.advance(.005,()=>{});clock.reset();assert.equal(clock.alpha,0);
const party=new Sim(QUESTS[0],save('bow'),11);const p2=party.addPlayer('p2',save('gs'));party.p.x=20;p2.x=0;p2.z=10;assert.equal(selectTarget(party.players,party.m,0).id,'p2');
party.activeId='p1';party.hurt(9999,0,0,true);assert.equal(party.carts,1);assert.equal(p2.state,'idle');for(let i=0;i<145;i++){party.step({});party.drainEvents();}assert.equal(party.players[0].hp,party.players[0].maxHp);assert.equal(party.carts,1);
party.activeId='p1';party.players.forEach(p=>{p.hp=p.maxHp;p.inv=0;p.state='idle';});party.m.hitPlayers={};party.hurtPlayers(()=>true,10,0,0,false,true);const hp=party.players.map(p=>p.hp);party.players.forEach(p=>{p.inv=0;p.state='idle';});party.hurtPlayers(()=>true,10,0,0,false,true);assert.deepEqual(party.players.map(p=>p.hp),hp);
party.activeId='p1';party.p.x=0;party.p.z=0;party.p.frac=0;party.p.mv=1;party.fireArrow();party.arrows[0].x=party.m.x;party.arrows[0].z=party.m.z;party.arrows[0].vx=party.arrows[0].vz=0;party.activeId='p2';const c0=party.players[0].contribution,c1=p2.contribution;party.updProjs(1/60);assert.ok(party.players[0].contribution>c0);assert.equal(p2.contribution,c1);
for(let i=0;i<3600;i++){party.step({p1:input(i),p2:input(i+37)});party.drainEvents();}
// Regression: a discontinuity snaps to the live pose, never the path midpoint.
const respawn=interpolatePose({x:24,z:20,yaw:0,spin:0,state:'dead'},{x:0,z:-34,yaw:0,spin:0,state:'idle'},.5);
assert.equal(respawn.x,0);assert.equal(respawn.z,-34);
console.log(JSON.stringify({pass:true,rows,restores,cadences,party:{tick:party.tick,carts:party.carts},respawnSmear:respawn},null,2));
