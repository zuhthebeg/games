const {test}=require('node:test'),a=require('node:assert/strict'),S=require('../js/sim.js');
test('wave length and xp curve',()=>{a.equal(S.waveLength(1),20);a.equal(S.waveLength(10),60);a.equal(S.needXp(1),16);a.equal(S.needXp(2),25)});
test('enemy HP and damage scale with wave and players',()=>{a.equal(S.enemyStats('blob',1,1).hp,8);a.equal(S.enemyStats('blob',2,2).hp,8*1.42*1.25);a.ok(Math.abs(S.enemyStats('blob',2,2).dmg-1.14)<1e-9)});
test('armor negative and positive and dodge cap',()=>{a.equal(S.damageTaken(30,15),15);a.equal(S.damageTaken(30,-15),60);const w=S.createWorld({players:{x:{char:'basic'}},rng:()=>.5});w.players.x.stats.dodge=999;S.spawn(w,'blob',w.players.x.x,w.players.x.y);S.step(w);a.equal(w.players.x.hp,10)});
test('weapon crit / merge / shop price and reroll',()=>{const p=S.createPlayer('a');p.weapons=[['pistol',1],['pistol',1]];a.equal(S.merge(p,0),true);a.deepEqual(p.weapons,[['pistol',2]]);a.equal(S.price(22,2),25);a.equal(S.rerollCost(2,0),3);a.equal(S.rerollCost(2,1),4);p.stats.crit=100;a.ok(S.rollDamage(10,p,'ranged',()=>0).damage>=10)});
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
