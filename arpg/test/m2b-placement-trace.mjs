import {createHash} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {STAGES} from '../js/content/combat.js';
// Isolate the baseline module graph, not a baseline combat table using current simulation imports.
export async function placementTraces(root=new URL('../../',import.meta.url)) {
  const {STAGES}=await import(new URL('arpg/js/content/combat.js',root));
  const {createWorld,addPlayer,startStage,step,emptyInput}=await import(new URL('arpg/js/sim/world.js',root));
  const traces=[];
  for(const stage of Object.keys(STAGES))for(const seed of [1,11,79])for(const weapon of ['blade','bow','focus']){
    const world=createWorld({seed});addPlayer(world,{pid:'a',weapon,mods:{maxHp:10000}});startStage(world,stage);
    const hash=createHash('sha256');
    for(let tick=0;tick<900;tick++){
      const events=step(world,{a:{...emptyInput(),autoAttack:true,mx:tick%180<90?.35:-.35,my:tick%240<120?.2:-.2,skillEdge:tick%210===0,dodgeEdge:tick%170===0}});
      hash.update(JSON.stringify({world,events}));
    }
    traces.push({stage,weapon,seed,ticks:900,sha256:hash.digest('hex')});
  }
  return traces;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const root=process.argv[3]?pathToFileURL(resolve(process.argv[3])+'/'):new URL('../../',import.meta.url);
  writeFileSync(process.argv[2],JSON.stringify(await placementTraces(root),null,2)+'\n');
}

// Legacy mechanics gates retain their original fixtures: undo ONLY the four approved content slots.
// Current-roster traces are independently checked for exactly 36 cumulative changed and 207 identical hashes.
export function legacyPlacementStages(stages) {
  const result=structuredClone(stages);
  for(const [id,index,monster,previous] of [['S8',0,'slime','goblin_grunt'],['S12',2,'goleling','goblin_grunt'],['S17',3,'demon','goblin_grunt'],['S19',3,'succubus','goblin_slinger']]){
    assert.equal(result[id].spawns[index].monster,monster,id+' exact approved placement');
    assert.equal(result[id].spawns.filter(s=>s.monster===monster).length,1,id+' exactly one');
    result[id].spawns[index].monster=previous;
  }
  return result;
}
export function withoutPlacement(fn) {
  legacyPlacementStages(STAGES); // Validate before mutating the test-only roster.
  const slots=[['S8',0,'slime','goblin_grunt'],['S12',2,'goleling','goblin_grunt'],['S17',3,'demon','goblin_grunt'],['S19',3,'succubus','goblin_slinger']];
  try{for(const [id,i,,previous] of slots)STAGES[id].spawns[i].monster=previous;return fn();}
  finally{for(const [id,i,m] of slots)STAGES[id].spawns[i].monster=m;}
}
export const legacyPlacementLoot=source=>source.replace(/  \/\/ M2b placement:[\s\S]*?  \/\/ M2b placement end\.\n/,'').replace(/  \/\/ Succubus placement:[\s\S]*?  \/\/ Succubus placement end\.\n/,'');
