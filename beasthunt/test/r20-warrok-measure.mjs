import fs from'node:fs';import {T,V,models}from'./r20-pose-helpers.mjs';
const W=models.buildWarrok();await W.ready;const b=W.warrok,model=b.model,bones={};model.traverse(o=>{if(o.isBone)bones[o.name.replace('mixamorig','')]=o;});
const meshes=[];model.traverse(o=>{if(o.isSkinnedMesh)meshes.push(o);});
const props=[];W.weapon.traverse(o=>{if(o.isMesh)props.push(o);});
const bodyTriangles=[];
for(const m of meshes){const a=m.geometry.attributes,torso=[];for(let i=0;i<a.position.count;i++){let mass=0;for(let k=0;k<4;k++){const name=m.skeleton.bones[a.skinIndex.getComponent(i,k)]?.name||'';if(/Hips|Spine|Neck|Head/.test(name))mass+=a.skinWeight.getComponent(i,k);}torso[i]=mass>.5;}
 const idx=m.geometry.index,indices=[];for(let i=0;i<(idx?.count||a.position.count);i+=3){const ids=[0,1,2].map(k=>idx?idx.getX(i+k):i+k);if(ids.every(j=>torso[j]))indices.push(ids);}bodyTriangles.push({mesh:m,indices});}
const ray=new T.Ray(),hit=V(),box=new T.Box3();
function segmentTri(a,b,tri){const dir=b.clone().sub(a),len=dir.length();if(len<1e-10)return false;ray.set(a,dir.multiplyScalar(1/len));const p=ray.intersectTriangle(...tri,false,hit);return !!p&&p.distanceTo(a)<=len+1e-8;}
function intersects(a,b){for(let k=0;k<3;k++)if(segmentTri(a[k],a[(k+1)%3],b)||segmentTri(b[k],b[(k+1)%3],a))return true;return false;}
const out={bodyScale:model.scale.x,gripRatio:0,variants:{}};
for(const scale of [1.8,3.6]){W.weapon.scale.setScalar(scale);const r={floorMin:Infinity,torsoIntersections:0,gripMax:0,clips:{}};
 for(const [name,action]of Object.entries(b.actions)){b.mixer.stopAllAction();action.reset().setLoop(T.LoopOnce,1).play();action.clampWhenFinished=true;action.paused=true;const c={floorMin:Infinity,tipMin:Infinity,torsoIntersections:0,skinMin:Infinity,samples:0};
 for(let i=0;i<=24;i++){model.position.y=0;action.time=action.getClip().duration*(i===0?0:i===24?1:(i+.371)/25);b.mixer.update(0);b.ground();model.updateWorldMatrix(true,true);c.samples++;
  const vertices=new Map();for(const m of meshes){m.skeleton.update();const vs=[];for(let j=0;j<m.geometry.attributes.position.count;j++){const v=m.getVertexPosition(j,V()).applyMatrix4(m.matrixWorld);vs.push(v);c.skinMin=Math.min(c.skinMin,v.y);}vertices.set(m,vs);}
  const propTriangles=[];for(const m of props){const a=m.geometry.attributes.position,idx=m.geometry.index,vs=[];for(let j=0;j<a.count;j++){const v=V().fromBufferAttribute(a,j).applyMatrix4(m.matrixWorld);vs.push(v);c.floorMin=Math.min(c.floorMin,v.y);}for(let j=0;j<(idx?.count||a.count);j+=3){const tri=[0,1,2].map(k=>vs[idx?idx.getX(j+k):j+k]);propTriangles.push({tri,box:new T.Box3().setFromPoints(tri)});}}
  c.tipMin=Math.min(c.tipMin,W.weapon.getObjectByName('warrok-weapon-tip').getWorldPosition(V()).y);
  for(const {mesh,indices}of bodyTriangles){const vs=vertices.get(mesh);for(const ids of indices){const tri=ids.map(i=>vs[i]);box.setFromPoints(tri);for(const prop of propTriangles)if(box.intersectsBox(prop.box)&&intersects(tri,prop.tri))c.torsoIntersections++;}}
  const palm=['Index1','Middle1','Ring1','Pinky1'].reduce((v,n)=>v.add(bones['RightHand'+n].position),V()).multiplyScalar(.125);r.gripMax=Math.max(r.gripMax,W.weaponSocket.getWorldPosition(V()).distanceTo(bones.RightHand.localToWorld(palm)));
 }r.clips[name]=c;r.floorMin=Math.min(r.floorMin,c.floorMin);r.torsoIntersections+=c.torsoIntersections;
 }out.variants[scale]=r;
}
W.weapon.scale.setScalar(3.6);out.gripRatio=W.weapon.getObjectByName('warrok-weapon-tip').position.y*3.6/(1.35*1.8);W.dispose();
fs.writeFileSync('/tmp/beasthunt-r20-warrok-metrics.json',JSON.stringify(out,null,2));
console.log(JSON.stringify(out));
if(process.argv.includes('--strict')){const r=out.variants[3.6];if(r.floorMin<-.05||r.torsoIntersections>0)process.exitCode=1;}
