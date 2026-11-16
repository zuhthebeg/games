// Render-only rig-specific palm sockets. No animation track, bone or body edits.
import * as T from 'three';
const V=()=>new T.Vector3();
export function attachMonsterWeapon(model,id,height,root){
 if(!['boar','frost','ember'].includes(id))return null;
 const bones={};model.traverse(o=>{if(o.isBone)bones[o.name]=o;});
 function palm(side){const hand=bones['mixamorig'+side+'Hand'];if(!hand)throw Error('Missing weapon hand');
 const fingers=['Index1','Middle1','Ring1','Pinky1'].map(n=>bones['mixamorig'+side+'Hand'+n]).filter(Boolean);
 // Mutant has no left finger chain: its authored wrist-to-palm distance is
 // mirrored from the intact right chain, in the same hand-local +Y axis.
 const offset=fingers.length?fingers.reduce((v,b)=>v.add(b.position),V()).multiplyScalar(.5/fingers.length):V().set(0,bones.mixamorigRightHandIndex1.position.y*.5,0);
 const socket=new T.Object3D();socket.name='monster-'+side.toLowerCase()+'-palm';socket.position.copy(offset);hand.add(socket);return socket;
 }
 const right=palm('Right'),left=palm('Left'),group=new T.Group();group.name='monster-heavy-'+id;root.add(group);
 const dark=new T.MeshStandardMaterial({color:0x382c25,roughness:.85}),metal=new T.MeshStandardMaterial({color:{boar:0xd2bea0,frost:0x7395a2,ember:0x7f6250}[id],roughness:.65,metalness:.25});
 const radius=height*.022,shaft=new T.Mesh(new T.CylinderGeometry(radius,radius,1,8),dark);group.add(shaft);
 const blade=new T.Shape();
 const points=id==='frost'?[[0,-.13],[.2,-.2],[.3,-.08],[.3,.13],[.14,.22],[0,.12]]:[[-.07,-.18],[.1,-.18],[.15,.08],[.08,.23],[-.06,.2]];
 blade.moveTo(points[0][0]*height,points[0][1]*height);for(const [x,y]of points.slice(1))blade.lineTo(x*height,y*height);blade.closePath();
 const geometry=id==='ember'?new T.BoxGeometry(height*.25,height*.14,height*.15):new T.ExtrudeGeometry(blade,{depth:height*.055,bevelEnabled:false});
 if(id!=='ember')geometry.translate(0,0,-height*.0275);
 const head=new T.Mesh(geometry,metal);group.add(head);
 const a=V(),b=V(),axis=V(),up=new T.Vector3(0,1,0),p=V(),inv=new T.Matrix4();
 const weapon={group,right,left,shaft,head,minY:Infinity,gripError:Infinity};
 weapon.sync=()=>{
 root.updateMatrixWorld(true);inv.copy(root.matrixWorld).invert();right.getWorldPosition(a).applyMatrix4(inv);left.getWorldPosition(b).applyMatrix4(inv);axis.subVectors(a,b);const distance=axis.length();if(distance<1e-5)throw Error('Degenerate weapon grips');axis.divideScalar(distance);
 group.position.copy(b);group.quaternion.setFromUnitVectors(up,axis);group.scale.set(1,1,1);
 // A single rigid haft always passes through both unmodified palms. The upper
 // head retracts along the haft at ground contact; never translate the actor.
 const pommel=height*.035,extension=height*.36;
 shaft.position.y=(distance-pommel)/2;shaft.scale.y=distance+pommel;
 head.position.set(0,distance+extension*.5,0);head.scale.set(1,1,1);
 group.updateMatrixWorld(true);
 let floor=Infinity;const position=head.geometry.attributes.position;
 for(let i=0;i<position.count;i++)floor=Math.min(floor,p.fromBufferAttribute(position,i).applyMatrix4(head.matrixWorld).y-root.position.y);
 // Shrink only decorative head about upper palm, retaining both grips/haft.
 if(floor<.015){const baseY=right.getWorldPosition(p).y-root.position.y;const f=T.MathUtils.clamp((baseY-.015)/(baseY-floor),0,1);head.scale.setScalar(f);head.position.y=distance+extension*.5*f;}
 group.updateMatrixWorld(true);weapon.minY=Infinity;
 for(const mesh of [shaft,head]){const pos=mesh.geometry.attributes.position;for(let i=0;i<pos.count;i++)weapon.minY=Math.min(weapon.minY,p.fromBufferAttribute(pos,i).applyMatrix4(mesh.matrixWorld).y-root.position.y);}
 weapon.gripError=Math.max(group.localToWorld(p.set(0,0,0)).distanceTo(left.getWorldPosition(V())),group.localToWorld(p.set(0,distance,0)).distanceTo(right.getWorldPosition(V())));
 };return weapon;
}
