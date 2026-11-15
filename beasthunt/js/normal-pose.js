// Render-only 80ms bridge, including a new act using the SAME mixer action.
// Restore before seek: paused PropertyMixers may skip unchanged local values.
const normal=p=>p.state==='atk'&&(p.combo??0)>=0&&!(p.cur?.charge>0);
const identity=p=>p.attackTick??p.actionTick??p.attackId;
export function normalRestart(b,p){
 const id=identity(p);
 return p.state==='atk'&&(p.t<b.lastT-.00001||p.combo!==b.combo||id!==undefined&&b.normalIdentity!==undefined&&id!==b.normalIdentity);
}
const row=bone=>({bone,p:bone.position.clone(),q:bone.quaternion.clone()});
const capture=rows=>{for(const v of rows){v.p.copy(v.bone.position);v.q.copy(v.bone.quaternion);}};
export function restoreNormalPose(b){
 const s=b.normalPose;if(!s?.applied)return;
 for(const v of s.base){v.bone.position.copy(v.p);v.bone.quaternion.copy(v.q);}s.applied=false;
}
export function blendNormalPose(b,p,restart){
 let s=b.normalPose;
 if(!s){const bones=Object.values(b.bones);s=b.normalPose={last:bones.map(row),base:bones.map(row),from:null,applied:false,wasNormal:false};}
 if(restart){s.from=normal(p)&&s.wasNormal?s.last.map(v=>({...v,p:v.p.clone(),q:v.q.clone()})):null;s.fromSocket=s.from?s.lastSocket?.clone():null;}
 if(!normal(p)){s.from=null;s.fromSocket=null;}
 // Authoritative act elapsed, not time since this remote first became visible.
 const u=Math.max(0,Math.min(1,(p.t||0)/.08));s.weight=u*u*(3-2*u);
 capture(s.base);
 if(s.from&&u<1){for(const v of s.from){v.bone.position.lerpVectors(v.p,v.bone.position,s.weight);v.bone.quaternion.slerpQuaternions(v.q,v.bone.quaternion,s.weight);}s.applied=true;}
 capture(s.last);s.wasNormal=normal(p);b.normalIdentity=identity(p);b.normalBlendSeconds=s.from&&u<1?.08:0;
}
export function blendNormalSocket(b,socket){
 const s=b.normalPose;if(!s)return;
 if(s.fromSocket&&b.normalBlendSeconds)socket.quaternion.slerpQuaternions(s.fromSocket,socket.quaternion,s.weight);
 if(!s.lastSocket)s.lastSocket=socket.quaternion.clone();else s.lastSocket.copy(socket.quaternion);
}
