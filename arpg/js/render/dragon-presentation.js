// Read-only presentation. Hit sectors come from authoritative telegraphs, never this flame art.
export const DRAGON_CLIPS = { dragon_flame: 'breath', dragon_stomp: 'stomp', dragon_tail: 'tail' };
export function dragonFrame(act, count = 12) {
  const phaseTicks = act.phaseTicks || Object.fromEntries(['windup','lock','active','recovery']
    .map(p => [p, Math.max(1, Math.round(act.def[`${p}Ms`] / (1000/30)))]));
  const starts = { windup:0, lock:phaseTicks.windup, active:phaseTicks.windup+phaseTicks.lock,
    recovery:phaseTicks.windup+phaseTicks.lock+phaseTicks.active };
  const progress = Math.max(0,Math.min(.999,(act.elapsed-starts[act.phase])/phaseTicks[act.phase]));
  const frame = act.phase === 'windup' ? Math.floor(progress*6) : act.phase === 'lock' ? 6
    : act.phase === 'active' ? 7+Math.floor(progress*2) : 9+Math.floor(progress*3);
  return Math.min(count-1,frame);
}
export function paintDragonVfx(g, tg, tick, reduced = false) {
  if (!DRAGON_CLIPS[tg.ability]) return;
  // g is already at the exact sector origin/facing (including rear-sector offset).
  if (tg.phase !== 'active') {
    if (tg.ability === 'dragon_flame') g.circle(68,0,12+tg.progress*10).fill({color:0xffcb66,alpha:.6});
    else if (tg.ability === 'dragon_stomp') g.circle(tg.shape.offset,0,26).stroke({color:0xffdda8,width:3});
    else g.moveTo(54,-20).lineTo(72,0).lineTo(54,20).stroke({color:0xffdda8,width:4});
    return;
  }
  const pulse = reduced ? 0 : Math.sin(tick*.8);
  if (tg.ability === 'dragon_flame') {
    for (let i=-2;i<=2;i++) {
      const a=i*.17, length=330+i*10+pulse*8, width=14;
      g.poly([58,i*5,Math.cos(a)*length,Math.sin(a)*length-width,
        Math.cos(a)*(length+24),Math.sin(a)*length,Math.cos(a)*length,Math.sin(a)*length+width])
        .fill({color:i%2?0xffa337:0xffdb76,alpha:.72});
    }
  } else if (tg.ability === 'dragon_stomp') {
    const x=tg.shape.offset;
    for(const r of [42,90,135])g.circle(x,0,r).stroke({color:0xffd8a0,width:r===42?6:3,alpha:.8});
    for(let i=0;i<8;i++){const a=i*Math.PI/4;g.moveTo(x+Math.cos(a)*36,Math.sin(a)*36)
      .lineTo(x+Math.cos(a)*125,Math.sin(a)*125).stroke({color:0xcbaa8a,width:3});}
  } else {
    const half=tg.shape.arc*Math.PI/360;
    for(const r of [110,175,235])g.arc(0,0,r,-half,half).stroke({color:0xffdba0,width:r===175?9:3,alpha:.8});
  }
}
