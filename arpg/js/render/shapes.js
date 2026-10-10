// Shared shape painter: offset and facing match shapeHitsCircle, no hit-size shrink.
export function shapePath(g, s, scale = 1) {
  if (s.type === 'circle') g.circle(s.offset || 0, 0, s.radius * scale);
  else if (s.type === 'rect') g.rect(s.offset || 0, -s.width * scale / 2, s.length * scale, s.width * scale);
  else if (s.type === 'cone') {
    const half = s.arc * Math.PI / 360;
    g.moveTo(0,0).lineTo(Math.cos(half)*s.range*scale,-Math.sin(half)*s.range*scale)
      .arc(0,0,s.range*scale,-half,half).closePath();
  }
  return g;
}
// Outline ticks are deliberately on the full-size boundary even while fill grows.
export function pattern(g, s, color, locked) {
  const len=s.type==='rect'?s.length:s.type==='cone'?s.range:s.radius;
  if(s.type==='rect') {
    for(let x=0;x<=len;x+=24)g.moveTo((s.offset||0)+x,-s.width/2).lineTo((s.offset||0)+x,Math.min(s.width/2,-s.width/2+8));
    if(locked)for(let x=0;x<len;x+=24)g.moveTo((s.offset||0)+x,s.width/2).lineTo((s.offset||0)+Math.min(len,x+8),s.width/2-8);
  } else {
    const half=s.type==='cone'?s.arc*Math.PI/360:Math.PI;
    for(let a=-half;a<=half;a+=.24)g.moveTo((s.offset||0)+Math.cos(a)*len,Math.sin(a)*len).lineTo((s.offset||0)+Math.cos(a)*(len-7),Math.sin(a)*(len-7));
  }
  g.stroke({color,width:locked?2:1,alpha:.95});
}
