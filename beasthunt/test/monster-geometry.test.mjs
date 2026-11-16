import test from 'node:test';
import assert from 'node:assert/strict';
import {MONSTERS,QUESTS,rollLoot,UPG} from '../js/data.js';
import {Sim} from '../js/sim.js';
import {VERSION,compatible} from '../js/net/protocol.js';
const save={weapon:'gs',w:{gs:1,db:1,bow:1},armor:1};
test('Mixamo main bodies have no invisible tails or unsupported break rewards',()=>{
 for(const [id,actor,hp] of [['boar','Maw',1800],['frost','Mutant',3200],['ember','Pumpkinhulk',5000]]){
 const d=MONSTERS[id],s=new Sim(QUESTS.find(q=>q.mon===id),save,1);
 assert.equal(d.actor,actor);assert.equal(d.hp,hp);assert.equal(d.biped,true);assert.equal(d.dims.tailLen,0);
 assert.ok(s.mParts().some(p=>p.n==='arms'));assert.ok(!s.mParts().some(p=>p.n==='tail'));assert.deepEqual(d.brk,{});
 s.hitMonster('head',100,0,0,1);assert.ok(!s.drainEvents().some(e=>e.type==='break'));
 }
 assert.deepEqual(QUESTS.map(q=>q.id),Array.from({length:8},(_,i)=>'q'+(i+1)));
});
test('legacy forge tail/horn costs remain reachable without duplicate break windfall',()=>{
 for(const mon of ['boar','frost','ember']){
 const q=QUESTS.find(q=>q.mon===mon),a=rollLoot(q,{},()=>.1),b=rollLoot(q,{head:true,tail:true},()=>.1);
 const p={boar:'b',frost:'f',ember:'e'}[mon];assert.equal(a[p+'_horn'],1);assert.equal(a[p+'_tail'],1);assert.deepEqual(a,b);
 assert.equal(Object.values(a).reduce((a,b)=>a+b,0),5);
 }
 assert.equal(UPG[2].a.b_tail,1);
});
test('changed biped contact contract rejects previous wire v3',()=>{assert.equal(VERSION,4);assert.equal(compatible({v:3}),false);});

test('all eight actual quests: seeded determinism, retained HP/reward/save contracts and no new break flags',()=>{
 const budget=[[1800,400,20],[3200,900,40],[5000,1600,60],[3420,1500,50],[6080,2400,70],[9500,3600,100],[6800,4200,120],[12920,5600,150]];
 for(const [i,q]of QUESTS.entries())for(const weapon of ['gs','db','bow']){
 const gear={...save,weapon},bytes=JSON.stringify(gear),a=new Sim(q,gear,33129),b=new Sim(q,gear,33129);
 assert.deepEqual([a.m.maxHp,q.shards,q.gold],budget[i]);
 for(let k=0;k<360;k++){const input={p1:{moveZ:k<120?127:0,light:k%45===0,heavy:k%180===0,heavyHeld:k%180<60,dodge:k%120===90}};a.step(input);b.step(input);assert.deepEqual(a.drainEvents(),b.drainEvents());}
 assert.deepEqual(a.snapshot(),b.snapshot());assert.equal(JSON.stringify(gear),bytes);if(i<6)assert.equal(a.m.broke.head,false);
 }
});
test('actual world/guest reject previous v3 and normal plan rejects practice entry',async()=>{
 const {HostSession}=await import('../js/net/host.js'),{GuestSession}=await import('../js/net/guest.js'),{envelope}=await import('../js/net/protocol.js');
 const transport={sendState(){},sendEvent(){}},h=new HostSession({quest:QUESTS[0],roster:{a:{save},b:{save}},hunt:'h',host:'a',transport}),g=new GuestSession({quest:QUESTS[0],save,hunt:'h',host:'a',uid:'b',transport});
 assert.equal(h.receive('b',{...envelope('resync','h',1,{}),v:3}),false);assert.equal(g.receive('a',{...envelope('world','h',1,{}),v:3},0),false);
});
