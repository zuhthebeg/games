import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { Sim, selectTarget, neutralInput } from '../js/sim.js';
import { QUESTS } from '../js/data.js';
import { FixedClock, interpolatePose } from '../js/fixed.js';

const save = weapon => ({ weapon, w: { gs: 1, db: 1, bow: 1 }, armor: 1 });
const hash = sim => createHash('sha256').update(JSON.stringify(sim.snapshot())).digest('hex');
function bot(sim, i) {
  const inputs = {};
  for (const p of sim.players) {
    const dx=sim.m.x-p.x,dz=sim.m.z-p.z,d=Math.hypot(dx,dz);
    inputs[p.id] = { ...neutralInput(), aimYaw: Math.atan2(dx,dz), moveZ: d > (p.weapon==='bow'?15:4.5) ? 127 : 0,
      light: i%20===0, heavy: i%300===150, heavyHeld: i%300>=150 && i%300<250,
      dodge: i%420===400, potion: p.hp<40 && i%60===0 };
  }
  return inputs;
}
for (const quest of QUESTS.slice(0,3)) for (const weapon of ['gs','db','bow']) {
  test(quest.mon+'/'+weapon+' 3000-tick replay and 1000-tick restored continuation', () => {
    const a=new Sim(quest,save(weapon),42), b=new Sim(quest,save(weapon),42);
    let restored, attacked=false;
    for(let i=0;i<3000;i++) {
      const input=bot(a,i); a.step(input); b.step(input);
      attacked ||= a.m.state==='atk';
      assert.deepEqual(a.drainEvents(),b.drainEvents());
      if(i===1999) restored=new Sim(quest,save(weapon),999).restore(JSON.parse(JSON.stringify(a.snapshot())));
      else if(i>1999) { restored.step(input); restored.drainEvents(); }
    }
    assert.ok(attacked,'AI exercised'); assert.ok(a.dmgDealt>100,'real combat damage');
    assert.equal(hash(a),hash(b)); assert.equal(hash(a),hash(restored));
    console.log(quest.mon+'/'+weapon+' sha256 '+hash(a));
  });
}
test('different seeds produce different combat state',()=>{
  const a=new Sim(QUESTS[0],save('gs'),42),b=new Sim(QUESTS[0],save('gs'),43);
  for(let i=0;i<3000;i++){const input=bot(a,i);a.step(input);b.step(input);a.drainEvents();b.drainEvents();}
  assert.notEqual(hash(a),hash(b)); assert.notEqual(a.dmgDealt,b.dmgDealt);
});
test('two independent loadouts/inputs, replay and snapshot',()=>{
  const a=new Sim(QUESTS[1],save('gs'),9);a.addPlayer('second',save('bow'));a.players[1].x=6;
  const b=new Sim(QUESTS[1],save('gs')).restore(a.snapshot());
  for(let i=0;i<3000;i++){const input=bot(a,i);a.step(input);b.step(input);a.drainEvents();b.drainEvents();}
  assert.equal(hash(a),hash(b));assert.ok(a.players.every(p=>p.contribution>0));
  assert.notEqual(a.players[0].x,a.players[1].x);assert.equal(a.players[1].weapon,'bow');
});
test('target: nearest, recent damage, expired contribution, dead exclusion, stable ties',()=>{
  const s=new Sim(QUESTS[0],save('gs'));const a=s.players[0],b=s.addPlayer('b',save('db'));
  s.m.x=s.m.z=0;a.x=10;a.z=0;b.x=11;b.z=0;
  assert.equal(selectTarget(s.players,s.m,100).id,a.id);
  b.lastDamageTick=99;assert.equal(selectTarget(s.players,s.m,100).id,b.id);
  assert.equal(selectTarget(s.players,s.m,400).id,a.id);
  a.state='dead';assert.equal(selectTarget(s.players,s.m,400).id,b.id);
  a.state='idle';b.x=10;assert.equal(selectTarget(s.players,s.m,400).id,a.id);
  b.state=a.state='dead';assert.equal(selectTarget(s.players,s.m,400),null);
});
test('shared three-cart limit, individual respawn and party failure',()=>{
  const s=new Sim(QUESTS[0],save('gs'));const b=s.addPlayer('b',save('db')),a=s.players[0];
  for(const p of [a,b]) {s.activeId=p.id;p.hp=1;p.inv=0;s.hurt(1000,0,0,true);}
  assert.equal(s.carts,2);assert.equal(s.over,false);
  for(let i=0;i<140;i++){s.step();s.drainEvents();}
  assert.equal(a.state,'idle');assert.equal(b.state,'idle');assert.equal(a.hp,a.maxHp);
  s.activeId=b.id;b.hp=1;b.inv=0;s.hurt(1000,0,0,true);
  assert.equal(s.carts,3);assert.equal(s.over,true);assert.equal(s.win,false);
});
test('sweep hits each player once and projectiles hit non-target players',()=>{
  const s=new Sim(QUESTS[0],save('gs'));const b=s.addPlayer('b',save('db')),a=s.players[0];
  Object.assign(s.m,{x:0,z:0,yaw:0});Object.assign(a,{x:3,z:0});Object.assign(b,{x:-3,z:0});
  s.startMonAtk('sweep');s.m.t=.8+.2;s.updMon(.01);
  assert.ok(a.hp<a.maxHp && b.hp<b.maxHp);const hp=a.hp;
  a.inv=0;s.updMon(.01);assert.equal(a.hp,hp);
  b.x=25;b.z=25;b.inv=0;b.state='idle';const hpB=b.hp;
  s.spawnProj(25,25,0,0,.7,20,false);s.updProjs(1/60);
  assert.ok(b.hp<hpB);assert.equal(s.projs.length,0);
});
test('arrows credit owner even when the monster targets another player',()=>{
  const s=new Sim(QUESTS[0],save('gs'));const b=s.addPlayer('b',save('bow'));
  s.activeId=b.id;Object.assign(b,{x:0,z:0,yaw:0,frac:0,mv:1});s.fireArrow();
  const arrow=s.arrows[0],c=s.mParts()[0];arrow.x=c.x;arrow.z=c.z;arrow.vx=arrow.vz=0;s.activeId=s.players[0].id;
  s.updProjs(1/60);assert.ok(b.contribution>0);assert.equal(s.players[0].contribution,0);
});
test('input quantization, edge buffer expiry and held heavy release',()=>{
  const s=new Sim(QUESTS[0],save('gs'));s.step({p1:{moveX:999.1,moveZ:-99.6}});
  assert.equal(s.p.input.moveX,127);assert.equal(s.p.input.moveZ,-100);
  s.p.state='stun';s.p.t=0;s.step({p1:{light:true}});for(let i=0;i<17;i++)s.step();assert.equal(s.p.buffer.attack,0);
  s.p.state='idle';s.step({p1:{heavy:true,heavyHeld:true}});assert.equal(s.p.state,'charge');
  s.step({p1:{heavyHeld:false}});assert.equal(s.p.state,'atk');
});
test('result randomness round-trips and result is idempotent',()=>{
  const a=new Sim(QUESTS[0],save('gs'),7);a.hitMonster('body',99999,0,0,2);
  const b=new Sim(QUESTS[0],save('gs')).restore(a.snapshot());
  for(let i=0;i<300;i++){a.step();b.step();a.drainEvents();b.drainEvents();}
  assert.equal(hash(a),hash(b));const before=hash(a);assert.deepEqual(a.result(),a.result());assert.equal(hash(a),before);
});
test('30/60/144Hz emulated render intervals: same 3600 ticks and state after 60 seconds',()=>{
  const hashes=[];
  for(const hz of [30,60,144]) {const clock=new FixedClock(),s=new Sim(QUESTS[0],save('gs'),1);
    for(let frame=0;frame<hz*60;frame++)clock.advance(1/hz,()=>{s.step();s.drainEvents();});
    assert.equal(s.tick,3600);assert.ok(clock.alpha>=0 && clock.alpha<1);hashes.push(hash(s));
  }assert.equal(new Set(hashes).size,1);
});
test('inactive-tab catchup capped at six ticks, reset discards remainder',()=>{
  const c=new FixedClock();let n=0;assert.equal(c.advance(3600,()=>n++),6);assert.equal(n,6);
  c.advance(1/144,()=>n++);c.reset();assert.equal(c.alpha,0);
});
test('render interpolation uses shortest yaw and never mutates sim state',()=>{
  const a={x:0,z:0,y:0,spin:0,yaw:Math.PI-.1},b={x:10,z:4,y:2,spin:1,yaw:-Math.PI+.1};
  const p=interpolatePose(a,b,.5);assert.equal(p.x,5);assert.ok(Math.abs(p.yaw-Math.PI)<1e-9);assert.equal(b.x,10);
});
test('sim dependency graph contains no three/DOM/audio/platform randomness',()=>{
  const sim=fs.readFileSync(new URL('../js/sim.js',import.meta.url),'utf8');
  assert.doesNotMatch(sim,/\b(?:THREE|window|document|performance|requestAnimationFrame)\b|Math\.random|from\s+['"][^'"]*(?:three|models|audio|input)/);
  const imports=[...sim.matchAll(/from\s+['"]([^'"]+)/g)].map(m=>m[1]);assert.deepEqual(imports,['./data.js']);
});

test('live snapshot preserves charged moves, hitstop, enemy shots and arrow ownership',()=>{
  const a=new Sim(QUESTS[2],save('bow'),123);const other=a.addPlayer('other',save('gs'));
  a.players[0].inv=other.inv=999;
  a.activeId='p1';Object.assign(a.p,{state:'charge',t:.7,clv:2,frac:.7,mv:2});
  a.fireArrow();a.spawnProj(20,20,0,10,.7,18,false);a.stop=.11;
  assert.equal(a.arrows.length,1);assert.equal(a.projs.length,1);
  const b=new Sim(QUESTS[0],save('gs')).restore(JSON.parse(JSON.stringify(a.snapshot())));
  a.drainEvents();
  for(let i=0;i<1000;i++){const input=bot(a,i);a.step(input);b.step(input);assert.deepEqual(a.drainEvents(),b.drainEvents());}
  assert.equal(hash(a),hash(b));
});
test('four local players advance by stable id with independent neutral/move commands',()=>{
  const s=new Sim(QUESTS[0],save('gs'));s.addPlayer('b',save('db'));s.addPlayer('c',save('bow'));s.addPlayer('d',save('gs'));
  assert.throws(()=>s.addPlayer('b',save('gs')),/Duplicate/);
  const before=s.players.map(p=>p.z);
  for(let i=0;i<60;i++){s.step({p1:{moveZ:127},b:{moveZ:-127},c:{moveX:127},d:{}});s.drainEvents();}
  assert.ok(s.players[0].z>before[0]);assert.ok(s.players[1].z<before[1]);assert.ok(s.players[2].x<0);assert.equal(s.players[3].z,before[3]);
});

test('clearInputs cancels all players pending edges and levels, snapshot stays authoritative',()=>{
  const s=new Sim(QUESTS[0],save('gs'));s.addPlayer('b',save('bow'));
  for(const p of s.players)Object.assign(p,{state:'stun',t:1.15,hp:50});
  s.step({p1:{light:true,heavy:true,dodge:true,potion:true,heavyHeld:true},b:{light:true,moveZ:127}});
  assert.equal(typeof s.clearInputs,'function','explicit sim input reset API');
  const old=hash(s);s.clearInputs();assert.notEqual(hash(s),old);
  for(const p of s.players){assert.deepEqual(p.input,neutralInput());assert.deepEqual(p.buffer,{});}
  const copy=new Sim(QUESTS[0],save('db')).restore(JSON.parse(JSON.stringify(s.snapshot())));
  for(let i=0;i<10;i++){s.step();copy.step();assert.deepEqual(s.drainEvents(),copy.drainEvents());}
  assert.ok(s.players.every(p=>p.state==='idle'));assert.equal(hash(s),hash(copy));
});
test('aged edges preserve the total 260ms deadline rather than starting another buffer',()=>{
  for(const edge of ['light','heavy','dodge','potion']) {
    const s=new Sim(QUESTS[0],save('gs'));Object.assign(s.p,{state:'stun',t:1.05,hp:50});
    s.step({p1:{[edge]:true,edgeAgeMs:{[edge]:250}}});
    const copy=new Sim(QUESTS[0],save('bow')).restore(s.snapshot());
    for(let i=0;i<17;i++){s.step();copy.step();s.drainEvents();copy.drainEvents();}
    assert.equal(s.p.state,'idle',edge+' must expire');assert.equal(hash(s),hash(copy));
    const fresh=new Sim(QUESTS[0],save('gs'));fresh.step({p1:{[edge]:true,edgeAgeMs:{[edge]:260}}});
    assert.equal(fresh.p.state,'idle',edge+' expired at exact deadline');
  }
});
test('respawn does not interpolate across death position, continuous roll and knockback still interpolate',()=>{
  const s=new Sim(QUESTS[0],save('gs'));Object.assign(s.p,{x:24,z:20,state:'dead',t:2.299,hp:0});
  const before={...s.p};s.step();const pose=interpolatePose(before,s.p,.5);
  assert.equal(pose.x,s.p.x);assert.equal(pose.z,s.p.z);assert.equal(before.x,24);
  for(const state of ['roll','hit','down']) {
    const a={x:0,z:0,yaw:0,spin:0,state},b={...a,x:2,z:4};
    assert.equal(interpolatePose(a,b,.5).x,1);assert.equal(interpolatePose(a,b,.5).z,2);
  }
});
