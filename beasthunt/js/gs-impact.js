import * as THREE from 'three';
// All ownership lives on the view/Hunter, never on the simulation or wire state.
export const chargeTier = p => Math.min(2, Math.max(0, Math.floor((p.frac ?? (p.clv || 0) / 3) * 3)));
export const isHeavy = p => p.weapon === 'gs' && p.state === 'atk' && (p.combo === -1 || p.cur?.charge > 0 && !p.cur?.shot);
export function crossedImpact(p, view) {
  if (!isHeavy(p)) { view.heavySeen = false; return false; }
  if (!view.heavySeen || p.t < view.heavyTime) view.heavyFired = false;
  view.heavySeen = true; view.heavyTime = p.t;
  if (view.heavyFired || p.t < p.cur.h0) return false;
  view.heavyFired = true; return true;
}
export class GSImpacts {
  constructor(scene, low) {
    this.low = low; this.cursor = 0;
    const ring = new THREE.RingGeometry(.86, 1, 40); ring.rotateX(-Math.PI/2);
    const cracks = [];
    for(let i=0;i<7;i++) { const a=i*Math.PI*2/7; let x=0,z=0;
      for(let j=1;j<=3;j++) { const r=j*.55, nx=Math.sin(a+(j%2?.13:-.13))*r,nz=Math.cos(a+(j%2?.13:-.13))*r; cracks.push(x,.025,z,nx,.025,nz); x=nx;z=nz; }
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(cracks,3));
    this.pool=Array.from({length:8},()=>{
      const r=new THREE.Mesh(ring,new THREE.MeshBasicMaterial({color:0xffd18a,transparent:true,depthWrite:false,side:THREE.DoubleSide}));
      const d=low?null:new THREE.LineSegments(geo,new THREE.LineBasicMaterial({color:0x3b2419,transparent:true,depthWrite:false}));
      r.visible=false;scene.add(r);if(d){d.visible=false;scene.add(d);}return {r,d,age:2,tier:0};
    });
  }
  spawn(p, point) {
    const f=this.pool[this.cursor++%this.pool.length],t=chargeTier(p),x=point?.x ?? p.x+Math.sin(p.yaw)*2,z=point?.z ?? p.z+Math.cos(p.yaw)*2;
    f.age=0;f.tier=t;f.r.position.set(x,.055,z);f.r.visible=true;
    if(f.d){f.d.position.set(x,0,z);f.d.scale.setScalar(1+t*.3);f.d.rotation.y=p.yaw;f.d.visible=true;}
    this.update(0);return {x,z,tier:t};
  }
  update(dt) { for(const f of this.pool){f.age+=dt;const k=f.age/.35;f.r.visible=k<1;
    f.r.scale.setScalar(.3+(1-Math.pow(1-Math.min(1,k),2))*(1.9+f.tier*.7));f.r.material.opacity=Math.max(0,1-k)*.8;
    if(f.d){f.d.visible=f.age<1.5;f.d.material.opacity=Math.max(0,1-f.age/1.5)*.8;}
  }}
}
