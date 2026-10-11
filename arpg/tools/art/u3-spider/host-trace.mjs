// Read-only 9 x 900-tick S7/spider host regression digest; capture before and after render edits.
import { createHash } from 'node:crypto';
import {createWorld,addPlayer,startStage,step,emptyInput} from '../../../js/sim/world.js';
const result=[];
for(const seed of [1,42,999]) for(const weapon of ['blade','bow','focus']) {
  const world=createWorld({seed});
  addPlayer(world,{pid:'a',weapon,mods:{maxHp:10000}});startStage(world,'S7');
  const hash=createHash('sha256');
  for(let tick=0;tick<900;tick++) {
    step(world,{a:{...emptyInput(),mx:Math.sin(tick/20),my:Math.cos(tick/31),
      attack:tick%50<30,dodgeEdge:tick%97===0,skillEdge:tick%160===0}});
    hash.update(JSON.stringify(world,(key,value)=>key==='def'?undefined:value));
  }
  result.push({stage:'S7',weapon,seed,ticks:900,sha256:hash.digest('hex')});
}
console.log(JSON.stringify(result,null,2));
