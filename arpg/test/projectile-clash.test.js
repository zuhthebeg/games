import test from 'node:test';import assert from 'node:assert/strict';
import {createWorld,addPlayer,spawnMonster,step} from '../js/sim/world.js';
import {TEAM_MONSTER} from '../js/sim/core.js';
// Opposing player projectiles (human vs skeleton) annihilate on contact; PvE is unchanged.
function players(){const w=createWorld();const h=addPlayer(w,{pid:'h',x:100,y:400}),b=addPlayer(w,{pid:'b',x:900,y:400});b.team=TEAM_MONSTER;b.skeletal=true;for(const p of [h,b])p.staggerLeft=999;return {w,h,b};}
function shot(w,owner,{x,y=400,vx,vy=0,pierce=0,range=1000,r=7,ability='arrow'}){const p={id:w.nextId++,team:owner.team,ownerId:owner.id,ownerKind:owner.kind,ownerType:owner.type||owner.weapon,abilityId:ability,x,y,vx,vy,r,travelled:0,range,pierce,hit:[],dmgMult:1,poiseMult:1};w.projectiles.push(p);return p;}
test('opposing player projectiles head-on annihilate at the contact point, nobody is hit',()=>{
 const {w,h,b}=players();const a=shot(w,h,{x:480,vx:900}),c=shot(w,b,{x:520,vx:-900});
 const ev=step(w),clash=ev.find(e=>e.type==='projectileClash');
 assert.ok(clash);assert.deepEqual([clash.a,clash.b].sort(),[a.id,c.id].sort());
 assert.ok(Math.abs(clash.x-500)<1e-9);assert.equal(clash.y,400);
 assert.equal(w.projectiles.length,0);assert.equal(h.hp,h.maxHp);assert.equal(b.hp,b.maxHp);
 assert.equal(ev.filter(e=>e.type==='projectileEnd').length,2);assert.equal(ev.some(e=>e.type==='hit'),false);
});
test('fast crossing projectiles cannot tunnel past each other between ticks',()=>{
 const {w,h,b}=players();shot(w,h,{x:400,vx:12000}),shot(w,b,{x:600,vx:-12000});
 const ev=step(w);assert.ok(ev.find(e=>e.type==='projectileClash'));assert.equal(w.projectiles.length,0);
});
test('allied player projectiles pass through each other',()=>{
 const w=createWorld();const a=addPlayer(w,{pid:'a',x:100,y:300}),c=addPlayer(w,{pid:'c',x:100,y:500});
 shot(w,a,{x:480,vx:900});shot(w,c,{x:520,vx:-900});
 const ev=step(w);assert.equal(ev.some(e=>e.type==='projectileClash'),false);assert.equal(w.projectiles.length,2);
});
test('monster projectiles never clash with player projectiles (PvE unchanged)',()=>{
 const w=createWorld();const p=addPlayer(w,{pid:'a',x:100,y:400}),m=spawnMonster(w,'goblin_grunt',900,400);m.spawnLeft=0;m.staggerLeft=999;
 shot(w,p,{x:480,vx:900});shot(w,m,{x:520,vx:-900});
 const ev=step(w);assert.equal(ev.some(e=>e.type==='projectileClash'),false);assert.equal(w.projectiles.length,2);
});
test('a body reached before the clash takes the hit instead',()=>{
 const {w,h,b}=players();b.x=490;b.y=400;
 const a=shot(w,h,{x:440,vx:900}),c=shot(w,b,{x:700,vx:-900});
 const ev=step(w);assert.equal(ev.some(e=>e.type==='projectileClash'),false);
 assert.ok(ev.some(e=>e.type==='hit'&&e.dst===b.id));assert.ok(w.projectiles.some(p=>p.id===c.id));
});
test('each projectile clashes at most once; the earliest pair wins',()=>{
 const {w,h,b}=players();const a=shot(w,h,{x:480,vx:900}),near=shot(w,b,{x:510,vx:-900}),far=shot(w,b,{x:540,vx:-900});
 const ev=step(w),cl=ev.filter(e=>e.type==='projectileClash');
 assert.equal(cl.length,1);assert.deepEqual([cl[0].a,cl[0].b].sort(),[a.id,near.id].sort());
 assert.ok(w.projectiles.some(p=>p.id===far.id));
});
test('piercing and exploding shots are consumed without damage on clash',()=>{
 const {w,h,b}=players();shot(w,h,{x:480,vx:900,pierce:4,ability:'sword_wave'});shot(w,b,{x:520,vx:-900,ability:'ember_bolt'});
 const ev=step(w);assert.ok(ev.find(e=>e.type==='projectileClash'));assert.equal(ev.some(e=>e.type==='explode'),false);
 assert.equal(w.projectiles.length,0);
});
