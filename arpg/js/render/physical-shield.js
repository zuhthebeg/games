import {shieldSpec} from '../content/shields.js';
// Presentation only: the grip comes from the same baked frame as the character.
// round_shield currently has one shared item artwork: pointed wood, gold rim/boss.
export function physicalShieldPose(e, age=0, hand=null, out={}) {
  if(hand?.baked)return null; // Selected skeleton layer already depth-composes this shield.
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
  const spec=shieldSpec(e.shieldModel);
  out.width=(4+9*Math.abs(Math.sin(facing)))*scale*(spec?.width ?? 1);out.height=15*scale*(spec?.height ?? 1);out.thickness=2*scale;
  out.behind=hand?.behind ?? Math.sin(facing)<-.2;
  out.front=!out.behind;out.round=spec?.shape === 'round';out.shape=spec?.shape || 'kite';out.blocking=blocking;out.bashing=bashing;
  return out;
}
function outline(g,w,h,dx=0,dy=0) {
  // Same peaked top, broad shoulders, tapered lower point as shield-armor-v2.webp.
  return g.poly([dx,dy-h,dx+w,dy-h*.78,dx+w*.9,dy+h*.35,dx+w*.58,dy+h*.72,dx,dy+h,dx-w*.58,dy+h*.72,dx-w*.9,dy+h*.35,dx-w,dy-h*.78]);
}
export function drawPhysicalShield(g,p) {
  const w=p.width,h=p.height;
  if(p.shape !== 'kite') return drawShieldVariant(g,p);
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
// Each contour is shared by every facing; only the existing socket projection
// narrows it. No second attachment system, no front-facing icon billboard.
function variantOutline(g,shape,w,h,x=0,y=0) {
  if(shape === 'round') return g.ellipse(x,y,w,h);
  if(shape === 'tower') return g.roundRect(x-w,y-h,w*2,h*2,Math.min(2,w*.3));
  if(shape === 'bone') return g.poly([x,y-h,x+w*.35,y-h*.83,x+w*.8,y-h*.96,x+w,y-h*.5,x+w*.8,y+h*.15,x+w*.55,y+h*.6,x,y+h,x-w*.55,y+h*.6,x-w*.8,y+h*.15,x-w,y-h*.5,x-w*.8,y-h*.96,x-w*.35,y-h*.83]);
  return g.poly([x,y-h,x+w*.7,y-h*.94,x+w,y-h*.7,x+w*.9,y+h*.05,x+w*.55,y+h*.55,x,y+h,x-w*.55,y+h*.55,x-w*.9,y+h*.05,x-w,y-h*.7,x-w*.7,y-h*.94]);
}
function drawShieldVariant(g,p) {
  const {width:w,height:h,shape}=p;
  const edge=shape === 'bone' ? 0xbeb18c : shape === 'round' ? 0x939d96 : 0xb79b60;
  const face=shape === 'round' ? 0x657574 : shape === 'tower' ? 0x675039 : shape === 'bone' ? 0x504d40 : 0x263e58;
  g.clear();variantOutline(g,shape,w,h,p.thickness,1).fill(0x292d2b).stroke({color:0x181d1e,width:1});
  variantOutline(g,shape,w,h).fill(p.blocking?0xe6ce87:edge).stroke({color:0x262c29,width:1});
  variantOutline(g,shape,Math.max(1,w-1.7),h-1.7).fill(face);
  if(!p.front) {
    g.roundRect(-Math.max(1,w*.35),-5,Math.max(2,w*.7),8,1).stroke({color:0x302b22,width:2});
    g.roundRect(-1,-4,2,7,.5).fill(0x918469);return g;
  }
  if(shape === 'round') {
    g.ellipse(0,0,Math.max(1.4,w*.43),h*.40).fill(0xb8c0ae).stroke({color:0x394a47,width:1});
    g.ellipse(-w*.12,-h*.12,Math.max(.5,w*.15),h*.12).fill(0xdad9bc);
    for(const k of [-1,1]) g.circle(k*w*.72,0,.7).fill(0xd0bb75);
  } else if(shape === 'teardrop') {
    g.moveTo(0,-h*.76).lineTo(0,h*.65).stroke({color:0xcab36a,width:Math.max(1,w*.24)});
    g.moveTo(-w*.65,-h*.2).lineTo(w*.65,-h*.2).stroke({color:0xcab36a,width:2});
  } else if(shape === 'tower') {
    for(const k of [-.5,0,.5])g.moveTo(w*k,-h+3).lineTo(w*k,h-3).stroke({color:0x342d25,width:.7});
    for(const k of [-.5,.5]) {
      g.moveTo(-w+2,h*k).lineTo(w-2,h*k).stroke({color:0x898b76,width:2});
      for(const sign of [-1,1])g.circle(sign*(w-2),h*k,.65).fill(0xccc7a1);
    }
    g.ellipse(0,0,Math.max(1,w*.25),h*.20).fill(0xa99f75).stroke({color:0x3b433c,width:.8});
  } else {
    for(const k of [0,.28,.55])g.moveTo(-w*.72,h*(k-.05)).lineTo(0,h*(k+.2)).lineTo(w*.72,h*(k-.05)).stroke({color:0xc5b996,width:2});
    const sw=Math.max(2,w*.43),sy=-h*.44;
    g.ellipse(0,sy,sw,h*.30).fill(0xd2c3a0).stroke({color:0x776d55,width:.8});
    g.roundRect(-sw*.65,sy+h*.13,sw*1.3,h*.25,1).fill(0xbeb18b);
    for(const sign of [-1,1])g.ellipse(sign*sw*.45,sy,Math.max(.65,sw*.28),h*.075).fill(0x29322b);
    g.poly([0,sy+h*.07,-sw*.17,sy+h*.18,sw*.17,sy+h*.18]).fill(0x34392b);
    for(const sign of [-1,0,1])g.moveTo(sign*sw*.35,sy+h*.25).lineTo(sign*sw*.35,sy+h*.35).stroke({color:0x6f6652,width:.7});
  }
  return g;
}
export function withPhysicalShield(visual,Graphics,Container) {
  // Stable siblings survive lazy atlas replacement AND enhancement wrappers.
  const container=new Container(),back=new Container(),front=new Container();
  const arm=new Graphics(),shield=new Graphics();
  container.addChild(back,visual.container,front);front.addChild(arm,shield);
  const reusable={};let pose=null,destroyed=false,lastBehind=false,lastWidth=-1,lastHeight=-1,lastFront=null,lastBlock=null,lastShape=null;
  return {...visual,container,get debug(){return {...visual.debug,physicalShield:pose};},update(e,anim,dt){
    if(destroyed)return;
    visual.update(e,anim,dt);
    // Frozen hit-stop retains exactly the displayed frame and grip.
    pose=physicalShieldPose(e,anim.age||0,visual.offhandPose?.(),reusable);
    shield.visible=arm.visible=!!pose;if(!pose)return;
    if(pose.behind!==lastBehind){(pose.behind?back:front).addChild(arm,shield);lastBehind=pose.behind;}
    arm.clear().moveTo(pose.handX,pose.handY).lineTo(pose.x,pose.y).stroke({color:0x64533a,width:3});
    if(pose.width!==lastWidth||pose.height!==lastHeight||pose.front!==lastFront||pose.blocking!==lastBlock||pose.shape!==lastShape){
      drawPhysicalShield(shield,pose);lastWidth=pose.width;lastHeight=pose.height;lastFront=pose.front;lastBlock=pose.blocking;lastShape=pose.shape;
    }
    shield.position.set(pose.x,pose.y);
  },destroy(){if(destroyed)return;destroyed=true;
    visual.destroy();container.removeFromParent();container.destroy({children:true});
  }};
}
