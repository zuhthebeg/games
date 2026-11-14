import fs from 'node:fs';import {execFileSync} from 'node:child_process';import assert from 'node:assert/strict';
import {Sim} from '../js/sim.js';import {QUESTS} from '../js/data.js';
const baseline=new URL('../js/.r10-baseline-sim.js',import.meta.url);fs.writeFileSync(baseline,execFileSync('git',['show','4c1db6a649fdf7870696b12a3ad732589afa6850:beasthunt/js/sim.js']));
try{const {Sim:Old}=await import(baseline.href);let ticks=0;for(const weapon of ['gs','db','bow'])for(const seed of [1,42,999]){
 const save={weapon,w:{gs:1,db:1,bow:1},armor:1},a=new Sim(QUESTS[0],save,seed),b=new Old(QUESTS[0],save,seed);
 for(let i=0;i<1200;i++){const input={p1:{aimYaw:0,moveZ:i<250?127:0,light:i%50===0,heavy:i%300===0,heavyHeld:i%300<110,attackHeld:false,roll:i%200===150}};a.step(input);b.step(input);assert.deepEqual(a.snapshot(),b.snapshot());ticks++;}
 }console.log('PASS 4c1db6a6 baseline exact snapshots '+ticks+' ticks (3 weapons x 3 seeds x 1200)');}finally{fs.unlinkSync(baseline);}
