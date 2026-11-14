// Scene-space metrics only. No screenshots, video, traces or capture APIs.
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=createRequire('/home/cocy/.openclaw/workspace/')('playwright');
const base=process.argv[2]||'http://127.0.0.1:8791';
const out=process.argv[3]||'tmp/r11b/charge-walk-metrics.json';
const baseline=execFileSync('git',['show','05823b60:beasthunt/js/gs-motion.js'],{encoding:'utf8'});
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const results=[];
 for(const low of [false,true]){
  const context=await browser.newContext({reducedMotion:low?'reduce':'no-preference'}),errors=[];
  await context.route('**/*',r=>{
   const u=new URL(r.request().url());
   if(u.origin!==base)return r.abort();
   if(u.searchParams.has('r11ChargeWalkBaseline'))return r.fulfill({contentType:'text/javascript',body:baseline});
   return r.continue();
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/beasthunt/'+(low?'?lowfx=1':''));await page.waitForFunction(()=>window.__bh);
  const metrics=await page.evaluate(async()=>{
   const T=await import('three'),M=await import('bh/models'),G=await import('bh/gs-motion');
   const Old=await import('/beasthunt/js/gs-motion.js?r11ChargeWalkBaseline=1');
   const {Sim}=await import('/beasthunt/js/sim.js'),{QUESTS,WTYPES}=await import('bh/data');
   const {GuestReplication}=await import('/beasthunt/js/net/replication.js'),{encodeHunter}=await import('/beasthunt/js/net/protocol.js');
   const V=()=>new T.Vector3(),Q=()=>new T.Quaternion();
   const rows=[],transitions=[],actual=[],wire=[];let finiteSamples=0,gripMax=0,baselineGripMax=0,gripDelta=0,chargeGripMax=0,baselineChargeGripMax=0,upperAngle=0,upperPosition=0,rootError=0;
   async function pair(){const H=M.buildHunter('gs',1,1),B=M.buildHunter('gs',1,1);await Promise.all([H.ready,B.ready]);return{H,B};}
   function sync(pair,p,dt){
    G.syncHunterGS(p,pair.H,dt,0);Old.syncHunterGS(p,pair.B,dt,0);
    for(const h of [pair.H,pair.B]){
     h.root.updateMatrixWorld(true);
     for(const b of Object.values(h.gs.bones))if(![...b.matrixWorld.elements,...b.quaternion.toArray(),...b.position.toArray()].every(Number.isFinite))throw Error('Nonfinite bone '+b.name);
    }
    finiteSamples++;const g=pair.H.gs,b=pair.B.gs;
    const palm=g.bones.RightHand.getWorldPosition(V()).add(g.bones.RightHandMiddle1.getWorldPosition(V())).multiplyScalar(.5);
    if(g.ikEnabled&&b.ikEnabled){
     const residual=Math.max(g.bones.LeftHand.getWorldPosition(V()).distanceTo(g.target.getWorldPosition(V())),palm.distanceTo(g.socket.getWorldPosition(V())));
     gripMax=Math.max(gripMax,residual);baselineGripMax=Math.max(baselineGripMax,b.ikDistance);gripDelta=Math.max(gripDelta,residual-b.ikDistance);
     if(p.state==='charge'){chargeGripMax=Math.max(chargeGripMax,residual);baselineChargeGripMax=Math.max(baselineChargeGripMax,b.ikDistance);}
    }
    if(p.state==='charge'){
     const a=g.bones.Spine.getWorldQuaternion(Q()),c=b.bones.Spine.getWorldQuaternion(Q());
     upperAngle=Math.max(upperAngle,a.normalize().angleTo(c.normalize()));
     const gp=g.bones.Spine.getWorldPosition(V()),bp=b.bones.Spine.getWorldPosition(V());gp.y-=g.chargeWalkLift||0;
     upperPosition=Math.max(upperPosition,gp.distanceTo(bp));
    }
    rootError=Math.max(rootError,pair.H.root.position.distanceTo(new T.Vector3(p.x,0,p.z)));
    return g;
   }
   // Measured directional travel, repeated stages, holds, both aim bases and
   // FPS. No p.walk/p.moving is supplied: this is also the remote pose contract.
   for(const fps of [10,30,60,144])for(const yaw of [0,.7])for(const direction of [0,Math.PI/2,Math.PI,-Math.PI/2]){
    const pair0=await pair(),dt=1/fps,dx=Math.sin(yaw+direction),dz=Math.cos(yaw+direction),speed=1.89;
    let g,last=null,slip=0,oldSlip=0,n=0,minAlong=99,maxAlong=-99,minAcross=99,maxAcross=-99,minToe=99,maxToe=-99,maxLegStep=0,lastLeg=null;
    for(let i=0;i<=fps*3;i++){
     const p={state:'charge',t:i*dt,x:dx*i*dt*speed,z:dz*i*dt*speed,yaw,clv:Math.min(3,i*dt*2),weapon:'gs'};g=sync(pair0,p,dt);
     const feet=['LeftToeBase','RightToeBase'].map(name=>g.bones[name].getWorldPosition(V()));
     const oldFeet=['LeftToeBase','RightToeBase'].map(name=>pair0.B.gs.bones[name].getWorldPosition(V()));
     if(i>fps){
      for(const foot of feet){const x=foot.x-p.x,z=foot.z-p.z,along=x*dx+z*dz,across=x*dz-z*dx;minAlong=Math.min(minAlong,along);maxAlong=Math.max(maxAlong,along);minAcross=Math.min(minAcross,across);maxAcross=Math.max(maxAcross,across);minToe=Math.min(minToe,foot.y);maxToe=Math.max(maxToe,foot.y);}
      const side=feet[0].y<feet[1].y?0:1;
      if(last){const d=feet[side].clone().sub(last.feet[side]),bd=oldFeet[side].clone().sub(last.oldFeet[side]);slip+=Math.hypot(d.x,d.z)/dt;oldSlip+=Math.hypot(bd.x,bd.z)/dt;n++;}
     }
     const leg=g.bones.LeftUpLeg.quaternion.clone();if(lastLeg)maxLegStep=Math.max(maxLegStep,leg.clone().normalize().angleTo(lastLeg.clone().normalize()));lastLeg=leg;
     last={feet,oldFeet};
    }
    const phase=g.chargeWalkPhase,held=g.chargeWalkSamplePhase,leg=g.bones.LeftUpLeg.quaternion.clone();
    for(let i=0;i<fps;i++)g=sync(pair0,{state:'charge',t:3.5+i*dt,x:dx*3*speed,z:dz*3*speed,yaw,clv:3},dt);
    const freezeError=Math.max(Math.abs(g.chargeWalkPhase-phase),Math.abs(g.chargeWalkSamplePhase-held),leg.clone().normalize().angleTo(g.bones.LeftUpLeg.quaternion.clone().normalize()));
    g=sync(pair0,{state:'charge',t:4.5,x:dx*(3*speed+.2),z:dz*(3*speed+.2),yaw,clv:3},dt);
    rows.push({fps,yaw,direction,phase,expected:3*speed/g.chargeWalkStride,freezeError,restartAdvance:g.chargeWalkPhase-phase,along:maxAlong-minAlong,across:maxAcross-minAcross,minToe,maxToe,stanceSlip:slip/n,baselineSlip:oldSlip/n,maxLegStep});
   }
   // Rest holds and stage updates must remain deterministic even at dt=0.
   const heldPair=await pair();sync(heldPair,{state:'charge',t:.2,x:0,z:0,yaw:.4},0);
   sync(heldPair,{state:'charge',t:.2,x:.2,z:.1,yaw:.4},0);
   const holdPhase=heldPair.H.gs.chargeWalkPhase;
   for(const t of [.2,.49,.5,.99,1,1.49,1.5,9])for(let j=0;j<4;j++)sync(heldPair,{state:'charge',t,x:.2,z:.1,yaw:.4,clv:t*2},0);
   const zeroDtPhaseError=Math.abs(heldPair.H.gs.chargeWalkPhase-holdPhase);
   // All exits including immediate attacks, fades and IK-disabled down/roll.
   // Compare final local/world matrices with the exact committed baseline, not
   // just a helper offset field. Charge again to check clean interruption/restart.
   for(const state of ['idle','atk','guard','hit','stun','down','roll','dead','drink'])for(const dt of [0,1/60,.2]){
    const pair0=await pair();let p={state:'charge',t:1.5,x:0,z:0,yaw:.3,clv:3};sync(pair0,p,dt);
    for(let i=1;i<=30;i++)sync(pair0,{...p,x:i*.015,z:i*.025},dt);
    let residual=0,immediate=0;
    const cur=WTYPES.gs.heavy;
    for(let i=0;i<=30;i++){
     const dur={down:1.15,roll:.62,hit:.42,stun:1.25,dead:2.3,drink:1.25,atk:cur.dur}[state]||1;
     p={state,t:i*dur/30,x:.45,z:.75,yaw:.3,combo:-1,cur};const g=sync(pair0,p,dt);
     for(const name of Object.keys(g.bones)){
      const a=g.bones[name],b=pair0.B.gs.bones[name];
      const e=Math.max(a.position.distanceTo(b.position),1-Math.abs(a.quaternion.dot(b.quaternion)),a.getWorldPosition(V()).distanceTo(b.getWorldPosition(V())));
      residual=Math.max(residual,e);if(i===0)immediate=Math.max(immediate,e);
     }
     residual=Math.max(residual,Math.abs(g.model.position.y-pair0.B.gs.model.position.y));
     if(g.chargeWalkApplied||g.chargeWalkLift||g.chargeWalkHeld)throw Error('Charge offset survives '+state);
    }
    sync(pair0,{state:'charge',t:0,x:.45,z:.75,yaw:.3,clv:0},dt);
    const enterPhase=pair0.H.gs.chargeWalkPhase;
    sync(pair0,{state:'charge',t:.1,x:.55,z:.75,yaw:.3,clv:0},dt);
    transitions.push({state,dt,residual,immediate,enterPhase,restartPhase:pair0.H.gs.chargeWalkPhase});
   }
   // Real fixed-step positions in all 8 input directions; replay the same
   // authoritative poses through local sync and snapshot-shaped remote input.
   for(const [mx,mz] of [[0,127],[0,-127],[127,0],[-127,0],[90,90],[-90,90],[90,-90],[-90,-90]]){
    const s=new Sim(QUESTS[0],{weapon:'gs',w:{gs:1,db:1,bow:1},armor:1},42),pair0=await pair();s.m.state='dead';s.m.t=0;
    const poses=[];for(let i=0;i<120;i++){s.step({p1:{moveX:mx,moveZ:mz,aimYaw:.6,heavy:i===0,heavyHeld:true}});poses.push({...s.p});}
    const charge=poses.filter(p=>p.state==='charge');let distance=0,prev=null;
    for(const p of charge){if(prev)distance+=Math.hypot(p.x-prev.x,p.z-prev.z);sync(pair0,p,1/60);prev=p;}
    const start=charge[0],end=charge.at(-1);
    actual.push({mx,mz,count:charge.length,dx:end.x-start.x,dz:end.z-start.z,distance,phase:pair0.H.gs.chargeWalkPhase,expected:distance/1.65});
    // Actual wire quantization -> authenticated remote replication -> production
    // TickBuffer interpolation/extrapolation. No moving/walk is on this wire.
    const rep=new GuestReplication({hunt:'walk',host:'host',localId:'viewer'}),rp=await pair();let seq=0;
    for(let i=0;i<charge.length;i+=4){const owner={...charge[i],id:'owner'};if(!rep.receive('owner',encodeHunter(owner,i,seq++,'walk'),i*1000/60))throw Error('Remote packet rejected');}
    const buffer=rep.hunters.get('owner'),lastTick=buffer.samples.at(-1).tick;let remoteDistance=0,lastPose=null,freezePhase;
    for(let view=0;view<=lastTick+20;view+=.5){const p=buffer.sample(view);p.t=Math.max(0,(view-p.startTick)/60);p.clv=Math.min(3,p.t/1.5*3);p.inv=0;p.cur=WTYPES.gs.heavy;
     if(lastPose)remoteDistance+=Math.hypot(p.x-lastPose.x,p.z-lastPose.z);sync(rp,p,1/120);lastPose=p;if(view===lastTick+9)freezePhase=rp.H.gs.chargeWalkPhase;
    }
    wire.push({mx,mz,packets:seq,distance:remoteDistance,phaseError:Math.abs(rp.H.gs.chargeWalkPhase-remoteDistance/1.65),freezeError:rp.H.gs.chargeWalkPhase-freezePhase});
   }
   // Remote-style sparse updates (no moving/walk/clv), repeated poses and
   // direction changes at fixed aim. Zero-render-dt correction also advances.
   const remote=await pair();let x=0,z=0,distance=0;sync(remote,{state:'charge',t:0,x,z,yaw:1.1},1/60);
   for(let i=0;i<180;i++){
    const move=i%3===0,dx=move?Math.sin(Math.floor(i/45)*Math.PI/2)*.12:0,dz=move?Math.cos(Math.floor(i/45)*Math.PI/2)*.12:0;x+=dx;z+=dz;distance+=Math.hypot(dx,dz);
    sync(remote,{state:'charge',t:i/60,x,z,yaw:1.1},i%7===0?0:1/60);
   }
   const remotePhaseError=Math.abs(remote.H.gs.chargeWalkPhase-distance/1.65);
   const beforeTeleport=remote.H.gs.chargeWalkPhase;sync(remote,{state:'charge',t:4,x:50,z:50,yaw:1.1},1/60);
   const teleportAdvance=remote.H.gs.chargeWalkPhase-beforeTeleport;
   sync(remote,{state:'charge',t:0,x:50,z:50,yaw:1.1},0);
   const epochReset=remote.H.gs.chargeWalkPhase===0&&!remote.H.gs.chargeWalkHeld&&!remote.H.gs.chargeWalkApplied;
   return {rows,transitions,actual,wire,finiteSamples,gripMax,baselineGripMax,gripDelta,chargeGripMax,baselineChargeGripMax,upperAngle,upperPosition,rootError,zeroDtPhaseError,remotePhaseError,teleportAdvance,epochReset,independent:remote.H.gs.chargeWalkTracks!==remote.B.gs.chargeWalkTracks};
  });
  results.push({low,...metrics,errors});await context.close();
 }
 fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(results,null,2));
 for(const m of results){
  assert.deepEqual(m.errors,[]);assert.equal(m.independent,true);assert.equal(m.epochReset,true);assert.ok(m.chargeGripMax<=m.baselineChargeGripMax+1e-6);assert.equal(m.rootError,0);assert.ok(m.gripDelta<1e-6,'grip no worse than baseline');assert.ok(m.gripMax<1e-5);
  assert.ok(m.upperAngle<1e-6);assert.ok(m.upperPosition<1e-6);assert.equal(m.zeroDtPhaseError,0);assert.ok(m.remotePhaseError<1e-12);assert.equal(m.teleportAdvance,0);
  for(const r of m.rows){assert.ok(Math.abs(r.phase-r.expected)<1e-10);assert.ok(r.freezeError<1e-6);assert.ok(Math.abs(r.restartAdvance-.2/1.65)<1e-10);assert.ok(r.along>.4,'stride must follow travel axis');assert.ok(r.along>r.across*1.3);assert.ok(r.minToe>=.01199);assert.ok(r.maxToe-r.minToe>.025);assert.ok(r.stanceSlip<r.baselineSlip*.65,'less sliding in every direction');}
  for(const r of m.transitions){assert.ok(r.residual<1e-6,JSON.stringify(r));assert.equal(r.enterPhase,0);assert.ok(r.restartPhase>0);}
  for(const r of m.wire){assert.ok(r.packets>20);assert.ok(r.distance>2);assert.ok(r.phaseError<1e-12);assert.equal(r.freezeError,0);}
  for(const r of m.actual){assert.ok(r.count>90);assert.ok(Math.abs(r.phase-r.expected)<1e-10);const wx=Math.sin(.6)*r.mz-Math.cos(.6)*r.mx,wz=Math.cos(.6)*r.mz+Math.sin(.6)*r.mx;assert.ok((r.dx*wx+r.dz*wz)/(Math.hypot(r.dx,r.dz)*Math.hypot(wx,wz))>.999999);assert.ok(r.distance>2);}
 }
 console.log('PASS GS charge-walk full + lowfx/reduced: '+results.reduce((n,m)=>n+m.finiteSamples,0)+' finite poses; 64 direction/FPS runs; 54 exit comparisons; 16 real-sim direction paths + wire/interpolation replays; no capture.');
 console.log(JSON.stringify(results.map(m=>({low:m.low,gripMax:m.gripMax,baselineGripMax:m.baselineGripMax,chargeGripMax:m.chargeGripMax,baselineChargeGripMax:m.baselineChargeGripMax,gripDelta:m.gripDelta,upperAngle:m.upperAngle,upperPosition:m.upperPosition,maxExitResidual:Math.max(...m.transitions.map(r=>r.residual)),maxSlipRatio:Math.max(...m.rows.map(r=>r.stanceSlip/r.baselineSlip))}))));
}finally{await browser.close();}
