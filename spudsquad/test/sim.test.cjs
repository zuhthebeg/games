const {test}=require('node:test'),a=require('node:assert/strict'),S=require('../js/sim.js');
test('wave length and xp curve',()=>{a.equal(S.waveLength(1),20);a.equal(S.waveLength(10),60);a.equal(S.needXp(1),20);a.equal(S.needXp(2),32)});
test('enemy HP and damage scale with wave and players',()=>{a.equal(S.enemyStats('blob',1,1).hp,8);a.ok(Math.abs(S.enemyStats('blob',2,2).hp-8*1.42*1.6*(1+.15/19))<1e-9);a.ok(Math.abs(S.enemyStats('blob',2,2).dmg-1.14*1.2*(1+.1/19))<1e-9);a.ok(Math.abs(S.enemyStats('blob',2,1).dmg-1.14*(1+.1/19))<1e-9)});
test('armor negative and positive and dodge cap',()=>{a.equal(S.damageTaken(30,15),15);a.equal(S.damageTaken(30,-15),60);const w=S.createWorld({players:{x:{char:'basic'}},rng:()=>.5});w.players.x.stats.dodge=999;S.spawn(w,'blob',w.players.x.x,w.players.x.y);S.step(w);a.equal(w.players.x.hp,12)});
test('weapon crit / merge / shop price and reroll',()=>{const p=S.createPlayer('a');p.weapons=[['pistol',1],['pistol',1]];a.equal(S.merge(p,0),true);a.deepEqual(p.weapons,[['pistol',2]]);a.equal(S.price(22,2),25);a.equal(S.rerollCost(2,0),4);a.equal(S.rerollCost(2,1),5);p.stats.crit=100;a.ok(S.rollDamage(10,p,'ranged',()=>0).damage>=10)});
test('splitter dies into two blobs',()=>{const w=S.createWorld({rng:()=>.99}),e=S.spawn(w,'splitter',200,200);e.hp=0;S.kill(w,e,'solo');a.equal(w.enemies.filter(v=>v.type==='blob').length,2)});
test('wave 20 ends only with boss killed',()=>{const w=S.createWorld({wave:20});w.tm=0;w.bossKilled=false;a.equal(S.canEnd(w),false);w.bossKilled=true;a.equal(S.canEnd(w),true)});
test('projectile flies at 700px/s before hit; final boss kill clears without timer',()=>{const w=S.createWorld({wave:20,rng:()=>.99});w.bossSpawned=true;w.spawnClock=-100;const p=w.players.solo,e=S.spawn(w,'blob',p.x+220,p.y);S.step(w,1/30);a.ok(e.hp>0,'not instantly hit');a.equal(w.projectiles.length,1);for(let i=0;i<14;i++)S.step(w,1/30);a.ok(e.hp<e.maxHp||!w.enemies.includes(e),'projectile arrived');w.bossKilled=true;a.equal(S.canEnd(w),true)});

test('wave end auto pickup is even among survivors, remainder by seat',()=>{
 const w=S.createWorld({players:{a:{char:'basic'},b:{char:'basic'},c:{char:'basic'}}});
 w.bossSpawned=true;w.tm=0;w.spawnClock=-100;
 w.drops=Array.from({length:8},(_,i)=>({id:i,x:0,y:0}));
 S.step(w,1/30);
 a.deepEqual([w.players.a.mats,w.players.b.mats,w.players.c.mats],[3,3,2]);
});
test('dead teammate revives at half HP for shop, next wave starts full',()=>{
 const w=S.createWorld({players:{a:{char:'basic'},b:{char:'basic'}}});
 w.players.b.alive=false;w.players.b.hp=0;w.tm=0;w.spawnClock=-100;
 S.step(w,1/30);
 a.equal(w.players.b.hp,w.players.b.maxHp*.5);
 const next=S.createWorld({wave:2,players:{b:{char:w.players.b.char,stats:w.players.b.stats}}});
 a.equal(next.players.b.hp,next.players.b.maxHp);
});
test('wave one drops pay one XP and one gold on pickup', () => {
 const w=S.createWorld({rng:()=>.99});w.spawnClock=-100;w.players.solo.cool=[100];
 const p=w.players.solo,e=S.spawn(w,'blob',p.x,p.y);e.hp=0;S.kill(w,e,p.uid);
 a.ok(w.drops.every(d=>d.gold===1));S.step(w);
 a.equal(p.mats,2);a.equal(p.xp,2);
});
test('zero-gold pickup still awards one XP without granting currency', () => {
 const w=S.createWorld({wave:10,rng:()=>.99}),p=w.players.solo;
 w.spawnClock=-100;p.cool=[100];w.bossSpawned=true;
 w.drops=[{id:1,x:p.x,y:p.y,gold:0}];
 S.step(w);a.equal(p.mats,0);a.equal(p.xp,1);
});
test('later gold chance falls monotonically but is bounded; XP is never reduced', () => {
 const totals=[];
 for(const wave of [1,5,10,15,20]) {
  let n=0;const w=S.createWorld({wave,rng:()=>{n++;return (n%100)/100;}});
  const e=S.spawn(w,'blob',100,100);e.hp=0;S.kill(w,e,'solo');
  // Sample a deterministic grid across many kills without clearing drops.
  for(let i=0;i<499;i++){const v=S.spawn(w,'blob',100,100);v.hp=0;S.kill(w,v,'solo');}
  a.equal(w.drops.length,1000);totals.push(w.drops.reduce((sum,d)=>sum+d.gold,0));
 }
 a.equal(totals[0],1000);
 a.ok(totals.every((v,i)=>i===0||v<=totals[i-1]),String(totals));
 a.ok(totals[4]>=300&&totals[4]<totals[1],String(totals));
});
test('wave end distributes missed drops evenly and honors each saved gold value',()=>{
 const w=S.createWorld({players:{a:{char:'basic'},b:{char:'basic'}},wave:8});
 w.bossSpawned=true;w.tm=0;w.spawnClock=-100;
 w.drops=[{id:1,x:0,y:0,gold:0},{id:2,x:0,y:0,gold:1},
  {id:3,x:0,y:0,gold:0},{id:4,x:0,y:0,gold:1}];
 S.step(w);a.deepEqual([w.players.a.xp,w.players.b.xp],[2,2]);
 a.deepEqual([w.players.a.mats,w.players.b.mats],[0,2]);
});
test('duplicate piggy banks give only one bounded bonus per wave',()=>{
 const players={solo:{char:'basic',mats:1000,items:['piggy_bank','piggy_bank']}};
 const w=S.createWorld({wave:2,players});a.equal(w.players.solo.mats,1020);
});
