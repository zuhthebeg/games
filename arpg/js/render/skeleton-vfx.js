// Presentation only: all geometry is deterministic; no random/simulation writes.
// Coordinates are explicit so drawing many hands never allocates proxy methods/arrays.
export function drawGraspingHands(g, radius, color = 0xe1ead0, ox = 0, oy = 0, rise = 1, grip = 1) {
  const reach = Math.max(14, Math.min(32, radius));
  for (let side = -1; side <= 1; side += 2) {
    const x = ox + side * (reach + 5), base = oy + 7;
    const wristX = x - side * 5, wristY = base - 26 * rise;
    const palmX = wristX - side * (6 + grip * 3), palmY = wristY - 10 * rise;
    g.ellipse(x,base,15,6).fill({color:0x130f1c,alpha:.9})
      .stroke({color:0x91b867,width:2,alpha:.6});
    // Two long forearm bones, wrist joint, palm and four fingers curling inward.
    g.moveTo(x-3,base).lineTo(wristX-3,wristY).moveTo(x+4,base).lineTo(wristX+4,wristY)
      .stroke({color:0x49395d,width:8,alpha:.9});
    g.moveTo(x-3,base).lineTo(wristX-3,wristY).moveTo(x+4,base).lineTo(wristX+4,wristY)
      .stroke({color,width:3.5});
    g.circle(wristX,wristY,5).fill(0x9ebc95).stroke({color:0xe6f2dc,width:1.5})
      .moveTo(wristX,wristY).lineTo(palmX,palmY).stroke({color,width:9});
    for (let finger = 0; finger < 4; finger++) {
      const fx = palmX + side * (finger * 3 - 4), fy = palmY - finger * 2 * rise;
      const tipX = fx - side * (9 + grip * 5), tipY = fy - (10 - grip * 5) * rise;
      g.moveTo(fx,fy).lineTo(fx-side*4,fy-12*rise).lineTo(tipX,tipY-3*rise)
        .lineTo(tipX+side*2,tipY+8*grip*rise).stroke({color:0x37263f,width:5.5})
        .moveTo(fx,fy).lineTo(fx-side*4,fy-12*rise).lineTo(tipX,tipY-3*rise)
        .lineTo(tipX+side*2,tipY+8*grip*rise).stroke({color,width:2.8})
        .circle(fx-side*4,fy-12*rise,2).fill(0xf5ffe7);
    }
    g.moveTo(palmX+side*3,palmY+3).lineTo(palmX-side*9,palmY+8)
      .lineTo(palmX-side*13,palmY+2).stroke({color,width:3.5});
  }
}

export function drawCursedGround(g, radius, progress = 1, reduced = false) {
  g.circle(0,0,radius).fill({color:0x130d1b,alpha:.5+progress*.22})
    .circle(0,0,radius*.92).stroke({color:0x76528f,width:3,alpha:.65})
    .circle(0,0,radius*.77).stroke({color:0x93bb71,width:1.5,alpha:.8});
  const count = reduced ? 6 : 10;
  for (let i = 0; i < count; i++) {
    const a=i*Math.PI*2/count,c=Math.cos(a),s=Math.sin(a),r=radius*(.32+progress*.4);
    g.moveTo(c*radius*.12,s*radius*.12).lineTo(c*r*.5-s*6,s*r*.5+c*6)
      .lineTo(c*r*.7+s*4,s*r*.7-c*4).lineTo(c*r,s*r).stroke({color:0x08090c,width:7})
      .moveTo(c*radius*.12,s*radius*.12).lineTo(c*r*.5-s*6,s*r*.5+c*6)
      .lineTo(c*r*.7+s*4,s*r*.7-c*4).lineTo(c*r,s*r).stroke({color:0x91b870,width:1.5,alpha:.3+progress*.6});
    const x=c*radius*.85,y=s*radius*.85;
    g.moveTo(x-s*5,y+c*5).lineTo(x+c*5,y+s*5).lineTo(x+s*5,y-c*5)
      .moveTo(x-c*3,y-s*3).lineTo(x+c*7,y+s*7).stroke({color:0xc49add,width:2,alpha:.8});
  }
}

