import * as THREE from 'three';
// Render-only authored clips. Clone tracks: accepted source GLBs remain immutable.
const smooth = x => { x = THREE.MathUtils.clamp(x, 0, 1); return x*x*(3-2*x); };
const V = () => new THREE.Vector3(), Q = () => new THREE.Quaternion();
const recoveryCache = new WeakMap(), dualCache = new WeakMap();
function sample(clip, time) {
  return new Map(clip.tracks.map(t => [t.name, Array.from(t.createInterpolant().evaluate(time))]));
}
function build(name, reference, duration, pose) {
  const count = Math.ceil(duration*60), times = Array.from({length:count+1},(_,i)=>duration*i/count);
  return new THREE.AnimationClip(name,duration,reference.tracks.map(t=>{
    const values=[];
    for(const time of times) values.push(...pose(time,t));
    return new t.constructor(t.name,times,values,t.getInterpolation());
  }));
}
const blend=(a,b,w,quaternion)=>quaternion?Q().fromArray(a).slerp(Q().fromArray(b),w).toArray():a.map((v,i)=>v+(b[i]-v)*w);
export function recoveryClips(clips) {
  if(recoveryCache.has(clips))return recoveryCache.get(clips);
  const idle=clips.find(c=>c.name==='idle'), dead=clips.find(c=>c.name==='dead'), down=clips.find(c=>c.name==='down');
  if(!idle||!dead||!down)return clips;
  const ready=sample(idle,0), floor=sample(dead,dead.duration*.88);
  // Knockback recoil -> quick fall -> brief grounded recovery -> asymmetric
  // brace/kneel -> rise. Unlike death, ends in the exact ready pose.
  const authored=build('down',down,down.duration,(t,track)=>{
    const u=t/down.duration, n=track.name, q=n.endsWith('.quaternion');
    const rest=ready.get(n), ground=floor.get(n);if(!rest||!ground)return Array.from(track.createInterpolant().evaluate(t));
    if(u<.30){const value=blend(rest,ground,smooth(u/.30),q);
      if(q&&/Spine/.test(n))return Q().fromArray(value).multiply(Q().setFromAxisAngle(new THREE.Vector3(1,0,0),-.16*Math.sin(Math.PI*u/.30))).toArray();
      return value;}
    if(u<.43)return ground;
    const rise=smooth((u-.43)/.57), value=blend(ground,rest,rise,q);
    // A visible elbow-led brace and one knee drawn up before extension.
    if(q){const side=n.includes('LeftUpLeg')?-.48:n.includes('RightLeg')?.62:n.includes('LeftArm')?.42:0;
      if(side)return Q().fromArray(value).multiply(Q().setFromAxisAngle(new THREE.Vector3(1,0,0),side*Math.sin(Math.PI*rise))).toArray();}
    return value;
  });
  const out=clips.map(c=>c.name==='down'?authored:c);recoveryCache.set(clips,out);return out;
}
// Three visual accents within the existing 5-hit special, not three new moves.
// C1 continuous angular speed: two short cutting accents flow into a longer
// finishing whirlwind without stopping at the accent boundaries.
export function whirlwindTurns(u) {
  u=THREE.MathUtils.clamp(u,0,1);
  const points=[[0,0,0],[.28,.30,1.2],[.56,.68,1.6],[1,2,0]];
  for(let i=1;i<points.length;i++)if(u<=points[i][0]){
    const [a,x,m0]=points[i-1],[b,y,m1]=points[i],d=b-a,v=(u-a)/d;
    return (2*v**3-3*v*v+1)*x+(v**3-2*v*v+v)*d*m0+(-2*v**3+3*v*v)*y+(v**3-v*v)*d*m1;
  }return 2;
}
export function dualBladeClips(clips) {
  if(dualCache.has(clips))return dualCache.get(clips);
  const original=clips;clips=recoveryClips(clips);
  const source=clips.find(c=>c.name==='spin'), idle=clips.find(c=>c.name==='idle');if(!source||!idle)return clips;
  const ready=sample(idle,0), frame=sample(source,.92), axis=new THREE.Vector3(0,1,0);
  const spin=build('spin',source,source.duration,(t,track)=>{
    const n=track.name,q=n.endsWith('.quaternion'),r=ready.get(n),f=frame.get(n);if(!r||!f)return Array.from(track.createInterpolant().evaluate(0));
    const u=t/source.duration, start=(25/30)/source.duration, end=(62/30)/source.duration;
    const active=THREE.MathUtils.clamp((u-start)/(end-start),0,1), envelope=smooth(u/start)*(1-smooth((u-end)/(1-end)));
    // Source root yaw is intentionally NOT replayed: exactly one yaw owner.
    // Locomotor lower body follows one grounded pivot; both arms alternate cuts.
    if(n.includes('Hips.quaternion'))return r;
    if(n.includes('Hips.position')){const v=[...r];v[1]-=7*envelope;return v;}
    const lower=/UpLeg|Leg[.]|Foot|Toe/.test(n), upper=/Arm|Shoulder|Hand/.test(n), torso=/Spine/.test(n);
    let value=blend(r,f,envelope*(lower ? .32 : upper ? 1 : .45),q);
    if(q){let angle=0;
      if(upper){const left=n.includes('Left'),beat=Math.sin(active*Math.PI*6+(left?Math.PI:0));angle=(n.includes('ForeArm')?.55:.35)*beat*envelope;
        // Both arms participate: mirror the source sword arm to the offhand.
        if(left){const paired=n.replace('Left','Right'),rf=frame.get(paired),rr=ready.get(paired);
          if(rf&&rr){const delta=Q().fromArray(rf).multiply(Q().fromArray(rr).invert());
            const mirrored=new THREE.Quaternion(delta.x,-delta.y,-delta.z,delta.w);
            value=Q().fromArray(r).slerp(mirrored.multiply(Q().fromArray(r)),envelope).toArray();}}}
      if(torso)angle=.16*Math.sin(active*Math.PI*6)*envelope;
      if(lower&&/UpLeg/.test(n))angle=.12*Math.sin(active*Math.PI*8+(n.includes('Left')?0:Math.PI))*envelope;
      if(angle)value=Q().fromArray(value).multiply(Q().setFromAxisAngle(axis,angle)).toArray();
    }
    return value;
  });const out=clips.map(c=>c.name==='spin'?spin:c);dualCache.set(original,out);return out;
}
export function groundPivot(b, active) {
  if(!active){if(b.groundOffset){b.model.position.y-=b.groundOffset;b.groundOffset=0;}return;}
  if(b.groundOffset)b.model.position.y-=b.groundOffset;
  b.model.updateWorldMatrix(true,true);
  const feet=['LeftToeBase','RightToeBase'].map(n=>b.bones[n]?.getWorldPosition(V()).y).filter(Number.isFinite);
  b.groundOffset=feet.length ? .035-Math.min(...feet) : 0;b.model.position.y+=b.groundOffset;
}

// Pose interpolation may sweep a toe through the floor even though endpoints
// are grounded. Lift only the visual model by the penetration, never sim root.
export function groundRecovery(b,p) {
  if(b.recoveryLift){b.model.position.y-=b.recoveryLift;b.recoveryLift=0;}
  if(p.state!=='down')return;
  b.model.updateWorldMatrix(true,true);
  const heights=['LeftToeBase','RightToeBase','LeftFoot','RightFoot','Head','Hips','LeftHand','RightHand'].map(n=>b.bones[n]?.getWorldPosition(V()).y).filter(Number.isFinite);
  b.recoveryLift=heights.length ? Math.max(0,.015-Math.min(...heights)) : 0;
  b.model.position.y+=b.recoveryLift;
}
