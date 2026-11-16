// Render-only, bind-measured primary palm. No bone, clip, body or gameplay edits.
import * as T from 'three';
const V=()=>new T.Vector3();
export const MONSTER_WEAPON_FIT=Object.freeze({
 boar:Object.freeze({length:.9975,tilt:0,azimuth:0,roll:0,direction:1}),
 frost:Object.freeze({length:.85,tilt:0,azimuth:0,roll:180,direction:1}),
 ember:Object.freeze({length:.8925,tilt:12.5,azimuth:195,roll:180,direction:1})
});
// Same measured basis as Warrok: knuckle line, actual finger world direction
// transformed back to hand space, and their palm normal. All from bind pose.
export function measureMonsterPalm(model){
 const bones={};model.traverse(o=>{if(o.isBone)bones[o.name]=o;});
 const hand=bones.mixamorigRightHand,kn=['Index1','Middle1','Ring1','Pinky1'].map(n=>bones['mixamorigRightHand'+n]).filter(Boolean);
 // Maw has Index/Middle/Ring (no Pinky); Mutant has Index/Pinky only.
 // Use actual outer knuckles and an actual available proximal finger segment.
 const finger1=bones.mixamorigRightHandMiddle1||bones.mixamorigRightHandIndex1,finger2=bones.mixamorigRightHandMiddle2||bones.mixamorigRightHandIndex2;
 if(!hand||kn.length<2||!finger1||!finger2)throw Error('Missing measured weapon palm');
 const palm=kn.reduce((a,b)=>a.add(b.position),V()).multiplyScalar(.5/kn.length);
 const axis=kn[0].position.clone().sub(kn.at(-1).position).normalize();
 const finger=finger2.getWorldPosition(V()).sub(finger1.getWorldPosition(V())).normalize().applyQuaternion(hand.getWorldQuaternion(new T.Quaternion()).invert());
 const normal=axis.clone().cross(finger).normalize(),x=axis.clone().cross(normal).normalize();
 const scale=1/hand.getWorldScale(V()).x;
 return {bones,hand,palm,axis,normal,x,scale};
}
export function weaponSocketQuaternion(measure,fit){
 const rad=Math.PI/180,t=fit.tilt*rad,a=fit.azimuth*rad;
 const y=measure.axis.clone().multiplyScalar(Math.cos(t)).addScaledVector(measure.x,Math.sin(t)*Math.cos(a)).addScaledVector(measure.normal,Math.sin(t)*Math.sin(a)).multiplyScalar(fit.direction);
 const z=measure.normal.clone().addScaledVector(y,-measure.normal.dot(y)).normalize();
 const x=y.clone().cross(z).normalize();
 return new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(x,y,z)).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),fit.roll*rad));
}
// Pure pose-only R21b contract, with fixed-size head TRANSLATION instead of
// blade scaling. Reconstruct full head every call; never accumulate a fraction.
// If the palm/axis makes retraction infeasible, expose the residual, not a lift.
export function groundHeadRetraction(lowest,axisY,travel,floor=.02){
 return lowest<floor&&axisY< -1e-9 ? Math.min(travel,(floor-lowest)/-axisY) : 0;
}
export function attachMonsterWeapon(model,id,height,root){
 if(!MONSTER_WEAPON_FIT[id])return null;
 const measure=measureMonsterPalm(model),fit=MONSTER_WEAPON_FIT[id];
 const socket=new T.Group();socket.name='monster-right-palm';socket.position.copy(measure.palm);socket.scale.setScalar(measure.scale);socket.quaternion.copy(weaponSocketQuaternion(measure,fit));measure.hand.add(socket);
 const group=new T.Group();group.name='monster-heavy-'+id;socket.add(group);
 const dark=new T.MeshStandardMaterial({color:0x382c25,roughness:.85}),metal=new T.MeshStandardMaterial({color:{boar:0xd2bea0,frost:0x7395a2,ember:0x7f6250}[id],roughness:.65,metalness:.25});
 const points=id==='frost'?[[0,-.13],[.2,-.2],[.3,-.08],[.3,.13],[.14,.22],[0,.12]]:[[-.07,-.18],[.1,-.18],[.15,.08],[.08,.23],[-.06,.2]];
 const blade=new T.Shape();blade.moveTo(points[0][0]*height,points[0][1]*height);for(const [x,y]of points.slice(1))blade.lineTo(x*height,y*height);blade.closePath();
 const geometry=id==='ember'?new T.BoxGeometry(height*.25,height*.14,height*.15):new T.ExtrudeGeometry(blade,{depth:height*.055,bevelEnabled:false});if(id!=='ember')geometry.translate(0,0,-height*.0275);geometry.computeBoundingBox();
 const head=new T.Mesh(geometry,metal);head.name='monster-weapon-head';head.frustumCulled=false;group.add(head);
 const pommelY=-height*.18,headY=height*fit.length+pommelY-geometry.boundingBox.max.y;
 const shaftTop=headY,shaftLength=shaftTop-pommelY;
 const shaft=new T.Mesh(new T.CylinderGeometry(height*.022,height*.022,shaftLength,8),dark);shaft.position.y=(shaftTop+pommelY)/2;shaft.name='monster-weapon-haft';shaft.frustumCulled=false;group.add(shaft);
 const fullTip=new T.Object3D();fullTip.name='monster-weapon-full-tip';fullTip.position.y=pommelY+height*fit.length;group.add(fullTip);
 const pommel=new T.Object3D();pommel.position.y=pommelY;group.add(pommel);
 // Left palm is information only. Mutant has no left fingers: explicitly null,
 // not a mirrored or guessed palm. Never constrain either limb.
 const leftHand=measure.bones.mixamorigLeftHand,leftKn=['Index1','Middle1','Ring1','Pinky1'].map(n=>measure.bones['mixamorigLeftHand'+n]).filter(Boolean);let left=null;
 if(leftHand&&leftKn.length>=2){left=new T.Object3D();left.position.copy(leftKn.reduce((a,b)=>a.add(b.position),V()).multiplyScalar(.5/leftKn.length));leftHand.add(left);}
 const p=V(),q=V(),axis=V(),worldScale=V();
 const weapon={group,socket,right:socket,left,shaft,head,fullTip,pommel,measure,fit,height,headY,shaftLength,totalLength:height*fit.length,retraction:0,unclampedMinY:Infinity,minY:Infinity,gripError:0};
 weapon.sync=()=>{
  head.position.set(0,headY,0);root.updateMatrixWorld(true);
  let lowest=Infinity;const pos=geometry.attributes.position;for(let i=0;i<pos.count;i++)lowest=Math.min(lowest,p.fromBufferAttribute(pos,i).applyMatrix4(head.matrixWorld).y);
  group.getWorldScale(worldScale);axis.set(0,1,0).transformDirection(group.matrixWorld);
  const travel=Math.max(0,headY)*worldScale.y;
  weapon.unclampedMinY=lowest;weapon.retraction=groundHeadRetraction(lowest,axis.y,travel);head.position.y=headY-weapon.retraction/worldScale.y;
  head.updateMatrixWorld(true);weapon.minY=Infinity;for(const mesh of [shaft,head]){const a=mesh.geometry.attributes.position;for(let i=0;i<a.count;i++)weapon.minY=Math.min(weapon.minY,p.fromBufferAttribute(a,i).applyMatrix4(mesh.matrixWorld).y);}
  weapon.gripError=socket.getWorldPosition(p).distanceTo(measure.hand.localToWorld(q.copy(measure.palm)));
 };return weapon;
}
