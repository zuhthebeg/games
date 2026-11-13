import * as THREE from 'three';
import { gsClipName, gsClipTime } from 'bh/gs-phase';
// Baked source markers (seconds) and measured right-hand-local grip axes.
export const GS_CLIPS = {
  "idle": {
    "duration": 2,
    "impact": null,
    "gripAxis": [
      -0.8622145056724548,
      -0.4465498924255371,
      0.23912236094474792
    ]
  },
  "walk": {
    "duration": 1.3666666666666667,
    "impact": null,
    "gripAxis": [
      -0.7545554637908936,
      -0.49025866389274597,
      0.4362252652645111
    ]
  },
  "run": {
    "duration": 0.7333333333333333,
    "impact": null,
    "gripAxis": [
      -0.8426529765129089,
      -0.4493401050567627,
      0.2966972887516022
    ]
  },
  "v": {
    "duration": 1.2666666666666666,
    "impact": [
      0.6,
      0.8
    ],
    "gripAxis": [
      -0.8335269689559937,
      -0.3772610127925873,
      0.40361735224723816
    ]
  },
  "h": {
    "duration": 1.8333333333333333,
    "impact": [
      0.7666666666666667,
      1.1
    ],
    "gripAxis": [
      -0.8247954845428467,
      -0.4632560908794403,
      0.3242010474205017
    ]
  },
  "h2": {
    "duration": 1.8,
    "impact": [
      0.7333333333333333,
      1.0666666666666667
    ],
    "gripAxis": [
      -0.9543722867965698,
      -0.19965611398220062,
      0.2220609188079834
    ]
  },
  "spin": {
    "duration": 1.8666666666666667,
    "impact": [
      0.7333333333333333,
      1.3
    ],
    "gripAxis": [
      -0.8844178915023804,
      -0.39841821789741516,
      0.24303866922855377
    ]
  },
  "other": {
    "duration": 1.2,
    "impact": [
      0.4666666666666667,
      0.7
    ],
    "gripAxis": [
      -0.9184948205947876,
      -0.2556212842464447,
      0.3017035126686096
    ]
  },
  "charge": {
    "duration": 0.9,
    "impact": null,
    "gripAxis": [
      -0.9103070497512817,
      -0.384284645318985,
      0.15383872389793396
    ]
  },
  "roll": {
    "duration": 1.6,
    "impact": null,
    "gripAxis": [
      0.9754198789596558,
      0.19067217409610748,
      0.11045456677675247
    ]
  },
  "drink": {
    "duration": 3,
    "impact": null,
    "gripAxis": [
      0.6807553768157959,
      -0.7319805026054382,
      -0.027868792414665222
    ]
  },
  "hit": {
    "duration": 0.8666666666666667,
    "impact": null,
    "gripAxis": [
      -0.8992664813995361,
      0.06202199310064316,
      0.43298161029815674
    ]
  },
  "stun": {
    "duration": 0.5,
    "impact": null,
    "gripAxis": [
      -0.835983157157898,
      0.14255939424037933,
      0.5299140810966492
    ]
  },
  "down": {
    "duration": 2.1333333333333333,
    "impact": null,
    "gripAxis": [
      0.8618122339248657,
      -0.44712573289871216,
      0.239495649933815
    ]
  },
  "dead": {
    "duration": 2.4,
    "impact": null,
    "gripAxis": [
      0.8442718982696533,
      -0.49886810779571533,
      0.19579444825649261
    ]
  }
};
const Y=new THREE.Vector3(0,1,0), V=()=>new THREE.Vector3(), Q=()=>new THREE.Quaternion();
export function createGSMotion(model, clips, sword) {
 const mixer=new THREE.AnimationMixer(model), actions={};
 for(const clip of clips){const a=mixer.clipAction(clip);a.setLoop(THREE.LoopOnce,1);a.clampWhenFinished=true;a.paused=true;actions[clip.name]=a;}
 const bones={};model.traverse(o=>{if(o.isBone)bones[o.name.replace('mixamorig:','').replace('mixamorig','')]=o;});
 const socket=new THREE.Group();socket.name='gs-right-hand-socket';socket.scale.setScalar(100);bones.RightHand.add(socket);socket.add(sword);
 // Right palm midpoint; bone units are cm, socket children are metres.
 socket.position.copy(bones.RightHandMiddle1.position).multiplyScalar(.5);
 const target=new THREE.Object3D();target.name='gs-left-grip';target.position.set(0,.13,0);socket.add(target);
 const gs={model,mixer,actions,bones,socket,target,sword,key:null,lastT:0,combo:null,clipTime:0,ikDistance:0,ikMax:0,walkPhase:0};
 return gs;
}
function rotateWorld(bone, from, to) {
 const parent=bone.parent.getWorldQuaternion(Q()), world=bone.getWorldQuaternion(Q());
 const delta=Q().setFromUnitVectors(from.normalize(),to.normalize());
 bone.quaternion.copy(parent.invert().multiply(delta.multiply(world)));bone.updateWorldMatrix(false,true);
}
// Analytic two-link solve, retaining the animation elbow pole and wrist orientation.
export function solveLeftArm(gs) {
 const {LeftArm:upper,LeftForeArm:lower,LeftHand:hand}=gs.bones;
 gs.model.updateWorldMatrix(true,true);
 const a=upper.getWorldPosition(V()),b=lower.getWorldPosition(V()),c=hand.getWorldPosition(V()),goal=gs.target.getWorldPosition(V()),wrist=hand.getWorldQuaternion(Q());
 const l1=a.distanceTo(b),l2=b.distanceTo(c),axis=goal.clone().sub(a),raw=axis.length();axis.normalize();
 const d=THREE.MathUtils.clamp(raw,Math.abs(l1-l2)+.00001,l1+l2-.00001);
 const pole=b.clone().sub(a).addScaledVector(axis,-b.clone().sub(a).dot(axis));
 if(pole.lengthSq()<1e-10)pole.set(0,0,1).addScaledVector(axis,-axis.z);pole.normalize();
 const x=(l1*l1+d*d-l2*l2)/(2*d),y=Math.sqrt(Math.max(0,l1*l1-x*x));
 const elbow=a.clone().addScaledVector(axis,x).addScaledVector(pole,y),reachable=a.clone().addScaledVector(axis,d);
 rotateWorld(upper,b.clone().sub(a),elbow.sub(a));
 const b2=lower.getWorldPosition(V()),c2=hand.getWorldPosition(V());
 rotateWorld(lower,c2.sub(b2),reachable.sub(b2));
 hand.quaternion.copy(hand.parent.getWorldQuaternion(Q()).invert().multiply(wrist));hand.updateWorldMatrix(false,true);
 gs.ikDistance=hand.getWorldPosition(V()).distanceTo(goal);gs.ikMax=Math.max(gs.ikMax,gs.ikDistance);
}
export function syncHunterGS(p,H,dt,clock=0) {
 const gs=H.gs;if(!gs)return false;
 H.root.position.set(p.x||0,0,p.z||0);H.root.rotation.y=(p.yaw||0)+(p.spin||0);
 H.root.visible=!(p.inv>0&&p.state!=='roll'&&Math.floor(clock*20)%2===0);
 const name=gsClipName(p),meta=GS_CLIPS[name],action=gs.actions[name];
 const restart=gs.key!==name || p.state==='atk'&&(p.t<gs.lastT-.00001||p.combo!==gs.combo);
 if(restart){
  const immediate=p.state==='atk'||!gs.key;
  // The unarmed roll/drink/down poses may place the right hand out of reach.
  // Restore the grip after their 100ms crossfade, not by stretching the arm.
  gs.ikDelay=!immediate && gs.wasUnarmed ? .1 : 0;
  for(const a of Object.values(gs.actions))if(a!==action){if(immediate)a.stop();else a.fadeOut(.1);}
  action.reset();action.paused=true;action.enabled=true;action.setEffectiveWeight(1);action.play();
  if(!immediate)action.fadeIn(.1);gs.key=name;
 }
 gs.lastT=p.t;gs.combo=p.combo;
 let time=gsClipTime(p,meta);
 if(p.state==='idle'&&!p.moving){gs.idleTime=(gs.idleTime||0)+Math.max(0,dt);time=gs.idleTime%meta.duration;}
 action.time=time;gs.clipTime=time;
 if(name==='walk'){
  // p.moving is speed/baseSpeed locally. Remotes also have position deltas.
  const speed=gs.lastPos&&dt>0?Math.hypot(p.x-gs.lastPos.x,p.z-gs.lastPos.z)/dt:0;
  const run=THREE.MathUtils.clamp(Math.max((p.moving-1)/.55,(speed-5)/3),0,1);
  const ra=gs.actions.run;if(!ra.isRunning()){ra.reset().play();ra.paused=true;}ra.enabled=true;
  ra.setEffectiveWeight(run);action.setEffectiveWeight(1-run);ra.time=(time/meta.duration)*GS_CLIPS.run.duration;
 }else if(gs.key!=='run')gs.actions.run.stop();
 gs.lastPos={x:p.x,z:p.z};
 // Paused actions seek from authoritative state, mixer time only drives fades.
 gs.mixer.update(Math.max(0,dt));
 const axis=new THREE.Vector3(...meta.gripAxis);
 // +Y is the lower handle, -Y the existing blade. Clipped axes avoid grip drift.
 gs.socket.quaternion.setFromUnitVectors(Y,axis.normalize());
 gs.sword.visible=!['roll','drink','dead','down'].includes(p.state);
 gs.wasUnarmed=['roll','drink','dead','down'].includes(p.state);
 gs.ikDelay=Math.max(0,(gs.ikDelay||0)-Math.max(0,dt));
 gs.ikEnabled=!gs.wasUnarmed && gs.ikDelay<=0;
 if(gs.ikEnabled)solveLeftArm(gs);else gs.ikDistance=0;
 return true;
}
