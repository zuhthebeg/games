import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {execFileSync}from'node:child_process';
import {Sim}from'../js/sim.js';import {QUESTS,ROLL_HIT_MULT}from'../js/data.js';
const save=weapon=>({weapon,w:{gs:1,db:1,bow:1},armor:1});
const url=new URL('../js/.r11a-baseline.js',import.meta.url);fs.writeFileSync(url,execFileSync('git',['show','d723a42d:beasthunt/js/sim.js']));const {Sim:Old}=await import(url.href);fs.unlinkSync(url);
test('R11A invulnerable early roll and half-damage late roll complete without hit/down interruption',()=>{
assert.equal(ROLL_HIT_MULT,.5);for(const w of ['gs','db','bow'])for(const heavy of [false,true]){const a=new Sim(QUESTS[0],save(w)),b=new Old(QUESTS[0],save(w));a.startRoll(0);const p=a.p;p.t=.2;p.inv=.18;const hp=p.hp;assert.equal(a.hurt(30,0,0,heavy),false);assert.equal(p.hp,hp);p.t=.4;p.inv=0;b.hurt(30,0,0,heavy);const full=b.p.maxHp-b.p.hp;assert.ok(a.hurt(30,0,0,heavy));assert.equal(hp-p.hp,Math.max(1,Math.round(full*.5)));assert.equal(p.state,'roll');assert.equal(p.t,.4);assert.equal(p.inv,.25);assert.equal(a.hurt(30,0,0,heavy),false);p.hp=1;p.inv=0;assert.ok(a.hurt(30,0,0,heavy));assert.equal(p.state,'dead');}
});
test('R11A non-roll damage, guard, death and events are exact baseline equal',()=>{
for(const w of ['gs','db','bow'])for(const state of ['idle','guard','atk','charge','hit','stun','down','dead'])for(const heavy of [false,true]){const a=new Sim(QUESTS[0],save(w)),b=new Old(QUESTS[0],save(w));for(const s of [a,b]){s.p.state=state;s.p.t=.45;s.p.inv=0;s.p.yaw=0;s.p.x=0;s.p.z=-2;}assert.equal(a.hurt(30,0,1,heavy),b.hurt(30,0,1,heavy));assert.deepEqual(a.snapshot(),b.snapshot());assert.deepEqual(a.drainEvents(),b.drainEvents());}
});
test('R11A world/nonlocal owner may not damage; local owner mitigation retains authority guard',()=>{
for(const net of [{role:'world',partySize:1,localId:'p1'},{role:'owner',localId:'other'},{role:'owner',localId:'p1'}]){const s=new Sim(QUESTS[0],save('db'),1,net);s.startRoll(0);s.p.inv=0;s.p.t=.4;const before=s.p.hp;const accepted=s.hurt(32,0,0,true);assert.equal(accepted,net.role==='owner'&&net.localId==='p1');assert.equal(before-s.p.hp,accepted?16:0);assert.equal(s.p.state,'roll');}
});
test('R11A no-dodge bot 10800 snapshots and events remain exact d723a42d baseline',()=>{
let ticks=0;for(const w of ['gs','db','bow'])for(const seed of [1,42,999]){const a=new Sim(QUESTS[0],save(w),seed),b=new Old(QUESTS[0],save(w),seed);for(let i=0;i<1200;i++){const input={p1:{aimYaw:0,moveZ:i<250?127:0,light:i%50===0,heavy:i%300===0,heavyHeld:i%300<110}};a.step(input);b.step(input);assert.deepEqual(a.snapshot(),b.snapshot());assert.deepEqual(a.drainEvents(),b.drainEvents());ticks++;}}assert.equal(ticks,10800);
});
