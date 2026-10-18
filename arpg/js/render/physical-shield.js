// Lightweight shaded attached equipment: no new atlas lease or character rebake.
export function physicalShieldPose(e, age=0) {
  if(e.kind !== 'player' || !(e.weapon === 'blade' || e.weapon === 'focus' && e.weaponForm === 'wand') || e.offhand !== 'shield' || e.handedness === 2 || e.dead || e.terminal) return null;
  const bashing=e.act?.id === 'shield_bash',blocking=e.shieldGuard?.left>0 || bashing;
  const facing=bashing ? e.act.facing ?? e.facing : e.shieldGuard?.left>0 ? e.shieldGuard.facing : e.facing;
  const reach=bashing && e.act.phase === 'active' ? 27 : blocking ? 20 : 4;
  const yaw=facing+(blocking?0:.3),bob=e.moving?Math.sin(age*15)*1.4:Math.sin(age*3)*.35;
  // Left forearm in pawn-local coordinates. Root inherits atlas/renderer scale.
  return {x:Math.cos(facing)*reach+Math.sin(facing)*13,
    y:-21+Math.sin(facing)*reach*.5-Math.cos(facing)*5-bob,
    handX:Math.sin(facing)*12,handY:-23-Math.cos(facing)*5-bob,
    width:4+10*Math.abs(Math.sin(yaw)),height:14,thickness:3,
    behind:Math.sin(facing)<-.2,front:Math.sin(yaw)>=0,round:true,blocking,bashing};
}
export function drawPhysicalShield(g,p) {
  const w=p.width,h=p.height,t=p.thickness;
  g.clear().ellipse(t,1,w,h).fill(0x242c32).stroke({color:0x111a20,width:1});
  g.ellipse(0,0,w,h).fill(0x9ca8ac).stroke({color:0x35424a,width:1});
  g.ellipse(-.7,-.9,Math.max(2,w-1.5),h-1.5).stroke({color:p.blocking?0xf0d99b:0xd5d9cf,width:1.4});
  g.ellipse(0,0,Math.max(1,w-3),h-3).fill(p.front?0x4d6570:0x594436);
  if(p.front) {
    g.ellipse(-w*.18,-2,Math.max(1,w-4),h-5).fill(0x718996);
    g.ellipse(w*.18,3,Math.max(1,w-5),h-7).fill(0x536975);
    for(let i=0;i<8;i++){const a=i*Math.PI/4;g.circle(Math.cos(a)*(w-1.5),Math.sin(a)*(h-1.5),.85).fill(0xe0d4ad);}
    g.ellipse(1,1,Math.max(1,w*.34),4.5).fill(0x293d49);
    g.ellipse(0,0,Math.max(1,w*.34),4.5).fill(0xa8b6bc);
    g.ellipse(-.6,-1,Math.max(.6,w*.19),2.5).fill(0xe0e5df);
  } else {
    for(const x of [-.4,.15,.65])g.moveTo(w*x,-9).lineTo(w*x,9).stroke({color:0x382b25,width:1});
    // Backside leather arm strap and iron hand grip, not a front-face ornament.
    g.ellipse(0,0,Math.max(1,w*.5),7).stroke({color:0x241e1a,width:3});
    g.roundRect(-Math.max(1,w*.22),-5,Math.max(2,w*.44),10,1).fill(0x252e32).stroke({color:0xa7aaa1,width:1});
  }
  return g;
}
export function withPhysicalShield(visual,Graphics) {
  const shadow=new Graphics(),arm=new Graphics(),shield=new Graphics();
  visual.container.addChild(shadow,arm,shield);
  let pose=null,destroyed=false;
  return {...visual,get debug(){return {...visual.debug,physicalShield:pose};},update(e,anim,dt){
    if(destroyed)return;
    visual.update(e,anim,dt);pose=physicalShieldPose(e,anim.age||0);
    shield.visible=arm.visible=shadow.visible=!!pose;
    if(!pose)return;
    arm.clear().moveTo(pose.handX,pose.handY).lineTo(pose.x,pose.y).stroke({color:0x35454e,width:5})
      .moveTo(pose.handX,pose.handY-1).lineTo(pose.x,pose.y-1).stroke({color:0x8b9a9c,width:2})
      .circle(pose.x,pose.y,2.7).fill(0xa7aaa0);
    drawPhysicalShield(shield,pose);shield.position.set(pose.x,pose.y);
    shadow.clear().ellipse(pose.x*.6,2,pose.width*.65,2.5).fill({color:0x0b1115,alpha:.22});
    visual.container.setChildIndex(shadow,0);
    visual.container.setChildIndex(arm,pose.behind?1:visual.container.children.length-2);
    visual.container.setChildIndex(shield,pose.behind?2:visual.container.children.length-1);
  },destroy(){if(destroyed)return;destroyed=true;
    for(const g of [shield,arm,shadow]){g.removeFromParent();g.destroy();}
    visual.destroy();
  }};
}
