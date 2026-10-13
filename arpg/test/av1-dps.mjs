import { writeFileSync } from 'node:fs';
import { ABILITIES } from '../js/content/combat.js';
import { createWorld, addPlayer, spawnMonster, step, emptyInput } from '../js/sim/world.js';
import { FORMS } from './av1-world-trace.mjs';
export function withoutCombos(fn) {
  const data=['slash','arrow','focus_pulse'].map(id=>[id,ABILITIES[id]]);
  try {
    for(const [id,def] of data) { const {combo,comboWindowMs,...base}=def;ABILITIES[id]=base; }
    return fn();
  } finally { for(const [id,def] of data)ABILITIES[id]=def; }
}
export function dummyDps(weapon,weaponForm,autoAttack=false,mods={}) {
  const w=createWorld({seed:11}),p=addPlayer(w,{pid:'p',weapon,x:400,y:400,mods:{weaponForm,weaponWeight:8,critChance:0,...mods}});
  const m=spawnMonster(w,'scarecrow',465,400);m.spawnLeft=0;
  let damage=0,hits=0,acts=0;const steps=[];
  for(let t=0;t<900;t++) for(const e of step(w,{p:{...emptyInput(),attack:!autoAttack,autoAttack,aimX:1}})) {
    if(e.type==='hit'&&e.src===p.id&&e.dst===m.id){damage+=e.dmg;hits++;}
    if(e.type==='act'&&e.id===p.id){acts++;steps.push(e.step||0);}
  }
  return {damage,dps:damage/30,hits,acts,steps:steps.slice(0,12)};
}
export function dpsTable() {
  return FORMS.flatMap(([weapon,form])=>[false,true].map(auto=>{
    const baseline=withoutCombos(()=>dummyDps(weapon,form,auto)),combo=dummyDps(weapon,form,auto);
    return {weapon,form,mode:auto?'auto':'repeat',baseline,combo,deltaPct:(combo.damage/baseline.damage-1)*100};
  }));
}
if(process.argv[1]?.endsWith('av1-dps.mjs')) {
  const rows=dpsTable();const json=JSON.stringify(rows,null,2)+'\n';
  if(process.argv[2])writeFileSync(process.argv[2],json);else console.log(json);
}
