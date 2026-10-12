import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const base=new URL('../tools/art/original-dragon/',import.meta.url);
test('original dragon procedural source has no model import and validated four legs / two wings',async()=>{
 const source=await readFile(new URL('generate.py',base),'utf8');
 assert.ok(!source.includes('import_scene'));
 const proof=JSON.parse(await readFile(new URL('validation.json',base),'utf8'));
 assert.equal(proof.ok,true);assert.equal(proof.geometry.legs,4);assert.equal(proof.geometry.wings,2);assert.equal(proof.geometry.claws,12);
 assert.equal(proof.clipped_frames,0);assert.equal(proof.frames,264);assert.equal(proof.lossless_alpha_verified,264);
 assert.equal(proof.non_dragon_manifest_unchanged,true);assert.equal(proof.js_unchanged,true);
});

test('original sprite replacement retains behind-scarecrow nonattacking sample and exact S1 30s clear',async()=>{
 const {createWorld,addPlayer,startStage,step,emptyInput}=await import('../js/sim/world.js');
 const {ticks}=await import('../js/sim/core.js');
 const {MONSTERS}=await import('../js/content/combat.js');
 assert.equal(MONSTERS.training_dragon.invulnerable,true);assert.equal(MONSTERS.training_dragon.speed,0);assert.equal(MONSTERS.training_dragon.xp,0);assert.deepEqual(MONSTERS.training_dragon.abilities,[]);
 const w=createWorld({seed:9});addPlayer(w,{pid:'a'});startStage(w,'S1');step(w,{a:emptyInput()});
 const d=w.entities.find(e=>e.type==='training_dragon'),s=w.entities.find(e=>e.type==='scarecrow');
 assert.ok(d.x>s.x);assert.equal(d.y,s.y);const start={x:d.x,y:d.y};
 for(let i=1;i<ticks(30000)-1;i++){step(w,{a:emptyInput()});assert.equal(d.hp,1);assert.equal(d.dead,false);assert.equal(d.act,null);assert.equal(d.moving,false);}
 assert.equal(w.round.state,'running');assert.equal(d.x,start.x);assert.equal(d.y,start.y);
 step(w,{a:emptyInput()});assert.equal(w.round.state,'clear');
});
