// Original faceted fieldcraft: lofted anatomy, articulated joints, no external assets.
import * as THREE from 'three';
import { MONSTERS } from 'bh/data';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { createGSMotion, syncHunterGS } from 'bh/gs-motion';
export { syncHunterGS };
function mergeGeometries(gs){const p=[],ix=[];let offset=0;for(const g of gs){p.push(...g.attributes.position.array);const idx=g.index?g.index.array:Array.from({length:g.attributes.position.count},(_,i)=>i);for(const i of idx)ix.push(i+offset);offset+=g.attributes.position.count;}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setIndex(ix);g.computeVertexNormals();return g;}
const M = (color,o={}) => new THREE.MeshStandardMaterial({color,flatShading:true,roughness:.85,...o});
const G=(x=0,y=0,z=0)=>{const g=new THREE.Group();g.position.set(x,y,z);return g;};
const mesh=(g,m,x=0,y=0,z=0)=>{const a=new THREE.Mesh(g,m);a.position.set(x,y,z);a.castShadow=true;return a;};
const cone=(r,h,n=5)=>new THREE.ConeGeometry(r,h,n);
const sph=(r,w=6,h=3)=>new THREE.SphereGeometry(r,w,h);
// Cross sections along Z: [z, centreY, halfWidth, halfHeight]. Ridge-biased rings
// give shoulder planes, a keel and a brow rather than stretched primitive ellipses.
function loft(rings,n=8){if(rings.at(-1)[0]<rings[0][0])rings=[...rings].reverse();const p=[],ix=[];for(const [z,y,w,h] of rings)for(let j=0;j<n;j++){const a=j/n*Math.PI*2;p.push(Math.cos(a)*w,y+Math.sin(a)*h,z);}for(let i=0;i<rings.length-1;i++)for(let j=0;j<n;j++){const a=i*n+j,b=i*n+(j+1)%n,c=a+n,d=b+n;ix.push(a,b,c,b,d,c);}for(let j=1;j<n-1;j++){ix.push(0,j+1,j);const o=(rings.length-1)*n;ix.push(o,o+j,o+j+1);}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setIndex(ix);g.computeVertexNormals();return g;}
function link(g,a,b,r0,r1,mat,n=6){const A=new THREE.Vector3(...a),B=new THREE.Vector3(...b),v=B.clone().sub(A);const m=mesh(new THREE.CylinderGeometry(r1,r0,v.length(),n),mat);m.position.copy(A.add(B).multiplyScalar(.5));m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize());g.add(m);return m;}
function horn(g,points,r,mat){const list=[];for(let i=0;i<points.length-1;i++)list.push(link(g,points[i],points[i+1],r*(1-i/(points.length-1)),r*(1-(i+1)/(points.length-1)),mat,5));return list;}
// Merge only rigid siblings, by shared material. Articulated pivots remain intact.
function batch(root){root.traverse(g=>{if(g.isMesh)return;const bins=new Map();for(const c of [...g.children])if(c.isMesh&&!c.userData.breakable){const a=bins.get(c.material)||[];a.push(c);bins.set(c.material,a);}for(const [mat,items] of bins){if(items.length<2)continue;const gs=items.map(m=>{m.updateMatrix();return m.geometry.clone().applyMatrix4(m.matrix);});const merged=mergeGeometries(gs,false);if(merged){items.forEach(m=>{g.remove(m);m.geometry.dispose();});g.add(mesh(merged,mat));}gs.forEach(x=>x.dispose());}});}
export const ARMOR_COL=[0x8b7355,0x7a4b2c,0x9cc9e3,0xb23a22,0x4b3a78];
export const WPN_COL=[0xc3c7cf,0xd9b77c,0x9fe4ff,0xff8440,0xc79bff];
function buildProceduralHunter(wt,wTier,aTier){
 const root=G(),hips=G(0,.92,0),torso=G();root.add(hips);hips.add(torso);
 const am=M(ARMOR_COL[aTier-1]),dark=M(0x283238),trim=M(aTier>=5?0xe8c35a:0xc6a77b,{metalness:.5}),skin=M(0xd6a882),steel=M(WPN_COL[wTier-1],{metalness:.6,roughness:.3});
 const chest=mesh(loft([[-.22,.36,.23,.25],[0,.4,.34,.33],[.22,.36,.25,.25]]),am);torso.add(chest);
 link(torso,[-.26,.12,0],[.26,.12,0],.09,.09,trim);
 // Split, scalloped field-cloak below the shoulder blades.
 for(const s of [-1,1]){const cloth=mesh(loft([[-.28,.42,.26,.25],[-.4,.12,.3,.27],[-.48,-.22,.34,.12]],6),dark,s*.1,0,0);torso.add(cloth);}
 const head=G(0,.88,0);torso.add(head);head.add(mesh(sph(.19),skin));head.add(mesh(loft([[-.22,.05,.12,.16],[0,.08,.235,.22],[.2,.04,.17,.17]],8),am));
 link(head,[-.16,.02,.19],[.16,.02,.19],.025,.025,dark);link(head,[0,.07,.21],[0,-.14,.2],.035,.02,trim);
 horn(head,[[0,.24,-.1],[0,.38,-.15],[0,.43,-.27]],.065,trim);
 const elbows=[],knees=[];
 const arm=s=>{const a=G(s*.4,.62,0);torso.add(a);a.add(mesh(sph(.18),am));link(a,[0,-.05,0],[0,-.29,0],.11,.085,dark);const elbow=G(0,-.29,0);a.add(elbow);elbow.add(mesh(sph(.095),trim));link(elbow,[0,0,0],[0,-.29,.03],.105,.065,am);const hand=G(0,-.31,.03);elbow.add(hand);hand.add(mesh(sph(.085),dark));elbows.push(elbow);return {a,hand};};
 const R=arm(-1),L=arm(1);
 const leg=s=>{const g=G(s*.17,0,0);hips.add(g);link(g,[0,0,0],[0,-.4,0],.135,.095,dark);const k=G(0,-.4,0);g.add(k);k.add(mesh(sph(.125),trim));link(k,[0,0,0],[0,-.37,0],.12,.085,am);k.add(mesh(loft([[-.12,-.4,.1,.08],[.09,-.4,.12,.08],[.23,-.42,.07,.05]],6),dark));knees.push(k);return g;};
 const legL=leg(1),legR=leg(-1);
 const blade=(h,len,w)=>hunterBlade(h,len,w,dark,trim,steel);
 if(wt==='gs')hunterBlade(R.hand,2.12,.23,dark,trim,steel,true);else if(wt==='db'){blade(R.hand,.92,.13);blade(L.hand,.92,.13);}else{const pts=[[0,-.55,-.62],[0,-.2,-.8],[0,.2,-.55],[0,.5,0],[0,.2,.55],[0,-.2,.8],[0,-.55,.62]];horn(L.hand,pts,.055,steel);link(L.hand,pts[0],pts.at(-1),.008,.008,trim,3);link(torso,[.18,.14,-.32],[.3,.7,-.32],.12,.14,dark);for(let i=0;i<3;i++)link(torso,[.18+i*.06,.5,-.32],[.18+i*.06,.94,-.32],.012,.012,trim,3);}
 batch(root);return {root,hips,torso,head,armR:R.a,armL:L.a,legL,legR,elbows,knees};
}
function hunterBlade(h,len,w,dark,trim,steel,refined=false){if(refined)return greatswordBlade(h,len,w,dark,trim,steel);const g=G();g.rotation.x=-1.25;h.add(g);link(g,[0,.14,0],[0,-.25,0],.045,.045,dark);horn(g,[[-w*.9,-.25,0],[0,-.31,.03],[w*.9,-.25,0]],.065,trim);const b=mesh(loft([[0,0,w,.045],[len*.75,0,w*.65,.04],[len,0,.005,.005]],4),steel,0,-.31,0);b.name='hunter-blade';b.rotation.x=Math.PI/2;g.add(b);link(g,[0,-.32,.05],[0,-len*.85,.05],.022,.006,trim);return g;}
// Same 98-triangle sword budget: 28 blade + 8 edges + 8 pommel replace
// the previous 20 blade + 24 decorative spine. DB retains its original geometry.
function greatswordBlade(h,len,w,dark,trim,steel){
 const g=G();g.rotation.x=-1.25;h.add(g);
 link(g,[0,.14,0],[0,-.25,0],.045,.045,dark);
 horn(g,[[-w*1.2,-.20,-.02],[0,-.29,.035],[w*1.2,-.20,-.02]],.065,trim);
 const face=steel.clone();face.color.multiplyScalar(.48);face.roughness=.42;
 const b=mesh(loft([[0,0,w*.67,.022],[.20,0,w,.036],[len*.76,0,w*.56,.026],[len,0,0,0]],4),face,0,-.31,0);
 b.name='hunter-blade';b.rotation.x=Math.PI/2;g.add(b);
 // Narrow bright bevels make edge and dark face unambiguous at game scale.
 const vertices=[];for(const side of [-1,1]){
  const points=[[.2,w],[len*.76,w*.56],[len,0]];
  for(let i=0;i<2;i++){const [z0,x0]=points[i],[z1,x1]=points[i+1];
   const a=[side*x0,0,z0],bb=[side*Math.max(0,x0-.018),-.009,z0],c=[side*x1,0,z1],d=[side*Math.max(0,x1-.018),-.009,z1];
   vertices.push(...a,...bb,...c,...bb,...d,...c);
  }
 }
 const e=new THREE.BufferGeometry();e.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));e.computeVertexNormals();
 const edge=mesh(e,steel.clone());edge.name='hunter-edge';edge.material.side=THREE.DoubleSide;b.add(edge);
 const pommel=mesh(new THREE.OctahedronGeometry(.065,0),trim,0,.17,0);pommel.scale.set(.8,1.3,.8);g.add(pommel);
 g.userData.weaponColor=steel.color.getHex();return g;
}
// A stable procedural root is available immediately, including on 404/offline.
// Upgrading children preserves owner/guest/root visibility contracts.
let gsLoad, gsAsset;
export const hunterGSLoad = { status: 'idle', ms: 0, error: null };
export function loadHunterGS() {
 if (!gsLoad) {
  const start=performance.now(); hunterGSLoad.status='loading';
  gsLoad=new GLTFLoader().loadAsync(new URL('../assets/hunter-gs.glb?v=20261113r8a',import.meta.url).href)
   .then(asset=>{gsAsset=asset;hunterGSLoad.status='ready';hunterGSLoad.ms=performance.now()-start;return asset;})
   .catch(error=>{hunterGSLoad.status='failed';hunterGSLoad.error=String(error);return null;});
 }
 return gsLoad;
}
export function buildHunter(wt,wTier,aTier) {
 return wt==='gs' ? buildHunterGS(wTier,aTier) : buildProceduralHunter(wt,wTier,aTier);
}
export function buildHunterGS(wTier,aTier) {
 const H=buildProceduralHunter('gs',wTier,aTier);H.weaponColor=WPN_COL[wTier-1];
 const upgrade=asset=>{
  if(!asset)return H;
  const model=cloneSkeleton(asset.scene);
  // Existing scene disposal owns its resources, never the cached template.
  model.traverse(o=>{if(o.isMesh){o.geometry=o.geometry.clone();o.material=(Array.isArray(o.material)?o.material:[o.material]).map(source=>paladinMaterial(source,aTier));if(o.material.length===1)o.material=o.material[0];o.castShadow=true;o.frustumCulled=false;}});
  const sword=hunterBlade(G(),2.12,.23,M(0x283238),M(aTier>=5?0xe8c35a:0xc6a77b,{metalness:.5}),M(WPN_COL[wTier-1],{metalness:.6,roughness:.3}),true);
  sword.rotation.set(0,0,0);
  H.gs=createGSMotion(model,asset.animations,sword);
  for(const c of [...H.root.children]){H.root.remove(c);c.traverse(o=>{o.geometry?.dispose();if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.dispose());});}
  H.root.add(model); return H;
 };
 H.ready=gsAsset ? Promise.resolve(upgrade(gsAsset)) : loadHunterGS().then(upgrade);
 return H;
}
export function buildMonster(id){
 const d=MONSTERS[id].dims,root=G(),body=G(0,d.h,0);root.add(body);
 const boar=id==='boar',frost=id==='frost',ember=id==='ember';
 const C=boar?[0x624731,0x352f2a,0xdac49c,0xffd36b]:frost?[0xc4d9e2,0x48667d,0x8ad9ea,0x88eaff]:[0x943e32,0x352f44,0xe6a36b,0xffb23a];
 const ma=M(C[0]),mb=M(C[1]),mc=M(C[2]),black=M(0x17242b),tooth=M(0xf4e5c2),eyeMat=M(0x141c22,{emissive:C[3],emissiveIntensity:1.2});
 const rings=boar?[[-2,-.2,.55,.65],[-1.2,0,1.3,1.05],[.3,.25,1.5,1.45],[1.25,.1,1.15,1.25],[1.9,-.12,.68,.7]]:frost?[[-2.2,.35,.48,.55],[-1.25,.45,.7,.65],[.25,.4,.75,.75],[1.2,.65,.85,.95],[1.85,.9,.5,.7]]:[[-2,-.25,.6,.65],[-1.1,.05,1.25,1.15],[0,.9,1.1,1.5],[.9,1.65,.75,1.3],[1.4,2.25,.5,.85]];
 body.add(mesh(loft(rings),ma));
 // A continuous ventral keel gives intentional tonal planes, not a second oval.
 body.add(mesh(loft(boar?[[-1.5,-.55,.7,.3],[.4,-.7,1.05,.35],[1.5,-.35,.45,.3]]:frost?[[-1.8,.05,.4,.3],[.1,-.12,.55,.3],[1.5,.25,.45,.4]]:[[-1,-.6,.6,.35],[.25,.2,.65,.6],[1.35,1.7,.35,.6]],6),mb));
 const head=G(0,boar?-.2:frost?1.15:2.5,d.headZ-.7);body.add(head);
 link(head,[0,-.15,-1.2],[0,.05,.1],boar?.7:frost?.48:.52,boar?.65:.4,ma);
 head.add(mesh(loft(boar?[[-.4,.05,.7,.6],[.65,-.03,.68,.48],[1.4,-.23,.5,.32],[1.65,-.2,.43,.3]]:frost?[[-.5,.1,.48,.55],[.3,.1,.53,.43],[1.1,-.08,.3,.22],[1.45,-.1,.22,.18]]:[[-.6,.1,.5,.55],[.2,.1,.58,.45],[1.05,-.12,.37,.28],[1.65,-.15,.18,.15]]),ma));
 head.add(mesh(loft([[1.38,-.16,.3,.22],[1.7,-.18,.26,.2]],6),black));
 const jaw=G(0,-.35,.25);head.add(jaw);jaw.add(mesh(loft([[-.35,0,.33,.12],[.8,-.02,.35,.13],[1.35,.04,.16,.07]],6),mb));
 for(const s of [-1,1]){head.add(mesh(sph(.105,5,3),eyeMat,s*(boar?.62:.46),.22,.47));link(head,[s*.22,.39,.1],[s*.6,.35,.6],.1,.045,mb);for(let i=0;i<3;i++)link(jaw,[s*.26,.13,.45+i*.25],[s*.25,.29,.46+i*.25],.065,0,tooth,4);}
 const horns=[];
 for(const s of [-1,1]){const h=G();head.add(h);const points=boar?[[s*.52,-.25,1.2],[s*.85,-.08,1.7],[s*.8,.45,1.98],[s*.59,.75,1.92]]:frost?[[s*.42,.38,-.2],[s*.66,.85,-.34],[s*.5,1.12,-.48]]:[[s*.45,.4,-.2],[s*.72,1.1,-.65],[s*.82,1.65,-1],[s*.52,1.95,-.92]];
 // Each breakable horn is one mesh so bilateral damage keeps the original contract.
 horn(h,points,boar?.19:frost?.15:.22,mc);batch(h);const hornMesh=h.children[0];head.attach(hornMesh);head.remove(h);const base=new THREE.Vector3(...points[0]);hornMesh.geometry.translate(-base.x,-base.y,-base.z);hornMesh.position.copy(base);hornMesh.userData.breakable=true;horns.push(hornMesh);
 const ear=mesh(loft([[-.1,0,.17,.12],[0,.48,.11,.16],[.12,.7,.015,.015]],5),mb,s*(boar?.65:.48),.45,-.25);ear.rotation.z=s*(boar?-.55:-.2);head.add(ear);}
 if(frost){for(let i=0;i<11;i++){const a=i/11*Math.PI*2;const y=Math.sin(a),x=Math.cos(a);horn(head,[[x*.45,y*.45,-.5],[x*.95,y*.95,-.8],[x*1.2,y*1.25,-1.25]],.29,i%3?mb:mc);}for(let i=0;i<5;i++)horn(body,[[0,1.05,1-i*.65],[.12,1.95-i*.08,.8-i*.65],[0,2.2-i*.1,.6-i*.65]],.19,mc);}
 if(boar){for(let i=0;i<8;i++)for(const s of [-1,1])horn(body,[[s*.25,1.45-i*.12,1-i*.36],[s*.45,1.95-i*.12,.85-i*.36],[s*.55,2.05-i*.12,.6-i*.36]],.15,mb);}
 const legs=[],knees=[];
 const coords=ember?[[1,-1],[-1,-1]]:[[1,1],[-1,1],[1,-1],[-1,-1]];
 for(const [sx,sz] of coords){const y=boar?-.65:frost?.25:.05,z=ember?-1:sz*d.legZ,x=sx*d.legX;const l=G(x,y,z);body.add(l);const len=d.h+y;const knee=G(sx*.09,-len*.47,boar?0:-.28);l.add(mesh(sph(boar?.36:ember?.5:.23),ma));link(l,[0,0,0],[sx*.09,-len*.47,boar?0:-.28],ember?.48:boar?.28:.2,boar?.22:.15,ma);l.add(knee);knee.add(mesh(sph(boar?.23:.19),mb));const ankle=[0,-len*.45,boar?.1:.32];link(knee,[0,0,0],ankle,boar?.2:.14,boar?.16:.11,mb);knee.add(mesh(loft([[-.16,-len*.45,.2,.13],[.3,-len*.45,.25,.12],[.6,-len*.46,.12,.07]],6),mb));for(const cx of [-.15,0,.15])link(knee,[cx,-len*.45,.38],[cx,-len*.48,.72],.075,0,tooth,4);legs.push(l);knees.push(knee);}
 const wings=[];
 if(ember){for(const s of [-1,1]){const w=G(s*.68,1.7,.1);body.add(w);const pts=[[0,0,0],[s*1.35,.8,-.2],[s*3.8,2.4,-.7],[s*3.1,.1,-1.15],[s*2.4,.4,-1.3],[s*1.5,-.8,-1.5],[s*.8,-.35,-1.1],[0,-.75,-.7]];const p=[];for(let i=1;i<pts.length-1;i++)p.push(...pts[0],...pts[i],...pts[i+1]);const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.computeVertexNormals();w.add(mesh(g,M(0xa76e58,{side:THREE.DoubleSide})));link(w,pts[0],pts[1],.23,.15,ma);link(w,pts[1],pts[2],.15,.025,mc);for(const i of [3,5,7])link(w,pts[1],pts[i],.07,.02,mb);horn(w,[pts[1],[s*1.6,1.3,0],[s*1.8,1.35,.3]],.13,tooth);wings.push(w);}}
 const tail=[],segLen=d.tailLen/d.tailN;let parent=G(0,boar?-.1:frost?.35:-.2,-d.hz*.88);body.add(parent);const tailRoot=parent;
 for(let i=0;i<d.tailN;i++){const sg=G(0,0,i?-segLen:0);parent.add(sg);const r=d.tailW*(1-i/d.tailN*.82);sg.add(mesh(loft([[.05,0,r,r*.85],[-segLen*.5,.04,r*.75,r*.65],[-segLen,.05,d.tailW*(1-(i+1)/d.tailN*.82),d.tailW*(1-(i+1)/d.tailN*.82)*.85]],6),i%2?mb:ma));if(!boar&&i>0)horn(sg,[[0,r,-segLen*.3],[0,r+.35,-segLen*.55],[0,r+.4,-segLen*.85]],r*.35,mc);tail.push(sg);parent=sg;}
 const tip=mesh(frost?cone(.22,.7,5):sph(boar?.18:.25),mb,0,0,-segLen);if(frost)tip.rotation.x=-Math.PI/2;parent.add(tip);root.scale.setScalar(MONSTERS[id].scale);batch(root);
 return {root,body,head,jaw,legs,knees,wings,tail,tailRoot,horns,headBaseY:head.position.y,brokenHornMat:M(0xffdda0,{emissive:0xff7a35,emissiveIntensity:.5}),eyeMat,eyeCol:C[3]};
}