export function drawHandsBurst(presenter, slot, {radius,reduced}) {
  const g=slot.node,w=slot.wave;
  g.blendMode=w.blendMode='normal';
  drawCursedGround(g,radius,1,reduced);
  slot.kind='hands'; slot.originY=g.y;
  const count=reduced?3:7;
  for(let i=0;i<count;i++) {
    const angle=i*Math.PI*2/count,reach=i?radius*.56:0;
    drawGraspingHands(w,14,0xd7e9c7,Math.cos(angle)*reach,Math.sin(angle)*reach);
  }
}

// Per-view state only. Expiry is the authoritative rootUntil (including shorter bosses).
// Death/round end clears instantly; a natural expiry opens the fingers and crumbles.
export function paintRootGrip(g, view, entity, tick, reduced, ended = false) {
  if (entity.dead || ended) {view.rootEnd=0;view.rootStart=0;return false;}
  const until=entity.rootUntil||0, rooted=until>tick;
  if (rooted && (!view.rootEnd || tick>=view.rootEnd)) view.rootStart=tick;
  if (rooted) view.rootEnd=until;
  const release=rooted?0:tick-(view.rootEnd||0);
  if (!rooted && (!view.rootEnd || release>=8)) {view.rootEnd=0;return false;}
  const rise=reduced?1:Math.min(1,Math.max(0,(tick-view.rootStart+1)/5));
  const fade=rooted?1:Math.max(0,1-release/8);
  const shake=reduced||!rooted?0:Math.sin(tick*1.7+entity.id)*.85;
  g.save().translateTransform(shake, (1-rise)*12+(1-fade)*12);
  drawGraspingHands(g,entity.r,rooted?0xdcebc9:0x93819e,0,0,rise,rooted?1:fade);
  if (!reduced) for(let i=0;i<5;i++) {
    const x=(i-2)*(entity.r*.6),phase=(tick+i*3)%17/17;
    g.ellipse(x,8-phase*17,6+phase*5,4+phase*4).fill({color:i%2?0x60347c:0x6d935c,alpha:.18*fade});
    if(!rooted)g.rect(x+(i%2?1:-1)*release,-release*2+i*2,3,4).fill({color:0xc6cbb8,alpha:fade});
  }
  g.restore();
  return true;
}

export function drawBloodLance(g, particle, reduced) {
  g.poly([-64,-3,-26,-8,13,-9,42,0,13,9,-26,8,-64,3]).fill({color:0x740d2b,alpha:.95})
    .stroke({color:0xf33459,width:2})
    .poly([-48,-2,10,-5,36,0,10,5,-48,2]).fill({color:0xe52b4f})
    .moveTo(-43,0).lineTo(32,0).stroke({color:0xffd6d9,width:reduced?2:3,alpha:1});
  if(!reduced)g.moveTo(-50,0).lineTo(25,0).stroke({color:0xff5277,width:10,alpha:.2});
}
export function drawBloodBurst(presenter, slot, {kind,radius,reduced}) {
  const g=slot.node; g.blendMode='normal'; slot.kind='blood';
  const r=kind==='sacrifice'?22:Math.max(28,radius*3),count=reduced?4:11;
  g.ellipse(0,4,r*.65,r*.28).fill({color:0x680d27,alpha:.7})
    .circle(0,0,kind==='sacrifice'?5:9).fill({color:0xff8398,alpha:.85});
  for(let i=0;i<count;i++) {
    const a=i*2.399963,c=Math.cos(a),s=Math.sin(a),reach=r*(.55+(i%3)*.18);
    g.moveTo(c*4,s*4).lineTo(c*reach,s*reach).stroke({color:0xc81940,width:3+(i%2),alpha:.9})
      .ellipse(c*reach,s*reach,3+i%2,2+i%3).fill({color:0xf14763,alpha:.95});
  }
}
