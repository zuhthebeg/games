// Read-only all-stage host digest; run identical script on main and U1 checkout.
import { createHash } from 'node:crypto';
import { STAGES } from '../../../js/content/combat.js';
import {createWorld,addPlayer,startStage,step,emptyInput} from '../../../js/sim/world.js';
const result=[];
for(const stage of Object.keys(STAGES)) for(const seed of [1,42,999]) for(const weapon of ['blade','bow','focus']) {
  const world=createWorld({seed});
  addPlayer(world,{pid:'a',weapon,mods:{maxHp:10000}});startStage(world,stage);
  const hash=createHash('sha256');
  for(let tick=0;tick<900;tick++) {
    step(world,{a:{...emptyInput(),mx:Math.sin(tick/20),my:Math.cos(tick/31),
      attack:tick%50<30,dodgeEdge:tick%97===0,skillEdge:tick%160===0}});
    hash.update(JSON.stringify(world,(key,value)=>key==='def'?undefined:value));
  }
  result.push({stage,weapon,seed,ticks:900,sha256:hash.digest('hex')});
}
console.log(JSON.stringify(result,null,2));
