// Bounded serialized world/event regression against a separate baseline worktree.
// node arpg/test/knight-human-traces.mjs /absolute/baseline/root [output.json]
import {createHash} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const baseline=pathToFileURL(resolve(process.argv[2])+'/'),current=new URL('../../',import.meta.url),rows=[];
for(const root of [baseline,current]){
 const {createWorld,addPlayer,startStage,step,emptyInput}=await import(new URL('arpg/js/sim/world.js',root));const traces=[];
 for(const [stage,weapon] of [['S1','blade'],['S2','blade'],['S2','bow'],['S2','focus'],['M_MINE_CART','blade'],['M_MARSH_MARKERS','blade']]){
  const world=createWorld({seed:73});addPlayer(world,{pid:'local',weapon,mods:{maxHp:10000}});startStage(world,stage);const hash=createHash('sha256');
  for(let t=0;t<1000;t++){const events=step(world,{local:{...emptyInput(),autoAttack:true,mx:t%180<90?.35:-.35,my:t%240<120?.2:-.2,skillEdge:t%210===0,dodgeEdge:t%170===0}});hash.update(JSON.stringify({world,events}));}
  traces.push({stage,weapon,sha256:hash.digest('hex')});
 }rows.push(traces);
}
assert.deepEqual(rows[1],rows[0]);const result={pass:true,baseline:baseline.href,ticks:1000,traces:rows[0]};if(process.argv[3])writeFileSync(process.argv[3],JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
