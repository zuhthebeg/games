import {createHash} from 'node:crypto';
import {createWorld,addPlayer,startStage,step,emptyInput} from '../../../js/sim/world.js';
import {STAGES} from '../../../js/content/combat.js';
const result=[];
for(const stageId of Object.keys(STAGES)) for(const seed of [1,42,999]) for(const weapon of ['blade','bow','focus']) {
 const world=createWorld({seed});addPlayer(world,{pid:'a',weapon,mods:{maxHp:10000}});startStage(world,stageId);const hash=createHash('sha256');
 for(let t=0;t<900;t++){step(world,{a:{...emptyInput(),mx:Math.sin(t/20),my:Math.cos(t/31),attack:t%50<30,dodgeEdge:t%97===0,skillEdge:t%160===0}});hash.update(JSON.stringify(world,(k,v)=>k==='def'?undefined:v));}
 result.push({stage:stageId,weapon,seed,ticks:900,sha256:hash.digest('hex')});
}
console.log(JSON.stringify(result,null,2));
