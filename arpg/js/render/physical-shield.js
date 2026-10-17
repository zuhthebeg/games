// Code-native attached equipment, not a new baked guard/bash character animation.
export function physicalShieldPose(e) {
  if (e.kind !== 'player' || e.weapon !== 'blade' || e.offhand !== 'shield' || e.dead) return null;
  const blocking=e.shieldGuard?.left > 0 || e.act?.id === 'shield_bash';
  const facing=e.shieldGuard?.left > 0 ? e.shieldGuard.facing : e.facing;
  const reach=blocking?19:5;
  return {x:Math.cos(facing)*reach-Math.sin(facing)*13,y:-18+Math.sin(facing)*reach*.5+Math.cos(facing)*5,
    width:Math.max(6,12*Math.abs(Math.cos(facing))),behind:Math.sin(facing)<-.2,blocking};
}
export function withPhysicalShield(visual, Graphics) {
  const shield=new Graphics();visual.container.addChild(shield);
  return {...visual,update(e,anim,dt){
    visual.update(e,anim,dt);const pose=physicalShieldPose(e);shield.visible=!!pose;
    if(!pose)return;
    shield.clear().poly([-pose.width,-12,pose.width,-12,pose.width,3,0,14,-pose.width,3])
      .fill(0x526575).stroke({color:pose.blocking?0xf2d48d:0xc6bd9e,width:2})
      .circle(0,-1,3).fill(0xbaaa7c);
    shield.position.set(pose.x,pose.y);
    visual.container.setChildIndex(shield,pose.behind?0:visual.container.children.length-1);
  },destroy(){visual.destroy();}};
}
