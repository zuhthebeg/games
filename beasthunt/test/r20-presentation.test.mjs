import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {T,models,syncs,V,pose,hunter,palms,skinWitnesses,asset}from'./r20-pose-helpers.mjs';
const {bowChargeVisualState,BowChargeFX,attachBowChargePresentation}=await import('../js/bow-charge.js');
const metrics={transitions:{},gait:{}};
const moves={bow:[{h0:.20,h1:.20,dur:.70},{h0:.23,h1:.23,dur:.74},{h0:.26,h1:.26,dur:.80}],db:[{sw:'h',h0:.16,h1:.25,dur:.50},{sw:'h2',h0:.16,h1:.25,dur:.5},{sw:'h',h0:.16,h1:.25,dur:.5}],gs:[{sw:'v',h0:.3,h1:.45,dur:.8},{sw:'h',h0:.3,h1:.45,dur:.8},{sw:'h2',h0:.3,h1:.45,dur:.8}]};
test('three actual skinned rigs: normal links 80ms, same-action restart, marker and paused interruption',async()=>{
 for(const weapon of ['bow','db','gs']){
  const h=await hunter(weapon),b=h[weapon],sync=syncs[weapon];assert.ok(b,weapon);
  let jump=0,repeat=0;
  for(let c=0;c<3;c++){
   sync(pose(weapon,'atk',moves[weapon][c].dur-.01,{cur:moves[weapon][c],combo:c,attackTick:c}),h,.1);
   h.root.updateMatrixWorld(true);const before=palms(h,weapon);
   const next=(c+1)%3,p=pose(weapon,'atk',0,{cur:moves[weapon][next],combo:next,attackTick:c+1});
   sync(p,h,0);h.root.updateMatrixWorld(true);jump=Math.max(jump,...palms(h,weapon).map((v,i)=>v.distanceTo(before[i])));
   assert.equal(b.normalBlendSeconds,.08);const frozen=palms(h,weapon);
   for(let k=0;k<5;k++)sync(p,h,0);h.root.updateMatrixWorld(true);repeat=Math.max(repeat,...palms(h,weapon).map((v,i)=>v.distanceTo(frozen[i])));
   sync({...p,t:.08},h,.08);assert.equal(b.normalBlendSeconds,0);
   sync({...p,t:p.cur.h0},h,0);assert.equal(b.normalBlendSeconds,0);assert.ok(skinWitnesses(b.model).every(v=>v.toArray().every(Number.isFinite)));
  }
  metrics.transitions[weapon]={palmBoundaryJump:jump,pauseRepeat:repeat};assert.ok(repeat<1e-6,weapon+' pause leak '+repeat);
  for(const state of ['roll','hit','stun','down','dead','idle','charge']){sync(pose(weapon,state,0),h,0);assert.equal(b.normalPose.from,null);}
  h.dispose();
 }
});
test('bow all normal combo steps preserve corrected +Z marker and exact string/arrow contacts at four headings',async()=>{
 const h=await hunter('bow'),b=h.bow;let aim=0,grip=0,nock=0;
 for(let combo=0;combo<3;combo++)for(const yaw of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
  const cur=moves.bow[combo];for(const t of [0,.04,.08,cur.h0-1e-5,cur.h0,cur.h1+.01]){
   syncs.bow(pose('bow','atk',t,{combo,cur,yaw,attackTick:combo}),h,0);h.root.updateMatrixWorld(true);
   const held=t<cur.h0;assert.equal(b.stringHeld,held);assert.equal(b.nockArrow.visible,held);
   grip=Math.max(grip,b.socket.getWorldPosition(V()).distanceTo(palms(h,'bow')[0]));
   if(held)nock=Math.max(nock,b.socket.localToWorld(b.nockPos.clone()).distanceTo(palms(h,'bow')[1]));
   if(t===cur.h0-1e-5){const axis=new T.Vector3(0,1,0).applyQuaternion(b.nockArrow.getWorldQuaternion(new T.Quaternion())),want=new T.Vector3(Math.sin(yaw),0,Math.cos(yaw));aim=Math.max(aim,axis.angleTo(want));}
  }
 }
 metrics.bow={aimRadians:aim,grip,nock};assert.ok(aim<1e-5);assert.ok(grip<1e-8);assert.ok(nock<1e-8);h.dispose();
});
test('bow distance directional charge gait: 4 headings/cadences, stationary hold, independent remote, exits',async()=>{
 const remote=await hunter('bow'),untouched=remote.bow.bones.LeftLeg.quaternion.clone();
 for(const yaw of [0,Math.PI/2,Math.PI,Math.PI*1.5])for(const dir of ['F','B','L','R'])for(const hz of [20,60,144]){
  const h=await hunter('bow'),b=h.bow;let p=pose('bow','charge',0,{yaw});syncs.bow(p,h,0);let lastFeet=null,slip=0,footTravel=0;
  for(let i=1;i<=hz;i++){
   const angle=yaw+({F:0,B:Math.PI,L:Math.PI/2,R:-Math.PI/2}[dir]),distance=.65*i/hz;
   p={...p,t:i/hz,x:Math.sin(angle)*distance,z:Math.cos(angle)*distance};syncs.bow(p,h,1/hz);h.root.updateMatrixWorld(true);
   const feet=['LeftToeBase','RightToeBase'].map(n=>b.bones[n].getWorldPosition(V()));
   if(lastFeet){const support=feet[0].y<feet[1].y?0:1;slip+=Math.hypot(feet[support].x-lastFeet[support].x,feet[support].z-lastFeet[support].z);footTravel+=feet[0].distanceTo(lastFeet[0]);}lastFeet=feet;
  }
  const phase=b.chargeGait.phase,legs=b.bones.LeftLeg.quaternion.clone();for(let i=0;i<10;i++)syncs.bow({...p,t:1+i*.02},h,.02);
  assert.equal(phase,b.chargeGait.phase);assert.ok((b.chargeGait.plantError||0)<1e-6,'support IK residual');assert.ok(footTravel>.01,'legs actually move');assert.equal(b.chargeGait.dir,'walk'+dir);
  const key=dir+'@'+hz;metrics.gait[key]={phase,supportSlip:slip,reachFailures:b.chargeGait.reachFailures||0,plantError:b.chargeGait.plantError||0};
  const clean=await hunter('bow');for(const state of ['idle','roll','hit','stun','down','dead']){const q=pose('bow',state,.13);syncs.bow(q,h,.2);syncs.bow(q,clean,.2);assert.ok(b.bones.LeftLeg.quaternion.angleTo(clean.bow.bones.LeftLeg.quaternion)<1e-6,state+' overlay cleanup');}
  clean.dispose();h.dispose();
 }
 assert.ok(untouched.equals(remote.bow.bones.LeftLeg.quaternion));remote.dispose();
});
test('bow charge FX uses actual 1.2 seconds, stages once, pause/low/reduced/interruption/dispose',async()=>{
 assert.equal(bowChargeVisualState(pose('bow','charge',.6)).ratio,.5);assert.equal(bowChargeVisualState(pose('bow','charge',1.2)).stage,3);
 for(const low of [false,true])for(const reduced of [false,true]){
  const scene=new T.Scene(),h=await hunter('bow');scene.add(h.root);const fx=new BowChargeFX(scene,low,false,0xe8c86c,reduced);let pulses=0;
  for(const t of [0,.4,.4,.8,1.2,1.2]){const p=pose('bow','charge',t);syncs.bow(p,h,0);pulses+=+fx.update(p,h,0,0).pulse;}
  assert.equal(pulses,3);assert.equal(fx.uniforms.ratio.value,1);if(low)assert.equal(fx.count,0);if(reduced)assert.equal(fx.uniforms.pulse.value,0);
  const mat=h.bow.nockArrow.material;assert.ok(mat.emissiveIntensity>1);fx.update(pose('bow','roll',0),h,0,0);assert.equal(fx.group.visible,false);assert.equal(mat.emissiveIntensity,1);
  fx.dispose();assert.equal(fx.group.parent,null);h.dispose();
 }
 const scene=new T.Scene(),h=await hunter('bow');scene.add(h.root);const hunt={scene,in:{isTouch:false},clock:0,syncHunter(p,H,dt){syncs.bow(p,H,dt);},dispose(){}};attachBowChargePresentation(hunt);hunt.syncHunter(pose('bow','charge',.6),h,0);assert.equal(hunt.bowChargeEffects.size,1);scene.remove(h.root);hunt.dispose();assert.equal(hunt.bowChargeEffects.size,0);
});
test.after(()=>{fs.writeFileSync('/tmp/beasthunt-r20-presentation-metrics.json',JSON.stringify(metrics,null,2));console.log('R20 focused metrics '+JSON.stringify(metrics));});
