// Full serialized worlds + events, all current stages. Run before touching baseline sim.
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { STAGES } from '../js/content/combat.js';
import { createWorld, addPlayer, startStage, step, emptyInput } from '../js/sim/world.js';
export const FORMS = [['blade','sword'],['blade','blunt'],['bow','bow'],['focus','wand'],['focus','staff']];
export function comboWorldTraces() {
  const traces = {};
  for (const stage of Object.keys(STAGES)) for (const seed of [11,73,991]) {
    const w = createWorld({seed});
    FORMS.forEach(([weapon,weaponForm], i) => addPlayer(w,{pid:`p${i}`,weapon,x:160+i*48,y:180+i*95,
      mods:{weaponForm,maxHp:10000,critChance:0,weaponWeight:8}}));
    startStage(w,stage);
    const hash=createHash('sha256'); let bytes=0;
    for(let t=0;t<900;t++) {
      const inputs=Object.fromEntries(FORMS.map((_,i)=>[`p${i}`,{...emptyInput(),attack:i%2===0,autoAttack:i%2===1,
        mx:t%180<90?.35:-.35,my:t%240<120?.2:-.2,skillEdge:t%210===0,dodgeEdge:t%170===0}]));
      const events=step(w,inputs), serialized=JSON.stringify({world:w,events})+'\n';
      bytes+=Buffer.byteLength(serialized);hash.update(serialized);
    }
    traces[`${stage}/${seed}`]={sha256:hash.digest('hex'),bytes};
  }
  return {stages:Object.keys(STAGES).length,seeds:[11,73,991],ticks:900,forms:FORMS,traces};
}
if(process.argv[1]?.endsWith('av1-world-trace.mjs')) writeFileSync(process.argv[2],JSON.stringify(comboWorldTraces(),null,2)+'\n');
