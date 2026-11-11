// Text-only finite oracle. No sample trimming: every adjacent frame is assigned
// exactly once to continuous or reentry (covered/recovery/epoch boundary).
// node beasthunt/test/raw-gate.mjs [archived frames-2.json] > report.json
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {Sim,FIXED_DT,MA} from '../js/sim.js';
import {QUESTS} from '../js/data.js';
import {FixedClock,interpolatePose} from '../js/fixed.js';
import {HostSession} from '../js/net/host.js';
import {GuestSession} from '../js/net/guest.js';
const save={weapon:'bow',w:{gs:1,db:1,bow:1},armor:1};
const distance=(a,b)=>Math.hypot(a.x-b.x,(a.y||0)-(b.y||0),a.z-b.z);
export function stats(a){const mean=a.length?a.reduce((x,y)=>x+y,0)/a.length:0;return {n:a.length,mean,max:a.length?Math.max(...a):0,cv:mean?Math.sqrt(a.reduce((x,y)=>x+(y-mean)**2,0)/a.length)/mean:0};}
export function summarize(frames){const groups={continuous:[],reentry:[]};for(let i=1;i<frames.length;i++){const a=frames[i-1],b=frames[i];groups[a.epoch!==b.epoch||a.recovery||b.recovery||!a.visible||!b.visible?'reentry':'continuous'].push({move:distance(a,b),speed:distance(a,b)/b.dt,residual:b.residual,drawContact:b.drawContact||0});}return Object.fromEntries(Object.entries(groups).map(([k,a])=>[k,{frames:a.length,over1:a.filter(x=>x.move>1).length,movement:stats(a.map(x=>x.move)),speed:stats(a.map(x=>x.speed)),residual:stats(a.map(x=>x.residual)),drawContact:stats(a.map(x=>x.drawContact))}]));}
function setup(q,k,enr,range,role){const s=new Sim(q,save,42,{role,localId:'p1',partySize:2});Object.assign(s.m,{x:0,z:range==='arena'?39:0,yaw:Math.PI,enr,enrT:100});Object.assign(s.p,{inv:10000,x:0,z:range==='arena'?-39:-(range==='far'?MA[k].max*(MA[k].melee?s.def.scale:1):5)});s.startMonAtk(k);s.drainEvents();return s;}
export function attackRun(q,k,enr,range,dts){
 const actual=setup(q,k,enr,range,'owner'),oracle=setup(q,k,enr,range,'world');
 // Capture actual contact predicate calls without changing monster movement.
 const contacts=[],expectedContacts=[];for(const [s,out] of [[actual,contacts],[oracle,expectedContacts]]){const hurt=s.hurtPlayers.bind(s);s.hurtPlayers=(...args)=>{out.push({tick:s.tick,x:s.m.x,y:s.m.y,z:s.m.z});return hurt(...args);};}
 const ticks=Math.ceil(dts.reduce((a,b)=>a+Math.min(.1,b),0)*60)+2,poses=[{...oracle.m}];
 for(let i=0;i<ticks;i++){oracle.tick++;oracle.updMon(FIXED_DT);oracle.drainEvents();poses.push({...oracle.m});if(oracle.m.state!=='atk'){// Freeze after attack: no arbitrary cross-scenario reset counted as motion.
   for(let j=i+1;j<ticks;j++)poses.push({...oracle.m});break;
 }}
 const c=new FixedClock(),frames=[];let previous={...actual.m},done=false,maxTick=0,tickOver1=0;
 for(const dt of dts){c.advance(dt,()=>{previous={...actual.m};if(!done){actual.tick++;actual.updMon(FIXED_DT);actual.drainEvents();done=actual.m.state!=='atk';}const move=distance(previous,actual.m);maxTick=Math.max(maxTick,move);if(move>1)tickOver1++;});
 const draw=interpolatePose(previous,actual.m,c.alpha),n=actual.tick,expected=interpolatePose(poses[Math.max(0,n-1)],poses[n],c.alpha);
 frames.push({...draw,dt,epoch:0,recovery:null,visible:true,residual:distance(draw,expected),drawContact:distance(draw,actual.m)});
 }
 return {mon:q.mon,attack:k,enr,range,summary:summarize(frames),fixed:{max:maxTick,over1:tickOver1},contactMatch:JSON.stringify(contacts)===JSON.stringify(expectedContacts),contacts,frames};
}
// Execute the production Hunt.frame body with headless presentation sinks. This
// tests the actual draw/visibility/previous/clock wiring, without GPU claims.
const gameSource=fs.readFileSync(new URL('../js/game.js',import.meta.url),'utf8');
const frameBody=gameSource.slice(gameSource.indexOf('  frame(rdt) {'),gameSource.indexOf('  // ---------- presentation ----------')).trim();
function frameAdapter(g,now){
 const vector=()=>({x:0,y:0,z:0,set(x,y,z){Object.assign(this,{x,y,z});}});
 const h={session:g,sim:g.sim,ticker:new FixedClock(),previous:g.sim.snapshot(),localId:'b',cy:0,
  in:{take:()=>false,clear(){},sample(){const s=g.sim,p=s.p,dx=s.m.x-p.x,dz=s.m.z-p.z;p.inv=1000;return {aimYaw:Math.atan2(dx,dz),moveZ:Math.hypot(dx,dz)>15?127:0,light:s.tick%35===0};}},
  H:{root:{position:vector(),rotation:{}}},G:{root:{position:vector(),rotation:{}}},parts:[],projPool:[],arrowPool:[],arena:{update(){}},
  updCam(){},presentEvents(){},syncModels(){},syncProjectiles(){},updHud(){},skipRender:true};
 for(const key of ['p','m','stop','slow','clock'])Object.defineProperty(h,key,{get:()=>g.sim[key]});
 h.frame=Function('interpolatePose','performance','document','return function '+frameBody)(interpolatePose,{now},{hidden:false});
 return h;
}
export function sessionRun(dts,wallDts=dts){let now=0,g;const claims=[];const h=new HostSession({quest:QUESTS[1],roster:{a:{save},b:{save}},hunt:'raw',host:'a',transport:{sendState:p=>g?.receive('a',p,now),sendEvent:p=>g?.receive('a',p,now)}});g=new GuestSession({quest:QUESTS[1],save,hunt:'raw',host:'a',uid:'b',transport:{sendState:p=>{if(p.type==='hit')claims.push(p);h.receive('b',p,now);},sendEvent:p=>h.receive('b',p,now)}});h.initial();
 const hc=new FixedClock(),adapter=frameAdapter(g,()=>now),history=[{tick:0,m:{...h.sim.m}}],frames=[];
 for(const [index,dt] of dts.entries()){now+=wallDts[index]*1000;hc.advance(wallDts[index],()=>{h.tick();history.push({tick:h.sim.tick,m:{...h.sim.m}});});adapter.frame(dt);
 const m=adapter.G.root.position,vt=g.rep.clock.playTick,at=Math.max(0,(vt??0)-1+adapter.ticker.alpha),lo=Math.min(history.length-1,Math.floor(at)),hi=Math.min(history.length-1,lo+1),ref=interpolatePose(history[lo].m,history[hi].m,at-lo);
 frames.push({...m,dt,wallDt:wallDts[index],epoch:g.epoch,recovery:g.recovery?.phase??null,visible:adapter.G.root.visible,hostTick:h.sim.tick,playTick:vt,ownerTick:g.sim.tick,phase:g.sim.m.ak,attackTime:g.sim.m.t,residual:distance(m,ref),drawContact:distance(m,g.sim.m)});
 }
 return {summary:summarize(frames),claims:{sent:claims.length,accepted:h.claims.accepted,rejected:h.claims.rejected,reasons:h.claims.reasons,rate:claims.length?h.claims.accepted/claims.length:null},ownerCorrections:g.positionCorrections,recovery:g.recoveryMetrics,frames};
}
export function runGate(live=[]){const streams=[30,60,120].map(hz=>({name:hz+'Hz',dts:Array(hz*5).fill(1/hz),fight:Array(hz*45).fill(1/hz)}));live.forEach((a,i)=>streams.push({name:'archived-dt-peer'+i,dts:a.map(f=>f.dt),fight:a.map(f=>f.dt),wall:a.map((f,n)=>n?(f.at-a[n-1].at)/1000:f.dt)}));return streams.map(({name,dts,fight,wall})=>{const attacks=[];for(const q of QUESTS.slice(0,3))for(const k of Object.keys(new Sim(q,save).def.atks))for(const enr of [false,true])for(const range of ['near','far',...(k==='leap'?['arena']:[])])attacks.push(attackRun(q,k,enr,range,dts));const session=sessionRun(fight,wall);const gapFight=[...fight];gapFight[Math.floor(gapFight.length/2)]=1;const epochSession=sessionRun(gapFight);return {name,attackSummary:attacks.reduce((a,r)=>{for(const key of ['continuous','reentry']){a[key].over1+=r.summary[key].over1;a[key].frames+=r.summary[key].frames;}return a;},{continuous:{over1:0,frames:0},reentry:{over1:0,frames:0}}),attacks,session,epochSession};});}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const live=process.argv[2]?JSON.parse(fs.readFileSync(process.argv[2],'utf8')):[];console.log(JSON.stringify({method:'all adjacent frames; 3D root meters; CV=population SD/mean speed incl zeros; residual vector norm against tick-indexed world oracle; session residual vs world playback pose, not self oracle; arena=stress opposite arena endpoints; archived dt only, not live wire replay',rows:runGate(live)},null,2));}