function hash(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }

export const BIOMES = {
  forest: { sky: 0x9cc7d6, fog: [70, 170], g: [0x5d8a3c, 0x6f9a45, 0x7d8f4c], sun: 0xfff1cf, amb: [0xcfe8ff, 0x4a5a32], mote: 0xf5ffb0, far: 0x52706a },
  snow: { sky: 0xc3d6e6, fog: [55, 150], g: [0xeaf2f7, 0xd6e4ee, 0xc2d5e3], sun: 0xeaf4ff, amb: [0xdfeeff, 0x7d8ea0], mote: 0xffffff, far: 0x8ea6bb },
  volcano: { sky: 0x3b2226, fog: [50, 140], g: [0x3c3131, 0x4a3633, 0x2f2727], sun: 0xffb27a, amb: [0x8a5a50, 0x2a1512], mote: 0xff9a3c, far: 0x241416 },
};

export function buildArena(biome, R, low = /[?&]lowfx=1/.test(location.search)) {
  const B = BIOMES[biome], group = G();
  const geo = new THREE.PlaneGeometry(190, 190, 60, 60); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color(), c2 = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), r = Math.hypot(x, z), n = hash(Math.round(x), Math.round(z));
    if (r > R + 5) pos.setY(i, Math.pow(r - R - 5, 1.25) * .32 + n * 1.6);
    c.setHex(B.g[Math.floor(n * 3) % 3]); c2.setHex(B.g[(Math.floor(n * 7)) % 3]); c.lerp(c2, hash(z, x));
    if (biome === 'volcano' && hash(x * .5, z * .5) > .93) c.setHex(0xff5a1a);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }));
  ground.receiveShadow = true; group.add(ground);
  const dummy = new THREE.Object3D();
  const inst = (g, m, n, fn) => { n = low ? Math.ceil(n * .5) : n; const im = new THREE.InstancedMesh(g, m, n); for (let i = 0; i < n; i++) { fn(low ? i * 2 : i, dummy); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); } im.castShadow = true; group.add(im); return im; };
  const ring = (i, n, r0, r1) => { const a = i / n * Math.PI * 2 + hash(i, 3) * .5, r = r0 + hash(i, 9) * (r1 - r0); return [Math.cos(a) * r, Math.sin(a) * r, r]; };
  const yAt = (r) => r > R + 5 ? Math.pow(r - R - 5, 1.25) * .32 : 0;
  // boundary stones
  inst(new THREE.DodecahedronGeometry(1, 0), M(biome === 'snow' ? 0x9fb2c2 : biome === 'volcano' ? 0x1e1717 : 0x7c7f78), 56, (i, o) => {
    const [x, z] = ring(i, 56, R + 2, R + 4.5); const s = .8 + hash(i, 1) * 1.6; o.position.set(x, s * .4, z); o.scale.set(s, s * (.7 + hash(i, 2)), s); o.rotation.set(hash(i, 4) * 3, hash(i, 5) * 3, 0);
  });
  if (biome === 'volcano') {
    inst(cone(1, 1, 5), M(0x251b1b), 70, (i, o) => { const [x, z, r] = ring(i, 70, R + 6, 82); const h = 5 + hash(i, 6) * 12; o.position.set(x, yAt(r) + h / 2 - 1, z); o.scale.set(1.5 + hash(i, 7) * 2.5, h, 1.5 + hash(i, 8) * 2.5); o.rotation.set(0, hash(i, 2) * 6, 0); });
    inst(new THREE.OctahedronGeometry(1, 0), M(0xff6a1a, { emissive: 0xff5a10, emissiveIntensity: 1.4 }), 40, (i, o) => { const [x, z, r] = ring(i, 40, R + 4, 70); const s = .4 + hash(i, 5) * .9; o.position.set(x, yAt(r) + s, z); o.scale.set(s, s * 2, s); o.rotation.set(0, hash(i, 1) * 6, hash(i, 3) * .5); });
  } else {
    const snow = biome === 'snow';
    inst(new THREE.CylinderGeometry(.3, .45, 1, 5), M(snow ? 0x4b3a30 : 0x5b4028), 90, (i, o) => { const [x, z, r] = ring(i, 90, R + 6, 84); const h = 3 + hash(i, 6) * 3; o.position.set(x, yAt(r) + h / 2 - .5, z); o.scale.set(1.2, h, 1.2); o.rotation.set(0, 0, 0); });
    for (const [k, yo, sc, colr] of [[0, 1.0, 1, snow ? 0x2f5a4a : 0x2f6b34], [1, 1.75, .72, snow ? 0xe6f0f5 : 0x3d8040]]) {
      inst(cone(1, 1, 6), M(colr), 90, (i, o) => { const [x, z, r] = ring(i, 90, R + 6, 84); const h = 3 + hash(i, 6) * 3, w = (2.2 + hash(i, 7) * 1.4) * sc; o.position.set(x, yAt(r) + h * yo + (k ? .6 : 0), z); o.scale.set(w, h * (k ? 1 : 1.3), w); o.rotation.set(0, hash(i, 2) * 6, 0); });
    }
  }
  // tufts / shards inside the arena (no collision)
  inst(cone(.14, .5, 3), M(biome === 'forest' ? 0x86b356 : biome === 'snow' ? 0xb6cad9 : 0x5a3a34), 220, (i, o) => { const a = hash(i, 11) * 6.283, r = Math.sqrt(hash(i, 12)) * (R + 3); o.position.set(Math.cos(a) * r, .22, Math.sin(a) * r); o.scale.setScalar(.7 + hash(i, 13)); o.rotation.set(hash(i, 14) * .5 - .25, hash(i, 15) * 6, hash(i, 16) * .5 - .25); });
  // Sparse collision-free field props, dense perimeter.
  inst(new THREE.DodecahedronGeometry(1,0), M(biome === 'snow' ? 0xf1f6fa : biome === 'forest' ? 0x7b8170 : 0x292b32), 34, (i,o)=>{const a=hash(i,41)*6.283,r=12+hash(i,42)*(R-15),s=.25+hash(i,43)*.65;o.position.set(Math.cos(a)*r,s*.3,Math.sin(a)*r);o.scale.set(s*1.5,s*.65,s);o.rotation.set(0,a,.2);});
  if(biome === 'snow') inst(loft([[0,0,.32,.32],[.2,1,.25,.3],[.4,2.8,.03,.04]],5),M(0x98d1e4),24,(i,o)=>{const [x,z,r]=ring(i,24,R-3,R+8);o.position.set(x,yAt(r),z);o.scale.setScalar(.7+hash(i,44));o.rotation.set(0,hash(i,45)*6,0);});
  if(biome === 'volcano') inst(loft([[-1,0,.04,.008],[0,0,.12,.01],[1,0,.025,.008]],4),M(0xff692d,{emissive:0xff490c,emissiveIntensity:1.3}),28,(i,o)=>{const a=hash(i,46)*6.283,r=8+hash(i,47)*(R-9);o.position.set(Math.cos(a)*r,.015,Math.sin(a)*r);o.rotation.set(0,a,0);o.scale.set(1,1,2+hash(i,48)*3);});
  // far silhouettes
  inst(cone(1, 1, 5), new THREE.MeshBasicMaterial({ color: B.far, fog: true }), 26, (i, o) => { const a = i / 26 * 6.283, r = 118 + hash(i, 21) * 14, h = 30 + hash(i, 22) * 34; o.position.set(Math.cos(a) * r, h / 2 - 4, Math.sin(a) * r); o.scale.set(24 + hash(i, 23) * 16, h, 24 + hash(i, 24) * 16); o.rotation.set(0, hash(i, 25) * 6, 0); });
  // drifting motes (pollen / snow / embers)
  const N = low ? 90 : 260, mp = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { mp[i * 3] = (hash(i, 31) - .5) * 110; mp[i * 3 + 1] = hash(i, 32) * 16; mp[i * 3 + 2] = (hash(i, 33) - .5) * 110; }
  const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(mp, 3));
  const motes = new THREE.Points(mg, new THREE.PointsMaterial({ color: B.mote, size: biome === 'snow' ? .22 : .16, transparent: true, opacity: .85, depthWrite: false }));
  group.add(motes);
  const dir = biome === 'volcano' ? 1 : biome === 'snow' ? -1.6 : .25;
  const update = (dt, t) => {
    const a = mg.attributes.position;
    for (let i = 0; i < N; i++) { let y = a.getY(i) + dir * dt * (.6 + (i % 5) * .2); if (y > 16) y = 0; if (y < 0) y = 16; a.setY(i, y); a.setX(i, a.getX(i) + Math.sin(t * .7 + i) * dt * .4); }
    a.needsUpdate = true;
  };
  return { group, update, B };
}

