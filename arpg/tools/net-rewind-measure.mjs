import {pathToFileURL,fileURLToPath} from 'node:url';import {existsSync,writeFileSync} from 'node:fs';
const root=process.env.ARPG_ROOT||fileURLToPath(new URL('../..',import.meta.url)),url=p=>pathToFileURL(root+'/arpg/js/'+p).href;
const {createWorld,addPlayer,startStage,spawnMonster,step,emptyInput}=await import(url('sim/world.js'));
const {SnapshotBuffer,encodeSnapshot,InputSender,InputQueue}=await import(url('net/protocol.js'));
const {predictPlayerTick}=await import(url('net/player-prediction.js'));const {shapeHitsCircle}=await import(url('sim/core.js'));
const lag=existsSync(root+'/arpg/js/sim/attack-lag.js')?await import(url('sim/attack-lag.js')):null;
const T=1000/30;
function trial(seed,rtt){
 let rand=seed;const random=()=>{rand=(Math.imul(rand,1664525)+1013904223)>>>0;return rand/4294967296;};
 const phase=random()*Math.PI*2,speed=1.8+random()*1.2,press=65+Math.floor(random()*20);
 const w=createWorld({seed}),p=addPlayer(w,{pid:'g',x:400,y:400}),m=spawnMonster(w,'goblin_grunt',495,400);startStage(w,'S2');w.entities=[p,m];w.round.pending=[];w.round.goal='timer';w.round.timerTicks=100000;m.spawnLeft=0;m.staggerLeft=100000;m.hp=m.maxHp=100000;
 lag?.enableGuestAttackLag(w,'g');const b=new SnapshotBuffer('g',100,{adaptive:false}),q=new InputQueue(),sender=new InputSender(),up=[],down=[];
 let local=structuredClone(p),looked=false,hit=false,pressPose=null,maxAge=0,authAct=null;
 const motion=t=>({x:400+102+18*Math.sin(phase+t*.8),y:400+95*Math.sin(phase+t*speed)});
 for(let i=0;i<press+30;i++){
  const now=i*T;Object.assign(m,motion(now/1000));m.kx=m.ky=0;m.staggerLeft=100000;
  down.sort((a,b)=>a.at-b.at);while(down.length&&down[0].at<=now+1e-6){const r=down.shift();b.push(r.p,r.at);}
  const view=b.sample(now,rtt),seen=view?.entities.find(e=>e.id===m.id);
  const input={...emptyInput(),attack:i===press,aimX:1,poseTick:view?.positionTick??(b.frames.length?Math.max(b.frames[0].world.tick,Math.min(b.play,b.frames.at(-1).world.tick+3)):undefined)};
  if(i===press)pressPose=input.poseTick;
  local=predictPlayerTick(local,input,{arena:w.arena,others:view?.entities||[],tick:i});
  if(local.act?.phase==='active'&&seen&&shapeHitsCircle(local.act.def.shape,local.x,local.y,local.act.facing,seen.x,seen.y,seen.r))looked=true;
  const packet=sender.packet(input);up.push({at:now+rtt/2+(random()-.5)*10,p:packet});up.sort((a,b)=>a.at-b.at);
  while(up.length&&up[0].at<=now+1e-6){const r=up.shift();q.receive(r.p,r.at);}
  const hostInput=q.consume(now);const events=step(w,{g:hostInput});if(p.act&&!authAct){authAct=w.tick;maxAge=Math.min(6,w.tick-1-(hostInput.poseTick??w.tick-1));}
  if(events.some(e=>e.type==='hit'&&e.dst===m.id))hit=true;
  if(w.tick%2===0)down.push({at:now+T+rtt/2+(random()-.5)*10,p:encodeSnapshot(w,{g:q.seq})});
 }
 return {seed,rtt,looked,hit,pressPose,authAct,maxAge};
}
const rows=[];for(const rtt of [0,100,200])for(let seed=1;seed<=500;seed++)rows.push(trial(seed,rtt));
const summary=[0,100,200].map(rtt=>{const r=rows.filter(x=>x.rtt===rtt),looks=r.filter(x=>x.looked),miss=looks.filter(x=>!x.hit);return {rtt,trials:r.length,looked:looks.length,miss:miss.length,missRate:miss.length/looks.length,maxRewindMs:Math.max(...r.map(x=>x.maxAge))*T};});
console.log(JSON.stringify({candidate:!!lag,summary}));if(process.env.ARPG_MEASURE_OUT)writeFileSync(process.env.ARPG_MEASURE_OUT,JSON.stringify({candidate:!!lag,summary,rows}));
