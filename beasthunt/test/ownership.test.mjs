import test from 'node:test';
import assert from 'node:assert/strict';
import {Sim,MA,neutralInput} from '../js/sim.js';
import {QUESTS,COOP_HP_SCALE} from '../js/data.js';
const save={weapon:'gs',w:{gs:1,db:1,bow:1},armor:1};
const make=network=>new Sim(QUESTS[0],save,42,network);
test('world role treats every hunter as a puppet: no input, healing, hurt or stun',()=>{
  const s=make({role:'world',partySize:2}),p=s.p;
  Object.assign(p,{x:0,z:0,hp:1,healLeft:30,state:'idle'});
  s.m.x=s.m.z=0;s.monRoar(false);s.m.t=.49;
  const before=structuredClone(p);
  for(let i=0;i<10;i++)s.step({p1:{moveZ:127,light:true,dodge:true}});
  assert.deepEqual(p,before);assert.equal(s.hurt(999,0,0,true),false);assert.equal(s.carts,0);
});
test('owner role never runs remote hunter input or damage',()=>{
  const s=make({role:'owner',localId:'p1'}),other=s.addPlayer('other',save),before=structuredClone(other);
  for(let i=0;i<30;i++)s.step({other:{moveZ:127,light:true},p1:neutralInput()});
  assert.deepEqual(other,before);s.activeId='other';assert.equal(s.hurt(99,0,0,true),false);
});
test('owner movement has zero corrections with identical displayed world/input',()=>{
  const a=make({role:'owner',localId:'p1'}),b=make({role:'owner',localId:'p1'});
  for(let i=0;i<1200;i++){
    const inp={p1:{moveX:i%120<60?127:-127,dodge:i%60===0,light:i%90===0}};
    a.step(inp);b.step(inp);a.drainEvents();b.drainEvents();assert.deepEqual(a.players,b.players);
  }
});
test('owner claims give immediate effects but never mutate monster HP/parts',()=>{
  const s=make({role:'owner',localId:'p1'}),before=structuredClone(s.m);s.hitMonster('head',20,0,0,1);
  assert.deepEqual(s.m,before);assert.ok(s.stop>0);
  const e=s.drainEvents();assert.ok(e.some(e=>e.type==='hit'));assert.ok(e.some(e=>e.type==='hitClaim'));
});
test('only world role scales HP and part thresholds; solo remains one-player',()=>{
  const solo=make();
  for(let size=1;size<=4;size++){
    const s=make({role:'world',partySize:size});
    assert.equal(s.m.maxHp,Math.round(solo.m.maxHp*COOP_HP_SCALE[size-1]));
    assert.equal(s.m.legTh,solo.m.legTh*COOP_HP_SCALE[size-1]);
  }
  assert.ok(!('network' in solo.snapshot()));
});
for(const move of Object.keys(MA))test(move+' uses identical host/owner attack motion function',()=>{
  const world=make({role:'world',partySize:2}),owner=make({role:'owner',localId:'p1'});
  world.p.x=owner.p.x=20;world.p.z=owner.p.z=15;world.startMonAtk(move);
  const e=world.drainEvents().find(e=>e.type==='monsterState');owner.receiveMonsterEvent(e,world.tick);
  for(let i=0;i<300 && world.m.state==='atk';i++){
    world.step();owner.step();world.drainEvents();owner.drainEvents();
    for(const k of ['x','z','y','yaw','spin','t'])assert.ok(Math.abs(world.m[k]-owner.m[k])<1e-9,k+' mismatch at '+i);
    assert.equal(world.m.state,owner.m.state);
  }
});
test('late attack events consume only windup; active duration not shortened',()=>{
  const world=make({role:'world',partySize:2});world.startMonAtk('sweep');
  const event=world.drainEvents().find(e=>e.type==='monsterState'),durations=[];
  for(const late of [0,20,100,300]){
    const owner=make({role:'owner',localId:'p1'});owner.p.x=30;owner.p.z=30;
    const info=owner.receiveMonsterEvent(event,late);if(late>0)assert.ok(info.compressed>0);
    let active=0;
    for(let i=0;i<300 && owner.m.state==='atk';i++){
      owner.step();if(owner.m.t>=MA.sweep.w && owner.m.t<MA.sweep.w+MA.sweep.a)active++;
      owner.drainEvents();
    }
    durations.push(active);assert.ok(Math.abs(active/60-MA.sweep.a)<=1/60+1e-8);
  }
  assert.ok(Math.max(...durations)-Math.min(...durations)<=1);
});
test('local invulnerability is checked by the exact replay timeline contact',()=>{
  const world=make({role:'world',partySize:2});world.startMonAtk('sweep');
  const event=world.drainEvents().find(e=>e.type==='monsterState');
  const owner=make({role:'owner',localId:'p1'});owner.receiveMonsterEvent(event,0);
  owner.m.t=MA.sweep.w+.2;owner.p.x=owner.m.x;owner.p.z=owner.m.z;owner.p.inv=1;
  const hp=owner.p.hp;owner.updMon(1/60);assert.equal(owner.p.hp,hp);
  owner.p.inv=0;owner.updMon(1/60);assert.ok(owner.p.hp<hp);
});
test('local hitstop never stops monster playback; owner carts cannot decide shared loss',()=>{
  const s=make({role:'owner',localId:'p1'});s.m.state='chase';s.stop=.2;
  s.step();assert.equal(s.m.t,1/60);
  for(let i=0;i<3;i++){s.p.hp=1;s.p.inv=0;s.p.state='idle';s.hurt(999,0,0,true);}
  assert.equal(s.carts,3);assert.equal(s.over,false);
});

test('local movement and dodge ticks match solo exactly without monster contact',()=>{
  const solo=make(),owner=make({role:'owner',localId:'p1'});
  solo.m.state=owner.m.state='dead';
  for(let i=0;i<3600;i++){
    const input={p1:{moveX:i%120<60?127:-127,dodge:i%90===0}};
    solo.step(input);owner.step(input);solo.drainEvents();owner.drainEvents();
    assert.deepEqual(owner.players,solo.players,'zero correction at tick '+i);
  }
});
test('head threshold scales with party size and snapshot restores ownership mode',()=>{
  const one=make({role:'world',partySize:1}),two=make({role:'world',partySize:2});
  one.hitMonster('head',200,0,0,1);two.hitMonster('head',200,0,0,1);
  assert.equal(one.m.broke.head,true);assert.equal(two.m.broke.head,false);
  const clone=make().restore(two.snapshot());assert.deepEqual(clone.snapshot(),two.snapshot());
  clone.restore(make().snapshot());assert.ok(!('network' in clone));
});
