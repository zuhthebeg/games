// Presentation only: the grip comes from the same baked frame as the character.
// round_shield currently has one shared item artwork: pointed wood, gold rim/boss.
export function physicalShieldPose(e, age=0, hand=null, out={}) {
  if(e.kind !== 'player' || !(e.weapon === 'blade' || e.weapon === 'focus' && e.weaponForm === 'wand') || e.offhand !== 'shield' || e.handedness === 2 || e.dead || e.terminal) return null;
  const bashing=e.act?.id === 'shield_bash',blocking=e.shieldGuard?.left>0 || bashing;
  // Match the sprite's eight discrete facings; never orbit between snapped frames.
  const facing=hand?.facing ?? Math.round(e.facing/(Math.PI/4))*(Math.PI/4);
  const bob=e.moving?Math.sin(age*15)*1.4:Math.sin(age*3)*.35;
  out.handX=hand?.x ?? Math.sin(facing)*13;
  out.handY=hand?.y ?? -18-Math.cos(facing)*5-bob;
  // A block/bashing accent is only a small forearm extension, not a 27px detach.
  out.x=out.handX+Math.cos(facing)*(blocking?5:0);
  out.y=out.handY+Math.sin(facing)*(blocking?2:0);
  const scale=hand?.scale ?? 1;
  out.width=(4+9*Math.abs(Math.sin(facing)))*scale;out.height=15*scale;out.thickness=2*scale;
  out.behind=hand?.behind ?? Math.sin(facing)<-.2;
  out.front=!out.behind;out.round=false;out.shape='kite';out.blocking=blocking;out.bashing=bashing;
  return out;
}
function outline(g,w,h,dx=0,dy=0) {
  // Same peaked top, broad shoulders, tapered lower point as shield-armor-v2.webp.
  return g.poly([dx,dy-h,dx+w,dy-h*.78,dx+w*.9,dy+h*.35,dx+w*.58,dy+h*.72,dx,dy+h,dx-w*.58,dy+h*.72,dx-w*.9,dy+h*.35,dx-w,dy-h*.78]);
}
export function drawPhysicalShield(g,p) {
  const w=p.width,h=p.height;
  g.clear();outline(g,w,h,p.thickness,1).fill(0x242a2a).stroke({color:0x151d20,width:1});
  outline(g,w,h).fill(0x464b48).stroke({color:0x202725,width:1});
  outline(g,w-1.5,h-1.5).fill(p.blocking?0xe8cd7d:0xc7a45c);
  outline(g,Math.max(1,w-3),h-3).fill(0x986d3b);
  if(p.front) {
    // Straight planks, one clean boss: no nested offset ellipses/vortex highlights.
    for(let i=-1;i<=1;i++) {
      const x=i*(w-3)*.55;
      g.moveTo(x,-h+4).lineTo(x,h-5-Math.abs(i)*3).stroke({color:0x604725,width:.8});
    }
    g.moveTo(-w+2,-h*.7).lineTo(-w+3,h*.22).stroke({color:0xe2c989,width:.8});
    const bw=Math.max(1.2,w*.38);
    g.ellipse(0,-1,bw,4.6).fill(0xc8ac61).stroke({color:0x454b41,width:1});
    g.ellipse(0,-1,bw*.62,3).fill(0xe5cd86).stroke({color:0x7e672e,width:.7});
    g.circle(-bw*.3,-3,.85).fill(0xffedb0);
    for(const sign of [-1,1])g.circle(sign*(w-1.4),-h*.72,.65).fill(0xb9b8a0);
    g.circle(0,h-1.8,.65).fill(0xb9b8a0);
  } else {
    g.moveTo(-w*.35,-8).lineTo(-w*.35,7).moveTo(w*.35,-8).lineTo(w*.35,7).stroke({color:0x503b25,width:1});
    g.roundRect(-Math.max(1,w*.35),-5,Math.max(2,w*.7),8,1).stroke({color:0x382d23,width:2});
    g.roundRect(-1,-5,2,8,.5).fill(0x8f8d72);
  }
  return g;
}
export function withPhysicalShield(visual,Graphics,Container) {
  // Stable siblings survive lazy atlas replacement AND enhancement wrappers.
  const container=new Container(),back=new Container(),front=new Container();
  const arm=new Graphics(),shield=new Graphics();
  container.addChild(back,visual.container,front);front.addChild(arm,shield);
  const reusable={};let pose=null,destroyed=false,lastBehind=false,lastWidth=-1,lastFront=null,lastBlock=null;
  return {...visual,container,get debug(){return {...visual.debug,physicalShield:pose};},update(e,anim,dt){
    if(destroyed)return;
    visual.update(e,anim,dt);
    // Frozen hit-stop retains exactly the displayed frame and grip.
    pose=physicalShieldPose(e,anim.age||0,visual.offhandPose?.(),reusable);
    shield.visible=arm.visible=!!pose;if(!pose)return;
    if(pose.behind!==lastBehind){(pose.behind?back:front).addChild(arm,shield);lastBehind=pose.behind;}
    arm.clear().moveTo(pose.handX,pose.handY).lineTo(pose.x,pose.y).stroke({color:0x64533a,width:3});
    if(pose.width!==lastWidth||pose.front!==lastFront||pose.blocking!==lastBlock){
      drawPhysicalShield(shield,pose);lastWidth=pose.width;lastFront=pose.front;lastBlock=pose.blocking;
    }
    shield.position.set(pose.x,pose.y);
  },destroy(){if(destroyed)return;destroyed=true;
    visual.destroy();container.removeFromParent();container.destroy({children:true});
  }};
}
