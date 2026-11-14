import * as THREE from 'three';
import { MARIA_GS as D, MARIA_EDGE } from './maria-gs-data.js?v=20261114maria';
const V=()=>new THREE.Vector3(),Q=()=>new THREE.Quaternion(),Y=new THREE.Vector3(0,1,0);
export const mariaMeta=D.clips;
export function prepareMaria(model,clips){
 model.updateMatrixWorld(true);const bones={};model.traverse(o=>{if(o.isBone)bones[o.name.replace('mixamorig:','').replace('mixamorig','')]=o;});
 const m=new THREE.Matrix4().fromArray(D.restRight.flat()).transpose();
 // Blender Z-up -> glTF Y-up; target rest orientation is preserved by export.
 const oldRest=Q().setFromRotationMatrix(m.clone().scale(V().setScalar(100)));
 const convert=Q().setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2);
 const axisConversion=bones.RightHand.getWorldQuaternion(Q()).invert().multiply(convert).multiply(oldRest);
 const adjusted=clips.filter(c=>!c.name.endsWith('_preview')).map(c=>c.clone());
 const charge=clips.find(c=>c.name==='chargewalk_preview').clone();charge.name='charge';
 adjusted[adjusted.findIndex(c=>c.name==='charge')]=charge;
 return {clips:adjusted,axisConversion};
}
export function saveMariaPose(gs){gs.mariaPose=Object.values(gs.bones).map(b=>[b,b.position.clone(),b.quaternion.clone(),b.scale.clone()]);gs.mariaModelY=gs.model.position.y;}
export function restoreMariaPose(gs){if(!gs.mariaPose)return;for(const [b,p,q,s] of gs.mariaPose){b.position.copy(p);b.quaternion.copy(q);b.scale.copy(s);}gs.model.position.y=gs.mariaModelY;gs.mariaPose=null;}
export function mariaPalm(gs,side){return gs.bones[side+'Hand'].localToWorld(V().fromArray(D.palmLocal[side]));}
function rotate(b,from,to){const world=b.getWorldQuaternion(Q()),parent=b.parent.getWorldQuaternion(Q());b.quaternion.copy(parent.invert().multiply(Q().setFromUnitVectors(from.normalize(),to.normalize()).multiply(world)));b.updateWorldMatrix(false,true);}
function arm(gs,side,goal){const u=gs.bones[side+'Arm'],l=gs.bones[side+'ForeArm'],h=gs.bones[side+'Hand'];const a=u.getWorldPosition(V()),b=l.getWorldPosition(V()),c=h.getWorldPosition(V()),ori=h.getWorldQuaternion(Q());const l1=a.distanceTo(b),l2=b.distanceTo(c),axis=goal.clone().sub(a).normalize(),d=THREE.MathUtils.clamp(a.distanceTo(goal),Math.abs(l1-l2)+.00001,l1+l2-.00001),pole=b.clone().sub(a);pole.addScaledVector(axis,-pole.dot(axis));if(pole.lengthSq()<1e-10)pole.set(0,0,1).addScaledVector(axis,-axis.z);pole.normalize();const x=(l1*l1+d*d-l2*l2)/(2*d),e=a.clone().addScaledVector(axis,x).addScaledVector(pole,Math.sqrt(Math.max(0,l1*l1-x*x)));rotate(u,b.sub(a),e.sub(a));const b2=l.getWorldPosition(V());rotate(l,h.getWorldPosition(V()).sub(b2),a.clone().addScaledVector(axis,d).sub(b2));h.quaternion.copy(h.parent.getWorldQuaternion(Q()).invert().multiply(ori));h.updateWorldMatrix(false,true);}
export function mariaContact(gs){
 for(let i=0;i<12;i++){const u=gs.bones.LeftArm,l=gs.bones.LeftForeArm,h=gs.bones.LeftHand,a=u.getWorldPosition(V()),b=l.getWorldPosition(V()),c=h.getWorldPosition(V()),offset=mariaPalm(gs,'Left').sub(c),goal=gs.target.getWorldPosition(V()).sub(offset),d=goal.clone().sub(a),reach=a.distanceTo(b)+b.distanceTo(c)-.004;if(d.length()<=reach)break;arm(gs,'Right',gs.bones.RightHand.getWorldPosition(V()).add(d.multiplyScalar(reach/d.length()).add(a).sub(goal)));}
 const h=gs.bones.LeftHand,offset=mariaPalm(gs,'Left').sub(h.getWorldPosition(V()));arm(gs,'Left',gs.target.getWorldPosition(V()).sub(offset));gs.ikDistance=mariaPalm(gs,'Left').distanceTo(gs.target.getWorldPosition(V()));gs.ikMax=Math.max(gs.ikMax,gs.ikDistance);
}
export function mariaAxis(gs,name,time){const meta=D.clips[name]||D.clips.charge,s=meta.gripSamples;let i=1;while(i<s.length-1&&s[i][0]<time)i++;const [t0,a]=s[i-1],[t1,b]=s[i];return V().fromArray(a).normalize().lerp(V().fromArray(b).normalize(),THREE.MathUtils.clamp((time-t0)/(t1-t0),0,1)).normalize().applyQuaternion(gs.maria.axisConversion);}
export function mariaRoll(name,time){const s=MARIA_EDGE[name];if(!s)return 0;let i=1;while(i<s.length-1&&s[i][0]<time)i++;const [t0,a]=s[i-1],[t1,b]=s[i];return THREE.MathUtils.lerp(a,b,THREE.MathUtils.clamp((time-t0)/(t1-t0),0,1));}
export function beginMariaFrame(gs,p,restart){
 if(restart&&p.state==='atk'&&gs.mariaLastState==='charge'&&gs.mariaLastFinal){gs.mariaRelease=gs.mariaLastFinal.map(([b,pos,q])=>[b,pos.clone(),q.clone()]);gs.mariaReleaseAxis=gs.mariaLastAxis?.clone();}
 if(p.state!=='atk')gs.mariaRelease=null;
}
export function blendMariaRelease(gs,p,time){if(!gs.mariaRelease)return;const u=THREE.MathUtils.clamp(time/.1,0,1),w=u*u*(3-2*u);for(const [b,pos,q] of gs.mariaRelease){b.position.lerpVectors(pos,b.position,w);b.quaternion.copy(q.clone().slerp(b.quaternion,w));}gs.model.updateWorldMatrix(true,true);if(u>=1)gs.mariaRelease=null;}
export function endMariaFrame(gs,p,axis){gs.mariaLastFinal=Object.values(gs.bones).map(b=>[b,b.position.clone(),b.quaternion.clone()]);gs.mariaLastState=p.state;gs.mariaLastAxis=axis.clone();}
