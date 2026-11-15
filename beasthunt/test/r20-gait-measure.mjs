import fs from'node:fs';import {T,V,asset}from'./r20-pose-helpers.mjs';
const a=await asset('hunter-erika-bow.glb'),model=a.scene,bones={};model.traverse(o=>{if(o.isBone)bones[o.name.replace('mixamorig:','').replace('mixamorig','')]=o;});const mixer=new T.AnimationMixer(model),out={};
for(const name of ['walkF','walkB','walkL','walkR']){const clip=a.animations.find(c=>c.name===name),action=mixer.clipAction(clip);mixer.stopAllAction();action.reset().play();action.paused=true;
 const feet=[[],[]];for(let i=0;i<=120;i++){action.time=clip.duration*i/120;mixer.update(0);model.updateMatrixWorld(true);for(let j=0;j<2;j++)feet[j].push(bones[['LeftToeBase','RightToeBase'][j]].getWorldPosition(V()).sub(bones.Hips.getWorldPosition(V())));}
 const axis=name==='walkF'||name==='walkB'?'z':'x';out[name]={stride:feet.reduce((s,f)=>s+Math.max(...f.map(v=>v[axis]))-Math.min(...f.map(v=>v[axis])),0),pelvisYaw:Math.atan2(new T.Vector3(0,0,1).applyQuaternion(bones.Hips.getWorldQuaternion(new T.Quaternion())).x,new T.Vector3(0,0,1).applyQuaternion(bones.Hips.getWorldQuaternion(new T.Quaternion())).z)};
}
fs.writeFileSync('/tmp/beasthunt-r20-strides.json',JSON.stringify(out,null,2));console.log(JSON.stringify(out));
