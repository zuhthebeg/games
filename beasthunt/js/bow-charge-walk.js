import * as THREE from 'three';
const V=()=>new THREE.Vector3(),Q=()=>new THREE.Quaternion(),M=()=>new THREE.Matrix4();
const names=['walkF','walkB','walkL','walkR'];
const clean=n=>n.replace('mixamorig:','').replace('mixamorig','');
const SAMPLES=240,HYSTERESIS=.015;
// Accepted directional pelvis/legs beneath a world-preserved charging torso.
// No root/aim yaw, arm, scale or shared-clip mutation.
export function createBowChargeWalk(b,clips){
 b.chargeGait={phase:0,last:null,applied:false,base:[],dir:'walkF',dirs:{}};
 const g=b.chargeGait;
 const boneAt=n=>b.bones[n];
 const rest=n=>{const o=boneAt(n);return o?o.position.clone():null;};
 const parentWorld=b.bones.Hips?b.bones.Hips.parent.matrixWorld.clone():M();
 for(const name of names){const c=clips.find(c=>c.name===name);if(!c)continue;
  const find=re=>c.tracks.find(t=>re.test(t.name))?.createInterpolant()||null;
  const e={duration:c.duration,hipPos:find(/Hips[.]position$/),hipQuat:find(/Hips[.]quaternion$/),legs:{},stride:1.65,stance:null};
  for(const s of['Left','Right'])e.legs[s]=['UpLeg','Leg','Foot','ToeBase'].map(j=>({bone:boneAt(s+j),sample:find(new RegExp(s+j+'[.]quaternion$'))})).filter(t=>t.bone&&t.sample);
  calibrate(e,rest,parentWorld);
  g.dirs[name]=e;
 }
}
// Source-clip FK: authored stance windows and the real per-cycle distance.
// Foot excursions include swing overshoot; only planted back-slide is travel.
function calibrate(e,rest,parentWorld){
 const need=e.hipPos&&e.hipQuat&&rest('Hips')&&e.legs.Left.length===4&&e.legs.Right.length===4;
 if(!need)return;
 const chain=s=>{const o={};for(const t of e.legs[s])o[t.bone.name.replace('mixamorig:','').replace('mixamorig','').replace(/^(Left|Right)/,'')]=t;return o;};
 const sides={Left:chain('Left'),Right:chain('Right')};
 const rests={};for(const n of['Hips','LeftUpLeg','LeftLeg','LeftFoot','LeftToeBase','RightUpLeg','RightLeg','RightFoot','RightToeBase'])rests[n]=rest(n);
 const toeAt=(side,t)=>{
  const c=sides[side],m=M().copy(parentWorld).multiply(M().compose(V().fromArray(e.hipPos.evaluate(t)),Q().fromArray(e.hipQuat.evaluate(t)),V().set(1,1,1)));
  for(const j of['UpLeg','Leg','Foot','ToeBase'])m.multiply(M().compose(rests[side+j].clone(),c[j]?Q().fromArray(c[j].sample.evaluate(t)):Q(),V().set(1,1,1)));
  return V().setFromMatrixPosition(m);
 };
 const hipAt=t=>V().fromArray(e.hipPos.evaluate(t)).applyMatrix4(parentWorld);
 const rel=[],low=[];let cur=-1;
 for(let i=0;i<=SAMPLES;i++){const t=e.duration*i/SAMPLES,L=toeAt('Left',t),R=toeAt('Right',t),h=hipAt(t);
  rel.push({L:L.clone().sub(h),R:R.clone().sub(h)});
  const pick=L.y<R.y-HYSTERESIS?0:R.y<L.y-HYSTERESIS?1:cur<0?(L.y<R.y?0:1):cur;low.push(pick);cur=pick;}
 // Dominant horizontal axis of hip-relative foot travel.
 let sx=0,sz=0;
 for(let i=1;i<=SAMPLES;i++)for(const s of['L','R']){const d=rel[i][s].clone().sub(rel[i-1][s]);sx+=Math.abs(d.x);sz+=Math.abs(d.z);}
 const axis=sx>=sz?'x':'z';
 // Cycle distance = total backward hip-relative slide while a foot stays planted.
 e.stride=Math.abs([...Array(SAMPLES)].reduce((sum,_,i)=>{const s=low[i]?'R':'L';return low[i+1]===low[i]?sum-(rel[i+1][s][axis]-rel[i][s][axis]):sum;},0))||1.65;
 // Per-foot planted windows: toe low AND not advancing relative to the hip.
 // Double support keeps both anchors instead of flicking a single owner.
 const eps=e.stride/SAMPLES*.5,plant=[];
 for(const s of['L','R']){const ys=rel.map(r=>r[s].y),min=Math.min(...ys),max=Math.max(...ys),th=min+.2*(max-min);
  let acc=0;for(let i=1;i<=SAMPLES;i++)if(ys[i]<th)acc+=rel[i][s][axis]-rel[i-1][s][axis];
  const back=Math.sign(acc)||1,flags=new Uint8Array(SAMPLES);
  for(let i=0;i<SAMPLES;i++){const dr=rel[(i+1)%SAMPLES][s][axis]-rel[i][s][axis];flags[i]=ys[i]<th&&back*dr>=-eps?1:0;}
  plant.push(flags);}
 e.planted=Uint8Array.from({length:SAMPLES},(_,i)=>plant[0][i]|plant[1][i]<<1);
}
export function restoreBowChargeWalk(b){
 const g=b.chargeGait;if(!g?.applied)return;
 for(const v of g.base){v.bone.position.copy(v.p);v.bone.quaternion.copy(v.q);}g.applied=false;
}
export function applyBowChargeWalk(b,p,dt){
 const g=b.chargeGait;if(!g)return;
 const prev=g.last;g.last={x:p.x||0,z:p.z||0,t:p.t,state:p.state};g.active=false;
 if(p.state!=='charge'){g.phase=0;g.held=false;g.support=null;g.anchor=null;g.anchors=null;return;}
 if(!prev||prev.state!=='charge'||p.t<prev.t-.00001){g.phase=0;g.held=false;g.support=null;g.anchor=null;g.anchors=null;return;}
 const dx=(p.x||0)-prev.x,dz=(p.z||0)-prev.z,dist=Math.hypot(dx,dz);
 if(!Number.isFinite(dist)||dist>Math.max(1,Math.max(0,dt)*8))return;
 if(dist>1e-6){const sy=Math.sin(p.yaw||0),cy=Math.cos(p.yaw||0),f=dx*sy+dz*cy,s=dx*cy-dz*sy;
  g.dir=Math.abs(f)>=Math.abs(s)?(f>=0?'walkF':'walkB'):(s>=0?'walkL':'walkR');
  // Distance-advanced phase on the source-clip measured per-cycle travel.
  g.phase+=dist/((b.erika&&g.dirs[g.dir])?g.dirs[g.dir].stride:1.65);g.active=true;g.held=true;
 }
 if(!g.held)return;
 const source=g.dirs[g.dir];if(!source)return;
 const spine=b.bones.Spine;b.model.updateWorldMatrix(true,true);
 const upperPosition=spine.getWorldPosition(V()),upperQ=spine.getWorldQuaternion(Q());
 g.base=[{bone:b.bones.Hips,p:b.bones.Hips.position.clone(),q:b.bones.Hips.quaternion.clone()},
  ...['Left','Right'].flatMap(s=>source.legs[s].map(t=>({bone:t.bone,p:t.bone.position.clone(),q:t.bone.quaternion.clone()}))),
  {bone:spine,p:spine.position.clone(),q:spine.quaternion.clone()}];
 const ph=THREE.MathUtils.euclideanModulo(g.phase,1),t=ph*source.duration;
 if(source.hipPos)b.bones.Hips.position.fromArray(source.hipPos.evaluate(t));
 if(source.hipQuat)b.bones.Hips.quaternion.fromArray(source.hipQuat.evaluate(t)).normalize();
 for(const s of['Left','Right'])for(const tr of source.legs[s])tr.bone.quaternion.fromArray(tr.sample.evaluate(t)).normalize();
 b.model.updateWorldMatrix(true,true);
 spine.position.copy(spine.parent.worldToLocal(upperPosition));spine.quaternion.copy(spine.parent.getWorldQuaternion(Q()).invert().multiply(upperQ)).normalize();
 plantSupport(b,g,source,ph);
 g.applied=true;
}
// Analytic two-bone support solve; never scale/stretch a limb or lift the body.
function plantSupport(b,g,source,ph){
 b.model.updateWorldMatrix(true,true);
 const toes=['Left','Right'].map(s=>b.bones[s+'ToeBase'].getWorldPosition(V()));
 // Support comes from the authored planted windows, not the instantaneous
 // lowest toe: a low-clearance swing foot must never steal the anchor.
 const mask=(source.planted?source.planted[Math.floor(ph*SAMPLES)%SAMPLES]:0)||(toes[0].y<=toes[1].y?1:2);
 g.plantError=0;if(!g.anchors)g.anchors=[null,null];
 for(const index of[0,1]){
  const side=index?'Right':'Left';
  if(!(mask>>index&1)){g.anchors[index]=null;continue;}
  const hip=b.bones[side+'UpLeg'],knee=b.bones[side+'Leg'],foot=b.bones[side+'Foot'];
  const a=hip.getWorldPosition(V()),c=foot.getWorldPosition(V()),q=foot.getWorldQuaternion(Q());
  if(!g.anchors[index]){g.anchors[index]=toes[index].clone();g.anchors[index].y=0;}
  const anchor=g.anchors[index],target=anchor.clone().sub(toes[index].clone().sub(c));
  const k=knee.getWorldPosition(V()),l1=a.distanceTo(k),l2=k.distanceTo(c),axis=target.clone().sub(a),d=axis.length();
  // Reach failures are exposed, never hidden with stretched bones.
  if(d>=l1+l2-1e-5||d<=Math.abs(l1-l2)+1e-5){g.reachFailures=(g.reachFailures||0)+1;g.anchors[index]=null;continue;}
  axis.normalize();let bend=k.clone().sub(a);bend.addScaledVector(axis,-bend.dot(axis));if(bend.lengthSq()<1e-10)continue;bend.normalize();
  const along=(l1*l1-l2*l2+d*d)/(2*d),height=Math.sqrt(Math.max(0,l1*l1-along*along));
  const goal=a.clone().addScaledVector(axis,along).addScaledVector(bend,height);
  const aim=(bone,from,to)=>{const world=bone.getWorldQuaternion(Q()).premultiply(Q().setFromUnitVectors(from.normalize(),to.normalize()));bone.quaternion.copy(bone.parent.getWorldQuaternion(Q()).invert().multiply(world)).normalize();b.model.updateWorldMatrix(true,true);};
  aim(hip,k.clone().sub(a),goal.clone().sub(a));
  aim(knee,foot.getWorldPosition(V()).sub(knee.getWorldPosition(V())),target.clone().sub(knee.getWorldPosition(V())));
  foot.quaternion.copy(foot.parent.getWorldQuaternion(Q()).invert().multiply(q)).normalize();b.model.updateWorldMatrix(true,true);
  g.plantError=Math.max(g.plantError,b.bones[side+'ToeBase'].getWorldPosition(V()).distanceTo(anchor));
  g.support=side;
 }
}
