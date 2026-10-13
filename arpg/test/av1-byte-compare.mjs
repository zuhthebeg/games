// Exact Buffer comparison, not just digest equality. Historical module is loaded read-only
// from the requested abcd094 world source, never restored into the worktree.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import * as current from '../js/sim/world.js';
import { STAGES } from '../js/content/combat.js';
import { FORMS } from './av1-world-trace.mjs';
import { withoutCombos } from './av1-dps.mjs';
export async function compareBaselineBytes() {
  let source=execFileSync('git',['show','abcd094:arpg/js/sim/world.js'],{encoding:'utf8'});
  source=source.replace(/from '([^']+)'/g,(_,p)=>'from '+JSON.stringify(new URL(p,new URL('../js/sim/world.js',import.meta.url)).href));
  const baseline=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  return withoutCombos(()=>{
    const sha=createHash('sha256');let bytes=0,records=0;
    for(const stage of Object.keys(STAGES))for(const seed of [11,73,991]) {
      const worlds=[baseline,current].map(sim=>{
        const w=sim.createWorld({seed});FORMS.forEach(([weapon,weaponForm],i)=>sim.addPlayer(w,{pid:`p${i}`,weapon,x:160+i*48,y:180+i*95,mods:{weaponForm,maxHp:10000,critChance:0,weaponWeight:8}}));sim.startStage(w,stage);return w;
      });
      for(let t=0;t<900;t++) {
        const inputs=Object.fromEntries(FORMS.map((_,i)=>[`p${i}`,{...current.emptyInput(),attack:i%2===0,autoAttack:i%2===1,mx:t%180<90?.35:-.35,my:t%240<120?.2:-.2,skillEdge:t%210===0,dodgeEdge:t%170===0}]));
        const buffers=[baseline,current].map((sim,i)=>Buffer.from(JSON.stringify({world:worlds[i],events:sim.step(worlds[i],inputs)})+'\n'));
        assert.equal(Buffer.compare(buffers[0],buffers[1]),0,`${stage}/${seed}/${t}`);sha.update(buffers[0]);bytes+=buffers[0].length;records++;
      }
    }
    return {baseline:'abcd0944e16894364c134e42c8e800ec91cf1ed3',exactBufferCompare:true,stages:Object.keys(STAGES).length,seeds:3,forms:5,ticks:900,records,bytes,sha256:sha.digest('hex')};
  });
}
if(process.argv[1]?.endsWith('av1-byte-compare.mjs'))writeFileSync(process.argv[2],JSON.stringify(await compareBaselineBytes(),null,2)+'\n');
