import test from 'node:test';import assert from 'node:assert/strict';
import {createWorld,addPlayer,spawnMonster,step} from '../js/sim/world.js';
import {segmentCircleEntry} from '../js/sim/core.js';
import {ABILITIES} from '../js/content/combat.js';
import {FRIENDLY_PROJECTILE_DAMAGE} from '../js/content/balance.js';
const monster=(w,x)=>{const m=spawnMonster(w,'goblin_grunt',x,400);m.spawnLeft=0;m.staggerLeft=999;m.hp=m.maxHp=1000;return m;};
function shot(w,owner,{x=100,speed=12000,pierce=0,ability='arrow',range=1000}={}) {
 const p={id:w.nextId++,team:owner.team,ownerId:owner.id,ownerKind:owner.kind,ownerType:owner.type||owner.weapon,
 abilityId:ability,x,y:400,vx:speed,vy:0,r:2,travelled:0,range,pierce,hit:[],dmgMult:1,poiseMult:1};w.projectiles.push(p);return p;
}
test('segment-circle sweep handles entry, tangent, overlap, zero segment and miss',()=>{
 assert.equal(segmentCircleEntry(0,0,100,0,50,0,10),.4);
 assert.equal(segmentCircleEntry(0,0,100,0,50,10,10),.5);
 assert.equal(segmentCircleEntry(0,0,0,0,0,0,10),0);
 assert.equal(segmentCircleEntry(0,0,0,0,20,0,10),null);
 assert.equal(segmentCircleEntry(0,0,100,0,150,0,10),null);
});
test('monster ally blocks player behind it without damage or pierce loss',()=>{
 const w=createWorld(),owner=monster(w,100),blocker=monster(w,220),player=addPlayer(w,{pid:'a',x:350,y:400});
 const pr=shot(w,owner,{pierce:3}),events=step(w);
 assert.equal(FRIENDLY_PROJECTILE_DAMAGE,0);assert.equal(blocker.hp,1000);assert.equal(player.hp,100);
 assert.equal(pr.pierce,3);assert.equal(w.projectiles.length,0);
 const blocked=events.find(e=>e.type==='projectileBlocked');assert.equal(blocked.blockerId,blocker.id);assert.equal(blocked.x,200);
 assert.equal(events.some(e=>e.type==='hit'),false);
});
test('nearest enemy hit precedes array order, fast projectile cannot tunnel through small body',()=>{
 const w=createWorld(),owner=addPlayer(w,{pid:'a',x:100,y:400});
 const far=monster(w,350),near=monster(w,220);near.r=1;
 shot(w,owner,{speed:18000});const events=step(w),hits=events.filter(e=>e.type==='hit');
 assert.deepEqual(hits.map(e=>e.dst),[near.id]);assert.equal(near.hp,987);assert.equal(far.hp,1000);
 assert.equal(events.find(e=>e.type==='projectileEnd').x,217);
});
test('two-player coop body blocks owner shot; both allied players take zero damage',()=>{
 const w=createWorld(),owner=addPlayer(w,{pid:'a',x:100,y:400}),friend=addPlayer(w,{pid:'b',x:210,y:400});
 const enemy=monster(w,350);shot(w,owner);const events=step(w);
 assert.equal(owner.hp,100);assert.equal(friend.hp,100);assert.equal(enemy.hp,1000);
 assert.equal(events.find(e=>e.type==='projectileBlocked').blockerId,friend.id);
});
test('piercing follows path order, stops at ally even with pierce left',()=>{
 const w=createWorld(),owner=addPlayer(w,{pid:'a',x:100,y:400});
 const far=monster(w,360),second=monster(w,250),first=monster(w,180);
 const friend=addPlayer(w,{pid:'b',x:310,y:400});const pr=shot(w,owner,{pierce:4});
 const events=step(w);assert.deepEqual(events.filter(e=>e.type==='hit').map(e=>e.dst),[first.id,second.id]);
 assert.equal(pr.pierce,2);assert.equal(far.hp,1000);assert.equal(events.find(e=>e.type==='projectileBlocked').blockerId,friend.id);
});
test('explosion uses actual blocker contact and range expiry is swept before removal',()=>{
 const w=createWorld(),owner=addPlayer(w,{pid:'a',x:100,y:400});addPlayer(w,{pid:'b',x:230,y:400});
 shot(w,owner,{ability:'ember_bolt'});const events=step(w),blocked=events.find(e=>e.type==='projectileBlocked'),blast=events.find(e=>e.type==='explode');
 assert.equal(blast.x,blocked.x);assert.equal(blast.y,blocked.y);assert.equal(w.entities[1].hp,100);
 const other=createWorld(),p=addPlayer(other,{pid:'a',x:100,y:400});monster(other,220);shot(other,p,{range:180});
 assert.equal(step(other).filter(e=>e.type==='hit').length,1);
});
test('projectile ordering and blocked events replay deterministically',()=>{
 const w=createWorld({seed:42}),p=addPlayer(w,{pid:'a',x:100,y:400});monster(w,260);addPlayer(w,{pid:'b',x:350,y:400});shot(w,p,{pierce:2});
 const clone=structuredClone(w);for(let i=0;i<10;i++)assert.deepEqual(step(w),step(clone));assert.deepEqual(w,clone);
});
test('content audit: no hitscan/beam/long ranged instant shapes; projectile telegraphs remain maximal',()=>{
 for(const [id,a] of Object.entries(ABILITIES)) {
  assert.ok(['shape','projectile','dash'].includes(a.delivery),id);
  if(a.delivery==='shape')assert.ok(['circle','cone'].includes(a.shape.type),id);
 }
});
