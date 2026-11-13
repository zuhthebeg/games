// Requires repository HTTP server on 8791. All assertions are render-only.
import {createRequire} from 'node:module';import {mkdir,writeFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const {chromium}=createRequire('/home/cocy/.openclaw/workspace/')('playwright');
const out=process.env.BH_GS_OUT||'tmp/r8a';await mkdir(out,{recursive:true});
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const errors=[],results=[];
try{
 for(const mode of ['desktop','mobile','lowfx','reduced']){
  const context=await browser.newContext({viewport:{width:mode==='mobile'?390:1000,height:750},hasTouch:mode==='mobile',isMobile:mode==='mobile',reducedMotion:mode==='reduced'?'reduce':'no-preference'});
  await context.addInitScript(()=>{requestAnimationFrame=()=>0;});await context.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:8791/')?r.continue():r.abort());const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource|ERR_|favicon/.test(m.text()))errors.push(m.text().slice(0,500));});
  await page.goto('http://127.0.0.1:8791/beasthunt/'+(mode==='lowfx'?'?lowfx=1':''));await page.waitForFunction(()=>window.__bh);
  const row=await page.evaluate(async mode=>{
   const T=await import('three'),M=await import('bh/models'),motion=await import('bh/gs-motion'),D=await import('bh/data');__bh.save.weapon='gs';__bh.save.w.gs=4;__bh.start('q1');const h=__bh.hunt;await h.H.ready;const H=h.H,g=H.gs,snapshot=JSON.stringify(h.sim.snapshot()),edge=[];
   const base={...h.p,x:0,z:0,yaw:0,spin:0,inv:0};
   if(mode==='desktop')for(const [name,a,combo]of [...D.WTYPES.gs.light.map((a,i)=>['A'+(i+1),a,i]),['Bq',D.WTYPES.gs.combo.moves[3],3],['Bs',D.WTYPES.gs.combo.moves[4],4],['heavy',D.WTYPES.gs.heavy,-1],['legacy-h2',{sw:'h2',h0:.3,h1:.6,dur:1},0]]){
    const samples=[];let maxGrip=0,maxRight=0;for(let i=0;i<=241;i++){const f=i/241,p={...base,state:'atk',t:a.h0+(a.h1-a.h0)*f,cur:a,combo,spin:a.sw==='spin'?f*Math.PI*4:0,z:a.sw==='spin'?f*a.lunge:0};M.syncHunterGS(p,H,0,0);H.root.updateMatrixWorld(true);samples.push({c:g.sword.getObjectByName('hunter-blade').localToWorld(new T.Vector3(0,0,1.06)),n:new T.Vector3(0,0,1).transformDirection(g.sword.matrixWorld)});maxGrip=Math.max(maxGrip,g.bones.LeftHand.getWorldPosition(new T.Vector3()).distanceTo(g.target.getWorldPosition(new T.Vector3())));const palm=g.bones.RightHand.localToWorld(g.bones.RightHandMiddle1.position.clone().multiplyScalar(.5));maxRight=Math.max(maxRight,palm.distanceTo(g.socket.getWorldPosition(new T.Vector3())));}
    let sum=0;for(let i=0;i<samples.length;i++)sum+=Math.abs(samples[i].n.dot(samples[Math.min(samples.length-1,i+1)].c.clone().sub(samples[Math.max(0,i-1)].c).normalize()));edge.push({name,mean:sum/samples.length,maxGrip,maxRight});
   }
   const allClipGrip=[];
   if(mode==='desktop')for(const [name,meta]of Object.entries(motion.GS_CLIPS)){
    for(const action of Object.values(g.actions))action.stop();const action=g.actions[name];action.reset().play();action.paused=true;const armed=!['roll','drink','down','dead'].includes(name);let max=0,sum=0,n=0;
    for(let i=0;i<=Math.ceil(meta.duration*60);i++){const time=Math.min(meta.duration,i/60);action.time=time;g.mixer.update(0);const samples=meta.gripSamples;let j=1;while(j<samples.length-1&&samples[j][0]<time)j++;const [t0,a0]=samples[j-1],[t1,a1]=samples[j],axis=new T.Vector3(...a0).lerp(new T.Vector3(...a1),Math.max(0,Math.min(1,(time-t0)/(t1-t0))));g.socket.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),axis.normalize());if(armed){motion.solveLeftArm(g);const phase=meta.impact?(time-meta.impact[0])/(meta.impact[1]-meta.impact[0]):0;const E=await import('/beasthunt/js/gs-edge.js?v=20261113r8');g.socket.rotateY(name==='charge'?0:E.gsEdgeRoll(name,phase));H.root.updateMatrixWorld(true);const error=g.bones.LeftHand.getWorldPosition(new T.Vector3()).distanceTo(g.target.getWorldPosition(new T.Vector3()));max=Math.max(max,error);sum+=error;n++;}}
    allClipGrip.push({name,maxMM:armed?max*1000:null,meanMM:armed?sum/n*1000:null,samples:n});
   }g.key=null;
   M.syncHunterGS({...base,state:'atk',cur:D.WTYPES.gs.heavy,combo:-1,t:.28},H,0,0);H.root.updateMatrixWorld(true);const contact=g.sword.getObjectByName('hunter-blade').localToWorld(new T.Vector3(0,0,2.12)).y;
   h.cam.position.set(5,4,8);h.cam.lookAt(0,1.5,0);let maxCalls=0;const charge=[];for(const t of [0,.5,1,1.5,1.6,2,3]){h.syncHunter({...base,state:'charge',t,clv:Math.min(2,Math.floor(t/.5))},H,.02);const fx=h.gsChargeEffects.get(H);charge.push({t,time:g.clipTime,pulses:fx.pulseCount,particles:fx.count,ratio:fx.uniforms.ratio.value,fov:h.fovPunch||0,grip:g.ikDistance,visible:fx.group.visible,vibration:g.socket.quaternion.toArray()});h.r.render(h.scene,h.cam);maxCalls=Math.max(maxCalls,h.r.info.render.calls);}
   h.updCam(.3);const restoredFOV=h.cam.fov;
   h.syncHunter({...base,state:'guard',t:0},H,.05);const stopped=!h.gsChargeEffects.get(H).group.visible&&g.chargeStage===-1;
   const remote=M.buildHunterGS(2,3);await remote.ready;h.scene.add(remote.root);h.fovPunch=0;h.syncHunter({...base,id:'remote',state:'charge',t:1.5,clv:2},remote,.05);const remoteFx=h.gsChargeEffects.get(remote),remoteResult={fov:h.fovPunch,color:remoteFx.uniforms.tint.value.getHex(),expected:M.WPN_COL[1],visible:remoteFx.group.visible};remote.root.removeFromParent();h.syncHunter({...base,state:'idle',t:0},H,.05);const staleRemoved=!h.gsChargeEffects.has(remote);
   const tri=root=>{let n=0;root.traverse(o=>{if(o.isMesh)n+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;});return n;};
   return {mode,edge,allClipGrip,charge,contact,restoredFOV,stopped,remoteResult,staleRemoved,triangles:tri(H.root),maxCalls,unchanged:snapshot===JSON.stringify(h.sim.snapshot())};
  },mode);
  assert.ok(row.unchanged);assert.ok(Math.abs(row.contact-.04)<.001);assert.ok(row.triangles<=4000);assert.ok(row.maxCalls<=160,JSON.stringify(row));assert.ok(row.stopped&&row.staleRemoved);assert.equal(row.restoredFOV,58);assert.equal(row.remoteResult.fov,0);assert.equal(row.remoteResult.color,row.remoteResult.expected);assert.ok(row.remoteResult.visible);
  for(const e of row.allClipGrip)if(e.maxMM!==null)assert.ok(e.maxMM<=.1,JSON.stringify(e));
  for(const e of row.edge){assert.ok(e.mean<=.25,JSON.stringify(e));assert.ok(e.maxGrip<.0001&&e.maxRight<.0001,JSON.stringify(e));}
  assert.equal(row.charge.at(-1).pulses,3);assert.ok(row.charge.every(c=>c.grip<.0001&&c.fov<=2));assert.equal(row.charge[3].time,row.charge.at(-1).time);
  const count=mode==='lowfx'?0:mode==='mobile'?24:48;assert.ok(row.charge.every(c=>c.particles===count));if(['lowfx','reduced'].includes(mode))assert.ok(row.charge.every(c=>c.fov===0));
  results.push(row);await context.close();
 }
 assert.deepEqual(errors,[]);await writeFile(out+'/r8a-browser.json',JSON.stringify({results,errors},null,2));console.log('PASS R8a active edge <=.25, bilateral grip <.1mm, .04m slam, 3923tri, charge phases/max-once/48-24-0 particles, local FOV <=2/restores, remote tier & cleanup, sim unchanged');
}finally{await browser.close();}
