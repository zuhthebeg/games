import * as THREE from 'three';
const V=()=>new THREE.Vector3(),Q=()=>new THREE.Quaternion(),Y=new THREE.Vector3(0,1,0);
const boneName=name=>name.replace('mixamorig:','').replace('mixamorig','');
// Reuse the approved walk's pelvis/legs, never its arms or weapon tracks.
// A same-foot cycle travels ~1.65m at this rig's scale (not clip seconds).
export function createChargeWalk(gs,clip){
 gs.chargeWalkTracks=(clip?.tracks||[]).filter(t=>/^(?:mixamorig:?)?(?:Hips|(?:Left|Right)(?:UpLeg|Leg|Foot|Toe[a-zA-Z_]*))[.]quaternion$/.test(t.name)).map(t=>({bone:gs.bones[boneName(t.name.split('.')[0])],sample:t.createInterpolant()})).filter(t=>t.bone);
 gs.chargeWalkDuration=clip?.duration||0;gs.chargeWalkPhase=0;gs.chargeWalkSamplePhase=0;gs.chargeWalkStride=1.65;
 gs.chargeWalkPose=gs.chargeWalkTracks.map(t=>({bone:t.bone,quaternion:Q()}));
 gs.chargeWalkSpine={position:V(),quaternion:Q()};
}
// Restore BEFORE action stop/reset and mixer evaluation. Paused PropertyMixers
// can skip unchanged values: merely asking the mixer to overwrite us leaks pose.
export function resetChargeWalk(gs){
 if(!gs.chargeWalkApplied)return;
 for(const p of gs.chargeWalkPose)p.bone.quaternion.copy(p.quaternion);
 gs.bones.Spine.position.copy(gs.chargeWalkSpine.position);
 gs.bones.Spine.quaternion.copy(gs.chargeWalkSpine.quaternion);
 gs.model.position.y-=gs.chargeWalkLift;gs.chargeWalkLift=0;gs.chargeWalkApplied=false;
}
export function applyChargeWalk(gs,p,dt,previous){
 gs.chargeWalkActive=false;gs.chargeWalkSpeed=0;
 if(p.state!=='charge'||!gs.chargeWalkDuration||!previous||previous.state!=='charge')return;
 const dx=p.x-previous.x,dz=p.z-previous.z,dist=Math.hypot(dx,dz);
 // Ignore respawn/teleport corrections, but accept real low-FPS travel and
 // remote deltas without a moving/walk flag. Repeated positions freeze phase.
 if(!Number.isFinite(dist)||dist>Math.max(1,Math.max(0,dt)*8))return;
 if(dist>1e-6){
  const yaw=THREE.MathUtils.euclideanModulo(Math.atan2(dx,dz)-(p.yaw||0)-(p.spin||0)+Math.PI,2*Math.PI)-Math.PI;
  // Backpedal rather than twisting the waist through 180 degrees.
  const reverse=Math.abs(yaw)>Math.PI/2+1e-6;
  gs.chargeWalkYaw=yaw+(reverse?(yaw>0?-Math.PI:Math.PI):0);
  gs.chargeWalkPhase+=dist/gs.chargeWalkStride;
  gs.chargeWalkSamplePhase+=(reverse?-1:1)*dist/gs.chargeWalkStride;
  gs.chargeWalkActive=true;gs.chargeWalkHeld=true;
  gs.chargeWalkSpeed=dt>0?dist/dt:0;
 }
 // Hold the exact foot cycle on halt; charge upper body keeps progressing.
 if(!gs.chargeWalkHeld)return;
 for(const pose of gs.chargeWalkPose)pose.quaternion.copy(pose.bone.quaternion);
 const spine=gs.bones.Spine,hips=gs.bones.Hips;
 gs.chargeWalkSpine.position.copy(spine.position);gs.chargeWalkSpine.quaternion.copy(spine.quaternion);
 gs.model.updateWorldMatrix(true,true);
 const upperWorld=spine.getWorldQuaternion(Q()),upperPosition=spine.getWorldPosition(V());
 const phase=THREE.MathUtils.euclideanModulo(gs.chargeWalkSamplePhase,1);
 for(const tr of gs.chargeWalkTracks)tr.bone.quaternion.fromArray(tr.sample.evaluate(phase*gs.chargeWalkDuration)).normalize();
 gs.model.updateWorldMatrix(true,true);
 const world=hips.getWorldQuaternion(Q()).premultiply(Q().setFromAxisAngle(Y,gs.chargeWalkYaw));
 hips.quaternion.copy(hips.parent.getWorldQuaternion(Q()).invert().multiply(world)).normalize();
 gs.model.updateWorldMatrix(true,true);
 // Preserve BOTH position and orientation of the charging torso in world
 // space. Existing bilateral contact IK then receives the same arm geometry.
 spine.position.copy(hips.worldToLocal(upperPosition));
 spine.quaternion.copy(hips.getWorldQuaternion(Q()).invert().multiply(upperWorld)).normalize();
 gs.model.updateWorldMatrix(true,true);
 const toes=['LeftToeBase','RightToeBase'].map(n=>gs.bones[n]?.getWorldPosition(V()).y).filter(Number.isFinite);
 gs.chargeWalkLift=toes.length?Math.max(0,.012-Math.min(...toes)):0;
 gs.model.position.y+=gs.chargeWalkLift;gs.chargeWalkApplied=true;
}
