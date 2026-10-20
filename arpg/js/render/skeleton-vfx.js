// Presentation only. Paired forearms, jointed fingers and curling thumbs clutch the target.
export function drawGraspingHands(g, radius, color = 0xcdb8e9) {
  const reach = Math.max(14, radius);
  for (const side of [-1, 1]) {
    const x = side * reach * .75;
    g.ellipse(x, 5, 12, 5).fill({color:0x392343,alpha:.65});
    g.moveTo(x,7).lineTo(x-side*2,-9).lineTo(x-side*9,-18).stroke({color,width:5});
    g.moveTo(x+side*5,6).lineTo(x+side*3,-9).lineTo(x-side*5,-20).stroke({color:0x8c739e,width:3});
    g.circle(x-side*2,-9,3).fill(color);
    for (let finger=0;finger<4;finger++) {
      const fx=x-side*(5+finger*3),fy=-18-finger*2;
      g.moveTo(fx,fy+5).lineTo(fx-side*3,fy-8).lineTo(fx-side*9,fy-10).lineTo(fx-side*11,fy-3).stroke({color,width:2.6});
      g.circle(fx-side*3,fy-8,1.6).fill(0xeee1f7);
    }
    g.moveTo(x-side*3,-14).lineTo(x-side*15,-14).lineTo(x-side*18,-22).stroke({color,width:3});
  }
}
export function drawHandsBurst(presenter, slot, {radius,reduced}) {
  const g=slot.node;
  g.circle(0,0,radius).fill({color:0x432053,alpha:.16}).stroke({color:0xbc85e3,width:2,alpha:.8});
  const count=reduced?3:7;
  for(let i=0;i<count;i++) {
    const angle=i*Math.PI*2/count, reach=i?radius*.6:0;
    const x=Math.cos(angle)*reach,y=Math.sin(angle)*reach;
    // The same bone shape is translated, never random simulation state.
    const local={};for(const method of ['ellipse','moveTo','lineTo','circle'])local[method]=(...a)=>{g[method](a[0]+x,a[1]+y,...a.slice(2));return local;};
    for(const method of ['fill','stroke'])local[method]=(...a)=>{g[method](...a);return local;};
    drawGraspingHands(local,16);
  }
}
