// Actual monster contact timeline; stationary overlap fixture isolates timing.
// Root is re-centred at each attack contact, not a claim about dodge path efficacy.
import fs from 'node:fs';import {Sim,MA} from '../js/sim.js';import {QUESTS} from '../js/data.js';
export function measure(Type=Sim){const rows=[];for(const kind of ['sweep','breath','stomp','charge'])for(const lead of [.05,.25,.40,.50]){
const s=new Type(QUESTS[0],{weapon:'db',w:{gs:1,db:1,bow:1},armor:1},1),p=s.p,A=MA[kind];p.hp=p.maxHp=10000;s.m.x=s.m.z=0;s.m.yaw=0;s.startMonAtk(kind);s.m.t=A.w-lead;s.startRoll(0);const hits=[];const hurt=s.hurt.bind(s);s.hurt=(...args)=>{const state=p.state,t=p.t,hp=p.hp,inv=p.inv,ok=hurt(...args);if(ok)hits.push({state,t:+t.toFixed(3),damage:hp-p.hp,after:p.state,inv});return ok;};
for(let i=0;i<Math.ceil((lead+.9)*60);i++){const dt=1/60;p.t+=dt;p.inv=Math.max(0,p.inv-dt);if(p.state==='roll'&&p.t>=.62)p.state='idle';else if(p.state==='hit'&&p.t>=.42)p.state='idle';s.m.t+=dt;const [hx,hz]=s.mPt(0,s.def.dims.headZ+.6);if(kind==='breath'){p.x=hx;p.z=hz+4;}else if(kind==='stomp'){const [x,z]=s.mPt(0,s.def.dims.headZ*.7);p.x=x;p.z=z;}else {p.x=s.m.x+.1;p.z=s.m.z+.1;}s.updMonAtk(dt,4,0,0,0);}
rows.push({kind,lead,hits,rollHits:hits.filter(h=>h.state==='roll').length,rollDamage:hits.filter(h=>h.state==='roll').reduce((a,h)=>a+h.damage,0),total:hits.reduce((a,h)=>a+h.damage,0)});
}return rows;}
if(process.argv[1]===new URL(import.meta.url).pathname){const out=measure();if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(out,null,2));console.log(JSON.stringify(out));}
