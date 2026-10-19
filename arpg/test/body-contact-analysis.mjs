// Paired deterministic contact measurement. Fixture world setup is test-only;
// native verification uses natural inputs and never mutates a running world.
import {createWorld,addPlayer,spawnMonster,step,startStage,emptyInput} from '../js/sim/world.js';
import {LocalPrediction} from '../js/net/prediction.js';
import {encodeSnapshot,SnapshotBuffer} from '../js/net/protocol.js';
import {pathToFileURL} from 'node:url';
const T=1000/30,pct=(a,p)=>[...a].sort((a,b)=>a-b)[Math.max(0,Math.ceil(a.length*p)-1)]||0;
export function contactMeasurements(){const rows=[];
 for(const rtt of [0,80,160])for(const moving of [false,true])for(const area of ['open','wall','corner']){
 const w=createWorld({seed:61}),p=addPlayer(w,{pid:'g',x:area==='open'?500:17,y:area==='corner'?17:400,mods:{maxHp:100000}}),m=spawnMonster(w,'goblin_grunt',p.x+34,p.y);startStage(w,'S1');w.entities=[p,m];w.round.pending=[];w.round.goal='timer';w.round.timerTicks=100000;p.x=area==='open'?500:17;p.y=area==='corner'?17:400;m.x=p.x+34;m.y=p.y;m.spawnLeft=0;
 // Stationary test body is staggered, NOT frozen: it retains its ordinary mass.
 if(!moving)m.staggerLeft=100000;
 const prediction=new LocalPrediction('g'),buffer=new SnapshotBuffer('g',100,{adaptive:false}),queue=[],overlaps=[],visibleOverlaps=[],jumps=[],corrections=[],positions=[];let seq=0,prev=null;
 const push=(tick,ack)=>queue.push({at:tick*T+rtt/2,packet:encodeSnapshot(w,{g:ack})});push(0,0);
 for(let i=0;i<360;i++){
 const now=i*T;
 while(queue.length&&queue[0].at<=now){const q=queue.shift();buffer.push(q.packet,now);prediction.reconcile(buffer.frames.at(-1).world);const c=prediction.stats.lastCorrection;if(c&&prediction.stats.corrections>corrections.length)corrections.push(c.distance);}
 // Move toward the monster in open space; into wall/corner once at contact.
 const dx=area==='open'?1:-1,dy=area==='corner'?-1:0,input={...emptyInput(),mx:dx,my:dy};
 prediction.advance({seq:++seq,v:[dx,dy,0,0]},input,T);
 // Host applies the same command after the uplink delay. Deterministic integer delay.
 const lag=Math.ceil(rtt/2/T);step(w,{g:i>=lag?input:emptyInput()});if(i%2===1)push(i+1,Math.max(0,seq-lag));
 if(i>30){overlaps.push(Math.max(0,p.r+m.r-Math.hypot(p.x-m.x,p.y-m.y)));const sample=buffer.sample(now);if(sample){const view=prediction.view(sample),q=view.entities.find(e=>e.pid==='g'),b=view.entities.find(e=>e.id===m.id);visibleOverlaps.push(Math.max(0,q.r+b.r-Math.hypot(q.x-b.x,q.y-b.y)));if(prev)jumps.push(Math.hypot(q.x-prev.x,q.y-prev.y));prev=q;positions.push([q.x,q.y]);}}
 }
 rows.push({rtt,moving,area,authorityOverlap:{max:Math.max(...overlaps),p95:pct(overlaps,.95)},visibleOverlap:{max:Math.max(...visibleOverlaps),p95:pct(visibleOverlaps,.95)},visibleStep:{max:Math.max(...jumps),p95:pct(jumps,.95)},correction:prediction.diagnostics(),positions});
 }return rows;}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(contactMeasurements(),null,2));