function paladinMaterial(source,tier){
 const m=source.clone();m.userData.gsCharge={value:0};m.userData.gsChargeColor={value:new THREE.Color(0xffffff)};m.color.setScalar(1.8);m.emissive.setHex(0x35404a);m.emissiveIntensity=.24;
 m.onBeforeCompile=shader=>{
 shader.uniforms.gsCharge=m.userData.gsCharge;shader.uniforms.gsChargeColor=m.userData.gsChargeColor;
 shader.uniforms.armorTint={value:new THREE.Color(ARMOR_COL[tier-1])};
 shader.vertexShader='varying vec3 armorPosition;\n'+shader.vertexShader;
 shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\narmorPosition=position;');
 shader.fragmentShader='uniform float gsCharge;uniform vec3 gsChargeColor;uniform vec3 armorTint;\nvarying vec3 armorPosition;\n'+shader.fragmentShader;
 shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\nfloat gray=dot(diffuseColor.rgb,vec3(.299,.587,.114));float sat=max(diffuseColor.r,max(diffuseColor.g,diffuseColor.b))-min(diffuseColor.r,min(diffuseColor.g,diffuseColor.b));float mask=(1.-smoothstep(.07,.2,sat))*smoothstep(.65,1.05,armorPosition.y)*(1.-smoothstep(1.38,1.49,armorPosition.y));diffuseColor.rgb=mix(diffuseColor.rgb,vec3(gray*.65+.18)*(.35+armorTint*2.2),mask*.82);');
 shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\nfloat chargeRim=pow(1.-abs(dot(normal,normalize(vViewPosition))),2.);totalEmissiveRadiance+=gsChargeColor*chargeRim*gsCharge;');
 };m.customProgramCacheKey=()=> 'paladin-armor-charge-rim';return m;
}
