import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,addPlayer,startStage,step,emptyInput,spawnMonster} from '../js/sim/world.js';
import {encodeSnapshot,decodeSnapshot} from '../js/net/protocol.js';
import {trackMastery} from '../js/meta/skill-mastery.js';
export function fixture(level=20){const w=createWorld({seed:4});const p=addPlayer(w,{pid:'p',weapon:'focus',x:100,y:400,skillMasteryLevels:{frost_lance:level},mods:{mpRegen:0,skills:['frost_lance']}});startStage(w,'S2');w.entities=[p];w.round.pending=[];w.round.goal='timer';w.round.timerTicks=10000;return {w,p};}
export const input=cast=>({...emptyInput(),aimX:1,skillEdge:cast});
export function targets(w,n=5){return Array.from({length:n},(_,i)=>{const g=spawnMonster(w,'goblin_grunt',180+i*70,400);Object.assign(g,{spawnLeft:0,hp:10000,maxHp:10000,frozenUntil:10000,r:1});return g;});}
test('frost20 real five-target sweep contacts three versus four, damage/resources/mastery once',()=>{for(const level of [19,20,30]){const {w,p}=fixture(level),gs=targets(w),tracker={},hits=[];for(let i=0;i<36;i++){hits.push(...step(w,{p:input(i===0)}).filter(e=>e.type==='hit'));trackMastery(tracker,w.events,w,'p');}assert.equal(hits.length,level<20?3:4);assert.deepEqual(hits.map(e=>e.dmg),Array(level<20?3:4).fill(48));assert.equal(gs[4].hp,10000);assert.equal(p.mp,p.maxMp-12);assert.equal(tracker.skillMastery.frost_lance,1);assert.ok(p.cds.frost_lance>0);}});
test('frost20 reciprocal act and projectile codec markers',()=>{const {w,p}=fixture();step(w,{p:input(true)});assert.equal(p.act.frost20,true);let packet=encodeSnapshot(w);assert.equal(decodeSnapshot(packet,'p').entities[0].act.def.projectile.pierce,3);delete packet.entities[0].act.frost20;assert.equal(decodeSnapshot(packet,'p'),null);while(!w.projectiles.length)step(w,{p:input(false)});assert.equal(w.projectiles[0].frost20,true);packet=encodeSnapshot(w);packet.projectiles[0].frost20=false;assert.equal(decodeSnapshot(packet,'p'),null);});
