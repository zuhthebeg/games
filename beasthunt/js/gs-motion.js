import * as THREE from 'three';
import { gsClipName, gsClipTime } from 'bh/gs-phase';
// Baked source markers (seconds) and measured right-hand-local grip axes.
export const GS_CLIPS = {
  "idle": {
    "duration": 2.0,
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
  "heavy": {
    "duration": 2.1666666666666665,
    "impact": [
      1.2333333333333334,
      1.3666666666666667
    ],
    "gripAxis": [
      -0.848012387752533,
      -0.34234359860420227,
      0.40456855297088623
    ],
    "gripSamples": [
      [
        0.0,
        [
          -0.8353360891342163,
          -0.4697340726852417,
          0.28559327125549316
        ]
      ],
      [
        0.06666666666666667,
        [
          -0.5321850180625916,
          -0.48942098021507263,
          0.6908301115036011
        ]
      ],
      [
        0.13333333333333333,
        [
          -0.6349557042121887,
          -0.3109375238418579,
          0.7072122097015381
        ]
      ],
      [
        0.2,
        [
          -0.6170982718467712,
          -0.3992158770561218,
          0.678097665309906
        ]
      ],
      [
        0.26666666666666666,
        [
          -0.6594828367233276,
          -0.428375244140625,
          0.6177191734313965
        ]
      ],
      [
        0.3333333333333333,
        [
          -0.7564213275909424,
          -0.11861640959978104,
          0.643239438533783
        ]
      ],
      [
        0.4,
        [
          -0.7538745999336243,
          0.19772759079933167,
          0.6265596151351929
        ]
      ],
      [
        0.4666666666666667,
        [
          -0.7995926737785339,
          0.37436342239379883,
          0.4695780277252197
        ]
      ],
      [
        0.5333333333333333,
        [
          -0.8388922214508057,
          -0.03283531591296196,
          0.543306291103363
        ]
      ],
      [
        0.6,
        [
          -0.8010716438293457,
          -0.3195704221725464,
          0.5061216354370117
        ]
      ],
      [
        0.6666666666666666,
        [
          -0.7280712127685547,
          -0.4313003420829773,
          0.5328153371810913
        ]
      ],
      [
        0.7333333333333333,
        [
          -0.9230996370315552,
          -0.3479994535446167,
          0.16365666687488556
        ]
      ],
      [
        0.8,
        [
          -0.970986545085907,
          -0.2391236126422882,
          0.0022461062762886286
        ]
      ],
      [
        0.8666666666666667,
        [
          -0.9773184657096863,
          -0.15260396897792816,
          0.14683544635772705
        ]
      ],
      [
        0.9333333333333333,
        [
          -0.9665006995201111,
          -0.207554891705513,
          0.15098799765110016
        ]
      ],
      [
        1.0,
        [
          -0.84567791223526,
          -0.18502047657966614,
          0.5005958676338196
        ]
      ],
      [
        1.0666666666666667,
        [
          -0.7090569138526917,
          -0.28772592544555664,
          0.6437796354293823
        ]
      ],
      [
        1.1333333333333333,
        [
          -0.6809378266334534,
          -0.4684520661830902,
          0.5629177689552307
        ]
      ],
      [
        1.2,
        [
          -0.8592455983161926,
          -0.48021918535232544,
          0.17631371319293976
        ]
      ],
      [
        1.2666666666666666,
        [
          -0.8435493111610413,
          -0.45474937558174133,
          0.28570541739463806
        ]
      ],
      [
        1.3333333333333333,
        [
          -0.8208717703819275,
          -0.4579363167285919,
          0.34126797318458557
        ]
      ],
      [
        1.4,
        [
          -0.8613382577896118,
          -0.36054056882858276,
          0.35792019963264465
        ]
      ],
      [
        1.4666666666666666,
        [
          -0.7975944876670837,
          -0.39813920855522156,
          0.45313164591789246
        ]
      ],
      [
        1.5333333333333334,
        [
          -0.8259810209274292,
          -0.415042519569397,
          0.38143816590309143
        ]
      ],
      [
        1.6,
        [
          -0.827190637588501,
          -0.4762914776802063,
          0.2981647551059723
        ]
      ],
      [
        1.6666666666666667,
        [
          -0.8201384544372559,
          -0.46100232005119324,
          0.33889493346214294
        ]
      ],
      [
        1.7333333333333334,
        [
          -0.8013386130332947,
          -0.506849467754364,
          0.31774207949638367
        ]
      ],
      [
        1.8,
        [
          -0.871978223323822,
          -0.41995805501937866,
          0.2515736520290375
        ]
      ],
      [
        1.8666666666666667,
        [
          -0.8984480500221252,
          -0.3608919084072113,
          0.25009608268737793
        ]
      ],
      [
        1.9333333333333333,
        [
          -0.8665499687194824,
          -0.40490642189979553,
          0.29179105162620544
        ]
      ],
      [
        2.0,
        [
          -0.8623507618904114,
          -0.4107222259044647,
          0.2960715889930725
        ]
      ],
      [
        2.066666666666667,
        [
          -0.9027575850486755,
          -0.37425073981285095,
          0.212049663066864
        ]
      ],
      [
        2.1333333333333333,
        [
          -0.8834859728813171,
          -0.4133787751197815,
          0.22038708627223969
        ]
      ],
      [
        2.1666666666666665,
        [
          -0.862594723701477,
          -0.44540220499038696,
          0.2398899644613266
        ]
      ]
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
    "duration": 3.0,
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
 const wanted=gsClipName(p),name=wanted==='guard'&&!gs.actions.guard?'charge':wanted,action=gs.actions[name],meta=GS_CLIPS[name]||{...GS_CLIPS.charge,duration:action.getClip().duration};
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
 // The jump slam rotates the grip relative to the wrist; its mean axis cannot
 // represent both the overhead hold and ground contact. Other clips stay intact.
 if(meta.gripSamples){
  const samples=meta.gripSamples;let i=1;while(i<samples.length-1 && samples[i][0]<time)i++;
  const [t0,a0]=samples[i-1],[t1,a1]=samples[i];
  axis.set(...a0).lerp(new THREE.Vector3(...a1),THREE.MathUtils.clamp((time-t0)/(t1-t0),0,1));
 }
 // +Y is the lower handle, -Y the existing blade. Clipped axes avoid grip drift.
 if(name==='heavy'){
  // Correct the weapon's contact direction without moving the rig/sim root.
  // Mixamo has no blade mesh: the actual long blade must meet the ground,
  // rather than continue the source wrist's spinning grip through the floor.
  const rootQ=H.root.getWorldQuaternion(Q()),handQ=gs.socket.parent.getWorldQuaternion(Q());
  const handY=gs.socket.getWorldPosition(V()).y;
  const down=THREE.MathUtils.clamp((handY-.04)/2.43,.05,.95);
  const contact=new THREE.Vector3(0,down,-Math.sqrt(1-down*down)).applyQuaternion(rootQ).applyQuaternion(handQ.invert());
  const width=time > meta.impact[0] ? .07 : .18;
  const w=Math.exp(-Math.pow((time-meta.impact[0])/width,2));axis.lerp(contact,w);
 }
 gs.socket.quaternion.setFromUnitVectors(Y,axis.normalize());
 gs.sword.visible=!['roll','drink','dead','down'].includes(p.state);
 gs.wasUnarmed=['roll','drink','dead','down'].includes(p.state);
 gs.ikDelay=Math.max(0,(gs.ikDelay||0)-Math.max(0,dt));
 gs.ikEnabled=!gs.wasUnarmed && gs.ikDelay<=0;
 const level=p.state==='charge'?Math.min(2,Math.floor(p.clv||0)):-1;
 gs.sword.traverse(o=>{if(o.name==='hunter-blade' && o.material.emissive){o.material.emissive.setHex(level<0?0:[0xffb13b,0xff7020,0xffe3a0][level]);o.material.emissiveIntensity=level<0?0:.3+level*.6;}});
 gs.socket.rotation.z+=level===2?Math.sin(clock*55)*.012:0;
 if(gs.ikEnabled)solveLeftArm(gs);else gs.ikDistance=0;
 return true;
}
