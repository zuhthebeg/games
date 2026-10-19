import { MONSTER_VARIANTS } from '../content/monsters.js';

export const HOLY_CAP = 8;
// Event-only, fixed allocation. Each slot owns ground, beam and motes Graphics.
// Coordinates and success are accepted from the host event, never rolled here.
export class HolyVfx {
  constructor(Graphics, layer) {
    this.slots = Array.from({length:HOLY_CAP}, () => {
      const nodes = Array.from({length:3}, () => { const g=new Graphics(); g.blendMode='add'; g.visible=false; layer.addChild(g); return g; });
      return {ground:nodes[0],beam:nodes[1],motes:nodes[2],left:0};
    });
  }
  event(event, world, reduced=false) {
    if (event.type !== 'turnUndead') return false;
    const slot=this.slots.find(s=>s.left<=0);
    if (!slot) return true;
    const caster=world.entities?.find(e=>e.id===event.src), target=world.entities?.find(e=>e.id===event.dst);
    const boss=target?.boss || MONSTER_VARIANTS[target?.type]?.speciesTags.includes('boss');
    Object.assign(slot,{left:event.success?1.2:.42,total:event.success?1.2:.42,success:!!event.success,reduced,
      x:event.x,y:event.y,cx:caster?.x??event.x,cy:caster?.y??event.y,size:boss?1.6:1,dst:event.dst});
    this.draw(slot,0);
    return true;
  }
  draw(s, age) {
    const {ground:g,beam:b,motes:m}=s, t=age/s.total, fade=Math.max(0,1-t), gold=0xffdc85, white=0xfffbdf;
    for(const node of [g,b,m]){node.clear();node.visible=s.left>0;node.alpha=fade*(s.reduced?.4:1);}
    if(s.left<=0)return;
    // Consecration at the caster: a half-second rotating ring, runes and cross.
    if(age<.5){
      const r=31, rotation=s.reduced?0:age*1.8;
      g.ellipse(s.cx,s.cy,r, r*.5).stroke({color:gold,width:2,alpha:1-age*2});
      g.ellipse(s.cx,s.cy,r*.78,r*.39).stroke({color:white,width:1,alpha:.7});
      g.moveTo(s.cx-12,s.cy).lineTo(s.cx+12,s.cy).moveTo(s.cx,s.cy-8).lineTo(s.cx,s.cy+8).stroke({color:white,width:2});
      for(let i=0;i<(s.reduced?4:10);i++){
        const a=i*Math.PI/5+rotation,x=s.cx+Math.cos(a)*r,y=s.cy+Math.sin(a)*r*.5;
        g.moveTo(x-2,y-2).lineTo(x+2,y+2).moveTo(x+2,y-2).lineTo(x-2,y+2).stroke({color:gold,width:1});
        if(!s.reduced)g.moveTo(x,y).lineTo(x,y-20*(1-age*2)).stroke({color:gold,width:3,alpha:.15});
      }
    }
    // Descending light reaches the ground in 120ms. Fail breaks into dull shards.
    const radius=(s.success?36:19)*s.size, height=s.reduced?70:Math.max(420,s.y+80), tip=s.y-height*(1-Math.min(1,age/.12));
    const color=s.success?white:0x999ba5;
    if(s.success || age<.2){
      for(let i=s.reduced?1:3;i>=0;i--)b.rect(s.x-radius*(.12+i*.25),s.y-height,radius*(.24+i*.5),Math.max(0,height-(s.y-tip))).fill({color:i?gold:color,alpha:i?.055:.8});
      b.ellipse(s.x,s.y,radius*(.5+t*2),radius*(.25+t)).stroke({color:s.success?gold:color,width:s.reduced?1:3,alpha:fade});
      if(s.success){
        b.moveTo(s.x,s.y-69*s.size).lineTo(s.x,s.y-11).moveTo(s.x-18*s.size,s.y-48*s.size).lineTo(s.x+18*s.size,s.y-48*s.size).stroke({color:white,width:5,alpha:Math.max(0,1-age*1.2)});
        // Local halo gives a subtle light wash, without a full-screen mobile flash.
        if(!s.reduced)b.ellipse(s.x,s.y-28,95*s.size,80*s.size).fill({color:gold,alpha:.025*fade});
      }
    }
    const count=s.reduced?3:s.success?18:8;
    for(let i=0;i<count;i++){
      const a=i*2.39996, spread=(s.success?12+age*22:18+age*60)*s.size;
      const x=s.x+Math.cos(a)*spread,y=s.y-12-Math.sin(a)*spread*.4-age*(s.success?50+(i%4)*14:10);
      // White-gold feather slivers; failures radiate grey fractured shards.
      m.moveTo(x-2,y+4).lineTo(x+2,y-4).stroke({color:s.success?(i%2?gold:white):0x858b99,width:s.success?2:1,alpha:fade});
    }
  }
  update(dt) {for(const s of this.slots)if(s.left>0){s.left=Math.max(0,s.left-dt);this.draw(s,s.total-s.left);}}
  reset() {for(const s of this.slots){s.left=0;for(const n of [s.ground,s.beam,s.motes]){n.clear();n.visible=false;}}}
}
